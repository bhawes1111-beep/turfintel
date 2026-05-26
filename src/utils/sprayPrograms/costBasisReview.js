// Phase 7I (2/?) — Cost Basis Stewardship review helpers.
//
// Pure-compute helpers that explain why a planned spray-program item
// could not be cost-estimated. No fetch, no React, no store imports,
// no mutation. The review is read-only: it explains the gap, it does
// not fix it. Filling cost basis happens in the inventory editor
// (separate, existing flow).
//
// Strict invariants:
//   - never writes inventory cost fields
//   - never mutates product_catalog
//   - never creates a budget entry / invoice / ledger row
//   - never deducts inventory
//   - never creates a completed spray record
//   - never guesses a missing cost
//   - never guesses a unit conversion (defers to programCostAwareness)

function isFiniteNumber(n) {
  if (n == null) return false
  if (typeof n === 'number') return Number.isFinite(n)
  const v = Number(n)
  return Number.isFinite(v)
}
function isFinitePositive(n) {
  if (!isFiniteNumber(n)) return false
  const v = typeof n === 'number' ? n : Number(n)
  return v > 0
}
function hasUnit(invItem) {
  if (!invItem) return false
  const u = invItem.unit
  return typeof u === 'string' && u.trim() !== ''
}
function inventoryCostValue(invItem) {
  if (!invItem) return null
  for (const v of [invItem.costPerUnit, invItem.unitCost, invItem.pricePerUnit]) {
    if (v != null) return v
  }
  return null
}

/**
 * Evaluate a single inventory item's cost basis quality.
 *
 * @param {Object|null} invItem  inventoryStore items[] row, or null when
 *                               the planned item references an id that
 *                               isn't present (lazy/stale cache).
 * @returns {{ status:
 *   'ready' | 'missing-inventory-item' | 'missing-cost-per-unit' |
 *   'missing-unit' | 'invalid-cost' }}
 */
export function evaluateInventoryCostBasis(invItem) {
  if (!invItem) return { status: 'missing-inventory-item' }

  const raw = inventoryCostValue(invItem)
  if (raw == null) return { status: 'missing-cost-per-unit' }
  if (!isFiniteNumber(raw) || !isFinitePositive(raw)) return { status: 'invalid-cost' }
  if (!hasUnit(invItem)) return { status: 'missing-unit' }
  return { status: 'ready' }
}

/**
 * Walk a list of planned items and emit one issue row per item whose
 * cost basis is not ready. Items that are "ready" produce no issue
 * row. The status hierarchy here intentionally mirrors what the cost
 * helper would surface for the item — missing inventory link first,
 * then missing/stale inventory, then missing cost-per-unit, then unit
 * or invalid-cost.
 *
 * @param {Array} items
 * @param {Array} inventoryProducts
 * @returns {Array<{
 *   itemId: string|null, productName: string|null,
 *   inventoryItemId: string|null, inventoryName: string|null,
 *   status: string,
 * }>}
 */
export function findProgramItemsMissingCostBasis(items = [], inventoryProducts = []) {
  const out = []
  const invs = Array.isArray(inventoryProducts) ? inventoryProducts : []

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue
    const invId = item.inventoryItemId ?? null
    if (!invId) {
      out.push({
        itemId:          item.id ?? null,
        productName:     item.productName ?? null,
        inventoryItemId: null,
        inventoryName:   null,
        status:          'missing-inventory-link',
      })
      continue
    }
    const invItem = invs.find(i => i?.id === invId) ?? null
    const evalRes = evaluateInventoryCostBasis(invItem)
    if (evalRes.status === 'ready') continue
    out.push({
      itemId:          item.id ?? null,
      productName:     item.productName ?? null,
      inventoryItemId: invId,
      inventoryName:   invItem?.name ?? null,
      status:          evalRes.status,
    })
  }
  return out
}

/**
 * Build a cross-program cost-basis stewardship review. The review
 * groups planned-item issues per inventory item so the steward can fix
 * one inventory row to unblock every dependent planned item.
 *
 * Read-only over the supplied programs / items / inventory arrays —
 * nothing here writes or mutates input.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId   { [programId]: items[] }
 * @param {Array}  inventoryProducts  inventoryStore items[]
 * @returns {{
 *   totals: {
 *     linkedInventoryItems: number,
 *     ready: number,
 *     missingCostBasis: number,
 *     missingUnit: number,
 *     invalidCost: number,
 *     unusedInPrograms: number,
 *     affectedPlannedItems: number,
 *   },
 *   inventoryIssues: Array<{
 *     inventoryItemId: string,
 *     inventoryName:   string|null,
 *     status: string,
 *     affectedProgramItems: Array<{
 *       programId: string|null, programName: string|null,
 *       itemId: string|null, productName: string|null,
 *     }>,
 *   }>,
 *   plannedItemIssues: Array<{
 *     programId: string|null, programName: string|null,
 *     itemId: string|null, productName: string|null,
 *     inventoryItemId: string|null, inventoryName: string|null,
 *     status: string,
 *   }>,
 * }}
 */
