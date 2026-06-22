// Phase DAB.10e.1 — Restore mobile Display Board scrolling smoke.
//
//   node scripts/smoke-display-board-mobile-scroll.mjs
//
// User report after DAB.10e: vertical scrolling stopped working on
// mobile. Root cause: .rootBoard carries `position: fixed; inset: 0;
// z-index: 60` (line 35-42 of DisplayBoard.module.css, from the
// legacy 9C base styles). DAB.10d / DAB.10e's mobile breakpoint
// released .boardSimple + .boardBars + .boardBarsInner but missed
// .rootBoard — and since the kiosk wrapper element has all three
// classes (.root.rootBoard.boardSimple), the position-fixed lock
// kept the document trapped in the viewport on mobile.
//
// Fix: extend the @media (max-width: 600px) block to also release
// .rootBoard.boardSimple to `position: static; inset: auto;
// z-index: auto`. Also flip .boardBars from `flex: 1 1 auto` to
// `flex: 0 0 auto; height: auto` so it grows to natural content
// height (pushing the document up) instead of being capped by the
// flex parent's distributed share.
//
// Companion JS change: BoardModeCrewBars matchMedia check pins
// fitScale to 1 on mobile so the ResizeObserver doesn't fight the
// CSS `transform: none !important` override in a feedback loop.

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
  '0055 still the highest migration (no new migration in DAB.10e.1)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.module.css',
  'worker/api/assignments.js',
  'worker/index.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10e.1'),
    `${path} carries no Phase DAB.10e.1 edits`)
}

// ── Desktop / kiosk no-scroll behavior preserved ──────────────────
section('Desktop / kiosk no-scroll behavior preserved')

// .rootBoard still position-fixed on desktop (line 35-42 base styles).
assert(/\n\.rootBoard \{[\s\S]{0,400}position:\s+fixed[\s\S]{0,200}inset:\s+0/.test(KIOSK_CSS),
  '.rootBoard still position: fixed + inset: 0 on desktop (kiosk viewport lock preserved)')

// .boardSimple still height: 100dvh + overflow: hidden on desktop.
const baseBoardSimple = KIOSK_CSS.match(/\n\.boardSimple \{([\s\S]{0,1000}?)\n\}/)?.[1] ?? ''
assert(baseBoardSimple.length > 0, '.boardSimple base block parsed')
assert(/height:\s+100dvh/.test(baseBoardSimple),
  '.boardSimple base rule still height: 100dvh (kiosk viewport-fit preserved)')
assert(/overflow:\s+hidden/.test(baseBoardSimple),
  '.boardSimple base rule still overflow: hidden (kiosk page-scroll lock preserved)')

// .boardBars still overflow: hidden + flex: 1 1 auto on desktop.
const baseBoardBars = KIOSK_CSS.match(/\n\.boardBars \{([\s\S]{0,800}?)\n\}/)?.[1] ?? ''
assert(baseBoardBars.length > 0, '.boardBars base block parsed')
assert(/flex:\s+1\s+1\s+auto/.test(baseBoardBars),
  '.boardBars base rule still flex: 1 1 auto (kiosk flex layout preserved)')
assert(/overflow:\s+hidden/.test(baseBoardBars),
  '.boardBars base rule still overflow: hidden (DAB.10e desktop clipping preserved)')

// .boardBarsInner still transforms by --board-fit-scale on desktop.
const baseInner = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,1200}?)\n\}/)?.[1] ?? ''
assert(baseInner.length > 0, '.boardBarsInner base block parsed')
assert(/transform:\s+scale\(var\(--board-fit-scale,\s*1\)\)/.test(baseInner),
  '.boardBarsInner base rule still transform: scale(var(--board-fit-scale)) (DAB.10e fit-to-screen preserved)')

// ── Root cause fix: .rootBoard mobile release ────────────────────
section('Mobile @media (max-width: 600px) releases .rootBoard position-fixed')

assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'DAB.10e.1 mobile fix block annotated in CSS')

// The fix is in the @media (max-width: 600px) block. It targets the
// combined .rootBoard.boardSimple selector (the JSX wraps the kiosk
// in all three classes: .root.rootBoard.boardSimple).
const rootBoardMobileMatch = KIOSK_CSS.match(/Phase DAB\.10e\.1 — Mobile scroll regression fix[\s\S]{0,2000}/)?.[0] ?? ''
assert(rootBoardMobileMatch.length > 0, 'DAB.10e.1 mobile block located')

