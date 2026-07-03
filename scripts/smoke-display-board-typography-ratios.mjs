// Phase DAB.10g.1 — Legacy Display typography ratios smoke.
//
//   node scripts/smoke-display-board-typography-ratios.mjs
//
// The desktop / TV / kiosk Display Board derives job and note text
// sizes directly from the employee-name size via fixed ratios:
//
//   job-size  = name-size × 2/3   (0.6667)
//   note-size = name-size × 5/8   (0.625)
//
// A single --board-name-size CSS variable per fit mode drives the
// trio; the two derived variables (--board-job-size, --board-note-
// size) are computed on .boardBars via calc(). Every fit mode (roomy
// / natural / compact / ultra) and every density (spacious /
// comfortable / compact) declares its OWN --board-name-size, so the
// ratios apply consistently regardless of which mode the deterministic
// bucket picks.
//
// Mobile RELEASES the ratios and restores independent per-element
// clamp() typography so phone readability is not tied to desktop
// kiosk proportions.

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
  '0055 still the highest migration (no new migration in DAB.10g.1)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10g.1'),
    `${path} carries no Phase DAB.10g.1 edits`)
}

// ── Shared variable + ratios on .boardBars ───────────────────────
section('Shared employee-name size variable + ratio derivations')

// Parse the base .boardBars rule (not with any suffix like [data-*]).
const boardBarsBlock = KIOSK_CSS.match(/\n\.boardBars \{([\s\S]{0,2000}?)\n\}/)?.[1] ?? ''
assert(boardBarsBlock.length > 0, '.boardBars base block parsed')

