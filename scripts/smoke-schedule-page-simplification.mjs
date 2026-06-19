// Phase E.7 — Schedule page simplification smoke.
//
//   node scripts/smoke-schedule-page-simplification.mjs
//
// E.5 + E.6 shipped the Annual Calendar and polished the workflow.
// Now the Schedule tab gets simplified: the Annual Calendar is the
// single expanded surface and the older editors collapse into
// <details> sections so they don't crowd a new supervisor.
//
// Key changes pinned here:
//   • EmployeeScheduleTab — Annual Calendar above; Quick Today View
//     and Recurring Defaults are <details> elements with no `open`
//     attribute (collapsed by default).
//   • Layer hint line explains the override-vs-recurring relationship.
//   • Readable date labels everywhere — "June 2026" in the header,
//     "Thursday, June 18" in the day editor. ISO stays the internal
//     storage format.
//   • Day tile pills: "<N> working" + "<N> hrs" (always when > 0);
//     "<N> out" only when > 0 (kept secondary).
//   • Toolbar: Apply Shift / Save Shift / Copy Day primary; More
//     menu hides Mark all / Clear Day Overrides.
//   • Copy Day button opens a modal with a source-date picker (the
//     non-drag entrypoint to the existing copyScheduleDay flow).
//   • Weekend tint CSS rule (subtle).
//   • Past-date pill in the day editor header.
//   • Safety invariants — no migration, recurring grid still
//     untouched, DAB + kiosk awareness unchanged, no spray edits.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const TAB     = readFileSync('src/pages/Employees/tabs/EmployeeScheduleTab.jsx',           'utf8')
const TAB_CSS = readFileSync('src/pages/Employees/tabs/EmployeeScheduleTab.module.css',    'utf8')
const CAL     = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx',        'utf8')
const CSS     = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.module.css', 'utf8')
const WEEKLY  = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx',          'utf8')
const SCHEDS  = readFileSync('worker/api/schedules.js',                                    'utf8')
const SHIFT   = readFileSync('worker/api/shiftTemplates.js',                               'utf8')
const DAB     = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',               'utf8')
const KIOSK   = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',                    'utf8')

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger (Phase E.5 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── EmployeeScheduleTab layout ────────────────────────────────────────
section('EmployeeScheduleTab — Annual expanded, Today + Weekly collapsed')

assert(/import AnnualScheduleCalendar\s+from\s+['"]\.\/AnnualScheduleCalendar['"]/.test(TAB),
  'imports AnnualScheduleCalendar')
assert(/import DailyScheduleEditor\s+from\s+['"]\.\/DailyScheduleEditor['"]/.test(TAB),
  'still imports DailyScheduleEditor (regression couple — E.2 surface kept)')
assert(/import WeeklyScheduleEditor\s+from\s+['"]\.\/WeeklyScheduleEditor['"]/.test(TAB),
  'still imports WeeklyScheduleEditor (regression couple — recurring grid kept)')

// Annual Calendar rendered at the top, OUTSIDE any <details>.
const calRender = TAB.indexOf('<AnnualScheduleCalendar')
const dailyRender = TAB.indexOf('<DailyScheduleEditor')
const weeklyRender = TAB.indexOf('<WeeklyScheduleEditor')
assert(calRender >= 0 && dailyRender >= 0 && weeklyRender >= 0,
  'all three editors rendered in the Schedule tab')
assert(calRender < dailyRender && dailyRender < weeklyRender,
  'render order: Annual Calendar → Daily editor → Weekly editor')

// Strip JS line + block comments before scanning JSX so prose
// mentioning <details> doesn't trip the counter.
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}
const TAB_CODE = stripComments(TAB)
const CAL_CODE = stripComments(CAL)

// Re-resolve marker positions inside the comment-free source.
const calRenderCode    = TAB_CODE.indexOf('<AnnualScheduleCalendar')
const dailyRenderCode  = TAB_CODE.indexOf('<DailyScheduleEditor')
const weeklyRenderCode = TAB_CODE.indexOf('<WeeklyScheduleEditor')

// Annual Calendar render is NOT nested in a <details>.
const beforeCal = TAB_CODE.slice(0, calRenderCode)
const detailsBeforeCal = (beforeCal.match(/<details\b/g) ?? []).length
const detailsCloseBeforeCal = (beforeCal.match(/<\/details>/g) ?? []).length
assert(detailsBeforeCal === detailsCloseBeforeCal,
  'Annual Calendar is NOT inside any open <details> tag (expanded by default)')

// Both DailyScheduleEditor + WeeklyScheduleEditor live inside <details>.
function inDetails(src, marker) {
  const idx = src.indexOf(marker)
  if (idx < 0) return false
  const after = src.slice(idx)
  const before = src.slice(0, idx)
  const open = (before.match(/<details\b/g) ?? []).length
  const close = (before.match(/<\/details>/g) ?? []).length
  if (open <= close) return false
  return after.indexOf('</details>') >= 0
}
assert(inDetails(TAB_CODE, '<DailyScheduleEditor'),
  'DailyScheduleEditor rendered INSIDE a <details> section')
assert(inDetails(TAB_CODE, '<WeeklyScheduleEditor'),
  'WeeklyScheduleEditor rendered INSIDE a <details> section')

// Neither <details> has the `open` attribute — both collapsed by default.
const detailsTags = TAB_CODE.match(/<details\b[^>]*>/g) ?? []
assert(detailsTags.length === 2,
  `Schedule tab has exactly 2 <details> sections (found ${detailsTags.length})`)
for (const tag of detailsTags) {
  assert(!/\bopen\b/.test(tag),
    `<details> tag does not have the "open" attribute (collapsed by default): ${tag}`)
}

// Section labels per spec.
assert(/Quick Today View/.test(TAB),
  'collapsed section is labeled "Quick Today View"')
assert(/Recurring Defaults/.test(TAB),
  'collapsed section is labeled "Recurring Defaults"')

// Layer hint text per spec.
assert(/Recurring defaults[\s\S]{0,80}are the normal weekly pattern\.[\s\S]{0,80}Calendar changes override them for specific dates\./.test(TAB),
  'layer hint surfaces the recurring-vs-override relationship')

// Tab CSS exists and defines the secondary section + summary classes.
for (const cls of ['layerHint', 'secondarySection', 'secondarySummary', 'secondaryBody']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(TAB_CSS),
    `EmployeeScheduleTab.module.css defines .${cls}`)
}

// ── Readable date labels ─────────────────────────────────────────────
section('Readable date labels — month + selected date')

assert(/const MONTH_FORMATTER = new Intl\.DateTimeFormat\('en-US', \{ month: 'long', year: 'numeric' \}\)/.test(CAL),
  'MONTH_FORMATTER built via Intl.DateTimeFormat (long month + numeric year)')
assert(/const DAY_FORMATTER\s*=\s*new Intl\.DateTimeFormat\('en-US', \{ weekday: 'long', month: 'long', day: 'numeric' \}\)/.test(CAL),
  'DAY_FORMATTER built via Intl.DateTimeFormat (long weekday + long month + numeric day)')

assert(/function formatMonthLabel\(yyyymm\)/.test(CAL),
  'formatMonthLabel helper defined')
assert(/function formatDayLabel\(yyyymmdd\)/.test(CAL),
  'formatDayLabel helper defined')

// Header renders the readable label, not the raw ISO.
assert(/className=\{styles\.currentMonth\} title=\{currentMonth\}>\{formatMonthLabel\(currentMonth\)\}/.test(CAL),
  'currentMonth label uses formatMonthLabel (raw ISO preserved as title attribute)')
assert(/className=\{styles\.dayEditorTitle\} title=\{selectedDate\}>\{formatDayLabel\(selectedDate\)\}/.test(CAL),
  'dayEditorTitle uses formatDayLabel (raw ISO preserved as title attribute)')

// ISO storage is preserved — the underlying state values stay yyyy-mm-dd / yyyy-mm.
assert(/const \[currentMonth, setCurrentMonth\] = useState\(\(\) => todayIso\(\)\.slice\(0, 7\)\)/.test(CAL),
  'currentMonth state is still ISO YYYY-MM (storage format unchanged)')
assert(/const \[selectedDate, setSelectedDate\] = useState\(todayIso\)/.test(CAL),
  'selectedDate state is still ISO YYYY-MM-DD (storage format unchanged)')

// ── Day tile content + weekend tint ─────────────────────────────────
section('Day tile — working count + hours primary, off secondary, weekend tint')

assert(/\{summary\.scheduledCount\} working/.test(CAL),
  'tile pill shows "<N> working" (was bare number)')
assert(/\{summary\.totalHours\} hrs/.test(CAL),
  'tile pill shows "<N> hrs" (was "<N>h")')
assert(/\{summary\.offCount\} out/.test(CAL),
  'tile pill shows "<N> out" (was "<N> off")')

// Off rendered only when > 0 (kept secondary).
assert(/summary\.offCount > 0[\s\S]{0,200}className=\{styles\.dayCountOff\}/.test(CAL),
  'off count rendered ONLY when offCount > 0 (kept secondary)')

// Render order: working → hours → out. Strip JSX comments first so
// prose like "(2 out)" inside a comment doesn't pollute the index
// check.
const summaryMatch = CAL.match(/<div className=\{styles\.daySummary\}>([\s\S]*?)<\/div>/)
const summarySrc   = summaryMatch ? summaryMatch[1].replace(/\{\/\*[\s\S]*?\*\/\}/g, '') : ''
assert(summarySrc.length > 0, 'day summary block extracted')
const wIdx = summarySrc.indexOf('working')
const hIdx = summarySrc.indexOf('hrs')
const oIdx = summarySrc.indexOf('out')
assert(wIdx >= 0 && hIdx >= 0 && oIdx >= 0 && wIdx < hIdx && hIdx < oIdx,
  'tile render order: <N> working → <N> hrs → <N> out')

// Weekend tint via data-weekend + CSS.
assert(/data-weekend=\{isWeekend \? 'true' : undefined\}/.test(CAL),
  'day tile carries data-weekend="true" on Sat/Sun')
assert(/function dayOfWeek\(yyyymmdd\)/.test(CAL),
  'dayOfWeek helper defined')
assert(/const isWeekend\s*=\s*dow === 0 \|\| dow === 6/.test(CAL),
  'isWeekend computed from dayOfWeek === 0 || 6')
assert(/\.dayTile\[data-weekend="true"\]\s*\{/.test(CSS),
  'CSS .dayTile[data-weekend="true"] rule defined')

// ── Toolbar — Apply Shift / Save Shift / Copy Day + More menu ───────
section('Toolbar — primary buttons + More menu')

// Apply Shift renamed from Apply Template.
assert(/<button[^>]*>[\s\S]{0,200}Apply Shift[\s\S]{0,200}<\/button>/.test(CAL),
  'toolbar exposes "Apply Shift" primary button')
assert(/<button[^>]*>[\s\S]{0,200}Save Shift[\s\S]{0,200}<\/button>/.test(CAL),
  'toolbar exposes "Save Shift" primary button')
assert(/<button[^>]*>[\s\S]{0,200}Copy Day[\s\S]{0,200}<\/button>/.test(CAL),
  'toolbar exposes "Copy Day" primary button')

// More menu structure.
assert(/More ▾/.test(CAL),
  'toolbar exposes "More ▾" button')
assert(/className=\{styles\.moreMenu\}/.test(CAL),
  'More menu renders styles.moreMenu container')
assert(/aria-haspopup="menu"/.test(CAL),
  'More button declares aria-haspopup="menu"')
assert(/role="menu"/.test(CAL),
  'More menu container has role="menu"')

// More menu contains the three relocated items. Anchor on the menu's
// own closing </div> + `)}` so the regex can't terminate early at the
// `)}` inside the onClick arrow.
const moreMatch = CAL.match(/\{moreOpen && \([\s\S]*?<\/div>\s*\)\}/)
const moreSrc   = moreMatch ? moreMatch[0] : ''
assert(moreSrc.length > 0, 'More menu block extracted')
assert(/className=\{styles\.moreMenu\}/.test(moreSrc),
  'More menu block contains styles.moreMenu container')
assert(/Mark all Scheduled/.test(moreSrc),
  'More menu contains "Mark all Scheduled"')
assert(/Mark all Off/.test(moreSrc),
  'More menu contains "Mark all Off"')
assert(/Clear Day Overrides/.test(moreSrc),
  'More menu contains "Clear Day Overrides"')

// Each More item uses role="menuitem".
const menuitemCount = (moreSrc.match(/role="menuitem"/g) ?? []).length
assert(menuitemCount === 3,
  `More menu has 3 items with role="menuitem" (found ${menuitemCount})`)

// CSS classes for the menu defined.
for (const cls of ['moreMenuWrap', 'moreMenu', 'moreItem', 'moreItemDanger']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} defined`)
}

// ── Copy Day modal + handler ─────────────────────────────────────────
section('Copy Day — non-drag entrypoint via modal')

assert(/function CopyDayModal\(\{ destinationDate, destHasOverrides, busy, onClose, onCopy \}\)/.test(CAL),
  'CopyDayModal component defined')
assert(/async function handleCopyDay\(\{ sourceDate, replace \}\)/.test(CAL),
  'handleCopyDay({ sourceDate, replace }) handler defined')
assert(/await copyScheduleDay\(\{ sourceDate, destinationDate: selectedDate, replace \}\)/.test(CAL),
  'handleCopyDay delegates to copyScheduleDay store helper')

// Same-day guard inside the modal.
assert(/const sameDay = sourceDate === destinationDate/.test(CAL),
  'CopyDayModal computes sameDay flag')
assert(/disabled=\{busy \|\| sameDay\}/.test(CAL),
  'CopyDayModal Copy button disabled when sameDay')

// Modal mounts when copyDayOpen is true.
assert(/\{copyDayOpen && \(\s*<CopyDayModal/.test(CAL),
  'CopyDayModal mounts behind copyDayOpen state')

// Source-date input present.
assert(/type="date"[\s\S]{0,400}value=\{sourceDate\}[\s\S]{0,400}onChange=\{e => setSourceDate\(e\.target\.value\)\}/.test(CAL),
  'CopyDayModal has a <input type="date"> for source-date selection')

// Default source = yesterday.
assert(/dt\.setDate\(dt\.getDate\(\) - 1\)/.test(CAL),
  'CopyDayModal defaults source to yesterday relative to destination')

// ── Drag/drop still works (regression couple) ────────────────────────
section('Drag/drop copy still works — drag handlers + visuals intact')

assert(/data-drag-source=\{isDragSource \? 'true' : undefined\}/.test(CAL),
  'day tile still carries data-drag-source')
assert(/data-drag-over=\{dragSource && dragSource !== cell\.date \? 'true' : undefined\}/.test(CAL),
  'day tile still carries data-drag-over')
assert(/draggable=\{!busy\}/.test(CAL),
  'day tile still draggable')
assert(/onDragStart=\{\(\) => handleDragStart\(cell\.date\)\}/.test(CAL),
  'onDragStart still wires handleDragStart')
assert(/onDrop=\{\(\) => handleDrop\(cell\.date\)\}/.test(CAL),
  'onDrop still wires handleDrop')

// Drag/drop and Copy Day both fan into copyScheduleDay (same server semantics).
assert(/copyScheduleDay\(\{ sourceDate: dragSource, destinationDate, replace \}\)/.test(CAL),
  'drag handleDrop still calls copyScheduleDay')

// ── Past-date hint ───────────────────────────────────────────────────
section('Past-date hint — visible when selectedDate < today')

assert(/selectedDate < todayIso\(\)[\s\S]{0,400}className=\{styles\.pastDateBadge\}/.test(CAL),
  'past-date pill renders when selectedDate < todayIso()')
assert(/Past date/.test(CAL),
  'past-date pill label reads "Past date"')
assert(/\.pastDateBadge\s*\{/.test(CSS),
  'CSS .pastDateBadge defined')

// ── Apply Shift / Save Shift renamed strings preserved through flows ─
section('Renamed primary actions still wire to existing flows')

// Apply Shift opens the existing template picker.
assert(/onClick=\{\(\) => setTemplatePickerOpen\(true\)\}[\s\S]{0,200}Apply Shift/.test(CAL),
  'Apply Shift opens template picker (setTemplatePickerOpen)')
// Save Shift opens the existing save-as modal.
assert(/onClick=\{\(\) => setShowSaveAsOpen\(true\)\}[\s\S]{0,200}Save Shift/.test(CAL),
  'Save Shift opens save-as modal (setShowSaveAsOpen)')
// Copy Day opens the new modal.
assert(/onClick=\{\(\) => setCopyDayOpen\(true\)\}[\s\S]{0,200}Copy Day/.test(CAL),
  'Copy Day opens CopyDayModal (setCopyDayOpen)')

// Template picker modal title — Phase E.8 dropped the "Template" word
// from the user-facing title ("Apply Shift to <date>").
assert(/Apply Shift to \{selectedDate\}/.test(CAL),
  'template picker modal title reads "Apply Shift to <date>" (E.8 rename)')

// ── Annual Calendar — overrides only (positive + negative pins) ──────
section('Annual Calendar still writes overrides only (recurring grid untouched)')

assert(/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(CAL),
  'AnnualScheduleCalendar uses override-store mutators (positive pin)')
assert(!/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(CAL),
  'AnnualScheduleCalendar does NOT use recurring-grid mutators (negative pin)')

// Worker invariants — applyShiftTemplate + copyEmployeeSchedulesDay
// still target overrides only.
assert(/INSERT INTO employee_schedule_overrides/.test(SHIFT),
  'regression: applyShiftTemplate still INSERTs into employee_schedule_overrides')
assert(!/INSERT INTO employee_schedules\b/.test(SHIFT),
  'regression: applyShiftTemplate does NOT INSERT into employee_schedules')
const copyDayMatch = SCHEDS.match(/export async function copyEmployeeSchedulesDay\(env, request\)\s*\{[\s\S]*?\n\}/)
const copyDaySrc   = copyDayMatch ? copyDayMatch[0] : ''
assert(/INSERT INTO employee_schedule_overrides/.test(copyDaySrc),
  'regression: copyEmployeeSchedulesDay still INSERTs into employee_schedule_overrides')
assert(!/INSERT INTO employee_schedules\b/.test(copyDaySrc),
  'regression: copyEmployeeSchedulesDay does NOT INSERT into employee_schedules')

// ── Weekly Schedule Editor still recurring-only ──────────────────────
section('Weekly Schedule Editor — still recurring-only (no override writes)')

assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still mutates the recurring employee_schedules table')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'regression: WeeklyScheduleEditor still does NOT touch override mutators')
assert(!WEEKLY.includes('Phase E.7'),
  'WeeklyScheduleEditor carries no Phase E.7 edits (spec: collapsed but unchanged)')

// ── DAB + kiosk awareness preserved ──────────────────────────────────
section('DAB + kiosk schedule awareness preserved (E.4/E.5/E.6 regression couple)')

assert(/isEmployeeAssignableForDate[\s\S]{0,200}from '\.\.\/\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(DAB),
  'DAB still imports isEmployeeAssignableForDate (E.4 invariant)')
assert(/const assignable = isEmployeeAssignableForDate\(/.test(DAB),
  'DAB still consults destination schedule before each copy (E.4 invariant)')
assert(/import \{ isEmployeeAssignableForDate, hasAnyScheduleData \} from '\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(KIOSK),
  'kiosk still imports schedule helpers (E.4 invariant)')
assert(/if \(hasAnyScheduleData\(weeklySchedules, scheduleOverrides\)\)\s*\{[\s\S]{0,400}cards = cards\.filter/.test(KIOSK),
  'kiosk still filters operatorCards via hasAnyScheduleData gate (E.4 invariant)')
assert(!DAB.includes('Phase E.7'),
  'DAB carries no Phase E.7 edits (spec: "no DAB behavior changes")')
assert(!KIOSK.includes('Phase E.7'),
  'kiosk carries no Phase E.7 edits (spec: "no kiosk behavior changes")')

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
  assert(!src.includes('Phase E.7'),
    `${path} carries no Phase E.7 edits`)
}

// Worker + translate + tasks + wrangler untouched.
for (const path of [
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'worker/api/shiftTemplates.js',
  'worker/api/schedules.js',
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.7'),
    `${path} carries no Phase E.7 edits`)
}

// DailyScheduleEditor unchanged.
const DAILY = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx', 'utf8')
assert(!DAILY.includes('Phase E.7'),
  'DailyScheduleEditor carries no Phase E.7 edits (collapsed but unchanged)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