assert(/\.rootBoard\.boardSimple,?\s*\n?\s*\.root\.rootBoard\.boardSimple/.test(rootBoardMobileMatch),
  'mobile fix targets .rootBoard.boardSimple (both class-chain variants)')
assert(/position:\s+static/.test(rootBoardMobileMatch),
  'mobile .rootBoard.boardSimple → position: static (releases the page-trap fixed positioning)')
assert(/inset:\s+auto/.test(rootBoardMobileMatch),
  'mobile .rootBoard.boardSimple → inset: auto (releases the 4-edge anchor)')
assert(/z-index:\s+auto/.test(rootBoardMobileMatch),
  'mobile .rootBoard.boardSimple → z-index: auto (releases the layering pin)')

// ── Mobile .boardSimple + .boardBars + .boardBarsInner releases ──
section('Mobile releases inner containers (DAB.10d/e regressions preserved)')

// .boardSimple mobile override preserved from DAB.10d.
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}height:\s+auto/.test(KIOSK_CSS),
  'mobile .boardSimple → height: auto (DAB.10d preserved)')
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}min-height:\s+100dvh/.test(KIOSK_CSS),
  'mobile .boardSimple → min-height: 100dvh (DAB.10d preserved)')
assert(/Phase DAB\.10d — Mobile exception[\s\S]{0,800}overflow:\s+visible/.test(KIOSK_CSS),
  'mobile .boardSimple → overflow: visible (DAB.10d preserved)')

// .boardBars mobile flex change is part of DAB.10e.1: switch from
// `flex: 1 1 auto` (caps at flex-share) to `flex: 0 0 auto` + height:
// auto so the natural content height grows .boardSimple and gives
// the document something to scroll.
assert(/Phase DAB\.10e\.1 — flex: 1 1 auto would still cap height/.test(KIOSK_CSS),
  'DAB.10e.1 mobile .boardBars flex-change comment present')
assert(/Phase DAB\.10d — Inner container can also expand on mobile[\s\S]{0,800}flex:\s+0\s+0\s+auto/.test(KIOSK_CSS),
  'mobile .boardBars → flex: 0 0 auto (DAB.10e.1: grows to natural content height)')
assert(/Phase DAB\.10d — Inner container can also expand on mobile[\s\S]{0,800}height:\s+auto/.test(KIOSK_CSS),
  'mobile .boardBars → height: auto (DAB.10e.1: companion to flex change)')
assert(/Phase DAB\.10d — Inner container can also expand on mobile[\s\S]{0,800}overflow:\s+visible/.test(KIOSK_CSS),
  'mobile .boardBars → overflow: visible (DAB.10d preserved)')

// .boardBarsInner mobile transform release preserved from DAB.10e.
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}transform:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner → transform: none !important (DAB.10e preserved)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}width:\s+100%\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner → width: 100% !important (DAB.10e preserved)')
assert(/@media \(max-width: 600px\)[\s\S]{0,3000}\.boardBarsInner \{[\s\S]{0,400}max-height:\s+none\s*!important/.test(KIOSK_CSS),
  'mobile .boardBarsInner → max-height: none !important (DAB.10e preserved)')

// ── JS bypass — matchMedia mobile check ──────────────────────────
section('BoardModeCrewBars — matchMedia bypass on mobile')

// matchMedia mirror of the CSS breakpoint.
assert(/window\.matchMedia\('\(max-width: 600px\)'\)/.test(KIOSK),
  "matchMedia('(max-width: 600px)') mirrors the CSS breakpoint")

// Defensive ssr guard.
assert(/typeof window !== 'undefined' && window\.matchMedia/.test(KIOSK),
  'matchMedia call gated on window+matchMedia existence (SSR-safe)')

// When mobile, pin fitScale to 1 + early-return before the measurement.
// Phase DAB.10f.1 — fitScale now read via fitScaleRef.current.
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,400}if \(Math\.abs\(1 - fitScaleRef\.current\) > 0\.005\)\s+setFitScale\(1\)/.test(KIOSK),
  'mobile branch pins fitScale to 1 (DAB.10f.1 — reads via fitScaleRef.current)')
