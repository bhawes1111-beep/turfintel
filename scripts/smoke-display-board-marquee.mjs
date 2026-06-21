// Phase 9C.5a — Kiosk date-top + alert marquee smoke.
//
//   node scripts/smoke-display-board-marquee.mjs
//
// Source-only checks against DisplayBoard.jsx + its CSS. /display-board/board
// gains two layout changes:
//   1. The selected date moves from a bottom <footer styles.boardDateOnly>
//      to a top <header styles.boardDateTop>, anchored as the first child
//      of the simplified kiosk wrapper.
//   2. A red scrolling alert marquee renders immediately below the date,
//      driven by liveAlerts plus crew-broadcast-priority dayNotes
//      (urgent | safety | weather only). View-only — no dismiss / close
//      / edit affordances.
//
// All earlier kiosk invariants (9C.4d scale, 9C.4c density, 9C.4b
// simplified branch, 9C.4a auth + 60s refresh + midnight rollover,
// 9C.3b delete gate) must remain in place. Normal /display-board and
// /display-board/print stay unchanged.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

// Re-extract the boardMode early-return slice for forbidden / ordering checks.
// The body contains nested JSX with its own parens (e.g. `prettyDate(selectedDate)`),
// so anchor on the `if (boardMode && !printMode) { return (` opener and the
// outermost closing `) }` by matching `</div>\s*\)\s*\}` — the early return
// always ends with `</div>` + the JSX expression close + the if-block close.
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''

// Locate the kioskAlerts derivation. Phase 9C.5a places it just above
// the early-return so the existing `if (boardMode && !printMode) {
// return ( ... ) }` shape stays a one-liner for the legacy regex
// regression couples in the other Display Board smokes.
const kioskAlertsMatch = DB.match(/const\s+kioskAlerts\s*=\s*\[[\s\S]*?\]\.filter\(a\s*=>\s*\(a\.text\s*\?\?\s*''\)\.trim\(\)\.length\s*>\s*0\)/)
const kioskAlertsSrc   = kioskAlertsMatch ? kioskAlertsMatch[0] : ''

// ── kioskAlerts derivation ─────────────────────────────────────────────
section('kioskAlerts derivation — public-safe alert + dayNote stream')

assert(kioskAlertsSrc.length > 0,
  'const kioskAlerts = [ ... ].filter(...) derivation exists in DisplayBoard.jsx')

// liveAlerts is the existing already-filtered public alert source.
assert(/liveAlerts\.map\(/.test(kioskAlertsSrc),
  'kioskAlerts spreads liveAlerts.map(...) (existing public-safe alerts source)')

// dayNotes are filtered to crew-broadcast priorities only.
assert(/dayNotes\s*\n?\s*\.filter\(n\s*=>\s*n\.priority === 'urgent'\s*\|\|\s*n\.priority === 'safety'\s*\|\|\s*n\.priority === 'weather'\)/.test(kioskAlertsSrc),
  "dayNotes filtered to priority urgent | safety | weather only")

// Negative guards — routine + important must NOT make it into kioskAlerts.
assert(!/n\.priority === 'routine'/.test(kioskAlertsSrc),
  "kioskAlerts derivation does NOT include routine-priority dayNotes")
assert(!/n\.priority === 'important'/.test(kioskAlertsSrc),
  "kioskAlerts derivation does NOT include important-priority dayNotes")

// Blank entries get filtered out so an empty title+message alert
// doesn't surface an empty marquee item.
assert(/\.filter\(a\s*=>\s*\(a\.text\s*\?\?\s*''\)\.trim\(\)\.length\s*>\s*0\)/.test(kioskAlertsSrc),
  'kioskAlerts filters out entries with empty trimmed text')

// ── Early-return ordering: date → marquee → bars ───────────────────────
section('boardMode early return — date → marquee → BoardModeCrewBars order')

const datePos     = earlyReturnJsx.search(/<header className=\{styles\.boardDateTop\}>/)
const marqueePos  = earlyReturnJsx.search(/<BoardModeAlertMarquee\b/)
const barsPos     = earlyReturnJsx.search(/<BoardModeCrewBars\b/)
const footerPos   = earlyReturnJsx.search(/<footer className=\{styles\.boardDateOnly\}>/)

assert(datePos    >= 0, '<header styles.boardDateTop> is present in the early-return JSX')
assert(marqueePos >= 0, '<BoardModeAlertMarquee alerts={kioskAlerts} /> is present in the early-return JSX')
assert(barsPos    >= 0, '<BoardModeCrewBars operatorCards={operatorCards} /> is present in the early-return JSX')
assert(footerPos  <  0, 'legacy <footer styles.boardDateOnly> is NOT present in the early-return JSX')

assert(datePos < marqueePos,
  '.boardDateTop renders BEFORE <BoardModeAlertMarquee>')
assert(marqueePos < barsPos,
  '<BoardModeAlertMarquee> renders BEFORE <BoardModeCrewBars>')

// Marquee gets the kioskAlerts array as its sole alert source.
assert(/<BoardModeAlertMarquee alerts=\{kioskAlerts\}\s*\/>/.test(earlyReturnJsx),
  '<BoardModeAlertMarquee alerts={kioskAlerts} /> wires the derivation we just defined')

// ── BoardModeAlertMarquee component ────────────────────────────────────
section('BoardModeAlertMarquee component definition')

assert(/function\s+BoardModeAlertMarquee\s*\(\s*\{\s*alerts\s*\}\s*\)/.test(DB),
  'function BoardModeAlertMarquee({ alerts }) is defined')

// Empty-state: render nothing when no alerts exist.
assert(/if \(!alerts \|\| alerts\.length === 0\) return null/.test(DB),
  'BoardModeAlertMarquee returns null when alerts is empty/missing (no empty red bar on calm mornings)')

// View-only: no dismiss / close / edit / delete affordances in the marquee.
const marqueeSrc = (DB.match(/function\s+BoardModeAlertMarquee[\s\S]*?\n\}\n/) ?? [''])[0]
for (const forbidden of ['onClick', 'onDelete', 'onDismiss', 'onClose', 'button', 'Button']) {
  assert(!new RegExp(`\\b${forbidden}\\b`).test(marqueeSrc),
    `BoardModeAlertMarquee carries no ${forbidden} affordance (view-only kiosk)`)
}

