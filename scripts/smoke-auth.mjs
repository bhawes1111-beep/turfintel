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

// ── Dual server key (Phase 3B — worker/lib/auth.js) ─────────────────────────
{
  const { requireAdminKey, isMutation } = await import('../worker/lib/auth.js')
  const req = (key) => ({ headers: { get: (h) => (h.toLowerCase() === 'x-admin-key' ? key : null) } })

  const ADMIN = 'TurfAdmin2025!'
  const AUTO  = 'Automation-Secret-XYZ'
  const env = { ADMIN_KEY: ADMIN, AUTOMATION_KEY: AUTO }

  assert(requireAdminKey(req(ADMIN), env).ok === true, 'ADMIN_KEY still accepted')
  assert(requireAdminKey(req(AUTO), env).ok === true, 'AUTOMATION_KEY accepted')
  const bad = requireAdminKey(req('nope'), env)
  assert(bad.ok === false && bad.status === 401, 'invalid key → 401')
  const none = requireAdminKey(req(null), env)
  assert(none.ok === false && none.status === 401, 'no key → 401')

  // Either key alone still works (the other unset).
  assert(requireAdminKey(req(ADMIN), { ADMIN_KEY: ADMIN }).ok === true, 'ADMIN_KEY works when AUTOMATION_KEY unset')
  assert(requireAdminKey(req(AUTO), { AUTOMATION_KEY: AUTO }).ok === true, 'AUTOMATION_KEY works when ADMIN_KEY unset')
  // AUTOMATION_KEY must NOT be accepted as if it were ADMIN when only ADMIN is set.
  assert(requireAdminKey(req(AUTO), { ADMIN_KEY: ADMIN }).ok === false, 'AUTOMATION_KEY value rejected when not configured')

  // Neither key configured → 503 fail-closed.
  const misconfig = requireAdminKey(req(ADMIN), {})
  assert(misconfig.ok === false && misconfig.status === 503, 'no server key configured → 503 fail-closed')

  // isMutation unchanged.
  assert(isMutation('POST') && isMutation('PATCH') && isMutation('DELETE'), 'isMutation true for writes')
  assert(!isMutation('GET'), 'isMutation false for GET')
}

// ── AUTOMATION_KEY must never appear in the client (src/) ───────────────────
{
  // Source-scan (portable, no shell): walk src/ for the literal token.
  const { readdirSync, statSync } = await import('fs')
  const hits = []
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/\.(js|jsx|ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes('AUTOMATION_KEY')) hits.push(p)
    }
  }
  walk('src')
  assert(hits.length === 0, 'no file under src/ references AUTOMATION_KEY', hits)

  // Cron remains structurally untouched: scheduled() still calls capture/rollup
  // in-process (no requireAdminKey, no x-admin-key in the handler).
  const idx = readFileSync('worker/index.js', 'utf8')
  const scheduled = idx.slice(idx.indexOf('async scheduled'), idx.indexOf('async scheduled') + 600)
  assert(scheduled.includes('captureWeatherForAllCourses') && scheduled.includes('rollupAllCourses'), 'cron still calls capture/rollup in-process')
  assert(!/x-admin-key/i.test(scheduled) && !/requireAdminKey/.test(scheduled), 'cron handler uses no key (in-process)')
}

// ── courseAccess semantics — write side (Phase 4 Step 4) ────────────────────
// encodeCourseAccess distinguishes undefined / null / [] / [..]. The actor
// helpers (tested in the course-scope block above) already treat the stored
// values correctly; this block locks the WRITE path so future users sent with
// explicit [] truly have no course access (closes the previous footgun where
// [] silently became NULL = all-access).
{
  const { encodeCourseAccess } = await import('../worker/api/users.js')
  const { actorAccessibleCourses, actorCanAccessCourse } =
    await import('../worker/lib/actor.js')

  // encode: undefined → undefined (caller skips column on UPDATE).
  assert(encodeCourseAccess(undefined) === undefined, 'encode: undefined → undefined (omit)')
  // encode: null → null (NULL in DB = all access).
  assert(encodeCourseAccess(null) === null, 'encode: null → null (all access)')
  // encode: [] → "[]" (explicit empty allow-list = NO access).
  assert(encodeCourseAccess([]) === '[]', 'encode: [] → "[]" (no access)')
  // encode: ['..'] → JSON.
  assert(encodeCourseAccess(['course-a']) === '["course-a"]', 'encode: ["course-a"] → JSON allow-list')
  assert(encodeCourseAccess(['a', 'b']) === '["a","b"]', 'encode: ["a","b"] → JSON allow-list')
  // encode: invalid types → undefined (caller maps to 400).
  assert(encodeCourseAccess('course-a') === undefined, 'encode: string rejected')
  assert(encodeCourseAccess(42) === undefined, 'encode: number rejected')
  assert(encodeCourseAccess({}) === undefined, 'encode: object rejected')

  // End-to-end: a user row carrying the encoded value behaves correctly.
  const userNull  = { role: 'crew', course_access: null }
  const userEmpty = { role: 'crew', course_access: encodeCourseAccess([]) }   // '[]'
  const userListed = { role: 'crew', course_access: encodeCourseAccess(['course-a']) }  // '["course-a"]'

  assert(actorAccessibleCourses(userNull) === null, 'roundtrip: null user sees all (NULL)')
  assert(JSON.stringify(actorAccessibleCourses(userEmpty)) === '[]', 'roundtrip: [] user accessible = []')
  assert(JSON.stringify(actorAccessibleCourses(userListed)) === '["course-a"]', 'roundtrip: listed user accessible = allow-list')

  // [] user is DENIED on every course, including the production default.
  assert(!actorCanAccessCourse(userEmpty, 'crossroads-gc'), '[] user denied default course (crossroads-gc)')
  assert(!actorCanAccessCourse(userEmpty, 'any-course'), '[] user denied any course')
  // null user is allowed (unchanged behavior preserved).
  assert(actorCanAccessCourse(userNull, 'any-course'), 'null user allowed any course (unchanged)')
  // Listed user is allowed only their listed courses.
  assert(actorCanAccessCourse(userListed, 'course-a'), 'listed user allowed assigned course')
  assert(!actorCanAccessCourse(userListed, 'course-b'), 'listed user denied unassigned course')
}

