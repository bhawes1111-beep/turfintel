// Phase 7N (2/?) — Dashboard Spray Program Snapshot.
//
// Pure-compute helper that rolls up near-term planned spray work +
// plan-vs-actual link health + a cost snapshot for the dashboard
// card. Reuses the existing planner helpers so the dashboard counts
// never drift from the Program Planner / Calendar / Cost Awareness
// surfaces.
//
// Strict invariants:
//   - PURE: no React, no fetch, no store imports, no mutation.
//   - inputs are read-only; output is a fresh structure each call
//   - never writes inventory / product_catalog / spray_records /
//     spray_programs / spray_program_items / budget / invoice /
//     ledger / calendar
//   - never invents a count; missing data is COUNTED, never guessed
//   - never recommends or grades; the snapshot is awareness only

import {
  buildProgramCalendarItems,
  groupProgramItemsByDate,
} from '../sprayPrograms/programCalendar.js'
import {
  buildProgramCostSummaries,
  estimateProgramItemCost,
  formatEstimatedCost,
} from '../sprayPrograms/programCostAwareness.js'

const DAY_MS = 86_400_000

function asDate(value) {
  if (value == null || value === '') return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function nonArchived(programs) {
  if (!Array.isArray(programs)) return []
  return programs.filter(p => p && p.status !== 'archived')
}

// ── Per-bucket summarizers ────────────────────────────────────────────────

/**
 * Planned items whose plannedStartDate falls inside the next N days
 * (default 7). status === 'planned' only; archived programs excluded.
 *
 * Returns lightweight view-model rows suitable for the dashboard list:
 *   { programId, programName, itemId, productName, targetArea,
 *     plannedStartDate, plannedEndDate, rangeLabel, status,
 *     hasCompletedLink }
 *
 * The rangeLabel mirrors what the Spray Program Calendar's calendar
 * cells / agenda rows show, so users see consistent strings across
 * surfaces.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Object} [options]
 * @param {number} [options.now]
 * @param {number} [options.lookaheadDays=7]
 * @returns {{
 *   total: number,
 *   items: Array<Object>,
 * }}
 */
export function summarizeUpcomingProgramItems(programs = [], itemsByProgramId = {}, options = {}) {
  const now = typeof options?.now === 'number' ? options.now : Date.now()
  const lookaheadDays = Number.isFinite(options?.lookaheadDays) ? Math.max(0, options.lookaheadDays) : 7
  const horizon = now + lookaheadDays * DAY_MS

  // Reuse the calendar builder so the row shape (rangeLabel,
  // hasCompletedLink, displayLabel) matches what the existing
  // surfaces render. Archived programs are dropped by default.
  const calItems = buildProgramCalendarItems(
    nonArchived(programs),
    itemsByProgramId ?? {},
  )

  const items = []
  for (const ci of calItems) {
    if (!ci) continue
    if (ci.status !== 'planned') continue
    const start = asDate(ci.plannedStartDate)
    if (start == null) continue
    if (start < now || start > horizon) continue
    items.push({
      programId:        ci.programId,
      programName:      ci.programName,
      itemId:           ci.itemId,
      productName:      ci.productName,
      targetArea:       ci.targetArea,
      plannedStartDate: ci.plannedStartDate,
      plannedEndDate:   ci.plannedEndDate,
      rangeLabel:       ci.rangeLabel,
      status:           ci.status,
      hasCompletedLink: ci.hasCompletedLink === true,
    })
  }
  // Sort earliest-first so the dashboard list reads like an agenda.
  items.sort((a, b) => {
    const ta = asDate(a.plannedStartDate) ?? Number.POSITIVE_INFINITY
    const tb = asDate(b.plannedStartDate) ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return (a.productName ?? '').localeCompare(b.productName ?? '')
  })
  return { total: items.length, items }
}

/**
 * Plan-vs-actual link health across all non-archived programs.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Array}  sprays
 * @returns {{
 *   linkedCompletedItems: number,
 *   unlinkedItems:        number,
 *   staleLinks:           number,
 *   unscheduledItems:     number,
 * }}
 */
export function summarizeProgramLinkStatus(programs = [], itemsByProgramId = {}, sprays = []) {
  const sprayById = new Map()
  for (const s of Array.isArray(sprays) ? sprays : []) {
    if (s?.id) sprayById.set(s.id, s)
  }

  let linkedCompletedItems = 0
  let unlinkedItems        = 0
  let staleLinks           = 0
  let unscheduledItems     = 0

  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue

      // Unscheduled is independent of link status — an item can be
      // unscheduled AND unlinked, both surfaces want to know.
      if (!item.plannedStartDate && !item.plannedEndDate) unscheduledItems++

      const fk = item.linkedSprayRecordId ?? null
      if (fk) {
        if (sprayById.has(fk)) linkedCompletedItems++
        else                   staleLinks++
      } else if (item.status === 'planned') {
        unlinkedItems++
      }
    }
  }

  return { linkedCompletedItems, unlinkedItems, staleLinks, unscheduledItems }
}

