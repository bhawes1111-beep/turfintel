// Phase DAB.10f.2 (revision: duplicate-sets fix) smoke.
//
//   node scripts/smoke-display-board-single-render.mjs
//
// User report: "the display board is showing 2 sets" — i.e. two
// stacked copies of the operator cards.
//
// Audit findings:
//   • JSX: BoardModeCrewBars contains exactly ONE operatorCards.map.
//     The non-board (Crosswinds shop) operatorCards.map at line ~910
//     is guarded by the `if (boardMode && !printMode) return (...)`
//     early-return at line 778, so it cannot reach the kiosk route.
//   • Data: operatorCards useMemo dedupes by employeeId/employeeName
//     via byOperator.has(key) guard before push, and the out-status
//     seed loop guards with `if (byOperator.has(emp.id)) continue`.
//   • Therefore the duplicate is a PAINT artifact, not a structural
//     duplicate. The most recent change (DAB.10f.2 first revision)
//     added `will-change: transform` + `backface-visibility: hidden`
//     to .boardBarsInner, which promoted it to its own compositor
//     layer. With the layer promoted, the underlying box could
//     repaint alongside the cached scaled output during state
//     changes — visible as "two trees, one larger, one smaller."
//
// Fix (this revision):
//   • Remove will-change: transform from .boardBarsInner.
//   • Remove backface-visibility: hidden from .boardBarsInner.
//   • Keep useLayoutEffect (paint-blocking measurement).
//   • Keep overflow: hidden on .boardBarsInner (defense-in-depth clip).
//   • Keep all DAB.10e/f/f.1 fit infrastructure intact.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const KIOSK_CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',      'utf8')

// ── No DAB editor / worker / migration changes ────────────────────
section('Frontend-only — no DAB editor / worker / migration changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration')

// ── Structural-singleton: exactly one operatorCards.map in BoardModeCrewBars ─
section('Structural singleton: ONE operatorCards.map inside BoardModeCrewBars')

// Extract just the BoardModeCrewBars function body and count maps.
const boardModeFn = KIOSK.match(/function BoardModeCrewBars\([\s\S]+?\n\}\n/)?.[0] ?? ''
assert(boardModeFn.length > 0, 'BoardModeCrewBars function body parsed')

