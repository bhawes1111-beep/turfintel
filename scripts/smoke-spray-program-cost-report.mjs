// Phase 7I (3/?) — Spray Program Cost Report Builder smoke.
//
//   node scripts/smoke-spray-program-cost-report.mjs
//
// Locks:
//   - builder exports the spec'd functions
//   - builder reuses programCostAwareness + costBasisReview helpers
//   - builder has no react/fetch/store imports + no mutation verbs
//   - builder does not mutate inputs
//   - totals (programsReviewed, plannedItems, estimatedItems,
//     estimatedTotal, missingCostBasis, missingQuantity,
//     notComparableUnits, invalidCost, affectedPlannedItems) match a
//     hand-rolled fixture
//   - all five sections (overview / program-cost-summary /
//     estimated-items / cost-basis-gaps / not-estimated-items)
//     are present with their ids
//   - report metadata carries the SPRAY_PROGRAM_COST reportKind,
//     disclaimer, notices, totals, printExtras
//   - reportDefs registry includes spray-program-cost with the
//     'programs', 'itemsByProgramId', 'inventoryProducts' requires
//   - no budget / invoice / ledger create call exists
//   - no inventory deduction / spray-record creation calls
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary anywhere
//   - spray save payload (Phase 7F.4) remains unchanged

import { readFileSync } from 'fs'
import {
  buildSprayProgramCostReport,
  summarizeProgramCostForReport,
  summarizeCostBasisIssuesForReport,
  buildSprayProgramCostReportSections,
} from '../src/utils/reports/builders/sprayProgramCostReport.js'
import { REPORT_TYPE, REPORT_MODULE, SECTION_TYPE }
  from '../src/utils/reports/reportSchemas.js'
