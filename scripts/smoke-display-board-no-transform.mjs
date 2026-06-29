// Phase DAB.10f.3 — Display Board transform-scaling REMOVAL smoke.
//
//   node scripts/smoke-display-board-no-transform.mjs
//
// User report: even after DAB.10f.2 removed will-change + backface-
// visibility, the duplicate / ghost board persisted on the Chromebit.
// Transform-based scaling itself is the root cause: it creates a
// stacking context + compositor layer that legacy Chromium pipelines
// (e.g. Chrome 79 / Chromebit) can paint pre- and post-transform
// boxes alongside each other during state changes.
//
// DAB.10f.3 removes transform-based scaling entirely. All sizing now
// flows through real CSS:
//   - data-fit-mode attribute selects roomy / natural / compact / ultra
//   - --board-room-scale multiplies clamp() max font caps in roomy mode
//   - per-mode CSS overrides tighten padding/gap/notes-clamp
//   - columns engage via data-fit-mode + viewport @media queries
//
// ResizeObserver is retained but functions only as a density / mode
// selector — never sets a transform.

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
  '0055 still the highest migration (no new migration in DAB.10f.3)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10f.3'),
    `${path} carries no Phase DAB.10f.3 edits`)
}

// ── CSS: NO transform on .boardBarsInner ─────────────────────────
section('.boardBarsInner has NO transform, no inverse compensation, no overflow clip')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner base block parsed')

assert(!/transform:/.test(innerBlock),
  '.boardBarsInner does NOT use ANY transform (DAB.10f.3 — was the duplicate-paint root cause)')
assert(!/transform-origin:/.test(innerBlock),
  '.boardBarsInner does NOT use transform-origin')
