// Phase 7G (1/?) — Spray Program Report Builder Foundation.
//
// Read-only summary that rolls up the same primitives the live Program
// Planner UI uses: spray_programs + spray_program_items + linked
// spray_records, plus the Phase 7F.5 plan-vs-actual comparison helper.
//
// Strict invariants:
//   - PURE: no React, no fetch, no store imports, no mutation.
//   - Inputs are read only; the envelope is freshly constructed.
//   - Missing data is COUNTED, never guessed.
//   - No recommendations / "should / correct / pass / fail" vocabulary.
//   - Never writes spray_records, inventory_items, or product_catalog.
//   - Never auto-flips spray_program_items.status.
//   - The plan-vs-actual section is a direct re-emit of the existing
//     pure helper's neutral phrasing.
//
// Registry-side build({ bundle }) gives us:
//   programs            spray_programs rows (camelCase)
//   itemsByProgramId    { [program.id]: items[] }  (lazy-loaded per program)
//   sprays              spray_records rows
//   inventoryProducts / catalogProducts / labelsByItemId (intel context)
//   dateRange?          string passed through verbatim
//
// We rely on the planner having already fetched items for the
// programs the user cares about. Programs without cached items will
// appear in the program list but won't contribute rows to the
// plan-vs-actual / unlinked / stale tables — that's documented as a
// data assumption and surfaced via the `programsMissingItemCache`
// notice.

import {
  REPORT_MODULE, REPORT_TYPE, SECTION_TYPE,
  createReport, createSection,
} from '../reportSchemas.js'
import {
  buildPlanActualComparison,
} from '../../sprayPrograms/planActualComparison.js'

const DISCLAIMER = [
  'Read-only spray program summary.',
  'Based on planned program items and linked completed spray records.',
  'This report does not recommend treatments.',
  'Missing links mean planned items could not be compared to completed records.',
].join(' ')

// ── Per-item rollup ────────────────────────────────────────────────────────

/**
 * Resolve the comparison + linkage state for a single planned item.
 *
 * @param {Object} item                spray_program_items row
 * @param {Object} context
 * @param {Object} context.sprayById   id → spray_records row
 * @returns {{
 *   item,
 *   linkedSpray: Object|null,
 *   linkState: 'unlinked' | 'linked' | 'stale',
 *   comparison: ReturnType<typeof buildPlanActualComparison>|null,
 * }}
 */
export function summarizeProgramItemForReport(item, context = {}) {
  if (!item) {
    return { item: null, linkedSpray: null, linkState: 'unlinked', comparison: null }
  }
  const fk = item.linkedSprayRecordId ?? null
  if (!fk) {
    return { item, linkedSpray: null, linkState: 'unlinked', comparison: null }
  }
  const linkedSpray = (context.sprayById ?? {})[fk] ?? null
  if (!linkedSpray) {
    return { item, linkedSpray: null, linkState: 'stale', comparison: null }
  }
  return {
    item,
    linkedSpray,
    linkState: 'linked',
    comparison: buildPlanActualComparison(item, linkedSpray),
  }
}

// ── Per-program rollup ─────────────────────────────────────────────────────

/**
 * Roll up a program + its items into the per-program summary used by
 * the Program Summary section. Returns null when the program is
 * filtered out (we don't currently filter, but the shape is friendly
 * to a future date-range gate).
 */
export function summarizeProgramForReport(program, items = [], context = {}) {
  if (!program) return null
  const realItems = Array.isArray(items) ? items : []

  let linkedCount        = 0
  let staleCount         = 0
  let unlinkedCount      = 0
  let completedStatus    = 0
  let skippedStatus      = 0
  let canceledStatus     = 0
  let plannedStatus      = 0
  let planActualCompared = 0

  const perItem = []

  for (const item of realItems) {
    const summary = summarizeProgramItemForReport(item, context)
    if (summary.linkState === 'linked') linkedCount++
    else if (summary.linkState === 'stale') staleCount++
    else unlinkedCount++
    if (summary.comparison) planActualCompared++

    switch (item?.status) {
      case 'completed': completedStatus++; break
      case 'skipped':   skippedStatus++;   break
      case 'canceled':  canceledStatus++;  break
      case 'planned':   plannedStatus++;   break
      default: /* status missing — counted nowhere */ break
    }

    perItem.push(summary)
  }

  return {
    program,
    items:               realItems,
    perItem,
    totals: {
      plannedItems:        realItems.length,
      linkedCount,
      staleCount,
      unlinkedCount,
      planActualCompared,
      completedStatus,
      skippedStatus,
      canceledStatus,
      plannedStatus,
    },
  }
}

// ── Section builders ──────────────────────────────────────────────────────

/**
 * Build the typed report sections from the assembled summary.
 * Exposed so smoke + future renderers can re-emit just the sections.
 */
