// Phase DAB.10f — Display Board fill-screen sizing smoke.
//
//   node scripts/smoke-display-board-fill-screen.mjs
//
// User feedback after DAB.10e.2 (readable fit): the board still
// looked tiny on light rosters because the waterfall capped
// idealScale at 1 — when natural content height was 600px in a
// 1000px container, fitScale stayed at 1 and the bottom 400px of
// the kiosk was empty space. The board fit, but didn't FILL.
//
// DAB.10f adds a fourth tier above 'natural': 'roomy'. When the
// ResizeObserver detects slackRatio = container / natural >= 1.05,
// it sets data-fit-mode="roomy" and writes --board-room-scale
// (capped at MAX_ROOM_SCALE = 1.3) inline. CSS roomy-mode rules
// then multiply padding / gap / clamp() font caps by --board-
// room-scale via calc() — cards grow to fill the available
// vertical space WITHOUT applying a transform (text stays crisp).
//
// Strategy priority (largest-that-fits, not shrink-to-fit):
//   1. Fill vertical space (roomy boost up to 1.3×).
//   2. Natural / scaled / ultra waterfall (DAB.10e.2) handles
//      progressive shrinking when content overflows.
//   3. Mobile completely opted out (roomScale=1 + fitMode='natural').
//
// Roomy mode never:
//   - Applies a transform (no blurry upscale on text).
//   - Overrides clamp() min terms (28px name floor preserved).
//   - Activates when content can't fit naturally.
//   - Activates on mobile.

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
  '0055 still the highest migration (no new migration in DAB.10f)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10f'),
    `${path} carries no Phase DAB.10f edits`)
}

// ── roomScale state + roomy fit mode ─────────────────────────────
section('roomScale state + roomy fit mode')

assert(/const \[roomScale, setRoomScale\] = useState\(1\)/.test(KIOSK),
  'roomScale state initialized to 1 (no boost by default)')

// Phase DAB.10f.1 — MAX_ROOM_SCALE lowered from 1.3 → 1.15 for
// stability. ROOMY_SLACK_THRESHOLD replaced by hysteresis pair
// (ROOMY_ENTER=1.20 / ROOMY_EXIT=1.08).
assert(/const MAX_ROOM_SCALE\s+= 1\.15/.test(KIOSK),
  'MAX_ROOM_SCALE = 1.15 (conservative ceiling — DAB.10f.1 stability tightening)')
assert(/const ROOMY_ENTER\s+= 1\.20/.test(KIOSK),
  'ROOMY_ENTER = 1.20 (enter threshold — DAB.10f.1 hysteresis)')
assert(/const ROOMY_EXIT\s+= 1\.08/.test(KIOSK),
  'ROOMY_EXIT = 1.08 (exit threshold — DAB.10f.1 hysteresis)')

// slackRatio computed.
assert(/const slackRatio = containerH \/ naturalH/.test(KIOSK),
  'slackRatio = containerH / naturalH (how much room is below the natural content)')

// Phase DAB.10f.1 — Roomy now lives inside a state machine branch
// (curMode === 'natural' AND slackRatio >= ROOMY_ENTER). Roomy
// growth uses a DAMPED formula (1 + (slack-1)*0.6) rather than the
// raw slack ratio, which is also part of the anti-flicker fix.
assert(/if \(slackRatio >= ROOMY_ENTER\) \{[\s\S]{0,400}nextMode\s+= 'roomy'/.test(KIOSK),
  "natural→roomy transition fires on slack >= ROOMY_ENTER (1.20)")
assert(/Math\.min\(MAX_ROOM_SCALE, 1 \+ \(slackRatio - 1\) \* 0\.6\)/.test(KIOSK),
  'roomScale damped: min(MAX_ROOM_SCALE, 1 + (slack-1)*0.6) — 0.6 factor flattens the growth curve')

// Effect deps reduced to [operatorCards] only — state values read
// via refs to prevent observer teardown/recreate flicker loop.
assert(/\}, \[operatorCards\]\)\s*\n/.test(KIOSK),
  'useEffect deps reduced to [operatorCards] only (DAB.10f.1 — refs avoid teardown flicker)')