import { REPORT_DEFS } from '../src/utils/reports/reportDefs.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Builder source contracts ───────────────────────────────────────────
console.log('— src/utils/reports/builders/sprayProgramCostReport.js (source)')
{
  const src = readFileSync('src/utils/reports/builders/sprayProgramCostReport.js', 'utf8')

  for (const name of [
    'buildSprayProgramCostReport',
    'summarizeProgramCostForReport',
    'summarizeCostBasisIssuesForReport',
    'buildSprayProgramCostReportSections',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Helper reuse — must import from the existing helpers and not
  // re-declare cost math.
  assert(/from\s+['"]\.\.\/\.\.\/sprayPrograms\/programCostAwareness\.js['"]/.test(src),
    'builder imports programCostAwareness helpers')
  assert(/from\s+['"]\.\.\/\.\.\/sprayPrograms\/costBasisReview\.js['"]/.test(src),
    'builder imports costBasisReview helpers')
  for (const sym of [
    'estimateProgramItemCost', 'buildProgramCostSummary',
    'buildProgramCostSummaries', 'formatEstimatedCost',
    'buildCostBasisReview',
  ]) {
    assert(new RegExp(`\\b${sym}\\b`).test(src),
      `builder references ${sym}`)
  }

  // Purity scan.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),     'builder does not import react')
  assert(!/fetch\(/.test(codeOnly),                   'builder does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'builder does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'builder code-only contains no write method strings')

  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
    'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `builder code-only never references ${verb}`)
  }

  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `builder code-only avoids "${word}"`)
  }

  // Boundary copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Read-only spray program cost summary.',
    'Based on planned program items and inventory cost basis.',
    'This report does not create budget entries.',
    'Missing cost basis means no usable inventory cost is available.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(norm.includes(phrase), `boundary copy verbatim: "${phrase}"`)
  }
}

// ── 2. Builder runtime — totals + sections on a representative fixture ───
console.log('— buildSprayProgramCostReport runtime behavior')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing-cost-per-unit
    { id: 'inv-3', name: 'Barricade', costPerUnit: 12.00 },                       // missing-unit
    { id: 'inv-4', name: 'Specticle', unit: 'lb/acre', costPerUnit: 0 },          // invalid-cost
  ]
  const programs = [
    { id: 'p1', name: 'Greens', programType: 'greens',  seasonYear: 2026, status: 'active' },
    { id: 'p2', name: 'Tees',   programType: 'tees',    seasonYear: 2026, status: 'draft'  },
  ]
  const itemsByProgramId = {
    p1: [
      // estimated: 4.25 × 2 = 8.50
      { id: 'i1', productName: 'Daconil',   inventoryItemId: 'inv-1', rateValue: 2, rateUnit: 'oz/1000 sq ft', status: 'planned' },
      // estimated: 4.25 × 3.25 = 13.8125 → 13.81
      { id: 'i2', productName: 'Daconil 2', inventoryItemId: 'inv-1', rateValue: 3.25, rateUnit: 'oz/1000 sq ft', status: 'planned' },
      // missing-cost-basis (inv-2 has no costPerUnit)
      { id: 'i3', productName: 'Heritage',  inventoryItemId: 'inv-2', rateValue: 1, rateUnit: 'oz/1000 sq ft', status: 'planned' },
      // missing-quantity (rateValue null)
      { id: 'i4', productName: 'Daconil 3', inventoryItemId: 'inv-1', rateValue: null, rateUnit: 'oz/1000 sq ft', status: 'planned' },
    ],
    p2: [
      // not-comparable-unit (planner says oz/1000 sq ft, inv-3 has no unit at all)
      { id: 'i5', productName: 'Barricade', inventoryItemId: 'inv-3', rateValue: 1, rateUnit: 'oz/1000 sq ft', status: 'planned' },
      // missing-cost-basis (unknown inv id)
      { id: 'i6', productName: 'Ghost',     inventoryItemId: 'inv-ghost', rateValue: 1, rateUnit: 'oz/1000 sq ft', status: 'planned' },
      // missing-cost-basis (inv-4 has costPerUnit=0 → invalid-cost on
      // the inventory side; the cost-helper still rolls that up as
      // missing-cost-basis from the planned-item perspective).
      { id: 'i7', productName: 'Specticle', inventoryItemId: 'inv-4', rateValue: 1, rateUnit: 'lb/acre', status: 'planned' },
    ],
  }

  // No-mutation guards.
  const progSnap = JSON.stringify(programs)
  const mapSnap  = JSON.stringify(itemsByProgramId)
  const invSnap  = JSON.stringify(inv)

  const report = buildSprayProgramCostReport({
    programs, itemsByProgramId, inventoryProducts: inv,
    dateRange: 'Season 2026',
    options: { now: Date.UTC(2026, 4, 26) },
  })

  assert(JSON.stringify(programs) === progSnap,         'buildSprayProgramCostReport does not mutate programs')
  assert(JSON.stringify(itemsByProgramId) === mapSnap,  'buildSprayProgramCostReport does not mutate itemsByProgramId')
  assert(JSON.stringify(inv) === invSnap,               'buildSprayProgramCostReport does not mutate inventory')

  // Envelope basics.
  assert(report.module === REPORT_MODULE.SPRAY,            'envelope module = SPRAY')
  assert(report.type   === REPORT_TYPE.SPRAY_PROGRAM_COST, 'envelope type = SPRAY_PROGRAM_COST')
  assert(report.title  === 'Spray Program Cost Report',    'envelope title')
  assert(report.metadata?.reportKind === REPORT_TYPE.SPRAY_PROGRAM_COST,
    'metadata.reportKind matches')
  assert(report.metadata?.dateRange === 'Season 2026',     'metadata.dateRange passed through')
  assert(typeof report.metadata?.disclaimer === 'string'
      && /Read-only spray program cost summary/.test(report.metadata.disclaimer),
    'metadata.disclaimer present')
  assert(Array.isArray(report.metadata?.notices), 'metadata.notices is an array')
  assert(report.metadata?.printExtras && typeof report.metadata.printExtras === 'object',
    'metadata.printExtras present')

  // Totals.
  const t = report.metadata.totals
  assert(t.programsReviewed === 2,        'programsReviewed = 2')
  assert(t.plannedItems === 7,            'plannedItems = 7', t.plannedItems)
  assert(t.estimatedItems === 2,          'estimatedItems = 2', t.estimatedItems)
  // 8.50 + 13.81 = 22.31
  assert(Math.abs(t.estimatedTotal - 22.31) < 1e-9,
    'estimatedTotal sums rounded item estimates', t.estimatedTotal)
  // The cost-helper treats invalid inventory cost (inv-4 cost=0) as
  // a missing cost basis from the planned-item perspective, so i3 +
  // i6 + i7 → 3.
  assert(t.missingCostBasis === 3,        'missingCostBasis = 3 (i3 + i6 + i7)', t.missingCostBasis)
  assert(t.missingQuantity === 1,         'missingQuantity = 1 (i4)',  t.missingQuantity)
  assert(t.notComparableUnits === 1,      'notComparableUnits = 1 (i5)', t.notComparableUnits)
  // Inventory-side counter: inv-4 has costPerUnit=0 → invalid-cost.
  assert(t.invalidCost === 1,             'invalidCost = 1 (inv-4)', t.invalidCost)
  // affectedPlannedItems = every non-ready planned item from the
  // cost-basis review: i3 (missing-cost-per-unit), i5 (missing-unit
  // on inv-3), i6 (missing-inventory-item), i7 (invalid-cost on
  // inv-4). Total = 4. (i4 has a ready inv-1; its issue is
  // missing-quantity which is a cost-helper status only.)
  assert(t.affectedPlannedItems === 4,    'affectedPlannedItems = 4', t.affectedPlannedItems)
}

