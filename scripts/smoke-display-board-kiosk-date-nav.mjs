// Phase 9C.6 — Kiosk board date navigation arrows smoke.
//
//   node scripts/smoke-display-board-kiosk-date-nav.mjs
//
// /display-board/board grows two arrow buttons around the top date so
// the public kiosk can step backward or forward by day without leaving
// the no-login view. Default behavior:
//   • Page load defaults selectedDate to today (isoToday).
//   • Page refresh resets selectedDate to today (no persistence).
//   • Midnight rollover only fires when the user has NOT touched the
//     date — gated by !boardDateTouched.
//   • Auto-refresh, public-route, view-only invariants all hold.
//
// Source-only — no server boot.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',          'utf8')
const CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',   'utf8')

// Extract the boardMode early-return slice up-front (used by several
// downstream checks). Matches the 9C.5a-anchored shape:
//   if (boardMode && !printMode) { return ( ... </div> ) }
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''

// ── State + shift helper ───────────────────────────────────────────────
section('boardDateTouched state + shiftBoardDate helper')

assert(/const\s+\[boardDateTouched,\s*setBoardDateTouched\]\s*=\s*useState\(false\)/.test(DB),
  'const [boardDateTouched, setBoardDateTouched] = useState(false) declared')

assert(/function\s+shiftBoardDate\(delta\)/.test(DB),
  'function shiftBoardDate(delta) declared')

const shiftMatch = DB.match(/function\s+shiftBoardDate\(delta\)\s*\{[\s\S]*?\n\s{2}\}/)
const shiftSrc   = shiftMatch ? shiftMatch[0] : ''
assert(shiftSrc.length > 0, 'shiftBoardDate body extracted')

assert(/setBoardDateTouched\(true\)/.test(shiftSrc),
  'shiftBoardDate flips setBoardDateTouched(true) so midnight rollover pauses')
assert(/setSelectedDate\(prev\s*=>\s*shiftDate\(prev,\s*delta\)\)/.test(shiftSrc),
  'shiftBoardDate calls setSelectedDate(prev => shiftDate(prev, delta)) — reuses existing ISO helper')

// ── Default + persistence ──────────────────────────────────────────────
section('selectedDate defaults to today, never persists across reload')

assert(/const\s+\[selectedDate,\s*setSelectedDate\]\s*=\s*useState\(isoToday\)/.test(DB),
  'selectedDate initialised via useState(isoToday) — defaults to today on every page load')

// Explicitly no persistence — boardDateTouched must NOT be hydrated
// from localStorage / sessionStorage / URL search params at mount.
for (const persistApi of [
  'localStorage.getItem',
  'sessionStorage.getItem',
  'useSearchParams',
  'queryString',
]) {
  assert(!new RegExp(persistApi.replace('.', '\\.')).test(DB) ||
         !DB.includes('boardDateTouched') ||
         // Only flag persistence APIs in the same vicinity as
         // boardDateTouched. We're being lenient — a future phase could
         // legitimately use localStorage elsewhere — but we don't want
         // ANY persistence of the board-date navigation state.
         !new RegExp(`${persistApi.replace('.', '\\.')}[\\s\\S]{0,400}boardDateTouched`).test(DB),
    `boardDateTouched is NOT persisted via ${persistApi} (defaults to false on every load)`)
}

// ── Midnight rollover gated by !boardDateTouched ──────────────────────
section('Midnight rollover gated by !boardDateTouched')

// The pre-9C.6 rollover read `if (boardMode) { ... }`; 9C.6 widens to
// `if (boardMode && !boardDateTouched) { ... }`.
assert(/if \(boardMode\s*&&\s*!boardDateTouched\)/.test(DB),
  'midnight rollover branch checks `if (boardMode && !boardDateTouched)`')

// Negative regression — the un-gated form must NOT come back.
assert(!/if \(boardMode\)\s*\{\s*const\s+todayNow\s*=\s*isoToday\(\)/.test(DB),
  'old un-gated `if (boardMode) { const todayNow = isoToday()...}` rollover is gone')

// The effect deps array now includes boardDateTouched.
const rolloverEffectMatch = DB.match(/useEffect\(\(\) => \{[\s\S]*?if \(boardMode\s*&&\s*!boardDateTouched\)[\s\S]*?\}, \[([^\]]+)\]\)/)
const rolloverDeps        = rolloverEffectMatch ? rolloverEffectMatch[1] : ''
assert(/boardDateTouched/.test(rolloverDeps),
  'midnight-rollover useEffect deps include boardDateTouched')

