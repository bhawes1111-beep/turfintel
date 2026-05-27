// Phase 7N (1/?) — Dashboard stewardship alerts.
//
// Pure-compute helper that rolls up read-only counters from existing
// stores so the dashboard can show "what needs attention" without
// fixing anything. No fetch, no React, no store imports, no mutation;
// inputs are inspected, never written to D1, never deducted, never
// recommended.
//
// Strict invariants:
//   - never writes inventory / product_catalog / spray_records /
//     spray_programs / spray_program_items / budget / invoice / ledger
//   - never mutates the supplied programs / items / inventory /
//     sprays arrays
//   - never invents counts; missing data is COUNTED, never guessed
//   - the alert "route" + "routeState" fields encode where the UI
//     would send the user to REVIEW the issue — never to apply
//     a fix automatically
//
// Reuse: Phase 7I.2 buildCostBasisReview is the single source of
// truth for cost-basis-issues counters, so the dashboard cannot
// drift from the Spray Program Planner's Cost Basis Review panel.

import { buildCostBasisReview } from '../sprayPrograms/costBasisReview.js'

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

// ── Per-category summarizers ────────────────────────────────────────────

/**
 * Inventory items that should have a product_catalog_id but don't.
 * "Should" means kind === 'chemical' OR 'product' — fertilizer / fuel /
 * parts catalog-linking is out of scope for the spray-intelligence
 * resolver, so the dashboard ignores those rows.
 *
 * @param {Array} inventoryProducts
 * @returns {{
 *   total: number,
 *   items: Array<{ id, name }>,
 * }}
 */
export function summarizeMissingCatalogLinks(inventoryProducts = []) {
  const out = []
  for (const inv of Array.isArray(inventoryProducts) ? inventoryProducts : []) {
    if (!inv) continue
    if (inv.kind !== 'chemical' && inv.kind !== 'product') continue
    if (inv.productCatalogId) continue
    out.push({ id: inv.id ?? null, name: inv.name ?? null })
  }
  return { total: out.length, items: out }
}

/**
 * Cost-basis issues across all non-archived programs. Defers entirely
 * to buildCostBasisReview so the totals match what the Spray Program
 * Planner's Cost Basis Review panel shows.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Array}  inventoryProducts
 * @returns {{
 *   total: number,
 *   missingCostBasis: number,
 *   missingUnit:      number,
 *   invalidCost:      number,
 *   affectedItems:    number,
 * }}
 */
export function summarizeCostBasisIssues(programs = [], itemsByProgramId = {}, inventoryProducts = []) {
  const review = buildCostBasisReview(
    nonArchived(programs),
    itemsByProgramId ?? {},
    inventoryProducts ?? [],
  )
  const t = review.totals
  return {
    total:
      (t.missingCostBasis  ?? 0) +
      (t.missingUnit       ?? 0) +
      (t.invalidCost       ?? 0),
    missingCostBasis: t.missingCostBasis  ?? 0,
    missingUnit:      t.missingUnit       ?? 0,
    invalidCost:      t.invalidCost       ?? 0,
    affectedItems:    t.affectedPlannedItems ?? 0,
  }
}

/**
 * Planned items whose linked_spray_record_id points at a spray record
 * that is not in the supplied sprays array. We treat the sprays array
 * as the authoritative cache — items pointing into the void are
 * surfaced for review.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Array}  sprays
 * @returns {{ total: number, items: Array<{ programId, itemId, productName, linkedId }> }}
 */
export function summarizeStaleCompletedLinks(programs = [], itemsByProgramId = {}, sprays = []) {
  const map = new Map()
  for (const s of Array.isArray(sprays) ? sprays : []) {
    if (s?.id) map.set(s.id, s)
  }
  const out = []
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item?.linkedSprayRecordId) continue
      if (map.has(item.linkedSprayRecordId)) continue
      out.push({
        programId:   program.id ?? null,
        itemId:      item.id ?? null,
        productName: item.productName ?? null,
        linkedId:    item.linkedSprayRecordId,
      })
    }
  }
  return { total: out.length, items: out }
}

/**
 * Planned items with no linked_spray_record_id AND status === 'planned'
 * (i.e. not yet completed/skipped/canceled).
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @returns {{ total: number, items: Array<{ programId, itemId, productName }> }}
 */
