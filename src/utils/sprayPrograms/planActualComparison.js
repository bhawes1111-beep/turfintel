// Phase 7F (5/?) — Plan vs Actual comparison.
//
// Pure-compute, read-only comparison between a planned spray program
// item and the completed spray_records row it's linked to. Returns a
// structured result the planner can render as compact chips.
//
// Strictly NO:
//   - recommendations / "should / correct / pass / fail"
//   - scores or grades
//   - auto-flips of item.status or linked_spray_record_id
//   - any D1 writes
//   - any fetch / store / React imports
//
// Missing data is reported as a status, never guessed.

// ── Helpers ────────────────────────────────────────────────────────────────

const NAME_PUNCT = /[^a-z0-9]+/g

function normalizeName(s) {
  if (s == null) return ''
  return String(s).toLowerCase().trim().replace(NAME_PUNCT, '-').replace(/^-+|-+$/g, '')
}

function normalizeArea(s) {
  if (s == null) return ''
  return String(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

function isValidDate(d) {
  if (d == null || d === '') return false
  return Number.isFinite(Date.parse(d))
}

function parseDay(d) {
  // Truncate to midnight UTC for stable day-offset arithmetic; planned
  // dates store ISO date-only strings ("2026-06-01") so wall-clock
  // timezone drift doesn't matter once both sides round to midnight.
  const t = Date.parse(d)
  if (!Number.isFinite(t)) return null
  return Math.floor(t / 86_400_000)
}

// Rate-unit normalization. Planner stores e.g. "oz/1000 sq ft"; the
// completed-record rate string carries the formatRateLabel output, e.g.
// "3.2 oz / 1,000 sq ft". Both collapse to a canonical key so equality
// holds regardless of formatting accidents.
function normalizeRateUnit(s) {
  if (s == null) return ''
  return String(s)
    .toLowerCase()
    .replace(/,/g, '')          // 1,000 → 1000
    .replace(/\s+/g, '')        // strip whitespace
    .replace(/[/]+/g, '/')      // collapse repeated slashes
    .replace(/fluidoz/g, 'oz')  // fluid oz → oz (planner uses fl oz too)
}

// Pull the leading numeric out of a rate string like "3.2 oz / 1,000 sq ft".
function extractRateNumber(s) {
  if (s == null) return null
  const m = String(s).match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function extractRateUnit(s) {
  if (s == null) return ''
  const stripped = String(s).replace(/^-?\d+(?:\.\d+)?\s*/, '')
  return normalizeRateUnit(stripped)
}

// ── Date comparison ───────────────────────────────────────────────────────

/**
 * @param {Object} planned   spray_program_items row
 * @param {Object} actual    spray_records row
 * @returns {{ status, planned, actual, dayOffset }}
 */
export function comparePlannedActualDate(planned, actual) {
  const aDate = actual?.date ?? null
  if (!isValidDate(aDate)) {
    const plannedLabel = labelPlannedDates(planned)
    return {
      status: 'missing-actual',
      planned: plannedLabel,
      actual: null,
      dayOffset: null,
    }
  }
  const aDay = parseDay(aDate)
  const start = planned?.plannedStartDate ?? null
  const end   = planned?.plannedEndDate   ?? null
  const sDay = isValidDate(start) ? parseDay(start) : null
  const eDay = isValidDate(end)   ? parseDay(end)   : null

  // No planned anchor at all.
  if (sDay == null && eDay == null) {
    return {
      status: 'missing-planned',
      planned: null,
      actual: aDate,
      dayOffset: null,
    }
  }

  // Range present (or single anchor — treated as a 1-day window).
  const rangeStart = sDay ?? eDay
  const rangeEnd   = eDay ?? sDay
  // dayOffset is "days the actual missed the nearest range edge by",
  // signed: negative = before window, positive = after, 0 = inside.
  let offset = 0
  if (aDay < rangeStart) offset = aDay - rangeStart
  else if (aDay > rangeEnd) offset = aDay - rangeEnd
  const inside = aDay >= rangeStart && aDay <= rangeEnd

  return {
    status:  inside ? 'inside-window' : 'outside-window',
    planned: labelPlannedDates(planned),
    actual:  aDate,
    dayOffset: offset,
  }
}

function labelPlannedDates(planned) {
  if (!planned) return null
  if (planned.plannedStartDate && planned.plannedEndDate) {
    return planned.plannedStartDate === planned.plannedEndDate
      ? planned.plannedStartDate
      : `${planned.plannedStartDate} to ${planned.plannedEndDate}`
  }
  if (planned.plannedStartDate) return planned.plannedStartDate
  if (planned.plannedEndDate)   return planned.plannedEndDate
  return null
}

// ── Product comparison ────────────────────────────────────────────────────

/**
 * Match planned product against the actual record's products[]. Multiple
 * actual products is fine — any-match wins. Match precedence:
 *   1. inventoryItemId equality
 *   2. exact normalized productName
 *   3. productCatalogId equality WHEN the actual record's product carries
 *      one (most don't today — Phase 7E spray save payload doesn't echo
 *      the FK).
 * No fuzzy matching.
 *
 * @param {Object} planned
 * @param {Object} actual
 * @param {Object} [context]   reserved for future tier expansion; unused.
 * @returns {{ status, planned, actual }}
 */
export function comparePlannedActualProduct(planned, actual /*, context */) {
  const products = Array.isArray(actual?.products) ? actual.products : []
  const actualNames = products.map(p => p?.name).filter(Boolean)

  const plannedHas = !!(planned?.productName || planned?.inventoryItemId || planned?.productCatalogId)
  if (!plannedHas) {
    return {
      status: 'missing-planned',
      planned: null,
      actual: actualNames,
    }
  }
  if (products.length === 0) {
    return {
      status: 'missing-actual',
      planned: planned?.productName ?? null,
      actual: [],
    }
  }

  const plannedInvId = planned?.inventoryItemId ?? null
  const plannedCatId = planned?.productCatalogId ?? null
  const plannedNorm  = normalizeName(planned?.productName)

  for (const p of products) {
    if (plannedInvId && p?.inventoryItemId && p.inventoryItemId === plannedInvId) {
      return { status: 'match', planned: planned?.productName ?? null, actual: actualNames }
    }
    if (plannedNorm && normalizeName(p?.name) === plannedNorm) {
      return { status: 'match', planned: planned?.productName ?? null, actual: actualNames }
    }
    if (plannedCatId && p?.productCatalogId && p.productCatalogId === plannedCatId) {
      return { status: 'match', planned: planned?.productName ?? null, actual: actualNames }
    }
  }

  return {
    status:  'different',
    planned: planned?.productName ?? null,
    actual:  actualNames,
  }
}

// ── Area comparison ───────────────────────────────────────────────────────

/**
 * Exact-text area match (normalized: lowercase + collapsed whitespace).
 * Planned: spray_program_items.target_area.
 * Actual:  spray_records.area (or .areas[0].name if it ever lands).
 *
 * @returns {{ status, planned, actual }}
 */
export function comparePlannedActualArea(planned, actual) {
  const plannedArea = planned?.targetArea ?? null
  // Fall back to the first nested areas[] entry name when the flat
  // `area` field is absent. Wrap the array probe so a missing array
  // never short-circuits the chain to a stray `false`.
  const nestedArea = Array.isArray(actual?.areas) && actual.areas[0]?.name
    ? actual.areas[0].name : null
  const actualArea = actual?.area ?? nestedArea ?? null
  const pn = normalizeArea(plannedArea)
  const an = normalizeArea(actualArea)

  if (!pn && !an) return { status: 'missing-planned', planned: null, actual: null }
  if (!pn)        return { status: 'missing-planned', planned: null, actual: actualArea }
  if (!an)        return { status: 'missing-actual',  planned: plannedArea, actual: null }
  if (pn === an)  return { status: 'match',           planned: plannedArea, actual: actualArea }
  return            { status: 'different',           planned: plannedArea, actual: actualArea }
}

// ── Rate comparison ───────────────────────────────────────────────────────

/**
 * Exact numeric + normalized-unit match against the actual record's
 * matching product. If the planned product can't be located among the
 * actual products, OR the actual rate string isn't parseable, returns
 * not-compared rather than guessing.
 *
 * @returns {{ status, planned, actual }}
 */
export function comparePlannedActualRate(planned, actual) {
  const plannedValue = Number.isFinite(planned?.rateValue) ? Number(planned.rateValue) : null
  const plannedUnit  = planned?.rateUnit ?? null
  if (plannedValue == null || !plannedUnit) {
    return {
      status: 'missing-planned',
      planned: formatPlannedRate(planned),
      actual: null,
    }
  }

  // Find the matching actual product.
  const products = Array.isArray(actual?.products) ? actual.products : []
  if (products.length === 0) {
    return {
      status: 'missing-actual',
      planned: formatPlannedRate(planned),
      actual: null,
    }
  }

  const matched = findMatchingActualProduct(planned, products)
  if (!matched) {
    return {
      status: 'not-compared',
      planned: formatPlannedRate(planned),
      actual: null,
    }
  }

  const actualRaw = matched.rate
  const an  = extractRateNumber(actualRaw)
  const au  = extractRateUnit(actualRaw)
  if (an == null || !au) {
    return {
      status: 'not-compared',
      planned: formatPlannedRate(planned),
      actual: actualRaw ?? null,
    }
  }

  const sameValue = Math.abs(an - plannedValue) < 1e-6
  const sameUnit  = normalizeRateUnit(plannedUnit) === au
  if (sameValue && sameUnit) {
    return { status: 'match', planned: formatPlannedRate(planned), actual: actualRaw }
  }
  return { status: 'different', planned: formatPlannedRate(planned), actual: actualRaw }
}

function formatPlannedRate(planned) {
  if (!planned) return null
  if (planned.rateValue == null || planned.rateUnit == null) return null
  return `${planned.rateValue} ${planned.rateUnit}`
}

function findMatchingActualProduct(planned, products) {
  const plannedInvId = planned?.inventoryItemId ?? null
  const plannedCatId = planned?.productCatalogId ?? null
  const plannedNorm  = normalizeName(planned?.productName)
  for (const p of products) {
    if (plannedInvId && p?.inventoryItemId && p.inventoryItemId === plannedInvId) return p
    if (plannedNorm && normalizeName(p?.name) === plannedNorm) return p
    if (plannedCatId && p?.productCatalogId && p.productCatalogId === plannedCatId) return p
  }
  return null
}

// ── Summary builder ───────────────────────────────────────────────────────

/**
 * Build the neutral-language chip strip from a comparison result.
 * Stewardship vocabulary only — no judgment words.
 */
export function summarizePlanActualComparison(result) {
  const out = []

  const d = result?.date
  if (d) {
    if (d.status === 'inside-window') {
      out.push({ type: 'info', label: 'Date', value: 'Completed inside planned window' })
    } else if (d.status === 'outside-window') {
      const off = d.dayOffset == null ? null : Math.abs(d.dayOffset)
      const tail = off != null
        ? ` (${off} day${off !== 1 ? 's' : ''} ${d.dayOffset < 0 ? 'before' : 'after'})`
        : ''
      out.push({ type: 'info', label: 'Date', value: `Completed outside planned window${tail}` })
    } else if (d.status === 'missing-planned') {
      out.push({ type: 'info', label: 'Date', value: 'No planned date to compare' })
    } else if (d.status === 'missing-actual') {
      out.push({ type: 'info', label: 'Date', value: 'No completed date to compare' })
    }
  }

  const p = result?.product
  if (p) {
    if (p.status === 'match') {
      out.push({ type: 'info', label: 'Product', value: 'Planned product appears in completed record' })
    } else if (p.status === 'different') {
      out.push({ type: 'info', label: 'Product', value: 'Different recorded product' })
    } else if (p.status === 'missing-planned') {
      out.push({ type: 'info', label: 'Product', value: 'No planned product to compare' })
    } else if (p.status === 'missing-actual') {
      out.push({ type: 'info', label: 'Product', value: 'No products recorded on the completed spray' })
    }
  }

  const a = result?.area
  if (a) {
    if (a.status === 'match') {
      out.push({ type: 'info', label: 'Area', value: 'Area matches recorded application' })
    } else if (a.status === 'different') {
      out.push({ type: 'info', label: 'Area', value: 'Area differs from recorded application' })
    } else if (a.status === 'missing-planned') {
      out.push({ type: 'info', label: 'Area', value: 'No planned area to compare' })
    } else if (a.status === 'missing-actual') {
      out.push({ type: 'info', label: 'Area', value: 'No area recorded on the completed spray' })
    }
  }

  const r = result?.rate
  if (r) {
    if (r.status === 'match') {
      out.push({ type: 'info', label: 'Rate', value: 'Rate matches recorded value' })
    } else if (r.status === 'different') {
      out.push({ type: 'info', label: 'Rate', value: 'Rate differs from recorded value' })
    } else if (r.status === 'missing-planned') {
      out.push({ type: 'info', label: 'Rate', value: 'No planned rate to compare' })
    } else if (r.status === 'missing-actual') {
      out.push({ type: 'info', label: 'Rate', value: 'No recorded rate to compare' })
    } else if (r.status === 'not-compared') {
      out.push({ type: 'info', label: 'Rate', value: 'Rate not compared' })
    }
  }

  return out
}

// ── Top-level builder ─────────────────────────────────────────────────────

/**
 * @param {Object} plannedItem       spray_program_items row
 * @param {Object} completedSpray    spray_records row (already linked)
 * @param {Object} [context]         reserved for future expansion
 * @returns {Object} comparison record (see file header)
 */
export function buildPlanActualComparison(plannedItem, completedSpray, context = {}) {
  if (!plannedItem || !completedSpray) {
    return {
      linked: false,
      date: null, product: null, area: null, rate: null,
      summary: [],
    }
  }
  const date    = comparePlannedActualDate(plannedItem, completedSpray)
  const product = comparePlannedActualProduct(plannedItem, completedSpray, context)
  const area    = comparePlannedActualArea(plannedItem, completedSpray)
  const rate    = comparePlannedActualRate(plannedItem, completedSpray)
  const result  = { linked: true, date, product, area, rate }
  return { ...result, summary: summarizePlanActualComparison(result) }
}

// Exported for the smoke; not part of the public render contract.
export const __TEST = {
  normalizeName, normalizeArea, normalizeRateUnit,
  extractRateNumber, extractRateUnit,
  parseDay, labelPlannedDates, findMatchingActualProduct,
}
