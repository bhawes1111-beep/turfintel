// Phase 7N (3/?) — Dashboard Operations Strip.
//
// Pure-compute helper that rolls up today / this-week planned spray
// work + overdue + unscheduled counts + a weekly cost number for the
// compact dashboard strip. Reuses the Phase 7H calendar helper and
// the Phase 7I cost-awareness helper so the dashboard never drifts
// from the Program Planner / Calendar / Cost Awareness surfaces.
//
// Strict invariants:
//   - PURE: no React, no fetch, no store imports, no mutation.
//   - inputs are read-only; output is a fresh structure each call.
//   - never writes inventory / product_catalog / spray_records /
//     spray_programs / spray_program_items / budget / invoice /
//     ledger / calendar.
//   - never invents a count; missing data is COUNTED, never guessed.
//   - never recommends or grades; the strip is awareness only.

import {
  buildProgramCalendarItems,
} from '../sprayPrograms/programCalendar.js'
import {
  estimateProgramItemCost,
  formatEstimatedCost,
} from '../sprayPrograms/programCostAwareness.js'

const DAY_MS = 86_400_000

function asDate(value) {
  if (value == null || value === '') return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function startOfDayUTC(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS
}

function nonArchived(programs) {
  if (!Array.isArray(programs)) return []
  return programs.filter(p => p && p.status !== 'archived')
}

/**
 * Resolve the canonical planner-row for an upcoming calendar row so
 * the cost helper sees the full rate / unit / inventoryItemId
 * context. Returns null on lazy-cache miss so the caller can count
 * the gap honestly.
 */
function resolvePlannerItem(row, itemsByProgramId) {
  if (!row?.programId || !row?.itemId) return null
  const list = itemsByProgramId?.[row.programId]
  if (!Array.isArray(list)) return null
  return list.find(i => i?.id === row.itemId) ?? null
}

// ── Per-bucket summarizers ────────────────────────────────────────────────

/**
 * Planned items scheduled for today (plannedStartDate === today's
 * UTC day). status === 'planned' only; archived programs excluded.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Object} [options]
 * @param {number} [options.now]
 * @returns {{ total: number, items: Array }}
 */
export function summarizeTodayProgramItems(programs = [], itemsByProgramId = {}, options = {}) {
  const now    = typeof options?.now === 'number' ? options.now : Date.now()
  const start  = startOfDayUTC(now)
  const end    = start + DAY_MS
  return filterCalendarRows(programs, itemsByProgramId, row =>
    row.status === 'planned' &&
    isWithin(asDate(row.plannedStartDate), start, end),
  )
}

/**
 * Planned items scheduled this week (plannedStartDate within
 * [todayStart, todayStart + 7 days)). status === 'planned' only;
 * archived programs excluded.
 */
export function summarizeWeekProgramItems(programs = [], itemsByProgramId = {}, options = {}) {
  const now   = typeof options?.now === 'number' ? options.now : Date.now()
  const start = startOfDayUTC(now)
  const end   = start + 7 * DAY_MS
  return filterCalendarRows(programs, itemsByProgramId, row =>
    row.status === 'planned' &&
    isWithin(asDate(row.plannedStartDate), start, end),
  )
}

/**
 * Overdue planned items: plannedEndDate has passed AND the item is
 * still status === 'planned' AND has no linked completed spray
 * record (resolved against the supplied sprays cache).
 *
 * A planned item with a stale FK (linkedSprayRecordId set but not in
 * cache) is NOT counted as overdue — that's a separate stewardship
 * concern surfaced by stewardshipAlerts.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId
 * @param {Array}  sprays
 * @param {Object} [options]
 * @returns {{ total: number, items: Array }}
 */
export function summarizeOverdueProgramItems(programs = [], itemsByProgramId = {}, sprays = [], options = {}) {
  const now      = typeof options?.now === 'number' ? options.now : Date.now()
  const today    = startOfDayUTC(now)
  const sprayIds = new Set(
    (Array.isArray(sprays) ? sprays : []).map(s => s?.id).filter(Boolean),
  )

  const rows = buildProgramCalendarItems(nonArchived(programs), itemsByProgramId ?? {})
  const items = []
  for (const row of rows) {
    if (!row) continue
    if (row.status !== 'planned') continue
    // Use the planned END date as the overdue anchor so a multi-day
    // window only flips to overdue after the user-stated window
    // closes (matches the Phase 7H calendar's "window passed"
    // intuition).
    const end = asDate(row.plannedEndDate ?? row.plannedStartDate)
    if (end == null || end >= today) continue
    // Skip rows that look linked-and-resolved.
    if (row.hasCompletedLink && row.linkedSprayRecordId && sprayIds.has(row.linkedSprayRecordId)) continue
    items.push({
      programId:        row.programId,
      programName:      row.programName,
      itemId:           row.itemId,
      productName:      row.productName,
      targetArea:       row.targetArea,
      plannedStartDate: row.plannedStartDate,
      plannedEndDate:   row.plannedEndDate,
      rangeLabel:       row.rangeLabel,
      status:           row.status,
      hasCompletedLink: row.hasCompletedLink === true,
    })
  }
  // Sort earliest-end-first (most overdue at the top).
  items.sort((a, b) => {
    const ea = asDate(a.plannedEndDate ?? a.plannedStartDate) ?? Number.POSITIVE_INFINITY
    const eb = asDate(b.plannedEndDate ?? b.plannedStartDate) ?? Number.POSITIVE_INFINITY
    if (ea !== eb) return ea - eb
    return (a.productName ?? '').localeCompare(b.productName ?? '')
  })
  return { total: items.length, items }
}

/**
 * Weekly cost rollup: sums estimateProgramItemCost across every
 * upcoming-this-week row. Mirrors the Phase 7N.2 snapshot's per-row
 * accounting so the dashboard never disagrees with the Planner
 * cost chips.
 *
 * @returns {{
 *   estimatedCost: number, estimatedItems: number,
 *   missingCostItems: number, currency: string,
 * }}
 */
export function summarizeWeeklyCost(programs = [], itemsByProgramId = {}, inventoryProducts = [], options = {}) {
  const week = summarizeWeekProgramItems(programs, itemsByProgramId, options)
  const context = { inventoryProducts: Array.isArray(inventoryProducts) ? inventoryProducts : [] }

  let estimatedCost  = 0
  let estimatedItems = 0
  let missingCostItems = 0
  for (const row of week.items) {
    const item = resolvePlannerItem(row, itemsByProgramId)
    if (!item) { missingCostItems++; continue }
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

// ── Top-level rollup ───────────────────────────────────────────────────

/**
 * Build the dashboard operations strip payload.
 *
 * @param {Object} input
 * @param {Array}  [input.programs]
 * @param {Object} [input.itemsByProgramId]
 * @param {Array}  [input.sprays]
 * @param {Array}  [input.inventoryProducts]
 * @param {number} [input.now]
 * @param {Object} [input.options]
 * @returns {{
 *   today:      { plannedItems: number, linkedCompleted: number, estimatedCost: number },
 *   week:       { plannedItems: number, linkedCompleted: number, estimatedCost: number, estimatedItems: number, missingCostItems: number },
 *   overdue:    { count: number, itemsPreview: Array },
 *   unscheduled:{ count: number },
 *   notices:    Array,
 *   currency:   string,
 * }}
 */
export function buildOperationsStrip(input = {}) {
  const programs          = Array.isArray(input.programs)          ? input.programs          : []
  const itemsByProgramId  = (input.itemsByProgramId && typeof input.itemsByProgramId === 'object')
    ? input.itemsByProgramId : {}
  const sprays            = Array.isArray(input.sprays)            ? input.sprays            : []
  const inventoryProducts = Array.isArray(input.inventoryProducts) ? input.inventoryProducts : []
  const now               = typeof input.now === 'number' ? input.now : Date.now()
  const options           = input.options ?? {}

  const sprayIds = new Set(sprays.map(s => s?.id).filter(Boolean))

  const today = summarizeTodayProgramItems(programs, itemsByProgramId, { now, ...options })
  const week  = summarizeWeekProgramItems(programs, itemsByProgramId, { now, ...options })

  // Linked-completed counts: for each bucket, walk the full per-program
  // items list and count items whose plannedStartDate falls in the
  // bucket AND have a resolvable linked spray. The bucket window is
  // independent of status (a completed-status row with a planned
  // window still counts as work done this week).
  const todayStart = startOfDayUTC(now)
  const linkedToday = countLinkedCompletedInWindow(programs, itemsByProgramId, sprayIds, todayStart, todayStart + DAY_MS)
  const linkedWeek  = countLinkedCompletedInWindow(programs, itemsByProgramId, sprayIds, todayStart, todayStart + 7 * DAY_MS)

  // Per-row estimated cost for today + week — uses the same Phase 7I
  // helper so values match the Planner + Phase 7N.2 snapshot.
  const todayCost = estimateBucketCost(today.items, itemsByProgramId, inventoryProducts)
  const weekCost  = summarizeWeeklyCost(programs, itemsByProgramId, inventoryProducts, { now })

  const overdue = summarizeOverdueProgramItems(programs, itemsByProgramId, sprays, { now })

  // Unscheduled — items with neither plannedStartDate nor
  // plannedEndDate. Status doesn't matter (a completed-status row
  // with no planned window still needs backfill).
  const unscheduledCount = countUnscheduled(programs, itemsByProgramId)

  const programsMissingItemCache = countMissingItemCaches(programs, itemsByProgramId)

  const notices = buildNotices({
    todayCount:  today.total,
    weekCount:   week.total,
    weekCost,
    overdue,
    unscheduledCount,
    programsMissingItemCache,
  })

  return {
    today: {
      plannedItems:    today.total,
      linkedCompleted: linkedToday,
      estimatedCost:   todayCost.estimatedCost,
    },
    week: {
      plannedItems:    week.total,
      linkedCompleted: linkedWeek,
      estimatedCost:   weekCost.estimatedCost,
      estimatedItems:  weekCost.estimatedItems,
      missingCostItems:weekCost.missingCostItems,
    },
    overdue: {
      count:        overdue.total,
      itemsPreview: overdue.items.slice(0, 5),
    },
    unscheduled: { count: unscheduledCount },
    notices,
    currency: weekCost.currency,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function filterCalendarRows(programs, itemsByProgramId, predicate) {
  const rows = buildProgramCalendarItems(nonArchived(programs), itemsByProgramId ?? {})
  const items = []
  for (const row of rows) {
    if (!row) continue
    if (!predicate(row)) continue
    items.push({
      programId:        row.programId,
      programName:      row.programName,
      itemId:           row.itemId,
      productName:      row.productName,
      targetArea:       row.targetArea,
      plannedStartDate: row.plannedStartDate,
      plannedEndDate:   row.plannedEndDate,
      rangeLabel:       row.rangeLabel,
      status:           row.status,
      hasCompletedLink: row.hasCompletedLink === true,
    })
  }
  items.sort((a, b) => {
    const ta = asDate(a.plannedStartDate) ?? Number.POSITIVE_INFINITY
    const tb = asDate(b.plannedStartDate) ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return (a.productName ?? '').localeCompare(b.productName ?? '')
  })
  return { total: items.length, items }
}

function isWithin(value, startInclusive, endExclusive) {
  if (value == null) return false
  return value >= startInclusive && value < endExclusive
}

function estimateBucketCost(rows, itemsByProgramId, inventoryProducts) {
  const context = { inventoryProducts }
  let estimatedCost  = 0
  let estimatedItems = 0
  let missingCostItems = 0
  for (const row of rows) {
    const item = resolvePlannerItem(row, itemsByProgramId)
    if (!item) { missingCostItems++; continue }
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
  }
}

function countLinkedCompletedInWindow(programs, itemsByProgramId, sprayIds, startInclusive, endExclusive) {
  let n = 0
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue
      const ts = asDate(item.plannedStartDate)
      if (ts == null) continue
      if (ts < startInclusive || ts >= endExclusive) continue
      const fk = item.linkedSprayRecordId ?? null
      if (!fk) continue
      if (!sprayIds.has(fk)) continue
      n++
    }
  }
  return n
}

function countUnscheduled(programs, itemsByProgramId) {
  let n = 0
  for (const program of nonArchived(programs)) {
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item) continue
      if (item.plannedStartDate || item.plannedEndDate) continue
      n++
    }
  }
  return n
}

function countMissingItemCaches(programs, itemsByProgramId) {
  let n = 0
  for (const program of nonArchived(programs)) {
    if (itemsByProgramId?.[program.id] === undefined) n++
  }
  return n
}

function buildNotices({ todayCount, weekCount, weekCost, overdue, unscheduledCount, programsMissingItemCache }) {
  const out = []
  if (programsMissingItemCache > 0) {
    out.push({ type: 'info', label: 'Items not loaded',
      value: `${programsMissingItemCache} program${programsMissingItemCache !== 1 ? 's' : ''} have items not yet loaded; their planned items are not reflected in this strip.` })
  }
  if (todayCount > 0) {
    out.push({ type: 'info', label: 'Today',
      value: `${todayCount} planned item${todayCount !== 1 ? 's' : ''} scheduled for today.` })
  }
  if (weekCount > 0 && weekCost.estimatedItems > 0) {
    out.push({ type: 'info', label: 'Week cost',
      value: `${weekCost.estimatedItems} of ${weekCount} planned this week estimated · total ${formatEstimatedCost(weekCost.estimatedCost, weekCost.currency)}` })
  }
  if (overdue.total > 0) {
    out.push({ type: 'warning', label: 'Overdue',
      value: `${overdue.total} planned item${overdue.total !== 1 ? 's' : ''} have a window that has passed without a linked completed spray.` })
  }
  if (unscheduledCount > 0) {
    out.push({ type: 'info', label: 'Unscheduled',
      value: `${unscheduledCount} planned item${unscheduledCount !== 1 ? 's' : ''} have no planned window set.` })
  }
  return out
}

// Re-export for the dashboard component so it doesn't need to import
// the Phase 7I helper directly.
export { formatEstimatedCost }

// Exposed for the smoke; not part of the public render contract.
export const __TEST = {
  DAY_MS, asDate, startOfDayUTC, nonArchived,
  countLinkedCompletedInWindow, countUnscheduled, countMissingItemCaches,
}