export function summarizeUnlinkedPlannedItems(programs = [], itemsByProgramId = {}) {
  const out = []
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue
      if (item.status !== 'planned') continue
      if (item.linkedSprayRecordId) continue
      out.push({
        programId:   program.id ?? null,
        itemId:      item.id ?? null,
        productName: item.productName ?? null,
      })
    }
  }
  return { total: out.length, items: out }
}

/**
 * Planned items whose plannedStartDate falls within the next N days
 * (default 7) AND status === 'planned'. The "now" anchor is injectable
 * so a smoke can pin a deterministic timestamp.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Object} [options]
 * @param {number} [options.now]       epoch ms; defaults to Date.now()
 * @param {number} [options.lookaheadDays=7]
 * @returns {{ total: number, items: Array<{ programId, itemId, productName, plannedStartDate }> }}
 */
export function summarizeUpcomingSprayWindows(programs = [], itemsByProgramId = {}, options = {}) {
  const now = typeof options?.now === 'number' ? options.now : Date.now()
  const lookaheadDays = Number.isFinite(options?.lookaheadDays) ? Math.max(0, options.lookaheadDays) : 7
  const horizon = now + lookaheadDays * DAY_MS
  const out = []
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue
      if (item.status !== 'planned') continue
      const start = asDate(item.plannedStartDate)
      if (start == null) continue
      if (start < now || start > horizon) continue
      out.push({
        programId:        program.id ?? null,
        itemId:           item.id ?? null,
        productName:      item.productName ?? null,
        plannedStartDate: item.plannedStartDate,
      })
    }
  }
  return { total: out.length, items: out }
}

/**
 * Planned items with no plannedStartDate at all (unscheduled bucket on
 * the calendar view). Item status doesn't matter — even a 'completed'
 * row with no date is surfaced so the steward can backfill the window.
 */
export function summarizeUnscheduledPlannedItems(programs = [], itemsByProgramId = {}) {
  const out = []
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue
      if (item.plannedStartDate || item.plannedEndDate) continue
      out.push({
        programId:   program.id ?? null,
        itemId:      item.id ?? null,
        productName: item.productName ?? null,
      })
    }
  }
  return { total: out.length, items: out }
}

// ── Top-level rollup ───────────────────────────────────────────────────

/**
 * Build the prioritized list of stewardship alerts for the dashboard.
 *
 * @param {Object} input
 * @param {Array}  [input.inventoryProducts]
 * @param {Array}  [input.catalogProducts]    (reserved for future use)
 * @param {Array}  [input.programs]
 * @param {Object} [input.itemsByProgramId]
 * @param {Array}  [input.sprays]
 * @param {number} [input.now]               epoch ms
 * @param {Object} [input.options]
 * @returns {{
 *   alerts: Array<{
 *     id: string,
 *     type: string,
 *     severity: 'info' | 'warning' | 'attention',
 *     title: string,
 *     count: number,
 *     summary: string,
 *     route: string | null,
 *     routeState: Object | null,
 *     itemsPreview: Array,
 *   }>,
 *   totals: { activeAlerts: number, attentionAlerts: number, warningAlerts: number, infoAlerts: number },
 * }}
 */