// ── Source-level guarantee: createUser + updateUser use encodeCourseAccess ──
{
  const src = readFileSync('worker/api/users.js', 'utf8')
  // The buggy old expression must be gone (it collapsed [] → NULL).
  assert(!/Array\.isArray\(body\.courseAccess\)\s*&&\s*body\.courseAccess\.length/.test(src),
    'users.js: legacy "&& .length" courseAccess expression removed (no longer collapses [] → NULL)')
  // Both write paths must consult encodeCourseAccess.
  const encodeCalls = (src.match(/encodeCourseAccess\(/g) || []).length
  assert(encodeCalls >= 2, 'users.js: encodeCourseAccess invoked on both create + update paths', encodeCalls)
  // Invalid values must be rejected with a 400 (badRequest) on both paths.
  assert(/courseAccess must be null or an array/.test(src),
    'users.js: invalid courseAccess → 400 with helpful message')
}

// ── enforceRowCourseAccess — row-level course guard (Phase 4 Step 5) ────────
// Locks the helper's behavior + asserts the worker routes use it. The route
// integration is the no-existence-leak guarantee for cross-course attachment
// reads (metadata + binary file).
{
  const { enforceRowCourseAccess } = await import('../worker/lib/courseScope.js')

  // Fake D1 returning a row for known ids only.
  function mkDB(rows) {
    return {
      prepare() {
        let bound = []
        return {
          bind(...a) { bound = a; return this },
          first: async () => rows.find(r => r.id === bound[0]) || null,
        }
      },
    }
  }
  const env = { DB: mkDB([
    { id: 'a-x', course_id: 'crossroads-gc' },
    { id: 'a-y', course_id: 'course-b' },
  ]) }

  const owner = { role: 'owner_admin' }
  const key   = { role: 'owner_admin', automation: true }
  const sup   = { role: 'superintendent' }
  const restricted = { role: 'crew', course_access: '["crossroads-gc"]' }
  const noAccess   = { role: 'crew', course_access: '[]' }
  const nullAccess = { role: 'crew', course_access: null }

  // Allow paths.
  assert((await enforceRowCourseAccess(env, owner, 'operational_attachments', 'a-y')).allow === true, 'owner → any course allowed')
  assert((await enforceRowCourseAccess(env, key,   'operational_attachments', 'a-y')).allow === true, 'AUTOMATION_KEY actor → any course allowed')
  assert((await enforceRowCourseAccess(env, sup,   'operational_attachments', 'a-y')).allow === true, 'superintendent → any course allowed')
  assert((await enforceRowCourseAccess(env, nullAccess, 'operational_attachments', 'a-y')).allow === true, 'NULL-access user → all courses allowed (unchanged)')
  assert((await enforceRowCourseAccess(env, restricted, 'operational_attachments', 'a-x')).allow === true, 'restricted → own course allowed')

  // Deny paths — every one returns allow:false so the caller emits 404.
  assert((await enforceRowCourseAccess(env, restricted, 'operational_attachments', 'a-y')).allow === false, 'restricted → other course DENIED')
  assert((await enforceRowCourseAccess(env, noAccess,   'operational_attachments', 'a-x')).allow === false, '[]-access user DENIED any row')
  assert((await enforceRowCourseAccess(env, owner,      'operational_attachments', 'does-not-exist')).allow === false, 'missing id DENIED (no existence leak)')
  assert((await enforceRowCourseAccess(env, null,       'operational_attachments', 'a-x')).allow === false, 'null actor DENIED')
  assert((await enforceRowCourseAccess(env, owner,      'arbitrary_table',         'a-x')).allow === false, 'un-whitelisted table DENIED')
  assert((await enforceRowCourseAccess(env, owner,      'operational_attachments', '')).allow === false, 'empty id DENIED')
  assert((await enforceRowCourseAccess({},  owner,      'operational_attachments', 'a-x')).allow === false, 'no DB → DENIED')

  // No-existence-leak: a missing id and a denied row produce IDENTICAL
  // shapes (`allow: false`) so the caller's uniform 404 reveals nothing.
  const missing = await enforceRowCourseAccess(env, restricted, 'operational_attachments', 'does-not-exist')
  const denied  = await enforceRowCourseAccess(env, restricted, 'operational_attachments', 'a-y')
  assert(JSON.stringify(missing) === JSON.stringify(denied), 'missing vs denied responses are identical (no existence leak)')

  // Allowed → row returned.
  const ok = await enforceRowCourseAccess(env, restricted, 'operational_attachments', 'a-x')
  assert(ok.allow === true && ok.row?.id === 'a-x' && ok.row?.course_id === 'crossroads-gc', 'allow returns the fetched row')

  // ── Source-level: the worker routes use the helper + map deny → 404 ──
  const idx = readFileSync('worker/index.js', 'utf8')
  // Both attachment GET routes resolve the actor and call the helper.
  const guarded = (idx.match(/enforceRowCourseAccess\(env, actor, 'operational_attachments', id\)/g) || []).length
  assert(guarded >= 2, 'worker: both /:id and /:id/file GETs call enforceRowCourseAccess', guarded)
  // Both routes deny → 404 (uniform; no error body that hints at existence).
  const metaSlice = idx.slice(idx.indexOf("// ── /api/attachments/:id ──"), idx.indexOf("// ── /api/attachments/:id ──") + 900)
  const fileSlice = idx.slice(idx.indexOf("// ── /api/attachments/:id/file"), idx.indexOf("// ── /api/attachments/:id/file") + 900)
  assert(/notFound\('Attachment not found'\)/.test(metaSlice), 'attachments/:id deny → notFound (404)')
  assert(/Response\('Not found', \{ status: 404 \}\)/.test(fileSlice), 'attachments/:id/file deny → 404 plain Response')

  // List + upload paths are NOT row-guarded (they have other protections —
  // list is course-scoped via the GET guard; upload is gate-perm-checked).
  const listSlice = idx.slice(idx.indexOf("if (pathname === '/api/attachments') {"), idx.indexOf("if (pathname === '/api/attachments') {") + 400)
  assert(!/enforceRowCourseAccess/.test(listSlice), 'attachments list/upload not row-guarded (other protections apply)')
}

// ── Invite / password-reset token helpers (Phase 4 Step 3.1) ────────────────
// Lifecycle coverage via an in-memory D1 fake that mirrors the exact queries
// worker/lib/inviteTokens.js issues. Same fake-DB pattern as the rate-limit
// block above. No server required.
{
  const {
    mintAuthToken, verifyAuthToken, consumeAuthToken,
    revokeActiveTokensFor, pruneOldTokens,
    TOKEN_TYPE_INVITE, TOKEN_TYPE_RESET, TOKEN_TYPES,
    INVITE_TTL_MINUTES, RESET_TTL_MINUTES,
  } = await import('../worker/lib/inviteTokens.js')

  // Sanity: constants.
  assert(TOKEN_TYPES.length === 2, 'two token types exported')
  assert(TOKEN_TYPE_INVITE === 'invite' && TOKEN_TYPE_RESET === 'password_reset', 'token type values')
  assert(INVITE_TTL_MINUTES === 72 * 60, 'invite TTL = 72h')
  assert(RESET_TTL_MINUTES === 30, 'reset TTL = 30min')

  function fakeDB() {
    const rows = []
    const byHash = (h) => rows.find(r => r.token_hash === h) || null
    return {
      _rows: rows,
      prepare(sql) {
        const q = sql.replace(/\s+/g, ' ').trim()
        let bound = []
        const stmt = {
          bind(...args) { bound = args; return stmt },
          async first() {
            if (q.startsWith('SELECT * FROM auth_tokens WHERE token_hash = ?')) return byHash(bound[0])
            return null
          },
          async run() {
            if (q.startsWith('INSERT INTO auth_tokens')) {
              const [id, token_hash, token_type, user_id, email, created_by_user_id, expires_at, metadata_json] = bound
              rows.push({ id, token_hash, token_type, user_id, email, status: 'active', created_by_user_id, expires_at, metadata_json, used_at: null })
              return { success: true, meta: { changes: 1 } }
            }
            if (q.includes("SET status = 'used'")) {
              const r = byHash(bound[0])
              if (r && r.status === 'active') { r.status = 'used'; r.used_at = new Date().toISOString(); return { success: true, meta: { changes: 1 } } }
              return { success: true, meta: { changes: 0 } }
            }
            if (q.includes("SET status = 'expired'")) {
              const r = rows.find(x => x.id === bound[0])
              if (r && r.status === 'active') { r.status = 'expired'; return { success: true, meta: { changes: 1 } } }
              return { success: true, meta: { changes: 0 } }
            }
            if (q.includes("SET status = 'revoked'")) {
              const [userId, type] = bound
              let n = 0
              for (const r of rows) if (r.user_id === userId && r.token_type === type && r.status === 'active') { r.status = 'revoked'; n++ }
              return { success: true, meta: { changes: n } }
            }
            if (q.startsWith('DELETE FROM auth_tokens')) {
              return { success: true, meta: { changes: 0 } }
            }
            return { success: false }
          },
        }
        return stmt
      },
    }
  }
  const env = { DB: fakeDB() }

  // ── mint → verify → consume (happy path) ──
  const A = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: 'u1', email: 'a@x.com', createdByUserId: 'admin', metadata: { role: 'crew' } })
  assert(A.token.length === 64 && /^[0-9a-f]+$/.test(A.token), 'minted token is 32-byte hex')
  assert(A.hash !== A.token, 'hash differs from raw token (SHA-256 stored, not raw)')
  assert(env.DB._rows.length === 1 && env.DB._rows[0].status === 'active', 'one active row written')
  // The raw token must NOT appear in any DB column — only the hash.
  const stored = env.DB._rows[0]
  assert(!Object.values(stored).some(v => typeof v === 'string' && v.includes(A.token)), 'no plaintext token in DB row')

  const v1 = await verifyAuthToken(env, A.token, TOKEN_TYPE_INVITE)
  assert(v1.valid === true && v1.row?.email === 'a@x.com', 'verify happy path')

  // Type-mismatch rejection.
  const v2 = await verifyAuthToken(env, A.token, TOKEN_TYPE_RESET)
  assert(v2.valid === false && v2.reason === 'type-mismatch', 'verify rejects wrong type')

  // Unknown token rejected.
  const v3 = await verifyAuthToken(env, 'totally-bogus-token')
  assert(v3.valid === false && v3.reason === 'not-found', 'unknown token → not-found')

  // Empty token rejected.
  assert((await verifyAuthToken(env, '')).valid === false, 'empty token rejected')
  assert((await verifyAuthToken(env, null)).valid === false, 'null token rejected')

  // ── consume (one-time use; race-safe via conditional UPDATE) ──
  const c1 = await consumeAuthToken(env, A.hash)
  const c2 = await consumeAuthToken(env, A.hash)
  assert(c1 === true && c2 === false, 'consume is one-time (first wins, second returns false)')
  // Verify after consume → status=used, not active.
  const v4 = await verifyAuthToken(env, A.token, TOKEN_TYPE_INVITE)
  assert(v4.valid === false && v4.reason === 'status-used', 'verify after consume → status-used')

  // ── revoke-on-reissue ──
  const B1 = await mintAuthToken(env, { type: TOKEN_TYPE_RESET, userId: 'u2', email: 'b@x.com' })
  const B2 = await mintAuthToken(env, { type: TOKEN_TYPE_RESET, userId: 'u2', email: 'b@x.com' })
  const revoked = await revokeActiveTokensFor(env, 'u2', TOKEN_TYPE_RESET)
  assert(revoked === 2, 'revokeActiveTokensFor revokes BOTH prior active tokens')
  const v5 = await verifyAuthToken(env, B1.token)
  const v6 = await verifyAuthToken(env, B2.token)
  assert(v5.valid === false && v5.reason === 'status-revoked', 'revoked B1 → reject')
  assert(v6.valid === false && v6.reason === 'status-revoked', 'revoked B2 → reject')
  // revokeActiveTokensFor on a different user → 0.
  assert((await revokeActiveTokensFor(env, 'u-nobody', TOKEN_TYPE_RESET)) === 0, 'revoke for unknown user → 0')

  // ── expired-on-verify lazy transition ──
  const C = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: 'u3', email: 'c@x.com', ttlMinutes: 1 / 60_000 })  // ~16 ms
  await new Promise(r => setTimeout(r, 80))
  const v7 = await verifyAuthToken(env, C.token)
  assert(v7.valid === false && v7.reason === 'expired', 'past-expiry verify → expired')
  // Row was lazily transitioned.
  const Crow = env.DB._rows.find(r => r.id === C.id)
  assert(Crow.status === 'expired', 'expired row status flipped to "expired" on verify')

  // ── input validation ──
  let threwBadType = false
  try { await mintAuthToken(env, { type: 'bogus', userId: 'u', email: 'x@x.com' }) } catch { threwBadType = true }
  assert(threwBadType, 'mintAuthToken rejects unknown type')
  let threwNoEmail = false
  try { await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: 'u' }) } catch { threwNoEmail = true }
  assert(threwNoEmail, 'mintAuthToken requires email')
  let threwNoDB = false
  try { await mintAuthToken({}, { type: TOKEN_TYPE_INVITE, userId: 'u', email: 'x@x.com' }) } catch { threwNoDB = true }
  assert(threwNoDB, 'mintAuthToken requires env.DB')

  // pruneOldTokens is best-effort and safe to call with the fake (returns 0).
  assert((await pruneOldTokens(env)) === 0, 'pruneOldTokens runs without throwing')
  assert((await pruneOldTokens({})) === 0, 'pruneOldTokens fails open with no DB')

  // ── consume with unknown hash → false (no row mutated) ──
  assert((await consumeAuthToken(env, 'unknown-hash')) === false, 'consume unknown hash → false')
  assert((await consumeAuthToken(env, null)) === false, 'consume null hash → false')

  // ── hash entropy: two mints produce different tokens + hashes ──
  const D1 = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: 'u4', email: 'd@x.com' })
  const D2 = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: 'u5', email: 'd@x.com' })
  assert(D1.token !== D2.token && D1.hash !== D2.hash, 'two mints → distinct token + hash')
}