assert(!/var\(--board-fit-scale/.test(innerBlock),
  '.boardBarsInner does NOT reference --board-fit-scale (variable removed)')
assert(!/var\(--board-fit-inverse/.test(innerBlock),
  '.boardBarsInner does NOT reference --board-fit-inverse (variable removed)')
assert(!/^\s*will-change:\s+transform/m.test(innerBlock),
  '.boardBarsInner does NOT declare will-change: transform (compositor hint removed)')
assert(!/^\s*backface-visibility:/m.test(innerBlock),
  '.boardBarsInner does NOT declare backface-visibility')
assert(!/^\s*overflow:\s+hidden/m.test(innerBlock),
  '.boardBarsInner does NOT declare overflow: hidden (no transform to clip)')
assert(!/^\s*max-height:/m.test(innerBlock),
  '.boardBarsInner does NOT declare max-height (no transform-driven overflow to clamp)')

// What it DOES have: simple flex column wrapper.
assert(/display:\s+flex/.test(innerBlock),
  '.boardBarsInner is still display: flex (simple wrapper)')
assert(/flex-direction:\s+column/.test(innerBlock),
  '.boardBarsInner is still flex-direction: column')
assert(/gap:\s+calc\(18px \* var\(--board-bar-scale,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner still uses --board-bar-scale gap (9C.4d preserved)')

// ── JSX: no --board-fit-scale / --board-fit-inverse / data-fit-scale ─
section('JSX inline style: --board-fit-scale + --board-fit-inverse + data-fit-scale REMOVED')

assert(!/'--board-fit-scale':/.test(KIOSK),
  "JSX inline style does NOT set '--board-fit-scale' (DAB.10f.3 removed)")
assert(!/'--board-fit-inverse':/.test(KIOSK),
  "JSX inline style does NOT set '--board-fit-inverse' (DAB.10f.3 removed)")
assert(!/data-fit-scale=/.test(KIOSK),
  'JSX does NOT set data-fit-scale attribute (DAB.10f.3 removed)')

// fitMode + room-scale still wired.
assert(/data-fit-mode=\{fitMode\}/.test(KIOSK),
  'data-fit-mode={fitMode} still set on outer .boardBars')
assert(/'--board-room-scale':\s+roomScale/.test(KIOSK),
  '--board-room-scale still set inline (roomy mode font growth)')

// ── JS: fitScale state + ref REMOVED; fitMode + roomScale remain ─
section('JS state: fitScale REMOVED, fitMode + roomScale retained')

assert(!/const \[fitScale,/.test(KIOSK),
  'fitScale state REMOVED (DAB.10f.3 — no value to track)')
assert(!/setFitScale\(/.test(KIOSK),
  'setFitScale calls REMOVED (DAB.10f.3)')
assert(!/const fitScaleRef\s+= useRef/.test(KIOSK),
  'fitScaleRef ref REMOVED (DAB.10f.3)')

assert(/const \[fitMode,\s+setFitMode\]\s+= useState\('natural'\)/.test(KIOSK),
  'fitMode state retained')
assert(/const fitModeRef\s+= useRef\('natural'\)/.test(KIOSK),
  'fitModeRef retained')
assert(/const \[roomScale, setRoomScale\] = useState\(1\)/.test(KIOSK),
  'roomScale state retained')
assert(/const roomScaleRef = useRef\(1\)/.test(KIOSK),
  'roomScaleRef retained')

// ── JS measurement loop: mode-only, no idealScale ─────────────────
section('JS measure(): mode-only waterfall, no transform-scale math')

// Negative: no idealScale, no READABLE_MIN_SCALE, no EMERGENCY_MIN_SCALE.
assert(!/const idealScale/.test(KIOSK),
  'idealScale variable REMOVED (was the source value for transform-scale)')
assert(!/const READABLE_MIN_SCALE/.test(KIOSK),
  'READABLE_MIN_SCALE constant REMOVED')
assert(!/const EMERGENCY_MIN_SCALE/.test(KIOSK),
  'EMERGENCY_MIN_SCALE constant REMOVED')

// Positive: slack-only thresholds with hysteresis.
assert(/const ROOMY_ENTER\s+= 1\.20/.test(KIOSK),
  'ROOMY_ENTER = 1.20 (hysteresis preserved)')
assert(/const ROOMY_EXIT\s+= 1\.08/.test(KIOSK),
  'ROOMY_EXIT = 1.08')
assert(/const COMPACT_ENTER\s+= 0\.95/.test(KIOSK),
  'COMPACT_ENTER = 0.95 (new tier — was SCALED_ENTER)')
assert(/const COMPACT_EXIT\s+= 1\.02/.test(KIOSK),
  'COMPACT_EXIT = 1.02 (new tier)')
assert(/const ULTRA_ENTER\s+= 0\.74/.test(KIOSK),
  'ULTRA_ENTER = 0.74')
assert(/const ULTRA_EXIT\s+= 0\.86/.test(KIOSK),
  'ULTRA_EXIT = 0.86')

// State machine has compact branch (replaces scaled).
assert(/curMode === 'compact'/.test(KIOSK),
  "state machine has 'compact' branch (replaces old 'scaled')")
assert(!/curMode === 'scaled'/.test(KIOSK),
  "state machine has NO 'scaled' branch (DAB.10f.3 removed)")

// Mobile branch only writes fitMode + roomScale.
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,500}if \(fitModeRef\.current !== 'natural'\)\s+setFitMode\('natural'\)/.test(KIOSK),
  'mobile branch resets fitMode via ref')
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,500}if \(Math\.abs\(1 - roomScaleRef\.current\) > 0\.01\)\s+setRoomScale\(1\)/.test(KIOSK),
  'mobile branch resets roomScale via ref')

// naturalH now only compensates for roomScale (no fitScale division).
assert(/const naturalH = inner\.scrollHeight \/ curRoom/.test(KIOSK),
  'naturalH = scrollHeight / curRoom (no fitScale division — no transform)')
assert(!/inner\.scrollHeight \/ curScale/.test(KIOSK),
  'naturalH does NOT divide by curScale (no transform-scale to compensate for)')

// ── CSS: data-fit-mode='compact' rules present ────────────────────
section("CSS: data-fit-mode='compact' rules tighten layout via REAL properties")

assert(/Phase DAB\.10f\.3 — Compact fit mode \(no transform\)/.test(KIOSK_CSS),
  'DAB.10f.3 compact-mode block annotated')
assert(/\.boardBars\[data-fit-mode='compact'\] \.boardBarsInner\s*\{[\s\S]{0,200}gap:\s+calc\(10px/.test(KIOSK_CSS),
  "data-fit-mode='compact' tightens .boardBarsInner gap")
assert(/\.boardBars\[data-fit-mode='compact'\] \.boardPersonBar\s*\{[\s\S]{0,400}padding:\s+calc\(14px/.test(KIOSK_CSS),
  "data-fit-mode='compact' tightens .boardPersonBar padding")
assert(/\.boardBars\[data-fit-mode='compact'\] \.boardNotesText\s*\{[\s\S]{0,200}-webkit-line-clamp:\s+2/.test(KIOSK_CSS),
  "data-fit-mode='compact' clamps notes to 2 lines")
assert(/\.boardBars\[data-fit-mode='compact'\] \.boardPersonName\s*\{[\s\S]{0,300}clamp\(22px,/.test(KIOSK_CSS),
  "data-fit-mode='compact' tightens .boardPersonName clamp() max")

// Negative: compact mode does NOT use transform.
const compactSection = KIOSK_CSS.match(/Phase DAB\.10f\.3 — Compact fit mode[\s\S]{0,4000}\/\* ── Phase DAB\.10e\.2 — Ultra/)?.[0] ?? ''
assert(compactSection.length > 0, 'compact-mode CSS section parsed')
assert(!/transform:/.test(compactSection),
  'compact-mode CSS uses NO transform (real layout sizing only)')

// ── CSS: data-fit-mode='ultra' still tightens (no transform) ─────
section("CSS: data-fit-mode='ultra' preserved, still no transform")

assert(/Phase DAB\.10e\.2 — Ultra-compact fit mode/.test(KIOSK_CSS),
  'ultra-mode CSS block preserved')
assert(/data-fit-mode='ultra'\] \.boardNotesText[\s\S]{0,300}-webkit-line-clamp:\s+1/.test(KIOSK_CSS),
  'ultra notes 1-line clamp preserved')
const ultraSection = KIOSK_CSS.match(/Phase DAB\.10e\.2 — Ultra-compact fit mode[\s\S]{0,5000}?\/\* ── Phase/)?.[0] ?? ''
assert(ultraSection.length > 0, 'ultra-mode CSS section parsed')
assert(!/transform:/.test(ultraSection),
  'ultra-mode CSS uses NO transform')

// ── Columns engage by mode + viewport ────────────────────────────
section('Columns: 2-col @1100px (compact density OR comfortable+fit-mode), 3-col @1600px (ultra)')

// 2-col rule keyed on data-fit-mode (not data-fit-scale).
assert(/@media \(min-width: 1100px\)[\s\S]{0,800}data-density='compact'\] \.boardBarsInner,?\s*\n?\s*[\s\S]{0,200}data-density='comfortable'\]\[data-fit-mode='compact'\]/.test(KIOSK_CSS),
  "@1100px: 2-col grid for compact density OR comfortable+fit-mode='compact'")

// 3-col rule still ultra only.
assert(/@media \(min-width: 1600px\)[\s\S]{0,500}data-fit-mode='ultra'\] \.boardBarsInner[\s\S]{0,300}grid-template-columns:\s+repeat\(3,/.test(KIOSK_CSS),
  "@1600px: 3-col grid for fit-mode='ultra'")

// ── Roomy mode unchanged (real CSS, no transform) ────────────────
section('Roomy mode (DAB.10f) preserved — multiplies clamp() max via calc()')

assert(/Phase DAB\.10f — Roomy fit mode/.test(KIOSK_CSS),
  'roomy-mode CSS block preserved')
// Roomy block lives between DAB.10e.2 ultra and 9C.4d short-viewport.
const roomyBlock = KIOSK_CSS.match(/Phase DAB\.10f — Roomy fit mode[\s\S]{0,4000}\/\* ── Phase 9C\.4d — Short-viewport/)?.[0] ?? ''
assert(roomyBlock.length > 0, 'roomy-mode CSS section parsed')
assert(!/transform:/.test(roomyBlock),
  'roomy-mode CSS uses NO transform (real CSS growth only)')
assert(/var\(--board-room-scale/.test(roomyBlock),
  'roomy-mode CSS multiplies via --board-room-scale')

// ── Desktop no-scroll + mobile scroll preserved ──────────────────
section('Desktop no-scroll + mobile scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh preserved (desktop kiosk lock)')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars overflow: hidden preserved (no scrollbar)')
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll fix (DAB.10e.1) preserved')

// Mobile rules — transform: none !important kept as belt-and-suspenders
// in case any future selector tries to add a transform.
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner transform: none !important kept (belt-and-suspenders)')

// ── Single render path preserved ─────────────────────────────────
section('Single render path: one operatorCards.map, one .boardBarsInner')

const boardModeFn = KIOSK.match(/function BoardModeCrewBars\([\s\S]+?\n\}\n/)?.[0] ?? ''
const mapCount = (boardModeFn.match(/operatorCards\.map\(/g) ?? []).length
assert(mapCount === 1, `exactly one operatorCards.map inside BoardModeCrewBars (found ${mapCount})`)
const innerCount = (boardModeFn.match(/className=\{styles\.boardBarsInner\}/g) ?? []).length
assert(innerCount === 1, `exactly one .boardBarsInner JSX element (found ${innerCount})`)

// ── useLayoutEffect retained ─────────────────────────────────────
section('useLayoutEffect retained (DAB.10f.2 first-revision fix)')

assert(/import \{ useEffect, useLayoutEffect, useMemo, useRef, useState \} from 'react'/.test(KIOSK),
  'useLayoutEffect import retained')
assert(/useLayoutEffect\(\(\) => \{[\s\S]{0,800}if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'observer setup wrapped in useLayoutEffect')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 / Chromebit compatibility preserved')

assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op for missing ResizeObserver preserved')
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', measure\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(measure\)/.test(KIOSK),
  'matchMedia dual wiring preserved (Chrome 79 addListener fallback)')
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (uses -webkit-line-clamp)')

// ── Multi-job + per-job notes regression couples ─────────────────
section('Multi-job + per-job notes preserved')

assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached')
assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch preserved')

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
  assert(!src.includes('Phase DAB.10f.3'),
    `${path} carries no Phase DAB.10f.3 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