const mapCountInsideBoardMode = (boardModeFn.match(/operatorCards\.map\(/g) ?? []).length
assert(mapCountInsideBoardMode === 1,
  `exactly one operatorCards.map inside BoardModeCrewBars (found ${mapCountInsideBoardMode})`)

// The one map must be inside .boardBarsInner, not a sibling.
assert(/className=\{styles\.boardBarsInner\}\s*\n?\s*>\s*\n?\s*\{operatorCards\.map\(/.test(boardModeFn),
  'operatorCards.map sits directly inside <div className={styles.boardBarsInner}>')

// Negative: no second .boardBars or .boardBarsInner sibling carrying a map.
const innerOpenCount = (boardModeFn.match(/className=\{styles\.boardBarsInner\}/g) ?? []).length
assert(innerOpenCount === 1,
  `exactly one .boardBarsInner JSX element inside BoardModeCrewBars (found ${innerOpenCount})`)

// ── Operator cards path through the early return guard ───────────
section('Non-board operatorCards.map path is guarded by boardMode early-return')

// The Crosswinds shop branch has its own operatorCards.map. It must
// be UNREACHABLE from board mode because of the early return.
assert(/if \(boardMode && !printMode\) \{\s*\n\s*return \(/.test(KIOSK),
  'boardMode && !printMode early-return present (gates the Crosswinds path)')

// The Crosswinds path renders OperatorCard (not boardPersonBar) — wrap
// in a different className. Verify the early return appears BEFORE the
// Crosswinds map.
const earlyReturnIdx = KIOSK.indexOf('if (boardMode && !printMode)')
const crosswindsMapIdx = KIOSK.indexOf('<OperatorCard')
assert(earlyReturnIdx > 0 && crosswindsMapIdx > earlyReturnIdx,
  'boardMode early-return precedes the Crosswinds <OperatorCard> map (unreachable from kiosk route)')

// ── Data path: operatorCards builder dedupes by employee key ────
section('operatorCards useMemo dedupes by employee key')

assert(/const operatorCards = useMemo\(\(\) => \{/.test(KIOSK),
  'operatorCards built via useMemo')

// Guard 1: byOperator.has(key) before set in the assignment loop.
assert(/if \(!byOperator\.has\(key\)\) \{[\s\S]{0,500}byOperator\.set\(key,/.test(KIOSK),
  'byOperator.has(key) guard before set in assignment loop (no duplicate assignment row creates duplicate card)')

// Guard 2: out-status seed loop skips already-bucketed employees.
assert(/if \(byOperator\.has\(emp\.id\)\) continue/.test(KIOSK),
  'out-status seed loop skips byOperator.has(emp.id) (no duplicate from seed pass)')

// ── DAB.10f.2 second revision: compositor hints REMOVED ─────────
section('Compositor hints REMOVED from .boardBarsInner')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner block parsed')

// will-change as a DECLARATION (not just a mention in a comment) must
// be absent. Match against the property followed by `:` and `;` so a
// comment block mentioning "will-change" doesn't false-positive.
const hasWillChangeDecl = /^\s*will-change:[^;]+;/m.test(innerBlock)
assert(!hasWillChangeDecl,
  '.boardBarsInner does NOT declare will-change (compositor layer hint REMOVED — was causing duplicate-paint)')

const hasBackfaceDecl = /^\s*backface-visibility:[^;]+;/m.test(innerBlock)
assert(!hasBackfaceDecl,
  '.boardBarsInner does NOT declare backface-visibility (removed alongside will-change)')

// Phase DAB.10f.3 — overflow: hidden also REMOVED from .boardBarsInner.
// The outer .boardBars { overflow: hidden } is now the only clip layer.
// Inner element no longer needs its own clip because there is no
// transform-based scaling that could overflow its bounds.
const hasOverflowDecl = /^\s*overflow:\s+hidden\s*;/m.test(innerBlock)
assert(!hasOverflowDecl,
  '.boardBarsInner does NOT declare overflow: hidden (DAB.10f.3 — no transform means no need for inner clip)')

// ── DAB.10g: useLayoutEffect REMOVED with the observer ──────────
section('DAB.10g: useLayoutEffect + ResizeObserver REMOVED entirely')

assert(!/useLayoutEffect/.test(KIOSK),
  'useLayoutEffect REMOVED (DAB.10g — no inner observation, no need for paint-blocking effect)')
assert(!/new ResizeObserver/.test(KIOSK),
  'ResizeObserver REMOVED (DAB.10g — replaced with deterministic window-resize listener)')

// ── DAB.10g fit infrastructure — deterministic, no refs ──────────
section('DAB.10g fit infrastructure — deterministic mode selection')

assert(!/fitModeRef/.test(KIOSK),
  'fitModeRef REMOVED (DAB.10g — no need to mirror state since no observer reads it)')
assert(!/ROOMY_ENTER/.test(KIOSK),
  'ROOMY_ENTER hysteresis constant REMOVED (DAB.10g — buckets pick mode, not slack)')
assert(/data-board-columns=\{boardColumns\}/.test(KIOSK),
  'data-board-columns attribute set on .boardBars (DAB.10g deterministic columns)')
assert(/'--board-columns':\s+boardColumns/.test(KIOSK),
  '--board-columns CSS variable set inline (DAB.10g)')
assert(/'--board-target-card-height':/.test(KIOSK),
  '--board-target-card-height CSS variable set inline (DAB.10g)')
// Phase DAB.10f.3 — transform / inverse-width / max-height REMOVED.
// Negative pins ensure they don't sneak back in.
assert(!/transform:\s+scale\(/.test(innerBlock),
  '.boardBarsInner does NOT use transform: scale (DAB.10f.3 removed)')
assert(!/var\(--board-fit-inverse/.test(innerBlock),
  '.boardBarsInner does NOT use --board-fit-inverse (DAB.10f.3 removed)')
assert(!/max-height:\s+calc\(100% \* var\(--board-fit-inverse/.test(innerBlock),
  '.boardBarsInner does NOT use max-height: calc(100% * var(--board-fit-inverse)) (DAB.10f.3 removed)')

// Multi-job + per-job notes regression couples.
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (DAB.10b)')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached (DAB.10c) — one block per assignment, not duplicated')

// Out-status preserved.
assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch empties assignments (still one out card per out employee)')

// ── Desktop / kiosk no-scroll + mobile scroll preserved ──────────
section('Desktop no-scroll + mobile scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh preserved')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars overflow: hidden preserved')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner transform: none !important preserved')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 compatibility preserved')

// Phase DAB.10g — ResizeObserver API USE removed (mentions in
// historical comments don't count). Negative pin against `new
// ResizeObserver(` and `typeof ResizeObserver`.
assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(...)` constructor call in DisplayBoard.jsx (DAB.10g)')
assert(!/typeof ResizeObserver/.test(KIOSK),
  'no `typeof ResizeObserver` defensive guard (no observer codepath at all — DAB.10g)')
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (Chrome 79 uses -webkit-line-clamp)')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — spray / inventory untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  // Note: 'Phase DAB.10f.2' appears in non-display-board files only if
  // someone accidentally edited them. We pin the negative.
  assert(!src.includes('Phase DAB.10f.2'),
    `${path} carries no Phase DAB.10f.2 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