// Phase DAB.10f — mobile block grew (also resets roomScale to 1
// alongside fitMode='natural'); budget raised to accommodate.
assert(/if \(mq && mq\.matches\) \{[\s\S]{0,800}return/.test(KIOSK),
  'mobile branch early-returns before the measurement work')

// Breakpoint-crossing listener — rotation / window resize across
// 600px boundary re-runs measure. Both modern + legacy MediaQueryList
// listener APIs are wired (Chrome 90+ uses addEventListener; Chrome
// 79 + older Safari use the deprecated addListener).
assert(/mq\.addEventListener\('change', measure\)/.test(KIOSK),
  'modern mq.addEventListener("change", measure) wired')
assert(/mq\.addListener\(measure\)/.test(KIOSK),
  'legacy mq.addListener(measure) wired (Chrome 79 / older Safari)')

// Cleanup unhooks the matchMedia listener.
assert(/mq\.removeEventListener\('change', measure\)/.test(KIOSK),
  'cleanup unhooks modern mq.removeEventListener')
assert(/mq\.removeListener\(measure\)/.test(KIOSK),
  'cleanup unhooks legacy mq.removeListener')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility')

// matchMedia — Chrome 9+ universal.
// matchMedia.addListener — Chrome 14+ (deprecated but kept for compat).
// matchMedia.addEventListener — Chrome 90+. We wire both so 79 uses addListener fallback.
assert(/if \(mq\.addEventListener\) mq\.addEventListener\('change', measure\)\s*\n\s*else if \(mq\.addListener\) mq\.addListener\(measure\)/.test(KIOSK),
  'mq listener wiring: modern addEventListener preferred, legacy addListener fallback for Chrome 79')

// position: static / inset: auto / z-index: auto — all Chrome 1+.
// height: auto / min-height: 100dvh — dvh is Chrome 108+ but the
// existing .rootBoard ancestor fallback for older browsers IS the
// position: fixed we're now releasing on mobile. The trade-off:
// pre-Chrome-108 mobile gets `min-height: 0` effectively, which is
// fine since the document naturally grows past 100% viewport
// height as content overflows.
assert(/legacy \.rootBoard ancestor still provides position:fixed\/inset:0/.test(KIOSK_CSS),
  'Chrome 79 fallback comment preserved on .boardSimple (.rootBoard still provides fallback for non-mobile legacy browsers)')

// ── Existing DAB.10e desktop fit-to-screen behavior preserved ────
section('Existing DAB.10e desktop fit-to-screen still wired')

// Refs + state.
assert(/const containerRef = useRef\(null\)/.test(KIOSK),
  'containerRef still declared')
assert(/const innerRef\s+= useRef\(null\)/.test(KIOSK),
  'innerRef still declared')
assert(/const \[fitScale, setFitScale\] = useState\(1\)/.test(KIOSK),
  'fitScale state still declared')

// ResizeObserver still wired.
assert(/const ro = new ResizeObserver\(measure\)/.test(KIOSK),
  'ResizeObserver still instantiated')
assert(/ro\.observe\(container\)\s*\n\s*ro\.observe\(inner\)/.test(KIOSK),
  'observer still observes both container + inner')

// CSS variables.
assert(/'--board-fit-scale':\s+fitScale/.test(KIOSK),
  '--board-fit-scale CSS variable still wired')
assert(/'--board-fit-inverse':\s+1 \/ fitScale/.test(KIOSK),
  '--board-fit-inverse CSS variable still wired')

// data-fit-scale attribute.
assert(/data-fit-scale=\{fitScale < 1 \? 'scaled' : 'natural'\}/.test(KIOSK),
  'data-fit-scale attribute still set on .boardBars')

// 2-column widening at comfortable+scaled still in CSS.
assert(/data-density='comfortable'\]\[data-fit-scale='scaled'\] \.boardBarsInner/.test(KIOSK_CSS),
  'comfortable+scaled 2-col widening rule still present (DAB.10e width-first strategy)')

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
  assert(!src.includes('Phase DAB.10e.1'),
    `${path} carries no Phase DAB.10e.1 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
