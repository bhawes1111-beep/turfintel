// Phase 22A — Chemistry Intelligence smoke test.
//
// Verifies the four pure layers (metadata / structures / history / warnings)
// against representative fixtures. Run with:
//
//   node scripts/smoke-chemistry-intelligence.mjs
//
// Exits with code 0 on success, 1 on first failed assertion.
// NOT part of the build — just a one-shot CLI sanity check.

import {
  lookupGroup,
  parseGroupCodes,
  parseActiveIngredients,
  normalizeActiveName,
  findDuplicateActives,
  findDuplicateActiveFamilies,
  aggregateTankCodes,
  filterByLookback,
  filterByArea,
  countApplicationsByGroup,
  detectRepeatedMOA,
  detectRepeatedFamily,
  daysSinceLastUse,
  indexRecordsById,
  analyzeSprayDraft,
  highestSeverity,
  SEVERITY,
  // Phase 22C
  AI_FAMILIES,
  lookupActiveFamily,
  familyCodeOf,
  AREA_FAMILIES,
  areaFamilyOf,
  areaSurfaceTypeOf,
  areasMatch,
  buildMOATimeline,
  formatSequence,
  buildMixSequence,
} from '../src/utils/chemistry/index.js'

let passed = 0
let failed = 0

function assert(cond, label, ctx) {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    console.error(`  ✗ ${label}`)
    if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx, null, 2))
  }
}

function section(name) {
  console.log(`\n— ${name} —`)
}

// ── 1. Metadata lookup ───────────────────────────────────────────────────
section('Metadata lookup')

const frac11 = lookupGroup('FRAC', '11')
assert(frac11.recognized === true, 'FRAC 11 is recognized')
assert(frac11.riskLevel === 'high', 'FRAC 11 is high-risk', frac11)
assert(frac11.name?.includes('QoI'), 'FRAC 11 names QoI strobilurins')

const fracM5 = lookupGroup('FRAC', 'M5')
assert(fracM5.recognized === true, 'FRAC M5 is recognized')
assert(fracM5.riskLevel === 'low', 'FRAC M5 is low-risk')

const unk = lookupGroup('FRAC', '999')
assert(unk.recognized === false, 'Unknown FRAC code returns recognized=false')
assert(unk.riskLevel === 'unknown', 'Unknown FRAC code returns riskLevel=unknown')

const hracB = lookupGroup('HRAC', 'B')
assert(hracB.recognized === true, 'HRAC legacy code "B" resolves')
assert(hracB.riskLevel === 'high', 'HRAC B (legacy ALS) is high-risk')

const irac1A = lookupGroup('IRAC', '1A')
assert(irac1A.recognized === true, 'IRAC 1A is recognized')

// Case-insensitive lookup
assert(lookupGroup('FRAC', 'm5').recognized === true, 'Lookup is case-insensitive')

// ── 2. Structural parsers ────────────────────────────────────────────────
section('Group-code parsing')

assert(JSON.stringify(parseGroupCodes('M5')) === '["M5"]', 'Single code')
assert(JSON.stringify(parseGroupCodes('M5/P1')) === '["M5","P1"]', 'Slash-separated')
assert(JSON.stringify(parseGroupCodes('3, 11')) === '["3","11"]', 'Comma-separated')
assert(JSON.stringify(parseGroupCodes('1A or 4A')) === '["1A","4A"]', '"or" separator')
assert(JSON.stringify(parseGroupCodes('FRAC Group 11')) === '["11"]', 'Strips FRAC/GROUP prefix')
assert(JSON.stringify(parseGroupCodes('M5, M5, P1')) === '["M5","P1"]', 'De-dupes')
assert(JSON.stringify(parseGroupCodes(['11', 'm5', '11'])) === '["11","M5"]', 'Array input passthrough + de-dupe')
assert(JSON.stringify(parseGroupCodes(null)) === '[]', 'Null input → empty array')
assert(JSON.stringify(parseGroupCodes('')) === '[]', 'Empty string → empty array')

