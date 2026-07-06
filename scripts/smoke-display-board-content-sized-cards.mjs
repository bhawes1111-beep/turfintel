// Phase DAB.10m — Content-sized display board cards smoke.
//
//   node scripts/smoke-display-board-content-sized-cards.mjs
//
// User report: DAB.10j's targetCardHeight logic stretched every card
// in a grid row to viewport.h / rowCount px. Short cards (name + one
// task, no notes) had large empty regions inside; a long Jose card
// forced parallel Bryan Hawes card to the same tall height.
//
// DAB.10m fix:
//   • Remove targetCardHeight arithmetic (HEADER_AND_PADDING /
//     CONFIGURED_ROW_GAP / availableRosterHeight / rowCount).
//   • Remove --board-target-card-height inline CSS var + the
//     .boardPersonBar min-height rule that read it.
//   • Replace CSS grid on `.boardBarsInner` with a flex ROW of
//     independent `.boardColumn` stacks. Cards in one column no
//     longer affect heights of cards in the other column.
//   • Split operatorCards into `columns` arrays preserving vertical
//     reading order (8 ops in 2 cols → [[1-4], [5-8]]).
//   • Extract single reusable renderOperatorCard(op) function so
//     both column stacks call the same JSX (one card markup path).
//   • Preserve deterministic column count (mobile 1, ≥1600px+ultra 3,
//     ≥900px 2, else 1) from JS — no @media grid override.
//   • Preserve DAB.10l dual English + Spanish rendering, DAB.10g.1
//     typography ratios, DAB.10g deterministic buckets.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const KIOSK_CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',      'utf8')

// ── Frontend-only ────────────────────────────────────────────────
section('Frontend-only — no worker / migration / API changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (DAB.10m is JSX/CSS-only)')

for (const path of [
  'worker/api/assignments.js',
  'worker/index.js',
  'worker/lib/autoTranslate.js',
  'worker/lib/translate.js',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10m'),
    `${path} carries no Phase DAB.10m edits`)
}

// ── Forced height math REMOVED ───────────────────────────────────
section('Forced height math REMOVED — cards use natural content height')

assert(!/const\s+HEADER_AND_PADDING/.test(KIOSK),
  'HEADER_AND_PADDING constant REMOVED')
assert(!/const\s+CONFIGURED_ROW_GAP/.test(KIOSK),
  'CONFIGURED_ROW_GAP constant REMOVED')
assert(!/const\s+availableRosterHeight/.test(KIOSK),
  'availableRosterHeight computation REMOVED')
assert(!/const\s+rowCount\s*=\s*Math\.max/.test(KIOSK),
  'rowCount computation REMOVED (columns flow naturally now)')
assert(!/const\s+totalRowGaps/.test(KIOSK),
  'totalRowGaps computation REMOVED')
assert(!/const\s+targetCardHeight\s*=/.test(KIOSK),
  'targetCardHeight computation REMOVED')

// Inline CSS var also gone.
assert(!/'--board-target-card-height':/.test(KIOSK),
  '--board-target-card-height inline CSS var REMOVED')

