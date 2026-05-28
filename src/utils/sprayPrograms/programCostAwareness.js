// Phase 7I (1/?) — Spray Program cost-awareness helpers.
//
// Pure-compute estimates for planned spray-program items. No fetch,
// no React, no store imports, no mutation. Cost awareness is strictly
// a read-only estimate layer:
//
//   - never writes to D1
//   - never deducts inventory
//   - never creates a completed spray record
//   - never mutates product_catalog
//   - never invents a unit conversion
//   - never persists the estimate
//
// The helper deliberately refuses to guess: if the planned rate unit
// and the inventory unit do not match exactly (case-/whitespace-
// normalized), we emit status='not-comparable-unit' rather than
// applying an area→quantity conversion factor we cannot defend.

const DEFAULT_CURRENCY = 'USD'

function isFinitePositive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function asFiniteNumber(n) {
  if (n == null) return null
  if (typeof n === 'number') return Number.isFinite(n) ? n : null
  // Some D1 columns surface numeric strings; coerce defensively.
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

function normalizeUnit(u) {
  if (u == null) return ''
  return String(u).trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeName(n) {
  if (n == null) return ''
  return String(n).trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Resolve the inventory cost-basis row for a planned program item.
 *
 * Resolution order (Phase 7U.4):
 *   1. item.inventoryItemId — the explicit link (set via the planner).
 *   2. Fallback: exact product_name match against an inventory row in
 *      the SAME course. Seeded/imported programs (e.g. Crosswinds) have
 *      no inventory link, so without this fallback their applied cost
 *      basis is unreachable and every item reads "missing cost basis".
 *
 * The name fallback is deliberately strict: exact normalized-name match
 * within the same course_id only. No alias/fuzzy matching — that stays a
 * manual stewardship decision. Returns null when nothing resolves.
 *
 * @param {Object} item
 * @param {Array}  inventoryProducts
 * @returns {{ row: Object, via: 'id'|'name' }|null}
 */
function resolveInventoryForItem(item, inventoryProducts) {
  const inv = Array.isArray(inventoryProducts) ? inventoryProducts : []
  const id = item?.inventoryItemId ?? null
  if (id) {
    const byId = inv.find(i => i?.id === id)
    if (byId) return { row: byId, via: 'id' }
    return null  // explicit link that doesn't resolve — do NOT silently name-match
  }
  // Fallback: exact name match within the same course.
  const name = normalizeName(item?.productName)
  if (!name) return null
  const itemCourse = item?.courseId ?? null
  const byName = inv.find(i => {
    if (normalizeName(i?.name) !== name) return false
    // If both carry a course, require it to match; if the item has no
    // course, accept any (single-course deployments).
    if (itemCourse && i?.courseId && i.courseId !== itemCourse) return false
    return true
  })
  return byName ? { row: byName, via: 'name' } : null
}

function inventoryUnitCost(invItem) {
  if (!invItem) return null
  // Prefer the canonical D1 field first, then accept two common
  // alternate spellings if a future migration adds them. Catalog is
  // intentionally NOT consulted — see file header.
  const candidates = [
    invItem.costPerUnit,
    invItem.unitCost,
    invItem.pricePerUnit,
  ]
  for (const c of candidates) {
    const v = asFiniteNumber(c)
    if (v != null && v > 0) return v
  }
  return null
}

/**
 * Estimate the cost of a single planned spray-program item against the
 * provided context. Read-only; never mutates the inputs.
 *
 * @param {Object} item               spray_program_items row (planner shape)
 * @param {Object} [context]
 * @param {Array}  [context.inventoryProducts]  inventoryStore items[]
 * @returns {{
 *   status: 'estimated' | 'missing-cost-basis' | 'missing-quantity'
 *         | 'not-comparable-unit' | 'cost-basis-found-unit-conversion-needed',
 *   estimatedCost: number|null,
 *   currency:      string,
 *   basis:         'inventory' | null,
 *   matchedVia:    'id' | 'name' | null,
 *   message:       string,
 *   warnings:      string[],
 * }}
 */
export function estimateProgramItemCost(item, context = {}) {
  const inv = context?.inventoryProducts ?? []
  const warnings = []

  if (!item) {
    return shape('missing-cost-basis', null, null, 'No item supplied.', warnings, null)
  }

  // 1) Resolve the inventory cost-basis row by explicit link first, then
  //    by exact name within the same course (Phase 7U.4 — seeded/imported
  //    programs carry no inventory link).
  const resolved = resolveInventoryForItem(item, inv)
  if (!resolved) {
    return shape(
      'missing-cost-basis', null, null,
      'No matching inventory item — cannot estimate cost.',
      warnings, null,
    )
  }
  const invItem = resolved.row
  const matchedVia = resolved.via
  const unitCost = inventoryUnitCost(invItem)

  if (unitCost == null) {
    return shape(
      'missing-cost-basis', null, null,
      matchedVia === 'name'
        ? 'Matched inventory by name, but it has no unit cost recorded.'
        : 'Linked inventory has no unit cost recorded.',
      warnings, matchedVia,
    )
  }

  // 2) Planned quantity = rateValue (per-area, not per-application).
  //    We refuse to invent an area multiplier — the planner does not
  //    store treated-area in a comparable form yet.
  const rateValue = asFiniteNumber(item.rateValue)
  if (rateValue == null || !isFinitePositive(rateValue)) {
    return shape(
      'missing-quantity', null, 'inventory',
      'Planned rate value missing — cannot estimate cost.',
      warnings, matchedVia,
    )
  }

  // 3) Units must match exactly (normalized) because we explicitly
  //    refuse to guess a conversion factor. The cost unit is the
  //    cost-basis unit (cost_unit) when present, else the stock unit.
  const rateUnit = normalizeUnit(item.rateUnit)
  const invUnit  = normalizeUnit(invItem.costUnit ?? invItem.unit)
  if (!rateUnit || !invUnit) {
    // Cost basis IS on file (unitCost != null) but a unit is missing —
    // surface as conversion-needed rather than a blanket "missing".
    return shape(
      'cost-basis-found-unit-conversion-needed', null, 'inventory',
      'Cost basis found, but a unit is missing — unit conversion needed.',
      warnings, matchedVia,
    )
  }
  if (rateUnit !== invUnit) {
    // The cost basis exists; the planned rate is per-area while the cost
    // is per-volume/weight (or otherwise differs). We will NOT guess a
    // conversion, but we must NOT hide the item or call it "missing" —
    // the cost basis is genuinely on file.
    return shape(
      'cost-basis-found-unit-conversion-needed', null, 'inventory',
      `Cost basis found ($${unitCost}/${invItem.costUnit ?? invItem.unit}), but planned rate unit "${item.rateUnit}" needs conversion to estimate cost.`,
      warnings, matchedVia,
    )
  }

  // 4) Estimate.
  const estimated = roundCents(unitCost * rateValue)
  return shape(
    'estimated', estimated, 'inventory',
    'Estimated from inventory unit cost × planned rate.',
    warnings, matchedVia,
  )
}

/**
 * Roll up cost estimates for one program. Read-only; never mutates the
 * inputs.
 *
 * @param {Object}  program
 * @param {Array}   items
 * @param {Object}  [context]
 * @returns {{
 *   programId:           string|null,
 *   estimatedTotal:      number,
 *   currency:            string,
 *   estimatedItems:      number,
 *   missingCostBasis:    number,
 *   missingQuantity:     number,
 *   notComparableUnits:  number,
 *   totalItems:          number,
 *   items: Array<{ itemId: string|null, estimate: ReturnType<typeof estimateProgramItemCost> }>,
 * }}
 */
export function buildProgramCostSummary(program, items = [], context = {}) {
  let total = 0
  let estimatedItems = 0
  let missingCostBasis = 0
  let missingQuantity = 0
  let notComparableUnits = 0
  let conversionNeeded = 0
  const detailed = []

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue
    const est = estimateProgramItemCost(item, context)
    detailed.push({ itemId: item.id ?? null, estimate: est })
    switch (est.status) {
      case 'estimated':
        if (typeof est.estimatedCost === 'number') {
          total += est.estimatedCost
          estimatedItems++
        }
        break
      case 'missing-cost-basis':   missingCostBasis++; break
      case 'missing-quantity':     missingQuantity++; break
      case 'not-comparable-unit':  notComparableUnits++; break
      case 'cost-basis-found-unit-conversion-needed': conversionNeeded++; break
      default: break
    }
  }

  return {
    programId:          program?.id ?? null,
    estimatedTotal:     roundCents(total),
    currency:           DEFAULT_CURRENCY,
    estimatedItems,
    missingCostBasis,
    missingQuantity,
    notComparableUnits,
    conversionNeeded,
    totalItems:         detailed.length,
    items:              detailed,
  }
}

/**
 * Build summaries for every program in the provided map. Programs with
 * no cached items (lazy cache miss) are summarized against an empty
 * list rather than silently dropped — that way the UI can still show
 * "0 items estimated" without a spurious zero.
 *
 * @param {Array}  programs
 * @param {Object} itemsByProgramId   { [programId]: items[] }
 * @param {Object} [context]
 * @returns {Array<ReturnType<typeof buildProgramCostSummary>>}
 */
export function buildProgramCostSummaries(programs = [], itemsByProgramId = {}, context = {}) {
  const out = []
  for (const program of Array.isArray(programs) ? programs : []) {
    if (!program) continue
    const list = itemsByProgramId?.[program.id]
    out.push(buildProgramCostSummary(program, Array.isArray(list) ? list : [], context))
  }
  return out
}

/**
 * Format an estimated cost for display. Returns the em-dash "—" when
 * the value is missing or not finite — never a misleading "$0.00".
 *
 * @param {number|null|undefined} value
 * @param {string} [currency='USD']
 * @returns {string}
 */
export function formatEstimatedCost(value, currency = DEFAULT_CURRENCY) {
  if (value == null || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    // Defensive: unknown locale / currency. Fall back to a plain
    // 2-decimal string so we never throw inside a render path.
    return `${currency} ${(Math.round(value * 100) / 100).toFixed(2)}`
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────
function shape(status, estimatedCost, basis, message, warnings, matchedVia = null) {
  return {
    status,
    estimatedCost,
    currency: DEFAULT_CURRENCY,
    basis,
    matchedVia,
    message,
    warnings: Array.isArray(warnings) ? warnings.slice() : [],
  }
}
function roundCents(n) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

// Exposed for the smoke; not part of the public render contract.
export const __TEST = {
  DEFAULT_CURRENCY,
  normalizeUnit,
  normalizeName,
  inventoryUnitCost,
  resolveInventoryForItem,
}
