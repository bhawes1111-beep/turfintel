// Phase E.6 — Annual Schedule Calendar usability polish smoke.
//
//   node scripts/smoke-annual-schedule-usability.mjs
//
// Phase E.5 shipped the calendar + shift templates. Phase E.6 polishes
// the workflow without changing the schedule model:
//
//   • Calendar tile scan: scheduled count + total hours surfaced
//     prominently, off count kept secondary. Day tile still draggable.
//   • Jump-to-date input alongside prev/next month + Today.
//   • Drag SOURCE highlight (cyan) distinguishable from drag TARGET
//     highlight (amber) so the supervisor can see both at once.
//   • Same-day drag is silently ignored (no toast, no confirm).
//   • Quick-create A/B/C starter templates from the picker when the
//     course has none yet.
//   • Rename + duplicate template controls inline in the picker.
//   • Delete confirm copy is more descriptive (row count + warning
//     that the action cannot be undone).
//   • Template preview panel shows scheduled / off / total-hours
//     counts BEFORE Apply fires.
//   • Replace warning is an in-UI checkbox in the preview pane (no
//     extra browser confirm before each apply click).
//   • Day editor quick actions: Mark all Scheduled / Mark all Off /
//     Clear day overrides. All writes target overrides only.
//   • Mobile layout adjustments (picker collapses to one column).
//
// Safety invariants preserved:
//   • Recurring weekly grid (employee_schedules) NEVER mutated.
//   • Daily overrides are the only write target.
//   • E.4 DAB + kiosk awareness untouched.
//   • E.5 shift-template tables untouched (no D1 migration).
//   • Spray code untouched.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const CAL    = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx',         'utf8')
const CSS    = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.module.css', 'utf8')
const STORE  = readFileSync('src/utils/schedules/shiftTemplatesStore.js',                  'utf8')
const SHIFT  = readFileSync('worker/api/shiftTemplates.js',                                'utf8')
const SCHEDS = readFileSync('worker/api/schedules.js',                                     'utf8')
const WEEKLY = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx',           'utf8')
const DAILY  = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx',            'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',                'utf8')
const KIOSK  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',                     'utf8')

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger (Phase E.5 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── AnnualScheduleCalendar still exists ──────────────────────────────
section('AnnualScheduleCalendar still mounted + base wiring intact')

assert(/export default function AnnualScheduleCalendar/.test(CAL),
  'AnnualScheduleCalendar default export present')

const TAB = readFileSync('src/pages/Employees/tabs/EmployeeScheduleTab.jsx', 'utf8')
assert(/<AnnualScheduleCalendar/.test(TAB),
  'Schedule tab still mounts <AnnualScheduleCalendar />')

// ── Calendar density (tile scan) ─────────────────────────────────────
section('Calendar tile scan — scheduledCount + totalHours primary, offCount secondary')

// Phase E.7 — Tile pill labels changed from bare numbers to readable
// strings ("7 working" / "52 hrs" / "2 out"). Pin the new shape.
assert(/summary\.scheduledCount > 0[\s\S]{0,200}\{summary\.scheduledCount\} working/.test(CAL),
  'scheduled count pill renders when > 0 ("<N> working", primary)')
assert(/summary\.totalHours > 0[\s\S]{0,200}\{summary\.totalHours\} hrs/.test(CAL),
  'total hours pill renders when > 0 ("<N> hrs", primary)')
assert(/summary\.offCount > 0[\s\S]{0,200}\{summary\.offCount\} out/.test(CAL),
  'off count pill renders when > 0 ("<N> out", kept secondary)')

// Render order: scheduled first, then hours, then off — proves "off
// kept secondary" structurally.
const summaryMatch = CAL.match(/<div className=\{styles\.daySummary\}>[\s\S]{0,800}<\/div>/)
const summarySrc = summaryMatch ? summaryMatch[0] : ''
assert(summarySrc.length > 0, 'day summary block extracted')
const schedIdx = summarySrc.indexOf('dayCountScheduled')
const hoursIdx = summarySrc.indexOf('dayHours')
const offIdx   = summarySrc.indexOf('dayCountOff')
assert(schedIdx >= 0 && hoursIdx >= 0 && offIdx >= 0
       && schedIdx < hoursIdx && hoursIdx < offIdx,
  'day summary render order: scheduledCount → totalHours → offCount (off kept secondary)')

// ── Navigation — jump-to-date present ────────────────────────────────
section('Navigation — prev/next + Today + jump-to-date')

// Existing nav preserved.
assert(/aria-label="Previous month"/.test(CAL),  'Previous-month button preserved')
assert(/aria-label="Next month"/.test(CAL),       'Next-month button preserved')
assert(/styles\.todayBtn[\s\S]{0,200}Today</.test(CAL), 'Today button preserved (label "Today")')

// Phase E.6 — jump-to-date input.
assert(/type="date"[\s\S]{0,400}aria-label="Jump to date"/.test(CAL),
  'jump-to-date input present (aria-label="Jump to date")')
assert(/className=\{styles\.jumpToDate\}/.test(CAL),
  'jump-to-date wrapper uses styles.jumpToDate')
assert(/setSelectedDate\(next\)[\s\S]{0,200}setCurrentMonth\(next\.slice\(0, 7\)\)/.test(CAL),
  'jump-to-date snaps both currentMonth AND selectedDate to the picked date')

// CSS class defined.
assert(/\.jumpToDate\s*\{/.test(CSS),
  'styles.jumpToDate defined')

// ── Quick-create A/B/C defaults ──────────────────────────────────────
section('Shift template quick-create — A / B / C defaults')

assert(/const QUICK_CREATE_DEFAULTS\s*=\s*\[/.test(CAL),
  'QUICK_CREATE_DEFAULTS constant defined')
for (const name of ['A Shift', 'B Shift', 'C Shift']) {
  assert(new RegExp(`name:\\s*['"]${name}['"]`).test(CAL),
    `QUICK_CREATE_DEFAULTS includes "${name}"`)
}
assert(/async function handleQuickCreateDefaults/.test(CAL),
  'handleQuickCreateDefaults helper present')
// Quick-create uses the existing createShiftTemplate store helper.
assert(/await createShiftTemplate\(\{ name: def\.name, label: def\.label, rows: \[\] \}\)/.test(CAL),
  'handleQuickCreateDefaults creates each default via createShiftTemplate (rows: [])')

// Quick-create button + banner copy live in the template picker.
assert(/Create A \/ B \/ C starter templates/.test(CAL),
  'template picker shows "Create A / B / C starter templates" button')
assert(/\.quickCreateBanner\s*\{/.test(CSS),
  'CSS .quickCreateBanner defined')

// ── Rename + duplicate ───────────────────────────────────────────────
section('Shift template management — rename + duplicate')

assert(/async function handleRenameTemplate/.test(CAL),
  'handleRenameTemplate present')
assert(/await patchShiftTemplate\(t\.id, \{ name: trimmed \}\)/.test(CAL),
  'rename PATCHes /api/shift-templates/:id with { name }')

assert(/async function handleDuplicateTemplate/.test(CAL),
  'handleDuplicateTemplate present')
assert(/await duplicateShiftTemplate\(t\.id, trimmed\)/.test(CAL),
  'duplicate delegates to duplicateShiftTemplate store helper')

// Store exports the new duplicate helper.
assert(/export\s+async\s+function\s+duplicateShiftTemplate\b/.test(STORE),
  'shiftTemplatesStore exports duplicateShiftTemplate')
assert(/const full = await fetchShiftTemplateById\(id\)/.test(STORE),
  'duplicateShiftTemplate fetches the full template (header + rows) first')
assert(/return createShiftTemplate\(\{[\s\S]{0,400}rows:\s*\(full\.rows \?\? \[\]\)\.map/.test(STORE),
  'duplicateShiftTemplate POSTs a fresh copy with mapped rows')

// Inline rename + duplicate buttons in the picker.
assert(/onRename\(t\)/.test(CAL),  'picker wires Rename button (onRename per template)')
assert(/onDuplicate\(t\)/.test(CAL),'picker wires Duplicate button (onDuplicate per template)')

// Smaller inline button class used.
assert(/\.actionBtnSmall\s*\{/.test(CSS),
  'CSS .actionBtnSmall defined (smaller inline buttons)')

// ── Delete confirmation copy ─────────────────────────────────────────
section('Shift template — delete confirmation surfaces row count + permanence')

const delMatch = CAL.match(/async function handleDeleteTemplate[\s\S]*?\n  \}/)
const delSrc   = delMatch ? delMatch[0] : ''
assert(delSrc.length > 0, 'handleDeleteTemplate body extracted')
assert(/Delete shift template/.test(delSrc),
  'delete confirm copy uses "Delete shift template …"')
assert(/\$\{t\.rowCount \?\? 0\} rows/.test(delSrc),
  'delete confirm names the row count')
assert(/Past applications of this template stay in place/.test(delSrc),
  'delete confirm clarifies past applications are not affected')
assert(/cannot be undone/.test(delSrc),
  'delete confirm warns "cannot be undone"')
// Row count rendered in the picker tile too.
assert(/\{t\.rowCount \?\? 0\} rows/.test(CAL),
  'picker tile shows "<N> rows" for each template')

// ── Apply template preview ───────────────────────────────────────────
section('Apply template — in-UI preview with counts + hours')

assert(/function TemplatePickerModal\(/.test(CAL),
  'TemplatePickerModal component extracted')

// Preview pane renders the three preview stats.
assert(/<dt>Scheduled<\/dt>[\s\S]{0,200}\{preview\.scheduled\}/.test(CAL),
  'preview pane shows scheduled count')
assert(/<dt>Off \/ Sick \/ Vacation<\/dt>[\s\S]{0,200}\{preview\.off\}/.test(CAL),
  'preview pane shows off/sick/vacation count')
assert(/<dt>Total hours<\/dt>[\s\S]{0,200}\{preview\.totalHours\}h/.test(CAL),
  'preview pane shows total hours')

// Preview derives via summarizeRows (synchronous + pure).
assert(/function summarizeRows\(rows\)/.test(CAL),
  'summarizeRows helper present')
assert(/const preview = useMemo\(\(\) => summarizeRows\(activeRows \?\? \[\]\), \[activeRows\]\)/.test(CAL),
  'preview is a useMemo over the active template rows')

// Rows lazy-fetched when a tile is selected (list view only carries
// rowCount; full rows[] live behind GET /:id).
assert(/fetchShiftTemplateById\(activeId\)/.test(CAL),
  'picker lazy-fetches the full template via fetchShiftTemplateById(activeId)')

// Selected template tile gets data-active.
assert(/data-active=\{t\.id === activeId \? 'true' : undefined\}/.test(CAL),
  'selected template tile carries data-active="true"')
assert(/\.templateRow\[data-active="true"\]\s*\{/.test(CSS),
  'CSS .templateRow[data-active="true"] highlight defined')

// CSS preview-pane classes.
for (const cls of ['previewPane', 'previewStats', 'previewActions', 'previewEmpty', 'previewTitle']) {
  assert(new RegExp(`\\.${cls}\\s*[{,]`).test(CSS),
    `CSS .${cls} defined`)
}

// ── Apply template — in-UI replace warning ───────────────────────────
section('Apply template — replace warning surfaces in-UI (not browser confirm only)')

assert(/destHasOverrides[\s\S]{0,1200}\{selectedDate\} already has overrides/.test(CAL),
  'preview pane displays an in-UI warning when destination already has overrides')
assert(/className=\{styles\.replaceCheckbox\}[\s\S]{0,400}type="checkbox"[\s\S]{0,200}checked=\{replace\}/.test(CAL),
  'Replace overrides is a controlled checkbox inside the preview pane')
assert(/\.replaceCheckbox\s*\{/.test(CSS),
  'CSS .replaceCheckbox defined (amber warning style)')

// Apply button is wired with the in-UI replace state.
assert(/onClick=\{\(\) => onApply\(activeId, replace\)\}/.test(CAL),
  'Apply button fires onApply(activeId, replace) — replace value is the in-UI toggle')

// handleApplyTemplate accepts the new (templateId, replaceConfirmed)
// signature and does NOT fire its own browser confirm() (in-UI flow).
const applyMatch = CAL.match(/async function handleApplyTemplate\(templateId, replaceConfirmed\)[\s\S]*?\n  \}/)
const applySrc   = applyMatch ? applyMatch[0] : ''
assert(applySrc.length > 0, 'handleApplyTemplate has E.6 signature (templateId, replaceConfirmed)')
// Strip comments so a line that says "browser confirm() per click" in
// prose doesn't trip the pin.
const stripComments = src => src
  .split('\n')
  .map(line => line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//, ''))
  .join('\n')
const applyCode = stripComments(applySrc)
assert(!/confirm\(/.test(applyCode),
  'handleApplyTemplate does NOT fire a browser confirm() (in-UI flow)')
assert(/applyShiftTemplate\(templateId, \{ effectiveDate: selectedDate, replace: replaceConfirmed \}\)/.test(applySrc),
  'handleApplyTemplate forwards { effectiveDate, replace: replaceConfirmed } to the store')

// ── Drag/drop polish ─────────────────────────────────────────────────
section('Drag/drop polish — distinguishable source + target states + same-day silent ignore')

assert(/data-drag-source=\{isDragSource \? 'true' : undefined\}/.test(CAL),
  'day tile carries data-drag-source when this is the source tile')
assert(/data-drag-over=\{dragSource && dragSource !== cell\.date \? 'true' : undefined\}/.test(CAL),
  'day tile carries data-drag-over on all other tiles during a drag')
assert(/onDragEnd=\{\(\) => setDragSource\(null\)\}/.test(CAL),
  'onDragEnd clears dragSource (releases the cyan highlight when drop fizzles)')

// Distinct CSS for source vs. over.
assert(/\.dayTile\[data-drag-source="true"\]\s*\{[\s\S]{0,400}rgba\(56,\s*189,\s*248/.test(CSS),
  '.dayTile[data-drag-source="true"] highlights in cyan (source)')
assert(/\.dayTile\[data-drag-over="true"\]\s*\{[\s\S]{0,400}rgba\(251,\s*191,\s*36/.test(CSS),
  '.dayTile[data-drag-over="true"] highlights in amber (target) — distinct from source')

// Same-day drag exits silently — no toast, no confirm before the early
// return. Pin this by extracting the handleDrop body and asserting
// the early-return branch contains neither.
const dropMatch = CAL.match(/async function handleDrop\(destinationDate\)\s*\{([\s\S]*?)\n  \}/)
const dropSrc   = dropMatch ? dropMatch[1] : ''
assert(dropSrc.length > 0, 'handleDrop body extracted')
// Capture the early-return body only — stop at the first `return` line,
// which is the same-day branch's own return (not the next if's).
const earlyReturnMatch = dropSrc.match(/if \(!dragSource \|\| !destinationDate \|\| dragSource === destinationDate\)\s*\{([\s\S]*?\n\s*return\s*\n)/)
const earlyReturnSrc   = earlyReturnMatch ? earlyReturnMatch[1] : ''
assert(earlyReturnSrc.length > 0, 'handleDrop same-day early-return branch extracted')
// Strip comments so prose mentioning "no toast, no confirm" doesn't trip the pins.
const stripCommentsInline = src => src
  .split('\n')
  .map(line => line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//, ''))
  .join('\n')
const earlyReturnCode = stripCommentsInline(earlyReturnSrc)
assert(!/toast\./.test(earlyReturnCode),
  'same-day drag does NOT fire a toast')
assert(!/confirm\(/.test(earlyReturnCode),
  'same-day drag does NOT fire a confirm()')
assert(/setDragSource\(null\)/.test(earlyReturnCode),
  'same-day drag still clears dragSource')

// Phase E.6 toast format: "Copied from <src> to <dest>:"
assert(/Copied from \$\{dragSource\} to \$\{destinationDate\}:[\s\S]{0,200}\$\{result\.copied\} copied/.test(CAL),
  'success toast format: "Copied from <src> to <dest>: N copied · M replaced · K skipped"')
assert(/result\.replaced \? ` · \$\{result\.replaced\} replaced`/.test(CAL),
  'success toast surfaces replaced count when > 0')
assert(/result\.skipped \? ` · \$\{result\.skipped\} skipped`/.test(CAL),
  'success toast surfaces skipped count when > 0')

// Replace warning still confirmed via browser confirm (drag-source has
// no in-UI panel to surface a checkbox — small modal would be heavier
// than the current dialog).
assert(/\$\{destinationDate\} already has a schedule\. Replace it with \$\{dragSource\}'s schedule\?/.test(dropSrc),
  'drop replace warning still uses confirm() with explicit copy')

// ── Selected day quick actions ───────────────────────────────────────
section('Selected day — quick actions')

assert(/Mark all Scheduled/.test(CAL),
  'day editor exposes "Mark all Scheduled" button')
assert(/Mark all Off/.test(CAL),
  'day editor exposes "Mark all Off" button')
assert(/Clear Day Overrides/.test(CAL),
  'day editor exposes "Clear Day Overrides" button (preserved)')

assert(/async function markAllStatus\(targetStatus\)/.test(CAL),
  'markAllStatus(targetStatus) helper present')

// Bulk-status helper writes via applyEdit (which targets overrides).
// Source MUST NOT mention employee_schedules tablename / mutators.
const bulkMatch = CAL.match(/async function markAllStatus[\s\S]*?\n  \}/)
const bulkSrc   = bulkMatch ? bulkMatch[0] : ''
assert(bulkSrc.length > 0, 'markAllStatus body extracted')
assert(/await applyEdit\(row, \{ status: targetStatus \}\)/.test(bulkSrc),
  'markAllStatus mutates via applyEdit({ status })')
assert(!/employee_schedules\b/.test(bulkSrc),
  'markAllStatus does NOT reference employee_schedules (recurring grid untouched)')

// Confirm dialog warns the supervisor before the bulk write fires.
assert(/Mark all employees \$\{targetStatus\}/.test(bulkSrc),
  'markAllStatus confirms before writing every override')
assert(/never modifies the weekly recurring grid/.test(bulkSrc),
  'markAllStatus confirm copy promises the recurring grid is untouched')

// Clear-day-overrides still iterates deleteScheduleOverride only.
const clearMatch = CAL.match(/async function clearDayOverrides[\s\S]*?\n  \}/)
const clearSrc   = clearMatch ? clearMatch[0] : ''
assert(/await deleteScheduleOverride\(ov\.id\)/.test(clearSrc),
  'clearDayOverrides still deletes overrides only')
assert(!/employee_schedules\b/.test(clearSrc),
  'clearDayOverrides still does NOT touch the recurring grid')

// ── Save-as still works ─────────────────────────────────────────────
section('Save-as-template still works (E.5 regression couple)')

assert(/function SaveAsModal\(\{ date, rowCount, onClose, onSave, busy \}\)/.test(CAL),
  'SaveAsModal component still defined')
assert(/await createShiftTemplate\(\{ name: trimmed, rows \}\)/.test(CAL),
  'Save-as still creates a template from the current day rows')

// ── Annual Calendar still writes overrides only ─────────────────────
section('Annual Calendar mutations — overrides only (no recurring grid writes)')

// Calendar source: every store mutation must reach a "schedule" target
// that is an override or a shift template — never the recurring grid.
assert(!/import \{[\s\S]{0,300}createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule[\s\S]{0,300}\} from '\.\.\/\.\.\/\.\.\/utils\/schedules\/schedulesStore'/.test(CAL),
  'AnnualScheduleCalendar does NOT import recurring-grid mutators')
// Functional negative pin: the source mentions only override + shift-template stores.
assert(/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(CAL),
  'AnnualScheduleCalendar uses override-store mutators (positive pin)')
assert(/createShiftTemplate|patchShiftTemplate|deleteShiftTemplate|applyShiftTemplate|duplicateShiftTemplate/.test(CAL),
  'AnnualScheduleCalendar uses shift-template store mutators (positive pin)')

// ── Worker — shift templates apply still targets overrides ──────────
section('Worker — shiftTemplates.applyShiftTemplate still writes to overrides only')

assert(/INSERT INTO employee_schedule_overrides/.test(SHIFT),
  'regression: applyShiftTemplate still INSERTs into employee_schedule_overrides')
assert(!/INSERT INTO employee_schedules\b/.test(SHIFT),
  'regression: applyShiftTemplate does NOT INSERT into employee_schedules')

// schedules.copyEmployeeSchedulesDay also still writes to overrides only.
const copyDayMatch = SCHEDS.match(/export async function copyEmployeeSchedulesDay\(env, request\)\s*\{[\s\S]*?\n\}/)
const copyDaySrc   = copyDayMatch ? copyDayMatch[0] : ''
assert(copyDaySrc.length > 0, 'copyEmployeeSchedulesDay body extracted')
assert(/INSERT INTO employee_schedule_overrides/.test(copyDaySrc),
  'regression: copyEmployeeSchedulesDay still INSERTs into employee_schedule_overrides')
assert(!/INSERT INTO employee_schedules\b/.test(copyDaySrc),
  'regression: copyEmployeeSchedulesDay does NOT INSERT into employee_schedules')

// ── Weekly Schedule Editor still does NOT mutate overrides ──────────
section('Weekly Schedule Editor — still recurring-only (no override writes)')

assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still mutates the recurring employee_schedules table')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still does NOT touch override mutators')
assert(!WEEKLY.includes('Phase E.6'),
  'WeeklyScheduleEditor carries no Phase E.6 edits (spec: "no Weekly Schedule Editor changes")')

// ── Daily editor (E.2 surface) untouched ────────────────────────────
section('DailyScheduleEditor (E.2 surface) untouched')

assert(!DAILY.includes('Phase E.6'),
  'DailyScheduleEditor carries no Phase E.6 edits')

// ── DAB + kiosk E.4/E.5 awareness preserved ─────────────────────────
section('DAB + kiosk schedule awareness preserved (E.4/E.5 regression couple)')

assert(/isEmployeeAssignableForDate[\s\S]{0,200}from '\.\.\/\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(DAB),
  'DAB still imports isEmployeeAssignableForDate (E.4 invariant)')
assert(/const assignable = isEmployeeAssignableForDate\(/.test(DAB),
  'DAB still consults destination schedule before each copy (E.4 invariant)')

assert(/import \{ isEmployeeAssignableForDate, hasAnyScheduleData \} from '\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(KIOSK),
  'kiosk still imports schedule helpers (E.4 invariant)')
assert(/if \(hasAnyScheduleData\(weeklySchedules, scheduleOverrides\)\)\s*\{[\s\S]{0,400}cards = cards\.filter/.test(KIOSK),
  'kiosk still filters operatorCards via hasAnyScheduleData gate (E.4 invariant)')

assert(!DAB.includes('Phase E.6'),
  'DAB carries no Phase E.6 edits (spec: "no DAB behavior changes")')
assert(!KIOSK.includes('Phase E.6'),
  'kiosk carries no Phase E.6 edits (spec: "no kiosk behavior changes")')

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
  assert(!src.includes('Phase E.6'),
    `${path} carries no Phase E.6 edits`)
}

// Translation + Task Library + worker route table untouched.
for (const path of [
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'worker/api/taskTemplates.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.6'),
    `${path} carries no Phase E.6 edits`)
}

// ── Mobile layout ───────────────────────────────────────────────────
section('Mobile layout — picker collapses to single column under 760px')

assert(/@media \(max-width:\s*760px\)\s*\{[\s\S]{0,400}\.pickerLayout\s*\{\s*grid-template-columns:\s*1fr/.test(CSS),
  'picker layout collapses to one column under 760px (preview stacks above list)')
assert(/@media \(max-width:\s*600px\)\s*\{[\s\S]{0,400}\.calendarNav\s*\{\s*flex-wrap:\s*wrap/.test(CSS),
  'calendar nav wraps on phones (< 600px) so jump-to-date doesn\'t overflow')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
