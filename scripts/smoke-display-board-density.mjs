// Phase 9C.4c — Auto-fit kiosk board layout density smoke.
//
//   node scripts/smoke-display-board-density.mjs
//
// Source-only checks against DisplayBoard.jsx + its CSS. The kiosk
// (/display-board/board) now picks one of three density buckets
// based on roster + assignment counts and hands off to CSS attribute
// selectors so the rest of the responsiveness is pure CSS.
//
// All earlier kiosk invariants (9C.4b simplified branch, 9C.4a auth +
// 60 s refresh + midnight rollover, 9C.3b delete gate) remain in place.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

// Re-extract the boardMode early-return slice for the forbidden-component
// absence checks (regression couple to Phase 9C.4b).
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?)\)\s*\}/)
const earlyReturnSlice = earlyReturnMatch ? earlyReturnMatch[1] : ''

// ── BoardModeCrewBars density derivation ───────────────────────────────
section('BoardModeCrewBars — density derivation')

assert(/const\s+operatorCount\s*=\s*operatorCards\.length/.test(DB),
  'operatorCount = operatorCards.length')
assert(/const\s+assignmentCount\s*=\s*operatorCards\.reduce\(/.test(DB),
  'assignmentCount = operatorCards.reduce(...)')

// Exact ternary shape (compact first, then comfortable, then spacious).
assert(/operatorCount\s*>=\s*10\s*\|\|\s*assignmentCount\s*>=\s*16\s*\?\s*'compact'/.test(DB),
  "density ternary: operatorCount >= 10 || assignmentCount >= 16 → 'compact'")
assert(/operatorCount\s*>=\s*6\s*\|\|\s*assignmentCount\s*>=\s*10\s*\?\s*'comfortable'/.test(DB),
  "density ternary: operatorCount >= 6 || assignmentCount >= 10 → 'comfortable'")
assert(/:\s*'spacious'/.test(DB),
  "density ternary: default → 'spacious'")

// All three string literals present.
for (const bucket of ['spacious', 'comfortable', 'compact']) {
  assert(new RegExp(`['"]${bucket}['"]`).test(DB),
    `density bucket "${bucket}" string literal present`)
}

// Wrapper render attaches data-density. Phase 9C.4d added an inline
// style prop with CSS variables, so the opening tag is now multi-line;
// the regex tolerates any attribute order/whitespace between the
// className and the data-density attribute.
assert(/<div[\s\S]{0,400}className=\{styles\.boardBars\}[\s\S]{0,400}data-density=\{density\}/.test(DB),
  '<div styles.boardBars data-density={density} ...>')

// ── CSS density-aware rules ────────────────────────────────────────────
section('CSS — density-aware selectors + 100dvh + 2-col @1100px')

// Density attribute selectors are defined (spacious is documented as
// "no override" — accept either an empty rule or a commented selector).
assert(/\.boardBars\[data-density='spacious'\]/.test(CSS) ||
       /spacious[\s\S]{0,400}— < 6 operators/.test(CSS),
  ".boardBars[data-density='spacious'] selector is documented (no-override default)")
// Phase DAB.10e — Density selectors now target the inner wrapper
// (.boardBarsInner) for gap-bearing rules since layout moved there.
// Per-element overrides (e.g. .boardPersonName) still cascade via
// .boardBars[...] .selector since they're descendants of the outer.
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardBarsInner\s*\{/.test(CSS),
  ".boardBars[data-density='comfortable'] .boardBarsInner rule defined (DAB.10e)")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardBarsInner\s*\{/.test(CSS),
  ".boardBars[data-density='compact'] .boardBarsInner rule defined (DAB.10e)")

// clamp() text scaling preserved on the base classes (regression couple).
assert(/\.boardPersonName\s*\{[\s\S]{0,200}clamp\(/.test(CSS),
  '.boardPersonName uses clamp() for responsive sizing')
assert(/\.boardTaskText\s*\{[\s\S]{0,200}clamp\(/.test(CSS),
  '.boardTaskText uses clamp() for responsive sizing')
assert(/\.boardNotesText\s*\{[\s\S]{0,200}clamp\(/.test(CSS),
  '.boardNotesText uses clamp() for responsive sizing')

// .boardSimple gains 100dvh for mobile-browser URL-bar safety. Phase
// 9C.4d strengthened this from min-height to height + overflow:hidden
// so the inner .boardBars owns the scrollbar; accept either form.
assert(/\.boardSimple\s*\{[\s\S]{0,800}(?:min-height|height):\s*100dvh/.test(CSS),
  '.boardSimple has height: 100dvh (or min-height: 100dvh)')

// Compact mode has tighter spacing — verify with a small 8px gap term.
// Phase 9C.4e wrapped this in calc(8px * var(--board-bar-scale)) so the
// gap also shrinks with assignmentCount; accept either form.
// Phase DAB.10e — gap lives on .boardBarsInner now.
assert(/\.boardBars\[data-density='compact'\]\s+\.boardBarsInner\s*\{[\s\S]{0,200}gap:\s*(?:8px|calc\(\s*8px\s*\*\s*var\(--board-bar-scale)/.test(CSS),
  "compact mode tightens .boardBarsInner gap to 8px (scaled via --board-bar-scale or fixed)")

// Comfortable notes clamp to 3 lines.
assert(/\.boardBars\[data-density='comfortable'\]\s*\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*3/.test(CSS),
  "comfortable mode: .boardNotesText -webkit-line-clamp: 3")

// Compact notes clamp to 2 lines.
assert(/\.boardBars\[data-density='compact'\]\s*\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*2/.test(CSS),
  "compact mode: .boardNotesText -webkit-line-clamp: 2")

// Phase DAB.10g — @media-driven 2-col rule replaced with --board-
// columns CSS variable on .boardBarsInner. JSX picks the column count
// from stable inputs.
assert(/\.boardBarsInner\s*\{[\s\S]{0,1000}grid-template-columns:\s*repeat\(var\(--board-columns,\s*1\), minmax\(0,\s*1fr\)\)/.test(CSS),
  ".boardBarsInner uses grid-template-columns: repeat(var(--board-columns), …) — DAB.10g")

// ── Phase 9C.4b regression couples — early return + content shape ─────
section('Phase 9C.4b regression — early return + content preserved')

assert(/if \(boardMode && !printMode\)\s*\{\s*return \(/.test(DB),
  'boardMode early-return guard preserved')
assert(/<BoardModeCrewBars operatorCards=\{operatorCards\}\s*\/>/.test(DB),
  'early return still renders <BoardModeCrewBars operatorCards={operatorCards} />')
// Phase 9C.5a — accept either the new top header (boardDateTop) or the
// legacy bottom footer (boardDateOnly) for prettyDate(selectedDate).
// Phase 9C.6 — window widened to accommodate the arrow buttons that
// now sit between <header> and the date label.
assert(/<(?:header|footer) className=\{styles\.(?:boardDateTop|boardDateOnly)\}>[\s\S]{0,1200}\{prettyDate\(selectedDate\)\}/.test(DB),
  'early return still renders the date via prettyDate(selectedDate) (top header or legacy footer)')
assert(/No assignments for today\./.test(DB),
  'empty-state copy "No assignments for today." preserved')

// Forbidden components must still be absent from the boardMode branch.
for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnSlice),
    `boardMode early return still excludes <${comp}>`)
}
assert(!/styles\.dateStrip/.test(earlyReturnSlice),
  'boardMode early return still excludes .dateStrip')
assert(!/styles\.assignDeleteBtn/.test(earlyReturnSlice),
  'boardMode early return still excludes .assignDeleteBtn')

// ── Phase 9C.4a + 9C.3b regression couples ────────────────────────────
section('Phase 9C.4a + 9C.3b regression couples')

assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'Phase 9C.4a: KIOSK_REFRESH_MS = 60 * 1000 preserved')
assert(/const\s+intervalMs\s*=\s*printMode\s*\?\s*null\s*:\s*\(boardMode\s*\?\s*KIOSK_REFRESH_MS\s*:\s*BOARD_REFRESH_MS\)/.test(DB),
  'Phase 9C.4a: mode-aware intervalMs derivation preserved')
// Phase 9C.6 — boardMode rollover gated by !boardDateTouched; accept either form.
assert(/if \(boardMode(?:\s*&&\s*!boardDateTouched)?\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  'Phase 9C.4a: midnight rollover preserved')
assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'Phase 9C.3b: canDeleteTasks = !boardMode && !printMode preserved')

// ── Normal /display-board + print path still intact ───────────────────
section('Normal /display-board + print path unchanged')

for (const node of [
  '<BrandHeader', '<DateClockPanel', '<ConditionsPanel',
  '<WeatherImpactsPanel', '<EquipmentStatusPanel', '<ModeToggle',
  '<OperationalIntelligencePanel', '<CrewBriefingPanel', '<FieldConditionsPanel',
]) {
  assert(new RegExp(node).test(DB),
    `legacy ${node}…> still rendered somewhere outside the boardMode branch`)
}
for (const cls of ['dateStrip', 'taskBoard', 'notesColumn', 'sidebar']) {
  assert(new RegExp(`styles\\.${cls}\\b`).test(DB),
    `legacy styles.${cls} still referenced in the non-boardMode render`)
}
assert(/printMode\s*&&\s*\(\s*<section className=\{styles\.printPage2\}/.test(DB),
  'printMode <section styles.printPage2> still preserved')

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
  assert(!src.includes('Phase 9C.4c'),
    `${path} carries no Phase 9C.4c edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