section('Active ingredient parsing')
const ai1 = parseActiveIngredients('Chlorothalonil 54.0%, Acibenzolar-S-methyl 0.45%')
assert(ai1.length === 2, 'Parses two-part active list')
assert(ai1[0].name === 'Chlorothalonil' && ai1[0].percent === 54, 'Chlorothalonil 54%')
assert(ai1[1].name === 'Acibenzolar-S-methyl' && ai1[1].percent === 0.45, 'Acibenzolar 0.45%')

const ai2 = parseActiveIngredients('Mefenoxam ........... 33.3%')
assert(ai2.length === 1 && ai2[0].name === 'Mefenoxam', 'Cleans dot leaders')

const ai3 = parseActiveIngredients('')
assert(Array.isArray(ai3) && ai3.length === 0, 'Empty active string → []')

const ai4 = parseActiveIngredients([{ name: 'Tebuconazole', percent: 5.97 }])
assert(ai4.length === 1 && ai4[0].percent === 5.97, 'Array input passthrough')

section('Active name normalization')
assert(normalizeActiveName('Chlorothalonil') === 'chlorothalonil', 'Lowercases')
assert(normalizeActiveName('Chlorothalonil (technical)') === 'chlorothalonil', 'Strips parenthetical')
assert(normalizeActiveName('  Tebuconazole, ') === 'tebuconazole', 'Trims punctuation/whitespace')

section('Duplicate active detection')
const tank = [
  { id: 'a', name: 'Product A', actives: [{ name: 'Chlorothalonil', percent: 54 }] },
  { id: 'b', name: 'Product B', actives: [{ name: 'chlorothalonil', percent: 38 }, { name: 'Tebuconazole', percent: 5 }] },
  { id: 'c', name: 'Product C', actives: [{ name: 'Mefenoxam', percent: 33 }] },
]
const dupes = findDuplicateActives(tank)
assert(dupes.length === 1, 'One duplicate active group')
assert(dupes[0].activeKey === 'chlorothalonil', 'Duplicate is chlorothalonil')
assert(dupes[0].products.length === 2, 'Two products with chlorothalonil')

assert(findDuplicateActives([]).length === 0, 'Empty tank → no duplicates')
assert(findDuplicateActives([tank[0]]).length === 0, 'Single product → no duplicates')

section('Tank-code aggregation')
const tankWithLabels = [
  { id: 'p1', name: 'Daconil', label: { fracGroup: 'M5', hracGroup: null, iracGroup: null } },
  { id: 'p2', name: 'Heritage', label: { fracGroup: '11', hracGroup: null, iracGroup: null } },
  { id: 'p3', name: 'Tartan', label: { fracGroup: '3, 11', hracGroup: null, iracGroup: null } },
]
const codes = aggregateTankCodes(tankWithLabels)
assert(codes.FRAC.length === 3, 'Three distinct FRAC codes')
const frac11Entry = codes.FRAC.find(e => e.code === '11')
assert(frac11Entry && frac11Entry.products.length === 2, 'FRAC 11 shared by 2 products')

// ── 3. History analysis ──────────────────────────────────────────────────
section('Date filtering')

const referenceDate = '2026-05-15'
const records = [
  { id: 'r1', date: '2026-05-13', area: 'Greens',    products: [{ inventoryItemId: 'inv-heritage' }] },
  { id: 'r2', date: '2026-05-06', area: 'Greens',    products: [{ inventoryItemId: 'inv-heritage' }] },
  { id: 'r3', date: '2026-04-29', area: 'Greens',    products: [{ inventoryItemId: 'inv-heritage' }] },
  { id: 'r4', date: '2026-04-29', area: 'Fairways',  products: [{ inventoryItemId: 'inv-daconil' }] },
  { id: 'r5', date: '2026-03-01', area: 'Greens',    products: [{ inventoryItemId: 'inv-heritage' }] }, // out of window
]

const labelsByItemId = {
  'inv-heritage': { fracGroup: '11', hracGroup: null, iracGroup: null }, // QoI - high risk
  'inv-daconil':  { fracGroup: 'M5', hracGroup: null, iracGroup: null }, // multi-site - low risk
}

