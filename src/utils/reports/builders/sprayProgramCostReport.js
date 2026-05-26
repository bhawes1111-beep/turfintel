// Phase 7I (3/?) — Spray Program Cost Report Builder Foundation.
//
// Read-only cost-awareness rollup that reuses the Phase 7I.1 cost
// helper (programCostAwareness) and the Phase 7I.2 stewardship helper
// (costBasisReview). No parallel cost logic, no fetch, no React, no
// store imports, no mutation. Custom previews and PDF/export polish
// land in later commits — this commit only registers the report type
// and produces the normalized envelope.
//
// Strict invariants:
//   - PURE: no React, no fetch, no store imports, no mutation.
//   - Inputs are read only; the envelope is freshly constructed.
//   - Missing data is COUNTED, never guessed.
//   - No recommendations / "should / correct / pass / fail" vocabulary.
//   - Never writes inventory_items, spray_records, or product_catalog.
//   - Never creates budget entries / invoices / ledger rows.
//
// Registry-side build({ bundle }) gives us:
//   programs            spray_programs rows (camelCase)
//   itemsByProgramId    { [program.id]: items[] }  (lazy-loaded per program)
//   inventoryProducts   inventoryStore items[] (used as cost basis)
//   dateRange?          string passed through verbatim
//
// Programs without cached items are surfaced via the
// `programsMissingItemCache` notice rather than silently dropped.

import {
  REPORT_MODULE, REPORT_TYPE, SECTION_TYPE,
  createReport, createSection,
} from '../reportSchemas.js'
import {
  estimateProgramItemCost,
  buildProgramCostSummary,
  buildProgramCostSummaries,
  formatEstimatedCost,
} from '../../sprayPrograms/programCostAwareness.js'
import {
  buildCostBasisReview,
} from '../../sprayPrograms/costBasisReview.js'

const DISCLAIMER = [
  'Read-only spray program cost summary.',
  'Based on planned program items and inventory cost basis.',
  'This report does not create budget entries.',
  'Missing cost basis means no usable inventory cost is available.',
  'Inventory is not deducted from planned items.',
].join(' ')

// ── Per-program rollup ────────────────────────────────────────────────────

/**
 * Roll up one program's cost picture for the report. Delegates the cost
 * math to programCostAwareness — this function only shapes the result
 * for the report's table sections.
 *
 * @param {Object} program
 * @param {Array}  items
 * @param {Object} [context]   { inventoryProducts }
 * @returns {{
 *   program: Object,
 *   summary: ReturnType<typeof buildProgramCostSummary>,
 *   perItem: Array<{ item, estimate }>,
 * }}
 */
export function summarizeProgramCostForReport(program, items = [], context = {}) {
  if (!program) {
    return { program: null, summary: null, perItem: [] }
  }
  const realItems = Array.isArray(items) ? items : []
  const summary = buildProgramCostSummary(program, realItems, context)
  const perItem = realItems.map(item => ({
    item,
    estimate: estimateProgramItemCost(item, context),
  }))
  return { program, summary, perItem }
}

/**
 * Reshape a cost-basis review (Phase 7I.2) into the rows the Cost Basis
 * Gaps section renders. Read-only; produces fresh arrays.
 *
 * @param {ReturnType<typeof buildCostBasisReview>} review
 * @returns {Array<{
 *   inventoryItemId: string|null, inventoryName: string|null,
 *   status: string, affectedCount: number,
 *   affectedSummary: string,
 * }>}
 */
export function summarizeCostBasisIssuesForReport(review) {
  const issues = review?.inventoryIssues
  if (!Array.isArray(issues) || issues.length === 0) return []
  return issues.map(i => ({
    inventoryItemId: i.inventoryItemId ?? null,
    inventoryName:   i.inventoryName ?? null,
    status:          i.status,
    affectedCount:   Array.isArray(i.affectedProgramItems) ? i.affectedProgramItems.length : 0,
    affectedSummary: Array.isArray(i.affectedProgramItems)
      ? i.affectedProgramItems
          .map(a => `${a.programName ?? '—'} · ${a.productName ?? '—'}`)
          .join(' | ')
      : '',
  }))
}

// ── Section builders ──────────────────────────────────────────────────────

