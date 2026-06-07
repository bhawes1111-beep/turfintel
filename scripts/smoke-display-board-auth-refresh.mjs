// Phase 9C.4a — Display Board public route auth + boardMode refresh.
//
//   node scripts/smoke-display-board-auth-refresh.mjs
//
// Source-only checks confirming:
//   - /display-board/board is the only public no-login data route
//     (still outside RequireAuth)
//   - /display-board/print is now wrapped in RequireAuth
//   - normal /display-board remains inside the authenticated Layout
//   - boardMode auto-refresh is 60s; normal refresh stays at 3 min
//   - printMode skips auto-refresh entirely
//   - boardMode includes midnight rollover for selectedDate
//   - Phase 9C.3b regression couples (canDeleteTasks gate) preserved
//   - Phase 8B.1b regression (operatorCards derivation) preserved
//   - worker / D1 / stores untouched

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const APP = readFileSync('src/App.jsx', 'utf8')
const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')

// ── App.jsx routes ──────────────────────────────────────────────────────
section('App.jsx — route auth wiring')

// /display-board/board: must remain OUTSIDE RequireAuth. We match the
// exact Route element used today (single-line) and then verify that no
// RequireAuth wraps that DisplayBoard mount.
assert(/<Route\s+path="\/display-board\/board"\s+element=\{<DisplayBoard\s+boardMode\s*\/>\}\s*\/>/.test(APP),
  "/display-board/board route renders <DisplayBoard boardMode /> directly (no RequireAuth wrap)")

// /display-board/print: must now be wrapped in <RequireAuth>.
assert(/<Route[\s\S]{0,80}path="\/display-board\/print"[\s\S]{0,200}<RequireAuth>[\s\S]{0,80}<DisplayBoard\s+printMode\s*\/>[\s\S]{0,80}<\/RequireAuth>/.test(APP),
  "/display-board/print route is wrapped in <RequireAuth>")

// Normal /display-board route still mounts inside the authenticated Layout.
assert(/<Route path="\/" element=\{<RequireAuth><Layout \/><\/RequireAuth>\}>[\s\S]+<Route path="display-board" element=\{<DisplayBoard \/>\}/.test(APP),
  '/display-board (normal) route is still mounted inside the authenticated Layout wrap')

// Comment must call out the new policy.
assert(/Phase 9C\.4a[\s\S]{0,300}only public kiosk\/data\s+route/.test(APP),
  'App.jsx comment names /display-board/board as the only public kiosk/data route')
assert(/Phase 9C\.4a[\s\S]{0,300}requires a session/.test(APP),
  'App.jsx comment notes /display-board/print now requires a session')

// ── DisplayBoard.jsx — refresh cadence + midnight rollover ─────────────
section('DisplayBoard.jsx — mode-aware refresh cadence')

assert(/const\s+BOARD_REFRESH_MS\s*=\s*3 \* 60 \* 1000/.test(DB),
  'BOARD_REFRESH_MS = 3 * 60 * 1000 preserved for normal /display-board')
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'KIOSK_REFRESH_MS = 60 * 1000 added for /display-board/board (boardMode)')

// Mode-aware derivation.
assert(/const\s+intervalMs\s*=\s*printMode\s*\?\s*null\s*:\s*\(boardMode\s*\?\s*KIOSK_REFRESH_MS\s*:\s*BOARD_REFRESH_MS\)/.test(DB),
  'intervalMs = printMode ? null : (boardMode ? KIOSK_REFRESH_MS : BOARD_REFRESH_MS)')

// useEffect early-returns when interval is null (printMode), and uses intervalMs.
assert(/if \(intervalMs == null\) return/.test(DB),
  'refresh effect early-returns when intervalMs is null (printMode)')
// Phase 9C.6 — the setInterval body grew (added the !boardDateTouched
// rollover comment block) so the regex window widened from 1000 → 2000.
assert(/setInterval\([\s\S]{0,2000}\},\s*intervalMs\)/.test(DB),
  'setInterval uses intervalMs (not the legacy BOARD_REFRESH_MS literal)')

// Existing refresh suite still runs inside the tick — regression couple.
for (const refresher of [
  'refreshCalendarData', 'refreshSpraysData', 'refreshAssignmentsData',
  'refreshAlertsData', 'refreshCrewData', 'refreshOperationsNotesData',
  'refreshMoisture',
]) {
  assert(new RegExp(`${refresher}\\(\\)`).test(DB),
    `refresh tick still calls ${refresher}()`)
}

// Midnight rollover — only in boardMode.
section('DisplayBoard.jsx — midnight rollover (boardMode only)')

// Phase 9C.6 — boardMode rollover is now gated by !boardDateTouched so
// a user-shifted kiosk date isn't yanked back to today on every 60s
// tick. Accept either the un-gated (legacy) or gated form.
assert(/if \(boardMode(?:\s*&&\s*!boardDateTouched)?\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  'boardMode block: if selectedDate !== isoToday(), setSelectedDate(today) — gated by !boardDateTouched in 9C.6')
assert(/const\s+todayNow\s*=\s*isoToday\(\)/.test(DB),
  'todayNow is recomputed inside the refresh tick via isoToday()')

// Print mode must NOT auto-refresh — confirmed by the null-guard above,
// plus a paranoia check that printMode doesn't sneak into the same
// branch as setInterval.
assert(/printMode\s*\?\s*null/.test(DB),
  'printMode is explicitly mapped to null in the intervalMs ternary (no auto-refresh)')

// ── Regression couples ────────────────────────────────────────────────
section('Regression couples — 9C.3b delete gate + 8B.1b operatorCards')

assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'Phase 9C.3b: canDeleteTasks = !boardMode && !printMode (delete still hidden in board/print)')
assert(/const\s+operatorCards\s*=\s*useMemo\(/.test(DB),
  'Phase 8B.1b: operatorCards useMemo derivation still present')

// Live-clock tick should still be there (1s interval — distinct from refresh).
assert(/setInterval\(\(\) => setNow\(new Date\(\)\),\s*1000\)/.test(DB),
  'live clock 1-second interval preserved (separate from the data refresh)')

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — worker / D1 / stores untouched')

const WORKER = readFileSync('worker/api/calendar.js', 'utf8')
assert(!WORKER.includes('Phase 9C.4a'),
  'worker/api/calendar.js carries no Phase 9C.4a edits')

const CAL_STORE = readFileSync('src/utils/calendar/calendarStore.js', 'utf8')
assert(!CAL_STORE.includes('Phase 9C.4a'),
  'calendarStore.js carries no Phase 9C.4a edits')

const ASN_STORE = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
assert(!ASN_STORE.includes('Phase 9C.4a'),
  'assignmentsStore.js carries no Phase 9C.4a edits')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(!DAB.includes('Phase 9C.4a'),
  'DailyAssignmentBoard.jsx carries no Phase 9C.4a edits')

const OB = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')
assert(!OB.includes('Phase 9C.4a'),
  'OperationsBoard.jsx carries no Phase 9C.4a edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
