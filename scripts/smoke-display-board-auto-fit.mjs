// Phase DAB.10d — Display Board auto-fit / no-scroll kiosk smoke.
//
//   node scripts/smoke-display-board-auto-fit.mjs
//
// Pins the kiosk-mode auto-fit behavior on desktop / display hardware
// + the mobile exception that allows normal page scrolling.
//
// Built atop the existing 9C.4c/d/e density system (operator count +
// assignment count → spacious / comfortable / compact bucket → CSS
// data-density attribute selectors). DAB.10d adds:
//
//   1. Default 4-line clamp on .boardNotesText for spacious density
//      (multi-job operators with verbose notes can no longer push
//      the roster past viewport height).
//   2. Mobile (max-width: 600px) override: .boardSimple releases its
//      height: 100dvh + overflow: hidden so the document scrolls
//      naturally on phones; .boardBars releases overflow-y: auto
//      so the inner scroll-trap doesn't strand cards on iOS.
//   3. Multi-job task-block tightening under comfortable + compact
//      densities (per-block padding + gap shrink so 3-job operators
//      don't 3x their card height).
//   4. Job-ordinal label scales with density so the "1st Job / 2nd
//      Job / 3rd Job" badges don't waste TV real estate when the
//      board is tight.
//
// Chrome 79 / Chromebit compatibility — uses -webkit-line-clamp +
// -webkit-box-orient: vertical (the canonical cross-browser pattern)
// which Chrome 79 supports natively.

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

// ── No DAB editor / no worker / no migration changes ──────────────
section('Frontend-only — no DAB editor / worker / migration changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10d)')

assert(!DAB.includes('Phase DAB.10d'),
  'DailyAssignmentBoard carries no Phase DAB.10d edits (editor untouched)')
assert(!ASSIGN_W.includes('Phase DAB.10d'),
  'worker/api/assignments.js carries no Phase DAB.10d edits (worker untouched)')

// ── Existing density system intact (DAB.10d builds atop it) ───────
section('Existing 9C.4c/d/e density system preserved')

// Bucket computation.
assert(/operatorCount >= 10 \|\| assignmentCount >= 16 \? 'compact'\s*\n\s*: operatorCount >= 6 \|\| assignmentCount >= 10 \? 'comfortable'\s*\n\s*: 'spacious'/.test(KIOSK),
  'density bucket logic preserved: compact / comfortable / spacious')