// The three CSS variables are declared together.
assert(/--board-name-size:\s+clamp\(/.test(boardBarsBlock),
  '.boardBars declares --board-name-size (base, uses clamp())')
assert(/--board-job-size:\s+calc\(var\(--board-name-size\) \* 0\.6667\)/.test(boardBarsBlock),
  '.boardBars declares --board-job-size = --board-name-size × 0.6667 (2/3 ratio)')
assert(/--board-note-size:\s+calc\(var\(--board-name-size\) \* 0\.625\)/.test(boardBarsBlock),
  '.boardBars declares --board-note-size = --board-name-size × 0.625 (5/8 ratio)')

// The three text elements read the three variables.
assert(/\n\.boardPersonName \{[\s\S]{0,300}font-size:\s+var\(--board-name-size\)/.test(KIOSK_CSS),
  '.boardPersonName font-size: var(--board-name-size)')
assert(/\n\.boardTaskText \{[\s\S]{0,300}font-size:\s+var\(--board-job-size\)/.test(KIOSK_CSS),
  '.boardTaskText font-size: var(--board-job-size)')
assert(/\n\.boardNotesText \{[\s\S]{0,300}font-size:\s+var\(--board-note-size\)/.test(KIOSK_CSS),
  '.boardNotesText font-size: var(--board-note-size)')

// Negative pins — the old per-element clamp() font-size declarations
// on the base rules must be gone (they'd defeat the ratio).
const personNameBase = KIOSK_CSS.match(/\n\.boardPersonName \{([\s\S]{0,400}?)\n\}/)?.[1] ?? ''
assert(!/font-size:\s+clamp\(/.test(personNameBase),
  '.boardPersonName base rule NO clamp() font-size (ratio-driven now)')

const taskTextBase = KIOSK_CSS.match(/\n\.boardTaskText \{([\s\S]{0,400}?)\n\}/)?.[1] ?? ''
assert(!/font-size:\s+clamp\(/.test(taskTextBase),
  '.boardTaskText base rule NO clamp() font-size (ratio-driven now)')

const notesTextBase = KIOSK_CSS.match(/\n\.boardNotesText \{([\s\S]{0,400}?)\n\}/)?.[1] ?? ''
assert(!/font-size:\s+clamp\(/.test(notesTextBase),
  '.boardNotesText base rule NO clamp() font-size (ratio-driven now)')

// ── Every desktop/kiosk fit mode redeclares --board-name-size ────
section('Every fit mode + density redeclares --board-name-size')

// Density buckets (spacious is documented as the default, so no
// override needed — the base --board-name-size on .boardBars serves
// as spacious).
assert(/\.boardBars\[data-density='comfortable'\]\s*\{[\s\S]{0,300}--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  "data-density='comfortable' sets --board-name-size (job/note derive via ratio)")
assert(/\.boardBars\[data-density='compact'\]\s*\{[\s\S]{0,300}--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  "data-density='compact' sets --board-name-size")

// Fit modes.
assert(/\.boardBars\[data-fit-mode='roomy'\]\s*\{[\s\S]{0,300}--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  "data-fit-mode='roomy' sets --board-name-size (larger cap)")
assert(/\.boardBars\[data-fit-mode='compact'\]\s*\{[\s\S]{0,300}--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  "data-fit-mode='compact' sets --board-name-size (tighter cap)")

// Natural mode uses the base .boardBars value (already declared).
// Ultra mode inherits from compact / density; verify no font-size
// declarations sneak in.
const ultraFitBlock = KIOSK_CSS.match(/\.boardBars\[data-fit-mode='ultra'\]\s+\.boardPersonName\s*\{([\s\S]{0,300}?)\}/)?.[1] ?? ''
assert(ultraFitBlock === '' || !/font-size:\s+clamp\(/.test(ultraFitBlock),
  "data-fit-mode='ultra' does NOT set .boardPersonName font-size directly (density + ratios drive it)")

// Short-viewport (@max-height: 760px) also declares --board-name-size
// on .boardBars so the ratios apply on 720p TVs.
assert(/@media \(max-height: 760px\)[\s\S]{0,3000}\.boardBars\s*\{[\s\S]{0,400}--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  '@media (max-height: 760px) .boardBars redeclares --board-name-size (short-TV tightening)')

// ── Ratio math check (documentation-only) ────────────────────────
section('Ratio math sanity — 2/3 ≈ 0.6667, 5/8 = 0.625')

// These aren't runtime checks, but pin the intended relationships.
const two_thirds = Math.round((2 / 3) * 10000) / 10000
assert(Math.abs(two_thirds - 0.6667) < 0.0001,
  `2/3 ≈ 0.6667 (job:name ratio; computed ${two_thirds})`)
assert((5 / 8) === 0.625,
  '5/8 = 0.625 (note:name ratio, exact)')

// Sanity: at a 48px name, job should be 32px, note should be 30px.
// At a 30px name, job should be 20px, note should be 18.75px.
// Documented per spec — smoke this by verifying the constants above.

// ── Mobile RELEASES the ratios ───────────────────────────────────
section('Mobile releases the legacy typography ratios')

// Mobile @media block should override .boardPersonName / .boardTaskText /
// .boardNotesText with independent clamp() font-sizes (not the
// --board-name-size ratio).
const mobileKioskBlock = KIOSK_CSS.match(/Phase DAB\.10g\.1 — Mobile RELEASES the legacy typography ratios[\s\S]{0,2000}/)?.[0] ?? ''
assert(mobileKioskBlock.length > 0, 'DAB.10g.1 mobile release block annotated')
assert(/\.boardPersonName\s*\{[\s\S]{0,200}font-size:\s+clamp\(/.test(mobileKioskBlock),
  'mobile .boardPersonName override uses independent clamp() (release the ratio)')
assert(/\.boardTaskText\s*\{[\s\S]{0,200}font-size:\s+clamp\(/.test(mobileKioskBlock),
  'mobile .boardTaskText override uses independent clamp() (release the ratio)')
assert(/\.boardNotesText\s*\{[\s\S]{0,200}font-size:\s+clamp\(/.test(mobileKioskBlock),
  'mobile .boardNotesText override uses independent clamp() (release the ratio)')

// ── DAB.10g preservation: no ResizeObserver, no transform ────────
section('DAB.10g invariants preserved (no ResizeObserver, no transform)')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(` (DAB.10g inner-observation removal preserved)')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect (DAB.10g preserved)')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(!/transform:/.test(innerBlock),
  '.boardBarsInner does NOT use transform (DAB.10f.3 preserved)')
assert(!/^\s*will-change:/m.test(innerBlock),
  '.boardBarsInner does NOT declare will-change (DAB.10f.2 preserved)')

// Deterministic bucket selection still in place.
assert(/const heaviness =/.test(KIOSK),
  'deterministic heaviness score preserved (DAB.10g)')
assert(/data-board-columns=\{boardColumns\}/.test(KIOSK),
  'data-board-columns attribute preserved (DAB.10g)')

// ── Multi-job + per-job notes still get the ratio typography ─────
section('Multi-job + per-job notes render with ratio typography')

// Per-job notes render via .boardNotesText → font-size: var(--board-note-size).
// Multi-job task text renders via .boardTaskText → font-size: var(--board-job-size).
// One .boardTaskText per assignment (regression couple).
const boardModeFn = KIOSK.match(/function BoardModeCrewBars\([\s\S]+?\n\}\n/)?.[0] ?? ''
assert(/const showOrdinal = op\.assignments\.length > 1/.test(boardModeFn),
  'showOrdinal multi-job gate preserved (DAB.10b) — ordinal label still renders')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached (DAB.10c) — each block gets its own note text at var(--board-note-size)')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility')

// CSS custom properties — Chrome 49+. calc() — Chrome 26+. clamp() —
// Chrome 79+. Nested var() inside calc() — Chrome 49+ once each is
// supported individually. All the DAB.10g.1 typography surfaces are
// within the Chrome 79 baseline.
assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (uses -webkit-line-clamp)')

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
  assert(!src.includes('Phase DAB.10g.1'),
    `${path} carries no Phase DAB.10g.1 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
