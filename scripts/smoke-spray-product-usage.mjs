// Phase S.5c.3 — Spray Product Usage Totals report smoke.
//
//   node scripts/smoke-spray-product-usage.mjs
//
// Pins:
//   • New buildSprayProductUsageReport() builder.
//   • Groups by (catalogId ?? name) + ' · ' + unit so mixed units
//     never collapse into a meaningless sum.
//   • Reads ONLY snapshot fields (epaNumberSnapshot,
//     activeIngredientsSnapshot, totalCostSnapshot).
//   • Never re-resolves the live product catalog.
//   • Export Product Usage button wired in SprayRecords, uses
//     `visible` (filtered set), refuses to generate on empty result.
//   • S.5c.2 Export Compliance Packet + S.5a.1 Edit modal + S.5c.1
//     filters + single-record Generate Report all preserved.

import { readFileSync, readdirSync } from 'fs'
import { buildSprayProductUsageReport } from '../src/utils/reports/reportBuilder.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const RB       = readFileSync('src/utils/reports/reportBuilder.js',            'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',         'utf8')
const MODAL    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx', 'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',              'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                          'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                  'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',             'utf8')

const RB_CODE      = stripComments(RB)
const RECORDS_CODE = stripComments(RECORDS)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── New builder export ──────────────────────────────────────────────
section('buildSprayProductUsageReport — exported + helper exists')

assert(/^export function buildSprayProductUsageReport\(records = \[\], options = \{\}\)/m.test(RB),
  'buildSprayProductUsageReport exported with (records, options) signature')
assert(/^function productUsageGroupKey\(product\)/m.test(RB),
  'productUsageGroupKey grouping helper defined')

// ── Snapshot integrity — never re-resolves the product catalog ──────
section('Snapshot integrity — builder reads only stored snapshot fields')

const builderMatch = RB.match(/^export function buildSprayProductUsageReport[\s\S]*?\nexport /m)
const builderSrc   = builderMatch ? builderMatch[0] : ''
assert(builderSrc.length > 0, 'buildSprayProductUsageReport body extracted')
const builderCode = stripComments(builderSrc)

