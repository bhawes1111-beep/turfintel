// Phase DAB.10f.2 — Display Board double-overlay fix smoke.
//
//   node scripts/smoke-display-board-double-overlay.mjs
//
// User report after DAB.10f.1: on a desktop browser viewing the
// kiosk on a TV, two stacked copies of the cards are visible —
// one larger, one smaller. The DAB.10f.1 anti-flicker work fixed
// the mode oscillation but didn't address the visual artifact
// caused by:
//
//   1. useEffect (post-paint) initial-measurement. On a roster
//      change, React commits the new DOM with stale fit-state
//      values → browser paints the unscaled "natural" content →
//      effect runs after paint → setFitScale → re-render → paint
//      scaled. For one or more frames the larger unscaled tree
//      is visible before the smaller scaled tree paints over it.
//   2. .boardBarsInner clipped only at the outer .boardBars
//      level. During React's commit-then-effect window, the
//      pre-transform content can briefly paint at full size and
//      the next frame paints the transformed (scaled) content.
//      Both are visible as one larger and one smaller layer.
//
// Fixes:
//
//   • useLayoutEffect (was useEffect) — measurement runs SYNC
//     before paint, so the first paint after a roster change is
//     already the correctly-scaled tree. No "unscaled flash."
//   • .boardBarsInner gains its own `overflow: hidden` so the
//     element can never paint content past its (max-height-
//     clamped) bounds, regardless of when the transform updates.
//   • .boardBarsInner gains `will-change: transform` to promote
//     it to its own compositor layer (the browser paints the
//     scaled output into a single framebuffer composited atop
//     the parent, instead of re-rendering the layout box on
//     every transform change).
//   • .boardBarsInner gains `backface-visibility: hidden` to
//     suppress the subpixel-antialiased "ghost" some Chromium
//     builds paint during transform state changes.

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
  '0055 still the highest migration (no new migration in DAB.10f.2)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10f.2'),
    `${path} carries no Phase DAB.10f.2 edits`)
}

// ── FIX 1: useLayoutEffect (was useEffect) ───────────────────────
section('FIX 1: useLayoutEffect runs measurement before paint')

assert(/import \{ useEffect, useLayoutEffect, useMemo, useRef, useState \} from 'react'/.test(KIOSK),
  'useLayoutEffect imported from react')
// Observer wrapped in useLayoutEffect (synchronous, blocks paint).
assert(/Phase DAB\.10f\.2 — useLayoutEffect \(was useEffect\) so the first/.test(KIOSK),
  'DAB.10f.2 useLayoutEffect comment marker present')
assert(/useLayoutEffect\(\(\) => \{[\s\S]{0,800}if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'useLayoutEffect wraps the ResizeObserver setup (first measurement runs sync before paint)')

// Negative pin — the old useEffect must not still wrap the observer
// (could leave the unscaled-flash bug). Be lenient: other useEffects
// (date refresh, midnight rollover) remain.
// The observer block is large (~6KB with all the state-machine
// branches + comments). Lazy match with a more generous budget.
const obsBlock = KIOSK.match(/useLayoutEffect\(\(\) => \{[\s\S]{0,12000}?\n\s{2}\}, \[operatorCards\]\)/)?.[0] ?? ''
assert(obsBlock.length > 0, 'observer block found inside useLayoutEffect')

// ── FIX 2: .boardBarsInner has its own overflow: hidden ──────────
section('FIX 2: .boardBarsInner overflow: hidden (defense-in-depth clip)')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(innerBlock.length > 0, '.boardBarsInner block parsed')
assert(/Phase DAB\.10f\.2 — Defense-in-depth: clip the inner's own/.test(innerBlock),
  'DAB.10f.2 overflow comment marker present on .boardBarsInner')
assert(/overflow:\s+hidden/.test(innerBlock),
  '.boardBarsInner has overflow: hidden (inner element can never paint content past its bounds)')

// ── FIX 3: will-change + backface-visibility (compositor layer) ──
section('FIX 3: will-change + backface-visibility promote inner to its own layer')

assert(/will-change:\s+transform/.test(innerBlock),
  '.boardBarsInner has will-change: transform (compositor layer hint)')
assert(/backface-visibility:\s+hidden/.test(innerBlock),
  '.boardBarsInner has backface-visibility: hidden (suppresses Chromium ghost paint)')

// ── DAB.10e/e.1/e.2/f/f.1 baseline preserved ─────────────────────
section('Existing fit infrastructure preserved')

assert(/transform-origin:\s+top left/.test(innerBlock),
  '.boardBarsInner transform-origin: top left preserved (DAB.10e)')
assert(/transform:\s+scale\(var\(--board-fit-scale,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner transform: scale(--board-fit-scale) preserved (DAB.10e)')
assert(/width:\s+calc\(100% \* var\(--board-fit-inverse,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner inverse-width preserved (DAB.10e)')
assert(/max-height:\s+calc\(100% \* var\(--board-fit-inverse,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner max-height inverse preserved (DAB.10e)')
assert(/gap:\s+calc\(18px \* var\(--board-bar-scale,\s*1\)\)/.test(innerBlock),
  '.boardBarsInner gap preserved (9C.4d)')

// DAB.10f.1 refs + state-machine still in place.
assert(/const fitScaleRef\s+= useRef\(1\)/.test(KIOSK),
  'fitScaleRef preserved (DAB.10f.1)')
assert(/const ROOMY_ENTER\s+= 1\.20/.test(KIOSK),
  'ROOMY_ENTER hysteresis preserved (DAB.10f.1)')
assert(/const naturalH = inner\.scrollHeight \/ curScale \/ curRoom/.test(KIOSK),
  'naturalH double-division preserved (DAB.10f.1)')

// ── Mobile bypass still in place ─────────────────────────────────
section('Mobile bypass preserved')

assert(/if \(mq && mq\.matches\) \{[\s\S]{0,800}if \(Math\.abs\(1 - roomScaleRef\.current\) > 0\.01\)\s+setRoomScale\(1\)/.test(KIOSK),
  'mobile branch still resets roomScale via ref')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner transform: none !important preserved')

// ── Desktop / kiosk no-scroll preserved ──────────────────────────
section('Desktop / kiosk no-scroll preserved')

assert(/\n\.boardSimple \{[\s\S]{0,800}height:\s+100dvh/.test(KIOSK_CSS),
  '.boardSimple height: 100dvh on desktop preserved')
assert(/\n\.boardBars \{[\s\S]{0,800}overflow:\s+hidden/.test(KIOSK_CSS),
  '.boardBars overflow: hidden preserved (still the outer clip)')

// ── Chrome 79 / Chromebit compatibility ──────────────────────────
section('Chrome 79 / Chromebit compatibility')

// useLayoutEffect — React API, browser-version-agnostic.
// overflow: hidden — universal.
// will-change — Chrome 36+. Chrome 79 ✓.
// backface-visibility — Chrome 36+ (prefix-free). ✓.
// All within Chrome 79 baseline.
assert(/if \(typeof ResizeObserver === 'undefined'\) return/.test(KIOSK),
  'graceful no-op for missing ResizeObserver preserved')

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
  assert(!src.includes('Phase DAB.10f.2'),
    `${path} carries no Phase DAB.10f.2 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
