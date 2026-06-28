// Phase DAB.10e — True Display Board fit-to-screen smoke.
//
//   node scripts/smoke-display-board-true-fit.mjs
//
// Pins the JS-measured fit-to-screen behavior that replaces DAB.10d's
// pure-CSS clamp strategy. Root cause of the DAB.10d scrolling:
// .boardBars carried `overflow-y: auto` as the escape valve for any
// content that didn't fit under the density buckets. DAB.10e removes
// that escape valve and replaces it with:
//
//   1. .boardBars → overflow: hidden (clips, no scrollbar).
//   2. .boardBarsInner wrapper (NEW) owns the flex column layout +
//      transform: scale(var(--board-fit-scale)) + inverse width
//      compensation so scaled content still spans the container.
//   3. ResizeObserver in BoardModeCrewBars measures container vs
//      content + writes the fit-scale variable.
//   4. The 2-column compact grid moves from .boardBars to
//      .boardBarsInner (where the layout actually lives now), and
//      gains a sibling for `comfortable + fit-scale='scaled'` so the
//      board uses available width BEFORE shrinking text too much.
//
// Mobile (max-width: 600px) releases the transform + inner clipping
// so phones get natural document scroll. Chrome 79 compatible:
// ResizeObserver shipped in Chrome 64; transform/scale + CSS vars are
// universally supported.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const KIOSK_CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',      'utf8')
const DAB       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',        'utf8')
const ASSIGN_W  = readFileSync('worker/api/assignments.js',                           'utf8')

// ── No DAB editor / worker / migration changes ────────────────────
section('Frontend-only — no DAB editor / worker / migration changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10e)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10e'),
    `${path} carries no Phase DAB.10e edits`)
}

// ── Outer .boardBars clips (overflow: hidden, NOT auto/scroll) ────
section('Outer .boardBars clips overflow (no scrollbar)')

