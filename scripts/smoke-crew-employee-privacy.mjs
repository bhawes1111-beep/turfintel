// Phase 9C.5a.5 — Public crew employee GET privacy smoke.
//
//   node scripts/smoke-crew-employee-privacy.mjs
//
// Closes the gap where /api/crew-employees (a public GET route)
// returned management-only fields (payRate, emergencyContact,
// pesticideLicense, phone, email, employee notes, hireDate) to
// anonymous kiosk callers, even though the kiosk itself never
// rendered them.
//
// The fix mirrors the existing conditionLog.js privateNotes pattern:
//   1. rowToEmployee(row, canViewPrivate) — private fields are OMITTED
//      (not nulled) when canViewPrivate is false.
//   2. listCrewEmployees / getCrewEmployee thread the flag through.
//   3. worker/index.js resolves the actor on each GET and computes
//      actorHasPermission(actor, 'canViewEmployeePrivate').
//   4. Mutation handlers pass true to the post-write read, because
//      they're already past the mutation gate.
//
// Pure source-only — does not boot a server.

import { readFileSync, readdirSync } from 'fs'
import { can } from '../worker/lib/permissions.js'
import { actorHasPermission } from '../worker/lib/actor.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const CREW   = readFileSync('worker/api/crew.js',          'utf8')
const IDX    = readFileSync('worker/index.js',             'utf8')
const PERM_W = readFileSync('worker/lib/permissions.js',   'utf8')
const PERM_C = readFileSync('src/utils/auth/permissions.js', 'utf8')

// ── canViewEmployeePrivate is in the permission key list (both files) ──
section('canViewEmployeePrivate permission key — client + worker sync')

assert(/['"]canViewEmployeePrivate['"]/.test(PERM_W),
  "worker/lib/permissions.js declares 'canViewEmployeePrivate' in PERMISSION_KEYS")
assert(/['"]canViewEmployeePrivate['"]/.test(PERM_C),
  "src/utils/auth/permissions.js declares 'canViewEmployeePrivate' in PERMISSION_KEYS")

// owner_admin + superintendent grant the permission; nobody else does by default.
assert(can('owner_admin',     'canViewEmployeePrivate'), 'owner_admin has canViewEmployeePrivate')
assert(can('superintendent',  'canViewEmployeePrivate'), 'superintendent has canViewEmployeePrivate')
assert(!can('assistant_super', 'canViewEmployeePrivate'),
  'assistant_super does NOT have canViewEmployeePrivate by default (override available)')
assert(!can('crew_lead',       'canViewEmployeePrivate'), 'crew_lead does NOT have canViewEmployeePrivate')
assert(!can('crew',            'canViewEmployeePrivate'), 'crew does NOT have canViewEmployeePrivate')
assert(!can('read_only',       'canViewEmployeePrivate'), 'read_only does NOT have canViewEmployeePrivate')
assert(!can(null,              'canViewEmployeePrivate'), 'anonymous (null actor) does NOT have canViewEmployeePrivate')

// Per-user override flag mirrors the existing view_private_notes pattern.
assert(can({ role: 'assistant_super', view_employee_private: 1 }, 'canViewEmployeePrivate'),
  'view_employee_private override grants assistant_super canViewEmployeePrivate')

// actorHasPermission threads through identically.
assert(actorHasPermission({ role: 'owner_admin' },    'canViewEmployeePrivate'),
  'actorHasPermission: owner has canViewEmployeePrivate')
assert(actorHasPermission({ role: 'superintendent' }, 'canViewEmployeePrivate'),
  'actorHasPermission: super has canViewEmployeePrivate')
assert(!actorHasPermission({ role: 'crew' },          'canViewEmployeePrivate'),
  'actorHasPermission: crew lacks canViewEmployeePrivate')
assert(!actorHasPermission(null,                       'canViewEmployeePrivate'),
  'actorHasPermission: null lacks canViewEmployeePrivate')

// ── Serializer accepts canViewPrivate + branches on it ─────────────────
section('worker/api/crew.js — rowToEmployee gates private fields')

assert(/function rowToEmployee\(row,\s*canViewPrivate(?:\s*=\s*false)?\)/.test(CREW),
  'rowToEmployee(row, canViewPrivate = false) signature defined')

// Public-safe fields appear in the unconditional out object.
const rowToEmpMatch = CREW.match(/function rowToEmployee\([\s\S]*?\n\}\n/)
const rowToEmpSrc   = rowToEmpMatch ? rowToEmpMatch[0] : ''

for (const field of [
  'id', 'employeeId', 'name', 'fullName', 'role', 'department', 'status',
  'assignedArea', 'skills', 'certifications', 'courseId', 'createdAt', 'updatedAt',
]) {
  assert(new RegExp(`\\b${field}:`).test(rowToEmpSrc),
    `rowToEmployee returns public field '${field}'`)
}

// Private fields appear ONLY inside the if (canViewPrivate) branch.
const ifBranchMatch = rowToEmpSrc.match(/if \(canViewPrivate\)\s*\{([\s\S]*?)\}\s*return out/)
const ifBranchSrc   = ifBranchMatch ? ifBranchMatch[1] : ''
assert(ifBranchSrc.length > 0, 'rowToEmployee has an `if (canViewPrivate) { ... }` private-fields branch')

for (const privateField of [
  'phone', 'email', 'notes', 'payRate', 'hireDate', 'pesticideLicense', 'emergencyContact',
]) {
  assert(new RegExp(`out\\.${privateField}\\s*=`).test(ifBranchSrc),
    `private field '${privateField}' assigned ONLY inside the canViewPrivate branch`)
}

// Negative — none of the private fields appear in the public part of the
// out object. (The unconditional block stops at the if (canViewPrivate)
// line.) Reading the unconditional half.
const unconditionalHalf = rowToEmpSrc.slice(0, rowToEmpSrc.indexOf('if (canViewPrivate)'))
for (const privateField of [
  'phone', 'email', 'payRate', 'hireDate', 'pesticideLicense', 'emergencyContact',
]) {
  // 'notes:' is dangerous to assert raw because the file contains comments
  // that mention notes; only check that the field-assignment shape isn't
  // present in the unconditional half.
  assert(!new RegExp(`\\b${privateField}:`).test(unconditionalHalf),
    `private field '${privateField}' does NOT appear in the unconditional half of rowToEmployee`)
}
// notes is a separate check — it must appear NEITHER as a key in the
// unconditional out object NOR as out.notes outside the if-branch.
const unconditionalNotes = /\bnotes:\s*row\.notes/.test(unconditionalHalf)
assert(!unconditionalNotes,
  "private field 'notes' does NOT appear as 'notes: row.notes' in the unconditional half of rowToEmployee")

// ── listCrewEmployees + getCrewEmployee thread the flag ────────────────
section('worker/api/crew.js — list/get handlers thread canViewPrivate')

assert(/export async function listCrewEmployees\(env,\s*courseId\s*=\s*null,\s*canViewPrivate(?:\s*=\s*false)?\)/.test(CREW),
  'listCrewEmployees(env, courseId = null, canViewPrivate = false) signature')
assert(/results\.map\(r\s*=>\s*rowToEmployee\(r,\s*canViewPrivate\)\)/.test(CREW),
  'listCrewEmployees maps results through rowToEmployee(r, canViewPrivate)')

assert(/export async function getCrewEmployee\(env,\s*id,\s*canViewPrivate(?:\s*=\s*false)?\)/.test(CREW),
  'getCrewEmployee(env, id, canViewPrivate = false) signature')
assert(/rowToEmployee\(row,\s*canViewPrivate\)/.test(CREW),
  'getCrewEmployee passes canViewPrivate to rowToEmployee')

// ── Mutation handlers pass true to post-write read ─────────────────────
section('worker/api/crew.js — mutation handlers return full record (canViewPrivate=true)')

const createSrc = (CREW.match(/export async function createCrewEmployee[\s\S]*?\n\}/) ?? [''])[0]
const updateSrc = (CREW.match(/export async function updateCrewEmployee[\s\S]*?\n\}/) ?? [''])[0]

