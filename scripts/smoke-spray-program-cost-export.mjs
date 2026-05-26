// Phase 7I (5/?) — Spray Program Cost print/export polish smoke.
//
//   node scripts/smoke-spray-program-cost-export.mjs
//
// Locks the print + JSON-export polish invariants:
//   - builder envelope carries every stable export metadata key
//     (exportVersion, reportKind, generatedBy, generatedAt, dateRange,
//      totals, notices, disclaimer)
//   - builder emits the spec'd metadata.printExtras object with all
//     8 summary pairs in the right order
//   - the Estimated total summary value is formatted as a currency
//     string (not a raw number)
//   - buildPrintDocument renders this report's printExtras (subtitle,
//     summary tiles, notices, disclaimer, footer) and a generic
//     report with no printExtras stays unchanged
//   - reportToJSON round-trips cleanly (functions / undefined /
//     symbols / Date / circulars / React-elementish all sanitized)
//   - no custom PDF pipeline added (the Phase 7E.3 path is reused)
//   - no budget / invoice / ledger / completed-spray / inventory-
//     deduction write call added
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary added
//   - spray save payload (sprayProgramStore) carries no cost / budget
//     / invoice / ledger keys
//   - Phase 7F.4 /completed-link route still wired

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Builder envelope — stable export metadata + printExtras ───────────
console.log('— Spray Program Cost envelope: export metadata')
{
  const mod = await import('../src/utils/reports/builders/sprayProgramCostReport.js')

  // A small but representative fixture so estimatedTotal is non-zero
  // and the print summary actually carries a formatted currency value.
  const inv = [
    { id: 'inv-1', name: 'Daconil', unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
  ]
  const programs = [
    { id: 'p1', name: 'Greens', programType: 'greens', seasonYear: 2026, status: 'active' },
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',   inventoryItemId: 'inv-1', rateValue: 2,    rateUnit: 'oz/1000 sq ft', status: 'planned' },
      { id: 'i2', productName: 'Daconil 2', inventoryItemId: 'inv-1', rateValue: 3.25, rateUnit: 'oz/1000 sq ft', status: 'planned' },
    ],
  }
  const report = mod.buildSprayProgramCostReport({
    programs, itemsByProgramId, inventoryProducts: inv,
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  // Stable identification + versioning keys.
  assert(report.metadata.exportVersion === 1,
    'metadata.exportVersion === 1')
  assert(report.metadata.reportKind === 'spray-program-cost',
    "metadata.reportKind === 'spray-program-cost'")
  assert(report.metadata.generatedBy === 'TurfIntel',
    "metadata.generatedBy === 'TurfIntel'")
  assert(typeof report.metadata.generatedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(report.metadata.generatedAt),
    'metadata.generatedAt is an ISO date string')
  assert(report.metadata.dateRange === 'May–June 2026',
    'metadata.dateRange round-trips')

  // Content surfaces still present.
  for (const key of ['totals', 'notices', 'disclaimer']) {
    assert(key in report.metadata, `metadata.${key} present`)
  }
  assert(typeof report.metadata.disclaimer === 'string',
    'metadata.disclaimer is a string')
  for (const phrase of [
    'Read-only spray program cost summary.',
    'Based on planned program items and inventory cost basis.',
    'This report does not create budget entries.',
    'Missing cost basis means no usable inventory cost is available.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(report.metadata.disclaimer.includes(phrase),
      `metadata.disclaimer carries phrase: "${phrase}"`)
  }

  // printExtras opt-in object.
  const px = report.metadata.printExtras
  assert(px && typeof px === 'object', 'metadata.printExtras present')
  assert(typeof px.subtitle === 'string' && px.subtitle === 'Read-only spray program cost summary',
    'printExtras.subtitle = "Read-only spray program cost summary"')

  // Exactly the 8 spec'd summary pairs in declared order.
  assert(Array.isArray(px.summary) && px.summary.length === 8,
    'printExtras.summary is an 8-pair array',
    px.summary?.length)
  const expectedOrder = [
    'Programs reviewed', 'Planned items', 'Estimated items', 'Estimated total',
    'Missing cost basis', 'Missing quantity', 'Unit mismatch', 'Invalid cost',
  ]
  for (let i = 0; i < expectedOrder.length; i++) {
    assert(px.summary[i]?.[0] === expectedOrder[i],
      `printExtras.summary[${i}] label === "${expectedOrder[i]}"`,
      px.summary[i])
  }

  // Estimated total is currency-formatted (string).
  const estIdx = expectedOrder.indexOf('Estimated total')
  const estPair = px.summary[estIdx]
  assert(typeof estPair[1] === 'string' && /\$|USD/.test(estPair[1]),
    'printExtras.summary "Estimated total" value is a currency-formatted string',
    estPair)
  assert(/22\.31/.test(estPair[1]),
    'printExtras.summary "Estimated total" = $22.31 (= 4.25*2 + 4.25*3.25 rounded)')

  // The other 7 pairs are numbers.
  for (let i = 0; i < 8; i++) {
    if (i === estIdx) continue
    assert(typeof px.summary[i][1] === 'number',
      `printExtras.summary[${i}] "${px.summary[i][0]}" value is numeric`,
      px.summary[i])
  }

  // Notices + disclaimer + footers.
  assert(Array.isArray(px.notices),
    'printExtras.notices is an array')
  assert(typeof px.disclaimer === 'string' &&
    /Read-only spray program cost summary/.test(px.disclaimer),
    'printExtras.disclaimer carries the stewardship copy')
  assert(px.footerLeft === 'TurfIntel · Spray Program Cost',
    'printExtras.footerLeft = "TurfIntel · Spray Program Cost"')
  assert(typeof px.footerRight === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(px.footerRight),
    'printExtras.footerRight is the generatedAt ISO string')

  // No functions / DOM refs / React-elementish in any leaf.
  function isClean(v) {
    if (v === null) return true
    if (Array.isArray(v)) return v.every(isClean)
    if (typeof v === 'object') {
      if (v.$$typeof !== undefined) return false
      return Object.values(v).every(isClean)
    }
    return ['string', 'number', 'boolean'].includes(typeof v)
  }
  assert(isClean(px),
    'printExtras leaves are all JSON-safe (no functions / Reactish / DOM)')

  // totals — guard the full set of cost counters surfaced to the
  // export contract.
  for (const key of [
    'programsReviewed', 'plannedItems', 'estimatedItems',
    'estimatedTotal',   'missingCostBasis', 'missingQuantity',
    'notComparableUnits', 'invalidCost', 'affectedPlannedItems',
  ]) {
    assert(key in report.metadata.totals,
      `metadata.totals.${key} present`)
  }
}

// ── 2. buildPrintDocument output ──────────────────────────────────────────
console.log('— buildPrintDocument renders Spray Program Cost printExtras')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')
  const mod = await import('../src/utils/reports/builders/sprayProgramCostReport.js')

  const inv = [
    { id: 'inv-1', name: 'Daconil', unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
  ]
  const report = mod.buildSprayProgramCostReport({
    programs: [{ id: 'p1', name: 'Greens', programType: 'greens', seasonYear: 2026, status: 'active' }],
    itemsByProgramId: { p1: [
      { id: 'i1', productName: 'Daconil', inventoryItemId: 'inv-1', rateValue: 2, rateUnit: 'oz/1000 sq ft', status: 'planned' },
    ]},
    inventoryProducts: inv,
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  const html = fmt.buildPrintDocument(report,
    { name: 'Springfield CC', superintendent: 'A. Steward' })

  // Top-level pieces.
  assert(/<title>Spray Program Cost Report<\/title>/.test(html),
    'print HTML <title> is the report title')
  assert(/Springfield CC/.test(html) && /A. Steward/.test(html),
    'print HTML includes course branding')
  assert(/report-subtitle/.test(html) &&
    /Read-only spray program cost summary/.test(html),
    'print HTML carries the subtitle')
  assert(/Date range: May–June 2026/.test(html),
    'print HTML carries the date range')

  // Summary tile block — rendered as a section.
  assert(/<div class="[^"]*\bsummary-section\b/.test(html),
    'print HTML renders the summary tile block')
  for (const label of [
    'Programs reviewed', 'Planned items', 'Estimated items', 'Estimated total',
    'Missing cost basis', 'Missing quantity', 'Unit mismatch', 'Invalid cost',
  ]) {
    assert(html.includes(label),
      `summary tile label "${label}" present in print HTML`)
  }
  // The Estimated total tile renders the formatted currency string.
  assert(/\$8\.50/.test(html),
    'print HTML renders "$8.50" (= 4.25 * 2) for Estimated total tile')

  // All five report sections present in the body.
  for (const sectionTitle of [
    'Overview', 'Program Cost Summary', 'Estimated Items',
    'Cost Basis Gaps', 'Not Estimated Items',
  ]) {
    assert(html.includes(sectionTitle),
      `print HTML renders section "${sectionTitle}"`)
  }

  // Notices + disclaimer.
  assert(/<div class="[^"]*\bnotices-section\b/.test(html),
    'print HTML renders the notices block')
  assert(/<div class="[^"]*\bdisclaimer-section\b/.test(html),
    'print HTML renders the disclaimer block')
  for (const phrase of [
    'Read-only spray program cost summary.',
    'Based on planned program items and inventory cost basis.',
    'This report does not create budget entries.',
    'Missing cost basis means no usable inventory cost is available.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(html.includes(phrase),
      `print HTML disclaimer carries phrase: "${phrase}"`)
  }

  // Footer per printExtras.
  assert(/report-footer/.test(html),
    'print HTML has report-footer')
  assert(/TurfIntel · Spray Program Cost/.test(html),
    'print HTML footer-left = "TurfIntel · Spray Program Cost"')
  assert(/2026-05-26T12:00:00\.000Z/.test(html),
    'print HTML footer-right = generatedAt ISO timestamp')

  // Print CSS hardening (generic, but reasserted as a guard).
  assert(/@media print/.test(html),
    'print HTML has @media print rule')
  assert(/background:\s*#fff/.test(html),
    'print HTML forces white background')
  assert(/page-break-inside:\s*avoid/.test(html) ||
         /break-inside:\s*avoid/.test(html),
    'print HTML has break-inside: avoid (cards don\'t split)')
  assert(/button[\s,]*\.rpActions[\s\S]*?display:\s*none/.test(html),
    'print HTML hides any captured buttons / action strips')

  // HTML escaping — defensive injection check.
  const evil = mod.buildSprayProgramCostReport({
    programs: [], itemsByProgramId: {}, inventoryProducts: [],
    dateRange: '<script>alert(1)</script>',
    options: { now: 0 },
  })
  const evilHtml = fmt.buildPrintDocument(evil, {})
  assert(!/<script>alert/i.test(evilHtml),
    'print HTML escapes injected <script> in dateRange')
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(evilHtml),
    'print HTML carries the escaped entities for the injection')

  // Generic reports without printExtras get the OLD output.
  const plainHtml = fmt.buildPrintDocument({
    id: 'rpt-plain', title: 'Plain Report', module: 'equipment',
    type: 'maintenance-summary',
    createdAt: '2026-05-26T12:00:00Z',
    sections: [
      { title: 'Summary', type: 'fields', data: { 'Count': 1 } },
    ],
    metadata: {},
  }, {})
  assert(!/<div class="[^"]*\bsummary-section\b/.test(plainHtml),
    'reports without printExtras → no <div .summary-section>')
  assert(!/<div class="[^"]*\bnotices-section\b/.test(plainHtml),
    'reports without printExtras → no <div .notices-section>')
  assert(!/<div class="[^"]*\bdisclaimer-section\b/.test(plainHtml),
    'reports without printExtras → no <div .disclaimer-section>')
  assert(/TurfIntel Pro/.test(plainHtml),
    'reports without printExtras → default footer label preserved')
}