/**
 * Cost snapshot: total estimated cost for upcoming planned items +
 * counts of items that could / could not be estimated. Defers to the
 * existing programCostAwareness helpers so the values match what the
 * Program Planner's cost chips show.
 *
 * @param {Array}  upcomingItems   the items output from summarizeUpcomingProgramItems
 * @param {Object} itemsByProgramId  full per-program map (used to resolve the original item)
 * @param {Array}  inventoryProducts
 * @returns {{
 *   estimatedCost:    number,
 *   estimatedItems:   number,
 *   missingCostItems: number,
 *   currency:         string,
 * }}
 */
export function summarizeUpcomingCostSnapshot(upcomingItems = [], itemsByProgramId = {}, inventoryProducts = []) {
  const context = { inventoryProducts: Array.isArray(inventoryProducts) ? inventoryProducts : [] }
  let estimatedCost  = 0
  let estimatedItems = 0
  let missingCostItems = 0

  for (const row of Array.isArray(upcomingItems) ? upcomingItems : []) {
    if (!row?.itemId || !row?.programId) continue
    const list = itemsByProgramId?.[row.programId]
    const item = Array.isArray(list) ? list.find(i => i?.id === row.itemId) ?? null : null
    if (!item) {
      // Lazy cache miss — count as "missing cost" so the dashboard
      // honestly reports the gap without inventing a value.
      missingCostItems++
      continue
    }
    const est = estimateProgramItemCost(item, context)
    if (est?.status === 'estimated' && typeof est.estimatedCost === 'number') {
      estimatedCost += est.estimatedCost
      estimatedItems++
    } else {
      missingCostItems++
    }
  }

  return {
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    estimatedItems,
    missingCostItems,
    currency: 'USD',
  }
}

/**
 * Workspace-wide program cost summary so the dashboard can show the
 * total estimated spend across every non-archived program (in
 * addition to the upcoming-only snapshot above).
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Array}  inventoryProducts
 * @returns {{
 *   estimatedCost: number, estimatedItems: number,
 *   missingCostBasis: number, missingQuantity: number,
 *   notComparableUnits: number, currency: string,
 * }}
 */
export function summarizeProgramCostSnapshot(programs = [], itemsByProgramId = {}, inventoryProducts = []) {
  const summaries = buildProgramCostSummaries(
    nonArchived(programs),
    itemsByProgramId ?? {},
    { inventoryProducts: Array.isArray(inventoryProducts) ? inventoryProducts : [] },
  )
  let estimatedCost = 0
  let estimatedItems = 0
  let missingCostBasis = 0
  let missingQuantity = 0
  let notComparableUnits = 0
  for (const s of summaries) {
    estimatedCost     += s.estimatedTotal
    estimatedItems    += s.estimatedItems
    missingCostBasis  += s.missingCostBasis
    missingQuantity   += s.missingQuantity
    notComparableUnits+= s.notComparableUnits
  }
  return {
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    estimatedItems,
    missingCostBasis,
    missingQuantity,
    notComparableUnits,
    currency: 'USD',
  }
}

// ── Top-level rollup ─────────────────────────────────────────────────────

/**
 * Build the dashboard Spray Program Snapshot payload.
 *
 * @param {Object} input
 * @param {Array}  [input.programs]
 * @param {Object} [input.itemsByProgramId]
 * @param {Array}  [input.sprays]
 * @param {Array}  [input.inventoryProducts]
 * @param {number} [input.now]
 * @param {Object} [input.options]
 * @returns {{
 *   totals: Object,
 *   upcoming: Array<Object>,
 *   notices: Array<{ type, label, value }>,
 *   currency: string,
 * }}
 */
