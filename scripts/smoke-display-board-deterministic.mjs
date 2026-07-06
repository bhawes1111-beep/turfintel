// Phase DAB.10g — Deterministic display board layout smoke.
//
//   node scripts/smoke-display-board-deterministic.mjs
//
// User report: Display Board still flickered even after DAB.10f.3
// removed transform-based scaling. Root cause: the inner-content
// ResizeObserver feedback loop. Every iteration of the fit system
// from DAB.10e through DAB.10f.3 observed inner content size,
// changed CSS based on that measurement, then re-measured the
// changed content — a loop with no convergence guarantee. Even
// with hysteresis + refs + matchMedia bypass it could still
// produce visible flicker.
//
// DAB.10g rips out the entire inner-observation loop:
//
//   • No ResizeObserver on inner content (or anywhere).
//   • No useLayoutEffect; no observer refs; no fitModeRef / roomScaleRef.
//   • Window-resize listener tracks ONLY viewport.w + viewport.h +
//     isMobile (outer, not inner).
//   • fitMode + boardColumns + targetCardHeight computed inline
//     from stable inputs: operatorCount, assignmentCount,
//     multiJobCount, viewport.w, viewport.h, isMobile.
//   • None of those values change when CSS changes — so the chosen
//     mode CANNOT oscillate.
//   • --board-columns CSS variable drives the grid.
//   • --board-target-card-height drives min-height on .boardPersonBar
//     in roomy/natural modes to fill empty space.

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
  '0055 still the highest migration (no new migration in DAB.10g)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10g'),
    `${path} carries no Phase DAB.10g edits`)
}