// ── Arrow buttons render inside the boardMode early-return ─────────────
section('Arrow buttons render — left + right, with aria-label and onClick wiring')

assert(earlyReturnJsx.length > 0, 'boardMode early-return JSX extracted')

assert(/onClick=\{\(\)\s*=>\s*shiftBoardDate\(-1\)\}/.test(earlyReturnJsx),
  'left arrow onClick={() => shiftBoardDate(-1)}')
assert(/onClick=\{\(\)\s*=>\s*shiftBoardDate\(1\)\}/.test(earlyReturnJsx),
  'right arrow onClick={() => shiftBoardDate(1)}')

assert(/aria-label="Previous board date"/.test(earlyReturnJsx),
  'left arrow aria-label="Previous board date"')
assert(/aria-label="Next board date"/.test(earlyReturnJsx),
  'right arrow aria-label="Next board date"')

assert(/title="Previous day"/.test(earlyReturnJsx),
  'left arrow title="Previous day"')
assert(/title="Next day"/.test(earlyReturnJsx),
  'right arrow title="Next day"')

// Buttons use the new boardDateArrow class; the label is centered.
const arrowMatches = (earlyReturnJsx.match(/className=\{styles\.boardDateArrow\}/g) ?? []).length
assert(arrowMatches === 2,
  `boardDateArrow class applied exactly twice (one per arrow); found ${arrowMatches}`)

assert(/className=\{styles\.boardDateLabel\}>\{prettyDate\(selectedDate\)\}/.test(earlyReturnJsx),
  '<span className={styles.boardDateLabel}>{prettyDate(selectedDate)}</span> wraps the date text')

// Arrows use ‹ / › glyphs to match the existing DateClockPanel style.
assert(/‹/.test(earlyReturnJsx),
  'left arrow renders the ‹ glyph')
assert(/›/.test(earlyReturnJsx),
  'right arrow renders the › glyph')

// ── CSS — new classes ─────────────────────────────────────────────────
section('CSS — .boardDateArrow + .boardDateLabel + .boardDateTop flex layout')