// Skip-write threshold for roomScale (debounces feedback loops).
assert(/const roomChanged\s+= Math\.abs\(nextRoom\s+- curRoom\) > 0\.01/.test(KIOSK),
  'roomScale write debounced at 0.01 (prevents feedback loop)')
assert(/if \(roomChanged\)\s+setRoomScale\(nextRoom\)/.test(KIOSK),
  'setRoomScale fires only when value changes')

// ── CSS variable wired inline + data-fit-mode='roomy' ────────────
section('--board-room-scale + data-fit-mode="roomy" on outer .boardBars')

assert(/'--board-room-scale':\s+roomScale/.test(KIOSK),
  '--board-room-scale CSS variable set inline on .boardBars wrapper')

// data-fit-mode flips through all 4 modes including 'roomy'.
assert(/data-fit-mode=\{fitMode\}/.test(KIOSK),
  'data-fit-mode={fitMode} on outer .boardBars (covers all 4 modes)')

// ── Roomy CSS overrides — no transform, multiply via calc() ──────
section('Roomy CSS — calc() multiplication, no transform')

assert(/Phase DAB\.10f — Roomy fit mode \(fill empty space\)/.test(KIOSK_CSS),
  'roomy-mode CSS block annotated')

// Roomy block parsed from start marker to start of 9C.4d short-viewport block.
const roomyBlock = KIOSK_CSS.match(/Phase DAB\.10f — Roomy fit mode[\s\S]{0,4000}\/\* ── Phase 9C\.4d — Short-viewport/)?.[0] ?? ''
assert(roomyBlock.length > 0, 'roomy-mode CSS section parsed')

// No transform inside roomy — text must stay crisp.
assert(!/transform:/.test(roomyBlock),
  'roomy CSS uses NO transform (text stays crisp; cards grow via calc() not scale)')