const windowed = filterByLookback(records, referenceDate, 21)
assert(windowed.length === 4, 'Lookback 21d returns 4 records', windowed.map(r => r.id))
assert(windowed[0].id === 'r3' && windowed[windowed.length - 1].id === 'r1', 'Sorted oldest → newest')

const onGreens = filterByArea(windowed, 'Greens')
assert(onGreens.length === 3, 'Three Greens records in window', onGreens.map(r => r.id))

const onGreensInsensitive = filterByArea(windowed, 'greens')
assert(onGreensInsensitive.length === 3, 'Area filter is case-insensitive')

// No area = pass-through
assert(filterByArea(windowed, null).length === 4, 'Null area returns full list')

section('Count applications by group')
const counts = countApplicationsByGroup(onGreens, labelsByItemId)
const fracCounts = counts.FRAC.find(e => e.code === '11')
assert(fracCounts && fracCounts.applications === 3, 'FRAC 11 has 3 applications on Greens', counts.FRAC)
assert(fracCounts.lastDate === '2026-05-13', 'Last application date tracked')

section('Repeated MOA detection')
const planned = [{ type: 'FRAC', code: '11' }, { type: 'FRAC', code: 'M5' }]
const repeats = detectRepeatedMOA(planned, onGreens, labelsByItemId)
const frac11Repeat = repeats.find(r => r.code === '11')
assert(frac11Repeat.applications === 3, 'FRAC 11 sees 3 prior apps')
assert(frac11Repeat.consecutivePrior === 3, 'FRAC 11 was last 3 consecutive', frac11Repeat)

const m5Repeat = repeats.find(r => r.code === 'M5')
assert(m5Repeat.applications === 0, 'FRAC M5 not previously used on Greens')

section('Days since last use')
const daysSinceFrac11 = daysSinceLastUse('FRAC', '11', onGreens, labelsByItemId, referenceDate)
assert(daysSinceFrac11 === 2, `Days since last FRAC 11 = 2 (got ${daysSinceFrac11})`)

const daysSinceM5 = daysSinceLastUse('FRAC', 'M5', onGreens, labelsByItemId, referenceDate)
assert(daysSinceM5 === null, 'Never-used code returns null days')

// ── 4. Full warning model ────────────────────────────────────────────────
section('Full draft analysis — duplicate + repeated MOA')

const tankProducts = [
  {
    id: 'inv-heritage',
    name: 'Heritage TL',
    label: { fracGroup: '11', activeIngredients: 'Azoxystrobin 22.9%' },
  },
  {
    id: 'inv-insignia',
    name: 'Insignia',
    // ALSO a FRAC 11 — same-tank shared MOA
    label: { fracGroup: '11', activeIngredients: 'Pyraclostrobin 23.6%' },
  },
]

const result = analyzeSprayDraft({
  tankProducts,
  sprayHistory: records,
  labelsByItemId,
  draftArea: 'Greens',
  referenceDate,
  lookbackDays: 21,
})

assert(result.warnings.length >= 2, `Expected ≥2 warnings, got ${result.warnings.length}`, result.warnings.map(w => w.code))

const repeatedWarning = result.warnings.find(w => w.code === 'repeated-moa')
assert(repeatedWarning, 'Repeated MOA warning present')
assert(repeatedWarning.severity === SEVERITY.HIGH, `FRAC 11 + 3 consecutive prior → high severity (got ${repeatedWarning?.severity})`)

const sharedTankWarning = result.warnings.find(w => w.code === 'same-tank-shared-moa')
assert(sharedTankWarning, 'Same-tank shared MOA warning present')
assert(sharedTankWarning.severity === SEVERITY.WARN, 'Same-tank FRAC 11 stacking → warn severity')

// No duplicate-active warning expected — different actives in this tank.
const dupActiveWarning = result.warnings.find(w => w.code === 'duplicate-active')
assert(!dupActiveWarning, 'No duplicate-active warning when actives differ')

assert(highestSeverity(result.warnings) === SEVERITY.HIGH, 'highestSeverity() rolls up to high')

// ── Duplicate active scenario ─────────────────────────────────────────────
section('Full draft analysis — duplicate active ingredient')

