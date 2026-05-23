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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