// Padding / gap / clamp() max all multiplied by var(--board-room-scale).
assert(/\.boardBars\[data-fit-mode='roomy'\] \.boardBarsInner\s*\{[\s\S]{0,300}gap:[\s\S]{0,300}var\(--board-room-scale/.test(roomyBlock),
  'roomy .boardBarsInner gap multiplied by --board-room-scale')
assert(/\.boardBars\[data-fit-mode='roomy'\] \.boardPersonBar\s*\{[\s\S]{0,400}padding:[\s\S]{0,400}var\(--board-room-scale/.test(roomyBlock),
  'roomy .boardPersonBar padding multiplied by --board-room-scale')
assert(/\.boardBars\[data-fit-mode='roomy'\] \.boardPersonName\s*\{[\s\S]{0,400}clamp\([\s\S]{0,300}var\(--board-room-scale/.test(roomyBlock),
  'roomy .boardPersonName clamp() max multiplied by --board-room-scale')
assert(/\.boardBars\[data-fit-mode='roomy'\] \.boardTaskText\s*\{[\s\S]{0,400}clamp\([\s\S]{0,300}var\(--board-room-scale/.test(roomyBlock),
  'roomy .boardTaskText clamp() max multiplied by --board-room-scale')
assert(/\.boardBars\[data-fit-mode='roomy'\] \.boardNotesText\s*\{[\s\S]{0,400}clamp\([\s\S]{0,300}var\(--board-room-scale/.test(roomyBlock),
  'roomy .boardNotesText clamp() max multiplied by --board-room-scale')

// clamp() min terms unchanged — readability floor preserved.
assert(/clamp\(\s*28px,/.test(roomyBlock),
  'roomy .boardPersonName clamp() min still 28px (readability floor preserved)')

// ── Mobile bypass — roomScale reset to 1 alongside fitMode ───────
section('Mobile bypass — roomScale reset to 1')

// Phase DAB.10f.1 — mobile branch reads from refs.
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,800}if \(Math\.abs\(1 - roomScaleRef\.current\) > 0\.01\)\s+setRoomScale\(1\)/.test(KIOSK),
  'mobile branch resets roomScale to 1 via roomScaleRef.current (DAB.10f.1 refs)')

// CSS mobile overrides don't include roomy-specific rules — the JS
// roomScale=1 + fitMode='natural' resets together kill the boost,
// so the CSS doesn't need a separate mobile override for roomy.

// ── Roomy NEVER activates simultaneously with ultra / scaled ─────
section('Roomy is exclusive with scaled / ultra modes')

// In the JS waterfall, roomy fires FIRST (slack ≥ 1.05). If that
// branch doesn't fire, slack < 1.05 — meaning content is at or
// past natural fit; the scaled / ultra branches handle THAT. The
// branches are mutually exclusive by construction. CSS attribute
// selectors are per-mode (no overlapping `data-fit-mode` selectors
// in the roomy block).
assert(!/data-fit-mode='roomy'\][\s\S]{0,30}data-fit-mode='ultra'/.test(roomyBlock),
  'roomy CSS does NOT also target ultra (modes mutually exclusive)')
assert(!/data-fit-mode='roomy'\][\s\S]{0,30}data-fit-mode='scaled'/.test(roomyBlock),
  'roomy CSS does NOT also target scaled')

// ── Existing DAB.10e.2 waterfall preserved ───────────────────────
section('Existing DAB.10e.2 waterfall still in place')

assert(/const READABLE_MIN_SCALE\s+= 0\.78/.test(KIOSK),
  'READABLE_MIN_SCALE = 0.78 (DAB.10e.2 floor preserved)')
assert(/const EMERGENCY_MIN_SCALE = 0\.72/.test(KIOSK),
  'EMERGENCY_MIN_SCALE = 0.72 (DAB.10e.2 floor preserved)')
assert(/nextMode\s+= 'ultra'/.test(KIOSK),
  "'ultra' branch preserved")
assert(/nextMode\s+= 'scaled'/.test(KIOSK),
  "'scaled' branch preserved")

// Ultra-mode CSS still present.
assert(/Phase DAB\.10e\.2 — Ultra-compact fit mode/.test(KIOSK_CSS),
  'ultra-mode CSS block preserved')
assert(/data-fit-mode='ultra'\] \.boardNotesText[\s\S]{0,300}-webkit-line-clamp:\s+1/.test(KIOSK_CSS),
  'ultra notes 1-line clamp preserved')

// ── Desktop / kiosk no-scroll behavior preserved ─────────────────
section('Desktop / kiosk no-scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple still height: 100dvh on desktop')
assert(/\n\.boardSimple \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardSimple still overflow: hidden on desktop')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars still overflow: hidden on desktop')

// ── Mobile scroll preserved (DAB.10e.1) ──────────────────────────
section('Mobile scroll preserved')

assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'DAB.10e.1 mobile fix marker preserved')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile transform release preserved (DAB.10e)')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility')

// All DAB.10f features Chrome 79-safe:
//   - CSS variables / calc() — Chrome 49+.
//   - clamp() — Chrome 79+.
//   - data-* attribute selectors — universal.
//   - useState / useEffect / useRef — React internals.
// No new browser APIs introduced in this phase.
assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op for missing ResizeObserver preserved')
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', measure\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(measure\)/.test(KIOSK),
  'matchMedia dual wiring (Chrome 79 fallback) preserved')
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (uses -webkit-line-clamp)')

// ── Multi-job + per-job notes regression couples ─────────────────
section('Multi-job + per-job notes preserved')

assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached (DAB.10c)')
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
  assert(!src.includes('Phase DAB.10f'),
    `${path} carries no Phase DAB.10f edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
