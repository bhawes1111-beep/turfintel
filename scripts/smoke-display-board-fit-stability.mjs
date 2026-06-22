// Phase DAB.10f.1 — Display Board fit-stability smoke.
//
//   node scripts/smoke-display-board-fit-stability.mjs
//
// User report after DAB.10f: the board flickers between sizes.
// Root causes identified:
//
//   1. useEffect deps included [fitScale, fitMode, roomScale] — every
//      mode/scale change tore down + recreated the ResizeObserver,
//      which fired measure() on remount; that immediate re-measure
//      against the changed layout triggered another flip.
//   2. naturalH = scrollHeight / fitScale didn't compensate for the
//      roomy CSS boost (padding/font caps multiplied by roomScale via
//      calc). In roomy mode, scrollHeight was inflated by ~roomScale,
//      so the next slack calc dropped from e.g. 1.40 → 1.08 → bounced
//      between roomScale 1.30 and 1.08 on alternating ticks.
//   3. A single shared threshold (slackRatio ≥ 1.05) for roomy entry
//      meant the next-tick re-measure could cross the threshold both
//      ways → mode oscillation.
//   4. MAX_ROOM_SCALE = 1.30 amplified the boost-then-shrink cycle
//      because the layout change between ticks was visually huge.
//
// DAB.10f.1 fixes:
//
//   • Refs (fitScaleRef/fitModeRef/roomScaleRef) mirror state so the
//     observer reads latest values without depending on them; effect
//     deps drop to [operatorCards].
//   • naturalH = scrollHeight / curScale / curRoom — compensates for
//     both active transform AND active roomy CSS boost.
//   • Hysteresis state machine: each mode has SEPARATE enter/exit
//     thresholds (roomy 1.20/1.08, scaled 0.96/1.05, ultra 0.74/0.86).
//   • MAX_ROOM_SCALE lowered 1.30 → 1.15. Roomy growth dampened to
//     1 + (slack-1)*0.6 instead of raw slack, so small slack changes
//     translate to even smaller room-scale changes.
//   • Mobile branch reads via refs to stay consistent.

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
  '0055 still the highest migration (no new migration in DAB.10f.1)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10f.1'),
    `${path} carries no Phase DAB.10f.1 edits`)
}

// ── FIX 1: Refs prevent effect teardown loop ─────────────────────
section('FIX 1: Refs mirror state — effect deps reduced to [operatorCards]')

assert(/const fitScaleRef\s+= useRef\(1\)/.test(KIOSK),
  'fitScaleRef ref declared (initial 1)')
assert(/const fitModeRef\s+= useRef\('natural'\)/.test(KIOSK),
  "fitModeRef ref declared (initial 'natural')")
assert(/const roomScaleRef = useRef\(1\)/.test(KIOSK),
  'roomScaleRef ref declared (initial 1)')

// Ref-sync pattern: mirror state into refs before the effect runs.
assert(/fitScaleRef\.current\s+= fitScale\s*\n\s*fitModeRef\.current\s+= fitMode\s*\n\s*roomScaleRef\.current = roomScale/.test(KIOSK),
  'state → ref sync runs on every render before the observer effect')

// useEffect deps reduced to operatorCards only.
assert(/\}, \[operatorCards\]\)/.test(KIOSK),
  'useEffect deps = [operatorCards] — fit state changes no longer tear down + recreate the observer')

// Negative pin — old fat dep list must be gone.
assert(!/\}, \[operatorCards, fitScale, fitMode, roomScale\]\)/.test(KIOSK),
  'old [operatorCards, fitScale, fitMode, roomScale] dep list removed')

// ── FIX 2: naturalH divides by BOTH curScale AND curRoom ─────────
section('FIX 2: naturalH compensates for both transform AND roomy CSS boost')

assert(/const curScale = fitScaleRef\.current\s*\n\s*const curMode\s+= fitModeRef\.current\s*\n\s*const curRoom\s+= roomScaleRef\.current/.test(KIOSK),
  'rAF reads curScale/curMode/curRoom from refs (stable across re-renders)')

assert(/const naturalH = inner\.scrollHeight \/ curScale \/ curRoom/.test(KIOSK),
  'naturalH = scrollHeight / curScale / curRoom — divides by BOTH (the actual flicker root cause)')
