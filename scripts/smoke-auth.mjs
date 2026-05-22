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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