/**
 * Build the typed report sections from the assembled summary. Exposed
 * so smoke + future renderers can re-emit just the sections.
 */
export function buildSprayProgramCostReportSections(summary) {
  const sections = []

  // ── Overview ─────────────────────────────────────────────────────────
  sections.push(withId('overview', createSection({
    title: 'Overview',
    type:  SECTION_TYPE.FIELDS,
    data: {
      'Programs reviewed':       summary.totals.programsReviewed,
      'Planned items':           summary.totals.plannedItems,
      'Estimated items':         summary.totals.estimatedItems,
      'Estimated total':         formatEstimatedCost(summary.totals.estimatedTotal, summary.currency),
      'Missing cost basis':      summary.totals.missingCostBasis,
      'Missing quantity':        summary.totals.missingQuantity,
      'Unit mismatch':           summary.totals.notComparableUnits,
      'Invalid inventory cost':  summary.totals.invalidCost,
      'Affected planned items':  summary.totals.affectedPlannedItems,
      'Date range':              summary.dateRange ?? '—',
      'Disclaimer':              DISCLAIMER,
    },
  })))

  // ── Program Cost Summary ─────────────────────────────────────────────
  const programRows = summary.perProgram.map(p => [
    p.program.name ?? '—',
    p.program.seasonYear ?? '—',
    p.program.programType ?? '—',
    p.program.status ?? '—',
    formatEstimatedCost(p.summary?.estimatedTotal ?? 0, summary.currency),
    p.summary?.estimatedItems ?? 0,
    p.summary?.missingCostBasis ?? 0,
    p.summary?.missingQuantity ?? 0,
    p.summary?.notComparableUnits ?? 0,
  ])
  sections.push(withId('program-cost-summary', createSection({
    title: 'Program Cost Summary',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: [
        'Program', 'Season', 'Type', 'Status',
        'Estimated total', 'Estimated items',
        'Missing basis', 'Missing quantity', 'Unit mismatch',
      ],
      rows: programRows.length > 0
        ? programRows
        : [['No programs in the report range.', '—', '—', '—', '—', 0, 0, 0, 0]],
    },
  })))

  // ── Estimated Items ──────────────────────────────────────────────────
  const estimatedRows = []
  for (const p of summary.perProgram) {
    for (const it of p.perItem) {
      if (it.estimate?.status !== 'estimated') continue
      const inv = resolveInventoryRow(it.item, summary.inventoryProducts)
      estimatedRows.push([
        p.program.name ?? '—',
        it.item.productName ?? '—',
        inv?.name ?? '—',
        `${it.item.rateValue ?? '—'} ${it.item.rateUnit ?? ''}`.trim(),
        formatInventoryUnitCost(inv, summary.currency),
        formatEstimatedCost(it.estimate.estimatedCost, summary.currency),
      ])
    }
  }
  sections.push(withId('estimated-items', createSection({
    title: 'Estimated Items',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: [
        'Program', 'Planned product', 'Inventory item',
        'Rate', 'Unit cost basis', 'Estimated cost',
      ],
      rows: estimatedRows.length > 0
        ? estimatedRows
        : [['No estimated items in the report range.', '—', '—', '—', '—', '—']],
    },
  })))

  // ── Cost Basis Gaps ──────────────────────────────────────────────────
  const gapRows = summary.costBasisIssues.map(g => [
    g.inventoryName ?? '—',
    g.status,
    g.affectedCount,
    g.affectedSummary || '—',
  ])
  sections.push(withId('cost-basis-gaps', createSection({
    title: 'Cost Basis Gaps',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Inventory item', 'Issue', 'Affected planned items', 'Affected programs / items'],
      rows: gapRows.length > 0
        ? gapRows
        : [['No cost basis gaps.', '—', 0, '—']],
    },
  })))

  // ── Not Estimated Items ──────────────────────────────────────────────
  const notEstRows = []
  for (const p of summary.perProgram) {
    for (const it of p.perItem) {
      if (it.estimate?.status === 'estimated') continue
      notEstRows.push([
        p.program.name ?? '—',
        it.item.productName ?? '—',
        labelForCostStatus(it.estimate?.status),
        it.estimate?.message ?? '—',
      ])
    }
  }
  sections.push(withId('not-estimated-items', createSection({
    title: 'Not Estimated Items',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Program', 'Planned product', 'Reason', 'Message'],
      rows: notEstRows.length > 0
        ? notEstRows
        : [['No items are missing an estimate.', '—', '—', '—']],
    },
  })))

  return sections
}