const dupTank = [
  { id: 'p1', name: 'Product A', label: { fracGroup: 'M5', activeIngredients: 'Chlorothalonil 54%' } },
  { id: 'p2', name: 'Product B', label: { fracGroup: 'M5', activeIngredients: 'Chlorothalonil 38%, Tebuconazole 5%' } },
]
const dupResult = analyzeSprayDraft({
  tankProducts: dupTank,
  sprayHistory: [],
  labelsByItemId: {},
  draftArea: 'Tees',
  referenceDate,
})

const dupW = dupResult.warnings.find(w => w.code === 'duplicate-active')
assert(dupW, 'Duplicate-active warning detected')
assert(dupW.severity === SEVERITY.HIGH, 'Duplicate-active is high severity')
assert(dupW.detail.toLowerCase().includes('chlorothalonil'), 'Detail mentions chlorothalonil')

// ── Empty-input safety ────────────────────────────────────────────────────
section('Empty-input safety')

const empty = analyzeSprayDraft({})
assert(Array.isArray(empty.warnings) && empty.warnings.length === 0, 'Empty input → no warnings')
assert(empty.summary.tankCodes.FRAC.length === 0, 'Empty input → empty FRAC bucket')

// ── Phase 22C — AI family lookup ─────────────────────────────────────────
section('AI family lookup (Phase 22C)')

assert(lookupActiveFamily('Azoxystrobin')?.code === 'QOI', 'Azoxystrobin → QOI')
assert(lookupActiveFamily('pyraclostrobin')?.code === 'QOI', 'pyraclostrobin (lc) → QOI')
assert(lookupActiveFamily('Fluoxastrobin')?.code === 'QOI', 'Fluoxastrobin → QOI')
assert(lookupActiveFamily('Chlorothalonil (technical)')?.code === 'MULTI', 'Chlorothalonil (technical) → MULTI')
assert(lookupActiveFamily('Mefenoxam')?.code === 'PA', 'Mefenoxam → PA')
assert(lookupActiveFamily('Imidacloprid')?.code === 'NEONIC', 'Imidacloprid → NEONIC')
assert(lookupActiveFamily('Mystery Molecule') === null, 'Unknown active → null (no auto-bucketing)')
assert(familyCodeOf('Tebuconazole') === 'DMI', 'familyCodeOf string helper')
assert(AI_FAMILIES.QOI?.fracGroup === '11', 'QOI family lines up with FRAC 11')

// ── Phase 22C — Area hierarchy ───────────────────────────────────────────
section('Area hierarchy (Phase 22C)')

assert(areaFamilyOf('Greens A')         === 'GREENS',   'Greens A → GREENS')
assert(areaFamilyOf('greens')           === 'GREENS',   'greens → GREENS')
assert(areaFamilyOf('Practice Greens')  === 'PRACTICE', 'Practice Greens → PRACTICE (not GREENS)')
assert(areaFamilyOf('Putting Green')    === 'GREENS',   'Putting Green → GREENS')
assert(areaFamilyOf('Tee #4')           === 'TEES',     'Tee #4 → TEES')
assert(areaFamilyOf('Fairways')         === 'FAIRWAYS', 'Fairways')
assert(areaFamilyOf('Native Areas')     === 'NATIVE',   'Native Areas → NATIVE')
assert(areaFamilyOf('Cart path')        === null,       'Cart path → null (no family rule)')

assert(areaSurfaceTypeOf('Greens A')    === 'greens',   'areaSurfaceTypeOf("Greens A") → greens')
assert(areaSurfaceTypeOf('Cart path')   === null,       'areaSurfaceTypeOf unknown → null')

assert(areasMatch('Greens', 'Greens', 'exact') === true,           'exact: same string')
assert(areasMatch('Greens A', 'Greens B', 'exact') === false,      'exact: different strings')
assert(areasMatch('Greens A', 'Greens B', 'family') === true,      'family: both GREENS')
assert(areasMatch('Greens', 'Practice Greens', 'family') === false, 'family: Greens vs Practice Greens')
assert(areasMatch('Cart path', 'Foo', 'family') === false,         'family with unknown areas falls back to exact')