assert(/\.boardBars\s*\{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars uses overflow: hidden (kills the DAB.10d scrollbar escape valve)')

// Negative pin — overflow-y: auto must NOT survive on the main rule.
const boardBarsBlock = KIOSK_CSS.match(/\n\.boardBars \{([\s\S]{0,800}?)\n\}/)?.[1] ?? ''
assert(boardBarsBlock.length > 0, '.boardBars base block parsed')
assert(!/overflow-y:\s+auto/.test(boardBarsBlock),
  '.boardBars base rule no longer carries overflow-y: auto (DAB.10e removed the scroll escape valve)')

// flex/min-height invariants preserved.
assert(/flex:\s+1\s+1\s+auto/.test(boardBarsBlock),
  '.boardBars still flex: 1 1 auto (takes available column height above footer)')
assert(/min-height:\s+0/.test(boardBarsBlock),
  '.boardBars still min-height: 0 (lets flex child shrink below content)')

// ── Inner wrapper (.boardBarsInner) is the scaled, layout-owning element ─
section('.boardBarsInner wrapper — owns layout + transform-scale')

assert(/\.boardBarsInner\s*\{/.test(KIOSK_CSS),
  '.boardBarsInner CSS class defined')

// Phase DAB.10f.2 — block grew (added overflow: hidden + will-change
// + backface-visibility + DAB.10f.2 comments); budget bumped.
const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner base block parsed')

// transform-scale + origin.
assert(/transform-origin:\s+top left/.test(innerBlock),
  '.boardBarsInner transform-origin: top left (scales toward top of container)')
assert(/transform:\s+scale\(var\(--board-fit-scale,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner transform: scale(var(--board-fit-scale, 1))')

// Inverse width + max-height compensation — without these the scaled
// content would visually shrink AND occupy only fit-scale% of the
// container's box.
assert(/width:\s+calc\(100% \* var\(--board-fit-inverse,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner width inversely scaled to fill the container after transform')
assert(/max-height:\s+calc\(100% \* var\(--board-fit-inverse,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner max-height inversely scaled to keep transformed content inside the clip')

// The flex column + gap moved here from .boardBars.
assert(/display:\s+flex/.test(innerBlock) && /flex-direction:\s+column/.test(innerBlock),
  '.boardBarsInner is the flex column container (layout moved from outer)')
assert(/gap:\s+calc\(18px \* var\(--board-bar-scale,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner gap still scaled by --board-bar-scale (9C.4d preserved)')

// ── JSX wires the inner wrapper + refs ────────────────────────────
section('BoardModeCrewBars — inner wrapper + refs + ResizeObserver')

// Refs declared at the top of the component.
assert(/const containerRef = useRef\(null\)/.test(KIOSK),
  'containerRef declared (binds to outer .boardBars)')
assert(/const innerRef\s+= useRef\(null\)/.test(KIOSK),
  'innerRef declared (binds to inner .boardBarsInner)')

// fitScale state.
assert(/const \[fitScale, setFitScale\] = useState\(1\)/.test(KIOSK),
  'fitScale state initialized to 1 (no-scale default)')

// ResizeObserver wired with rAF coalescing.
assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'ResizeObserver presence check (graceful no-op for non-supporting browsers)')
assert(/const ro = new ResizeObserver\(measure\)/.test(KIOSK),
  'ResizeObserver instantiated with the measure callback')
assert(/ro\.observe\(container\)\s*\n\s*ro\.observe\(inner\)/.test(KIOSK),
  'observes BOTH container (viewport changes) AND inner (DOM changes)')
assert(/rafId = requestAnimationFrame\(\(\) => \{/.test(KIOSK),
  'measure callback uses requestAnimationFrame to coalesce rapid observations')
assert(/ro\.disconnect\(\)\s*\n\s*cancelAnimationFrame\(rafId\)/.test(KIOSK),
  'cleanup disconnects observer + cancels pending rAF')

// Fit-scale computation: min of vertical scale + horizontal scale,
// floored, never upscaled past 1.
assert(/const scaleH = containerH \/ naturalH/.test(KIOSK),
  'scaleH = containerH / naturalH')
assert(/const scaleW = containerW \/ naturalW/.test(KIOSK),
  'scaleW = containerW / naturalW')
// Phase DAB.10e.2 — Single-pass `Math.max(0.5, ...)` replaced by a
// graduated waterfall: idealScale = min(1, scaleH, scaleW); then
// natural / scaled (≥ READABLE_MIN_SCALE) / ultra branches.
assert(/const idealScale = Math\.min\(1, scaleH, scaleW\)/.test(KIOSK),
  'idealScale = min(1, scaleH, scaleW) — never upscale; floor handled by waterfall')

// Phase DAB.10f.1 — skip-write now compares to curScale (ref read).
assert(/const scaleChanged = Math\.abs\(nextScale - curScale\) > 0\.005/.test(KIOSK),
  'scale write guarded by 0.005 threshold against curScale ref (DAB.10f.1)')

// Phase DAB.10f.1 — natural-size measurement now divides by BOTH the
// active fit scale (transform on inner) AND the active room scale
// (CSS padding/font growth). Without dividing by roomScale, a roomy-
// mode measurement reports an inflated natural height and the next-
// tick slack calc bounces between values — that was the flicker.
assert(/const naturalH = inner\.scrollHeight \/ curScale \/ curRoom/.test(KIOSK),
  'naturalH = scrollHeight / curScale / curRoom (compensates for active transform AND roomy CSS boost)')
assert(/const naturalW = inner\.scrollWidth\s+\/ curScale \/ curRoom/.test(KIOSK),
  'naturalW = scrollWidth / curScale / curRoom')

// CSS variables exposed to the outer wrapper.
assert(/'--board-fit-scale':\s+fitScale/.test(KIOSK),
  '--board-fit-scale CSS variable set inline on .boardBars wrapper')
assert(/'--board-fit-inverse':\s+1 \/ fitScale/.test(KIOSK),
  '--board-fit-inverse CSS variable set inline (used by inner width + max-height)')

// data-fit-scale attribute exposes scaled-vs-natural state to CSS.
assert(/data-fit-scale=\{fitScale < 1 \? 'scaled' : 'natural'\}/.test(KIOSK),
  'data-fit-scale="scaled"|"natural" on .boardBars (drives the comfortable→2col override)')

// Inner ref + class wired onto the JSX wrapper.
assert(/<div\s*\n?\s*ref=\{innerRef\}\s*\n?\s*className=\{styles\.boardBarsInner\}/.test(KIOSK),
  '<div ref={innerRef} className={styles.boardBarsInner}> wraps the operator cards')

// Container ref wired onto outer .boardBars (both branches: empty state + populated).
const containerRefRefs = (KIOSK.match(/className=\{styles\.boardBars\}\s+ref=\{containerRef\}|ref=\{containerRef\}\s+data-density=\{density\}/g) ?? []).length
assert(containerRefRefs >= 2,
  `containerRef bound to .boardBars in both empty + populated branches (found ${containerRefRefs})`)

// ── Width-first strategy: comfortable density goes 2-col when fit-scaled ─
section('Width-first strategy — comfortable density widens before shrinking')

// Compact density still 2-col at ≥1100px (regression couple, moved to inner).
assert(/@media \(min-width: 1100px\)[\s\S]{0,800}data-density='compact'\] \.boardBarsInner[\s\S]{0,400}grid-template-columns:\s+repeat\(2, minmax\(0, 1fr\)\)/.test(KIOSK_CSS),
  '@media (min-width: 1100px) compact density still 2-col grid on .boardBarsInner')

// DAB.10e addition: comfortable density ALSO goes 2-col when fit-scale
// is engaged. This is the "use the available width before shrinking
// text aggressively" lever the screenshot scenario needed.
assert(/data-density='comfortable'\]\[data-fit-scale='scaled'\] \.boardBarsInner/.test(KIOSK_CSS),
  'comfortable + fit-scale=scaled → 2-col grid (widens before shrinking)')

// ── Mobile exception ─────────────────────────────────────────────
section('Mobile (max-width: 600px) releases transform + clipping')

// Pin via DAB.10d comment marker on the .boardBars rule (the file
// now has multiple .boardBars-related selectors in the mobile block
// after DAB.10e.1's .rootBoard release).
assert(/Phase DAB\.10d — Inner container can also expand on mobile[\s\S]{0,800}overflow:\s+visible/.test(KIOSK_CSS),
  'mobile .boardBars overflow: visible (releases clipping)')

// Inner wrapper transform released.
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner transform: none !important (releases fit-to-screen)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}width:\s+100%\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner width: 100% !important (releases inverse-width compensation)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}max-height:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner max-height: none !important (releases clip bound)')

// .boardSimple mobile release preserved from DAB.10d. The file has
// multiple @media (max-width: 600px) blocks for unrelated components;
// pin via the DAB.10d marker comment that flags the block we care
// about (the lazy-quantifier match would otherwise span past it).
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,400}height:\s+auto/.test(KIOSK_CSS),
  'mobile .boardSimple height: auto (DAB.10d release preserved)')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility')

// ResizeObserver shipped in Chrome 64 — Chrome 79 safe.
// transform: scale() — Chrome 1+. CSS variables — Chrome 49+. calc() — Chrome 26+.
// data-* attribute selectors — universal. -webkit-line-clamp — Chrome 6+.
// The graceful no-op for missing ResizeObserver covers any older non-
// Chrome browser; Chrome 79 has the API natively.
assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op when ResizeObserver missing (Chrome 79+ has it, but defensive for older browsers)')

// Existing 9C.4d fallback comment for 100dvh still in place.
assert(/legacy \.rootBoard ancestor still provides position:fixed\/inset:0/.test(KIOSK_CSS),
  'Chrome 79 fallback comment preserved for 100dvh')

// Negative pin — no unprefixed `line-clamp:` (would break Chrome 79).
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed `line-clamp:` (Chrome 79 uses -webkit-line-clamp)')

// ── Existing density + 9C.4c/d/e system preserved ────────────────
section('Existing 9C.4c/d/e density system preserved')

// Bucket logic preserved.
assert(/operatorCount >= 10 \|\| assignmentCount >= 16 \? 'compact'/.test(KIOSK),
  'density bucket logic preserved (compact threshold)')
assert(/operatorCount >= 6 \|\| assignmentCount >= 10 \? 'comfortable'/.test(KIOSK),
  'density bucket logic preserved (comfortable threshold)')

// data-density attribute still on outer .boardBars.
assert(/data-density=\{density\}/.test(KIOSK),
  'data-density={density} preserved on outer .boardBars')

// --board-bar-scale + per-density rules still in effect.
assert(/'--board-bar-scale':\s+boardBarScale/.test(KIOSK),
  '--board-bar-scale still set on outer .boardBars')
assert(/\.boardBars\[data-density='comfortable'\] \.boardBarsInner\s*\{[\s\S]{0,200}gap:\s+calc\(12px/.test(KIOSK_CSS),
  'comfortable density .boardBarsInner gap rule preserved (moved from outer)')
assert(/\.boardBars\[data-density='compact'\] \.boardBarsInner\s*\{[\s\S]{0,200}gap:\s+calc\(8px/.test(KIOSK_CSS),
  'compact density .boardBarsInner gap rule preserved (moved from outer)')

// Notes clamp still applies at all densities.
assert(/data-density='comfortable'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+3/.test(KIOSK_CSS),
  'comfortable notes 3-line clamp preserved')
assert(/data-density='compact'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+2/.test(KIOSK_CSS),
  'compact notes 2-line clamp preserved')

// ── Multi-job DAB.10b/c regression couples ───────────────────────
section('Multi-job + per-job notes preserved (DAB.10b + DAB.10c)')

assert(/jobOrder:\s+a\.jobOrder \?\? 0/.test(KIOSK),
  'jobOrder still attached to each operator assignment (DAB.10b)')
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (DAB.10b)')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached to each task block (DAB.10c)')

// ── Out-status preserved ─────────────────────────────────────────
section('Out-status preserved')

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
  assert(!src.includes('Phase DAB.10e'),
    `${path} carries no Phase DAB.10e edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