export function buildCostBasisReview(programs = [], itemsByProgramId = {}, inventoryProducts = []) {
  const invs = Array.isArray(inventoryProducts) ? inventoryProducts : []

  // Pass 1 — for every linked inventory item across all programs,
  // collect the planned items that reference it.
  const referencedInvIds = new Map()  // invId → { programItems: [] }
  const plannedItemIssues = []

  for (const program of Array.isArray(programs) ? programs : []) {
    if (!program) continue
    const list = itemsByProgramId?.[program.id]
    if (!Array.isArray(list)) continue

    for (const item of list) {
      if (!item) continue
      const invId = item.inventoryItemId ?? null
      const invItem = invId ? invs.find(i => i?.id === invId) ?? null : null

      // Track which inventory items planned items reference, even when
      // the row is ready — used to derive unusedInPrograms later.
      if (invId) {
        if (!referencedInvIds.has(invId)) {
          referencedInvIds.set(invId, { programItems: [] })
        }
        referencedInvIds.get(invId).programItems.push({
          programId:   program.id ?? null,
          programName: program.name ?? null,
          itemId:      item.id ?? null,
          productName: item.productName ?? null,
        })
      }

      if (!invId) {
        plannedItemIssues.push({
          programId:       program.id ?? null,
          programName:     program.name ?? null,
          itemId:          item.id ?? null,
          productName:     item.productName ?? null,
          inventoryItemId: null,
          inventoryName:   null,
          status:          'missing-inventory-link',
        })
        continue
      }
      const evalRes = evaluateInventoryCostBasis(invItem)
      if (evalRes.status === 'ready') continue
      plannedItemIssues.push({
        programId:       program.id ?? null,
        programName:     program.name ?? null,
        itemId:          item.id ?? null,
        productName:     item.productName ?? null,
        inventoryItemId: invId,
        inventoryName:   invItem?.name ?? null,
        status:          evalRes.status,
      })
    }
  }

  // Pass 2 — build per-inventory issue rows from the referenced map.
  const inventoryIssues = []
  let readyCount    = 0
  let missingCost   = 0
  let missingUnit   = 0
  let invalidCost   = 0
  let missingItem   = 0
  for (const [invId, entry] of referencedInvIds.entries()) {
    const invItem = invs.find(i => i?.id === invId) ?? null
    const evalRes = evaluateInventoryCostBasis(invItem)
    if (evalRes.status === 'ready') { readyCount++; continue }
    if (evalRes.status === 'missing-inventory-item')   missingItem++
    if (evalRes.status === 'missing-cost-per-unit')    missingCost++
    if (evalRes.status === 'missing-unit')             missingUnit++
    if (evalRes.status === 'invalid-cost')             invalidCost++
    inventoryIssues.push({
      inventoryItemId:      invId,
      inventoryName:        invItem?.name ?? null,
      status:               evalRes.status,
      affectedProgramItems: entry.programItems,
    })
  }

  // Inventory rows that exist but no planned item references them are
  // marked 'unused-in-programs' for the steward's awareness — these
  // do not affect any current cost estimate.
  let unusedCount = 0
  for (const inv of invs) {
    if (!inv?.id) continue
    if (!referencedInvIds.has(inv.id)) unusedCount++
  }

  return {
    totals: {
      linkedInventoryItems: referencedInvIds.size,
      ready:                readyCount,
      missingCostBasis:     missingCost + missingItem,
      missingUnit:          missingUnit,
      invalidCost:          invalidCost,
      unusedInPrograms:     unusedCount,
      affectedPlannedItems: plannedItemIssues.length,
    },
    inventoryIssues,
    plannedItemIssues,
  }
}

/**
 * One-line summary of a cost basis review for headers / chips. Returns
 * an empty-state object when no issues exist.
 *
 * @param {ReturnType<typeof buildCostBasisReview>} review
 * @returns {{
 *   isClean: boolean, totalIssues: number, affectedPlannedItems: number,
 *   message: string,
 * }}
 */
export function summarizeCostBasisReview(review) {
  if (!review || !review.totals) {
    return { isClean: true, totalIssues: 0, affectedPlannedItems: 0, message: 'No cost basis review available.' }
  }
  const t = review.totals
  const totalIssues = (t.missingCostBasis ?? 0) + (t.missingUnit ?? 0) + (t.invalidCost ?? 0)
  if (totalIssues === 0 && t.affectedPlannedItems === 0) {
    return {
      isClean: true,
      totalIssues: 0,
      affectedPlannedItems: 0,
      message: 'All linked inventory items have a usable cost basis.',
    }
  }
  return {
    isClean: false,
    totalIssues,
    affectedPlannedItems: t.affectedPlannedItems ?? 0,
    message: `${totalIssues} inventory issue${totalIssues !== 1 ? 's' : ''} · ${t.affectedPlannedItems} planned item${t.affectedPlannedItems !== 1 ? 's' : ''} affected`,
  }
}

// Exposed for the smoke; not part of the public render contract.
export const __TEST = {
  isFiniteNumber,
  isFinitePositive,
  hasUnit,
  inventoryCostValue,
}