assert(/\.boardDateArrow\s*\{/.test(CSS),
  '.boardDateArrow class defined')
assert(/\.boardDateLabel\s*\{/.test(CSS),
  '.boardDateLabel class defined')

// .boardDateTop becomes a flex row so ‹ <date> › lay out side by side.
// Phase 9C.6a — block grew (longer guidance comment + position: relative
// + relaxed padding/gap clamps) so the regex windows widened from 400
// → 800 to still reach the display: flex / justify-content: center rules.
assert(/\.boardDateTop\s*\{[\s\S]{0,800}display:\s*flex/.test(CSS),
  '.boardDateTop uses display: flex (was text-align only)')
assert(/\.boardDateTop\s*\{[\s\S]{0,800}justify-content:\s*center/.test(CSS),
  '.boardDateTop uses justify-content: center (label stays centered)')

// Hover state present so the arrows feel interactive on a kiosk laptop
// or admin desktop preview.
assert(/\.boardDateArrow:hover\s*\{/.test(CSS),
  '.boardDateArrow:hover rule defined')

// Mobile media query collapses arrow size so they fit on small phones.
assert(/@media\s*\(max-width:\s*600px\)\s*\{[\s\S]{0,400}\.boardDateArrow/.test(CSS),
  '@media (max-width: 600px) tightens .boardDateArrow for small screens')

// ── Auto-refresh, public route, view-only invariants preserved ────────
section('Kiosk invariants — auto-refresh + public + view-only preserved')

// 60s refresh.
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'KIOSK_REFRESH_MS = 60 * 1000 preserved (9C.4a)')

// canDeleteTasks gate.
assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'canDeleteTasks gate preserved (no delete affordance in boardMode)')

// Forbidden components stay absent from the early-return.
for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnJsx),
    `kiosk early-return still excludes <${comp}>`)
}
assert(!/styles\.assignDeleteBtn/.test(earlyReturnJsx),
  'kiosk early-return still excludes .assignDeleteBtn')

// No mutation-API call sites in the early-return — the arrows are
// pure local state changes.
for (const mutationCall of [
  'patchCrewAssignment(', 'patchOperationsNote(', 'patchAlert(',
  'createCrewAssignment(', 'createOperationsNote(', 'createAlert(',
  'deleteCrewAssignment(', 'deleteOperationsNote(', 'deleteAlert(',
  'fetch(',
]) {
  assert(!earlyReturnJsx.includes(mutationCall),
    `kiosk early-return performs no '${mutationCall}' (view-only invariant)`)
}

// Privacy invariants — no condition-log / private-notes references in
// the kiosk source.
for (const term of [
  'conditionLogStore', 'conditionLog/', 'private_notes', 'privateNotes',
  'course_condition', 'course-condition', '/api/condition-logs',
]) {
  assert(!DB.includes(term),
    `DisplayBoard.jsx does not reference '${term}'`)
}

// ── Translation rendering preserved (9C.5b3 + 9C.5c4 regression) ──────
section('Translation rendering preserved')

assert(/function\s+formatBilingualText/.test(DB),
  '9C.5b3: formatBilingualText helper preserved')
assert(/const\s+trimmedNotesEs\s*=\s*\(a\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  '9C.5b3: BoardModeCrewBars still computes trimmedNotesEs')
assert(/function\s+employeeNeedsSpanish\(employee\)/.test(DB),
  '9C.5c4: employeeNeedsSpanish helper preserved')
assert(/const\s+boardNeedsSpanish\s*=\s*operatorCards\.some\(op\s*=>\s*op\.showSpanishNotes\)/.test(DB),
  '9C.5c4: boardNeedsSpanish derivation preserved')

// ── 9C.5a date-top + marquee ordering preserved ───────────────────────
section('9C.5a date-top + marquee + crew bars ordering preserved')

const datePos    = earlyReturnJsx.search(/<header className=\{styles\.boardDateTop\}>/)
const marqueePos = earlyReturnJsx.search(/<BoardModeAlertMarquee\b/)
const barsPos    = earlyReturnJsx.search(/<BoardModeCrewBars\b/)
assert(datePos >= 0 && marqueePos >= 0 && barsPos >= 0,
  'date header + marquee + crew bars all present in early return')
assert(datePos < marqueePos && marqueePos < barsPos,
  'ordering date → marquee → bars preserved')

// ── Date-filtered data still derives from selectedDate ────────────────
section('Date-filtered derivations still read from selectedDate')

assert(/e\.startDate === selectedDate/.test(DB),
  'dayEvents filter still keys off `e.startDate === selectedDate`')
assert(/n\.noteDate === selectedDate/.test(DB),
  'dayNotes filter still keys off `n.noteDate === selectedDate`')

// ── Normal /display-board + print path unchanged ──────────────────────
section('Normal /display-board + print path unchanged')

for (const node of [
  '<BrandHeader', '<DateClockPanel', '<ConditionsPanel',
  '<WeatherImpactsPanel', '<EquipmentStatusPanel', '<ModeToggle',
  '<OperationalIntelligencePanel', '<CrewBriefingPanel', '<FieldConditionsPanel',
]) {
  assert(new RegExp(node).test(DB),
    `legacy ${node}…> still rendered outside the boardMode branch`)
}
assert(/printMode\s*&&\s*\(\s*<section className=\{styles\.printPage2\}/.test(DB),
  'printMode <section styles.printPage2> still preserved')

// The DateClockPanel admin date selector uses shiftDate too — confirm
// it still wires through onChange so the admin view's left/right still
// works (regression couple to the existing date-strip behavior).
assert(/shiftDate\(selectedDate,\s*-1\)/.test(DB) && /shiftDate\(selectedDate,\s*1\)/.test(DB),
  'admin DateClockPanel still uses shiftDate(selectedDate, -1) / shiftDate(selectedDate, 1)')

// ── Cross-file guards — 9C.6 is kiosk-render only ──────────────────────
section('Cross-file guards — worker / authoring / Employee Mgmt untouched')

for (const path of [
  'worker/index.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.6'),
    `${path} carries no Phase 9C.6 edits (kiosk render only)`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[4-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0053 (0053_employee_schedule_overrides accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
