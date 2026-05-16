// Phase 23B — Program Intelligence filters smoke test.
//
// Verifies date / surface / pressure / chemistry-type filtering and the
// active-filter description. Run with:
//
//   node scripts/smoke-program-filters.mjs
//
// Exits 0 on success, 1 on first failed assertion. Not bundled.

import {
  resolveDateRange,
  filterRecordsByDateRange,
  filterRecordsBySurface,
  filterRecordsByPressure,
  filterProgramSummary,
  describeActiveFilters,
  buildProgramSummary,
} from '../src/utils/programIntelligence/index.js'

let passed = 0
let failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`) }
  else {
    failed += 1
    console.error(`  ✗ ${label}`)
    if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx, null, 2))
  }
}
function section(name) { console.log(`\n— ${name} —`) }

// ── Fixture: mixed surfaces, mixed risk levels, spread across the year ──

const labelsByItemId = {
  'inv-heritage': { fracGroup: '11', activeIngredients: 'Azoxystrobin 22.9%' }, // high
  'inv-daconil':  { fracGroup: 'M5', activeIngredients: 'Chlorothalonil 54%' }, // low
  'inv-banner':   { fracGroup: '3',  activeIngredients: 'Propiconazole 41.8%' }, // medium
  'inv-emerald':  { fracGroup: '7',  activeIngredients: 'Boscalid 70%' },        // high
}

// Hand-crafted dates so we can validate range cuts deterministically.
const records = [
  { id: 'r1', date: '2026-01-10', area: 'Greens',     products: [{ inventoryItemId: 'inv-heritage' }] }, // pre-season
  { id: 'r2', date: '2026-03-15', area: 'Greens',     products: [{ inventoryItemId: 'inv-banner'  }] },
  { id: 'r3', date: '2026-04-05', area: 'Greens',     products: [{ inventoryItemId: 'inv-heritage' }] }, // in season
  { id: 'r4', date: '2026-04-20', area: 'Fairway #1', products: [{ inventoryItemId: 'inv-daconil' }] },
  { id: 'r5', date: '2026-05-01', area: 'Tee #4',     products: [{ inventoryItemId: 'inv-emerald' }] },
  { id: 'r6', date: '2026-05-10', area: 'Cart path',  products: [{ inventoryItemId: 'inv-heritage' }] }, // unspecified surface
  { id: 'r7', date: '2026-05-14', area: 'Greens',     products: [] }, // no label - won't classify as high-pressure
]

const REF = '2026-05-16'

// ── 1. Date preset resolution ───────────────────────────────────────────
section('Date preset resolution')

const last30 = resolveDateRange('last30', { referenceDate: REF })
assert(last30.end === '2026-05-16', 'last30 end = reference date')
assert(last30.start === '2026-04-16', `last30 start = 2026-04-16 (got ${last30.start})`)

const last60 = resolveDateRange('last60', { referenceDate: REF })
assert(last60.start === '2026-03-17', `last60 start = 2026-03-17 (got ${last60.start})`)

const last90 = resolveDateRange('last90', { referenceDate: REF })
assert(last90.start === '2026-02-15', `last90 start = 2026-02-15 (got ${last90.start})`)

const ytd = resolveDateRange('ytd', { referenceDate: REF })
assert(ytd.start === '2026-01-01' && ytd.end === '2026-05-16', 'ytd Jan 1 → ref')

const cs = resolveDateRange('currentSeason', { referenceDate: REF })
assert(cs.start === '2026-04-01' && cs.end === '2026-10-31', 'current season = Apr 1 → Oct 31')

assert(resolveDateRange('all') === null, 'all → null (skip filtering)')

const custom = resolveDateRange('custom', { customStart: '2026-04-01', customEnd: '2026-04-30' })
assert(custom.start === '2026-04-01' && custom.end === '2026-04-30', 'custom uses provided bounds')

// ── 2. Date filtering ──────────────────────────────────────────────────
section('Date filtering')

const last30Recs = filterRecordsByDateRange(records, 'last30', { referenceDate: REF })
// last30 window is Apr 16 → May 16. r3 (Apr 5) is outside, r4..r7 are inside.
assert(last30Recs.length === 4, `last30 keeps 4 records (r4..r7) — got ${last30Recs.length}`)
assert(!last30Recs.find(r => r.id === 'r1'), 'last30 drops Jan record')
assert(!last30Recs.find(r => r.id === 'r2'), 'last30 drops mid-March record')
assert(!last30Recs.find(r => r.id === 'r3'), 'last30 drops Apr 5 record (outside window)')

const csRecs = filterRecordsByDateRange(records, 'currentSeason', { referenceDate: REF })
assert(csRecs.length === 5, `currentSeason keeps Apr-Oct subset (got ${csRecs.length})`)
assert(!csRecs.find(r => r.id === 'r1'), 'season drops Jan')
assert(!csRecs.find(r => r.id === 'r2'), 'season drops March')

const ytdRecs = filterRecordsByDateRange(records, 'ytd', { referenceDate: REF })
assert(ytdRecs.length === 7, 'ytd keeps everything (all dates in 2026)')

const allRecs = filterRecordsByDateRange(records, 'all', { referenceDate: REF })
assert(allRecs.length === 7, 'all → pass-through')

const customRecs = filterRecordsByDateRange(records, 'custom', {
  referenceDate: REF, customStart: '2026-05-01', customEnd: '2026-05-31',
})
assert(customRecs.length === 3, `custom May 1-31 keeps 3 records (got ${customRecs.length})`)

// ── 3. Surface filtering ───────────────────────────────────────────────
section('Surface filtering')

const greens = filterRecordsBySurface(records, 'greens')
assert(greens.length === 4, `greens = 4 records (got ${greens.length})`)
assert(greens.every(r => /green/i.test(r.area)), 'all results are greens-flagged')

const fairways = filterRecordsBySurface(records, 'fairways')
assert(fairways.length === 1, '1 fairway record')

const tees = filterRecordsBySurface(records, 'tees')
assert(tees.length === 1, '1 tee record')

const unspecified = filterRecordsBySurface(records, 'unspecified')
assert(unspecified.length === 1 && unspecified[0].id === 'r6', 'unspecified catches cart-path record')

const allSurfaces = filterRecordsBySurface(records, 'all')
assert(allSurfaces.length === 7, 'all surfaces → pass-through')

// ── 4. Pressure filtering ──────────────────────────────────────────────
section('Pressure filtering')

const allP = filterRecordsByPressure(records, labelsByItemId, 'all')
assert(allP.length === 7, "'all' pressure → pass-through")

const highOnly = filterRecordsByPressure(records, labelsByItemId, 'high-only')
// High-risk FRAC: 11, 7. Records using those: r1 (11), r3 (11), r5 (7), r6 (11). r7 has no product.
assert(highOnly.length === 4, `high-only = 4 records (got ${highOnly.length})`)
assert(!highOnly.find(r => r.id === 'r2'), 'high-only drops FRAC 3 (medium)')
assert(!highOnly.find(r => r.id === 'r4'), 'high-only drops FRAC M5 (low)')
assert(!highOnly.find(r => r.id === 'r7'), 'high-only drops product-less record')

// ── 5. Chemistry-type view filter on summary ───────────────────────────
section('Chemistry-type view filter')

const baseSummary = buildProgramSummary(records, labelsByItemId)
const fracOnly = filterProgramSummary(baseSummary, { chemistryType: 'FRAC' })
assert(fracOnly.fracUsage.length > 0, 'FRAC-only retains fracUsage')
assert(fracOnly.hracUsage.length === 0, 'FRAC-only blanks hracUsage')
assert(fracOnly.iracUsage.length === 0, 'FRAC-only blanks iracUsage')
assert(fracOnly.diversity.score === baseSummary.diversity.score, 'FRAC-only preserves diversity')

const hracOnly = filterProgramSummary(baseSummary, { chemistryType: 'HRAC' })
assert(hracOnly.fracUsage.length === 0, 'HRAC-only blanks fracUsage')
assert(hracOnly.diversity.score === null, 'HRAC-only nulls FRAC diversity')
assert(hracOnly.highPressure.length === 0, 'HRAC-only blanks highPressure')
assert(hracOnly.drift.length === 0, 'HRAC-only blanks FRAC-keyed drift')
assert(hracOnly.longestFracStreaks.length === 0, 'HRAC-only blanks longestFracStreaks')

const passThrough = filterProgramSummary(baseSummary, { chemistryType: 'all' })
assert(passThrough === baseSummary, "'all' returns the same object reference")

// ── 6. Empty filtered summary ──────────────────────────────────────────
section('Empty filtered summary')

const emptyFiltered = filterRecordsByDateRange(records, 'custom', {
  referenceDate: REF, customStart: '2025-01-01', customEnd: '2025-12-31',
})
assert(emptyFiltered.length === 0, 'date range with no overlap → 0 records')
const emptySummary = buildProgramSummary(emptyFiltered, labelsByItemId)
assert(emptySummary.totalApplications === 0, 'empty summary: 0 apps')
assert(emptySummary.fracUsage.length === 0, 'empty summary: no FRAC usage')
assert(emptySummary.diversity.score === null, 'empty summary: null diversity')

// Filter for high-only on a slice with no high-risk apps.
const lowOnly = filterRecordsByDateRange(
  records.filter(r => ['r2', 'r4'].includes(r.id)),
  'all',
  { referenceDate: REF },
)
const noPressure = filterRecordsByPressure(lowOnly, labelsByItemId, 'high-only')
assert(noPressure.length === 0, 'high-only on low/medium slice → 0 records')

// ── 7. Pipeline composition ────────────────────────────────────────────
section('Pipeline composition (date → surface → pressure)')

const piped =
  filterRecordsByPressure(
    filterRecordsBySurface(
      filterRecordsByDateRange(records, 'currentSeason', { referenceDate: REF }),
      'greens',
    ),
    labelsByItemId,
    'high-only',
  )
// Greens in current season: r3 (heritage/11 high), r7 (no label).
// high-only drops r7. Expect just r3.
assert(piped.length === 1 && piped[0].id === 'r3', `piped result is just r3 (got ${piped.map(r=>r.id).join(',')})`)

// ── 8. Active filter description ───────────────────────────────────────
section('Active filter description')

// All-explicit "all"s should produce no chip.
const d1 = describeActiveFilters({ dateRange: 'all', surface: 'all', chemistryType: 'all', pressure: 'all' })
assert(d1 === null, 'all-non-default values → null (no chip)')

const d2 = describeActiveFilters({ dateRange: 'currentSeason', surface: 'all', chemistryType: 'all', pressure: 'all' })
assert(d2 === 'Showing Current season', `currentSeason only → "Showing Current season" (got "${d2}")`)

const d3 = describeActiveFilters({ dateRange: 'last60', surface: 'greens', chemistryType: 'FRAC', pressure: 'all' })
assert(d3 === 'Showing Greens · Last 60 days · FRAC only',
  `combined chip (got "${d3}")`)

const d4 = describeActiveFilters({ dateRange: 'custom', customStart: '2026-04-01', customEnd: '2026-04-30', surface: 'all', chemistryType: 'all', pressure: 'high-only' })
assert(d4 === 'Showing 2026-04-01 → 2026-04-30 · High-pressure only',
  `custom range + pressure (got "${d4}")`)

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
