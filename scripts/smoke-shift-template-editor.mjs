// Phase E.8 — Editable shift templates smoke.
//
//   node scripts/smoke-shift-template-editor.mjs
//
// Phase E.5 shipped shift templates but the only way to populate one
// was via "Save current day as a template" — there was no UI to edit
// the rows of an existing template. A/B/C starters were created as
// empty shells with zero rows and applying them silently no-op'd.
//
// Phase E.8 closes that hole CLIENT-SIDE only:
//   • New EditShiftModal — one row per active employee, status /
//     start / end / role / notes. Save → patchShiftTemplate({ rows }).
//     The worker's existing PATCH /api/shift-templates/:id route
//     already supports rows-replace semantics; no new endpoint added.
//   • Picker tile gains an Edit button (alongside Rename / Duplicate /
//     Delete).
//   • Quick-create A/B/C auto-opens Edit on the first new shell so
//     the supervisor lands in the populate step.
//   • Apply is BLOCKED on 0-row shifts — disabled button + a clear
//     "No employees yet — edit this shift before applying" banner.
//   • Save-as-shift name collisions explicitly ask "update existing
//     or cancel" instead of silently returning the UNIQUE-collided
//     row from the worker.
//   • UI language pass — every user-facing label says "Shift", not
//     "Template". The internal code keeps "Template" so the existing
//     store + worker file names don't need to churn.
//
// Safety invariants:
//   • No D1 migration.
//   • Edits stay inside shift_template_rows. They do NOT touch
//     employee_schedule_overrides or employee_schedules.
//   • Apply still writes only to employee_schedule_overrides.
//   • DAB + kiosk awareness unchanged.
//   • No spray edits.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
} from '../worker/lib/mutationPermissions.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

// Strip line + block comments so prose mentioning a token doesn't
// pollute negative pins.
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const CAL    = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx',         'utf8')
const CSS    = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.module.css', 'utf8')
const STORE  = readFileSync('src/utils/schedules/shiftTemplatesStore.js',                  'utf8')
const SHIFT  = readFileSync('worker/api/shiftTemplates.js',                                'utf8')
const SCHEDS = readFileSync('worker/api/schedules.js',                                     'utf8')
const IDX    = readFileSync('worker/index.js',                                             'utf8')
const PERM   = readFileSync('worker/lib/mutationPermissions.js',                           'utf8')
const WEEKLY = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx',           'utf8')
const DAILY  = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx',            'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',                'utf8')
const KIOSK  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',                     'utf8')

