// Phase DAB.10e.2 — Readable Display Board fit smoke.
//
//   node scripts/smoke-display-board-readable-fit.mjs
//
// User feedback after DAB.10e: the board fit on-screen but text was
// too small to read from across the shop. Root cause: the single-
// pass scale formula `Math.max(0.5, container / natural)` allowed
// the global transform to shrink down to 0.5, turning a 22px name
// into 11px visual size — unreadable on a TV.
//
// The fix replaces single-pass scaling with a graduated waterfall:
//
//   idealScale = min(1, container / natural)
//
//   ideal ≥ 1   → 'natural'  (no transform; scale = 1)
//   ideal ≥ 0.78 → 'scaled'   (mild scale; kiosk text still readable
//                              from TV-distance; clamp() floors hold)
//   ideal < 0.78 → 'ultra'    (data-fit-mode='ultra' set; CSS
//                              tightens layout — 1-line notes, 3-col
//                              grid at ≥1600px, 2-col at ≥900px —
//                              and scale clamps to 0.78 until the
//                              post-tightening re-measure converges.
//                              If even ultra can't fit, emergency
//                              0.72 floor is used as a last resort.)
//
// Mobile: completely opted out (fitScale=1, fitMode='natural',
// CSS .boardBarsInner mobile override unchanged). Note: although
// this phase shares the user-requested name DAB.10e.1, that number
// was already taken by the mobile-scroll fix that shipped, so this
// is internally numbered DAB.10e.2. Commit message reflects user-
// facing intent.

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
  '0055 still the highest migration (no new migration in DAB.10e.2)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10e.2'),
    `${path} carries no Phase DAB.10e.2 edits`)
}

// ── Scale floor: 0.78 readable, 0.72 emergency ────────────────────
section('Scale floor — READABLE_MIN_SCALE = 0.78, EMERGENCY = 0.72')

// Constants documented + named.
assert(/const READABLE_MIN_SCALE\s+= 0\.78/.test(KIOSK),
  'READABLE_MIN_SCALE constant = 0.78')
assert(/const EMERGENCY_MIN_SCALE = 0\.72/.test(KIOSK),
  'EMERGENCY_MIN_SCALE constant = 0.72 (absolute floor, documented as last resort)')