// ── ResizeObserver removed; useLayoutEffect removed ──────────────
section('No ResizeObserver, no useLayoutEffect, no inner observation')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(…)` constructor call (DAB.10g — root-cause fix)')
assert(!/typeof ResizeObserver/.test(KIOSK),
  'no `typeof ResizeObserver` guard (no observer code path at all)')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect (was needed only for paint-blocking measurement)')

// useEffect remains (used elsewhere for refresh / midnight rollover /
// resize listener). Just verify it doesn't import useLayoutEffect.
assert(/import \{ useEffect, useMemo, useRef, useState \} from 'react'/.test(KIOSK),
  "import line is { useEffect, useMemo, useRef, useState } — no useLayoutEffect")

// ── No state mirror refs ─────────────────────────────────────────
section('No state mirror refs (fitModeRef / roomScaleRef / fitScaleRef)')

assert(!/fitScaleRef/.test(KIOSK),
  'fitScaleRef removed (was DAB.10f.1, needed only by observer)')
assert(!/fitModeRef/.test(KIOSK),
  'fitModeRef removed')
assert(!/roomScaleRef/.test(KIOSK),
  'roomScaleRef removed')
assert(!/containerRef/.test(KIOSK),
  'containerRef removed (no observation needs DOM ref)')
// innerRef may exist elsewhere in unrelated code — narrow to BoardModeCrewBars.
const boardModeFn = KIOSK.match(/function BoardModeCrewBars\([\s\S]+?\n\}\n/)?.[0] ?? ''
assert(boardModeFn.length > 0, 'BoardModeCrewBars function body parsed')
assert(!/innerRef/.test(boardModeFn),
  'innerRef removed from BoardModeCrewBars (no observation)')

// ── Viewport state from window listener (outer only) ─────────────
section('viewport state from window listener (no inner observation)')

assert(/const \[viewport, setViewport\] = useState\(\(\) => \(\{/.test(KIOSK),
  'viewport useState initialised lazily from window.innerWidth/Height/matchMedia')

assert(/window\.matchMedia\('\(max-width: 600px\)'\)/.test(KIOSK),
  "matchMedia('(max-width: 600px)') used to detect mobile breakpoint")

// useEffect installs window.resize + matchMedia change listeners.
assert(/window\.addEventListener\('resize', onResize\)/.test(KIOSK),
  "window.addEventListener('resize', onResize) installed")
assert(/window\.removeEventListener\('resize', onResize\)/.test(KIOSK),
  "cleanup removes window.resize listener")

// Dual MQL listener wiring preserved for Chrome 79.
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', onResize\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(onResize\)/.test(KIOSK),
  'dual matchMedia listener wiring preserved for Chrome 79 fallback')

// Resize is debounced via rAF so a fast drag doesn't thrash state.
assert(/rafId = requestAnimationFrame\(\(\) => \{[\s\S]{0,200}setViewport\(prev => \{/.test(KIOSK),
  'resize debounced via requestAnimationFrame (no setViewport spam)')

// Skip-write guard inside setViewport prevents re-renders for identical
// viewport snapshots.
assert(/if \(prev\.w === w && prev\.h === h && prev\.isMobile === isMobile\) return prev/.test(KIOSK),
  'setViewport returns prev when w/h/isMobile unchanged (no spurious re-renders)')

// Effect deps are empty — listener installed once for the lifetime of
// the component. No listener churn on state changes.
assert(/\}, \[\]\)/.test(KIOSK),
  'window-resize effect deps = [] (listener installed once)')

// ── Deterministic mode selection from stable inputs ──────────────
section('Deterministic mode selection from stable inputs')

// multiJobCount is computed from operatorCards (stable).
assert(/const multiJobCount = operatorCards\.reduce\(/.test(KIOSK),
  'multiJobCount derived from operatorCards (stable input)')

// heaviness score uses assignment count + multi-job bump + short-viewport bump.
assert(/const heaviness =\s*\n\s*assignmentCount/.test(KIOSK),
  'heaviness = assignmentCount + multi-job + viewport-height bumps (stable)')

// fitMode picked from heaviness + isMobile.
assert(/const fitMode = viewport\.isMobile\s*\n\s*\? 'natural'/.test(KIOSK),
  "mobile branch: fitMode = 'natural' (no kiosk modes on phones)")
assert(/: heaviness <= 8\s+\? 'roomy'/.test(KIOSK),
  "heaviness <= 8 → 'roomy'")
assert(/: heaviness <= 14 \? 'natural'/.test(KIOSK),
  "heaviness <= 14 → 'natural'")
assert(/: heaviness <= 22 \? 'compact'/.test(KIOSK),
  "heaviness <= 22 → 'compact'")
assert(/:\s*'ultra'/.test(KIOSK),
  "heaviness > 22 → 'ultra'")

// No slack ratio, no idealScale, no enter/exit hysteresis (all gone
// alongside the observer).
assert(!/slackRatio/.test(KIOSK),
  'no slackRatio (no observer to compute it)')
assert(!/ROOMY_ENTER|ROOMY_EXIT|COMPACT_ENTER|COMPACT_EXIT|ULTRA_ENTER|ULTRA_EXIT/.test(KIOSK),
  'no hysteresis enter/exit constants (deterministic buckets, not hysteresis)')

// ── Deterministic column count ───────────────────────────────────
section('Deterministic column count from viewport.w + fit-mode + density')

assert(/const boardColumns = viewport\.isMobile \? 1/.test(KIOSK),
  'mobile always 1 column')
assert(/viewport\.w >= 1600 && fitMode === 'ultra'/.test(KIOSK),
  '≥1600px + ultra → 3 columns')
// Phase DAB.10j — Two-column threshold lowered to 900px and applied
// to ALL non-mobile widths (roomy + natural + compact + ultra alike).
// The prior 1100px + mode-dependent rule left legacy shop TVs (1280–
// 1920px) with a single column of cards + huge horizontal empty
// gutters. New rule: mobile 1, ≥1600 ultra → 3, ≥900 → 2, else 1.
assert(/viewport\.w >= 900\) \? 2/.test(KIOSK),
  '≥900px non-mobile → 2 columns (DAB.10j — force two-column legacy layout)')

// Exposed on .boardBars + as CSS variable on inline style.
assert(/data-board-columns=\{boardColumns\}/.test(KIOSK),
  'data-board-columns attribute set on outer .boardBars')
assert(/'--board-columns':\s+boardColumns/.test(KIOSK),
  '--board-columns CSS variable set inline')

// Phase DAB.10m — `.boardBarsInner` is now a flex-row of independent
// `.boardColumn` stacks. Column count comes from JSX rendering
// `columns.length` children.
assert(/\.boardBarsInner\s*\{[\s\S]{0,1000}display:\s+flex;\s*\n\s*flex-direction:\s+row/.test(KIOSK_CSS),
  '.boardBarsInner is display: flex; flex-direction: row (DAB.10m independent columns)')
assert(/\.boardColumn\s*\{[\s\S]{0,500}display:\s+flex;\s*\n\s*flex-direction:\s+column/.test(KIOSK_CSS),
  '.boardColumn is display: flex; flex-direction: column (DAB.10m)')

// ── Content-sized cards (DAB.10m) — no forced height ─────────────
section('Content-sized cards — no forced height / no target-card-height')

// Phase DAB.10m — HEADER_AND_PADDING / CONFIGURED_ROW_GAP /
// availableRosterHeight / rowCount / totalRowGaps / targetCardHeight
// are ALL REMOVED. Cards use their natural content height; a card
// with only a name+task stays short, a card with English+Spanish+
// multi-job grows taller. Negative pins.
assert(!/const HEADER_AND_PADDING/.test(KIOSK),
  'HEADER_AND_PADDING constant REMOVED (DAB.10m — no forced card height)')
assert(!/const CONFIGURED_ROW_GAP/.test(KIOSK),
  'CONFIGURED_ROW_GAP constant REMOVED (DAB.10m)')
assert(!/const availableRosterHeight/.test(KIOSK),
  'availableRosterHeight REMOVED (DAB.10m)')
assert(!/const rowCount/.test(KIOSK),
  'rowCount REMOVED (DAB.10m — no row math needed for column stacks)')
assert(!/const targetCardHeight/.test(KIOSK),
  'targetCardHeight REMOVED (DAB.10m — cards use natural height)')

// --board-target-card-height inline CSS var also removed.
assert(!/'--board-target-card-height':/.test(KIOSK),
  '--board-target-card-height inline CSS var REMOVED (DAB.10m)')

// CSS rule that consumed the variable also removed.
assert(!/data-fit-mode='roomy'\]\s+\.boardPersonBar,\s*\n\s*\.boardBars\[data-fit-mode='natural'\]\s+\.boardPersonBar\s*\{[\s\S]{0,200}min-height:\s+var\(--board-target-card-height/.test(KIOSK_CSS),
  '.boardPersonBar min-height: var(--board-target-card-height) rule REMOVED (DAB.10m)')

// ── No transform / no compositor hints (DAB.10f.3 preserved) ─────
section('No transform / no compositor hints (DAB.10f.3 invariants)')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner block parsed')
assert(!/transform:/.test(innerBlock),
  '.boardBarsInner does NOT use transform (DAB.10f.3 preserved)')
assert(!/^\s*will-change:/m.test(innerBlock),
  '.boardBarsInner does NOT declare will-change')
assert(!/^\s*backface-visibility:/m.test(innerBlock),
  '.boardBarsInner does NOT declare backface-visibility')

// ── No CSS transitions on fit-critical properties ────────────────
section('No CSS transitions on fit-critical layout properties')

// Only fit-critical surfaces (.boardBars, .boardBarsInner,
// .boardPersonBar, .boardPersonName, .boardTaskText, .boardNotesText)
// must have no transitions on layout-critical properties. Other UI
// (date nav arrows, date title button) may transition transform for
// hover/tap feedback — those don't affect board fit.
const FIT_CRITICAL_SELECTORS = [
  '\\.boardBars',
  '\\.boardBarsInner',
  '\\.boardPersonBar',
  '\\.boardPersonName',
  '\\.boardTaskText',
  '\\.boardNotesText',
  '\\.boardTaskBlock',
]
for (const sel of FIT_CRITICAL_SELECTORS) {
  // Find any rule starting with the selector, then any non-{ char,
  // then { ... }. Inside, look for transition: declarations.
  const re = new RegExp(`${sel}[^,{]*\\{[^}]{0,2000}transition:`, 'g')
  assert(!re.test(KIOSK_CSS),
    `no transition declaration on any rule targeting '${sel}'`)
}

// ── Mobile: bypass kiosk layout entirely ─────────────────────────
section('Mobile bypass: 1 column, no kiosk lock, normal scroll')

assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll release block preserved (DAB.10e.1)')
assert(/\.rootBoard\.boardSimple,?\s*\n?\s*\.root\.rootBoard\.boardSimple\s*\{[\s\S]{0,400}position:\s+static/.test(KIOSK_CSS),
  'mobile .rootBoard.boardSimple → position: static (DAB.10e.1)')

// JSX mobile branch: viewport.isMobile → fitMode='natural' + boardColumns=1.
assert(/const fitMode = viewport\.isMobile\s*\n\s*\? 'natural'/.test(KIOSK),
  "mobile fitMode is 'natural' (no kiosk roomy/compact/ultra on phones)")
assert(/const boardColumns = viewport\.isMobile \? 1/.test(KIOSK),
  'mobile boardColumns = 1')

// ── Desktop no-scroll preserved ──────────────────────────────────
section('Desktop / kiosk no-scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh preserved')
assert(/\n\.boardSimple \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardSimple overflow: hidden preserved (no page scroll on kiosk)')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars overflow: hidden preserved (no inner scroll on kiosk)')

// ── Single render path preserved ─────────────────────────────────
section('Single render path: one operatorCards.map, one .boardBarsInner')

// Phase DAB.10m — Card rendering is now extracted into a single
// `renderOperatorCard(op)` function that both column stacks call
// via `.map(renderOperatorCard)`. The IIFE reorder is gone; JSX
// splits operatorCards into `columns` and renders one .boardColumn
// per column. Verify the single reusable renderer.
assert(/function renderOperatorCard\(op\) \{/.test(boardModeFn),
  'renderOperatorCard(op) function declared inside BoardModeCrewBars (one card markup path)')
const renderCallCount = (boardModeFn.match(/\.map\(renderOperatorCard\)/g) ?? []).length
assert(renderCallCount >= 1,
  `.map(renderOperatorCard) call renders each column's cards (found ${renderCallCount})`)
const innerCount = (boardModeFn.match(/className=\{styles\.boardBarsInner\}/g) ?? []).length
assert(innerCount === 1, `exactly one .boardBarsInner JSX element (found ${innerCount})`)

// ── Multi-job + per-job notes preserved ──────────────────────────
section('Multi-job + per-job notes + out-status preserved')

assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (DAB.10b)')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached (DAB.10c)')
assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch empties assignments (still one out card per out employee)')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 / Chromebit compatibility')

// matchMedia + addListener fallback preserved.
assert(/window\.matchMedia/.test(KIOSK),
  'matchMedia used (Chrome 9+, universal)')
assert(/mq\.addListener/.test(KIOSK),
  'MediaQueryList.addListener fallback wired (Chrome 79 / older Safari)')

// No unprefixed line-clamp.
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (Chrome 79 uses -webkit-line-clamp)')

// CSS variables + calc + repeat() all Chrome 49+.
// data-* attribute selectors are universal.

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
  assert(!src.includes('Phase DAB.10g'),
    `${path} carries no Phase DAB.10g edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
