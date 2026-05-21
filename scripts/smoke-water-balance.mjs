// Irrigation Intelligence Foundation — water-balance calc smoke test.
//
//   node scripts/smoke-water-balance.mjs

import {
  computeWaterBalance,
  deficitSeverity,
  balanceSeries,
} from '../src/utils/irrigation/waterBalance.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// Newest-first daily rows (like the API returns).
const rows = [
  { date: '2026-05-21', etIn: 0.49, etSource: 'estimated', rainfallIn: 0,    netIn: -0.49 },
  { date: '2026-05-20', etIn: 0.41, etSource: 'estimated', rainfallIn: 0.20, netIn: -0.21 },
  { date: '2026-05-19', etIn: 0.63, etSource: 'estimated', rainfallIn: 0,    netIn: -0.63 },
  { date: '2026-05-18', etIn: 0.30, etSource: 'estimated', rainfallIn: 1.10, netIn:  0.80 },
  { date: '2026-05-17', etIn: 0.35, etSource: 'estimated', rainfallIn: 0,    netIn: -0.35 },
]

// Empty input degrades honestly.
{
  const r = computeWaterBalance([])
  assert(r.hasData === false && r.trend === 'unknown', 'empty → hasData false, trend unknown')
  assert(computeWaterBalance(null).hasData === false, 'null → hasData false')
}

// Today + rolling sums.
{
  const r = computeWaterBalance(rows)
  assert(r.today.date === '2026-05-21', 'today is newest row')
  // 3-day = -0.49 + -0.21 + -0.63 = -1.33
  assert(r.rolling.d3.balanceIn === -1.33, '3-day balance = -1.33', r.rolling.d3)
  assert(r.rolling.d3.deficitIn === 1.33, '3-day deficit = 1.33', r.rolling.d3)
  // 7-day window only has 5 rows: sum = -1.33 + 0.80 + -0.35 = -0.88
  assert(r.rolling.d7.balanceIn === -0.88, '7-day balance = -0.88 (5 rows)', r.rolling.d7)
  assert(r.rolling.d7.daysCounted === 5, '7-day counted = 5 available days', r.rolling.d7)
  assert(r.trend === 'drying', '3-day net negative → drying', { b3: r.rolling.d3.balanceIn })
}

// Wetting + steady trends.
{
  const wet = computeWaterBalance([{ date: '2026-05-21', netIn: 0.5 }, { date: '2026-05-20', netIn: 0.3 }, { date: '2026-05-19', netIn: 0.1 }])
  assert(wet.trend === 'wetting', 'positive 3-day → wetting', { b3: wet.rolling.d3.balanceIn })
  const steady = computeWaterBalance([{ date: '2026-05-21', netIn: 0.02 }, { date: '2026-05-20', netIn: -0.01 }])
  assert(steady.trend === 'steady', 'near-zero 3-day → steady', { b3: steady.rolling.d3.balanceIn })
}

// Partial data (missing netIn rows skipped + flagged).
{
  const r = computeWaterBalance([{ date: '2026-05-21', netIn: -0.5 }, { date: '2026-05-20', netIn: null }, { date: '2026-05-19', netIn: -0.3 }])
  assert(r.rolling.d3.daysCounted === 2, 'partial: counts only rows with netIn', r.rolling.d3)
  assert(r.rolling.d3.partial === true, 'partial flag set when a day lacks net', r.rolling.d3)
  assert(r.rolling.d3.balanceIn === -0.8, 'partial sum skips null (-0.5 + -0.3)', r.rolling.d3)
}

// Deficit severity ladder.
assert(deficitSeverity(0) === 'good', 'no deficit → good')
assert(deficitSeverity(0.3) === 'info', '0.3 → info')
assert(deficitSeverity(0.7) === 'caution', '0.7 → caution')
assert(deficitSeverity(1.3) === 'warning', '1.3 → warning')
assert(deficitSeverity(2.0) === 'critical', '2.0 → critical')

// Chart series (oldest → newest, metric extracted).
{
  const s = balanceSeries(rows, 'rainfallIn', 3)
  assert(s.length === 3 && s[0].date === '2026-05-19' && s[2].date === '2026-05-21',
    'series reverses to oldest→newest, last 3 days', s)
  assert(s[0].value === 0 && s[s.length - 1].value === 0, 'series extracts the metric values', s)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