const CAL_CODE  = stripComments(CAL)

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger (Phase E.5 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── EditShiftModal component + Edit button ──────────────────────────
section('EditShiftModal — component + Edit button wiring')

assert(/function EditShiftModal\(\{ shiftId, activeEmployees, onClose, onSaved \}\)/.test(CAL),
  'EditShiftModal component defined with (shiftId, activeEmployees, onClose, onSaved)')

// Modal mounts behind editShiftId state.
assert(/const \[editShiftId, setEditShiftId\] = useState\(null\)/.test(CAL),
  'editShiftId state is wired')
assert(/\{editShiftId && \(\s*<EditShiftModal/.test(CAL),
  'EditShiftModal mounts when editShiftId is truthy')

// Edit button in the picker — passed as onEdit, fired per shift row.
assert(/onEdit=\{handleEditShift\}/.test(CAL),
  'TemplatePickerModal receives onEdit={handleEditShift}')
assert(/onEdit\(t\)/.test(CAL),
  'picker Edit button calls onEdit(t)')
assert(/title="Edit shift rows">Edit/.test(CAL),
  'picker has a per-shift "Edit" button')

// Edit entrypoint closes the picker AND sets editShiftId.
assert(/function handleEditShift\(t\)\s*\{[\s\S]{0,200}setTemplatePickerOpen\(false\)[\s\S]{0,200}setEditShiftId\(t\.id\)/.test(CAL),
  'handleEditShift closes picker + opens EditShiftModal on the chosen shift')

// ── Editor renders one row per active employee ───────────────────────
section('Editor renders rows for active employees with the required inputs')

// Pulls the full shift (header + rows) once via fetchShiftTemplateById.
assert(/fetchShiftTemplateById\(shiftId\)/.test(CAL),
  'EditShiftModal loads the full shift via fetchShiftTemplateById(shiftId)')

// Seeds an editable row for every active employee, merging existing
// rows in by employeeId.
assert(/const seeded = activeEmployees\.map\(\(emp, i\) => \{/.test(CAL),
  'seed loop iterates activeEmployees (one editable row per active employee)')
assert(/const byEmployee = new Map\(\(t\.rows \?\? \[\]\)\.map\(r => \[r\.employeeId, r\]\)\)/.test(CAL),
  'existing rows merged in by employeeId (Map-lookup pattern)')

// Status select with all four values.
const STATUS_VALUES = [
  ['scheduled', 'Scheduled'],
  ['off',       'Off'],
  ['vacation',  'Vacation'],
  ['sick',      'Sick'],
]
for (const [value, label] of STATUS_VALUES) {
  assert(new RegExp(`value:\\s*['"]${value}['"],\\s*label:\\s*['"]${label}['"]`).test(CAL),
    `STATUS_OPTS includes { value: '${value}', label: '${label}' } (used by Edit Shift)`)
}

// Per-row controls — status select + time inputs + role + notes.
const editorBodyMatch = CAL.match(/function EditShiftModal[\s\S]*?\n\}\s*$/m)
const editorBody     = editorBodyMatch ? editorBodyMatch[0] : ''
assert(editorBody.length > 0, 'EditShiftModal body extracted')
assert(/className=\{styles\.editorStatusSelect\}/.test(editorBody),
  'EditShiftModal renders <select> per row (editorStatusSelect)')
assert(/type="time"[\s\S]{0,400}value=\{row\.startTime\}/.test(editorBody),
  'EditShiftModal has <input type="time"> for start time, bound to row.startTime')
assert(/type="time"[\s\S]{0,400}value=\{row\.endTime\}/.test(editorBody),
  'EditShiftModal has <input type="time"> for end time, bound to row.endTime')
assert(/value=\{row\.role\}/.test(editorBody),
  'EditShiftModal has role input bound to row.role')
assert(/value=\{row\.notes\}/.test(editorBody),
  'EditShiftModal has notes input bound to row.notes')

// Disables time inputs when status !== 'scheduled' (off rows don't carry hours).
assert(/disabled=\{busy \|\| row\.status !== 'scheduled'\}/.test(editorBody),
  'time inputs disable when status is not scheduled')

// Headings — confirms the required label set is in the table head.
assert(/<th>Operator<\/th>[\s\S]{0,400}<th>Status<\/th>[\s\S]{0,400}<th>Start<\/th>[\s\S]{0,400}<th>End<\/th>[\s\S]{0,400}<th>Role<\/th>[\s\S]{0,400}<th>Notes<\/th>/.test(editorBody),
  'EditShiftModal table headings include Operator / Status / Start / End / Role / Notes')

// ── Save path — patchShiftTemplate({ rows }) ─────────────────────────
section('Save path — patchShiftTemplate({ rows }) replaces shift rows')

assert(/await patchShiftTemplate\(shiftId, \{ rows: payload \}\)/.test(editorBody),
  'EditShiftModal save calls patchShiftTemplate(shiftId, { rows })')

// Store helper still exists + still uses the existing PATCH endpoint.
assert(/export\s+async\s+function\s+patchShiftTemplate\b/.test(STORE),
  'store still exports patchShiftTemplate')
assert(/fetchJSON\(`\$\{API\}\/\$\{encodeURIComponent\(id\)\}`,\s*\{\s*\n\s*method:\s*'PATCH'/.test(STORE),
  'patchShiftTemplate PATCHes /api/shift-templates/:id (no new endpoint added)')
assert(/mutationHeaders\(\)/.test(STORE),
  'store still attaches mutationHeaders() to PATCH (auth preserved)')

// Worker side: updateShiftTemplate still supports rows-replace.
assert(/export async function updateShiftTemplate\(env, id, request\)/.test(SHIFT),
  'worker updateShiftTemplate exported')
assert(/const willReplaceRows = Array\.isArray\(body\.rows\)/.test(SHIFT),
  'worker reads body.rows[] and treats it as a rows-replace')
assert(/DELETE FROM shift_template_rows WHERE template_id = \?/.test(SHIFT),
  'worker DELETEs existing rows before re-INSERT (replace semantics)')
assert(/INSERT INTO shift_template_rows[\s\S]{0,400}id, template_id, employee_id, status/.test(SHIFT),
  'worker INSERTs new rows with the full column set')

// Status validation in the worker.
assert(/const ALLOWED_STATUS = new Set\(\['scheduled', 'off', 'vacation', 'sick'\]\)/.test(SHIFT),
  'worker validates status against {scheduled, off, vacation, sick}')

// Employee-belongs-to-course validation is on the APPLY path (so
// stored shift rows can reference any employee at edit time, and the
// applier filters them at apply time). Pin that here.
assert(/SELECT id FROM crew_employees WHERE course_id = \?/.test(SHIFT),
  'applyShiftTemplate validates employee belongs to course at apply time')
assert(/if \(!validEmpIds\.has\(r\.employee_id\)\) \{ skipped \+= 1; continue \}/.test(SHIFT),
  'applyShiftTemplate skips rows for employees outside the course')

// ── Permissions — shift template writes still gated ─────────────────
section('Permissions — shift rows save requires canEditAssignments')

assert(/\['\/api\/shift-templates',\s*'canEditAssignments'\]/.test(PERM),
  "MUTATION_RULES gates /api/shift-templates by canEditAssignments (E.5 preserved)")
assert(matchRule('/api/shift-templates/shift-abc-123') === 'canEditAssignments',
  "matchRule('/api/shift-templates/<id>') === 'canEditAssignments'")

const SUPER = { role: 'superintendent' }
const CREW  = { role: 'crew' }
assert(isMutationAllowed(SUPER, '/api/shift-templates/shift-abc-123', 'PATCH') === true,
  'PATCH /api/shift-templates/:id allowed for superintendent (Edit Shift Save)')
assert(isMutationAllowed(CREW, '/api/shift-templates/shift-abc-123', 'PATCH') === false,
  'PATCH /api/shift-templates/:id denied for crew (Edit Shift Save blocked)')

// Worker route table still wires PATCH to updateShiftTemplate.
assert(/method === 'PATCH'[\s\S]{0,200}updateShiftTemplate\(env, id, request\)/.test(IDX),
  'worker route table sends PATCH /api/shift-templates/:id to updateShiftTemplate')

// ── 0-row apply guard ────────────────────────────────────────────────
section('Apply guard — 0-row shifts cannot be silently applied')

// canApply derives from isEmpty.
assert(/const isEmpty\s*=\s*!!activeTemplate && !loadingPreview && activeRowCount === 0/.test(CAL),
  'picker computes isEmpty from active template + activeRowCount === 0')
assert(/const canApply\s*=\s*!!activeId && !busy && !isEmpty && !loadingPreview/.test(CAL),
  'canApply requires !isEmpty (Apply blocked on 0-row shifts)')

// Banner copy + Edit-Shift CTA inside the preview pane.
assert(/No employees yet — edit this shift before applying\./.test(CAL),
  'preview pane shows "No employees yet — edit this shift before applying."')
assert(/onClick=\{\(\) => onEdit\(activeTemplate\)\}[\s\S]{0,200}Edit Shift/.test(CAL),
  'empty-shift banner routes the supervisor straight to Edit Shift')

// CSS class for the banner.
assert(/\.emptyShiftBanner\s*\{/.test(CSS),
  'CSS .emptyShiftBanner defined (amber warning style)')

// data-empty="true" set on picker tiles with rowCount === 0 so the
// list itself flags which shifts need editing.
assert(/data-empty=\{\(t\.rowCount \?\? 0\) === 0 \? 'true' : undefined\}/.test(CAL),
  'picker tile carries data-empty="true" when rowCount === 0')
assert(/\(t\.rowCount \?\? 0\) === 0 \? ' · needs editing' : ''/.test(CAL),
  'picker tile suffix reads "<N> rows · needs editing" when empty')
assert(/\.templateRow\[data-empty="true"\] \.templateRowCount\s*\{/.test(CSS),
  'CSS highlights .templateRowCount inside an empty-shift tile')

// ── Quick-create A/B/C is not silently useless ──────────────────────
section('Quick-create A/B/C — pre-seeded with active employees + default times')

const qcMatch = CAL.match(/async function handleQuickCreateDefaults[\s\S]*?\n  \}/)
const qcSrc   = qcMatch ? qcMatch[0] : ''
assert(qcSrc.length > 0, 'handleQuickCreateDefaults body extracted')

// Phase E.8 revision — starters pre-seed rows from active employees so
// the very first apply produces real schedule rows (no 0-row no-op).
assert(/const rows = activeEmployees\.map\(\(emp, i\) =>/.test(qcSrc),
  'quick-create seeds rows from activeEmployees (one row per active employee)')
assert(/status:\s*['"]scheduled['"]/.test(qcSrc),
  'quick-create seeds each row with status: scheduled (default)')
assert(/startTime:\s*def\.startTime/.test(qcSrc),
  'quick-create seeds each row with the default startTime from QUICK_CREATE_DEFAULTS')
assert(/endTime:\s*def\.endTime/.test(qcSrc),
  'quick-create seeds each row with the default endTime from QUICK_CREATE_DEFAULTS')

// Defaults carry sensible start/end times so applying immediately
// produces visible schedule rows.
for (const [name, start, end] of [
  ['A Shift', '06:00', '14:00'],
  ['B Shift', '08:00', '16:00'],
  ['C Shift', '06:00', '10:00'],
]) {
  const r = new RegExp(`name:\\s*['"]${name}['"],[\\s\\S]{0,400}startTime:\\s*['"]${start}['"],[\\s\\S]{0,400}endTime:\\s*['"]${end}['"]`)
  assert(r.test(CAL), `QUICK_CREATE_DEFAULTS includes ${name} with default ${start}–${end}`)
}

// Banner copy clarifies what happens next.
assert(/Each starter is pre-loaded with every active employee at default times/.test(CAL),
  'Shift Manager banner explains starters are pre-loaded with active employees')

// ── Save as Shift — name collision is explicit ──────────────────────
section('Save as Shift — name collision asks "update existing or cancel"')

const saveMatch = CAL.match(/async function handleSaveAsTemplate\(name\)[\s\S]*?\n  \}/)
const saveSrc   = saveMatch ? saveMatch[0] : ''
assert(saveSrc.length > 0, 'handleSaveAsTemplate body extracted')

// Pre-check: look for an existing shift by name (case-insensitive).
assert(/const existing = shiftTemplates\.find\(t => t\.name\.toLowerCase\(\) === trimmed\.toLowerCase\(\)\)/.test(saveSrc),
  'save-as pre-checks for an existing shift by name (case-insensitive)')

// On collision: confirm dialog with explicit semantics.
assert(/A shift named "\$\{existing\.name\}" already exists/.test(saveSrc),
  'save-as collision dialog mentions the existing shift name + row count')
assert(/OK = update existing shift/.test(saveSrc),
  'save-as collision dialog spells out OK = update existing shift')
assert(/Cancel = keep it and don't save/.test(saveSrc),
  'save-as collision dialog spells out Cancel = keep it')

// Update branch uses patchShiftTemplate (rows-replace on the existing shift).
assert(/mode === 'update'[\s\S]{0,400}patchShiftTemplate\(targetId, \{ rows \}\)/.test(saveSrc),
  'save-as update branch calls patchShiftTemplate(existing.id, { rows })')
// Create branch unchanged.
assert(/createShiftTemplate\(\{ name: trimmed, rows \}\)/.test(saveSrc),
  'save-as create branch still calls createShiftTemplate({ name, rows })')

// ── Apply Shift still writes to overrides only (regression couple) ──
section('Apply Shift — still writes to employee_schedule_overrides only')

assert(/INSERT INTO employee_schedule_overrides/.test(SHIFT),
  'applyShiftTemplate INSERTs into employee_schedule_overrides (regression)')
assert(!/INSERT INTO employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT INSERT into employee_schedules (regression)')
assert(!/UPDATE employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT UPDATE employee_schedules (regression)')
assert(!/DELETE FROM employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT DELETE from employee_schedules (regression)')

// Shift row edits don't touch overrides or recurring grid.
const updateMatch = SHIFT.match(/export async function updateShiftTemplate\(env, id, request\)\s*\{[\s\S]*?(?=^export )/m)
const updateSrc   = updateMatch ? updateMatch[0] : ''
assert(updateSrc.length > 0, 'updateShiftTemplate body extracted')
assert(!/employee_schedule_overrides|employee_schedules\b/.test(updateSrc),
  'updateShiftTemplate does NOT touch employee_schedule_overrides OR employee_schedules')

// ── Client side: EditShiftModal does not touch overrides ────────────
section('EditShiftModal — does not touch overrides or recurring grid')

const editorCode = stripComments(editorBody)
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(editorCode),
  'EditShiftModal does NOT call any schedule-override mutator')
assert(!/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(editorCode),
  'EditShiftModal does NOT call any recurring-schedule mutator')

// ── Weekly Schedule Editor untouched ────────────────────────────────
section('Weekly Schedule Editor — still recurring-only, no E.8 edits')

assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still mutates the recurring grid')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still does NOT touch overrides')
assert(!WEEKLY.includes('Phase E.8'),
  'WeeklyScheduleEditor carries no Phase E.8 edits')
assert(!DAILY.includes('Phase E.8'),
  'DailyScheduleEditor carries no Phase E.8 edits')

// ── DAB + kiosk awareness preserved ─────────────────────────────────
section('DAB + kiosk schedule awareness preserved (E.4 regression couple)')

assert(/isEmployeeAssignableForDate/.test(DAB),
  'DAB still uses isEmployeeAssignableForDate (E.4 invariant)')
assert(/hasAnyScheduleData/.test(KIOSK),
  'kiosk still uses hasAnyScheduleData (E.4 invariant)')
assert(!DAB.includes('Phase E.8'),
  'DAB carries no Phase E.8 edits')
assert(!KIOSK.includes('Phase E.8'),
  'kiosk carries no Phase E.8 edits')

// ── No spray edits ──────────────────────────────────────────────────
section('Scope guards — no spray edits')

for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.8'),
    `${path} carries no Phase E.8 edits`)
}

// Worker route table + worker/api/schedules untouched (we used the
// existing PATCH route for row saves).
for (const path of [
  'worker/api/schedules.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.8'),
    `${path} carries no Phase E.8 edits`)
}
// schedules.js untouched ⇒ no new override writes from this phase.
assert(!SCHEDS.includes('Phase E.8'),
  'worker/api/schedules.js carries no Phase E.8 edits')

// ── UI language pass — Shift > Template in user-facing strings ──────
section('UI language — "Shift" in user-facing strings')

assert(/<h3 className=\{styles\.modalTitle\}>Apply Shift to/.test(CAL),
  'picker modal title reads "Apply Shift to <date>" (E.8 rename)')
assert(/<h3 className=\{styles\.modalTitle\}>Save \{date\} as Shift</.test(CAL),
  'save-as modal title reads "Save <date> as Shift" (E.8 rename)')
assert(/Save Shift/.test(CAL),
  'Save button reads "Save Shift" (E.8 rename)')
// Code-level identifiers preserved (no churn).
assert(/createShiftTemplate|patchShiftTemplate|fetchShiftTemplateById|deleteShiftTemplate|applyShiftTemplate/.test(CAL),
  'internal code keeps the "shiftTemplate" identifier set (no churn)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
