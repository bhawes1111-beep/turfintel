// Auth + permissions smoke test.
//
//   node scripts/smoke-auth.mjs
//
// Pure-logic coverage (no server needed): password hashing/verify, session
// token + cookie helpers, the permission matrix + role rule, the role
// hierarchy (canManageRole), and a SYNC guarantee that the client mirror
// (src/utils/auth/permissions.js) matches the worker source byte-for-byte in
// its shared core.

import { readFileSync } from 'fs'
import { hashPassword, verifyPassword } from '../worker/lib/passwords.js'
import {
  mintToken, hashToken, expiryFromNow, isExpired,
  readSessionCookie, buildSessionCookie, clearSessionCookie, SESSION_COOKIE,
} from '../worker/lib/sessions.js'
import {
  can, permissionsFor, canManageRole, ROLES, PERMISSION_KEYS,
} from '../worker/lib/permissions.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── Passwords ──────────────────────────────────────────────────────────────
{
  const h = await hashPassword('correct horse battery staple')
  assert(h.startsWith('pbkdf2$100000$') && h.split('$').length === 4, 'hash uses self-describing pbkdf2 format', h.slice(0, 20))
  assert(await verifyPassword('correct horse battery staple', h), 'verify accepts correct password')
  assert(!(await verifyPassword('wrong password', h)), 'verify rejects wrong password')
  assert(!(await verifyPassword('x', 'not-a-hash')), 'verify rejects malformed stored hash')
  const h2 = await hashPassword('correct horse battery staple')
  assert(h !== h2, 'same password hashes differently (random salt)')
  let threw = false
  try { await hashPassword('short') } catch { threw = true }
  assert(threw, 'rejects passwords shorter than 8 chars')
}

// ── Sessions ────────────────────────────────────────────────────────────────
{
  const t = mintToken()
  assert(t.length === 64 && /^[0-9a-f]+$/.test(t), 'token is 32 bytes hex')
  const th = await hashToken(t)
  assert(th.length === 64 && th !== t, 'token hash differs from raw token')
  assert((await hashToken(t)) === th, 'token hash is deterministic')
  assert(!isExpired(expiryFromNow(14)), 'fresh expiry not expired')
  assert(isExpired('2000-01-01T00:00:00Z'), 'past expiry is expired')

  const cookie = buildSessionCookie('TKN')
  assert(/HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Lax/.test(cookie), 'cookie is HttpOnly+Secure+SameSite=Lax')
  assert(/Max-Age=\d+/.test(cookie), 'cookie sets Max-Age')
  assert(/Max-Age=0/.test(clearSessionCookie()), 'clear cookie has Max-Age=0')

  const req = { headers: { get: (k) => k.toLowerCase() === 'cookie' ? `a=1; ${SESSION_COOKIE}=XYZ; b=2` : null } }
  assert(readSessionCookie(req) === 'XYZ', 'reads session token from Cookie header')
  const noReq = { headers: { get: () => null } }
  assert(readSessionCookie(noReq) === null, 'no cookie → null')
}