// filterByArea with family mode
const familyHistory = [
  { id: 'h1', date: '2026-05-10', area: 'Greens A',  products: [] },
  { id: 'h2', date: '2026-05-12', area: 'Greens B',  products: [] },
  { id: 'h3', date: '2026-05-13', area: 'Fairways',  products: [] },
]
const familyFiltered = filterByArea(familyHistory, 'Greens', 'family')
assert(familyFiltered.length === 2, `family-mode filter returns 2 Greens records (got ${familyFiltered.length})`)
const exactFiltered = filterByArea(familyHistory, 'Greens A', 'exact')
assert(exactFiltered.length === 1, 'exact-mode filter unchanged')

// ── Phase 22C — Duplicate family detection ──────────────────────────────
section('Duplicate active families (Phase 22C)')

const qoiTank = [
  { id: 'a', name: 'Heritage TL', actives: [{ name: 'Azoxystrobin',    percent: 22.9 }] },
  { id: 'b', name: 'Insignia',    actives: [{ name: 'Pyraclostrobin', percent: 23.6 }] },
  { id: 'c', name: 'Daconil',     actives: [{ name: 'Chlorothalonil',  percent: 54   }] },
]
const famDupes = findDuplicateActiveFamilies(qoiTank, lookupActiveFamily)
assert(famDupes.length === 1, 'One family duplicate group (QoI)')
assert(famDupes[0].familyCode === 'QOI', 'Family code is QOI')
assert(famDupes[0].products.length === 2, 'Two products in QoI family group')
assert(famDupes[0].products[0].activeName !== famDupes[0].products[1].activeName, 'Different actives, same family')

// ── Phase 22C — Family-level repeat detection ───────────────────────────
section('Family-level repeat detection (Phase 22C)')

const familyLabels = {
  'inv-heritage': { fracGroup: '11', activeIngredients: 'Azoxystrobin 22.9%' },
  'inv-insignia': { fracGroup: '11', activeIngredients: 'Pyraclostrobin 23.6%' },
  'inv-daconil':  { fracGroup: 'M5', activeIngredients: 'Chlorothalonil 54%' },
}
const familyRecords = [
  { id: 'f1', date: '2026-05-04', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 'f2', date: '2026-05-11', area: 'Greens', products: [{ inventoryItemId: 'inv-insignia', name: 'Insignia' }] },
]
const famRepeat = detectRepeatedFamily(
  [{ familyCode: 'QOI' }],
  familyRecords,
  familyLabels,
  lookupActiveFamily,
)
assert(famRepeat[0].applications === 2, 'QOI family seen in 2 prior apps (azoxy + pyraclo)')
assert(famRepeat[0].consecutivePrior === 2, 'QOI family 2 consecutive')

// ── Phase 22C — Sequence formatters ──────────────────────────────────────
section('Sequence formatters (Phase 22C)')

