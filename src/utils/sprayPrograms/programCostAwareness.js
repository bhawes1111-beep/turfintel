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

// ── Phase 7V.1 — planned rate → total quantity unit conversion ─────────────
//
// Convert a planned application RATE (per-area) into a TOTAL product
// QUANTITY in the inventory cost unit (gal or lb), so cost = qty × cost.
//
// SAFE conversions only. We convert volume↔volume and weight↔weight, and
// fluid-ounce → gallon (÷128). We NEVER cross volume↔weight, and never
// guess package sizes (bottles/cases/bags/packs). Anything outside the
// supported set returns ok:false with an explicit status so the report
// surfaces it honestly rather than as $0.

const SQFT_PER_ACRE = 43560
const FLOZ_PER_GAL  = 128

/**
 * Normalize a planned rate unit into a canonical { measure, per } shape.
 *   measure: 'gal' | 'floz' | 'lb' | null
 *   per:     'acre' | '1000sqft' | null
 * Returns null when the unit is unrecognized/unsupported.
 *
 * @param {string} unit
 * @returns {{ measure: 'gal'|'floz'|'lb', per: 'acre'|'1000sqft' }|null}
 */
export function normalizeProgramRateUnit(unit) {
  const u = normalizeUnit(unit)
  if (!u) return null
  // Split "<numerator>/<denominator>".
  const slash = u.indexOf('/')
  if (slash < 0) return null
  const numRaw = u.slice(0, slash).trim()
  const denRaw = u.slice(slash + 1).trim()

  // Numerator → measure.
  let measure = null
  if (/^(gal|gallon|gallons)$/.test(numRaw)) measure = 'gal'
  else if (/^(fl ?oz|floz|fluid ounce|fluid ounces)$/.test(numRaw)) measure = 'floz'
  else if (/^(oz|ounce|ounces)$/.test(numRaw)) measure = 'floz' // ounces in a rate are fluid for liquids; weight path handled by 'lb' only
  else if (/^(lb|lbs|pound|pounds|#)$/.test(numRaw)) measure = 'lb'
  else return null

  // Denominator → per-area basis.
  let per = null
  if (/^(acre|acres|a|ac)$/.test(denRaw)) per = 'acre'
  else if (/^(1000 sq ft|1000sqft|1000 sqft|1000 sq\. ft\.|1000|m|1000 ft2)$/.test(denRaw)) per = '1000sqft'
  else return null

  return { measure, per }
}

/**
 * Resolve the treated area for a program/item, in BOTH acres and sq ft.
 *
 * Preferred order:
 *   1. explicit item.areaAcres (if a planner ever sets it)
 *   2. program.defaultAcres / program.areaAcres (structured field)
 *   3. course config acreage for the item's target area (e.g. greens)
 *   4. seeded program NOTES: "Default acres: ~N acres" (Crosswinds)
 *   5. otherwise null → caller emits 'area-needed-for-estimate'
 *
 * Never hardcodes a global default. Returns
 *   { acres, sqFt, source } | { acres: null, sqFt: null, source: null }
 *
 * @param {Object} args
 * @param {Object} [args.item]
 * @param {Object} [args.program]
 * @param {Object} [args.courseConfig]  course row with acres_* fields
 * @returns {{ acres: number|null, sqFt: number|null, source: string|null }}
 */
export function resolveProgramArea({ item, program, courseConfig } = {}) {
  const fromAcres = (acres, source) => ({
    acres, sqFt: acres * SQFT_PER_ACRE, source,
  })

  // 1) explicit on the item.
  const itemAcres = asFiniteNumber(item?.areaAcres)
  if (itemAcres != null && itemAcres > 0) return fromAcres(itemAcres, 'item.areaAcres')

  // 2) structured field on the program.
  const progAcres = asFiniteNumber(program?.defaultAcres ?? program?.areaAcres)
  if (progAcres != null && progAcres > 0) return fromAcres(progAcres, 'program.defaultAcres')

  // 3) course config acreage for the target area.
  if (courseConfig) {
    const area = normalizeUnit(item?.targetArea ?? program?.targetArea)
    const map = {
      greens:   courseConfig.acresGreens   ?? courseConfig.acres_greens,
      tees:     courseConfig.acresTees     ?? courseConfig.acres_tees,
      fairways: courseConfig.acresFairways ?? courseConfig.acres_fairways,
      rough:    courseConfig.acresRough    ?? courseConfig.acres_rough,
    }
    const byArea = asFiniteNumber(map[area])
    if (byArea != null && byArea > 0) return fromAcres(byArea, `courseConfig.${area}`)
    const sprayable = asFiniteNumber(courseConfig.acresSprayable ?? courseConfig.acres_sprayable)
    if (sprayable != null && sprayable > 0) return fromAcres(sprayable, 'courseConfig.sprayable')
  }

  // 4) seeded program notes: "Default acres: ~4 acres".
  const notes = program?.notes
  if (typeof notes === 'string') {
    const m = notes.match(/default acres:\s*~?\s*([\d.]+)\s*acres?/i)
    const parsed = m ? asFiniteNumber(m[1]) : null
    if (parsed != null && parsed > 0) return fromAcres(parsed, 'program.notes')
  }

  return { acres: null, sqFt: null, source: null }
}

/**
 * Convert a planned rate into a total product quantity in the cost unit.
 *
 * @param {Object} args
 * @param {number}  args.rateValue
 * @param {string}  args.rateUnit
 * @param {string}  args.costUnit    normalized inventory cost unit ('gal'|'lb'|...)
 * @param {number|null} args.areaAcres
 * @param {number|null} args.areaSqFt
 * @returns {{
 *   ok: boolean,
 *   quantity: number|null,
 *   unit: 'gal'|'lb'|null,
 *   status: string,
 *   reason: string,
 * }}
 */
export function estimatePlannedQuantityFromRate({ rateValue, rateUnit, costUnit, areaAcres, areaSqFt }) {
  const rv = asFiniteNumber(rateValue)
  if (rv == null || rv <= 0) {
    return { ok: false, quantity: null, unit: null, status: 'missing-quantity', reason: 'No positive planned rate value.' }
  }
  const parsed = normalizeProgramRateUnit(rateUnit)
  if (!parsed) {
    return { ok: false, quantity: null, unit: null, status: 'unsupported-rate-unit', reason: `Rate unit "${rateUnit}" is not a supported per-area unit.` }
  }
  const cost = normalizeUnit(costUnit)
  if (cost !== 'gal' && cost !== 'lb') {
    return { ok: false, quantity: null, unit: null, status: 'unsupported-cost-unit', reason: `Cost unit "${costUnit}" is not gal or lb — cannot convert safely.` }
  }

  // Need area in the matching basis.
  const acres = asFiniteNumber(areaAcres)
  const sqFt  = asFiniteNumber(areaSqFt)
  const area  = parsed.per === 'acre' ? acres : sqFt
  if (area == null || area <= 0) {
    return { ok: false, quantity: null, unit: null, status: 'area-needed-for-estimate', reason: 'Treated area is not available for this program.' }
  }

  // total in the rate's measure unit.
  // per 1000 sq ft: multiply by (sqFt / 1000).
  const multiplier = parsed.per === 'acre' ? area : (area / 1000)
  const totalInMeasure = rv * multiplier   // gal, floz, or lb

  // Map measure → cost unit. Cross volume↔weight is never allowed.
  if (cost === 'gal') {
    if (parsed.measure === 'gal')  return { ok: true, quantity: totalInMeasure, unit: 'gal', status: 'estimated', reason: 'gal rate → gal total.' }
    if (parsed.measure === 'floz') return { ok: true, quantity: totalInMeasure / FLOZ_PER_GAL, unit: 'gal', status: 'estimated', reason: 'fluid-oz rate → gal total (÷128).' }
    // measure === 'lb' but cost is gal → weight↔volume mismatch.
    return { ok: false, quantity: null, unit: null, status: 'cost-basis-found-unit-conversion-needed', reason: 'Weight rate vs volume cost — cannot convert safely.' }
  }
  // cost === 'lb'
  if (parsed.measure === 'lb')   return { ok: true, quantity: totalInMeasure, unit: 'lb', status: 'estimated', reason: 'lb rate → lb total.' }
  // gal/floz rate but cost is lb → volume↔weight mismatch.
  return { ok: false, quantity: null, unit: null, status: 'cost-basis-found-unit-conversion-needed', reason: 'Volume rate vs weight cost — cannot convert safely.' }
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

  // Name-match fallback is a softer signal than an explicit link — flag
  // it so the report can show a stewardship hint without blocking the
  // estimate.
  if (matchedVia === 'name') {
    warnings.push('Cost basis matched by product name, not an explicit inventory link.')
  }

  // 2) Planned rate value must be present + positive.
  const rateValue = asFiniteNumber(item.rateValue)
  if (rateValue == null || !isFinitePositive(rateValue)) {
    return shape(
      'missing-quantity', null, 'inventory',
      'Planned rate value missing — cannot estimate cost.',
      warnings, matchedVia,
    )
  }

  // 3) Resolve units. The cost unit is cost_unit when present, else the
  //    stock unit.
  const rateUnit = normalizeUnit(item.rateUnit)
  const costUnit = normalizeUnit(invItem.costUnit ?? invItem.unit)
  if (!rateUnit || !costUnit) {
    return shape(
      'cost-basis-found-unit-conversion-needed', null, 'inventory',
      'Cost basis found, but a unit is missing — unit conversion needed.',
      warnings, matchedVia,
    )
  }

  // 3a) Exact unit match — estimate directly (rate IS the per-unit qty).
  if (rateUnit === costUnit) {
    const estimated = roundCents(unitCost * rateValue)
    return shape(
      'estimated', estimated, 'inventory',
      'Estimated from inventory unit cost × planned rate.',
      warnings, matchedVia,
    )
  }

  // 3b) Phase 7V.1 — units differ. Attempt a SAFE per-area conversion to
  //     a total quantity in the cost unit (gal / lb), then × cost.
  //     Requires the program's treated area.
  const area = resolveProgramArea({
    item,
    program: context?.program ?? null,
    courseConfig: context?.courseConfig ?? null,
  })
  const conv = estimatePlannedQuantityFromRate({
    rateValue,
    rateUnit,
    costUnit,
    areaAcres: area.acres,
    areaSqFt:  area.sqFt,
  })

  if (conv.ok) {
    const estimated = roundCents(unitCost * conv.quantity)
    const out = shape(
      'estimated', estimated, 'inventory',
      `Estimated: ${conv.quantity.toFixed(2)} ${conv.unit} × $${unitCost}/${conv.unit}` +
      (area.source ? ` (using ${area.acres.toFixed(2)} acres, ${area.source}).` : '.'),
      warnings, matchedVia,
    )
    out.estimatedQuantity = roundCents(conv.quantity)
    out.quantityUnit      = conv.unit
    out.unitCost          = unitCost
    out.areaAcres         = area.acres
    out.areaSource        = area.source
    return out
  }

  // Conversion could not complete — surface the precise reason. The
  // 'area-needed-for-estimate', 'unsupported-rate-unit', and
  // 'unsupported-cost-unit' statuses are all "cost basis found but we
  // cannot estimate yet" — never $0, never hidden.
  if (conv.status === 'area-needed-for-estimate') {
    return shape(
      'area-needed-for-estimate', null, 'inventory',
      `Cost basis found ($${unitCost}/${costUnit}), but the treated area is not set on this program — area needed to estimate.`,
      warnings, matchedVia,
    )
  }
  if (conv.status === 'unsupported-rate-unit') {
    return shape(
      'unsupported-rate-unit', null, 'inventory',
      `Cost basis found ($${unitCost}/${costUnit}), but planned rate unit "${item.rateUnit}" is not a supported per-area unit.`,
      warnings, matchedVia,
    )
  }
  if (conv.status === 'unsupported-cost-unit') {
    return shape(
      'unsupported-cost-unit', null, 'inventory',
      `Cost basis found, but cost unit "${invItem.costUnit ?? invItem.unit}" is not gal or lb — cannot convert safely.`,
      warnings, matchedVia,
    )
  }
  // Default: genuine volume↔weight mismatch.
  return shape(
    'cost-basis-found-unit-conversion-needed', null, 'inventory',
    `Cost basis found ($${unitCost}/${costUnit}), but planned rate unit "${item.rateUnit}" cannot be safely converted (${conv.reason}).`,
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
  let areaNeeded = 0
  let unsupportedUnit = 0
  const detailed = []

  // Inject the program so the estimator's area resolver can read
  // program.defaultAcres / program.notes (Phase 7V.1). Caller-provided
  // context.program wins if explicitly set.
  const itemContext = { ...context, program: context?.program ?? program }

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue
    const est = estimateProgramItemCost(item, itemContext)
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
      case 'area-needed-for-estimate': areaNeeded++; break
      case 'unsupported-rate-unit':
      case 'unsupported-cost-unit':  unsupportedUnit++; break
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
    areaNeeded,
    unsupportedUnit,
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
  SQFT_PER_ACRE,
  FLOZ_PER_GAL,
}