// createSection() (Phase 2.x schema) keeps only { title, type, data }.
// We carry an explicit, stable section id alongside so the report
// envelope matches the Phase 7I.3 spec without changing the shared
// schema function.
function withId(id, section) {
  return { ...section, id }
}

function labelForCostStatus(status) {
  switch (status) {
    case 'estimated':            return 'Estimated'
    case 'missing-cost-basis':   return 'Missing cost basis'
    case 'missing-quantity':     return 'Missing quantity'
    case 'not-comparable-unit':  return 'Unit mismatch'
    default:                     return status ?? '—'
  }
}

function resolveInventoryRow(item, inventoryProducts) {
  const id = item?.inventoryItemId
  if (!id) return null
  if (!Array.isArray(inventoryProducts)) return null
  return inventoryProducts.find(i => i?.id === id) ?? null
}

function inventoryUnitCostValue(inv) {
  if (!inv) return null
  for (const v of [inv.costPerUnit, inv.unitCost, inv.pricePerUnit]) {
    if (v != null && Number.isFinite(Number(v))) {
      const n = Number(v)
      if (n > 0) return n
    }
  }
  return null
}
function formatInventoryUnitCost(inv, currency) {
  const v = inventoryUnitCostValue(inv)
  if (v == null) return '—'
  const unit = inv?.unit ? ` / ${inv.unit}` : ''
  return `${formatEstimatedCost(v, currency)}${unit}`
}

// ── Notices ───────────────────────────────────────────────────────────────

function buildCostNotices(summary) {
  const out = []
  const t = summary.totals

  if (t.programsReviewed === 0) {
    out.push({ type: 'info', label: 'No programs',
      value: 'No spray programs are in the report range.' })
    return out
  }

  out.push({ type: 'info', label: 'Programs reviewed',
    value: `${t.programsReviewed} program${t.programsReviewed !== 1 ? 's' : ''} reviewed` })

  if (t.estimatedItems > 0) {
    out.push({ type: 'info', label: 'Estimated items',
      value: `${t.estimatedItems} planned item${t.estimatedItems !== 1 ? 's' : ''} estimated · total ${formatEstimatedCost(t.estimatedTotal, summary.currency)}` })
  }

  if (t.missingCostBasis > 0) {
    out.push({ type: 'warning', label: 'Missing cost basis',
      value: `${t.missingCostBasis} planned item${t.missingCostBasis !== 1 ? 's' : ''} could not be estimated (no inventory cost basis)` })
  }

  if (t.missingQuantity > 0) {
    out.push({ type: 'warning', label: 'Missing quantity',
      value: `${t.missingQuantity} planned item${t.missingQuantity !== 1 ? 's' : ''} have no planned rate value` })
  }

  if (t.notComparableUnits > 0) {
    out.push({ type: 'warning', label: 'Unit mismatch',
      value: `${t.notComparableUnits} planned item${t.notComparableUnits !== 1 ? 's' : ''} have rate units that do not match inventory units` })
  }

  if (t.invalidCost > 0) {
    out.push({ type: 'warning', label: 'Invalid inventory cost',
      value: `${t.invalidCost} inventory item${t.invalidCost !== 1 ? 's' : ''} have a non-positive or non-numeric cost value` })
  }

  if (summary.programsMissingItemCache > 0) {
    out.push({ type: 'info', label: 'Items not loaded',
      value: `${summary.programsMissingItemCache} program${summary.programsMissingItemCache !== 1 ? 's' : ''} have items not yet loaded; their planned items are not reflected in the cost tables.` })
  }

  return out
}

// ── Top-level builder ─────────────────────────────────────────────────────

/**
 * Build the Spray Program Cost report from already-loaded planner data.
 *
 * @param {Object}   input
 * @param {Object[]} input.programs
 * @param {Object}   input.itemsByProgramId   { progId: items[] }
 * @param {Object[]} [input.inventoryProducts]
 * @param {string}   [input.dateRange]
 * @param {Object}   [input.options]
 * @param {number}   [input.options.now]      epoch ms (for deterministic tests)
 * @returns {Object} TurfReport envelope
 */