export function buildStewardshipAlerts(input = {}) {
  const inventoryProducts = Array.isArray(input.inventoryProducts) ? input.inventoryProducts : []
  const programs          = Array.isArray(input.programs)          ? input.programs          : []
  const itemsByProgramId  = (input.itemsByProgramId && typeof input.itemsByProgramId === 'object')
    ? input.itemsByProgramId : {}
  const sprays            = Array.isArray(input.sprays)            ? input.sprays            : []
  const now               = typeof input.now === 'number' ? input.now : Date.now()
  const options           = input.options ?? {}

  const catalog     = summarizeMissingCatalogLinks(inventoryProducts)
  const costBasis   = summarizeCostBasisIssues(programs, itemsByProgramId, inventoryProducts)
  const stale       = summarizeStaleCompletedLinks(programs, itemsByProgramId, sprays)
  const unlinked    = summarizeUnlinkedPlannedItems(programs, itemsByProgramId)
  const upcoming    = summarizeUpcomingSprayWindows(programs, itemsByProgramId, { now, ...options })
  const unscheduled = summarizeUnscheduledPlannedItems(programs, itemsByProgramId)

  const alerts = []

  if (catalog.total > 0) {
    alerts.push({
      id:       'stewardship-missing-catalog-links',
      type:     'missing-catalog-links',
      severity: 'attention',
      title:    'Missing catalog links',
      count:    catalog.total,
      summary:  `${catalog.total} inventory item${catalog.total !== 1 ? 's' : ''} not linked to the product catalog.`,
      route:    '/inventory',
      routeState: { activeTab: 'Link Review' },
      itemsPreview: catalog.items.slice(0, 5),
    })
  }

  if (costBasis.total > 0) {
    alerts.push({
      id:       'stewardship-cost-basis-issues',
      type:     'cost-basis-issues',
      severity: 'warning',
      title:    'Cost basis issues',
      count:    costBasis.total,
      summary:  `${costBasis.total} inventory cost issue${costBasis.total !== 1 ? 's' : ''} affecting ${costBasis.affectedItems} planned item${costBasis.affectedItems !== 1 ? 's' : ''}.`,
      route:    '/spray',
      routeState: { activeTab: 'Program Planner' },
      itemsPreview: [],
    })
  }

  if (stale.total > 0) {
    alerts.push({
      id:       'stewardship-stale-completed-links',
      type:     'stale-completed-links',
      severity: 'warning',
      title:    'Stale completed links',
      count:    stale.total,
      summary:  `${stale.total} planned item${stale.total !== 1 ? 's' : ''} reference a spray record that could not be resolved.`,
      route:    '/spray',
      routeState: { activeTab: 'Program Planner' },
      itemsPreview: stale.items.slice(0, 5),
    })
  }

  if (unlinked.total > 0) {
    alerts.push({
      id:       'stewardship-unlinked-planned-items',
      type:     'unlinked-planned-items',
      severity: 'info',
      title:    'Unlinked planned items',
      count:    unlinked.total,
      summary:  `${unlinked.total} planned item${unlinked.total !== 1 ? 's' : ''} have no linked completed spray record.`,
      route:    '/spray',
      routeState: { activeTab: 'Program Planner' },
      itemsPreview: unlinked.items.slice(0, 5),
    })
  }

  if (upcoming.total > 0) {
    alerts.push({
      id:       'stewardship-upcoming-spray-windows',
      type:     'upcoming-spray-windows',
      severity: 'info',
      title:    'Upcoming spray windows',
      count:    upcoming.total,
      summary:  `${upcoming.total} planned item${upcoming.total !== 1 ? 's' : ''} scheduled within the next week.`,
      route:    '/spray',
      routeState: { activeTab: 'Program Calendar' },
      itemsPreview: upcoming.items.slice(0, 5),
    })
  }

  if (unscheduled.total > 0) {
    alerts.push({
      id:       'stewardship-unscheduled-planned-items',
      type:     'unscheduled-planned-items',
      severity: 'info',
      title:    'Unscheduled planned items',
      count:    unscheduled.total,
      summary:  `${unscheduled.total} planned item${unscheduled.total !== 1 ? 's' : ''} have no planned window set.`,
      route:    '/spray',
      routeState: { activeTab: 'Program Calendar' },
      itemsPreview: unscheduled.items.slice(0, 5),
    })
  }

  // Severity order (attention → warning → info) then by count desc so
  // the most actionable item floats to the top regardless of input
  // order.
  const SEV_RANK = { attention: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => {
    const r = SEV_RANK[a.severity] - SEV_RANK[b.severity]
    if (r !== 0) return r
    return (b.count ?? 0) - (a.count ?? 0)
  })

  const totals = {
    activeAlerts:    alerts.length,
    attentionAlerts: alerts.filter(a => a.severity === 'attention').length,
    warningAlerts:   alerts.filter(a => a.severity === 'warning').length,
    infoAlerts:      alerts.filter(a => a.severity === 'info').length,
  }

  return { alerts, totals }
}

// Exposed for the smoke; not part of the public render contract.
export const __TEST = {
  DAY_MS,
  asDate,
  nonArchived,
}