// ── 3. reportToJSON round-trip ────────────────────────────────────────────
console.log('— reportToJSON round-trip on Spray Program Cost envelope')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')
  const mod = await import('../src/utils/reports/builders/sprayProgramCostReport.js')

  const inv = [
    { id: 'inv-1', name: 'Daconil', unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
  ]
  const report = mod.buildSprayProgramCostReport({
    programs: [{ id: 'p1', name: 'Greens', programType: 'greens', seasonYear: 2026, status: 'active' }],
    itemsByProgramId: { p1: [
      { id: 'i1', productName: 'Daconil', inventoryItemId: 'inv-1', rateValue: 2, rateUnit: 'oz/1000 sq ft', status: 'planned' },
    ]},
    inventoryProducts: inv,
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  const json   = fmt.reportToJSON(report)
  const parsed = JSON.parse(json)

  for (const key of [
    'exportVersion', 'reportKind', 'generatedBy', 'generatedAt',
    'dateRange', 'totals', 'notices', 'disclaimer', 'printExtras',
  ]) {
    assert(key in parsed.metadata,
      `JSON export has metadata.${key}`)
  }
  assert(Array.isArray(parsed.metadata.printExtras?.summary) &&
    parsed.metadata.printExtras.summary.length === 8,
    'JSON round-trip preserves 8 summary pairs')
  // No raw store arrays bleed through.
  assert(!('programs' in parsed) && !('itemsByProgramId' in parsed) &&
         !('inventoryProducts' in parsed),
    'raw store arrays NOT included in JSON export')

  // Functions / DOM / React-elementish all sanitized — re-assert by
  // injecting a hostile metadata fixture through the same sanitizer.
  const circ = { kind: 'circular' }; circ.self = circ
  const hostile = {
    id: 'rpt-hostile', title: 'Hostile', createdAt: '2026-05-26T12:00:00Z',
    module: 'spray', type: 'spray-program-cost',
    sections: [],
    metadata: {
      exportVersion: 1,
      reportKind:    'spray-program-cost',
      func:          () => 'nope',
      undef:         undefined,
      sym:           Symbol('nope'),
      reactish:      { $$typeof: Symbol('react.element'), props: {} },
      whenDate:      new Date(0),
      circular:      circ,
    },
    attachments: [{ id: 'a1', filename: 'x.png', type: 'image', size: 10, thumbnailUrl: 'blob:abc' }],
  }
  const hostileJson = fmt.reportToJSON(hostile)
  const hostileParsed = JSON.parse(hostileJson)
  assert(!('func' in hostileParsed.metadata),         'functions sanitized out of JSON')
  assert(!('undef' in hostileParsed.metadata),        'undefined sanitized out of JSON')
  assert(!('sym' in hostileParsed.metadata),          'symbols sanitized out of JSON')
  assert(!('reactish' in hostileParsed.metadata),     'React-elementish sanitized out of JSON')
  assert(typeof hostileParsed.metadata.whenDate === 'string',
    'Date values become ISO strings in JSON')
  assert(hostileParsed.metadata.circular?.self === '[Circular]',
    'circular refs broken with "[Circular]" marker')
  assert(!('thumbnailUrl' in (hostileParsed.attachments?.[0] ?? {})),
    'attachments[].thumbnailUrl stripped from JSON')
}

// ── 4. Forbidden-write invariants across surfaces ─────────────────────────
console.log('— Phase 7F.4 + cost / budget / invoice / ledger regression guards')
{
  const builder = readFileSync('src/utils/reports/builders/sprayProgramCostReport.js', 'utf8')
  const codeOnly = builder
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // No PDF pipeline added (we reuse buildPrintDocument).
  assert(!/jspdf|jsPDF|pdfmake|html2pdf|puppeteer/i.test(codeOnly),
    'builder did not bring in a PDF library')

  // No write verbs.
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
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'builder code-only contains no write method strings')
  assert(!/\/api\/inventory\b/.test(codeOnly),       'builder never references /api/inventory')
  assert(!/\/api\/product-catalog\b/.test(codeOnly), 'builder never references /api/product-catalog')
  assert(!/\/api\/budget\b|\/api\/invoices?\b|\/api\/ledger\b/.test(codeOnly),
    'builder never references budget/invoice/ledger routes')

  // No recommendation / judgment vocabulary.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'budget entry created', 'invoice', 'ledger',
    'actual expense', 'spend authorization',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `builder code-only avoids "${word}"`)
  }

  // Phase 7F.4 /completed-link route still wired.
  const store = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(store),
    'Phase 7F.4 /completed-link route still present')

  // Spray save payload carries no cost / budget keys.
  const storeCodeOnly = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const word of ['estimatedCost', 'budgetEntry', 'invoiceId', 'ledgerId']) {
    assert(!new RegExp(`\\b${word}\\b`).test(storeCodeOnly),
      `sprayProgramStore never references ${word}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
