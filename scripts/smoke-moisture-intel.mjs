// Moisture + Handwatering Intelligence — calc smoke test.
//
//   node scripts/smoke-moisture-intel.mjs

import { computeMoistureIntel, syringeAwareness } from '../src/utils/moisture/moistureIntel.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const now = Date.now()
const iso = hoursAgo => new Date(now - hoursAgo * 3_600_000).toISOString()

const driftDeficit = { trend: 'drying', rolling: { d7: { balanceIn: -0.9 } } }
const surplus      = { trend: 'wetting', rolling: { d7: { balanceIn: 0.6 } } }
const neutral      = { trend: 'steady',  rolling: { d7: { balanceIn: -0.1 } } }

// Empty → honest.
{
  const r = computeMoistureIntel([])
  assert(r.hasData === false && r.trend === 'unknown', 'empty → hasData false, trend unknown')
  assert(computeMoistureIntel(null).hasData === false, 'null → hasData false')
}

// Handwater flag → High Priority.
{
  const r = computeMoistureIntel([
    { id: '1', location: 'Green 7', hole: 7, observedAt: iso(1), handwaterRec: true },
  ], neutral)
  const g7 = r.byLocation.find(l => l.location === 'Green 7')
  assert(g7.priority === 'High Priority', 'handwater flag → High Priority', g7)
  assert(/handwater/.test(g7.why), 'why explains handwater', g7)
}

// Wilt + drying deficit → High Priority.
{
  const r = computeMoistureIntel([
    { id: '2', location: 'Green 3', observedAt: iso(2), wiltStress: true },
  ], driftDeficit)
  const g = r.byLocation[0]
  assert(g.priority === 'High Priority', 'wilt + deficit → High Priority', g)
  assert(r.trend === 'localized stress increasing', 'any High → localized stress increasing', { trend: r.trend })
}

// Recent flag but wetting → Recovering.
{
  const r = computeMoistureIntel([
    { id: '3', location: 'Green 1', observedAt: iso(2), drySpot: true },
  ], surplus)
  assert(r.byLocation[0].priority === 'Recovering', 'flag + wetting → Recovering', r.byLocation[0])
}

// No flags, no deficit → Stable.
{
  const r = computeMoistureIntel([
    { id: '4', location: 'Green 9', observedAt: iso(1), moisturePct: 22 },
  ], neutral)
  assert(r.byLocation[0].priority === 'Stable', 'clean + no deficit → Stable', r.byLocation[0])
  assert(r.trend === 'stable moisture', 'no High, steady weather → stable moisture', { trend: r.trend })
}

// Stale wilt read is downgraded from High to Monitor (don't act on old data).
{
  const r = computeMoistureIntel([
    { id: '5', location: 'Green 5', observedAt: iso(80), wiltStress: true },
  ], driftDeficit)
  const g = r.byLocation[0]
  assert(g.priority === 'Monitor' && g.stale === true, 'stale High downgraded to Monitor', g)
  assert(/>24h ago/.test(g.why), 'why flags staleness', g)
}

// Driest sorting + dedup-by-location (newest per location wins).
{
  const r = computeMoistureIntel([
    { id: '6a', location: 'Green 2', observedAt: iso(1), moisturePct: 8  },
    { id: '6b', location: 'Green 2', observedAt: iso(5), moisturePct: 30 }, // older, ignored as latest
    { id: '7',  location: 'Green 4', observedAt: iso(1), moisturePct: 18 },
  ], neutral)
  const g2 = r.byLocation.find(l => l.location === 'Green 2')
  assert(g2.moisturePct === 8, 'newest observation per location used (8, not 30)', g2)
  assert(r.driest[0].location === 'Green 2', 'driest sorted lowest-moisture first', r.driest.map(d => [d.location, d.moisturePct]))
}

// Syringe awareness — weather-derived, honest "potential".
{
  const notes = syringeAwareness({ currentTemp: 92, humidity: 30, wind: 14 }, driftDeficit)
  const keys = notes.map(n => n.key)
  assert(keys.includes('heat') && keys.includes('wind') && keys.includes('rh') && keys.includes('deficit'),
    'syringe awareness fires heat/wind/rh/deficit', keys)
  assert(syringeAwareness(null).length === 0, 'no current → no syringe notes')
  assert(syringeAwareness({ currentTemp: 70, humidity: 60, wind: 4 }).length === 0, 'mild conditions → no notes')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