const recordsForTimeline = [
  { id: 'r1', date: '2026-05-04', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage TL' }] },
  { id: 'r2', date: '2026-05-11', area: 'Greens', products: [{ inventoryItemId: 'inv-insignia', name: 'Insignia' }] },
]
const idx = indexRecordsById(recordsForTimeline)
const timeline = buildMOATimeline({
  code: '11',
  type: 'FRAC',
  records: [
    { id: 'r1', date: '2026-05-04', area: 'Greens' },
    { id: 'r2', date: '2026-05-11', area: 'Greens' },
  ],
  historyByRecordId: idx,
  labelsByItemId: familyLabels,
  referenceDate: '2026-05-15',
  draftArea: 'Greens',
})
assert(timeline.length === 3, 'Timeline has 3 entries (2 prior + Current)')
assert(timeline[0].dateLabel === 'May 4', 'First entry → May 4')
assert(timeline[0].productNames[0] === 'Heritage TL', 'First entry resolves product name')
assert(timeline[1].productNames[0] === 'Insignia', 'Second entry resolves Insignia')
assert(timeline[2].isCurrent === true, 'Last entry is current')
assert(timeline[2].dateLabel === 'Current', 'Current label')

assert(formatSequence(timeline) === '11 → 11 → Current', `formatSequence: ${formatSequence(timeline)}`)
assert(formatSequence([]) === '', 'Empty timeline → empty string')

const mix = buildMixSequence(
  [{ date: '2026-05-04', codes: ['M5'] }, { date: '2026-05-11', codes: ['11'] }],
  { plannedCodes: ['11', 'M5'] },
)
assert(mix === 'M5 → 11 → 11+M5 (Current)', `buildMixSequence: ${mix}`)

// ── Phase 22C — Full draft analysis with sequence + family ──────────────
section('Full draft analysis includes sequence + family warnings (Phase 22C)')

const fullHistory = [
  { id: 'r1', date: '2026-05-04', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage TL' }] },
  { id: 'r2', date: '2026-05-11', area: 'Greens', products: [{ inventoryItemId: 'inv-insignia', name: 'Insignia' }] },
]
const fullLabels = {
  'inv-heritage': { fracGroup: '11', activeIngredients: 'Azoxystrobin 22.9%' },
  'inv-insignia': { fracGroup: '11', activeIngredients: 'Pyraclostrobin 23.6%' },
}
const draftTank = [
  { id: 'inv-tartan', name: 'Tartan', label: { fracGroup: '3, 11', activeIngredients: 'Trifloxystrobin 11.3%, Triadimefon 22.6%' } },
]
const fullResult = analyzeSprayDraft({
  tankProducts:    draftTank,
  sprayHistory:    fullHistory,
  labelsByItemId:  fullLabels,
  draftArea:       'Greens',
  referenceDate:   '2026-05-15',
  lookbackDays:    21,
  areaMatchMode:   'exact',
  areaType:        'greens',
})

const repeatedMOAWarning = fullResult.warnings.find(w => w.code === 'repeated-moa' && w.evidence.code === '11')
assert(repeatedMOAWarning, 'FRAC 11 repeated-moa warning present')
assert(Array.isArray(repeatedMOAWarning.evidence.sequence), 'Sequence attached to evidence')
assert(repeatedMOAWarning.evidence.sequenceLabel?.includes(' → Current'), `Sequence label ends with Current (got "${repeatedMOAWarning.evidence.sequenceLabel}")`)
assert(repeatedMOAWarning.evidence.sequence.length === 3, '3-entry sequence (2 prior + Current)')

// Family warning for QOI should NOT appear when the direct FRAC 11 warning
// already covers the same chain (suppression rule).
const qoiFamilyWarning = fullResult.warnings.find(w => w.code === 'repeated-family' && w.evidence.familyCode === 'QOI')
assert(!qoiFamilyWarning, 'QOI family warning suppressed when FRAC 11 already flagged')

assert(fullResult.summary.areaType === 'greens', 'Summary carries areaType')
assert(fullResult.summary.areaMatchMode === 'exact', 'Summary carries areaMatchMode')
assert(fullResult.summary.repeatedFamily.length >= 1, 'repeatedFamily present in summary')

// ── Phase 22C — Family duplicate triggers when codes don't (different
//                molecules, no shared label group code present)
section('Duplicate-active-family warning (no direct MOA warning)')

const famDupTank = [
  { id: 'p1', name: 'Product A', label: { activeIngredients: 'Azoxystrobin 22%' } },
  { id: 'p2', name: 'Product B', label: { activeIngredients: 'Pyraclostrobin 23%' } },
]
const famDupResult = analyzeSprayDraft({
  tankProducts:   famDupTank,
  sprayHistory:   [],
  labelsByItemId: {},
  draftArea:      'Tees',
  referenceDate:  '2026-05-15',
})
const dupFamW = famDupResult.warnings.find(w => w.code === 'duplicate-active-family')
assert(dupFamW, 'duplicate-active-family warning detected')
assert(dupFamW.evidence.familyCode === 'QOI', 'duplicate family is QOI')
assert(dupFamW.severity === SEVERITY.WARN, 'duplicate-active-family is warn severity')

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