// Marquee renders a track + items, and duplicates the track for a
// seamless wrap-around.
assert(/className=\{styles\.boardAlertMarqueeTrack\}/.test(marqueeSrc),
  'marquee uses styles.boardAlertMarqueeTrack')
assert(/className=\{styles\.boardAlertItem\}/.test(marqueeSrc),
  'marquee items use styles.boardAlertItem')
assert(/aria-hidden="true"/.test(marqueeSrc),
  'duplicate run is marked aria-hidden="true" for assistive tech')

// ── CSS — date top, marquee surfaces, animation, reduced motion ────────
section('CSS — .boardDateTop, .boardAlertMarquee*, @keyframes, prefers-reduced-motion')

// .boardDateTop replaces .boardDateOnly's role in the kiosk layout but
// keeps the same flex-pin behavior.
assert(/\.boardDateTop\s*\{[\s\S]{0,400}flex:\s*0\s+0\s+auto/.test(CSS),
  '.boardDateTop is flex: 0 0 auto (does not grow / shrink)')
// Phase 9C.6 — the .boardDateTop block grew (flex layout + new comment)
// so the regex window widened from 0-400 to 0-800 to accommodate the
// border-bottom rule that sits near the end of the block.
assert(/\.boardDateTop\s*\{[\s\S]{0,800}border-bottom:/.test(CSS),
  '.boardDateTop has a border-bottom separator (visually separates date from marquee/bars)')

// Marquee container has red bg + white text + overflow clip.
assert(/\.boardAlertMarquee\s*\{[\s\S]{0,800}background:\s*#b91c1c/.test(CSS) ||
       /\.boardAlertMarquee\s*\{[\s\S]{0,800}background:\s*#dc2626/.test(CSS) ||
       /\.boardAlertMarquee\s*\{[\s\S]{0,800}background:\s*(?:rgb|red|#[a-fA-F0-9]{3,8})/.test(CSS),
  '.boardAlertMarquee has a red background')
assert(/\.boardAlertMarquee\s*\{[\s\S]{0,800}color:\s*#(?:ffffff|fff)/i.test(CSS),
  '.boardAlertMarquee has white text (color: #ffffff or #fff)')
assert(/\.boardAlertMarquee\s*\{[\s\S]{0,800}overflow:\s*hidden/.test(CSS),
  '.boardAlertMarquee clips the off-screen portion of the scrolling track (overflow: hidden)')
assert(/\.boardAlertMarquee\s*\{[\s\S]{0,800}flex:\s*0\s+0\s+auto/.test(CSS),
  '.boardAlertMarquee is flex: 0 0 auto (does not grow / shrink)')

// Track + items + separator classes exist.
assert(/\.boardAlertMarqueeTrack\s*\{/.test(CSS),
  '.boardAlertMarqueeTrack class defined')
assert(/\.boardAlertItem\s*\{/.test(CSS),
  '.boardAlertItem class defined')

// Animation: @keyframes marquee-scroll + applied to .boardAlertMarqueeTrack.
assert(/@keyframes\s+marquee-scroll\s*\{/.test(CSS),
  '@keyframes marquee-scroll exists')
assert(/\.boardAlertMarqueeTrack\s*\{[\s\S]{0,800}animation:\s*marquee-scroll/.test(CSS),
  '.boardAlertMarqueeTrack uses animation: marquee-scroll')
assert(/@keyframes\s+marquee-scroll\s*\{[\s\S]{0,400}transform:\s*translateX\(-50%\)/.test(CSS),
  '@keyframes marquee-scroll ends at translateX(-50%) (seamless because the track is duplicated)')

// Reduced-motion fallback.
assert(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(CSS),
  '@media (prefers-reduced-motion: reduce) block exists')
assert(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]{0,400}\.boardAlertMarqueeTrack\s*\{[\s\S]{0,200}animation:\s*none/.test(CSS),
  'reduced-motion fallback sets .boardAlertMarqueeTrack { animation: none }')

// ── 9C.4d / 4c / 4b / 4a / 3b regression couples (still must hold) ─────
section('Regression couples — 9C.4d scale / 9C.4c density / 9C.4a auth+refresh / 9C.3b delete gate')

assert(/const\s+boardBarScale\s*=\s*Math\.max\(\s*0\.45\s*,/.test(DB),
  'Phase 9C.4d: boardBarScale formula floor 0.45 preserved')
assert(/Math\.min\(\s*0\.66\s*,\s*0\.66/.test(DB),
  'Phase 9C.4d: boardBarScale formula start 0.66 preserved')
assert(/data-density=\{density\}/.test(DB),
  'Phase 9C.4c: data-density attribute still on .boardBars wrapper')
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'Phase 9C.4a: KIOSK_REFRESH_MS = 60 * 1000 preserved')
// Phase 9C.6 — boardMode rollover gated by !boardDateTouched; accept either form.
assert(/if \(boardMode(?:\s*&&\s*!boardDateTouched)?\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  'Phase 9C.4a: midnight rollover preserved')
assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'Phase 9C.3b: canDeleteTasks = !boardMode && !printMode preserved')

// .boardSimple still height: 100dvh + overflow: hidden (so the inner
// .boardBars can own scrolling beneath the new top header+marquee).
assert(/\.boardSimple\s*\{[\s\S]{0,800}height:\s*100dvh/.test(CSS),
  'Phase 9C.4d: .boardSimple still locks to 100dvh')
assert(/\.boardSimple\s*\{[\s\S]{0,800}overflow:\s*hidden/.test(CSS),
  'Phase 9C.4d: .boardSimple still overflow: hidden')
assert(/\.boardBars\s*\{[\s\S]{0,800}flex:\s*1\s+1\s+auto/.test(CSS),
  'Phase 9C.4d: .boardBars still flex: 1 1 auto')
assert(/\.boardBars\s*\{[\s\S]{0,800}min-height:\s*0/.test(CSS),
  'Phase 9C.4d: .boardBars still min-height: 0 (engages inner scroll)')
// Phase DAB.10e — .boardBars overflow flipped from auto → hidden;
// JS-measured fit-scale now keeps content within bounds. The outer
// container still clips; the scrollbar is gone.
assert(/\.boardBars\s*\{[\s\S]{0,800}overflow:\s*hidden/.test(CSS),
  'Phase DAB.10e: .boardBars uses overflow: hidden (clips, no scrollbar)')

// ── Forbidden components inside the early-return ───────────────────────
section('boardMode early return — forbidden components still absent')

for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnJsx),
    `boardMode early return still excludes <${comp}>`)
}
assert(!/styles\.dateStrip/.test(earlyReturnJsx),
  'boardMode early return still excludes 7-day .dateStrip')
assert(!/styles\.assignDeleteBtn/.test(earlyReturnJsx),
  'boardMode early return still excludes .assignDeleteBtn')

// ── Privacy — no condition-log / private-notes leakage ─────────────────
section('Privacy — DisplayBoard still does not reference private notes / condition logs')

for (const term of [
  'conditionLogStore', 'conditionLog/', 'private_notes', 'privateNotes',
  'course_condition', 'course-condition', '/api/condition-logs',
]) {
  assert(!DB.includes(term),
    `Display Board does not reference "${term}"`)
}

// ── Normal /display-board + print path unchanged ───────────────────────
section('Normal /display-board + print path unchanged')

for (const node of [
  '<BrandHeader', '<DateClockPanel', '<ConditionsPanel',
  '<WeatherImpactsPanel', '<EquipmentStatusPanel', '<ModeToggle',
  '<OperationalIntelligencePanel', '<CrewBriefingPanel', '<FieldConditionsPanel',
]) {
  assert(new RegExp(node).test(DB),
    `legacy ${node}…> still rendered somewhere outside the boardMode branch`)
}
for (const cls of ['dateStrip', 'taskBoard', 'notesColumn', 'sidebar']) {
  assert(new RegExp(`styles\\.${cls}\\b`).test(DB),
    `legacy styles.${cls} still referenced in the non-boardMode render`)
}
assert(/printMode\s*&&\s*\(\s*<section className=\{styles\.printPage2\}/.test(DB),
  'printMode <section styles.printPage2> still preserved')

// ── Cross-file guards — Phase 9C.5a touches only DisplayBoard ──────────
section('Cross-file guards — worker / D1 / stores / Employees / DAB / OB untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/crew/crewStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/calendar.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  // Match the "Phase 9C.5a" marker but NOT later sub-phases like
  // "Phase 9C.5a.5" (which legitimately edits worker/api/crew.js +
  // worker/index.js for the public-GET privacy hardening).
  assert(!/Phase 9C\.5a(?![.\d])/.test(src),
    `${path} carries no Phase 9C.5a edits (later sub-phases like 9C.5a.5 are allowed)`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