export function buildSprayProgramReportSections(summary) {
  const sections = []

  // ── Overview ─────────────────────────────────────────────────────────
  sections.push(createSection({
    title: 'Overview',
    type:  SECTION_TYPE.FIELDS,
    data: {
      'Programs reviewed':           summary.totals.programsReviewed,
      'Planned items':               summary.totals.plannedItems,
      'Linked completed items':      summary.totals.linkedCompletedItems,
      'Unlinked planned items':      summary.totals.unlinkedPlannedItems,
      'Completed status items':      summary.totals.completedStatusItems,
      'Skipped items':               summary.totals.skippedItems,
      'Canceled items':              summary.totals.canceledItems,
      'Plan-vs-Actual compared':     summary.totals.planActualComparedItems,
      'Missing or stale links':      summary.totals.missingActualLinks,
      'Date range':                  summary.dateRange ?? '—',
      'Disclaimer':                  DISCLAIMER,
    },
  }))

  // ── Program Summary ──────────────────────────────────────────────────
  // One row per reviewed program.
  const programRows = summary.perProgram.map(p => [
    p.program.name ?? '—',
    p.program.seasonYear ?? '—',
    p.program.programType ?? '—',
    p.program.status ?? '—',
    p.totals.plannedItems,
    p.totals.linkedCount,
  ])
  sections.push(createSection({
    title: 'Program Summary',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Program', 'Season', 'Type', 'Status', 'Planned items', 'Linked completed'],
      rows:    programRows.length > 0
        ? programRows
        : [['No programs in the report range.', '—', '—', '—', 0, 0]],
    },
  }))

  // ── Plan vs Actual ───────────────────────────────────────────────────
  // One row per LINKED item (i.e. comparison is present). Cells carry
  // the existing helper's neutral language verbatim — no judgment,
  // no recommendation.
  const planActualRows = []
  for (const p of summary.perProgram) {
    for (const it of p.perItem) {
      if (it.linkState !== 'linked' || !it.comparison) continue
      const cell = (slot) => {
        const n = (it.comparison.summary ?? []).find(s => s.label === slot)
        return n?.value ?? '—'
      }
      planActualRows.push([
        p.program.name ?? '—',
        it.item.productName ?? '—',
        it.linkedSpray?.applicationName ?? it.linkedSpray?.id ?? '—',
        cell('Date'),
        cell('Product'),
        cell('Area'),
        cell('Rate'),
      ])
    }
  }
  sections.push(createSection({
    title: 'Plan vs Actual',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Program', 'Planned product', 'Linked spray', 'Date', 'Product', 'Area', 'Rate'],
      rows:    planActualRows.length > 0
        ? planActualRows
        : [['No linked planned items in range.', '—', '—', '—', '—', '—', '—']],
    },
  }))

  // ── Unlinked Planned Items ──────────────────────────────────────────
  const unlinkedRows = []
  for (const p of summary.perProgram) {
    for (const it of p.perItem) {
      if (it.linkState !== 'unlinked') continue
      unlinkedRows.push([
        p.program.name ?? '—',
        it.item.productName ?? '—',
        it.item.targetArea ?? '—',
        labelPlannedWindow(it.item),
        it.item.status ?? '—',
      ])
    }
  }
  sections.push(createSection({
    title: 'Unlinked Planned Items',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Program', 'Planned product', 'Area', 'Planned window', 'Status'],
      rows:    unlinkedRows.length > 0
        ? unlinkedRows
        : [['No unlinked planned items.', '—', '—', '—', '—']],
    },
  }))

  // ── Missing or Stale Links ──────────────────────────────────────────
  // Items whose linked_spray_record_id is set but the spray record
  // is not in the report's input set (deleted or out of scope).
  const staleRows = []
  for (const p of summary.perProgram) {
    for (const it of p.perItem) {
      if (it.linkState !== 'stale') continue
      staleRows.push([
        p.program.name ?? '—',
        it.item.productName ?? '—',
        it.item.linkedSprayRecordId ?? '—',
        it.item.status ?? '—',
      ])
    }
  }
  sections.push(createSection({
    title: 'Missing or Stale Links',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Program', 'Planned product', 'Linked id (not resolvable)', 'Status'],
      rows:    staleRows.length > 0
        ? staleRows
        : [['No missing or stale links.', '—', '—', '—']],
    },
  }))

  return sections
}

function labelPlannedWindow(item) {
  if (!item) return '—'
  const start = item.plannedStartDate
  const end   = item.plannedEndDate
  if (start && end) {
    return start === end ? start : `${start} → ${end}`
  }
  if (start) return start
  if (end)   return end
  if (item.plannedWindowLabel) return item.plannedWindowLabel
  return '—'
}

// ── Notices ───────────────────────────────────────────────────────────────