// ── Permission matrix + role rule ────────────────────────────────────────────
{
  // Superintendent: FULL operational/agronomic; only system-owner stuff denied.
  assert(can('superintendent', 'canViewPrivateNotes'), 'super can view private notes')
  assert(can('superintendent', 'canDeleteRecords'), 'super can delete records')
  assert(can('superintendent', 'canEditSprays'), 'super can edit sprays')
  assert(can('superintendent', 'canEditDisease'), 'super can edit disease')
  assert(can('superintendent', 'canViewReports'), 'super can view reports')
  assert(!can('superintendent', 'canSystemSettings'), 'super CANNOT touch system settings')
  assert(!can('superintendent', 'canManageCourses'), 'super CANNOT manage courses')

  // Owner/Admin: everything.
  for (const p of PERMISSION_KEYS) assert(can('owner_admin', p), `owner_admin has ${p}`)

  // Assistant: operational yes, private notes no (unless override).
  assert(can('assistant_super', 'canEditNutrition'), 'assistant can edit nutrition')
  assert(!can('assistant_super', 'canViewPrivateNotes'), 'assistant cannot view private notes by default')
  assert(can({ role: 'assistant_super', view_private_notes: 1 }, 'canViewPrivateNotes'), 'override grants assistant private notes')

  // Crew lead / crew / read-only.
  assert(can('crew_lead', 'canUpdateTaskStatus') && can('crew_lead', 'canEditMoisture'), 'crew_lead: task status + moisture')
  assert(!can('crew_lead', 'canEditSprays'), 'crew_lead cannot edit sprays')
  assert(can('crew', 'canAccessDisplayBoard') && !can('crew', 'canDeleteRecords'), 'crew: board yes, delete no')
  assert(can('read_only', 'canViewReports') && !can('read_only', 'canUpdateTaskStatus'), 'read_only: reports yes, edits no')

  // Unknown role / null → deny all.
  assert(!can('nonsense', 'canViewReports'), 'unknown role denied')
  assert(!can(null, 'canViewReports'), 'null actor denied')
  const pm = permissionsFor('crew')
  assert(Object.keys(pm).length === PERMISSION_KEYS.length, 'permissionsFor returns full key set')
}

// ── Role hierarchy (canManageRole) ───────────────────────────────────────────
{
  assert(canManageRole('owner_admin', 'superintendent'), 'owner manages superintendent')
  assert(canManageRole('owner_admin', 'owner_admin'), 'owner manages owner (admin tier)')
  assert(canManageRole('superintendent', 'crew_lead'), 'super manages crew_lead')
  assert(canManageRole('superintendent', 'crew'), 'super manages crew')
  assert(!canManageRole('superintendent', 'superintendent'), 'super CANNOT manage another super')
  assert(!canManageRole('superintendent', 'owner_admin'), 'super CANNOT manage owner')
  assert(!canManageRole('crew', 'crew'), 'crew CANNOT manage anyone')
  assert(!canManageRole('read_only', 'crew'), 'read_only CANNOT manage anyone')
}

// ── SYNC: client mirror matches the worker source in its shared core ─────────
{
  const workerSrc = readFileSync('worker/lib/permissions.js', 'utf8')
  const clientSrc = readFileSync('src/utils/auth/permissions.js', 'utf8')
  // Compare the shared region: from `export const ROLES` through the end of
  // canManageRole. The client file may append client-only extras (ROLE_LABELS)
  // after that, which we deliberately exclude from the diff.
  function core(src) {
    const start = src.indexOf('export const ROLES')
    const end   = src.indexOf('// Friendly labels')   // client-only marker; -1 in worker
    const sliced = end === -1 ? src.slice(start) : src.slice(start, end)
    return sliced.replace(/\r\n/g, '\n').trim()
  }
  assert(core(workerSrc) === core(clientSrc), 'client permission matrix is byte-identical to worker core')
}