// Negative pins — no live-catalog lookups inside the builder.
assert(!/fetch\(|getProductCatalog|listProductCatalog|resolveSprayProduct/.test(builderCode),
  'builder does NOT fetch / look up / resolve against the product catalog')
// Positive pins — snapshot fields read by name.
for (const snap of [
  'p\\.epaNumberSnapshot',
  'p\\.activeIngredientsSnapshot',
  'p\\.totalCostSnapshot',
]) {
  assert(new RegExp(snap).test(builderSrc),
    `builder reads ${snap.replace('\\.', '.')}`)
}
// Negative pins on live-catalog field names.
assert(!/p\.epaNumber(?!Snapshot)/.test(builderSrc),
  'builder does NOT read p.epaNumber (live catalog field)')
assert(!/p\.activeIngredients(?!Snapshot)/.test(builderSrc),
  'builder does NOT read p.activeIngredients (live catalog field)')

// ── Pure-function behavior tests ────────────────────────────────────
section('Builder — empty set, mixed-unit grouping, sums + sort')

// Empty packet still produces a valid report shape.
const empty = buildSprayProductUsageReport([])
assert(empty != null && typeof empty === 'object',
  'buildSprayProductUsageReport([]) returns an object')
assert(empty.module === 'spray',  'empty report.module === "spray"')
assert(empty.type   === 'spray-summary',
  'empty report.type === "spray-summary" (reuses existing schema type)')
assert(Array.isArray(empty.sections) && empty.sections.length >= 2,
  'empty report has at least 2 sections (Summary + empty-state)')
const emptySummary = empty.sections.find(s => s.title === 'Product Usage Summary')
assert(emptySummary?.data?.['Total Records']   === 0, 'empty: Total Records === 0')
assert(emptySummary?.data?.['Unique Products'] === 0, 'empty: Unique Products === 0')
assert(emptySummary?.data?.['Total Cost']      === '—', 'empty: Total Cost === "—"')
const emptyText = empty.sections.find(s => s.title === 'No product usage')
assert(emptyText != null,           'empty: "No product usage" TEXT section present')
assert(emptyText?.type === 'text',  'empty: empty-state section is SECTION_TYPE.TEXT')

// Populated input with mixed-unit grouping.
// rec1 + rec2: same product (Daconil) at oz → should aggregate.
// rec3: same product (Daconil) at gal → MUST split into a separate row.
// rec4: different product (Primo) at gal → its own row.
const records = [
  {
    id: 'r1', date: '2026-06-01', applicator: 'Jose', area: 'Greens',
    products: [{
      name: 'Daconil Ultrex', unit: 'oz', quantityUsed: 32, totalCostSnapshot: 100.00,
      productCatalogId: 'pc-daconil', epaNumberSnapshot: '50534-202',
      activeIngredientsSnapshot: 'Chlorothalonil 82.5%',
    }],
  },
  {
    id: 'r2', date: '2026-06-10', applicator: 'Jose', area: 'Tees',
    products: [{
      name: 'Daconil Ultrex', unit: 'oz', quantityUsed: 24, totalCostSnapshot: 75.00,
      productCatalogId: 'pc-daconil', epaNumberSnapshot: '50534-202',
      activeIngredientsSnapshot: 'Chlorothalonil 82.5%',
    }],
  },
  {
    id: 'r3', date: '2026-06-15', applicator: 'Maria', area: 'Fairways',
    products: [{
      name: 'Daconil Ultrex', unit: 'gal', quantityUsed: 2, totalCostSnapshot: 80.00,
      productCatalogId: 'pc-daconil',
    }],
  },
  {
    id: 'r4', date: '2026-06-20', applicator: 'Maria', area: 'Greens',
    products: [{
      name: 'Primo Maxx', unit: 'gal', quantityUsed: 1.5,
      productCatalogId: 'pc-primo',
    }],
  },
]

const report = buildSprayProductUsageReport(records, {
  title:          'Product Usage Totals',
  dateRange:      '2026-06-01 → 2026-06-30',
  courseName:     'Crosswinds Golf Club',
  filtersSummary: 'Status: completed',
})

const summary = report.sections.find(s => s.title === 'Product Usage Summary')
assert(summary?.data?.['Total Records']   === 4, 'summary: Total Records === 4')
// uniqueProductIds counts distinct catalogId — Daconil counted once
// despite the unit split.
assert(summary?.data?.['Unique Products'] === 2, 'summary: Unique Products === 2 (catalogId-based, ignores unit splits)')
// Grand cost: 100 + 75 + 80 = 255 (Primo has no cost snapshot).
assert(summary?.data?.['Total Cost']      === '$255.00', 'summary: Total Cost === $255.00 (snapshot sum)')
assert(summary?.data?.['Course']          === 'Crosswinds Golf Club', 'summary: Course echoes option')
assert(summary?.data?.['Date Range']      === '2026-06-01 → 2026-06-30', 'summary: Date Range echoes option')
assert(summary?.data?.['Filters Applied'] === 'Status: completed', 'summary: Filters Applied echoes option')

// Per-Product Totals table.
const totalsTable = report.sections.find(s => s.title === 'Per-Product Totals')
assert(totalsTable != null && totalsTable.type === 'table',
  'Per-Product Totals section is a TABLE')
assert(Array.isArray(totalsTable.data.columns) && totalsTable.data.columns.length === 8,
  'totals table has 8 columns')
// 3 rows: Daconil oz, Daconil gal, Primo gal.
assert(totalsTable.data.rows.length === 3,
  `totals table has 3 rows for mixed-unit grouping (got ${totalsTable.data.rows.length})`)
// Find the Daconil oz row — Records=2, Total Qty=56 (32+24), Total Cost=$175.00.
const daconilOz = totalsTable.data.rows.find(r => r[0] === 'Daconil Ultrex' && r[1] === 'oz')
assert(daconilOz != null,                'Daconil oz row exists')
assert(daconilOz[2] === 2,               'Daconil oz row: Records === 2')
assert(daconilOz[3] === 56,              'Daconil oz row: Total Qty === 56 (32+24)')
assert(daconilOz[4] === '$175.00',       'Daconil oz row: Total Cost === $175.00')
assert(daconilOz[5] === '$87.50',        'Daconil oz row: Avg/Use === $87.50 (175/2)')
assert(daconilOz[6] === '2026-06-01',    'Daconil oz row: First Used === 2026-06-01')
assert(daconilOz[7] === '2026-06-10',    'Daconil oz row: Last Used === 2026-06-10')
// Daconil gal row separate.
const daconilGal = totalsTable.data.rows.find(r => r[0] === 'Daconil Ultrex' && r[1] === 'gal')
assert(daconilGal != null,           'Daconil gal row exists (split from oz row)')
assert(daconilGal[2] === 1,          'Daconil gal row: Records === 1')
assert(daconilGal[3] === 2,          'Daconil gal row: Total Qty === 2')
assert(daconilGal[4] === '$80.00',   'Daconil gal row: Total Cost === $80.00')

// Sort order — Daconil oz (cost 175) comes first, then Daconil gal
// (80), then Primo (no cost; tie-broken by record count).
assert(totalsTable.data.rows[0][0] === 'Daconil Ultrex' && totalsTable.data.rows[0][1] === 'oz',
  'sort order: highest-cost product+unit row first')

// Per-product detail FIELDS section for Daconil oz.
const daconilOzDetail = report.sections.find(
  s => s.title === 'Daconil Ultrex (oz)' && s.type === 'fields',
)
assert(daconilOzDetail != null,        'Daconil oz detail FIELDS section present')
assert(daconilOzDetail.data['EPA Number']         === '50534-202',
  'Daconil oz detail: EPA Number from snapshot')
assert(daconilOzDetail.data['Active Ingredients'] === 'Chlorothalonil 82.5%',
  'Daconil oz detail: Active Ingredients from snapshot')
assert(daconilOzDetail.data['Total Quantity']     === '56 oz',
  'Daconil oz detail: Total Quantity includes unit')
assert(daconilOzDetail.data['Total Cost']         === '$175.00',
  'Daconil oz detail: Total Cost formatted')

// Contributing-records table for Daconil oz.
const daconilOzContrib = report.sections.find(
  s => s.title === 'Daconil Ultrex — Contributing Records',
)
assert(daconilOzContrib != null && daconilOzContrib.type === 'table',
  'Daconil — Contributing Records section is a TABLE')
assert(daconilOzContrib.data.columns.includes('Date')
       && daconilOzContrib.data.columns.includes('Applicator'),
  'Contributing records table includes Date + Applicator columns')
assert(daconilOzContrib.data.rows.length === 2,
  `Contributing records: 2 rows for Daconil oz (got ${daconilOzContrib.data.rows.length})`)

// Primo row — no cost snapshot, no EPA, no AI; report should not crash.
const primoDetail = report.sections.find(s => s.title === 'Primo Maxx (gal)')
assert(primoDetail?.data?.['EPA Number'] === '—',
  'Primo (no snapshot) detail: EPA Number === "—"')
assert(primoDetail?.data?.['Total Cost'] === '—',
  'Primo (no cost snapshot) detail: Total Cost === "—"')

// Metadata block.
assert(report.metadata?.recordCount        === 4,
  'metadata.recordCount === 4')
assert(report.metadata?.productGroupCount  === 3,
  'metadata.productGroupCount === 3 (oz + gal + Primo)')
assert(report.metadata?.uniqueProductCount === 2,
  'metadata.uniqueProductCount === 2 (Daconil + Primo, ignoring unit split)')
assert(report.metadata?.grandCost          === 255,
  'metadata.grandCost === 255 (snapshot sum)')

// ── SprayRecords integration ────────────────────────────────────────
section('SprayRecords — Export Product Usage button wired to filtered set')

assert(/buildSprayProductUsageReport[\s\S]{0,400}from '\.\.\/\.\.\/\.\.\/utils\/reports\/reportBuilder'/.test(RECORDS),
  'SprayRecords imports buildSprayProductUsageReport')

assert(/function handleExportProductUsage\(\)/.test(RECORDS),
  'handleExportProductUsage() handler defined')

const expMatch = RECORDS.match(/function handleExportProductUsage\(\)\s*\{[\s\S]*?\n  \}/)
const expSrc   = expMatch ? expMatch[0] : ''
assert(expSrc.length > 0, 'handleExportProductUsage body extracted')

assert(/if \(visible\.length === 0\)/.test(expSrc),
  'export handler guards on visible.length === 0')
assert(/toast\.info\(['"]No records match[\s\S]{0,100}\)/.test(expSrc),
  'export handler toast.info() warns on empty filter set')
assert(/setActiveReport\(buildSprayProductUsageReport\(visible,/.test(expSrc),
  'export handler calls buildSprayProductUsageReport(visible, ...) — honors filters')

// Negative: never passes raw SPRAY_RECORDS.
assert(!/buildSprayProductUsageReport\(SPRAY_RECORDS/.test(RECORDS_CODE),
  'export handler never passes raw SPRAY_RECORDS (bypasses filters)')

// Each active filter contributes a bit to filtersSummary.
for (const fragment of [
  /if \(search\)\s*filterBits\.push\(/,
  /if \(typeFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(statusFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(applicatorFilter !== 'All'\) filterBits\.push\(/,
  /if \(productFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(needsInfoOnly\)\s*filterBits\.push\(/,
]) {
  assert(fragment.test(expSrc),
    `filtersSummary builder includes: ${fragment}`)
}

// Date range cover string handles all four branches.
assert(/effStart && effEnd \? `\$\{effStart\} → \$\{effEnd\}`/.test(expSrc),
  'export handler dateRange handles both bounds')
assert(/: effStart\s*\?\s*`On or after \$\{effStart\}`/.test(expSrc),
  'export handler dateRange handles start-only')
assert(/: effEnd\s*\?\s*`On or before \$\{effEnd\}`/.test(expSrc),
  'export handler dateRange handles end-only')
assert(/:\s*['"]All dates['"]/.test(expSrc),
  'export handler dateRange falls back to "All dates"')

// Button rendered, wired, accessible.
assert(/<button[\s\S]{0,400}className=\{styles\.exportUsageBtn\}[\s\S]{0,400}onClick=\{handleExportProductUsage\}/.test(RECORDS),
  'Export Product Usage button renders + wires onClick')
assert(/Export Product Usage/.test(RECORDS),
  'Export button label reads "Export Product Usage"')
assert(/aria-label="Export filtered records as product usage totals report"/.test(RECORDS),
  'Export button has an accessible aria-label')

// CSS class exists.
assert(/\.exportUsageBtn\s*\{/.test(CSS),
  'CSS .exportUsageBtn rule defined')

// Mobile rule includes the new button in the stretch selector group.
assert(/\.advFilterClearBtn,[\s\S]{0,400}\.exportUsageBtn[\s\S]{0,300}\{[\s\S]{0,300}align-self:\s*stretch/.test(CSS),
  'mobile selector group includes .exportUsageBtn (stretch full-width)')

// ── S.5c.2 Export Compliance Packet still wired (regression couple) ─
section('S.5c.2 Export Compliance Packet preserved')

assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}[\s\S]{0,400}onClick=\{handleExportCompliancePacket\}/.test(RECORDS),
  'Export Compliance Packet button still rendered + wired')
assert(/function handleExportCompliancePacket\(\)/.test(RECORDS),
  'handleExportCompliancePacket() still defined')
assert(/setActiveReport\(buildSprayCompliancePacket\(visible,/.test(RECORDS),
  'Export Compliance Packet still uses filtered visible set')

// ── S.5a.1 + S.5c.1 + single-record report regressions ──────────────
section('Single-record Generate Report + Edit modal + filters preserved')

assert(/onClick=\{\(\) => generateApplicationReport\(selected\)\}/.test(RECORDS),
  'Generate Report button still calls generateApplicationReport(selected)')
assert(/buildSpraySummaryReport\(/.test(RECORDS),
  'Single-record path still uses buildSpraySummaryReport')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'Edit modal import still in place (S.5a.1)')
const payloadMatch = MODAL.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
for (const snap of [
  'epaNumberSnapshot', 'activeIngredientsSnapshot',
  'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `edit modal buildPatchPayload still does NOT echo ${snap} (snapshot frozen)`)
}

// S.5c.1 filter pipeline still wired.
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(RECORDS.includes(dep),
    `S.5c.1 filter input still wired: ${dep}`)
}

// ── Worker / catalog / migration scope guards ───────────────────────
section('Scope guards — no worker / migration / catalog / builder calc changes')

assert(/export async function updateSpray\(env, id, request\)/.test(SPRAYS_W),
  'worker updateSpray still exported (regression)')
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  'worker MUTATION_RULES still gates /api/sprays')

const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Out-of-scope surfaces carry no S.5c.3 marker.
for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/Spray.jsx',
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.3'),
    `${path} carries no Phase S.5c.3 edits`)
}
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.3'),
    `${path} carries no Phase S.5c.3 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5c.3'),   'DAB carries no Phase S.5c.3 edits')
assert(!KIOSK.includes('Phase S.5c.3'), 'kiosk carries no Phase S.5c.3 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