function buildProgramNotices(summary) {
  const out = []
  const t = summary.totals

  if (t.programsReviewed === 0) {
    out.push({ type: 'info', label: 'No programs',
      value: 'No spray programs are in the report range.' })
    return out
  }

  out.push({ type: 'info', label: 'Programs reviewed',
    value: `${t.programsReviewed} program${t.programsReviewed !== 1 ? 's' : ''} reviewed` })

  if (t.planActualComparedItems > 0) {
    out.push({ type: 'info', label: 'Plan vs Actual',
      value: `${t.planActualComparedItems} planned item${t.planActualComparedItems !== 1 ? 's' : ''} compared to completed records` })
  }

  if (t.unlinkedPlannedItems > 0) {
    out.push({ type: 'info', label: 'Unlinked planned items',
      value: `${t.unlinkedPlannedItems} planned item${t.unlinkedPlannedItems !== 1 ? 's' : ''} have no linked completed spray record` })
  }

  if (t.missingActualLinks > 0) {
    out.push({ type: 'warning', label: 'Missing or stale links',
      value: `${t.missingActualLinks} planned item${t.missingActualLinks !== 1 ? 's' : ''} reference a spray record that could not be resolved` })
  }

  if (summary.programsMissingItemCache > 0) {
    out.push({ type: 'info', label: 'Items not loaded',
      value: `${summary.programsMissingItemCache} program${summary.programsMissingItemCache !== 1 ? 's' : ''} have items not yet loaded; their planned items are not reflected in the comparison tables.` })
  }

  return out
}

// ── Top-level builder ─────────────────────────────────────────────────────

/**
 * Build the Spray Program report from already-loaded planner data.
 *
 * @param {Object}   input
 * @param {Object[]} input.programs           spray_programs rows
 * @param {Object}   input.itemsByProgramId   { progId: items[] }  (lazy)
 * @param {Object[]} input.sprays             spray_records rows
 * @param {Object[]} [input.inventoryProducts]
 * @param {Object[]} [input.catalogProducts]
 * @param {Object}   [input.labelsByItemId]
 * @param {string}   [input.dateRange]
 * @param {Object}   [input.options]
 * @param {number}   [input.options.now]      epoch ms (for deterministic tests)
 * @returns {Object} TurfReport envelope
 */
export function buildSprayProgramReport(input = {}) {
  const programs         = Array.isArray(input.programs)         ? input.programs         : []
  const itemsByProgramId = (input.itemsByProgramId && typeof input.itemsByProgramId === 'object')
    ? input.itemsByProgramId : {}
  const sprays           = Array.isArray(input.sprays)           ? input.sprays           : []
  const dateRange        = input.dateRange ?? null
  const options          = input.options ?? {}
  const now              = typeof options.now === 'number' ? options.now : Date.now()

  // Quick lookup so per-item summaries don't re-walk sprays each call.
  const sprayById = {}
  for (const s of sprays) {
    if (!s || s.deletedAt || s.status === 'deleted') continue
    if (s.id) sprayById[s.id] = s
  }

  // Roll up every program. A program whose items aren't in the cache
  // contributes a counter so the report can surface "items not loaded"
  // without inflating the planned-items total.
  const perProgram = []
  let programsMissingItemCache = 0

  for (const program of programs) {
    if (!program) continue
    const items = itemsByProgramId[program.id]
    if (items === undefined) programsMissingItemCache++
    const itemList = Array.isArray(items) ? items : []
    const rollup = summarizeProgramForReport(program, itemList, { sprayById })
    if (rollup) perProgram.push(rollup)
  }

  // Aggregate totals across every program.
  let plannedItems         = 0
  let linkedCompletedItems = 0
  let unlinkedPlannedItems = 0
  let completedStatusItems = 0
  let skippedItems         = 0
  let canceledItems        = 0
  let planActualComparedItems = 0
  let missingActualLinks   = 0

  for (const p of perProgram) {
    plannedItems            += p.totals.plannedItems
    linkedCompletedItems    += p.totals.linkedCount
    unlinkedPlannedItems    += p.totals.unlinkedCount
    completedStatusItems    += p.totals.completedStatus
    skippedItems            += p.totals.skippedStatus
    canceledItems           += p.totals.canceledStatus
    planActualComparedItems += p.totals.planActualCompared
    missingActualLinks      += p.totals.staleCount
  }

  const summary = {
    dateRange,
    perProgram,
    programsMissingItemCache,
    totals: {
      programsReviewed:        perProgram.length,
      plannedItems,
      linkedCompletedItems,
      unlinkedPlannedItems,
      completedStatusItems,
      skippedItems,
      canceledItems,
      planActualComparedItems,
      missingActualLinks,
    },
  }

  const notices  = buildProgramNotices(summary)
  const sections = buildSprayProgramReportSections(summary)
  const generatedAt = new Date(now).toISOString()

  const metadata = {
    exportVersion: 1,
    reportKind:    REPORT_TYPE.SPRAY_PROGRAM,
    generatedBy:   'TurfIntel',
    generatedAt,
    dateRange,
    totals:        summary.totals,
    notices,
    disclaimer:    DISCLAIMER,
  }

  return createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_PROGRAM,
    title:         'Spray Program Report',
    sections,
    metadata,
  })
}
