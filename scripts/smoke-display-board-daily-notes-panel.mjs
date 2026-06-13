// Phase 9C.10 — Daily Notes strip on the kiosk Display Board smoke.
//
//   node scripts/smoke-display-board-daily-notes-panel.mjs
//
// Adds a compact bilingual read-only Daily Notes strip to the public
// /display-board/board kiosk, mounted under the date header and above
// the red alert marquee. Uses the existing dayNotes useMemo (already
// selectedDate-filtered, active-only, pinned/priority sorted).
//
// This is a UI sub-phase only — no worker, schema, translation
// provider, or admin/print Display Board behavior changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',        'utf8')
const DB_CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

// ── Component exists ──────────────────────────────────────────────────
section('BoardModeDailyNotes — component defined')

assert(/function\s+BoardModeDailyNotes\s*\(\s*\{\s*notes\s*\}\s*\)\s*\{/.test(DB),
  'BoardModeDailyNotes({ notes }) function defined')

// Extract the component body for downstream assertions.
const compMatch = DB.match(/function\s+BoardModeDailyNotes\s*\(\s*\{\s*notes\s*\}\s*\)\s*\{[\s\S]*?\n\}\n/)
const compSrc   = compMatch ? compMatch[0] : ''
assert(compSrc.length > 0, 'BoardModeDailyNotes body extracted')

// ── Empty-state — returns null when notes empty ──────────────────────
section('Empty state — returns null on empty input')

assert(/if\s*\(\s*!notes\s*\|\|\s*notes\.length\s*===\s*0\s*\)\s*return\s+null/.test(compSrc),
  'BoardModeDailyNotes returns null when (!notes || notes.length === 0)')

// ── Placement — boardMode early-return only, between date + marquee ──
section('Placement — boardMode early-return, between boardDateTop and BoardModeAlertMarquee')

// Locate the boardMode && !printMode early-return span.
const boardModeMatch = DB.match(/if \(boardMode && !printMode\)\s*\{[\s\S]*?\n\s*\}/)
const boardModeSrc   = boardModeMatch ? boardModeMatch[0] : ''
assert(boardModeSrc.length > 0, 'boardMode && !printMode early-return extracted')

assert(/<BoardModeDailyNotes\s+notes=\{dayNotes\}\s*\/>/.test(boardModeSrc),
  '<BoardModeDailyNotes notes={dayNotes} /> mounted inside the boardMode early-return')

const dateHeaderIdx   = boardModeSrc.indexOf('</header>')
const dailyNotesIdx   = boardModeSrc.indexOf('<BoardModeDailyNotes')
const alertMarqueeIdx = boardModeSrc.indexOf('<BoardModeAlertMarquee')
const crewBarsIdx     = boardModeSrc.indexOf('<BoardModeCrewBars')

assert(dateHeaderIdx >= 0 && dailyNotesIdx >= 0 && alertMarqueeIdx >= 0 && crewBarsIdx >= 0,
  'all four JSX anchors located inside boardMode early-return')
assert(dailyNotesIdx > dateHeaderIdx,
  '<BoardModeDailyNotes> renders AFTER the date </header>')
assert(dailyNotesIdx < alertMarqueeIdx,
  '<BoardModeDailyNotes> renders BEFORE <BoardModeAlertMarquee>')
assert(alertMarqueeIdx < crewBarsIdx,
  'alert marquee still precedes crew bars (existing layout preserved)')

// Component is only rendered inside the kiosk early-return. The normal
// admin Display Board path (the JSX after the early-return) must NOT
// reference it.
const tailMatch = DB.match(/if \(boardMode && !printMode\)\s*\{[\s\S]*?\n\s*\}\n([\s\S]*)$/)
const tailSrc   = tailMatch ? tailMatch[1] : ''
assert(tailSrc.length > 0, 'admin/print tail extracted')
assert(!/<BoardModeDailyNotes/.test(tailSrc),
  'BoardModeDailyNotes is NOT rendered outside the boardMode early-return (admin/print untouched)')

// ── Filtering — selectedDate + active status, no archived/deleted ─────
section('Daily notes filtering — selectedDate, active-only, pinned/priority sort')

// dayNotes already enforces all the filter contract upstream — assert
// that derivation is intact (regression couple for the kiosk panel).
const dayNotesMatch = DB.match(/const\s+dayNotes\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[[^\]]+\]\)/)
const dayNotesSrc   = dayNotesMatch ? dayNotesMatch[0] : ''
assert(dayNotesSrc.length > 0, 'dayNotes useMemo body extracted')

assert(/\(dailyNotes\s*\?\?\s*\[\]\)/.test(dayNotesSrc),
  'dayNotes guards null dailyNotes via ?? []')