// ── Phase 4 Step 3.2 — invite + set-password endpoints ─────────────────
{
  console.log('\n— Step 3.2: invite + set-password —')

  const usersMod = await import('../worker/api/users.js')
  const authMod  = await import('../worker/api/auth.js')
  const {
    mintAuthToken, TOKEN_TYPE_INVITE, TOKEN_TYPE_RESET,
  } = await import('../worker/lib/inviteTokens.js')

  // ── exported surfaces ──
  assert(typeof usersMod.inviteUser === 'function', 'users.inviteUser exported')
  assert(typeof authMod.setPassword === 'function', 'auth.setPassword exported')
  assert(typeof authMod.jsonWithCookie === 'function', 'auth.jsonWithCookie exported (reused by setPassword)')
  assert(usersMod.INVITE_PENDING_PASSWORD === 'invite-pending', 'INVITE_PENDING_PASSWORD sentinel literal')

  // ── sentinel safety: cannot be brute-forced via verifyPassword ──
  // INVITE_PENDING_PASSWORD is not a pbkdf2$ storage string, so any login
  // attempt against an invited (un-redeemed) user fails closed.
  assert(!(await verifyPassword('invite-pending', usersMod.INVITE_PENDING_PASSWORD)), 'sentinel cannot self-verify')
  assert(!(await verifyPassword('', usersMod.INVITE_PENDING_PASSWORD)), 'sentinel rejects empty password')
  assert(!(await verifyPassword('anything', usersMod.INVITE_PENDING_PASSWORD)), 'sentinel rejects arbitrary password')

  // ── source-level guarantees ──
  const indexSrc = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8')
  const authSrc  = readFileSync(new URL('../worker/api/auth.js', import.meta.url), 'utf8')
  const usersSrc = readFileSync(new URL('../worker/api/users.js', import.meta.url), 'utf8')

  // set-password is registered BEFORE the mutation gate (pre-gate exemption).
  const setPassPos = indexSrc.indexOf("'/api/auth/set-password'")
  const mutGatePos = indexSrc.indexOf('if (isMutation(method))')
  assert(setPassPos > 0 && mutGatePos > 0 && setPassPos < mutGatePos,
    'index.js: /api/auth/set-password handled BEFORE the mutation gate', { setPassPos, mutGatePos })

  // /api/users/invite is matched BEFORE the /api/users/:id regex.
  const invitePos = indexSrc.indexOf("'/api/users/invite'")
  const usrRegex  = indexSrc.indexOf("pathname.match(/^\\/api\\/users\\/")
  assert(invitePos > 0 && usrRegex > 0 && invitePos < usrRegex,
    'index.js: /api/users/invite matched BEFORE /api/users/:id regex', { invitePos, usrRegex })

  // setPassword operation order: verify → hash → update users → delete sessions → consume.
  const order = [
    ['verifyAuthToken',                      'verify token'],
    ['hashPassword(password)',               'hash password'],
    ["UPDATE users SET password_hash = ?, status = 'active'", 'update password/status'],
    ['DELETE FROM sessions WHERE user_id = ?', 'invalidate sessions'],
    ['consumeAuthToken(env, row.token_hash)', 'consume token'],
  ]
  let last = -1
  for (const [needle, label] of order) {
    const i = authSrc.indexOf(needle)
    assert(i > last, `setPassword: "${label}" appears AFTER previous step`, { needle, i, last })
    last = i
  }

  // Cookie issuance is gated on invite type only (reset → no auto-login).
  // Allow nested braces in the if-body (object literals, template strings, etc.)
  // by using a lazy [\s\S] character class with a bounded length.
  const cookieGate = /if\s*\(\s*row\.token_type\s*===\s*TOKEN_TYPE_INVITE\s*\)\s*\{[\s\S]{0,800}?buildSessionCookie/.test(authSrc)
  assert(cookieGate, 'setPassword: Set-Cookie issuance is inside `if (row.token_type === TOKEN_TYPE_INVITE)`')

  // Generic-message string used for parity.
  assert(authSrc.includes("'This link is invalid or has expired'"), 'setPassword: generic failure message present')

  // Timing-leak TODO present (audit acknowledgment). Match across line breaks.
  assert(/TODO\(hardening\)[\s\S]{0,200}PBKDF2/.test(authSrc), 'setPassword: timing-leak TODO documented')

  // Invite handler writes the sentinel + status='invited'.
  assert(/status='invited'|status\s*=\s*'invited'/.test(usersSrc.replace(/\s+/g, ' ')) || /'invited'/.test(usersSrc),
    'inviteUser: writes status=invited')
  assert(usersSrc.includes('INVITE_PENDING_PASSWORD'), 'inviteUser: writes INVITE_PENDING_PASSWORD sentinel')
  assert(usersSrc.includes('encodeCourseAccess(body.courseAccess)'),
    'inviteUser: validates courseAccess via encodeCourseAccess (Step 4 semantics inherited)')
  assert(usersSrc.includes('revokeActiveTokensFor(env, id, TOKEN_TYPE_INVITE)'),
    'inviteUser: revokes prior active invite tokens before minting')
  assert(usersSrc.includes('mintAuthToken(env'),
    'inviteUser: mints token via mintAuthToken')
  assert(usersSrc.includes('/accept-invite?token='),
    'inviteUser: builds /accept-invite?token=... URL')

  // ── behavior — full setPassword lifecycle on a fake env ──
  function makeFakeEnv() {
    const tokens  = []
    const users   = []
    const sessions = []
    const exec = (sql, bound) => {
      const q = sql.replace(/\s+/g, ' ').trim()

      // ── auth_tokens ──
      if (q.startsWith('INSERT INTO auth_tokens')) {
        const [id, token_hash, token_type, user_id, email, created_by_user_id, expires_at, metadata_json] = bound
        tokens.push({ id, token_hash, token_type, user_id, email, status: 'active', created_by_user_id, expires_at, metadata_json, used_at: null })
        return { kind: 'run', success: true, changes: 1 }
      }
      if (q.startsWith('SELECT * FROM auth_tokens WHERE token_hash = ?')) {
        return { kind: 'first', row: tokens.find(r => r.token_hash === bound[0]) || null }
      }
      if (q.includes("UPDATE auth_tokens SET status = 'used'")) {
        const r = tokens.find(r => r.token_hash === bound[0])
        if (r && r.status === 'active') { r.status = 'used'; r.used_at = new Date().toISOString(); return { kind: 'run', success: true, changes: 1 } }
        return { kind: 'run', success: true, changes: 0 }
      }
      if (q.includes("UPDATE auth_tokens SET status = 'expired'")) {
        const r = tokens.find(r => r.id === bound[0])
        if (r && r.status === 'active') { r.status = 'expired'; return { kind: 'run', success: true, changes: 1 } }
        return { kind: 'run', success: true, changes: 0 }
      }
      if (q.includes("UPDATE auth_tokens SET status = 'revoked'")) {
        const [userId, type] = bound
        let n = 0
        for (const r of tokens) if (r.user_id === userId && r.token_type === type && r.status === 'active') { r.status = 'revoked'; n++ }
        return { kind: 'run', success: true, changes: n }
      }
      if (q.startsWith('DELETE FROM auth_tokens')) return { kind: 'run', success: true, changes: 0 }

      // ── users ──
      if (q.startsWith('SELECT * FROM users WHERE id = ?')) {
        return { kind: 'first', row: users.find(u => u.id === bound[0]) || null }
      }
      if (q.includes("UPDATE users SET password_hash = ?, status = 'active'")) {
        const [hash, id] = bound
        const u = users.find(x => x.id === id)
        if (!u) return { kind: 'run', success: true, changes: 0 }
        u.password_hash = hash; u.status = 'active'; u.updated_at = new Date().toISOString()
        return { kind: 'run', success: true, changes: 1 }
      }
      if (q.startsWith("UPDATE users SET last_login_at")) {
        const u = users.find(x => x.id === bound[0])
        if (u) u.last_login_at = new Date().toISOString()
        return { kind: 'run', success: true, changes: 1 }
      }

      // ── sessions ──
      if (q.startsWith('INSERT INTO sessions')) {
        const [id, token_hash, user_id, expires_at, user_agent] = bound
        sessions.push({ id, token_hash, user_id, expires_at, user_agent, last_seen_at: new Date().toISOString() })
        return { kind: 'run', success: true, changes: 1 }
      }
      if (q.startsWith('DELETE FROM sessions WHERE user_id = ?')) {
        const before = sessions.length
        for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].user_id === bound[0]) sessions.splice(i, 1)
        return { kind: 'run', success: true, changes: before - sessions.length }
      }

      return { kind: 'run', success: false, changes: 0 }
    }
    const DB = {
      _tokens: tokens, _users: users, _sessions: sessions,
      prepare(sql) {
        let bound = []
        const stmt = {
          bind(...args) { bound = args; return stmt },
          async first() { const r = exec(sql, bound); return r.kind === 'first' ? r.row : null },
          async run()   { const r = exec(sql, bound); return { success: !!r.success, meta: { changes: r.changes ?? 0 } } },
        }
        return stmt
      },
    }
    return { DB }
  }
  function makeReq(body, { ua = 'smoke/1.0' } = {}) {
    const json = JSON.stringify(body ?? {})
    return {
      url: 'https://turfintel.test/api/auth/set-password',
      headers: { get(name) { return name.toLowerCase() === 'user-agent' ? ua : null } },
      json: async () => JSON.parse(json),
    }
  }

  // happy path — invite redemption auto-issues a session
  {
    const env = makeFakeEnv()
    const uid = 'usr_invitee_a'
    env.DB._users.push({ id: uid, email: 'a@x.com', display_name: 'A', role: 'crew',
      status: 'invited', course_access: null, password_hash: 'invite-pending',
      view_private_notes: 0, send_crew_notes: 0, created_at: 'now', updated_at: 'now', last_login_at: null })
    const { token } = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: uid, email: 'a@x.com' })
    const res = await authMod.setPassword(env, makeReq({ token, password: 'goodpass1' }))
    assert(res.status === 200, 'invite redeem → 200', { status: res.status })
    assert(!!res.headers.get('Set-Cookie'), 'invite redeem → Set-Cookie header issued')
    assert(/ti_session=[0-9a-f]+/.test(res.headers.get('Set-Cookie')), 'cookie carries session token')
    const body = await res.json()
    assert(body.ok === true && body.user.status === 'active', 'invite redeem → body.user.status active')
    const u = env.DB._users[0]
    assert(u.status === 'active', 'users row flipped to active')
    assert(u.password_hash.startsWith('pbkdf2$100000$'), 'real PBKDF2 hash written')
    assert(await verifyPassword('goodpass1', u.password_hash), 'new password verifies')
    assert(env.DB._tokens[0].status === 'used', 'token consumed (status=used)')
    assert(env.DB._sessions.length === 1 && env.DB._sessions[0].user_id === uid, 'one session created for invitee')
    assert(u.last_login_at !== null, 'last_login_at touched')
  }

  // happy path — reset DOES NOT auto-issue, and DOES invalidate prior sessions
  {
    const env = makeFakeEnv()
    const uid = 'usr_resetter_b'
    env.DB._users.push({ id: uid, email: 'b@x.com', display_name: 'B', role: 'crew',
      status: 'active', course_access: null, password_hash: 'pbkdf2$100000$AAAA$BBBB',
      view_private_notes: 0, send_crew_notes: 0, created_at: 'now', updated_at: 'now', last_login_at: 'old' })
    env.DB._sessions.push({ id: 's_old1', token_hash: 'xxx', user_id: uid, expires_at: '2099', user_agent: 'old', last_seen_at: 'old' })
    env.DB._sessions.push({ id: 's_old2', token_hash: 'yyy', user_id: uid, expires_at: '2099', user_agent: 'old', last_seen_at: 'old' })
    const { token } = await mintAuthToken(env, { type: TOKEN_TYPE_RESET, userId: uid, email: 'b@x.com' })
    const res = await authMod.setPassword(env, makeReq({ token, password: 'newpass99' }))
    assert(res.status === 200, 'reset → 200', { status: res.status })
    assert(!res.headers.get('Set-Cookie'), 'reset → NO Set-Cookie (manual login required)')
    assert(env.DB._sessions.length === 0, 'reset → prior sessions invalidated')
    assert(env.DB._tokens[0].status === 'used', 'reset token consumed')
    const u = env.DB._users[0]
    assert(u.status === 'active' && (await verifyPassword('newpass99', u.password_hash)), 'reset → new password verifies')
    assert(u.last_login_at === 'old', 'reset does NOT touch last_login_at (no login yet)')
  }

  // failure parity: identical body+status for every reject path
  async function rejectBody(env, req) {
    const r = await authMod.setPassword(env, req)
    return { status: r.status, body: await r.json(), cookie: r.headers.get('Set-Cookie') }
  }
  {
    const env = makeFakeEnv()
    const uid = 'usr_reject'
    env.DB._users.push({ id: uid, email: 'r@x.com', display_name: 'R', role: 'crew',
      status: 'invited', course_access: null, password_hash: 'invite-pending',
      view_private_notes: 0, send_crew_notes: 0, created_at: 'now', updated_at: 'now', last_login_at: null })
    const { token, hash } = await mintAuthToken(env, { type: TOKEN_TYPE_INVITE, userId: uid, email: 'r@x.com' })

    const canonical = { status: 400, body: { error: 'This link is invalid or has expired' }, cookie: null }
    const sameAs = (got) =>
      got.status === canonical.status &&
      got.body && got.body.error === canonical.body.error &&
      Object.keys(got.body).length === 1 &&
      got.cookie === null

    // empty token
    assert(sameAs(await rejectBody(makeFakeEnv(), makeReq({ token: '', password: 'goodpass1' }))), 'empty token → generic 400')
    // missing token field
    assert(sameAs(await rejectBody(makeFakeEnv(), makeReq({ password: 'goodpass1' }))), 'no token field → generic 400')
    // unknown token
    assert(sameAs(await rejectBody(makeFakeEnv(), makeReq({ token: 'deadbeef'.repeat(8), password: 'goodpass1' }))), 'unknown token → generic 400')
    // weak password (valid token + short pw)
    {
      const env2 = makeFakeEnv()
      env2.DB._users.push({ ...env.DB._users[0] })
      const t = await mintAuthToken(env2, { type: TOKEN_TYPE_INVITE, userId: uid, email: 'r@x.com' })
      const got = await rejectBody(env2, makeReq({ token: t.token, password: 'short' }))
      assert(sameAs(got), 'weak password → generic 400')
      // critical: password is NOT changed on weak-password reject
      assert(env2.DB._users[0].password_hash === 'invite-pending', 'weak password → users row unchanged')
      assert(env2.DB._tokens[0].status === 'active', 'weak password → token NOT consumed')
    }
    // expired token (lazy-transition path)
    {
      const env2 = makeFakeEnv()
      env2.DB._users.push({ ...env.DB._users[0] })
      const t = await mintAuthToken(env2, { type: TOKEN_TYPE_INVITE, userId: uid, email: 'r@x.com' })
      env2.DB._tokens[0].expires_at = '2000-01-01T00:00:00.000Z'   // force expired
      const got = await rejectBody(env2, makeReq({ token: t.token, password: 'goodpass1' }))
      assert(sameAs(got), 'expired token → generic 400')
      assert(env2.DB._tokens[0].status === 'expired', 'lazy-transitioned to expired on verify')
      assert(env2.DB._users[0].password_hash === 'invite-pending', 'expired token → users row unchanged')
    }
    // already-used token (consume happens after update — second redemption fails at verify)
    {
      const env2 = makeFakeEnv()
      env2.DB._users.push({ ...env.DB._users[0] })
      const t = await mintAuthToken(env2, { type: TOKEN_TYPE_INVITE, userId: uid, email: 'r@x.com' })
      const ok = await authMod.setPassword(env2, makeReq({ token: t.token, password: 'firstgood' }))
      assert(ok.status === 200, 'first redemption succeeds')
      const got = await rejectBody(env2, makeReq({ token: t.token, password: 'secondtry' }))
      assert(sameAs(got), 'replay of used token → generic 400')
      // password is NOT overwritten by the replay
      assert(await verifyPassword('firstgood', env2.DB._users[0].password_hash), 'replay does not overwrite password')
    }
    // disabled user
    {
      const env2 = makeFakeEnv()
      env2.DB._users.push({ ...env.DB._users[0], status: 'disabled' })
      const t = await mintAuthToken(env2, { type: TOKEN_TYPE_RESET, userId: uid, email: 'r@x.com' })
      assert(sameAs(await rejectBody(env2, makeReq({ token: t.token, password: 'goodpass1' }))), 'disabled user → generic 400')
      assert(env2.DB._users[0].password_hash === 'invite-pending', 'disabled user → password unchanged')
    }
    // no env.DB
    {
      const r = await authMod.setPassword({}, makeReq({ token: token, password: 'goodpass1' }))
      assert(r.status === 503, 'no env.DB → 503 (infrastructure, not enumeration-sensitive)')
    }

    void hash   // silence unused (kept for shape symmetry with happy-path closure)
  }
}