export function buildSprayProgramCostReport(input = {}) {
  const programs         = Array.isArray(input.programs)         ? input.programs         : []
  const itemsByProgramId = (input.itemsByProgramId && typeof input.itemsByProgramId === 'object')
    ? input.itemsByProgramId : {}
  const inventoryProducts = Array.isArray(input.inventoryProducts) ? input.inventoryProducts : []
  const dateRange        = input.dateRange ?? null
  const options          = input.options ?? {}
  const now              = typeof options.now === 'number' ? options.now : Date.now()

  const context = { inventoryProducts }

  // Per-program rollups; track programs whose items aren't cached.
  const perProgram = []
  let programsMissingItemCache = 0
  for (const program of programs) {
    if (!program) continue
    const items = itemsByProgramId[program.id]
    if (items === undefined) programsMissingItemCache++
    const itemList = Array.isArray(items) ? items : []
    const rollup = summarizeProgramCostForReport(program, itemList, context)
    if (rollup) perProgram.push(rollup)
  }

  // Aggregate the cost summaries via the existing helper so totals are
  // identical to what the Program Planner UI surfaces.
  const programSummaries = buildProgramCostSummaries(programs, itemsByProgramId, context)
  let estimatedTotal      = 0
  let estimatedItems      = 0
  let plannedItems        = 0
  let missingCostBasis    = 0
  let missingQuantity     = 0
  let notComparableUnits  = 0
  for (const s of programSummaries) {
    estimatedTotal     += s.estimatedTotal
    estimatedItems     += s.estimatedItems
    plannedItems       += s.totalItems
    missingCostBasis   += s.missingCostBasis
    missingQuantity    += s.missingQuantity
    notComparableUnits += s.notComparableUnits
  }
  estimatedTotal = Math.round(estimatedTotal * 100) / 100

  // Cost basis review is a single workspace-wide pass.
  const review = buildCostBasisReview(programs, itemsByProgramId, inventoryProducts)
  const costBasisIssues = summarizeCostBasisIssuesForReport(review)

  const summary = {
    dateRange,
    currency: 'USD',
    perProgram,
    inventoryProducts,
    costBasisIssues,
    programsMissingItemCache,
    totals: {
      programsReviewed:     perProgram.length,
      plannedItems,
      estimatedItems,
      estimatedTotal,
      missingCostBasis,
      missingQuantity,
      notComparableUnits,
      invalidCost:          review.totals.invalidCost,
      affectedPlannedItems: review.totals.affectedPlannedItems,
    },
  }

  const notices  = buildCostNotices(summary)
  const sections = buildSprayProgramCostReportSections(summary)
  const generatedAt = new Date(now).toISOString()

  const metadata = {
    exportVersion: 1,
    reportKind:    REPORT_TYPE.SPRAY_PROGRAM_COST,
    generatedBy:   'TurfIntel',
    generatedAt,
    dateRange,

    totals:        summary.totals,
    notices,
    disclaimer:    DISCLAIMER,

    printExtras: {
      subtitle: 'Read-only spray program cost summary',
      summary: [
        ['Programs reviewed',       summary.totals.programsReviewed],
        ['Planned items',           summary.totals.plannedItems],
        ['Estimated items',         summary.totals.estimatedItems],
        ['Estimated total',         formatEstimatedCost(summary.totals.estimatedTotal, summary.currency)],
        ['Missing cost basis',      summary.totals.missingCostBasis],
        ['Missing quantity',        summary.totals.missingQuantity],
        ['Unit mismatch',           summary.totals.notComparableUnits],
        ['Invalid inventory cost',  summary.totals.invalidCost],
        ['Affected planned items',  summary.totals.affectedPlannedItems],
      ],
      notices,
      disclaimer:  DISCLAIMER,
      footerLeft:  'TurfIntel · Spray Program Cost',
      footerRight: `Generated ${generatedAt}`,
    },
  }

  return createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_PROGRAM_COST,
    title:         'Spray Program Cost Report',
    sections,
    metadata,
  })
}
