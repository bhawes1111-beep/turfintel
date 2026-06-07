// Phase 9C.4d — Dynamic kiosk shrink + TV safe-area fit smoke.
//
//   node scripts/smoke-display-board-shrink.mjs
//
// Source-only checks against DisplayBoard.jsx + its CSS. The kiosk
// (/display-board/board) now tightens bars smoothly as assignments
// grow via a CSS custom property --board-bar-scale, and locks the
// viewport-height layout so the bottom date stays visible. Phase
// 9C.4c bucket-based density, Phase 9C.4a auth + 60s refresh +
// midnight rollover, Phase 9C.4b simplified branch + forbidden-
// component absences, and Phase 9C.3b delete gate all preserved.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

// Extract the boardMode early-return slice for forbidden-component checks.
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?)\)\s*\}/)
const earlyReturnSlice = earlyReturnMatch ? earlyReturnMatch[1] : ''

// ── boardBarScale derivation ───────────────────────────────────────────
section('boardBarScale derivation (BoardModeCrewBars)')

// Regression couples — 9C.4c density inputs must still be computed.
assert(/const\s+operatorCount\s*=\s*operatorCards\.length/.test(DB),
  'operatorCount = operatorCards.length still present')
assert(/const\s+assignmentCount\s*=\s*operatorCards\.reduce\(/.test(DB),
  'assignmentCount = operatorCards.reduce(...) still present')

// The new scale formula. Exact shape: Math.max(0.72, Math.min(1, 1 - Math.max(0, assignmentCount - 2) * 0.035)).
assert(/const\s+boardBarScale\s*=\s*Math\.max\(/.test(DB),
  'boardBarScale = Math.max(...) defined')
assert(/boardBarScale\s*=\s*Math\.max\(\s*0\.45\s*,/.test(DB),
  'boardBarScale floor: Math.max(0.45, …) — lower than the previous 0.5 floor')
assert(/Math\.min\(\s*0\.66\s*,\s*0\.66/.test(DB),
  'boardBarScale start/ceiling: Math.min(0.66, 0.66 - …) — board now starts at ~2/3 size')
assert(/Math\.max\(\s*0\s*,\s*assignmentCount\s*-\s*2\s*\)\s*\*\s*0\.025/.test(DB),
  'boardBarScale uses assignmentCount - 2 multiplied by 0.025 (slower decrement than the previous 0.035)')

// Negative guards — earlier formula shapes must not survive.
assert(!/boardBarScale\s*=\s*Math\.max\(\s*0\.72\s*,/.test(DB),
  'old 0.72 floor for boardBarScale is not present')
assert(!/boardBarScale\s*=\s*Math\.max\(\s*0\.5\s*,/.test(DB),
  'previous 0.5 floor for boardBarScale is not present (replaced by 0.45)')
assert(!/boardBarScale[\s\S]{0,80}Math\.min\(\s*1\s*,/.test(DB),
  'previous 1.0 ceiling for boardBarScale is not present (replaced by 0.66 start)')
assert(!/boardBarScale[\s\S]{0,120}Math\.max\(\s*0\s*,\s*assignmentCount\s*-\s*5\s*\)\s*\*\s*0\.035/.test(DB),
  'old assignmentCount - 5 formula is not present')
assert(!/boardBarScale[\s\S]{0,200}assignmentCount\s*-\s*2\s*\)\s*\*\s*0\.035/.test(DB),
  'previous 0.035 decrement is not present (replaced by 0.025)')

// ── boardBars wrapper carries inline CSS variables ─────────────────────
section('boardBars inline style — CSS variables')

assert(/<div[\s\S]{0,600}className=\{styles\.boardBars\}[\s\S]{0,600}style=\{\{[\s\S]{0,400}'--board-bar-scale':\s*boardBarScale/.test(DB),
  "boardBars wrapper sets '--board-bar-scale': boardBarScale inline")
assert(/'--board-operator-count':\s*operatorCount/.test(DB),
  "boardBars wrapper sets '--board-operator-count': operatorCount inline")
assert(/'--board-assignment-count':\s*assignmentCount/.test(DB),
  "boardBars wrapper sets '--board-assignment-count': assignmentCount inline")

// Regression couple — 9C.4c data-density attribute survives.
assert(/data-density=\{density\}/.test(DB),
  'Phase 9C.4c: data-density={density} still on wrapper')

// ── CSS uses var(--board-bar-scale) in calc() ─────────────────────────
section('CSS — var(--board-bar-scale) in calc() expressions')

// At least 4 calc(var(--board-bar-scale)) sites (gap, padding,
// person-name max, task-text max, notes max).
const scaleVarCount = (CSS.match(/var\(--board-bar-scale/g) ?? []).length
assert(scaleVarCount >= 4,
  `CSS references var(--board-bar-scale) in at least 4 places (found ${scaleVarCount})`)

// Each key target gets the scale.
assert(/\.boardBars\s*\{[\s\S]{0,800}gap:\s*calc\(\s*18px\s*\*\s*var\(--board-bar-scale/.test(CSS),
  '.boardBars gap uses calc(18px * var(--board-bar-scale, 1))')
assert(/\.boardPersonBar\s*\{[\s\S]{0,600}padding:\s*calc\([\s\S]{0,60}var\(--board-bar-scale/.test(CSS),
  '.boardPersonBar padding uses calc(... * var(--board-bar-scale))')
assert(/\.boardPersonName\s*\{[\s\S]{0,600}clamp\([\s\S]{0,100}calc\([\s\S]{0,60}var\(--board-bar-scale/.test(CSS),
  '.boardPersonName clamp() max uses calc(48px * var(--board-bar-scale))')
assert(/\.boardTaskText\s*\{[\s\S]{0,400}clamp\([\s\S]{0,100}calc\([\s\S]{0,60}var\(--board-bar-scale/.test(CSS),
  '.boardTaskText clamp() max uses calc(36px * var(--board-bar-scale))')
assert(/\.boardNotesText\s*\{[\s\S]{0,400}clamp\([\s\S]{0,100}calc\([\s\S]{0,60}var\(--board-bar-scale/.test(CSS),
  '.boardNotesText clamp() max uses calc(26px * var(--board-bar-scale))')

// ── Viewport-height safe-area layout fix ───────────────────────────────
section('CSS — .boardSimple/.boardBars/.boardDateOnly safe-area layout')

assert(/\.boardSimple\s*\{[\s\S]{0,800}height:\s*100dvh/.test(CSS),
  '.boardSimple has height: 100dvh (locks wrapper to viewport)')
assert(/\.boardSimple\s*\{[\s\S]{0,800}overflow:\s*hidden/.test(CSS),
  '.boardSimple has overflow: hidden (page no longer scrolls; inner bars own scrolling)')

assert(/\.boardBars\s*\{[\s\S]{0,800}flex:\s*1\s+1\s+auto/.test(CSS),
  '.boardBars has flex: 1 1 auto')
assert(/\.boardBars\s*\{[\s\S]{0,800}min-height:\s*0/.test(CSS),
  '.boardBars has min-height: 0 (REQUIRED for overflow-y: auto to engage on flex child)')
assert(/\.boardBars\s*\{[\s\S]{0,800}overflow-y:\s*auto/.test(CSS),
  '.boardBars has overflow-y: auto')

assert(/\.boardDateOnly\s*\{[\s\S]{0,800}flex:\s*0\s+0\s+auto/.test(CSS),
  '.boardDateOnly has explicit flex: 0 0 auto (anchors bottom regardless of bar count)')

// ── Short-height media query ───────────────────────────────────────────
section('CSS — @media (max-height: 760px) short-viewport rules')

assert(/@media\s*\(\s*max-height:\s*760px\s*\)\s*\{/.test(CSS),
  '@media (max-height: 760px) block exists')

// Short-height block tightens key surfaces.
const shortHeightMatch = CSS.match(/@media\s*\(\s*max-height:\s*760px\s*\)\s*\{([\s\S]*?)\n\}/)
const shortHeightBody = shortHeightMatch ? shortHeightMatch[1] : ''
// Phase 9C.4e — short-height block tightens via scaled calc() too, so we
// accept either the fixed 16px form (legacy) or calc(16px * var(...)).
assert(/\.boardSimple\s*\{[\s\S]{0,200}padding-block:\s*(?:16px|calc\(\s*16px\s*\*\s*var\(--board-bar-scale)/.test(shortHeightBody),
  'short-height: .boardSimple padding-block at 16px (scaled or fixed)')
assert(/\.boardPersonBar\s*\{[\s\S]{0,200}padding:\s*calc/.test(shortHeightBody),
  'short-height: .boardPersonBar tightens padding')
assert(/\.boardPersonName\s*\{[\s\S]{0,200}font-size:\s*clamp\([\s\S]{0,80}28px/.test(shortHeightBody),
  'short-height: .boardPersonName font-size clamp(min, vw, calc(28px * scale))')
assert(/\.boardTaskText\s*\{[\s\S]{0,200}font-size:\s*clamp\([\s\S]{0,80}22px/.test(shortHeightBody),
  'short-height: .boardTaskText font-size clamp(min, vw, calc(22px * scale))')
assert(/\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*2/.test(shortHeightBody),
  'short-height: .boardNotesText clamps to 2 lines')
assert(/\.boardDateOnly\s*\{[\s\S]{0,400}padding:\s*(?:10px|calc\(\s*10px\s*\*\s*var\(--board-bar-scale)/.test(shortHeightBody),
  'short-height: .boardDateOnly padding starts at 10px (scaled or fixed)')

// ── 9C.4c density buckets preserved ────────────────────────────────────
section('Phase 9C.4c regression — density buckets preserved')

assert(/operatorCount\s*>=\s*10\s*\|\|\s*assignmentCount\s*>=\s*16\s*\?\s*'compact'/.test(DB),
  "density ternary still maps 10+ operators or 16+ assignments → 'compact'")
assert(/operatorCount\s*>=\s*6\s*\|\|\s*assignmentCount\s*>=\s*10\s*\?\s*'comfortable'/.test(DB),
  "density ternary still maps 6+ operators or 10+ assignments → 'comfortable'")
assert(/:\s*'spacious'/.test(DB),
  "density ternary default → 'spacious'")

assert(/\.boardBars\[data-density='comfortable'\]/.test(CSS),
  "9C.4c comfortable density rule preserved")
assert(/\.boardBars\[data-density='compact'\]/.test(CSS),
  "9C.4c compact density rule preserved")
assert(/\.boardBars\[data-density='compact'\][\s\S]{0,200}\.boardNotesText[\s\S]{0,200}-webkit-line-clamp:\s*2/.test(CSS),
  '9C.4c compact notes still clamp to 2 lines')

assert(/@media\s*\(\s*min-width:\s*1100px\s*\)\s*\{[\s\S]{0,400}\.boardBars\[data-density='compact'\][\s\S]{0,300}grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(CSS),
  '9C.4c 2-column compact rule at @media (min-width: 1100px) preserved')

// ── Phase 9C.4e — density rules must be scale-aware ────────────────────
section('Phase 9C.4e — density overrides scale with --board-bar-scale')

// Comfortable density — every surface goes through calc(* var(--board-bar-scale)).
assert(/\.boardBars\[data-density='comfortable'\]\s*\{[\s\S]{0,200}gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardBars gap uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardPersonBar\s*\{[\s\S]{0,400}padding:[\s\S]{0,200}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardPersonBar padding uses var(--board-bar-scale)")
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardPersonBar\s*\{[\s\S]{0,400}gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardPersonBar inner gap uses var(--board-bar-scale)")
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardPersonName\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardPersonName clamp() max uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardTaskText\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardTaskText clamp() max uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardNotesText\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "comfortable: .boardNotesText clamp() max uses calc(... * var(--board-bar-scale))")

// Compact density — same: every surface goes through calc(* var(--board-bar-scale)).
assert(/\.boardBars\[data-density='compact'\]\s*\{[\s\S]{0,200}gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "compact: .boardBars gap uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardPersonBar\s*\{[\s\S]{0,400}padding:[\s\S]{0,200}var\(--board-bar-scale/.test(CSS),
  "compact: .boardPersonBar padding uses var(--board-bar-scale)")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardPersonBar\s*\{[\s\S]{0,400}gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "compact: .boardPersonBar inner gap uses var(--board-bar-scale)")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardPersonName\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "compact: .boardPersonName clamp() max uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardTaskText\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "compact: .boardTaskText clamp() max uses calc(... * var(--board-bar-scale))")
assert(/\.boardBars\[data-density='compact'\]\s+\.boardNotesText\s*\{[\s\S]{0,200}clamp\([\s\S]{0,100}calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "compact: .boardNotesText clamp() max uses calc(... * var(--board-bar-scale))")

// 2-column compact grid gaps must also scale.
assert(/@media\s*\(\s*min-width:\s*1100px\s*\)\s*\{[\s\S]{0,600}\.boardBars\[data-density='compact'\][\s\S]{0,400}column-gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "2-column compact @1100px: column-gap uses calc(... * var(--board-bar-scale))")
assert(/@media\s*\(\s*min-width:\s*1100px\s*\)\s*\{[\s\S]{0,600}\.boardBars\[data-density='compact'\][\s\S]{0,400}row-gap:\s*calc\([\s\S]{0,40}var\(--board-bar-scale/.test(CSS),
  "2-column compact @1100px: row-gap uses calc(... * var(--board-bar-scale))")

// Negative guards — the old fixed-px density shapes must be gone.
assert(!/\.boardBars\[data-density='comfortable'\]\s*\{\s*gap:\s*12px;\s*\}/.test(CSS),
  "no fixed 'comfortable { gap: 12px }' rule (replaced by scaled gap)")
assert(!/\.boardBars\[data-density='comfortable'\]\s+\.boardPersonBar\s*\{\s*padding:\s*16px\s+22px;/.test(CSS),
  "no fixed 'comfortable .boardPersonBar { padding: 16px 22px }' rule (replaced by scaled padding)")
assert(!/\.boardBars\[data-density='comfortable'\]\s+\.boardPersonName\s*\{\s*font-size:\s*clamp\(\s*24px\s*,\s*2\.6vw\s*,\s*38px\s*\)/.test(CSS),
  "no fixed 'comfortable .boardPersonName clamp(24px, 2.6vw, 38px)' (replaced by scaled max)")
assert(!/\.boardBars\[data-density='comfortable'\]\s+\.boardTaskText\s*\{\s*font-size:\s*clamp\(\s*20px\s*,\s*2vw\s*,\s*30px\s*\)/.test(CSS),
  "no fixed 'comfortable .boardTaskText clamp(20px, 2vw, 30px)' (replaced by scaled max)")
assert(!/\.boardBars\[data-density='comfortable'\]\s+\.boardNotesText\s*\{\s*font-size:\s*clamp\(\s*16px\s*,\s*1\.6vw\s*,\s*22px\s*\)/.test(CSS),
  "no fixed 'comfortable .boardNotesText clamp(16px, 1.6vw, 22px)' (replaced by scaled max)")

assert(!/\.boardBars\[data-density='compact'\]\s*\{\s*gap:\s*8px;\s*\}/.test(CSS),
  "no fixed 'compact { gap: 8px }' rule (replaced by scaled gap)")
assert(!/\.boardBars\[data-density='compact'\]\s+\.boardPersonBar\s*\{\s*padding:\s*12px\s+16px;/.test(CSS),
  "no fixed 'compact .boardPersonBar { padding: 12px 16px }' rule (replaced by scaled padding)")
assert(!/\.boardBars\[data-density='compact'\]\s+\.boardPersonName\s*\{\s*font-size:\s*clamp\(\s*20px\s*,\s*2\.2vw\s*,\s*30px\s*\)/.test(CSS),
  "no fixed 'compact .boardPersonName clamp(20px, 2.2vw, 30px)' (replaced by scaled max)")
assert(!/\.boardBars\[data-density='compact'\]\s+\.boardTaskText\s*\{\s*font-size:\s*clamp\(\s*18px\s*,\s*1\.7vw\s*,\s*24px\s*\)/.test(CSS),
  "no fixed 'compact .boardTaskText clamp(18px, 1.7vw, 24px)' (replaced by scaled max)")
assert(!/\.boardBars\[data-density='compact'\]\s+\.boardNotesText\s*\{\s*font-size:\s*clamp\(\s*14px\s*,\s*1\.4vw\s*,\s*18px\s*\)/.test(CSS),
  "no fixed 'compact .boardNotesText clamp(14px, 1.4vw, 18px)' (replaced by scaled max)")

assert(!/@media\s*\(\s*min-width:\s*1100px\s*\)\s*\{[\s\S]{0,600}\.boardBars\[data-density='compact'\][\s\S]{0,400}column-gap:\s*14px;/.test(CSS),
  "2-column compact @1100px: no fixed column-gap: 14px (replaced by scaled)")
assert(!/@media\s*\(\s*min-width:\s*1100px\s*\)\s*\{[\s\S]{0,600}\.boardBars\[data-density='compact'\][\s\S]{0,400}row-gap:\s*10px;/.test(CSS),
  "2-column compact @1100px: no fixed row-gap: 10px (replaced by scaled)")

// ── 9C.4a + 9C.3b regression couples ──────────────────────────────────
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

// ── 9C.4b regression — early return + forbidden absences ──────────────
section('Phase 9C.4b regression — early return + content shape preserved')

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

// ── Normal /display-board + print path unchanged ──────────────────────
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

// ── Cross-file guards ─────────────────────────────────────────────────
section('Cross-file guards — DAB / OB / TMM / stores / worker untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'worker/api/calendar.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.4d'),
    `${path} carries no Phase 9C.4d edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
