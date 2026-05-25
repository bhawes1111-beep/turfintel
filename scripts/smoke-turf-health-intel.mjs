// Phase 7B.2 — computeTurfHealthIntel smoke.
//
//   node scripts/smoke-turf-health-intel.mjs
//
// Pure-function unit-style assertions over fixtures with a frozen `now`
// so windows + trend math are deterministic. Same style as
// smoke-moisture-intel.mjs.

import { computeTurfHealthIntel } from '../src/utils/turfHealth/turfHealthIntel.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// Stable "now" anchor for the smoke. All fixture dates are relative.
const NOW = Date.parse('2026-05-25T12:00:00Z')
const day = ms => 86_400_000 * ms
const iso = msAgo => new Date(NOW - msAgo).toISOString()

function dayIso(daysAgo) { return iso(day(daysAgo)) }

// ── Empty input → honest empty ─────────────────────────────────────────────
console.log('— empty input')
{
  const r = computeTurfHealthIntel([], { now: NOW })
  assert(r.hasData === false,           'empty → hasData false', r)
  assert(Array.isArray(r.groups) && r.groups.length === 0, 'empty → no groups')
  assert(r.summary.totalObservations === 0, 'empty → totalObservations 0')
  assert(r.summary.openGroups        === 0, 'empty → openGroups 0')
  assert(r.summary.recurringCount    === 0, 'empty → recurringCount 0')
  assert(r.windowDays === 90,           'empty → default windowDays 90')
}

// ── Invalid input → empty ───────────────────────────────────────────────────
{
  const r1 = computeTurfHealthIntel(null,      { now: NOW })
  const r2 = computeTurfHealthIntel(undefined, { now: NOW })
  const r3 = computeTurfHealthIntel('nope',    { now: NOW })
  assert(!r1.hasData && !r2.hasData && !r3.hasData, 'null/undefined/non-array → hasData false')
}

// ── Single observation → 1 group, count 1, recurring=0 ────────────────────
console.log('— single observation')
{
  const r = computeTurfHealthIntel([
    { id: 'a', location: 'Green 4', healthType: 'poor-airflow', severity: 'high', status: 'active', observedAt: dayIso(2) },
  ], { now: NOW })
  assert(r.hasData === true,                       'single → hasData true')
  assert(r.groups.length === 1,                    'single → 1 group')
  assert(r.groups[0].count === 1,                  'single → count 1')
  assert(r.summary.recurringCount === 0,           'single → recurringCount 0 (needs ≥3)')
  assert(r.groups[0].isOpen === true,              'single active → isOpen true')
  assert(r.groups[0].window30 === 1 && r.groups[0].window90 === 1,
                                                   'single → window counts match')
}

