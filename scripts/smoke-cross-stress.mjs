// Phase 7B.2 — computeStressCorrelation smoke.
//
//   node scripts/smoke-cross-stress.mjs
//
// Pure-function smoke over fixtures with a frozen `now`. Only asserts the
// correlation contract — single-source noise is excluded, overlap rows
// are ranked by combined score, window honors 30/60/90.

import { computeStressCorrelation, __TEST } from '../src/utils/turfHealth/crossStressCorrelation.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const NOW = Date.parse('2026-05-25T12:00:00Z')
const day = ms => 86_400_000 * ms
const iso = msAgo => new Date(NOW - msAgo).toISOString()
function dayIso(daysAgo) { return iso(day(daysAgo)) }

// ── Empty inputs → honest empty ────────────────────────────────────────────
console.log('— empty inputs')
{
  const r = computeStressCorrelation({}, { now: NOW })
  assert(r.hasData === false,                    'empty → hasData false')
  assert(r.locations.length === 0,               'empty → no locations')
  assert(r.summary.totalLocations === 0,         'empty → totalLocations 0')
  assert(r.windowDays === 30,                    'empty → default windowDays 30')
}

// ── Only moisture → no correlation ─────────────────────────────────────────
console.log('— only moisture (no overlap)')
{
  const r = computeStressCorrelation({
    moistureObservations: [
      { id: '1', location: 'Green 4', observedAt: dayIso(2), wiltStress: true,    handwaterRec: false, drySpot: false, syringeRec: false },
      { id: '2', location: 'Green 4', observedAt: dayIso(5), handwaterRec: true,  wiltStress: false,   drySpot: false, syringeRec: false },
    ],
    turfHealthObservations: [],
  }, { now: NOW })
  assert(r.hasData === false,                    'moisture-only → no overlap → hasData false')
  assert(r.locations.length === 0,               'moisture-only → empty locations')
}

// ── Only turf-health → no correlation ──────────────────────────────────────
console.log('— only turf-health (no overlap)')
{
  const r = computeStressCorrelation({
    moistureObservations: [],
    turfHealthObservations: [
      { id: 'a', location: 'Green 4', observedAt: dayIso(3), healthType: 'poor-airflow' },
    ],
  }, { now: NOW })
  assert(r.hasData === false,                    'turf-health-only → no overlap → hasData false')
}

// ── True overlap on Green 4 ────────────────────────────────────────────────
console.log('— overlap on a single location')
{
  const r = computeStressCorrelation({
    moistureObservations: [
      { id: 'm1', location: 'Green 4', observedAt: dayIso(2),  wiltStress: true   },
      { id: 'm2', location: 'Green 4', observedAt: dayIso(5),  handwaterRec: true },
      { id: 'm3', location: 'Green 4', observedAt: dayIso(8),  drySpot: true      },
      // Not stress (no flags, normal moisture) — must be excluded.
      { id: 'm4', location: 'Green 4', observedAt: dayIso(10), moisturePct: 25 },
      // Outside the 30-day window — must be excluded.
      { id: 'm5', location: 'Green 4', observedAt: dayIso(60), wiltStress: true },
    ],
    turfHealthObservations: [
      { id: 't1', location: 'Green 4', observedAt: dayIso(4), healthType: 'poor-airflow' },
      { id: 't2', location: 'Green 4', observedAt: dayIso(7), healthType: 'chronic-wilt' },
    ],
  }, { now: NOW })

  assert(r.hasData === true,                       'overlap → hasData true')
  assert(r.locations.length === 1,                 'one overlapping location')
  const g4 = r.locations[0]
  assert(g4.location === 'Green 4',                'Green 4 is the overlap')
  assert(g4.moistureCount === 3,                   'moisture: 3 stress observations (4th non-stress + 5th out-of-window excluded)', g4.moistureCount)
  assert(g4.turfHealthCount === 2,                 'turfHealth: 2 observations in window')
  assert(g4.turfHealthTypes.length === 2,          'distinct turf-health types preserved')
  assert(g4.turfHealthTypes.includes('poor-airflow') && g4.turfHealthTypes.includes('chronic-wilt'),
                                                   'both types listed')
  // score = 3 + 2*2 = 7
  assert(g4.score === 7,                           'score = moistureCount + 2*turfHealthCount', g4.score)
  // Latest across both streams: t1 at 4 days ago > m1 at 2 days ago? NO —
  // m1 at 2d is more recent. The string compare on ISO works.
  assert(g4.latestEither === dayIso(2),            'latestEither = most recent observedAt across both streams', g4.latestEither)
  // Moisture flag breakdown.
  assert(g4.moistureFlags.wilt      === 1, 'wilt count')
  assert(g4.moistureFlags.handwater === 1, 'handwater count')
  assert(g4.moistureFlags.dry       === 1, 'dry-spot count')
}