// ── Actor helpers (worker/lib/actor.js) ─────────────────────────────────────
{
  const { actorHasPermission, actorCanAccessCourse, isAutomationActor } =
    await import('../worker/lib/actor.js')

  // actorHasPermission threads through the matrix.
  assert(actorHasPermission({ role: 'owner_admin' }, 'canViewPrivateNotes'), 'actor: owner has private notes')
  assert(actorHasPermission({ role: 'superintendent' }, 'canViewPrivateNotes'), 'actor: super has private notes')
  assert(!actorHasPermission({ role: 'crew' }, 'canViewPrivateNotes'), 'actor: crew lacks private notes')
  assert(!actorHasPermission(null, 'canViewPrivateNotes'), 'actor: null lacks everything')
  assert(actorHasPermission({ role: 'assistant_super', view_private_notes: 1 }, 'canViewPrivateNotes'), 'actor: override grants private notes')

  // isAutomationActor distinguishes ADMIN_KEY from real users.
  assert(isAutomationActor({ role: 'owner_admin', automation: true }), 'actor: ADMIN_KEY actor is automation')
  assert(!isAutomationActor({ role: 'owner_admin' }), 'actor: real owner is not automation')
  assert(!isAutomationActor(null), 'actor: null is not automation')

  // actorCanAccessCourse — admin/super all; restricted only their list; null=all.
  assert(actorCanAccessCourse({ role: 'owner_admin' }, 'any'), 'course: owner accesses all')
  assert(actorCanAccessCourse({ role: 'superintendent' }, 'any'), 'course: super accesses all')
  assert(actorCanAccessCourse({ role: 'crew', course_access: null }, 'x'), 'course: null access = all')
  assert(actorCanAccessCourse({ role: 'crew', course_access: '["a","b"]' }, 'a'), 'course: crew accesses listed')
  assert(!actorCanAccessCourse({ role: 'crew', course_access: '["a"]' }, 'b'), 'course: crew denied unlisted')
  assert(!actorCanAccessCourse(null, 'a'), 'course: null actor denied')
  assert(actorCanAccessCourse({ role: 'crew', course_access: '["a"]' }, null), 'course: null courseId is unscoped-ok')
}