assert(/return getCrewEmployee\(env,\s*id,\s*true\)/.test(createSrc),
  'createCrewEmployee returns getCrewEmployee(env, id, true) — caller is past the mutation gate')
assert(/return getCrewEmployee\(env,\s*id,\s*true\)/.test(updateSrc),
  'updateCrewEmployee returns getCrewEmployee(env, id, true) — caller is past the mutation gate')

// ── worker/index.js resolves actor + permission on crew GET routes ─────
section('worker/index.js — resolves actor + canViewEmployeePrivate on GET routes')

// LIST route slice
const listRouteSlice = (IDX.match(/if \(pathname === '\/api\/crew-employees'\) \{[\s\S]*?\n\s*\}/) ?? [''])[0]
assert(listRouteSlice.length > 0, '/api/crew-employees route slice located in worker/index.js')

assert(/method === 'GET'\)\s*\{[\s\S]{0,400}const actor = await resolveActor\(request, env\)/.test(listRouteSlice),
  'LIST GET branch resolves actor via resolveActor(request, env)')
assert(/actorHasPermission\(actor,\s*'canViewEmployeePrivate'\)/.test(listRouteSlice),
  "LIST GET branch checks actorHasPermission(actor, 'canViewEmployeePrivate')")
assert(/return listCrewEmployees\(env,\s*courseId,\s*canViewPrivate\)/.test(listRouteSlice),
  'LIST GET branch passes canViewPrivate to listCrewEmployees(env, courseId, canViewPrivate)')

// :id route slice — anchor on the empMatch block.
const idRouteSlice = (IDX.match(/const empMatch = pathname\.match\(\/\^\\\/api\\\/crew-employees[\s\S]*?\n\s*\}/) ?? [''])[0]
assert(idRouteSlice.length > 0, '/api/crew-employees/:id route slice located in worker/index.js')

