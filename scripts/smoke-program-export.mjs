// Phase 23C — Spray Program Intelligence export smoke test.
//
// Verifies CSV row shape, RFC-4180 quoting, summary text composition,
// filtered exports respecting filters, and empty-input safety. Run:
//
//   node scripts/smoke-program-export.mjs

import {
  buildCsvRows,
  serializeCsv,
  buildSummaryText,
  defaultCsvFilename,
  buildProgramSummary,
  filterRecordsByDateRange,
  filterRecordsBySurface,
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

// ── Fixture ──────────────────────────────────────────────────────────────
const labelsByItemId = {
  'inv-heritage': { fracGroup: '11', activeIngredients: 'Azoxystrobin 22.9%' },
  'inv-daconil':  { fracGroup: 'M5', activeIngredients: 'Chlorothalonil 54%' },
  'inv-banner':   { fracGroup: '3',  activeIngredients: 'Propiconazole 41.8%' },
  // Product without an inventoryItemId match — exercises unresolved labels.
  'inv-mystery':  null,
}

const records = [
  { id: 'r1', date: '2026-04-01', area: 'Greens',     products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 'r2', date: '2026-04-08', area: 'Greens',     products: [{ inventoryItemId: 'inv-daconil',  name: 'Daconil' }] },
  { id: 'r3', date: '2026-04-15', area: 'Fairway #1', products: [{ inventoryItemId: 'inv-banner',   name: 'Banner Maxx' }] },
  // Tricky product name with commas + quotes → CSV quoting.
  { id: 'r4', date: '2026-04-22', area: 'Greens',     products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage, "TL" formulation' }] },
  // Record without label-resolvable codes — empty code/family cells.
  { id: 'r5', date: '2026-04-29', area: 'Tee #4',     products: [{ inventoryItemId: 'unknown-id', name: 'Mystery Product' }] },
]

// ── 1. CSV row shape ────────────────────────────────────────────────────
section('CSV row shape')

const { headers, rows } = buildCsvRows({ records, labelsByItemId })

assert(Array.isArray(headers), 'headers is an array')
assert(headers.includes('date'),         'headers include date')
assert(headers.includes('area'),         'headers include area')
assert(headers.includes('surface'),      'headers include surface')
assert(headers.includes('products'),     'headers include products')
assert(headers.includes('frac_codes'),   'headers include frac_codes')
assert(headers.includes('hrac_codes'),   'headers include hrac_codes')
assert(headers.includes('irac_codes'),   'headers include irac_codes')
assert(headers.includes('ai_families'),  'headers include ai_families')

assert(rows.length === 5, `rows length = 5 (got ${rows.length})`)
assert(rows[0][0] === '2026-04-01', 'row 0: date')
assert(rows[0][1] === 'Greens', 'row 0: area')
assert(rows[0][2] === 'greens', 'row 0: surface resolved to greens')
assert(rows[0][3] === 'Heritage', 'row 0: product name')
assert(rows[0][4] === '11', 'row 0: FRAC 11')
assert(rows[0][7] === 'QOI', 'row 0: AI family QOI')

assert(rows[2][2] === 'fairways', 'row 2: fairway → fairways')
assert(rows[4][2] === 'tees',     'row 4: tee #4 → tees')
assert(rows[4][4] === '',         'row 4: no FRAC code (unresolved label)')
assert(rows[4][7] === '',         'row 4: no AI family')

// ── 2. CSV serialization + quoting ──────────────────────────────────────
section('CSV serialization + RFC-4180 quoting')

const csv = serializeCsv({ headers, rows })
const lines = csv.split('\r\n')
assert(lines[0] === headers.join(','), 'header row joined with commas, no quoting needed')
assert(csv.includes('\r\n'), 'rows separated by CRLF')

// Row 3 has the tricky product name with a comma + quotes.
const tricky = lines[4] // 0=header, 1=r1, 2=r2, 3=r3, 4=r4
assert(tricky.includes('"Heritage, ""TL"" formulation"'),
  `embedded quotes doubled + cell quoted (got: ${tricky})`)

// Plain cells must NOT be quoted.
assert(!lines[1].includes('"Heritage,'), 'simple cell "Heritage" stays unquoted in row 1')

// Quote also triggers when a cell contains only a single embedded quote.
const qOnly = serializeCsv({ headers: ['x'], rows: [['a"b']] })
assert(qOnly === 'x\r\na"b'.replace('a"b', '"a""b"'),
  `single-quote cell escaped correctly (got: ${qOnly})`)

// Newline inside a cell forces quoting.
const nlCell = serializeCsv({ headers: ['x'], rows: [['a\nb']] })
assert(nlCell.endsWith('"a\nb"'), `newline cell quoted (got: ${nlCell})`)

// ── 3. Empty CSV ─────────────────────────────────────────────────────────
section('Empty CSV')

const empty = buildCsvRows({ records: [], labelsByItemId: {} })
assert(empty.rows.length === 0, 'empty records → 0 rows')
assert(Array.isArray(empty.headers) && empty.headers.length > 0, 'headers still present')

const emptyCsv = serializeCsv(empty)
assert(emptyCsv === empty.headers.join(','), 'empty CSV = just the header row')

// ── 4. Summary text ─────────────────────────────────────────────────────
section('Summary text generation')

const summary = buildProgramSummary(records, labelsByItemId)
const text = buildSummaryText(summary, {
  dateRange: 'currentSeason', surface: 'all', chemistryType: 'all', pressure: 'all',
}, { courseName: 'Crossroads GC', generatedAt: '2026-05-16' })

assert(text.startsWith('Program Intelligence Summary —'), 'starts with summary heading')
assert(text.includes('Current season'), 'scope phrase included')
assert(text.includes('Course: Crossroads GC'), 'course line present')
assert(text.includes('Generated: 2026-05-16'), 'generated line present')
assert(text.includes('Total applications: 5'), 'total applications line')
assert(/FRAC diversity: 0\.\d{2}/.test(text), 'FRAC diversity line with score')
assert(text.includes('Multi-site rate:'), 'multi-site line present')
assert(text.includes('Top FRAC usage:'), 'top FRAC section heading')
assert(text.includes('FRAC 11'), 'top FRAC includes 11')
assert(text.includes('Active-ingredient families:'), 'families section')
// No FRAC code in the fixture hits the same surface twice consecutively,
// so the streaks section is correctly omitted here. (We DO test streak
// emission below with a synthetic streak fixture.)
assert(!text.includes('Longest MOA streaks:'), 'no streaks section when nothing ≥ 2 in a row')
assert(text.includes('High-pressure groups:'), 'high-pressure section')
assert(text.includes('FRAC 11'), 'high-pressure mentions FRAC 11')

// Coverage note when unresolved applications exist.
assert(text.includes('Chemistry coverage note'),
  'coverage note present when unresolved apps exist')

// Surface scope is preserved in the heading when filters narrow.
const greensText = buildSummaryText(summary, {
  dateRange: 'last30', surface: 'greens', chemistryType: 'all', pressure: 'all',
})
assert(greensText.startsWith('Program Intelligence Summary — Greens · Last 30 days'),
  `heading reflects surface + date filter (got: "${greensText.slice(0, 80)}")`)

// ── 5. Filtered export respects filters ─────────────────────────────────
section('Filtered export respects filters')

const greensRecords = filterRecordsBySurface(records, 'greens')
const greensCsv = buildCsvRows({ records: greensRecords, labelsByItemId })
assert(greensCsv.rows.length === 3, `greens-only → 3 CSV rows (got ${greensCsv.rows.length})`)
assert(greensCsv.rows.every(r => r[2] === 'greens'), 'all CSV rows are greens surface')

const recentRecords = filterRecordsByDateRange(records, 'custom', {
  customStart: '2026-04-15', customEnd: '2026-04-30',
})
const recentCsv = buildCsvRows({ records: recentRecords, labelsByItemId })
assert(recentCsv.rows.length === 3, `custom range → 3 CSV rows (r3, r4, r5)`)
assert(recentCsv.rows[0][0] === '2026-04-15', 'first row date matches range start')

// Filtered summary text reflects the filtered records.
const filteredSummary = buildProgramSummary(greensRecords, labelsByItemId)
const filteredText = buildSummaryText(filteredSummary, {
  dateRange: 'all', surface: 'greens', chemistryType: 'all', pressure: 'all',
})
assert(filteredText.includes('Total applications: 3'), 'filtered summary text has 3 apps')
assert(filteredText.startsWith('Program Intelligence Summary — Greens'), 'heading shows surface')

// ── 6. Empty filtered export ────────────────────────────────────────────
section('Empty filtered export')

const emptyFiltered = filterRecordsBySurface(records, 'rough')
assert(emptyFiltered.length === 0, 'no rough records in fixture')

const emptyExport = buildCsvRows({ records: emptyFiltered, labelsByItemId })
assert(emptyExport.rows.length === 0, 'empty filter → 0 CSV rows')

const emptySummary = buildProgramSummary(emptyFiltered, labelsByItemId)
const emptyText = buildSummaryText(emptySummary, {
  dateRange: 'all', surface: 'rough', chemistryType: 'all', pressure: 'all',
})
assert(emptyText.includes('Total applications: 0'), 'empty summary text says 0 apps')
assert(emptyText.includes('FRAC diversity: —'), 'empty: FRAC diversity em-dash')
assert(emptyText.includes('Multi-site rate: —'), 'empty: multi-site em-dash')
assert(!emptyText.includes('Top FRAC usage:'), 'empty: no top-FRAC section')

// ── 7. Filename helper ──────────────────────────────────────────────────
section('Filename helper')

const fn1 = defaultCsvFilename({ courseName: 'Crossroads GC', generatedAt: '2026-05-16' })
assert(fn1 === 'crossroads-gc-program-intelligence-2026-05-16.csv',
  `slug-safe filename (got: ${fn1})`)

const fn2 = defaultCsvFilename({})
assert(fn2.startsWith('turfintel-program-intelligence-'), `fallback prefix (got: ${fn2})`)
assert(fn2.endsWith('.csv'), 'fallback ends with .csv')

// ── 8. Streaks section emits when a real streak exists ─────────────────
section('Streaks section (positive path)')

const streakRecords = [
  { id: 's1', date: '2026-04-01', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 's2', date: '2026-04-08', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 's3', date: '2026-04-15', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
]
const streakSummary = buildProgramSummary(streakRecords, labelsByItemId)
const streakText = buildSummaryText(streakSummary, {
  dateRange: 'currentSeason', surface: 'greens', chemistryType: 'all', pressure: 'all',
})
assert(streakText.includes('Longest MOA streaks:'), 'streaks section present when ≥ 2 in a row')
assert(streakText.includes('FRAC 11'), 'streak row mentions FRAC 11')
assert(streakText.includes('3 in a row on greens'), 'streak text shows count + surface')

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