// ── Condition-log serializer: private_notes is OMITTED, not nulled ──────────
{
  const src = readFileSync('worker/api/conditionLog.js', 'utf8')
  // rowToLog must take the canViewPrivate flag and only attach privateNotes
  // when it is true (omission, never a null/'' placeholder).
  assert(/function rowToLog\(row, canViewPrivate/.test(src), 'rowToLog takes canViewPrivate flag')
  assert(/if \(canViewPrivate\) out\.privateNotes/.test(src), 'rowToLog attaches privateNotes only when authorized')
  // The read paths must thread the flag (not call rowToLog bare).
  assert(/rowToLog\(r, canViewPrivate\)/.test(src), 'list path threads canViewPrivate')
  assert(/rowToLog\(row, canViewPrivate\)/.test(src), 'by-date / by-id path threads canViewPrivate')
}

// ── Mutation permission map (Phase 2 P2 — worker/lib/mutationPermissions.js) ─
{
  const { isMutationAllowed } = await import('../worker/lib/mutationPermissions.js')
  const owner = { role: 'owner_admin' }
  const key   = { role: 'owner_admin', automation: true }
  const sup   = { role: 'superintendent' }
  const asst  = { role: 'assistant_super' }
  const lead  = { role: 'crew_lead' }
  const crew  = { role: 'crew' }
  const ro    = { role: 'read_only' }
  const P = (a, path, m = 'POST', body = null) => isMutationAllowed(a, path, m, body)

  // owner_admin + ADMIN_KEY pass everything mapped.
  for (const path of ['/api/disease', '/api/sprays', '/api/inventory', '/api/equipment', '/api/courses', '/api/operations-notes']) {
    assert(P(owner, path), `owner allowed ${path}`)
    assert(P(key, path), `ADMIN_KEY allowed ${path}`)
  }

  // superintendent: full operational, but NOT courses (system-owner only).
  for (const path of ['/api/disease', '/api/sprays', '/api/nutrition', '/api/cultural-practices', '/api/moisture', '/api/condition-logs', '/api/equipment', '/api/operations-notes', '/api/calendar-events']) {
    assert(P(sup, path), `super allowed ${path}`)
  }
  assert(!P(sup, '/api/courses'), 'super DENIED /api/courses')

  // assistant_super: operational edits, no courses.
  assert(P(asst, '/api/disease') && P(asst, '/api/sprays') && P(asst, '/api/equipment'), 'assistant allowed operational')
  assert(!P(asst, '/api/courses'), 'assistant DENIED /api/courses')

  // crew_lead: moisture yes; sprays/disease/condition-logs/nutrition no.
  assert(P(lead, '/api/moisture'), 'crew_lead allowed /api/moisture')
  for (const path of ['/api/sprays', '/api/disease', '/api/condition-logs', '/api/nutrition']) {
    assert(!P(lead, path), `crew_lead DENIED ${path}`)
  }

  // crew: blocked from restricted mutations.
  for (const path of ['/api/sprays', '/api/disease', '/api/nutrition', '/api/condition-logs', '/api/moisture', '/api/inventory', '/api/equipment']) {
    assert(!P(crew, path), `crew DENIED ${path}`)
  }

  // read_only: blocked from all mapped mutations.
  for (const path of ['/api/sprays', '/api/disease', '/api/moisture', '/api/condition-logs', '/api/cultural-practices', '/api/operations-notes']) {
    assert(!P(ro, path), `read_only DENIED ${path}`)
  }

  // Prefix precedence: /api/inventory/usage + /import-label resolve to inventory.
  assert(P(sup, '/api/inventory/usage') && !P(crew, '/api/inventory/usage'), 'inventory/usage inherits canEditInventory')
  assert(P(sup, '/api/inventory/import-label/save') && !P(crew, '/api/inventory/import-label/save'), 'import-label inherits canEditInventory')

  // operations-notes → canSendCrewNotes (super has it; crew does not).
  assert(P(sup, '/api/operations-notes') && !P(crew, '/api/operations-notes'), 'operations-notes → canSendCrewNotes')

  // weather/capture + water-balance/rollup → canManageCourses or ADMIN_KEY.
  assert(P(key, '/api/weather/capture') && !P(crew, '/api/weather/capture'), 'weather/capture admin/key only')
  assert(P(key, '/api/water-balance/rollup') && !P(sup, '/api/water-balance/rollup'), 'water-balance/rollup admin/key only (super lacks canManageCourses)')

  // crew-assignments special case: status-only PATCH vs full edit / create / delete.
  assert(P(crew, '/api/crew-assignments/x', 'PATCH', { status: 'done' }), 'crew status-only PATCH allowed')
  assert(P(crew, '/api/crew-assignments/x', 'PATCH', { status: 'done', id: 'x' }), 'crew status+id PATCH allowed')
  assert(!P(crew, '/api/crew-assignments/x', 'PATCH', { taskName: 'z' }), 'crew full-edit PATCH denied')
  assert(!P(crew, '/api/crew-assignments', 'POST', { employeeName: 'X' }), 'crew create assignment denied')
  assert(!P(crew, '/api/crew-assignments/x', 'DELETE'), 'crew DELETE assignment denied')
  assert(P(sup, '/api/crew-assignments/x', 'PATCH', { taskName: 'z' }), 'super full-edit PATCH allowed')
  assert(!P(ro, '/api/crew-assignments/x', 'PATCH', { status: 'done' }), 'read_only status-only PATCH denied')
  assert(P(lead, '/api/crew-assignments/x', 'PATCH', { status: 'done' }), 'crew_lead status-only PATCH allowed')

  // attachments: any operational-edit perm passes; crew (no edit perms) does not.
  assert(P(sup, '/api/attachments') && P(key, '/api/attachments'), 'attachments allowed for editor/key')
  assert(!P(crew, '/api/attachments'), 'attachments denied for crew (no edit perm)')

  // unmapped → any authenticated passes; null actor never.
  assert(P(crew, '/api/pilot-feedback'), 'unmapped route allows authenticated')
  assert(!isMutationAllowed(null, '/api/disease', 'POST'), 'null actor never allowed')
}

// ── Course-access scoping (Phase 2 P3 — actor.js + courseScope.js) ──────────
{
  const { actorAccessibleCourses } = await import('../worker/lib/actor.js')
  const { courseReadDecision, filterCoursesForActor, isCourseScopedReadPath, emptyBodyForPath } =
    await import('../worker/lib/courseScope.js')

  const owner = { role: 'owner_admin' }
  const key   = { role: 'owner_admin', automation: true }
  const sup   = { role: 'superintendent' }
  const crewNull  = { role: 'crew', course_access: null }
  const crewA     = { role: 'crew', course_access: '["course-a"]' }
  const crewEmpty = { role: 'crew', course_access: '[]' }

  // accessible set: null = all (unrestricted), array = allow-list.
  assert(actorAccessibleCourses(owner) === null, 'owner accesses all courses')
  assert(actorAccessibleCourses(sup) === null, 'superintendent accesses all courses')
  assert(actorAccessibleCourses(key) === null, 'ADMIN_KEY accesses all courses')
  assert(actorAccessibleCourses(crewNull) === null, 'course_access NULL = all (single-course default)')
  assert(JSON.stringify(actorAccessibleCourses(crewA)) === '["course-a"]', 'restricted user → allow-list')
  assert(JSON.stringify(actorAccessibleCourses(crewEmpty)) === '[]', 'empty allow-list → []')
  assert(JSON.stringify(actorAccessibleCourses(null)) === '[]', 'null actor → []')

  // read decisions.
  assert(courseReadDecision(owner, 'any').allow === true, 'owner: any course allowed')
  assert(courseReadDecision(crewNull, 'crossroads-gc').allow === true, 'NULL-access: single-course default allowed')
  assert(courseReadDecision(crewA, 'course-a').allow === true, 'restricted: own course allowed')
  assert(courseReadDecision(crewA, 'course-b').empty === true, 'restricted: other course → empty')
  assert(courseReadDecision(crewA, null).allow === true, 'restricted + no courseId → handler default scope')
  assert(courseReadDecision(crewEmpty, null).empty === true, 'empty allow-list → always empty')

  // /api/courses filtering.
  const list = [{ id: 'course-a' }, { id: 'course-b' }, { id: 'crossroads-gc' }]
  assert(filterCoursesForActor(owner, list).length === 3, 'owner sees all courses (filter)')
  assert(filterCoursesForActor(sup, list).length === 3, 'super sees all courses (filter)')
  assert(JSON.stringify(filterCoursesForActor(crewA, list).map(c => c.id)) === '["course-a"]', 'restricted sees only assigned (filter)')
  assert(filterCoursesForActor(crewEmpty, list).length === 0, 'empty allow-list → [] (filter)')
  assert(filterCoursesForActor(crewNull, list).length === 3, 'NULL-access sees all (filter)')

  // scoped-path detection + empty-shape.
  assert(isCourseScopedReadPath('/api/disease'), 'disease is course-scoped')
  assert(isCourseScopedReadPath('/api/condition-logs/by-date'), 'by-date sub-path is course-scoped')
  assert(!isCourseScopedReadPath('/api/users'), 'users is NOT course-scoped')
  assert(!isCourseScopedReadPath('/api/courses'), 'courses registry handled separately, not in scoped reads')
  assert(JSON.stringify(emptyBodyForPath('/api/condition-logs/by-date')) === '{"empty":true}', 'by-date empty shape is { empty: true }')
  assert(JSON.stringify(emptyBodyForPath('/api/disease')) === '[]', 'list empty shape is []')
}

// ── Login rate limiting (Phase 2 P4 — worker/lib/rateLimit.js) ──────────────
{
  const {
    clientIp, isRateLimited, recordAttempt, clearFailures,
    MAX_FAILED, WINDOW_MINUTES,
  } = await import('../worker/lib/rateLimit.js')

  // clientIp: CF-Connecting-IP → first XFF hop → 'unknown'.
  const mk = (h) => ({ headers: { get: (k) => h[k] ?? h[k.toLowerCase()] ?? null } })
  assert(clientIp(mk({ 'CF-Connecting-IP': '1.2.3.4' })) === '1.2.3.4', 'clientIp prefers CF-Connecting-IP')
  assert(clientIp(mk({ 'X-Forwarded-For': '5.6.7.8, 9.9.9.9' })) === '5.6.7.8', 'clientIp falls back to first XFF hop')
  assert(clientIp(mk({})) === 'unknown', 'clientIp → unknown when absent')
  assert(MAX_FAILED === 8 && WINDOW_MINUTES === 15, 'threshold 8 / window 15 min')

  // In-memory D1 fake covering the exact queries the helpers run:
  //  - SELECT SUM(...) by email/ip   (isRateLimited)
  //  - INSERT auth_attempts          (recordAttempt)
  //  - DELETE ... WHERE email=? AND success=0  (clearFailures)
  function fakeDB() {
    const rows = []   // { email, ip, success }
    return {
      _rows: rows,
      prepare(sql) {
        const q = sql.replace(/\s+/g, ' ').trim()
        let bound = []
        const stmt = {
          bind(...args) { bound = args; return stmt },
          async first() {
            if (q.startsWith('SELECT')) {
              // bound = [email, ip, sinceExpr]; window check omitted (test rows are "now").
              const [email, ip] = bound
              const by_email = rows.filter(r => r.success === 0 && r.email === email).length
              const by_ip    = rows.filter(r => r.success === 0 && r.ip === ip).length
              return { by_email, by_ip }
            }
            return null
          },
          async run() {
            if (q.startsWith('INSERT INTO auth_attempts')) {
              // bound = [id, email, ip, success]
              rows.push({ email: bound[1], ip: bound[2], success: bound[3] })
            } else if (q.startsWith('DELETE FROM auth_attempts WHERE email')) {
              const email = bound[0]
              for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i].email === email && rows[i].success === 0) rows.splice(i, 1)
              }
            }
            return { success: true }
          },
        }
        return stmt
      },
    }
  }

  // Fresh state: not limited.
  let env = { DB: fakeDB() }
  assert((await isRateLimited(env, 'a@x.com', '1.1.1.1')) === false, 'fresh state not rate-limited')

  // Record 7 failures by email → still under threshold.
  for (let i = 0; i < 7; i++) await recordAttempt(env, 'a@x.com', '1.1.1.1', false)
  assert((await isRateLimited(env, 'a@x.com', '1.1.1.1')) === false, '7 failures < threshold → allowed')
  // 8th failure → at threshold → limited.
  await recordAttempt(env, 'a@x.com', '1.1.1.1', false)
  assert((await isRateLimited(env, 'a@x.com', '1.1.1.1')) === true, '8 failures ≥ threshold → limited (by email)')

  // A DIFFERENT email from the same IP is also limited (IP threshold).
  assert((await isRateLimited(env, 'other@x.com', '1.1.1.1')) === true, 'same IP, different email → limited (by IP)')
  // A different email AND different IP is clean.
  assert((await isRateLimited(env, 'other@x.com', '2.2.2.2')) === false, 'different email+IP → not limited')

  // Success clears that email's failures.
  await clearFailures(env, 'a@x.com')
  assert((await isRateLimited(env, 'a@x.com', '9.9.9.9')) === false, 'clearFailures neutralizes email failures')

  // recordAttempt with success=true does not count toward the limit.
  let env2 = { DB: fakeDB() }
  for (let i = 0; i < 10; i++) await recordAttempt(env2, 'b@x.com', '3.3.3.3', true)
  assert((await isRateLimited(env2, 'b@x.com', '3.3.3.3')) === false, 'successful attempts never count toward limit')

  // Fail-open: a DB error in isRateLimited → not limited (never lock out on error).
  const errEnv = { DB: { prepare() { return { bind() { return { first() { throw new Error('db down') } } } } } } }
  assert((await isRateLimited(errEnv, 'a@x.com', '1.1.1.1')) === false, 'isRateLimited fails open on DB error')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