assert(/const naturalW = inner\.scrollWidth\s+\/ curScale \/ curRoom/.test(KIOSK),
  'naturalW = scrollWidth / curScale / curRoom')

// Slack ratio uses the corrected naturalH (so the BASE-natural slack
// is computed, not the post-roomy-boost slack).
assert(/const slackRatio = containerH \/ naturalH/.test(KIOSK),
  'slackRatio = containerH / naturalH (BASE slack since naturalH already divided by curRoom)')

// ── FIX 3: Hysteresis thresholds ─────────────────────────────────
section('FIX 3: Hysteresis — separate enter/exit thresholds per mode')

// Roomy: 1.20 enter, 1.08 exit (buffer 0.12).
assert(/const ROOMY_ENTER\s+= 1\.20/.test(KIOSK),
  'ROOMY_ENTER = 1.20')
assert(/const ROOMY_EXIT\s+= 1\.08/.test(KIOSK),
  'ROOMY_EXIT = 1.08')

// Scaled: 0.96 enter, 1.05 exit.
assert(/const SCALED_ENTER = 0\.96/.test(KIOSK),
  'SCALED_ENTER = 0.96')
assert(/const SCALED_EXIT\s+= 1\.05/.test(KIOSK),
  'SCALED_EXIT = 1.05')

// Ultra: 0.74 enter, 0.86 exit (buffer 0.12).
assert(/const ULTRA_ENTER\s+= 0\.74/.test(KIOSK),
  'ULTRA_ENTER = 0.74')
assert(/const ULTRA_EXIT\s+= 0\.86/.test(KIOSK),
  'ULTRA_EXIT = 0.86')

// Buffer sanity (enter < exit for shrink modes; enter > exit for grow mode).
assert(/ROOMY_ENTER\s+= 1\.20[\s\S]{0,200}ROOMY_EXIT\s+= 1\.08/.test(KIOSK),
  'roomy: enter (1.20) > exit (1.08) — must rise well above exit to enter; small drop below 1.08 to leave')

// Negative pins — the single shared ROOMY_SLACK_THRESHOLD must be gone.
assert(!/const ROOMY_SLACK_THRESHOLD/.test(KIOSK),
  'old single-threshold ROOMY_SLACK_THRESHOLD removed (replaced by ROOMY_ENTER/EXIT pair)')

// ── FIX 4: MAX_ROOM_SCALE lowered + damped growth ────────────────
section('FIX 4: MAX_ROOM_SCALE lowered 1.30 → 1.15 + growth dampened')

assert(/const MAX_ROOM_SCALE\s+= 1\.15/.test(KIOSK),
  'MAX_ROOM_SCALE = 1.15 (was 1.30 in DAB.10f — lowered for stability)')
assert(!/const MAX_ROOM_SCALE\s+= 1\.3/.test(KIOSK),
  'old MAX_ROOM_SCALE = 1.30 removed (negative pin)')

// Damped growth formula: 1 + (slack-1) * 0.6
assert(/Math\.min\(MAX_ROOM_SCALE, 1 \+ \(slackRatio - 1\) \* 0\.6\)/.test(KIOSK),
  'room growth damped: min(MAX_ROOM_SCALE, 1 + (slack-1)*0.6) — 0.6 factor flattens the growth curve')

// ── State machine present — keyed on curMode ─────────────────────
section('State machine — explicit per-mode enter/exit branches')