// ── Low moisturePct without flags counts as stress ─────────────────────────
console.log('— low moisturePct counts as stress')
{
  const r = computeStressCorrelation({
    moistureObservations: [
      // moisturePct 10 ≤ threshold 12 → counts as lowReading stress
      { id: 'm1', location: 'Green 8', observedAt: dayIso(3), moisturePct: 10 },
    ],
    turfHealthObservations: [
      { id: 't1', location: 'Green 8', observedAt: dayIso(5), healthType: 'slow-recovery' },
    ],
  }, { now: NOW })
  assert(r.locations.length === 1,                 'low reading + turfHealth → overlap')
  const g8 = r.locations[0]
  assert(g8.moistureFlags.lowReading === 1,        'lowReading flag tallied', g8.moistureFlags)
  assert(g8.moistureCount === 1,                   'moistureCount counts the low-reading row')
  // moisturePct > threshold should NOT count — verify the threshold edge.
  assert(__TEST.MOISTURE_LOW_THRESHOLD === 12,     'threshold exposed for the test seam')
  assert(__TEST.moistureIsStress({ moisturePct: 13 }) === false,
                                                   'moisturePct 13 (> threshold) is NOT stress')
  assert(__TEST.moistureIsStress({ moisturePct: 12 }) === true,
                                                   'moisturePct 12 (= threshold) IS stress')
}

// ── Ranking: higher score sorts first ──────────────────────────────────────
console.log('— ranking by score')
{
  const r = computeStressCorrelation({
    moistureObservations: [
      // Green 4 — heavy combined activity (score 8 = 4 + 2*2)
      { id: 'm1', location: 'Green 4', observedAt: dayIso(1), wiltStress: true },
      { id: 'm2', location: 'Green 4', observedAt: dayIso(2), wiltStress: true },
      { id: 'm3', location: 'Green 4', observedAt: dayIso(3), wiltStress: true },
      { id: 'm4', location: 'Green 4', observedAt: dayIso(4), wiltStress: true },
      // Green 7 — lighter combined activity (score 3 = 1 + 2*1)
      { id: 'm5', location: 'Green 7', observedAt: dayIso(5), handwaterRec: true },
    ],
    turfHealthObservations: [
      { id: 't1', location: 'Green 4', observedAt: dayIso(2), healthType: 'poor-airflow' },
      { id: 't2', location: 'Green 4', observedAt: dayIso(4), healthType: 'chronic-wilt' },
      { id: 't3', location: 'Green 7', observedAt: dayIso(6), healthType: 'morning-shade' },
    ],
  }, { now: NOW })
  assert(r.locations.length === 2,                 'both overlap')
  assert(r.locations[0].location === 'Green 4',    'Green 4 first (score 8)', r.locations.map(l => `${l.location}:${l.score}`))
  assert(r.locations[1].location === 'Green 7',    'Green 7 second (score 3)')
  assert(r.summary.totalLocations === 2,           'totalLocations 2')
  assert(r.summary.totalScore === 11,              'totalScore 8 + 3 = 11', r.summary.totalScore)
}

// ── windowDays parameter ───────────────────────────────────────────────────
console.log('— windowDays parameter')
{
  // Same data; widen the window from 30 → 60 → 90 to see additional rows.
  const fixture = {
    moistureObservations: [
      { id: 'm1', location: 'Green 4', observedAt: dayIso(5),  wiltStress: true },
      { id: 'm2', location: 'Green 4', observedAt: dayIso(45), wiltStress: true },
      { id: 'm3', location: 'Green 4', observedAt: dayIso(75), wiltStress: true },
    ],
    turfHealthObservations: [
      { id: 't1', location: 'Green 4', observedAt: dayIso(2),  healthType: 'poor-airflow' },
      { id: 't2', location: 'Green 4', observedAt: dayIso(50), healthType: 'poor-airflow' },
    ],
  }
  const r30 = computeStressCorrelation(fixture, { now: NOW, windowDays: 30 })
  const r60 = computeStressCorrelation(fixture, { now: NOW, windowDays: 60 })
  const r90 = computeStressCorrelation(fixture, { now: NOW, windowDays: 90 })
  assert(r30.locations[0].moistureCount === 1, 'window=30 → 1 moisture (day 5)')
  assert(r30.locations[0].turfHealthCount === 1, 'window=30 → 1 turf-health (day 2)')
  assert(r60.locations[0].moistureCount === 2, 'window=60 → 2 moisture (days 5, 45)')
  assert(r60.locations[0].turfHealthCount === 2, 'window=60 → 2 turf-health (days 2, 50)')
  assert(r90.locations[0].moistureCount === 3, 'window=90 → all 3 moisture')
  // Invalid windowDays falls back to 30.
  const rBad = computeStressCorrelation(fixture, { now: NOW, windowDays: 7 })
  assert(rBad.windowDays === 30,                   'invalid windowDays falls back to 30')
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