// ── 3. Section structure ──────────────────────────────────────────────────
console.log('— report sections')
{
  const report = buildSprayProgramCostReport({
    programs: [{ id: 'p1', name: 'X', programType: 'greens', seasonYear: 2026, status: 'active' }],
    itemsByProgramId: {
      p1: [
        { id: 'i1', productName: 'A', inventoryItemId: 'inv-1', rateValue: 1, rateUnit: 'oz', status: 'planned' },
      ],
    },
    inventoryProducts: [
      { id: 'inv-1', name: 'A', unit: 'oz', costPerUnit: 5 },
    ],
    options: { now: 0 },
  })
  const ids = report.sections.map(s => s.id)
  for (const expected of [
    'overview', 'program-cost-summary', 'estimated-items',
    'cost-basis-gaps', 'not-estimated-items',
  ]) {
    assert(ids.includes(expected), `section "${expected}" is present`)
  }
  // Overview is fields, the rest are tables.
  const overview = report.sections.find(s => s.id === 'overview')
  assert(overview && overview.type === SECTION_TYPE.FIELDS, 'overview is fields type')
  for (const id of ['program-cost-summary','estimated-items','cost-basis-gaps','not-estimated-items']) {
    const sec = report.sections.find(s => s.id === id)
    assert(sec && sec.type === SECTION_TYPE.TABLE && Array.isArray(sec.data?.columns) && Array.isArray(sec.data?.rows),
      `section "${id}" is a table with columns + rows`)
  }
}