// CSS rule that consumed the variable also gone.
assert(!/data-fit-mode='roomy'\]\s+\.boardPersonBar,\s*\n\s*\.boardBars\[data-fit-mode='natural'\]\s+\.boardPersonBar\s*\{[\s\S]{0,200}min-height:\s+var\(--board-target-card-height/.test(KIOSK_CSS),
  '.boardPersonBar min-height stretch rule REMOVED')

// No other .boardPersonBar forced-height rules survive.
const personBarRules = KIOSK_CSS.match(/\.boardPersonBar[^{]*\{[\s\S]{0,600}?\n\}/g) ?? []
for (const rule of personBarRules) {
  const isForcedMinHeight = /^\s*min-height:\s*(?!0|auto)[^;]+;/m.test(rule)
  const isForcedHeight    = /^\s*height:\s*(?!auto)[^;]+;/m.test(rule)
  assert(!isForcedMinHeight,
    'no .boardPersonBar rule declares a non-auto/non-0 min-height (natural content height)')
  assert(!isForcedHeight,
    'no .boardPersonBar rule declares a fixed height (natural content height)')
}

// ── .boardBarsInner is flex-row of independent columns ───────────
section('.boardBarsInner is flex-row of independent `.boardColumn` stacks')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,1500}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner block parsed')

assert(/display:\s+flex/.test(innerBlock),
  '.boardBarsInner uses display: flex')
assert(/flex-direction:\s+row/.test(innerBlock),
  '.boardBarsInner uses flex-direction: row (horizontal layout of columns)')

// Negative pin — grid is gone.
assert(!/display:\s+grid/.test(innerBlock),
  '.boardBarsInner does NOT use display: grid (DAB.10g grid REMOVED)')
assert(!/grid-template-columns:/.test(innerBlock),
  '.boardBarsInner does NOT declare grid-template-columns')

// align-items: flex-start so columns don't stretch to the tallest.
assert(/align-items:\s+flex-start/.test(innerBlock),
  '.boardBarsInner uses align-items: flex-start (columns stay at their natural heights)')

// ── .boardColumn is a flex column stack ──────────────────────────
section('.boardColumn — individual flex-column stack per column')

const columnBlock = KIOSK_CSS.match(/\n\.boardColumn \{([\s\S]{0,1000}?)\n\}/)?.[1] ?? ''
assert(columnBlock.length > 0, '.boardColumn block parsed')

assert(/display:\s+flex/.test(columnBlock),
  '.boardColumn uses display: flex')
assert(/flex-direction:\s+column/.test(columnBlock),
  '.boardColumn uses flex-direction: column (vertical stack of cards)')
assert(/flex:\s+1\s+1\s+0/.test(columnBlock),
  '.boardColumn uses flex: 1 1 0 (each column takes 1fr of parent width)')
assert(/gap:\s+calc\(18px\s*\*\s*var\(--board-bar-scale/.test(columnBlock),
  '.boardColumn vertical gap = calc(18px * --board-bar-scale) — scales with density')

// ── Removed @media grid overrides ────────────────────────────────
section('Removed old @media grid overrides for ultra mode')

// The DAB.10g @media (min-width: 900px) and @media (min-width: 1600px)
// rules that forced `.boardBarsInner` back to `display: grid` are
// gone (would defeat the independent-column-stack fix).
assert(!/@media \(min-width: 900px\)[\s\S]{0,500}data-fit-mode='ultra'\] \.boardBarsInner\s*\{[\s\S]{0,200}display:\s+grid/.test(KIOSK_CSS),
  '@media (min-width: 900px) ultra grid override REMOVED (columns come from JSX now)')
assert(!/@media \(min-width: 1600px\)[\s\S]{0,500}data-fit-mode='ultra'\] \.boardBarsInner\s*\{[\s\S]{0,200}grid-template-columns:/.test(KIOSK_CSS),
  '@media (min-width: 1600px) ultra grid override REMOVED')

// ── JSX: columns split + reusable renderer ───────────────────────
section('JSX: columns array + single renderOperatorCard function')

// columns declared as [].
assert(/const columns = \[\]/.test(KIOSK),
  'columns array declared as []')

// 1-column short-circuit pushes operatorCards whole.
assert(/if \(boardColumns <= 1\) \{\s*\n\s*columns\.push\(operatorCards\)/.test(KIOSK),
  '1-column short-circuit: columns.push(operatorCards) preserves reading order')

// 2+ column path slices per column.
assert(/const perColumn = Math\.ceil\(operatorCards\.length \/ boardColumns\)/.test(KIOSK),
  'perColumn = ceil(operatorCards.length / boardColumns) — left column gets ceiling on odd counts')
assert(/operatorCards\.slice\(c \* perColumn, \(c \+ 1\) \* perColumn\)/.test(KIOSK),
  'each column takes operatorCards.slice(c * perColumn, (c + 1) * perColumn) — preserves vertical order')

// Single reusable renderer function.
assert(/function renderOperatorCard\(op\) \{/.test(KIOSK),
  'renderOperatorCard(op) function declared')

// The out-status branch and the assigned branch both live in the
// renderer function — one card markup path.
const rendererMatch = KIOSK.match(/function renderOperatorCard\(op\) \{[\s\S]*?\n  \}\n/)
const rendererSrc = rendererMatch ? rendererMatch[0] : ''
assert(rendererSrc.length > 0, 'renderOperatorCard body parsed')
assert(/if \(op\.outStatus\) \{/.test(rendererSrc),
  'renderOperatorCard handles out-status branch')
assert(/<article key=\{op\.key\} className=\{styles\.boardPersonBar\}>/.test(rendererSrc),
  'renderOperatorCard handles assigned branch')

// columns.map(...) inside .boardBarsInner renders one .boardColumn
// per column, and each column .map(renderOperatorCard) renders its
// cards.
assert(/className=\{styles\.boardBarsInner\}[\s\S]{0,500}columns\.map\(\(colOps, colIdx\) => \(/.test(KIOSK),
  'columns.map((colOps, colIdx) => …) inside .boardBarsInner')
assert(/<div key=\{colIdx\} className=\{styles\.boardColumn\}>\s*\n\s*\{colOps\.map\(renderOperatorCard\)\}/.test(KIOSK),
  'each column renders <div className={styles.boardColumn}>{colOps.map(renderOperatorCard)}</div>')

// ── Vertical reading order preserved ─────────────────────────────
section('Vertical reading order preserved')

// For 8 ops in 2 cols: left = [1,2,3,4], right = [5,6,7,8]. The
// slice(c * perColumn, (c + 1) * perColumn) formula with
// perColumn = ceil(8 / 2) = 4 gives [0..4) and [4..8) — verified
// by inspecting the JSX source.
assert(/const perColumn = Math\.ceil\(operatorCards\.length \/ boardColumns\)/.test(KIOSK),
  'perColumn ceiling formula: 8 ops / 2 cols → 4 per column (left [1-4], right [5-8])')
// For 7 ops in 2 cols: ceil(7/2) = 4. Left = [0,4) = 4 ops, right =
// [4,8) = 3 ops. Left column gets the extra on odd totals per spec.

// ── Deterministic column count preserved (from JS) ────────────────
section('Deterministic column count preserved (JS-computed)')

assert(/const boardColumns = viewport\.isMobile \? 1\s*\n\s*: \(viewport\.w >= 1600 && fitMode === 'ultra'\) \? 3\s*\n\s*: \(viewport\.w >= 900\) \? 2\s*\n\s*: 1/.test(KIOSK),
  'boardColumns rule preserved: mobile 1, ≥1600+ultra 3, ≥900 2, else 1')

// data-board-columns attribute + --board-columns var still exposed.
assert(/data-board-columns=\{boardColumns\}/.test(KIOSK),
  'data-board-columns attribute still on outer .boardBars')
assert(/'--board-columns':\s+boardColumns/.test(KIOSK),
  '--board-columns CSS variable still set inline')

// ── DAB.10l dual English + Spanish preserved ─────────────────────
section('DAB.10l dual English + Spanish rendering preserved')

assert(/const showTranslation = op\.showSpanishNotes && trimmedNotesEs\.length > 0/.test(KIOSK),
  'showTranslation gate preserved')
assert(/<p className=\{styles\.boardNotesText\} lang="en">/.test(KIOSK),
  'English <p> preserved')
assert(/className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n\s*lang="es"/.test(KIOSK),
  'Spanish <p> preserved')

// ── DAB.10g.1 typography ratios preserved ────────────────────────
section('DAB.10g.1 typography ratios preserved')

assert(/--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  '--board-name-size on .boardBars')
assert(/--board-job-size:\s+calc\(var\(--board-name-size\) \* 0\.6667\)/.test(KIOSK_CSS),
  '--board-job-size = --board-name-size × 2/3')
assert(/--board-note-size:\s+calc\(var\(--board-name-size\) \* 0\.625\)/.test(KIOSK_CSS),
  '--board-note-size = --board-name-size × 5/8')

// ── DAB.10g deterministic system preserved ───────────────────────
section('DAB.10g deterministic layout preserved — no ResizeObserver')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(`')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect')
assert(/const heaviness =/.test(KIOSK),
  'heaviness score still drives fitMode')

// ── DAB.10f.3 no transform preserved ─────────────────────────────
section('DAB.10f.3 no transform preserved')

assert(!/transform:\s*scale/.test(innerBlock),
  '.boardBarsInner uses no transform')

// ── Mobile behavior preserved ────────────────────────────────────
section('Mobile behavior preserved')

// isMobile → boardColumns = 1 → single column via columns array.
assert(/const boardColumns = viewport\.isMobile \? 1/.test(KIOSK),
  'mobile still resolves to 1 column')
assert(/if \(boardColumns <= 1\) \{\s*\n\s*columns\.push\(operatorCards\)/.test(KIOSK),
  'mobile single-column path uses whole operatorCards array')

// Mobile CSS releases still intact.
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll release preserved')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — spray / inventory untouched')

for (const path of [
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10m'),
    `${path} carries no Phase DAB.10m edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