// Old 0.5 floor must be gone from the measurement branch.
const measureBlock = KIOSK.match(/rafId = requestAnimationFrame\(\(\) => \{([\s\S]{0,5000}?)\n\s{6}\}\)/)?.[1] ?? ''
assert(measureBlock.length > 0, 'rAF measurement block parsed')
assert(!/Math\.max\(0\.5,/.test(measureBlock),
  'old 0.5 single-pass floor removed from the measurement branch (negative pin)')

// Waterfall branches.
assert(/if \(idealScale >= 1 - 0\.005\) \{[\s\S]{0,200}nextMode\s+= 'natural'[\s\S]{0,200}nextScale = 1/.test(KIOSK),
  "branch 1: ideal >= 1 → mode='natural', scale=1")
assert(/else if \(idealScale >= READABLE_MIN_SCALE\) \{[\s\S]{0,200}nextMode\s+= 'scaled'[\s\S]{0,200}nextScale = idealScale/.test(KIOSK),
  "branch 2: ideal >= 0.78 → mode='scaled', scale=idealScale (clamp floors hold readability)")
assert(/nextMode\s+= 'ultra'/.test(KIOSK),
  "branch 3: ideal < 0.78 → mode='ultra' (CSS tightens before deeper scaling)")

// Emergency floor only after CSS has tightened.
assert(/fitMode === 'ultra' && idealScale < READABLE_MIN_SCALE[\s\S]{0,300}Math\.max\(EMERGENCY_MIN_SCALE, idealScale\)/.test(KIOSK),
  'emergency 0.72 floor only engages on second-pass when already in ultra AND still too small')

// First ultra-pass holds at READABLE_MIN_SCALE so CSS re-flow can converge.
assert(/: READABLE_MIN_SCALE/.test(KIOSK),
  'first ultra-pass clamps to READABLE_MIN_SCALE so CSS re-flow has a chance to fit')

// ── Fit mode state + data attribute ──────────────────────────────
section('fitMode state + data-fit-mode attribute')

assert(/const \[fitMode,\s+setFitMode\]\s+= useState\('natural'\)/.test(KIOSK),
  "fitMode state initialized to 'natural'")
assert(/data-fit-mode=\{fitMode\}/.test(KIOSK),
  'data-fit-mode={fitMode} on outer .boardBars')

// Both setters fire when their value changes.
assert(/if \(scaleChanged\) setFitScale\(nextScale\)/.test(KIOSK),
  'setFitScale fires only when scale value changes (debounced via 0.005 threshold)')
assert(/if \(modeChanged\)\s+setFitMode\(nextMode\)/.test(KIOSK),
  'setFitMode fires only when mode changes')

// fitMode added to useEffect deps so a mode flip re-triggers measure
// for the post-CSS-flow second pass.
assert(/\}, \[operatorCards, fitScale, fitMode\]\)/.test(KIOSK),
  'useEffect deps include fitMode (post-flow re-measure)')

// ── Ultra mode CSS ───────────────────────────────────────────────
section('Ultra-mode CSS rules')

assert(/Phase DAB\.10e\.2 — Ultra-compact fit mode/.test(KIOSK_CSS),
  'ultra-mode CSS block annotated')

// Ultra tightens layout WITHOUT touching name/title font sizes
// (those keep their density-bucket clamp floors — 18px name, 15px
// task at compact density — for kiosk readability).
assert(/\.boardBars\[data-fit-mode='ultra'\] \.boardBarsInner\s*\{[\s\S]{0,200}gap:\s+calc\(6px/.test(KIOSK_CSS),
  'ultra .boardBarsInner gap tightened to ~6px scaled')
assert(/\.boardBars\[data-fit-mode='ultra'\] \.boardPersonBar\s*\{[\s\S]{0,300}padding:\s+calc\(8px/.test(KIOSK_CSS),
  'ultra .boardPersonBar padding tightened to ~8px/12px scaled')
assert(/\.boardBars\[data-fit-mode='ultra'\] \.boardTaskBlock\s*\{[\s\S]{0,300}padding:\s+calc\(2px[\s\S]{0,300}gap:\s+calc\(1px/.test(KIOSK_CSS),
  'ultra .boardTaskBlock padding/gap tightened to ~2px/3px/1px scaled')
assert(/\.boardBars\[data-fit-mode='ultra'\] \.boardNotesText\s*\{[\s\S]{0,300}-webkit-line-clamp:\s+1/.test(KIOSK_CSS),
  'ultra .boardNotesText clamps to 1 line (was 2-4 lines per density)')
assert(/\.boardBars\[data-fit-mode='ultra'\] \.boardJobOrdinal\s*\{/.test(KIOSK_CSS),
  'ultra .boardJobOrdinal still visible (tinier, inline) — multi-job labels not hidden')

// Negative pins: ultra mode does NOT shrink names or task titles.
assert(!/\.boardBars\[data-fit-mode='ultra'\] \.boardPersonName\s*\{/.test(KIOSK_CSS),
  'ultra does NOT override .boardPersonName (density floor 18px+ holds)')
assert(!/\.boardBars\[data-fit-mode='ultra'\] \.boardTaskText\s*\{/.test(KIOSK_CSS),
  'ultra does NOT override .boardTaskText (density floor 15px+ holds)')
// Ultra also does NOT use display: none anywhere.
const ultraSection = KIOSK_CSS.match(/Phase DAB\.10e\.2 — Ultra-compact fit mode[\s\S]{0,4000}\/\* ── Phase 9C\.4d — Short-viewport/)?.[0] ?? ''
assert(ultraSection.length > 0, 'ultra-mode CSS section parsed')
assert(!/display:\s+none/.test(ultraSection),
  'ultra-mode CSS does NOT use display: none (no hidden employees / tasks / labels)')

// ── Column waterfall: 2-col at 900px, 3-col at 1600px ────────────
section('Column waterfall — 2-col @ 900px (ultra), 3-col @ 1600px (ultra)')

// Ultra 2-col grid at narrower threshold than compact (900 vs 1100).
assert(/@media \(min-width: 900px\)[\s\S]{0,500}\.boardBars\[data-fit-mode='ultra'\] \.boardBarsInner[\s\S]{0,300}grid-template-columns:\s+repeat\(2, minmax\(0, 1fr\)\)/.test(KIOSK_CSS),
  '@media (min-width: 900px) ultra-mode 2-col grid (narrower than compact 1100px)')

// 3-col grid at very wide widths, ultra-only.
assert(/@media \(min-width: 1600px\)[\s\S]{0,500}\.boardBars\[data-fit-mode='ultra'\] \.boardBarsInner[\s\S]{0,300}grid-template-columns:\s+repeat\(3, minmax\(0, 1fr\)\)/.test(KIOSK_CSS),
  '@media (min-width: 1600px) ultra-mode 3-col grid (wide kiosk TVs)')

// Existing 9C.4e compact 2-col @ 1100px still intact (regression).
assert(/@media \(min-width: 1100px\)[\s\S]{0,800}data-density='compact'\] \.boardBarsInner[\s\S]{0,400}grid-template-columns:\s+repeat\(2, minmax\(0, 1fr\)\)/.test(KIOSK_CSS),
  'existing compact 2-col @ 1100px preserved')

// ── Readable typography floors preserved ─────────────────────────
section('Readable typography floors preserved')

// Spacious / comfortable / compact density floors still in place.
// These are the clamp() min values that the global transform-scale
// no longer breaches because the scale floor is 0.78.
// (Match the rule by indexOf since the rule body contains nested
// `}` inside the calc() argument and a regex captured body would
// terminate early.)
const personNameIdx    = KIOSK_CSS.indexOf('\n.boardPersonName {')
const personNameWindow = KIOSK_CSS.slice(personNameIdx, personNameIdx + 800)
assert(/font-size:\s+clamp\(28px,/.test(personNameWindow),
  'base .boardPersonName clamp() min 28px (TV-readable; with scale 0.78 floor ≈ 22px visual)')
const personNameCompact = KIOSK_CSS.match(/\[data-density='compact'\] \.boardPersonName\s*\{([\s\S]{0,200}?)\n\}/)?.[1] ?? ''
assert(/font-size:\s+clamp\(18px,/.test(personNameCompact),
  'compact .boardPersonName clamp() min 18px (visual floor with scale=0.78 ≈ 14px — still legible from kiosk distance)')
const taskTextCompact = KIOSK_CSS.match(/\[data-density='compact'\] \.boardTaskText\s*\{([\s\S]{0,200}?)\n\}/)?.[1] ?? ''
assert(/font-size:\s+clamp\(15px,/.test(taskTextCompact),
  'compact .boardTaskText clamp() min 15px')

// ── Notes clamp waterfall preserved + ultra tightens to 1 ────────
section('Notes clamp waterfall — 4 / 3 / 2 / 1 line tiers')

// Base spacious: 4 lines (DAB.10d).
const baseNotesIdx = KIOSK_CSS.indexOf('\n.boardNotesText {')
const baseNotesWindow = KIOSK_CSS.slice(baseNotesIdx, baseNotesIdx + 1000)
assert(/-webkit-line-clamp:\s+4/.test(baseNotesWindow),
  'spacious density .boardNotesText still 4-line clamp')
assert(/data-density='comfortable'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+3/.test(KIOSK_CSS),
  'comfortable density .boardNotesText still 3-line clamp')
assert(/data-density='compact'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+2/.test(KIOSK_CSS),
  'compact density .boardNotesText still 2-line clamp')
// Ultra tightens to 1 line.
assert(/data-fit-mode='ultra'\] \.boardNotesText[\s\S]{0,300}-webkit-line-clamp:\s+1/.test(KIOSK_CSS),
  'ultra fit-mode .boardNotesText clamps to 1 line (new DAB.10e.2 tier)')

// ── Mobile completely opted out ──────────────────────────────────
section('Mobile completely opted out of fit transform + mode')

// fitScale forced to 1 on mobile (DAB.10e.1 preserved).
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,400}if \(Math\.abs\(1 - fitScale\) > 0\.005\) setFitScale\(1\)/.test(KIOSK),
  'mobile: fitScale forced to 1 (DAB.10e.1 preserved)')
// fitMode also forced to 'natural' on mobile so leftover desktop
// 'ultra' from a window-resize crossing doesn't keep CSS ultra
// rules active on the phone.
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,500}if \(fitMode !== 'natural'\) setFitMode\('natural'\)/.test(KIOSK),
  "mobile: fitMode forced to 'natural' (prevents leftover ultra from CSS staying active)")

// CSS mobile override unchanged.
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner transform: none !important (DAB.10e preserved)')

// ── Desktop / kiosk no-scroll behavior preserved ─────────────────
section('Desktop / kiosk no-scroll behavior preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple still height: 100dvh on desktop')
assert(/\n\.boardSimple \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardSimple still overflow: hidden on desktop')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars still overflow: hidden on desktop (no scrollbar — DAB.10e preserved)')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 / Chromebit compatibility')

// ResizeObserver still graceful-no-op for missing API.
assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op when ResizeObserver missing (Chrome 79 has it, defensive for older)')
// matchMedia dual addEventListener / addListener wiring preserved.
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', measure\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(measure\)/.test(KIOSK),
  'matchMedia dual wiring (modern + Chrome 79 fallback) preserved')
// No unprefixed line-clamp.
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (Chrome 79 uses -webkit-line-clamp)')
// Only CSS used in ultra mode: transform-scale, calc, CSS vars,
// data-* attribute selectors, @media min-width — all universal.

// ── Existing density + DAB.10b/c/d/e regression couples ──────────
section('Existing density + DAB.10b/c/d/e regression couples')

// Density bucket still computed.
assert(/operatorCount >= 10 \|\| assignmentCount >= 16 \? 'compact'/.test(KIOSK),
  'density bucket logic preserved')
// --board-bar-scale still wired.
assert(/'--board-bar-scale':\s+boardBarScale/.test(KIOSK),
  '--board-bar-scale CSS variable still wired')
// Multi-job ordinal labels still gated on multi-job.
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (single-job stays label-free)')
// Per-job notes still attached per assignment.
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes still attached (DAB.10c)')
// Out-status preserved.
assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch still empties op.assignments')

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
  assert(!src.includes('Phase DAB.10e.2'),
    `${path} carries no Phase DAB.10e.2 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