// ── Recurring + trend: worsening (severity escalates in second half) ───────
console.log('— recurring group: worsening trend')
{
  // 6 observations over 90d in Green 4 / poor-airflow.
  // First half (older): mostly low/moderate. Second half (recent): mostly high.
  // Default windowDays = 90, halfWindow = 45 days.
  const r = computeTurfHealthIntel([
    { id: '1', location: 'Green 4', healthType: 'poor-airflow', severity: 'low',      status: 'active', observedAt: dayIso(85) },
    { id: '2', location: 'Green 4', healthType: 'poor-airflow', severity: 'low',      status: 'active', observedAt: dayIso(70) },
    { id: '3', location: 'Green 4', healthType: 'poor-airflow', severity: 'moderate', status: 'active', observedAt: dayIso(50) },
    { id: '4', location: 'Green 4', healthType: 'poor-airflow', severity: 'high',     status: 'active', observedAt: dayIso(30) },
    { id: '5', location: 'Green 4', healthType: 'poor-airflow', severity: 'high',     status: 'active', observedAt: dayIso(10) },
    { id: '6', location: 'Green 4', healthType: 'poor-airflow', severity: 'high',     status: 'monitoring', observedAt: dayIso(2) },
  ], { now: NOW, windowDays: 90 })

  assert(r.groups.length === 1,                    'single group key')
  const g = r.groups[0]
  assert(g.count === 6,                            'count 6')
  // window cutoffs are inclusive at the boundary: an observation exactly N
  // days ago counts as "within the last N days".
  assert(g.window30 === 3,                         'window30 = 3 (day 30 + day 10 + day 2; boundary inclusive)', g.window30)
  assert(g.window60 === 4,                         'window60 = 4 (last 60d)', g.window60)
  assert(g.window90 === 6,                         'window90 = 6 (entire fixture in 90d)', g.window90)
  assert(g.severityTrend === 'worsening',          'severity got worse over the window halves', g.severityTrend)
  assert(g.isOpen === true,                        'isOpen true (monitoring counts as open)')
  assert(r.summary.recurringCount === 1,           'recurringCount 1 (count ≥ 3)')
  assert(r.summary.worseningGroups === 1,          'worsening groups = 1')
  assert(g.daysOpen >= 80 && g.daysOpen <= 90,     'daysOpen ≈ 85 (first → today)', g.daysOpen)
  assert(g.latestSeverity === 'high',              'latestSeverity = high')
  assert(g.latestStatus === 'monitoring',          'latestStatus = monitoring')
}

// ── Recurring + trend: improving (severity drops in second half) ──────────
console.log('— recurring group: improving trend')
{
  const r = computeTurfHealthIntel([
    { id: '1', location: 'Green 7', healthType: 'morning-shade', severity: 'high',     status: 'active',     observedAt: dayIso(80) },
    { id: '2', location: 'Green 7', healthType: 'morning-shade', severity: 'high',     status: 'active',     observedAt: dayIso(70) },
    { id: '3', location: 'Green 7', healthType: 'morning-shade', severity: 'moderate', status: 'monitoring', observedAt: dayIso(60) },
    { id: '4', location: 'Green 7', healthType: 'morning-shade', severity: 'low',      status: 'monitoring', observedAt: dayIso(20) },
    { id: '5', location: 'Green 7', healthType: 'morning-shade', severity: 'low',      status: 'monitoring', observedAt: dayIso(5) },
  ], { now: NOW, windowDays: 90 })
  const g = r.groups[0]
  assert(g.severityTrend === 'improving',          'trend improving', g.severityTrend)
}

// ── Insufficient data: fewer than 3 obs in the window ─────────────────────
console.log('— insufficient data')
{
  const r = computeTurfHealthIntel([
    { id: '1', location: 'Green 12', healthType: 'traffic-stress', severity: 'high', status: 'active', observedAt: dayIso(2) },
    { id: '2', location: 'Green 12', healthType: 'traffic-stress', severity: 'high', status: 'active', observedAt: dayIso(40) },
  ], { now: NOW })
  const g = r.groups[0]
  assert(g.severityTrend === 'insufficient data', 'two obs → insufficient data', g.severityTrend)
  assert(r.summary.recurringCount === 0,          'count=2 → not recurring (needs ≥3)')
}

// ── Follow-up due ──────────────────────────────────────────────────────────
console.log('— follow-up due')
{
  // followUpDate is in the past AND status is not resolved.
  const r = computeTurfHealthIntel([
    { id: '1', location: 'Green 3', healthType: 'wet-pocket', severity: 'moderate', status: 'monitoring', observedAt: dayIso(10), followUpDate: new Date(NOW - day(2)).toISOString() },
    { id: '2', location: 'Green 5', healthType: 'wet-pocket', severity: 'low',      status: 'resolved',   observedAt: dayIso(5),  followUpDate: new Date(NOW - day(1)).toISOString() },
  ], { now: NOW })
  assert(r.summary.followUpDueCount === 1,         'only the non-resolved one is due', r.summary.followUpDueCount)
  const g3 = r.groups.find(g => g.location === 'Green 3')
  assert(g3.followUpDue === true,                  'Green 3 group flagged followUpDue')
  const g5 = r.groups.find(g => g.location === 'Green 5')
  assert(g5.followUpDue === false,                 'resolved group is NOT due')
}