export function buildSprayProgramSnapshot(input = {}) {
  const programs          = Array.isArray(input.programs)          ? input.programs          : []
  const itemsByProgramId  = (input.itemsByProgramId && typeof input.itemsByProgramId === 'object')
    ? input.itemsByProgramId : {}
  const sprays            = Array.isArray(input.sprays)            ? input.sprays            : []
  const inventoryProducts = Array.isArray(input.inventoryProducts) ? input.inventoryProducts : []
  const now               = typeof input.now === 'number' ? input.now : Date.now()
  const options           = input.options ?? {}

  const upcoming = summarizeUpcomingProgramItems(programs, itemsByProgramId, { now, ...options })
  const linkStatus = summarizeProgramLinkStatus(programs, itemsByProgramId, sprays)
  const upcomingCost = summarizeUpcomingCostSnapshot(upcoming.items, itemsByProgramId, inventoryProducts)

  // Attach per-row estimatedCost so the dashboard list can render a
  // currency chip without re-resolving the estimate.
  const upcomingRows = upcoming.items.map(row => {
    if (!row?.itemId || !row?.programId) return { ...row, estimatedCost: null }
    const list = itemsByProgramId?.[row.programId]
    const item = Array.isArray(list) ? list.find(i => i?.id === row.itemId) ?? null : null
    if (!item) return { ...row, estimatedCost: null }
    const est = estimateProgramItemCost(item, { inventoryProducts })
    return {
      ...row,
      estimatedCost: est?.status === 'estimated' ? est.estimatedCost ?? null : null,
    }
  })

  const notices = buildNotices({
    upcoming: upcoming.total,
    linkStatus,
    upcomingCost,
    programsMissingItemCache: countMissingItemCaches(programs, itemsByProgramId),
  })

  return {
    totals: {
      upcomingItems:        upcoming.total,
      linkedCompletedItems: linkStatus.linkedCompletedItems,
      unlinkedItems:        linkStatus.unlinkedItems,
      staleLinks:           linkStatus.staleLinks,
      unscheduledItems:     linkStatus.unscheduledItems,
      estimatedCost:        upcomingCost.estimatedCost,
      estimatedItems:       upcomingCost.estimatedItems,
      missingCostItems:     upcomingCost.missingCostItems,
    },
    upcoming: upcomingRows,
    notices,
    currency: upcomingCost.currency,
  }
}

function countMissingItemCaches(programs, itemsByProgramId) {
  let n = 0
  for (const program of nonArchived(programs)) {
    if (itemsByProgramId?.[program.id] === undefined) n++
  }
  return n
}

function buildNotices({ upcoming, linkStatus, upcomingCost, programsMissingItemCache }) {
  const out = []
  if (programsMissingItemCache > 0) {
    out.push({ type: 'info', label: 'Items not loaded',
      value: `${programsMissingItemCache} program${programsMissingItemCache !== 1 ? 's' : ''} have items not yet loaded; their planned items are not reflected in the snapshot.` })
  }
  if (upcoming > 0 && upcomingCost.estimatedItems > 0) {
    out.push({ type: 'info', label: 'Upcoming cost',
      value: `${upcomingCost.estimatedItems} of ${upcoming} upcoming item${upcoming !== 1 ? 's' : ''} estimated · total ${formatEstimatedCost(upcomingCost.estimatedCost, upcomingCost.currency)}` })
  }
  if (upcomingCost.missingCostItems > 0) {
    out.push({ type: 'warning', label: 'Missing cost basis',
      value: `${upcomingCost.missingCostItems} upcoming item${upcomingCost.missingCostItems !== 1 ? 's' : ''} could not be cost-estimated.` })
  }
  if (linkStatus.staleLinks > 0) {
    out.push({ type: 'warning', label: 'Stale links',
      value: `${linkStatus.staleLinks} planned item${linkStatus.staleLinks !== 1 ? 's' : ''} reference a spray record that could not be resolved.` })
  }
  return out
}

// Helper re-exports so the dashboard component can format currency
// without a parallel formatter.
export { formatEstimatedCost }

// Exposed for the smoke; not part of the public render contract.
export const __TEST = {
  DAY_MS, asDate, nonArchived, countMissingItemCaches,
}

// Re-grouping helper retained for future "near-term agenda" views; it
// also keeps the cross-file import surface intentional + minimal.
export { groupProgramItemsByDate }