assert(/const boardBarScale = Math\.max\(\s*\n?\s*0\.45,\s*\n?\s*Math\.min\(0\.66, 0\.66 - Math\.max\(0, assignmentCount - 2\) \* 0\.025\)/.test(KIOSK),
  'boardBarScale per-assignment shrink curve preserved (0.45 floor, 0.66 ceiling)')

// CSS variables exposed to CSS via inline style.
assert(/'--board-bar-scale':\s+boardBarScale/.test(KIOSK),
  '--board-bar-scale CSS variable still set inline on .boardBars')
assert(/'--board-operator-count':\s+operatorCount/.test(KIOSK),
  '--board-operator-count CSS variable still set inline')
assert(/'--board-assignment-count':\s+assignmentCount/.test(KIOSK),
  '--board-assignment-count CSS variable still set inline')

// Kiosk root viewport-fit (DAB pre-existing).
assert(/height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh still defined (kiosk no-scroll base)')
assert(/\.boardSimple\s*\{[\s\S]{0,400}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardSimple overflow: hidden still defined (kiosk page-level scroll lock)')

// Phase DAB.10e — .boardBars no longer uses overflow-y: auto as the
// escape valve. It clips overflow; the inner wrapper is transform-
// scaled by JS so the content actually fits. min-height: 0 is still
// mandatory for the flex child to shrink below natural content height.
assert(/\.boardBars\s*\{[\s\S]{0,800}min-height:\s+0[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars flex child with min-height: 0 + overflow: hidden (clips, no scrollbar)')

// ── FIX 1: spacious-density notes clamp ──────────────────────────
section('FIX 1: Default 4-line notes clamp (spacious density)')

// The base .boardNotesText now carries the -webkit-line-clamp: 4
// rule + display: -webkit-box scaffolding. Without it, a multi-job
// operator with verbose per-job notes could push the spacious
// roster past viewport height.
// The base .boardNotesText rule body. We inspect the file as a
// whole and verify the DAB.10d additions appear in proximity to
// the base selector (within ~1KB) — they are guaranteed to be in
// that block since data-density overrides are written later in
// the file. Pinning by proximity is more robust than trying to
// match through CSS-comment braces that confuse a non-CSS regex.
const baseNotesIdx = KIOSK_CSS.indexOf('\n.boardNotesText {')
assert(baseNotesIdx >= 0, '.boardNotesText base selector located')
const baseNotesWindow = KIOSK_CSS.slice(baseNotesIdx, baseNotesIdx + 1000)
assert(/display:\s+-webkit-box/.test(baseNotesWindow),
  'base .boardNotesText uses display: -webkit-box (Chrome 79 compatible line-clamp scaffold)')
assert(/-webkit-line-clamp:\s+4/.test(baseNotesWindow),
  'base .boardNotesText clamps to 4 lines (spacious default)')
assert(/-webkit-box-orient:\s+vertical/.test(baseNotesWindow),
  'base .boardNotesText sets -webkit-box-orient: vertical (required by webkit clamp)')
assert(/overflow:\s+hidden/.test(baseNotesWindow),
  'base .boardNotesText hides overflow (required to clip clamped text)')

// Comfortable + compact override the line count tighter.
assert(/data-density='comfortable'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+3/.test(KIOSK_CSS),
  'comfortable density overrides to 3-line clamp')
assert(/data-density='compact'\] \.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+2/.test(KIOSK_CSS),
  'compact density overrides to 2-line clamp')

// ── FIX 2: Mobile exception ──────────────────────────────────────
section('FIX 2: Mobile (max-width: 600px) releases kiosk no-scroll')

// Mobile breakpoint releases the boardSimple kiosk lock. Pin via
// the comment marker that flags the .boardSimple rule we care about
// (the file has multiple .boardSimple-like selectors in the mobile
// breakpoint after DAB.10e.1).
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}height:\s+auto/.test(KIOSK_CSS),
  'mobile .boardSimple uses height: auto (releases 100dvh lock)')
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}min-height:\s+100dvh/.test(KIOSK_CSS),
  'mobile .boardSimple keeps min-height: 100dvh (looks full on first paint, scrolls thereafter)')
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}overflow:\s+visible/.test(KIOSK_CSS),
  'mobile .boardSimple overflow: visible (lets page scroll naturally)')

// Phase DAB.10e — Mobile breakpoint releases the .boardBars clipping
// AND the .boardBarsInner transform scale, so phones get natural
// document scroll. Phase DAB.10e.1 also releases .rootBoard
// position-fixed (the actual root cause of the mobile scroll lock).
assert(/Phase DAB\.10d — Inner container can also expand on mobile[\s\S]{0,800}overflow:\s+visible/.test(KIOSK_CSS),
  'mobile .boardBars override releases clipping (overflow: visible)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none/.test(KIOSK_CSS),
  'mobile .boardBarsInner override sets transform: none (releases fit-to-screen)')

// ── FIX 3: Multi-job task block tightening ───────────────────────
section('FIX 3: Multi-job .boardTaskBlock tightens with density')

assert(/data-density='comfortable'\] \.boardTaskBlock\s*\{[\s\S]{0,300}padding:[\s\S]{0,200}gap:/.test(KIOSK_CSS),
  'comfortable density tightens .boardTaskBlock padding + gap')
assert(/data-density='compact'\] \.boardTaskBlock\s*\{[\s\S]{0,300}padding:[\s\S]{0,200}gap:/.test(KIOSK_CSS),
  'compact density tightens .boardTaskBlock further')

// Job ordinal label scales with density too.
assert(/data-density='comfortable'\] \.boardJobOrdinal/.test(KIOSK_CSS),
  '.boardJobOrdinal font-size scales at comfortable density')
assert(/data-density='compact'\] \.boardJobOrdinal/.test(KIOSK_CSS),
  '.boardJobOrdinal font-size scales at compact density')

// ── Existing 2-column compact grid (wide TV) preserved ────────────
section('2-column compact grid preserved (wide TV)')