// ── isOpen / daysOpen for fully resolved group ────────────────────────────
console.log('— resolved group')
{
  const r = computeTurfHealthIntel([
    { id: '1', location: 'Green 9', healthType: 'algae-moss', severity: 'low', status: 'resolved', observedAt: dayIso(40) },
    { id: '2', location: 'Green 9', healthType: 'algae-moss', severity: 'low', status: 'resolved', observedAt: dayIso(10) },
  ], { now: NOW })
  const g = r.groups[0]
  assert(g.isOpen === false,                       'all resolved → isOpen false')
  // daysOpen for a closed group is first → latest, NOT first → today.
  assert(g.daysOpen === 30,                        'daysOpen = 30 (first 40d ago → latest 10d ago)', g.daysOpen)
  assert(r.summary.openGroups === 0,               'openGroups = 0')
}

// ── windowDays parameter validation ────────────────────────────────────────
console.log('— windowDays parameter')
{
  const r30  = computeTurfHealthIntel([], { now: NOW, windowDays: 30 })
  const r60  = computeTurfHealthIntel([], { now: NOW, windowDays: 60 })
  const r90  = computeTurfHealthIntel([], { now: NOW, windowDays: 90 })
  const rBad = computeTurfHealthIntel([], { now: NOW, windowDays: 7 })  // invalid → falls back to 90
  assert(r30.windowDays  === 30, 'windowDays 30 honored')
  assert(r60.windowDays  === 60, 'windowDays 60 honored')
  assert(r90.windowDays  === 90, 'windowDays 90 honored')
  assert(rBad.windowDays === 90, 'invalid windowDays falls back to 90')
}

// ── Ranking sanity ──────────────────────────────────────────────────────────
console.log('— ranking: open + severity + count + recency')
{
  // Three groups; expected order:
  //  1. Green 4 / poor-airflow  (open, high)
  //  2. Green 7 / morning-shade (open, moderate)
  //  3. Green 9 / algae-moss    (resolved, low)
  const r = computeTurfHealthIntel([
    // Green 7 — open, moderate
    { id: '7a', location: 'Green 7', healthType: 'morning-shade', severity: 'moderate', status: 'monitoring', observedAt: dayIso(5) },
    // Green 9 — all resolved, low
    { id: '9a', location: 'Green 9', healthType: 'algae-moss',    severity: 'low',      status: 'resolved',   observedAt: dayIso(20) },
    // Green 4 — open, high
    { id: '4a', location: 'Green 4', healthType: 'poor-airflow',  severity: 'high',     status: 'active',     observedAt: dayIso(3) },
  ], { now: NOW })

  assert(r.groups[0].location === 'Green 4',  'rank 1: open + high severity (Green 4)')
  assert(r.groups[1].location === 'Green 7',  'rank 2: open + moderate (Green 7)')
  assert(r.groups[2].location === 'Green 9',  'rank 3: resolved (Green 9)')
}

// ── Skip rows missing location or healthType ──────────────────────────────
console.log('— grouping skips malformed rows')
{
  const r = computeTurfHealthIntel([
    { id: 'a', location: '',         healthType: 'poor-airflow',  severity: 'high', status: 'active', observedAt: dayIso(2) },
    { id: 'b', location: 'Green 1',  healthType: null,            severity: 'low',  status: 'active', observedAt: dayIso(3) },
    { id: 'c', location: 'Green 2',  healthType: 'morning-shade', severity: 'low',  status: 'active', observedAt: dayIso(4) },
  ], { now: NOW })
  // Only the third row groups.
  assert(r.groups.length === 1,                    'malformed rows skipped → 1 valid group')
  assert(r.summary.totalObservations === 3,        'totalObservations still reflects raw input length')
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
