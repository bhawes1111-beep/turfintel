// Phase E.8 (revision) — Shift Manager + editable shifts smoke.
//
//   node scripts/smoke-shift-template-editing.mjs
//
// The first E.8 commit added an EditShiftModal + a per-shift Edit
// button inside the apply picker. This revision adds:
//
//   • A dedicated "Manage Shifts" toolbar button on the day editor,
//     opening a ShiftManagerModal — a stats-rich table view (Rows /
//     Scheduled / Off-Sick-Vacation / Hours) with Edit / Duplicate /
//     Rename / Delete per shift.
//   • Quick-create A/B/C starters that pre-seed one row per active
//     employee with status 'scheduled' + sensible default times
//     (A 06:00–14:00, B 08:00–16:00, C 06:00–10:00). Starters are
//     no longer empty shells.
//   • An explicit "Empty" badge in the Shift Manager for any shift
//     still at 0 rows.
//   • A per-row apply preview list inside the picker so the
//     supervisor sees exactly which employees will be written.
//
// Safety invariants preserved:
//   • No D1 migration.
//   • All shift writes go through the existing PATCH /api/shift-templates/:id
//     route (gated by canEditAssignments).
//   • Apply still lands in employee_schedule_overrides only.
//   • DAB + kiosk awareness unchanged.
//   • Kiosk still receives no private employee fields (we never
//     surface shift_template_rows to the kiosk).
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