// ── 4. summarizeProgramCostForReport + summarizeCostBasisIssuesForReport ──
console.log('— support summarizers')
{
  const inv = [{ id: 'inv-1', unit: 'oz', costPerUnit: 5 }]
  const program = { id: 'p1', name: 'X' }
  const items = [
    { id: 'i1', productName: 'A', inventoryItemId: 'inv-1', rateValue: 1, rateUnit: 'oz' },
  ]
  const roll = summarizeProgramCostForReport(program, items, { inventoryProducts: inv })
  assert(roll.program === program,                   'returns the program reference')
  assert(roll.summary?.estimatedItems === 1,         'summary.estimatedItems = 1')
  assert(roll.perItem.length === 1,                  'perItem has one row')
  assert(roll.perItem[0].estimate.status === 'estimated', 'perItem row is estimated')

  const issues = summarizeCostBasisIssuesForReport({
    inventoryIssues: [
      {
        inventoryItemId: 'inv-2', inventoryName: 'B',
        status: 'missing-cost-per-unit',
        affectedProgramItems: [
          { programName: 'X', productName: 'A' },
          { programName: 'X', productName: 'B' },
        ],
      },
    ],
  })
  assert(issues.length === 1, 'one gap row')
  assert(issues[0].affectedCount === 2, 'affectedCount = 2')
  assert(/X · A \| X · B/.test(issues[0].affectedSummary),
    'affectedSummary joins program · product pairs')

  // Defensive null.
  assert(summarizeCostBasisIssuesForReport(null).length === 0,
    'null review → no gap rows')
}

// ── 5. Registry integration ───────────────────────────────────────────────
console.log('— reportDefs registry')
{
  const def = REPORT_DEFS.find(d => d.id === 'spray-program-cost')
  assert(!!def,                                      'reportDefs contains spray-program-cost')
  assert(def.module === REPORT_MODULE.SPRAY,         'def.module = SPRAY')
  assert(typeof def.title === 'string' && def.title.length > 0, 'def.title present')
  assert(typeof def.desc === 'string' && def.desc.length > 0,   'def.desc present')

  // requires must list programs + itemsByProgramId + inventoryProducts.
  const req = def.requires
  assert(Array.isArray(req) && req.includes('programs'),
    'def.requires includes "programs"')
  assert(req.includes('itemsByProgramId'),
    'def.requires includes "itemsByProgramId"')
  assert(req.includes('inventoryProducts'),
    'def.requires includes "inventoryProducts"')

  // build() must run and produce a SPRAY_PROGRAM_COST envelope when
  // given a non-empty bundle.
  const built = def.build({
    programs: [{ id: 'p1', name: 'P', programType: 'greens', seasonYear: 2026, status: 'active' }],
    itemsByProgramId: { p1: [] },
    inventoryProducts: [],
  })
  assert(built && built.type === REPORT_TYPE.SPRAY_PROGRAM_COST,
    'def.build produces a SPRAY_PROGRAM_COST envelope')
}

// ── 6. reportSchemas constant ─────────────────────────────────────────────
console.log('— REPORT_TYPE.SPRAY_PROGRAM_COST exposed')
{
  assert(REPORT_TYPE.SPRAY_PROGRAM_COST === 'spray-program-cost',
    'REPORT_TYPE.SPRAY_PROGRAM_COST stable string')
}

// ── 7. Spray-save / forbidden-write invariants ────────────────────────────
console.log('— spray save payload + forbidden-write invariants')
{
  // Phase 7F.4 /completed-link route remains the sole write site for
  // linkedSprayRecordId; confirm regression guard still holds.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // Phase 7F.4 spray-save payload remains unchanged: no cost / budget /
  // invoice / ledger keys leaked into the program / item store payload
  // composition.
  const plannerCodeOnly = planner
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const word of ['estimatedCost', 'budgetEntry', 'invoiceId', 'ledgerId']) {
    assert(!new RegExp(`\\b${word}\\b`).test(plannerCodeOnly),
      `sprayProgramStore never references ${word}`)
  }

  // The new builder must not have introduced any direct fetch / POST /
  // PATCH / DELETE site.
  const builder = readFileSync('src/utils/reports/builders/sprayProgramCostReport.js', 'utf8')
  assert(!/\/api\/inventory\b/.test(builder),         'builder never references /api/inventory')
  assert(!/\/api\/product-catalog\b/.test(builder),   'builder never references /api/product-catalog')
  assert(!/\/api\/budget\b|\/api\/invoices?\b|\/api\/ledger\b/.test(builder),
    'builder never references budget/invoice/ledger routes')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