assert(/n\.status\s*===\s*['"]active['"]/.test(dayNotesSrc),
  "dayNotes restricts to status === 'active' (excludes archived/deleted/anything else)")
assert(!/status\s*===\s*['"]archived['"]/.test(dayNotesSrc),
  "dayNotes does NOT inadvertently include archived status")
assert(!/status\s*===\s*['"]deleted['"]/.test(dayNotesSrc),
  "dayNotes does NOT inadvertently include deleted status")
assert(/n\.noteDate\s*===\s*selectedDate/.test(dayNotesSrc),
  'dayNotes filters by n.noteDate === selectedDate')
assert(/if \(a\.pinned !== b\.pinned\)\s*return\s+a\.pinned\s*\?\s*-1\s*:\s*1/.test(dayNotesSrc),
  'dayNotes sort: pinned first')
assert(/NOTE_PRIORITY_ORDER\[a\.priority\]/.test(dayNotesSrc),
  'dayNotes sort uses NOTE_PRIORITY_ORDER lookup')
assert(/\}, \[dailyNotes,\s*selectedDate\]\)/.test(dayNotesSrc),
  'dayNotes useMemo deps include [dailyNotes, selectedDate]')

// NOTE_PRIORITY_ORDER module constant pins urgent/safety/weather above
// important/routine — required by phase spec.
assert(/const\s+NOTE_PRIORITY_ORDER\s*=\s*\{[\s\S]*?urgent:\s*0[\s\S]*?safety:\s*1[\s\S]*?weather:\s*2[\s\S]*?important:\s*3[\s\S]*?routine:\s*4/.test(DB),
  'NOTE_PRIORITY_ORDER constant pins urgent/safety/weather before important/routine')

// ── English + Spanish rendering ───────────────────────────────────────
section('English + Spanish rendering')

assert(/const\s+titleTrim\s*=\s*\(n\.title\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(compSrc),
  'titleTrim derived from (n.title ?? "").trim() before render gate')
assert(/const\s+bodyTrim\s*=\s*\(n\.body\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(compSrc),
  'bodyTrim derived from (n.body ?? "").trim()')
assert(/const\s+titleEsTrim\s*=\s*\(n\.titleEs\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(compSrc),
  'titleEsTrim derived from (n.titleEs ?? "").trim()')
assert(/const\s+bodyEsTrim\s*=\s*\(n\.bodyEs\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(compSrc),
  'bodyEsTrim derived from (n.bodyEs ?? "").trim()')

assert(/titleTrim && <strong className=\{styles\.boardDailyNoteTitle\}>\{titleTrim\}<\/strong>/.test(compSrc),
  'English title renders inside <strong styles.boardDailyNoteTitle> when non-empty')
assert(/bodyTrim\s*&& <span\s+className=\{styles\.boardDailyNoteBody\}>\{bodyTrim\}<\/span>/.test(compSrc),
  'English body renders inside <span styles.boardDailyNoteBody> when non-empty')

assert(/const\s+hasSpanish\s*=\s*titleEsTrim\.length > 0 \|\| bodyEsTrim\.length > 0/.test(compSrc),
  'hasSpanish computed from titleEsTrim/bodyEsTrim lengths')
assert(/hasSpanish && \(\s*\n?\s*<span className=\{styles\.boardDailyNoteSpanish\}\s+lang="es"/.test(compSrc),
  '<span styles.boardDailyNoteSpanish lang="es"> renders when hasSpanish')

// Priority + pinned data-attrs are exposed for CSS accents.
assert(/data-priority=\{n\.priority\}/.test(compSrc),
  'item exposes data-priority={n.priority} for CSS accent stripes')
assert(/data-pinned=\{n\.pinned\s*\?\s*['"]true['"]\s*:\s*undefined\}/.test(compSrc),
  'item exposes data-pinned="true" when pinned (undefined otherwise)')

// ── Private notes invariant — never referenced anywhere in DB ────────
section('Private-notes invariant — kiosk never references private fields')

assert(!/privateNotes/.test(DB),
  'DisplayBoard.jsx makes no reference to privateNotes (operations notes have no private field; the kiosk must never invent one)')
assert(!/private_notes/.test(DB),
  'DisplayBoard.jsx makes no reference to private_notes (snake_case)')
// Defensive: also check the BoardModeDailyNotes body specifically.
assert(!/private/i.test(compSrc),
  'BoardModeDailyNotes body contains no "private" reference at all')

// ── Read-only — no edit/delete buttons inside the component ───────────
section('Read-only — no buttons or mutation handlers in BoardModeDailyNotes')

assert(!/<button\b/.test(compSrc),
  'BoardModeDailyNotes contains no <button> elements')
for (const forbidden of [
  'onClick', 'onChange', 'onInput', 'onSubmit',
  'patchOperationsNote', 'createOperationsNote', 'deleteOperationsNote',
  'archiveOperationsNote', 'unarchiveOperationsNote', 'togglePin',
  'refreshOperationsNotesData',
]) {
  assert(!compSrc.includes(forbidden),
    `BoardModeDailyNotes does NOT reference "${forbidden}" (read-only invariant)`)
}

// ── CSS — required kiosk classes defined ──────────────────────────────
section('CSS — kiosk daily-notes classes defined')

for (const cls of [
  'boardDailyNotes',
  'boardDailyNotesHeader',
  'boardDailyNotesList',
  'boardDailyNoteItem',
  'boardDailyNoteTitle',
  'boardDailyNoteBody',
  'boardDailyNoteSpanish',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(DB_CSS),
    `CSS rule .${cls} defined`)
}

// Priority accents — pin all five.
for (const p of ['urgent', 'safety', 'weather', 'important', 'routine']) {
  assert(new RegExp(`\\.boardDailyNoteItem\\[data-priority="${p}"\\]\\s*\\{`).test(DB_CSS),
    `CSS priority accent .boardDailyNoteItem[data-priority="${p}"] defined`)
}
assert(/\.boardDailyNoteItem\[data-pinned="true"\]\s*\{/.test(DB_CSS),
  '.boardDailyNoteItem[data-pinned="true"] accent defined')

// Panel has a max-height + overflow.
assert(/\.boardDailyNotes\s*\{[\s\S]{0,600}max-height:\s*\d+vh/.test(DB_CSS),
  '.boardDailyNotes clamps max-height with a vh-based cap')
assert(/\.boardDailyNotes\s*\{[\s\S]{0,600}overflow-y:\s*auto/.test(DB_CSS),
  '.boardDailyNotes sets overflow-y: auto (scrolls when many notes)')

// Kiosk scale variable respected.
assert(/\.boardDailyNotes\s*\{[\s\S]{0,800}var\(--board-bar-scale,\s*1\)/.test(DB_CSS),
  '.boardDailyNotes scales with --board-bar-scale where practical')

// Short-height media query tightens the panel.
assert(/@media\s*\(max-height:\s*760px\)\s*\{[\s\S]*?\.boardDailyNotes\s*\{/.test(DB_CSS),
  '@media (max-height: 760px) tightens .boardDailyNotes')

// ── Alert marquee + crew bars still present (regression couple) ──────
section('Regression couple — alert marquee + crew bars still wired')

assert(/<BoardModeAlertMarquee\s+alerts=\{kioskAlerts\}\s*\/>/.test(DB),
  'BoardModeAlertMarquee still rendered with kioskAlerts')
assert(/<BoardModeCrewBars\s+operatorCards=\{operatorCards\}\s*\/>/.test(DB),
  'BoardModeCrewBars still rendered with operatorCards')
assert(/function\s+BoardModeAlertMarquee\s*\(/.test(DB),
  'BoardModeAlertMarquee function still defined')
assert(/function\s+BoardModeCrewBars\s*\(/.test(DB),
  'BoardModeCrewBars function still defined')

// ── Admin Display Board untouched ─────────────────────────────────────
section('Admin Display Board path — DateClockPanel + CrewBriefingPanel preserved')

assert(/<DateClockPanel/.test(tailSrc),
  'admin path still renders <DateClockPanel> (DAB date+arrows in non-kiosk)')
assert(/<CrewBriefingPanel notes=\{dayNotes\}/.test(tailSrc),
  'admin path still renders <CrewBriefingPanel notes={dayNotes} ...>')
assert(/<ModeToggle/.test(tailSrc),
  'admin path still renders <ModeToggle> (admin-only kiosk-switch button)')

// ── Print path untouched ─────────────────────────────────────────────
section('Print path — /display-board/print render preserved')

// Both printMode-gated CrewBriefingPanel renders should still exist.
const printRenders = (DB.match(/\{printMode && \(/g) ?? []).length
assert(printRenders >= 2,
  `at least two {printMode && (...)} render branches preserved (found ${printRenders})`)
assert(/data-print-mode=\{printMode\s*\?\s*['"]true['"]\s*:\s*undefined\}/.test(DB),
  'admin/print wrapper data-print-mode attribute preserved')

// ── Cross-file guards ─────────────────────────────────────────────────
section('Cross-file guards — worker/API/translation/DAB untouched by 9C.10')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/operations/notesStore.js',
  'src/utils/translate/translateClient.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.10'),
    `${path} carries no Phase 9C.10 edits (kiosk-only sub-phase)`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[3-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0052 (0052_spray_compliance_snapshots accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Existing translation contract still wired (regression couples) ────
section('Translation contract — unchanged by 9C.10')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  '9C.8 scheduleTranslationSweep helper still exported')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/UPDATE crew_assignments[\s\S]{0,400}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'race-safe UPDATE guard for crew_assignments still intact')
assert(/UPDATE operations_daily_notes[\s\S]{0,800}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'race-safe UPDATE guard for operations_daily_notes title_es still intact')
assert(/UPDATE operations_daily_notes[\s\S]{0,800}\(body_es IS NULL OR TRIM\(body_es\) = ''\)/.test(AT),
  'race-safe UPDATE guard for operations_daily_notes body_es still intact')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