assert(/method === 'GET'\)\s*\{[\s\S]{0,400}const actor = await resolveActor\(request, env\)/.test(idRouteSlice),
  ':id GET branch resolves actor via resolveActor(request, env)')
assert(/actorHasPermission\(actor,\s*'canViewEmployeePrivate'\)/.test(idRouteSlice),
  ":id GET branch checks actorHasPermission(actor, 'canViewEmployeePrivate')")
assert(/return getCrewEmployee\(env,\s*id,\s*canViewPrivate\)/.test(idRouteSlice),
  ':id GET branch passes canViewPrivate to getCrewEmployee(env, id, canViewPrivate)')

// ── crew_employees migrations must NOT add private fields ──────────────
section('Post-9C.5a.5 crew_employees migrations stay public-safe')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
// 9C.5a.5 is a server-side serializer/auth hardening — no schema change.
// Later sub-phases (e.g. 9C.5b1 bilingual kiosk fields, 9C.5c1 employee
// translation preferences) may add their own migrations. The privacy
// contract for crew_employees is upheld in two ways:
//   1. Migrations may add columns to crew_employees ONLY when the new
//      columns are classified as public-safe (kiosk-rendering hints,
//      not HR/management data). Phase 9C.5c1 adds
//      `auto_translate_board_notes` and `board_language` — both public.
//   2. The new columns MUST appear in rowToEmployee's unconditional
//      half, NEVER inside the `if (canViewPrivate)` block. The
//      'rowToEmployee gates private fields' section above already
//      asserts that the canonical 7 private fields stay gated; the
//      check below confirms no NEW private columns sneak past.

// Allow-list: new crew_employees columns approved as public-safe.
const PUBLIC_SAFE_NEW_EMP_COLUMNS = [
  'auto_translate_board_notes',   // Phase 9C.5c1
  'board_language',               // Phase 9C.5c1
]
const postPrivacyMigrations = migrationFiles.filter(f => /^00(4[9]|[5-9]\d|\d{3,})/.test(f))
for (const file of postPrivacyMigrations) {
  const sql = readFileSync(`worker/migrations/${file}`, 'utf8')
  if (!/\bcrew_employees\b/i.test(sql)) continue
  // The migration touches crew_employees. Verify every ADD COLUMN
  // targets a column on the public-safe allow-list.
  const addColMatches = [...sql.matchAll(/ALTER\s+TABLE\s+crew_employees\s+ADD\s+COLUMN\s+(\w+)/gi)]
  for (const m of addColMatches) {
    const col = m[1]
    assert(PUBLIC_SAFE_NEW_EMP_COLUMNS.includes(col),
      `${file} ADD COLUMN ${col} is on the public-safe allow-list (private fields must stay gated)`)
  }
}

// Belt-and-suspenders: the Phase 9C.5c1 columns are positively asserted
// to live OUTSIDE the `if (canViewPrivate)` block in worker/api/crew.js.
if (ifBranchSrc) {
  for (const publicCol of ['autoTranslateBoardNotes', 'boardLanguage']) {
    assert(!new RegExp(`out\\.${publicCol}\\s*=`).test(ifBranchSrc),
      `9C.5c1 public-safe field '${publicCol}' does NOT appear inside the canViewPrivate branch`)
  }
}

// ── Cross-file guards — Phase 9C.5a.5 touches only worker + permissions ─
section('Cross-file guards — kiosk + Employee Management UI untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/utils/crew/crewStore.js',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Employees/tabs/EmployeeRoster.jsx',
  'src/pages/Employees/tabs/EmployeesOverview.jsx',
  'src/pages/Employees/tabs/Certifications.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5a.5'),
    `${path} carries no Phase 9C.5a.5 edits (privacy hardening is server-side only)`)
}

// ── /display-board/board still public ──────────────────────────────────
section('/display-board/board route remains public')

const APP = readFileSync('src/App.jsx', 'utf8')
// The board route must not be wrapped in <RequireAuth>.
assert(/path="\/display-board\/board"/.test(APP) || /path="display-board\/board"/.test(APP),
  '/display-board/board route declared in App.jsx')
// Find the board route declaration and confirm it isn't nested inside a
// RequireAuth wrapper. The print path is gated; board must not be.
const boardRouteIdx = APP.search(/path="(\/?display-board\/board)"/)
const reqAuthIdx    = APP.lastIndexOf('<RequireAuth>', boardRouteIdx)
const reqAuthCloseIdx = APP.lastIndexOf('</RequireAuth>', boardRouteIdx)
// If a <RequireAuth> opener exists before the board route, ensure its
// matching closer also sits between it and the board route (i.e. the
// board route is OUTSIDE the RequireAuth subtree).
assert(reqAuthIdx === -1 || reqAuthCloseIdx > reqAuthIdx,
  '/display-board/board route is NOT wrapped in <RequireAuth> (public kiosk preserved)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
