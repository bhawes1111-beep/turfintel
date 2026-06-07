// Phase 9C.4b — Simplified kiosk boardMode layout smoke.
//
//   node scripts/smoke-display-board-board-mode.mjs
//
// Source-only checks against DisplayBoard.jsx + its CSS. /display-board/
// /board now renders a stripped-down crew-bar layout via an early
// return; every other mode (normal /display-board, /display-board/print)
// keeps its existing JSX intact. The new branch is view-only — no
// sidebars, no notes column, no 7-day strip, no exit link, no delete
// buttons. The Phase 9C.4a auth + refresh wiring stays in place.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const CSS    = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

// Extract the early-return slice so absence checks can be scoped to it.
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?)\)\s*\}/)
const earlyReturnSlice = earlyReturnMatch ? earlyReturnMatch[1] : ''

// ── Early-return shape ─────────────────────────────────────────────────
section('boardMode early return — gate, wrapper, content')

assert(/if \(boardMode && !printMode\)\s*\{\s*return \(/.test(DB),
  'DisplayBoard guards the simplified branch with `if (boardMode && !printMode)`')
assert(earlyReturnSlice.length > 0,
  'early-return JSX block was extracted for the absence checks below')

// Wrapper uses the new boardSimple class layered on root + rootBoard.
assert(/className=\{`\$\{styles\.root\} \$\{styles\.rootBoard\} \$\{styles\.boardSimple\}`\}/.test(DB),
  'early return wraps in `${root} ${rootBoard} ${boardSimple}` template literal')
assert(/data-board-mode="true"/.test(DB),
  'early return preserves data-board-mode="true" attribute')

// Content: BoardModeCrewBars + the bottom date.
assert(/<BoardModeCrewBars operatorCards=\{operatorCards\}\s*\/>/.test(DB),
  'early return renders <BoardModeCrewBars operatorCards={operatorCards} />')
// Phase 9C.5a — Date moved from the bottom <footer> to a top <header>
// (.boardDateTop). The boardMode early return now renders the date FIRST,
// then the alert marquee, then the crew bars. Accept either the new
// .boardDateTop header or the legacy .boardDateOnly footer so this smoke
// keeps green across the transition; the dedicated marquee smoke pins
// down the new ordering precisely.
// Phase 9C.6 — the kiosk date header grew to include ‹ / › arrow
// buttons around the date label, so the window between the opening
// <header> tag and the {prettyDate(selectedDate)} expression widened.
// Accept the legacy direct-child form OR the new arrows-wrapped form.
assert(/<(?:header|footer) className=\{styles\.(?:boardDateTop|boardDateOnly)\}>[\s\S]{0,1200}\{prettyDate\(selectedDate\)\}/.test(DB),
  'early return renders the date via .boardDateTop (top, 9C.5a) or .boardDateOnly (legacy bottom)')

// ── BoardModeCrewBars component ────────────────────────────────────────
section('BoardModeCrewBars component')

assert(/function\s+BoardModeCrewBars\s*\(\s*\{\s*operatorCards\s*\}\s*\)/.test(DB),
  'function BoardModeCrewBars({ operatorCards }) is defined')

// Empty-state branch.
assert(/if \(!operatorCards \|\| operatorCards\.length === 0\)/.test(DB),
  'empty-state branch fires when operatorCards is empty')
assert(/No assignments for today\./.test(DB),
  'empty-state copy is exactly "No assignments for today."')

// Operator iteration and bar shape.
assert(/operatorCards\.map\(op =>\s*\(/.test(DB) ||
       /operatorCards\.map\(\s*op\s*=>/.test(DB),
  'BoardModeCrewBars iterates operatorCards.map(op => ...)')
assert(/<article key=\{op\.key\} className=\{styles\.boardPersonBar\}>/.test(DB),
  '<article styles.boardPersonBar> rendered per operator')
assert(/<h2 className=\{styles\.boardPersonName\}>\{op\.employeeName\s*\?\?\s*'Unassigned'\}<\/h2>/.test(DB),
  '<h2 styles.boardPersonName> renders employeeName (fallback "Unassigned")')

// Multi-task support: map over op.assignments inside the bar.
assert(/op\.assignments\.map\(\(a,\s*idx\)\s*=>/.test(DB) ||
       /op\.assignments\.map\(a\s*=>/.test(DB),
  'BoardModeCrewBars iterates op.assignments per operator (multi-task support)')
assert(/<div key=\{a\.id\s*\?\?\s*idx\} className=\{styles\.boardTaskBlock\}>/.test(DB),
  '<div styles.boardTaskBlock> wraps each task')
assert(/<p className=\{styles\.boardTaskText\}>\{a\.title\}<\/p>/.test(DB),
  '<p styles.boardTaskText>{a.title}</p> renders the task line')

// Notes only render when the trimmed string is non-empty.
assert(/const\s+trimmedNotes\s*=\s*\(a\.notes\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  'trimmedNotes = (a.notes ?? "").trim() — gating value computed per task')
assert(/trimmedNotes\.length > 0 &&\s*\(\s*<p className=\{styles\.boardNotesText\}>\{trimmedNotes\}<\/p>/.test(DB),
  'notes <p> renders only when trimmedNotes.length > 0')

// ── Forbidden components inside the early-return branch ────────────────
section('Forbidden components — must NOT appear inside the boardMode early return')

for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnSlice),
    `boardMode early return does NOT include <${comp}>`)
}
// 7-day strip is rendered via styles.dateStrip — the simplified branch
// must not reference it.
assert(!/styles\.dateStrip/.test(earlyReturnSlice),
  'boardMode early return does NOT include the 7-day .dateStrip footer')
// No assignment-row delete affordance either.
assert(!/styles\.assignDeleteBtn/.test(earlyReturnSlice),
  'boardMode early return does NOT include the .assignDeleteBtn ⋮ delete button')

// ── CSS classes ────────────────────────────────────────────────────────
section('CSS — new boardSimple / boardBars / boardPersonBar … classes')

for (const cls of [
  'boardSimple', 'boardBars', 'boardPersonBar', 'boardPersonName',
  'boardTaskBlock', 'boardTaskText', 'boardNotesText', 'boardEmpty',
  'boardDateOnly',
]) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
}

// ── Regression couples — 9C.4a + earlier phases ────────────────────────
section('Regression couples — 9C.4a auth + refresh, 9C.3b delete gate')

assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'Phase 9C.3b: canDeleteTasks = !boardMode && !printMode (delete still hidden)')
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'Phase 9C.4a: KIOSK_REFRESH_MS = 60 * 1000 preserved')
assert(/const\s+intervalMs\s*=\s*printMode\s*\?\s*null\s*:\s*\(boardMode\s*\?\s*KIOSK_REFRESH_MS\s*:\s*BOARD_REFRESH_MS\)/.test(DB),
  'Phase 9C.4a: mode-aware intervalMs derivation preserved')
// Phase 9C.6 — boardMode rollover gated by !boardDateTouched; accept either form.
assert(/if \(boardMode(?:\s*&&\s*!boardDateTouched)?\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  'Phase 9C.4a: boardMode midnight rollover preserved')

// ── Normal Display Board layout still intact (outside the boardMode branch) ──
section('Normal /display-board layout — sidebar / taskBoard / notesColumn / dateStrip preserved')

// The legacy return statement (with sidebar / taskBoard / notesColumn /
// dateStrip) lives BELOW the early-return guard. Verify each section
// still renders somewhere in the file.
for (const node of [
  '<BrandHeader',
  '<DateClockPanel',
  '<ConditionsPanel',
  '<WeatherImpactsPanel',
  '<EquipmentStatusPanel',
  '<ModeToggle',
  '<OperationalIntelligencePanel',
  '<CrewBriefingPanel',
  '<FieldConditionsPanel',
]) {
  assert(new RegExp(node).test(DB),
    `legacy ${node}…> still rendered (preserved outside the boardMode branch)`)
}
// dateStrip + taskBoard + notesColumn class references survive.
for (const cls of ['dateStrip', 'taskBoard', 'notesColumn', 'sidebar']) {
  assert(new RegExp(`styles\\.${cls}\\b`).test(DB),
    `legacy styles.${cls} still referenced in the non-boardMode render`)
}

// Print path is still independent.
assert(/printMode\s*&&\s*\(\s*<section className=\{styles\.printPage2\}/.test(DB),
  'printMode <section className={styles.printPage2}> is preserved (untouched by 9C.4b)')

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — worker / D1 / stores / DAB / OB untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'worker/api/calendar.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.4b'),
    `${path} carries no Phase 9C.4b edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