// Each mode has its own branch.
assert(/if \(curMode === 'roomy'\) \{/.test(KIOSK),
  "branch: curMode === 'roomy'")
assert(/\} else if \(curMode === 'scaled'\) \{/.test(KIOSK),
  "branch: curMode === 'scaled'")
assert(/\} else if \(curMode === 'ultra'\) \{/.test(KIOSK),
  "branch: curMode === 'ultra'")
// Natural is the 'else' fallthrough.
assert(/\/\/ curMode === 'natural' — initial state\./.test(KIOSK),
  "branch: curMode === 'natural' (else fallthrough — initial state)")

// Each branch has its own enter/exit conditions.
assert(/curMode === 'roomy'[\s\S]{0,300}if \(slackRatio < ROOMY_EXIT\)/.test(KIOSK),
  'roomy branch exits when slack < ROOMY_EXIT')
assert(/curMode === 'scaled'[\s\S]{0,400}if \(idealScale < ULTRA_ENTER\)/.test(KIOSK),
  'scaled branch falls into ultra when idealScale < ULTRA_ENTER')
assert(/curMode === 'ultra'[\s\S]{0,300}if \(idealScale > ULTRA_EXIT\)/.test(KIOSK),
  'ultra branch exits when idealScale > ULTRA_EXIT')

// ── Skip-write guards still in place ─────────────────────────────
section('Skip-write guards prevent micro-update loops')

assert(/const scaleChanged = Math\.abs\(nextScale - curScale\) > 0\.005/.test(KIOSK),
  'scaleChanged guarded at 0.005 threshold')
assert(/const modeChanged\s+= nextMode !== curMode/.test(KIOSK),
  'modeChanged compares to curMode')
assert(/const roomChanged\s+= Math\.abs\(nextRoom\s+- curRoom\) > 0\.01/.test(KIOSK),
  'roomChanged guarded at 0.01 threshold')

// ── Mobile bypass — also reads from refs ─────────────────────────
section('Mobile bypass reads via refs (no closure capture)')

assert(/if \(mq && mq\.matches\) \{[\s\S]{0,400}if \(Math\.abs\(1 - fitScaleRef\.current\) > 0\.005\)\s+setFitScale\(1\)/.test(KIOSK),
  'mobile branch reads fitScaleRef.current (not closure-captured fitScale)')
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,500}if \(fitModeRef\.current !== 'natural'\)\s+setFitMode\('natural'\)/.test(KIOSK),
  'mobile branch reads fitModeRef.current')
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,800}if \(Math\.abs\(1 - roomScaleRef\.current\) > 0\.01\)\s+setRoomScale\(1\)/.test(KIOSK),
  'mobile branch reads roomScaleRef.current')

// ── No CSS transitions on fit-critical properties ────────────────
section('No CSS transitions on fit-critical layout properties')

// fit-critical = transform, gap, padding, width — would smear over
// the convergence loop and mask flicker debugging. Pin negative.
// Check the .boardBarsInner block.
const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,1200}?)\n\}/)?.[1] ?? ''
assert(!/transition:/.test(innerBlock),
  '.boardBarsInner has NO transition (would interfere with measurement)')

// Same for .boardBars.
const barsBlock = KIOSK_CSS.match(/\n\.boardBars \{([\s\S]{0,800}?)\n\}/)?.[1] ?? ''
assert(!/transition:/.test(barsBlock),
  '.boardBars has NO transition')

// Roomy/ultra blocks shouldn't add transitions either.
const roomyBlock = KIOSK_CSS.match(/Phase DAB\.10f — Roomy fit mode[\s\S]{0,4000}\/\* ── Phase 9C\.4d — Short-viewport/)?.[0] ?? ''
assert(!/transition:/.test(roomyBlock),
  'roomy-mode CSS has NO transitions')
const ultraBlock = KIOSK_CSS.match(/Phase DAB\.10e\.2 — Ultra-compact fit mode[\s\S]{0,4000}\/\* ── Phase DAB\.10f — Roomy fit mode/)?.[0] ?? ''
assert(!/transition:/.test(ultraBlock),
  'ultra-mode CSS has NO transitions')

// ── Desktop / mobile preservation ────────────────────────────────
section('Desktop no-scroll + mobile scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh on desktop preserved')
assert(/\n\.boardSimple \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardSimple overflow: hidden on desktop preserved')
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll fix preserved (DAB.10e.1)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile transform release preserved')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 / Chromebit compatibility')

assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op for missing ResizeObserver preserved')
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', measure\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(measure\)/.test(KIOSK),
  'matchMedia dual wiring preserved (Chrome 79 fallback)')
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (uses -webkit-line-clamp)')

// ── Multi-job + per-job notes regression couples ─────────────────
section('Multi-job + per-job notes preserved')

assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached (DAB.10c)')

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
  assert(!src.includes('Phase DAB.10f.1'),
    `${path} carries no Phase DAB.10f.1 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