// ── Step 3.2 endpoint contract guarantees (source-level) ────────────────────
// The lifecycle behavior is locked by the helper smokes above + an E2E run;
// these assertions lock the WIRING + the security-critical text/order so a
// future refactor can't quietly drop them.
{
  const authSrc  = readFileSync('worker/api/auth.js', 'utf8')
  const usersSrc = readFileSync('worker/api/users.js', 'utf8')
  const idxSrc   = readFileSync('worker/index.js', 'utf8')

  // --- export surface (decisions 6 location split) ---
  assert(/export async function inviteUser\(/.test(usersSrc), 'users.js: inviteUser exported')
  assert(/export async function setPassword\(/.test(authSrc), 'auth.js: setPassword exported')
  assert(/export async function tokenStatus\(/.test(authSrc), 'auth.js: tokenStatus exported')
  assert(/export async function resetRequest\(/.test(authSrc), 'auth.js: resetRequest exported')

  // --- route wiring ---
  assert(/pathname === '\/api\/users\/invite'/.test(idxSrc), 'route: POST /api/users/invite wired')
  assert(/pathname === '\/api\/auth\/set-password'/.test(idxSrc), 'route: POST /api/auth/set-password wired')
  assert(/pathname === '\/api\/auth\/token-status'/.test(idxSrc), 'route: GET /api/auth/token-status wired')
  assert(/pathname === '\/api\/auth\/reset-request'/.test(idxSrc), 'route: POST /api/auth/reset-request wired')
  // Token-gated routes must sit BEFORE the mutation gate.
  const gatePos        = idxSrc.indexOf('// ── Mutation auth + permission gate')
  const setPwPos       = idxSrc.indexOf("pathname === '/api/auth/set-password'")
  const tokenStatusPos = idxSrc.indexOf("pathname === '/api/auth/token-status'")
  const resetReqPos    = idxSrc.indexOf("pathname === '/api/auth/reset-request'")
  assert(setPwPos > 0 && setPwPos < gatePos, 'set-password runs BEFORE mutation gate')
  assert(tokenStatusPos > 0 && tokenStatusPos < gatePos, 'token-status runs BEFORE mutation gate')
  assert(resetReqPos > 0 && resetReqPos < gatePos, 'reset-request runs BEFORE mutation gate')
  // /api/users/invite literal MUST be matched BEFORE the /api/users/:id regex
  // (otherwise it would resolve to id='invite' and 404).
  const inviteRoute  = idxSrc.indexOf("pathname === '/api/users/invite'")
  const usersIdRoute = idxSrc.indexOf("pathname.match(/^\\/api\\/users\\/")
  assert(inviteRoute > 0 && (usersIdRoute < 0 || inviteRoute < usersIdRoute), '/api/users/invite literal matched before /:id regex')

  // --- decision 4: 'invite-pending' sentinel literal ---
  assert(/INVITE_PENDING_PASSWORD = 'invite-pending'/.test(usersSrc), "decision 4: sentinel literal is 'invite-pending'")
  assert(/INVITE_PENDING_PASSWORD/.test(usersSrc), 'sentinel is referenced (used at INSERT)')

  // --- decision 1+2: invite auto-login, reset manual login ---
  // The set-password handler must issue jsonWithCookie ONLY when type=invite.
  const sp = authSrc.slice(authSrc.indexOf('export async function setPassword'),
                          authSrc.indexOf('// ── Token status'))
  assert(/row\.token_type === TOKEN_TYPE_INVITE/.test(sp), 'set-password: branches on TOKEN_TYPE_INVITE for auto-login')
  assert(/jsonWithCookie\(payload, buildSessionCookie\(token\)\)/.test(sp), 'set-password: invite branch issues Set-Cookie')
  // Reset branch returns plain json(payload) — no cookie.
  const resetBranch = sp.slice(sp.lastIndexOf('jsonWithCookie'))
  assert(/return json\(payload\)/.test(resetBranch), 'set-password: reset branch returns json(payload) (no cookie)')

  // --- decision 3 + your strict-order constraint ---
  // verify → hash → update → invalidate sessions → consume → optionally session
  const stepVerify   = sp.indexOf('verifyAuthToken(env, rawToken)')
  const stepHash     = sp.indexOf('await hashPassword(password)')
  const stepUpdate   = sp.indexOf("status = 'active'")
  const stepRevoke   = sp.indexOf('DELETE FROM sessions WHERE user_id = ?')
  const stepConsume  = sp.indexOf('consumeAuthToken')
  const stepSession  = sp.indexOf('INSERT INTO sessions')
  assert(stepVerify > 0 && stepHash > stepVerify, 'order: verify before hash')
  assert(stepUpdate > stepHash, 'order: hash before update')
  assert(stepRevoke > stepUpdate, 'order: update before invalidate-sessions')
  assert(stepConsume > stepRevoke, 'order: invalidate before consume')
  assert(stepSession > stepConsume, 'order: consume before issue-session')
  // Decision 3 hardening TODO must be present. The comment lives just ABOVE
  // the setPassword function (so it's not in the `sp` slice above) — search
  // the whole authSrc.
  assert(/TODO\(hardening\)[\s\S]{0,400}timing/.test(authSrc), 'decision 3: TODO(hardening) timing-leak note present')

  // --- enumeration safety: a single generic error constant ---
  assert(/SET_PASSWORD_GENERIC = \{ error: 'This link is invalid or has expired' \}/.test(authSrc),
    'set-password uses single generic error object')
  // resetRequest is enumeration-safe: a constant generic response object.
  assert(/RESET_GENERIC = \{ ok: true, message:/.test(authSrc), 'reset-request uses single generic response object')

  // --- decision 5: re-invite NOT yet implemented (deferred) ---
  assert(!/\/api\/users\/[^\s'"]*\/invite/.test(idxSrc) ||
         !/pathname\.match\(\/\^\\\/api\\\/users\\\/.*\\\/invite\$\//.test(idxSrc),
         'decision 5: per-user re-invite endpoint NOT wired (deferred)')

  // --- invite handler authorization: canManageUsers + canManageRole ---
  const iv = usersSrc.slice(usersSrc.indexOf('export async function inviteUser'),
                            usersSrc.indexOf('// ── Update'))
  assert(/can\(actor, 'canManageUsers'\)/.test(iv), 'invite: canManageUsers checked')
  assert(/canManageRole\(actor, role\)/.test(iv), 'invite: canManageRole hierarchy checked')
  assert(/encodeCourseAccess\(body\.courseAccess\)/.test(iv), 'invite: courseAccess goes through encodeCourseAccess (Step 4 semantics)')
  assert(/revokeActiveTokensFor\(env, id, TOKEN_TYPE_INVITE\)/.test(iv), 'invite: revokes prior active invite tokens (defensive)')
  assert(/mintAuthToken\(env, \{/.test(iv), 'invite: mints token')

  // --- reset-request admin-mode debug ---
  const rr = authSrc.slice(authSrc.indexOf('export async function resetRequest'),
                           authSrc.indexOf('// Lightweight admin check'))
  assert(/isRateLimited\(env, email, ip\)/.test(rr), 'reset-request shares login rate limiter')
  assert(/recordAttempt\(env, email, ip, false\)/.test(rr), 'reset-request records attempts for throttle accounting')
  assert(/revokeActiveTokensFor\(env, user\.id, TOKEN_TYPE_RESET\)/.test(rr), 'reset-request revokes prior reset tokens on re-request')
  assert(/if \(isAdmin\)/.test(rr), 'reset-request branches on isAdmin for debug.resetUrl')
  assert(/debug: \{ resetUrl, expiresAt \}/.test(rr), 'reset-request: admin debug shape = { resetUrl, expiresAt }')

  // --- token-status negative shape (no detail leakage) ---
  const ts = authSrc.slice(authSrc.indexOf('export async function tokenStatus'),
                           authSrc.indexOf('// ── Password reset request'))
  assert(/const NEG = \{ valid: false \}/.test(ts), 'token-status: single negative shape')
}

// ── Step 3.3 SPA security constraints (source-level) ────────────────────────
// The pages live in src/pages/Auth/* + the wired Login forgot-password panel.
// We lock the "no client-side token persistence" + "URL is the only source"
// + "deterministic flows" properties so a future refactor can't quietly drop
// them.
{
  const form   = readFileSync('src/pages/Auth/SetPasswordForm.jsx', 'utf8')
  const invite = readFileSync('src/pages/Auth/AcceptInvitePage.jsx', 'utf8')
  const reset  = readFileSync('src/pages/Auth/ResetPasswordPage.jsx', 'utf8')
  const login  = readFileSync('src/pages/Login/Login.jsx', 'utf8')
  const app    = readFileSync('src/App.jsx', 'utf8')

  // Routes wired and OUTSIDE the RequireAuth wrapper.
  assert(/path="\/accept-invite"/.test(app), 'route /accept-invite wired')
  assert(/path="\/reset-password"/.test(app), 'route /reset-password wired')
  // Both routes are siblings of /login, not children of the RequireAuth
  // <Route path="/" element={<RequireAuth...>}> block.
  const requireAuthIdx = app.indexOf('element={<RequireAuth>')
  const acceptIdx = app.indexOf('path="/accept-invite"')
  const resetIdx  = app.indexOf('path="/reset-password"')
  assert(acceptIdx > 0 && acceptIdx < requireAuthIdx, '/accept-invite is OUTSIDE the RequireAuth subtree')
  assert(resetIdx  > 0 && resetIdx  < requireAuthIdx, '/reset-password is OUTSIDE the RequireAuth subtree')

  // Source-of-truth for the token: URLSearchParams. NO storage APIs in CODE
  // (comments mentioning the prohibited APIs are explicitly allowed).
  function stripComments(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  }
  for (const [name, src] of [['form', form], ['invite', invite], ['reset', reset]]) {
    const code = stripComments(src)
    assert(!/\blocalStorage\b/.test(code),   `${name}: no localStorage in code`)
    assert(!/\bsessionStorage\b/.test(code), `${name}: no sessionStorage in code`)
    assert(!/document\.cookie/.test(code),   `${name}: no document.cookie access in code`)
  }
  assert(/URLSearchParams\(location\.search\)/.test(form), 'form: token sourced from URLSearchParams only')

  // Token state is cleared after submit, regardless of outcome.
  assert(/setToken\(''\)/.test(form), 'form: clears token from local state after submit')
  assert(/setPassword\(''\)/.test(form), 'form: clears password from local state after submit')

  // Token is submitted exactly once: a double-submit guard exists.
  assert(/phase !== PHASE\.READY\) return/.test(form), 'form: double-submit guard (only fires when phase=READY)')

  // No console.log of token-bearing values.
  for (const [name, src] of [['form', form], ['invite', invite], ['reset', reset]]) {
    // Detect any `console.log(...token...)` patterns. Tight match — allows
    // unrelated "token" mentions in comments.
    assert(!/console\.(log|info|warn|error)\([^)]*\btoken\b/.test(src), `${name}: no console output referencing token`)
  }

  // Decision branching is correct per Step 3.2:
  //   invite success → AuthContext.refresh() + navigate('/dashboard')
  //   reset success  → navigate('/login') with { resetSuccess: true } state;
  //                    NO refresh()
  assert(/refresh\(\)/.test(invite) && /navigate\('\/dashboard'/.test(invite),
    'invite page: refresh() + navigate /dashboard on success')
  assert(!/refresh\(\)/.test(reset), 'reset page: does NOT call refresh() (no session to refresh into)')
  assert(/navigate\('\/login'/.test(reset) && /resetSuccess:\s*true/.test(reset),
    'reset page: navigate /login with { resetSuccess: true }')

  // Page validates the token IMMEDIATELY on load via token-status, and uses
  // the expectedType prop to type-check.
  assert(/\/api\/auth\/token-status\?token=\$\{encodeURIComponent\(token\)\}/.test(form),
    'form: validates token via /api/auth/token-status on mount')
  assert(/expectedType="invite"/.test(invite), 'invite page: passes expectedType="invite"')
  assert(/expectedType="password_reset"/.test(reset), 'reset page: passes expectedType="password_reset"')

  // Submit hits set-password with credentials, JSON content type, ONLY the
  // raw token and password — no extra fields that could leak metadata.
  const submitCall = form.match(/fetch\('\/api\/auth\/set-password'[\s\S]{0,500}?\}\)/)
  assert(submitCall && /credentials: 'same-origin'/.test(submitCall[0]), 'form: set-password sends credentials')
  assert(submitCall && /Content-Type[^,]*application\/json/i.test(submitCall[0]), 'form: set-password sends JSON content type')

  // Login wires the forgot-password panel + reset-request POST + always
  // shows a generic confirmation (enumeration-safe UI).
  assert(/forgotOpen/.test(login) && /forgotEmail/.test(login), 'login: inline forgot-password panel state')
  assert(/\/api\/auth\/reset-request/.test(login), 'login: POSTs /api/auth/reset-request')
  assert(/credentials: 'same-origin'/.test(login), 'login: forgot-password fetch sends credentials')
  assert(/If that email is registered/.test(login), 'login: generic reset confirmation (enumeration-safe)')
  // Login reads the resetSuccess router state for the post-reset notice.
  assert(/location\.state\?\.resetSuccess/.test(login), 'login: reads resetSuccess router state')
  // And clears it from history so refresh doesn't re-trigger.
  assert(/navigate\(location\.pathname, \{ replace: true, state: null \}\)/.test(login),
    'login: clears resetSuccess from history on mount')

  // No new state-management layer or auth modal framework — the form just
  // reuses Login.module.css.
  assert(/styles from '\.\.\/Login\/Login\.module\.css'/.test(form),
    'form: reuses Login.module.css (no new design system work)')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