// Phase DAB.10e — Grid now lives on .boardBarsInner (the wrapper that
// owns the operator card layout). The compact-density selector now
// targets .boardBars[data-density='compact'] .boardBarsInner. Also
// added: comfortable density goes 2-col when fit-scale is engaged
// (DAB.10e widens-before-shrinking strategy).
// Phase DAB.10g — @media-driven 2-col grid replaced with --board-columns
// inline variable on .boardBarsInner. Column count is now picked by
// JSX from stable inputs (viewport.w + fit-mode + density).
assert(/\.boardBarsInner\s*\{[\s\S]{0,1000}grid-template-columns:\s+repeat\(var\(--board-columns,\s*1\), minmax\(0, 1fr\)\)/.test(KIOSK_CSS),
  '.boardBarsInner uses grid-template-columns: repeat(var(--board-columns, 1), …) — DAB.10g deterministic columns')

// ── Existing short-viewport tightening preserved ─────────────────
section('@media (max-height: 760px) short-TV tightening preserved')

assert(/@media \(max-height: 760px\)[\s\S]{0,500}\.boardSimple\s*\{[\s\S]{0,300}padding-block:/.test(KIOSK_CSS),
  '@media (max-height: 760px) tightens .boardSimple padding (short-TV optimization)')
assert(/@media \(max-height: 760px\)[\s\S]{0,500}\.boardPersonBar\s*\{[\s\S]{0,200}padding:/.test(KIOSK_CSS),
  '@media (max-height: 760px) tightens .boardPersonBar padding')
// Notes clamp tightens further at short-viewport.
assert(/@media \(max-height: 760px\)[\s\S]{0,2500}\.boardNotesText[\s\S]{0,400}-webkit-line-clamp:\s+2/.test(KIOSK_CSS),
  '@media (max-height: 760px) tightens notes to 2-line clamp')

// ── Multi-job + per-job notes preserved (DAB.10b/c regression couples) ─
section('Multi-job + per-job notes preserved (DAB.10b + DAB.10c)')

// Per-assignment notes render in their own task block.
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'each operator assignment carries its own notes (per-job notes intact)')

// jobOrder still pushed onto each assignment.
assert(/jobOrder:\s+a\.jobOrder \?\? 0/.test(KIOSK),
  'jobOrder still attached to each operator assignment (DAB.10b couple)')

// Multi-job sort: jobOrder ASC primary, startTime + priority break ties.
assert(/const jx = x\.jobOrder \?\? 0\s*\n\s*const jy = y\.jobOrder \?\? 0\s*\n\s*if \(jx !== jy\) return jx - jy/.test(KIOSK),
  'op.assignments sorted by jobOrder ASC primary (DAB.10b couple)')

// Ordinal labels gated on multi-job.
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal gate preserved (single-job operators stay label-free)')
assert(/const BOARD_ORDINAL_LABELS = \['1st Job', '2nd Job', '3rd Job', '4th Job'\]/.test(KIOSK),
  'BOARD_ORDINAL_LABELS constant preserved')

// .boardJobOrdinal base class still defined.
assert(/\.boardJobOrdinal\s*\{/.test(KIOSK_CSS),
  '.boardJobOrdinal base class still defined')

// ── Out-status preserved ──────────────────────────────────────────
section('Out-status rows preserved')

assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch still empties op.assignments')
// .crewCardOut still hides boardTaskBlock + boardNotesText.
assert(/\.crewCardOut \.boardNotesText/.test(KIOSK_CSS),
  '.crewCardOut .boardNotesText still hidden')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / legacy compatibility — uses webkit-line-clamp pattern')

// -webkit-line-clamp + display: -webkit-box + -webkit-box-orient is
// the universally-compatible line-clamp pattern; Chrome 79 supports
// it natively. The newer line-clamp shorthand (without the prefix)
// is NOT used (would require Chrome 111+).
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed `line-clamp:` (would break Chrome 79; uses webkit-prefixed only)')

// height: 100dvh is also a recent unit (Chrome 108+) but the existing
// 9C.4d comment explicitly notes the .rootBoard ancestor provides
// position:fixed/inset:0 as the Chrome 79 fallback. Confirm that
// architecture comment is still in place.
assert(/legacy \.rootBoard ancestor still provides position:fixed\/inset:0\s*\n\s*as a fallback for older browsers that don't honor 100dvh/.test(KIOSK_CSS),
  'Chrome 79 fallback documented: .rootBoard ancestor provides position:fixed/inset:0 when 100dvh is unsupported')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — DAB editor / spray / inventory untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
  'worker/api/assignments.js',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10d'),
    `${path} carries no Phase DAB.10d edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
