// Phase 9C.1 — Today date defaults smoke.
//
//   node scripts/smoke-today-defaults.mjs
//
// Source-only checks confirming every task/calendar board opens to
// today's date by default, with no May-2026 fixture pinning. Boards
// covered:
//   - OperationsBoard.jsx     (Tasks tab inside /crew)
//   - OperationsCalendar.jsx  (the dashboard-rooted operations calendar)
//   - DailyAssignmentBoard.jsx (Assignments tab inside /crew — regression couple)
//   - DisplayBoard.jsx        (regression couple)
//
// No worker, D1, or store files are touched by Phase 9C.1; cross-file
// guards at the bottom assert that explicitly.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const OB  = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')
const OC  = readFileSync('src/pages/Dashboard/OperationsCalendar.jsx', 'utf8')
const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')

// ── OperationsBoard.jsx — Tasks tab (Crosswinds) ────────────────────────
section('OperationsBoard.jsx — dynamic today, no May-2026 fixtures')

assert(!OB.includes("'2026-05-08'"),
  "OperationsBoard.jsx no longer contains '2026-05-08'")
assert(!OB.includes("'2026-05-09'"),
  "OperationsBoard.jsx no longer contains '2026-05-09'")

assert(/const\s+todayIso\s*=\s*\(\)\s*=>\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(OB),
  'OperationsBoard.jsx defines const todayIso = () => new Date().toISOString().slice(0, 10)')
assert(/const\s+TODAY\s*=\s*todayIso\(\)/.test(OB),
  'OperationsBoard.jsx assigns TODAY = todayIso() at module scope')

assert(/useState\(\(\)\s*=>\s*todayIso\(\)\)/.test(OB),
  'OperationsBoard.jsx selectedDate uses useState(() => todayIso()) function initializer')

// ── OperationsCalendar.jsx — dashboard calendar ─────────────────────────
section('OperationsCalendar.jsx — dynamic today, no May-2026 fixture')

assert(!OC.includes("'2026-05-08'"),
  "OperationsCalendar.jsx no longer contains '2026-05-08'")
assert(/const\s+todayIso\s*=\s*\(\)\s*=>\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(OC),
  'OperationsCalendar.jsx defines const todayIso = () => new Date().toISOString().slice(0, 10)')
assert(/const\s+TODAY\s*=\s*todayIso\(\)/.test(OC),
  'OperationsCalendar.jsx assigns TODAY = todayIso() at module scope')

// ── DailyAssignmentBoard.jsx — Assignments tab (regression couple) ─────
section('DailyAssignmentBoard.jsx — TODAY_ISO helper preserved')

assert(/const\s+TODAY_ISO\s*=\s*\(\)\s*=>\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(DAB),
  'DailyAssignmentBoard.jsx still defines TODAY_ISO = () => new Date().toISOString().slice(0, 10)')
assert(/useState\(TODAY_ISO\)/.test(DAB),
  'DailyAssignmentBoard.jsx selectedDate still seeded from TODAY_ISO')
assert(!DAB.includes("'2026-05-08'"),
  "DailyAssignmentBoard.jsx contains no '2026-05-08' fixture (still clean)")

// ── DisplayBoard.jsx — TV board (regression couple) ────────────────────
section('DisplayBoard.jsx — isoToday helper preserved')

assert(/function\s+isoToday\s*\(\s*\)\s*\{\s*return\s+new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(DB),
  'DisplayBoard.jsx still defines isoToday() returning new Date().toISOString().slice(0, 10)')
assert(/useState\(isoToday\)/.test(DB),
  'DisplayBoard.jsx selectedDate still seeded from isoToday')
assert(!DB.includes("'2026-05-08'"),
  "DisplayBoard.jsx contains no '2026-05-08' fixture (still clean)")

// ── Cross-file guards — worker / D1 / stores untouched ────────────────
section('Cross-file guards — worker / D1 / stores untouched')

const CAL = readFileSync('src/utils/calendar/calendarStore.js', 'utf8')
assert(!CAL.includes('Phase 9C.1'),
  'calendarStore.js carries no Phase 9C.1 edits')

const ASN = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
assert(!ASN.includes('Phase 9C.1'),
  'assignmentsStore.js carries no Phase 9C.1 edits')

const WORKER = readFileSync('worker/api/calendar.js', 'utf8')
assert(!WORKER.includes('Phase 9C.1'),
  'worker/api/calendar.js carries no Phase 9C.1 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
