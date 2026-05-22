// Plant Nutrition — totals + derive/merge calc smoke test.
//
//   node scripts/smoke-nutrition-totals.mjs

import {
  computeNpkLbs,
  rateToLbPerAcre,
  deriveSprayNutrition,
  computeNutritionTotals,
} from '../src/utils/nutrition/nutritionTotals.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── Unit conversions ──────────────────────────────────────────────────────
assert(rateToLbPerAcre(2, 'lb/acre') === 2, 'lb/acre passthrough')
assert(Math.abs(rateToLbPerAcre(1, 'lb/1000sqft') - 43.56) < 0.001, 'lb/1000sqft → 43.56 lb/acre')
assert(rateToLbPerAcre(16, 'oz/acre') === 1, 'oz/acre → lb/acre')
assert(rateToLbPerAcre(2, 'bogus') === null, 'unknown unit → null')

// ── Single-application N-P-K math (explainable) ────────────────────────────
{
  // 1 lb/acre of 18-3-18 over 10 acres = 10 lb product → N 1.8, P 0.3, K 1.8
  const r = computeNpkLbs({ analysis: '18-3-18', rate: 1, unit: 'lb/acre', acres: 10, productName: 'A' })
  assert(r.nLb === 1.8 && r.pLb === 0.3 && r.kLb === 1.8, '18-3-18 @1lb/ac×10ac → N1.8/P0.3/K1.8', r)
  assert(typeof r.why === 'string' && r.why.includes('18-3-18'), 'line carries explainable why', r)
}
assert(computeNpkLbs({ analysis: null, rate: 1, unit: 'lb/acre', acres: 5, productName: 'X' }).unknown, 'no analysis → unknown')
assert(computeNpkLbs({ analysis: '18-3-18', rate: 1, unit: 'lb/acre', acres: 0, productName: 'X' }).unknown, 'no acreage → unknown')
assert(computeNpkLbs({ analysis: '18-3-18', rate: 1, unit: 'gal/min', acres: 5, productName: 'X' }).unknown, 'bad unit → unknown')

// ── Derive from fertilizer sprays (only fertilizer kind contributes) ───────
{
  const sprays = [{
    id: 's1', status: 'completed', date: '2026-05-10',
    areas: [{ name: 'Greens', acreage: 10 }],
    products: [
      { id: 'p1', name: 'Anderson 18-3-18', rate: 1, unit: 'lb/acre', inventoryItemId: 'fert1' },
      { id: 'p2', name: 'Daconil', rate: 2, unit: 'oz/acre', inventoryItemId: 'chem1' },  // not fertilizer
    ],
  }]
  const inv = { fert1: { kind: 'fertilizer', analysis: '18-3-18' }, chem1: { kind: 'chemical', analysis: null } }
  const lines = deriveSprayNutrition(sprays, inv)
  assert(lines.length === 1, 'only fertilizer product derives a line (chemical skipped)', lines.map(l => l.productName))
  assert(lines[0].source === 'spray' && lines[0].sourceSprayId === 's1', 'derived line tagged source spray + link', lines[0])
  assert(lines[0].nLb === 1.8, 'derived N matches single-app math', lines[0])
}

// ── Merge totals + dedup (standalone promoted from a spray suppresses derived) ──
{
  const sprays = [{
    id: 's1', status: 'completed', date: '2026-05-10',
    areas: [{ name: 'Greens', acreage: 10 }],
    products: [{ id: 'p1', name: 'Anderson 18-3-18', rate: 1, unit: 'lb/acre', inventoryItemId: 'fert1' }],
  }]
  const inv = { fert1: { kind: 'fertilizer', analysis: '18-3-18' } }

  // No standalone → derived counts once.
  let r = computeNutritionTotals({ standalone: [], sprays, inventoryById: inv })
  assert(r.totals.n === 1.8 && r.applications.length === 1, 'derived-only: N 1.8, 1 application', r.totals)

  // Standalone promoted from s1 → derived line suppressed (no double count).
  const standalone = [{ id: 'n1', applicationDate: '2026-05-10', area: 'Greens', productName: 'Anderson 18-3-18', source: 'spray', sourceSprayId: 's1', nLb: 1.8, pLb: 0.3, kLb: 1.8 }]
  r = computeNutritionTotals({ standalone, sprays, inventoryById: inv })
  assert(r.applications.length === 1 && r.totals.n === 1.8, 'dedup: promoted standalone suppresses derived (no double count)', { len: r.applications.length, n: r.totals.n })

  // A separate manual entry adds on top.
  const both = [...standalone, { id: 'n2', applicationDate: '2026-05-12', area: 'Fairways', productName: 'Urea 46-0-0', source: 'manual', nLb: 4.6, pLb: 0, kLb: 0 }]
  r = computeNutritionTotals({ standalone: both, sprays, inventoryById: inv })
  assert(r.totals.n === parseFloat((1.8 + 4.6).toFixed(1)), 'manual entry adds to total N', r.totals)
  assert(r.byArea.Greens.n === 1.8 && r.byArea.Fairways.n === 4.6, 'byArea split correct', r.byArea)
  assert(r.byMonth['2026-05'].n === 6.4, 'byMonth aggregates', r.byMonth)
  assert(r.bySource.spray.n === 1.8 && r.bySource.manual.n === 4.6, 'bySource split correct', r.bySource)
}

// ── Date range + empty + unknowns ──────────────────────────────────────────
{
  const standalone = [
    { id: 'a', applicationDate: '2026-05-12', productName: 'P', nLb: 5, pLb: 0, kLb: 0, source: 'manual' },
    { id: 'b', applicationDate: '2026-03-01', productName: 'Q', nLb: 9, pLb: 0, kLb: 0, source: 'manual' },
  ]
  const r = computeNutritionTotals({ standalone, from: '2026-05-01', to: '2026-05-31' })
  assert(r.applications.length === 1 && r.totals.n === 5, 'date range filters out-of-window apps', r.totals)
  assert(computeNutritionTotals({}).hasData === false, 'no data → hasData false')

  const sprays = [{ id: 's2', status: 'completed', date: '2026-05-10', areas: [], products: [{ id: 'p', name: 'NoAcres', rate: 1, unit: 'lb/acre', inventoryItemId: 'f' }] }]
  const r2 = computeNutritionTotals({ sprays, inventoryById: { f: { kind: 'fertilizer', analysis: '18-3-18' } } })
  assert(r2.unknowns.length === 1 && r2.applications.length === 0, 'missing acreage → unknown, not counted', r2.unknowns)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