const CAL_CODE = stripComments(CAL)

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger (E.5 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── Manage Shifts button + Shift Manager modal ──────────────────────
section('Manage Shifts — toolbar button + ShiftManagerModal mount')

assert(/<button[^>]*>[\s\S]{0,200}Manage Shifts[\s\S]{0,200}<\/button>/.test(CAL),
  'toolbar exposes a "Manage Shifts" button')
assert(/onClick=\{\(\) => setManagerOpen\(true\)\}[\s\S]{0,200}Manage Shifts/.test(CAL),
  'Manage Shifts button toggles managerOpen state')

assert(/const \[managerOpen, setManagerOpen\] = useState\(false\)/.test(CAL),
  'managerOpen state is wired')
assert(/\{managerOpen && \(\s*<ShiftManagerModal/.test(CAL),
  'ShiftManagerModal mounts when managerOpen is true')

assert(/function ShiftManagerModal\(\{[\s\S]{0,400}\}\)/.test(CAL),
  'ShiftManagerModal component defined')

// Modal title.
assert(/<h3 className=\{styles\.modalTitle\}>Manage Shifts<\/h3>/.test(CAL),
  'ShiftManagerModal title reads "Manage Shifts"')

// Stats columns in the manager table.
assert(/<th>Shift<\/th>[\s\S]{0,400}<th>Rows<\/th>[\s\S]{0,400}<th>Scheduled<\/th>[\s\S]{0,400}<th>Off \/ Sick \/ Vac<\/th>[\s\S]{0,400}<th>Hours<\/th>[\s\S]{0,400}<th>Actions<\/th>/.test(CAL),
  'manager table headings include Shift / Rows / Scheduled / Off-Sick-Vac / Hours / Actions')

// Stats computed via fan-out fetch of each shift's full body.
assert(/Promise\.all\(\s*\n\s*templates\.map\(t =>\s*\n?\s*fetchShiftTemplateById\(t\.id\)/.test(CAL),
  'manager fan-out fetches each template body for stats (Promise.all)')
assert(/summarizeRows\(full\.rows \?\? \[\]\)/.test(CAL),
  'manager summarizes scheduled/off/hours per shift via summarizeRows()')

// Empty badge.
assert(/className=\{styles\.managerEmptyBadge\}>Empty</.test(CAL),
  'empty shifts get an "Empty" badge in the manager')
assert(/\.managerEmptyBadge\s*\{/.test(CSS),
  'CSS .managerEmptyBadge defined')

// Per-shift action buttons. Capture from "function ShiftManagerModal"
// to the next top-level "function " declaration, which always exists
// in this file (multiple modals follow).
const managerMatch = CAL.match(/function ShiftManagerModal\([\s\S]*?(?=\nfunction )/)
const managerSrc   = managerMatch ? managerMatch[0] : ''
assert(managerSrc.length > 0, 'ShiftManagerModal body extracted')
for (const action of ['Edit', 'Duplicate', 'Rename', 'Delete']) {
  assert(new RegExp(`title="${action}[^"]*"[\\s\\S]{0,200}>${action}<`).test(managerSrc),
    `manager has "${action}" action per shift`)
}

// Manager Edit triggers EditShiftModal (closes manager first).
assert(/onEdit=\{\(t\) => \{ setManagerOpen\(false\); setEditShiftId\(t\.id\) \}\}/.test(CAL),
  'manager Edit closes manager + opens EditShiftModal on the chosen shift')

// Manager passes through the existing delete/rename/duplicate handlers.
assert(/onDelete=\{handleDeleteTemplate\}/.test(CAL),
  'manager Delete reuses handleDeleteTemplate (existing handler)')
assert(/onRename=\{handleRenameTemplate\}/.test(CAL),
  'manager Rename reuses handleRenameTemplate (existing handler)')
assert(/onDuplicate=\{handleDuplicateTemplate\}/.test(CAL),
  'manager Duplicate reuses handleDuplicateTemplate (existing handler)')

// CSS classes.
for (const cls of ['managerTable', 'managerShiftMeta', 'managerNumCell', 'managerEmptyBadge']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} defined`)
}

// ── EditShiftModal still exists + editor body unchanged ─────────────
section('Edit Shift modal — row editor + status/time/role/notes')

assert(/function EditShiftModal\(\{ shiftId, activeEmployees, onClose, onSaved \}\)/.test(CAL),
  'EditShiftModal component defined')

// Editor renders one row per active employee.
assert(/const seeded = activeEmployees\.map\(\(emp, i\) => \{/.test(CAL),
  'editor seeds one row per active employee')
assert(/const byEmployee = new Map\(\(t\.rows \?\? \[\]\)\.map\(r => \[r\.employeeId, r\]\)\)/.test(CAL),
  'editor merges existing rows by employeeId so the supervisor sees per-employee state')

// Editor inputs.
const editorBodyMatch = CAL.match(/function EditShiftModal[\s\S]*?\n\}\s*\n/m)
const editorBody     = editorBodyMatch ? editorBodyMatch[0] : ''
assert(editorBody.length > 0, 'EditShiftModal body extracted')
assert(/className=\{styles\.editorStatusSelect\}/.test(editorBody),
  'editor has a status <select> per row')
assert(/type="time"[\s\S]{0,400}value=\{row\.startTime\}/.test(editorBody),
  'editor has <input type="time"> for startTime')
assert(/type="time"[\s\S]{0,400}value=\{row\.endTime\}/.test(editorBody),
  'editor has <input type="time"> for endTime')
assert(/value=\{row\.role\}/.test(editorBody),
  'editor has role input')
assert(/value=\{row\.notes\}/.test(editorBody),
  'editor has notes input')

// Status options.
for (const [v, l] of [
  ['scheduled', 'Scheduled'],
  ['off',       'Off'],
  ['vacation',  'Vacation'],
  ['sick',      'Sick'],
]) {
  assert(new RegExp(`value:\\s*['"]${v}['"],\\s*label:\\s*['"]${l}['"]`).test(CAL),
    `STATUS_OPTS includes { value: '${v}', label: '${l}' }`)
}

// Time inputs disable when status !== 'scheduled'.
assert(/disabled=\{busy \|\| row\.status !== 'scheduled'\}/.test(editorBody),
  'editor disables time inputs when status is not scheduled')

// Save uses patchShiftTemplate (rows-replace, no new endpoint).
assert(/await patchShiftTemplate\(shiftId, \{ rows: payload \}\)/.test(editorBody),
  'editor Save calls patchShiftTemplate(shiftId, { rows: payload }) — updates existing template, not a copy')

// ── Worker — PATCH /api/shift-templates/:id supports rows-replace ───
section('Worker — PATCH route already supports rows-replace (no new endpoint)')

assert(/export async function updateShiftTemplate\(env, id, request\)/.test(SHIFT),
  'worker updateShiftTemplate exported')
assert(/const willReplaceRows = Array\.isArray\(body\.rows\)/.test(SHIFT),
  'worker recognises body.rows[] as a rows-replace')
assert(/DELETE FROM shift_template_rows WHERE template_id = \?/.test(SHIFT),
  'worker wipes existing rows before re-INSERT')
assert(/INSERT INTO shift_template_rows[\s\S]{0,400}id, template_id, employee_id, status,\s*\n\s*start_time, end_time, role, notes, sort_order/.test(SHIFT),
  'worker INSERTs all spec columns (employee_id, status, start_time, end_time, role, notes, sort_order)')

// Existing route mapping (PATCH /:id) — already there.
assert(/method === 'PATCH'[\s\S]{0,200}updateShiftTemplate\(env, id, request\)/.test(IDX),
  'worker routes PATCH /api/shift-templates/:id → updateShiftTemplate (regression couple)')

// Status validation server-side.
assert(/const ALLOWED_STATUS = new Set\(\['scheduled', 'off', 'vacation', 'sick'\]\)/.test(SHIFT),
  'worker validates status against {scheduled, off, vacation, sick}')

// ── Permissions — shift rows save requires canEditAssignments ───────
section('Permissions — shift template writes still require canEditAssignments')

assert(/\['\/api\/shift-templates',\s*'canEditAssignments'\]/.test(PERM),
  "MUTATION_RULES gates /api/shift-templates by canEditAssignments (E.5 invariant)")
assert(matchRule('/api/shift-templates/shift-abc-123') === 'canEditAssignments',
  "matchRule('/api/shift-templates/<id>') === 'canEditAssignments'")

const SUPER = { role: 'superintendent' }
const CREW  = { role: 'crew' }
assert(isMutationAllowed(SUPER, '/api/shift-templates/shift-abc-123', 'PATCH') === true,
  'PATCH /api/shift-templates/:id allowed for superintendent')
assert(isMutationAllowed(CREW, '/api/shift-templates/shift-abc-123', 'PATCH') === false,
  'PATCH /api/shift-templates/:id denied for crew')
assert(isMutationAllowed(SUPER, '/api/shift-templates', 'POST') === true,
  'POST /api/shift-templates allowed for superintendent (Save Shift)')
assert(isMutationAllowed(CREW, '/api/shift-templates', 'POST') === false,
  'POST /api/shift-templates denied for crew')

// ── Kiosk receives no shift_template_rows / private employee fields ─
section('Kiosk privacy — never receives shift_template_rows or private fields')

const KIOSK_CODE = stripComments(KIOSK)
assert(!/shift_template_rows|shiftTemplate|fetchShiftTemplate/.test(KIOSK_CODE),
  'kiosk executable code has no shift template reads (private maintenance data)')
// Phase 9C.5a.5 strip — sanity check the privacy gate is still present.
// Comments are stripped first because some say "no payRate / private
// fields" as a positive marker.
assert(!/payRate|emergencyContact|pesticideLicense/.test(KIOSK_CODE),
  'kiosk executable code carries no private employee field references (privacy regression)')

// ── Starter A/B/C templates are no longer empty 0-row shells ────────
section('Quick-create A/B/C — populated with active employees + default times')

// Defaults table.
assert(/const QUICK_CREATE_DEFAULTS = \[/.test(CAL),
  'QUICK_CREATE_DEFAULTS table defined')
for (const [name, start, end] of [
  ['A Shift', '06:00', '14:00'],
  ['B Shift', '08:00', '16:00'],
  ['C Shift', '06:00', '10:00'],
]) {
  const r = new RegExp(`name:\\s*['"]${name}['"],[\\s\\S]{0,400}startTime:\\s*['"]${start}['"],[\\s\\S]{0,400}endTime:\\s*['"]${end}['"]`)
  assert(r.test(CAL),
    `QUICK_CREATE_DEFAULTS row: ${name} with default ${start}–${end}`)
}

// Quick-create seeds rows from active employees.
const qcMatch = CAL.match(/async function handleQuickCreateDefaults[\s\S]*?\n  \}/)
const qcSrc   = qcMatch ? qcMatch[0] : ''
assert(qcSrc.length > 0, 'handleQuickCreateDefaults body extracted')
assert(/const rows = activeEmployees\.map\(\(emp, i\) => \(/.test(qcSrc),
  'quick-create iterates activeEmployees to seed each starter')
assert(/status:\s*['"]scheduled['"]/.test(qcSrc),
  'quick-create seeds each row with status: scheduled')
assert(/startTime:\s*def\.startTime/.test(qcSrc),
  'quick-create seeds each row with default startTime from QUICK_CREATE_DEFAULTS')
assert(/endTime:\s*def\.endTime/.test(qcSrc),
  'quick-create seeds each row with default endTime from QUICK_CREATE_DEFAULTS')
assert(/role:\s*emp\.role \?\? null/.test(qcSrc),
  'quick-create carries role from the employee record into the seeded row')

// Negative pin: starters NOT created with `rows: []`.
assert(!/createShiftTemplate\(\{\s*name:\s*def\.name,\s*label:\s*def\.label,\s*rows:\s*\[\]\s*\}\)/.test(qcSrc),
  'quick-create does NOT create starters with rows: [] anymore')

// Toast tells the supervisor how many employees got pre-loaded.
assert(/\$\{activeEmployees\.length\} employees pre-loaded/.test(qcSrc),
  'quick-create toast surfaces "<N> employees pre-loaded"')

// Manager banner explains starters are pre-loaded.
assert(/Each starter is pre-loaded with every active employee at default times/.test(CAL),
  'manager banner explains the pre-load behavior')

// ── Empty template guard (residual safety) ──────────────────────────
section('Empty template guard — Apply still blocked even after the seeding change')

// canApply still requires !isEmpty.
assert(/const canApply\s*=\s*!!activeId && !busy && !isEmpty && !loadingPreview/.test(CAL),
  'canApply still requires !isEmpty (Apply blocked on 0-row shifts)')
assert(/No employees yet — edit this shift before applying\./.test(CAL),
  'preview pane still shows the "No employees yet — edit this shift before applying" banner')
assert(/\.emptyShiftBanner\s*\{/.test(CSS),
  'CSS .emptyShiftBanner still defined')

// ── Apply Shift preview — row list visible ──────────────────────────
section('Apply Shift preview — per-employee row list visible')

assert(/<details className=\{styles\.previewRowsBlock\}>/.test(CAL),
  'preview pane includes a collapsible "Rows that will be applied" block')
assert(/Rows that will be applied \(\{activeRows\.length\}\)/.test(CAL),
  'preview row block summary surfaces the rowCount')
assert(/className=\{styles\.previewRowName\}/.test(CAL),
  'preview row list renders employee name per row')
assert(/className=\{styles\.previewRowStatus\}/.test(CAL),
  'preview row list renders status per row')
assert(/className=\{styles\.previewRowTimes\}/.test(CAL),
  'preview row list renders times per row')

// Replace checkbox is still surfaced when destination has overrides
// (this is the existing "before applying" preview affordance).
assert(/destHasOverrides && !isEmpty/.test(CAL),
  'replace warning surfaces in-UI when destination already has overrides and shift is populated')

// CSS classes.
for (const cls of ['previewRowsBlock', 'previewRowsList', 'previewRowName', 'previewRowStatus', 'previewRowTimes']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} defined`)
}

// ── Save current day as shift — collision handling unchanged ────────
section('Save current day as shift — collision dialog asks update-or-cancel')

const saveMatch = CAL.match(/async function handleSaveAsTemplate\(name\)[\s\S]*?\n  \}/)
const saveSrc   = saveMatch ? saveMatch[0] : ''
assert(saveSrc.length > 0, 'handleSaveAsTemplate body extracted')

// Pre-check.
assert(/const existing = shiftTemplates\.find\(t => t\.name\.toLowerCase\(\) === trimmed\.toLowerCase\(\)\)/.test(saveSrc),
  'save-as pre-checks for an existing shift by name (case-insensitive)')
// Confirm dialog.
assert(/A shift named "\$\{existing\.name\}" already exists/.test(saveSrc),
  'save-as collision dialog mentions the existing shift name + row count')
assert(/OK = update existing shift/.test(saveSrc),
  'save-as collision dialog spells out OK = update existing shift')
// Update branch.
assert(/mode === 'update'[\s\S]{0,400}patchShiftTemplate\(targetId, \{ rows \}\)/.test(saveSrc),
  'save-as update branch calls patchShiftTemplate(existing.id, { rows })')
// Create branch.
assert(/createShiftTemplate\(\{ name: trimmed, rows \}\)/.test(saveSrc),
  'save-as create branch still uses createShiftTemplate({ name, rows })')

// Save includes status + start + end + role + notes per row.
assert(/employeeId:\s*r\.employeeId,\s*\n\s*status:\s*r\.status,\s*\n\s*startTime:\s*r\.startTime,\s*\n\s*endTime:\s*r\.endTime,\s*\n\s*role:\s*r\.role,\s*\n\s*notes:\s*r\.notes/.test(saveSrc),
  'save-as serialises status + startTime + endTime + role + notes per row')

// ── Applied templates write to employee_schedule_overrides only ─────
section('Apply Shift — still writes to employee_schedule_overrides only')

assert(/INSERT INTO employee_schedule_overrides/.test(SHIFT),
  'applyShiftTemplate INSERTs into employee_schedule_overrides (positive regression)')
assert(!/INSERT INTO employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT INSERT into employee_schedules (negative regression)')
assert(!/UPDATE employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT UPDATE employee_schedules (negative regression)')
assert(!/DELETE FROM employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT DELETE from employee_schedules (negative regression)')

// Manager modal source does not touch any schedule mutators.
const managerCode = stripComments(managerSrc)
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(managerCode),
  'ShiftManagerModal does NOT touch override mutators')
assert(!/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(managerCode),
  'ShiftManagerModal does NOT touch recurring-grid mutators')

// ── Weekly Schedule Editor unchanged ────────────────────────────────
section('Weekly Schedule Editor — unchanged')

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

// Worker route + schedules untouched (no new endpoints).
for (const path of [
  'worker/api/schedules.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.8'),
    `${path} carries no Phase E.8 edits`)
}
assert(!SCHEDS.includes('Phase E.8'),
  'worker/api/schedules.js carries no Phase E.8 edits (no override-path changes)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
