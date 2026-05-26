// Phase 7K (1/?) — Inventory cost-basis import-mapping foundation.
//
// Pure-compute helpers that take an array of imported rows (the shape
// a future CSV/Excel parser will hand us) and project them onto the
// inventory items array so a steward can review what WOULD apply
// before any write happens. Nothing here uploads, parses files, or
// writes to D1.
//
// Strict invariants:
//   - PURE: no React, no fetch, no store imports, no mutation.
//   - inventoryProducts is read-only; the review is a fresh structure.
//   - missing data is COUNTED, never guessed.
//   - never invents a unit, a name, or a cost value.
//   - never auto-applies a candidate (this is a review model only).
//   - never references product_catalog, budget, invoice, or ledger.
//   - never references AI / PDF parsers.

// ── Column aliasing ──────────────────────────────────────────────────────
//
// Each canonical key maps to a list of accepted column names. Matching is
// case-insensitive after lower-casing + whitespace collapse so "Item
// Name", "item_name", and "ITEM NAME" all hit the same bucket.
const COLUMN_ALIASES = {
  name: [
    'item', 'product', 'product name', 'inventory item', 'name',
    'item name', 'productname', 'itemname',
  ],
  inventoryItemId: [
    'id', 'inventory id', 'inventoryid', 'inventory item id', 'inventoryitemid',
  ],
  costPerUnit: [
    'cost', 'unit cost', 'cost per unit', 'price', 'price per unit',
    'unitcost', 'costperunit', 'priceperunit',
  ],
  costUnit: [
    'unit', 'cost unit', 'uom', 'unit of measure',
    'costunit', 'unitofmeasure',
  ],
  costSource: [
    'source', 'cost source', 'costsource',
  ],
  costNotes: [
    'notes', 'cost notes', 'costnotes', 'note',
  ],
}

const COST_SOURCE_VALUES = new Set(['manual', 'imported', 'invoice', 'unknown'])

function normalizeKey(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function normalizeName(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickFromRow(row, canonicalKey) {
  if (!row || typeof row !== 'object') return undefined
  const targets = new Set(COLUMN_ALIASES[canonicalKey] ?? [])
  for (const [k, v] of Object.entries(row)) {
    if (targets.has(normalizeKey(k))) return v
  }
  return undefined
}

function asString(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function asFiniteNumber(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // Strip leading currency symbols / spaces so "$ 4.25" parses cleanly.
  const cleaned = String(v).trim().replace(/^[$€£¥]\s*/, '').replace(/,/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalize a single import row's keys onto the canonical cost-basis
 * shape. Unknown columns are ignored. The input row is never mutated.
 *
 * @param {Object} row
 * @returns {{
 *   name: string|null,
 *   inventoryItemId: string|null,
 *   costPerUnit: number|null,
 *   costUnit: string|null,
 *   costSource: string|null,
 *   costNotes: string|null,
 * }}
 */
export function normalizeCostImportColumns(row) {
  if (!row || typeof row !== 'object') {
    return {
      name: null, inventoryItemId: null,
      costPerUnit: null, costUnit: null, costSource: null, costNotes: null,
    }
  }
  const name            = asString(pickFromRow(row, 'name'))
  const inventoryItemId = asString(pickFromRow(row, 'inventoryItemId'))
  const costPerUnit     = asFiniteNumber(pickFromRow(row, 'costPerUnit'))
  const costUnit        = asString(pickFromRow(row, 'costUnit'))
  let   costSource      = asString(pickFromRow(row, 'costSource'))
  if (costSource) costSource = costSource.toLowerCase()
  const costNotes       = asString(pickFromRow(row, 'costNotes'))
  return { name, inventoryItemId, costPerUnit, costUnit, costSource, costNotes }
}

// ── Per-row mapping ──────────────────────────────────────────────────────

/**
 * Map a single imported row onto the inventory list. Returns the
 * review row the future UI will render.
 *
 * @param {Object} row
 * @param {Array}  inventoryProducts
 * @param {Object} [options]
 * @param {number} [options.rowIndex=0]   carried verbatim onto the result
 * @returns {{
 *   rowIndex: number,
 *   status: 'ready' | 'unmatched' | 'ambiguous' | 'invalid',
 *   inventoryItemId: string|null,
 *   inventoryName: string|null,
 *   importedName: string|null,
 *   costPerUnit: number|null,
 *   costUnit: string|null,
 *   costSource: string|null,
 *   costNotes: string|null,
 *   message: string,
 * }}
 */
export function mapCostImportRow(row, inventoryProducts = [], options = {}) {
  const rowIndex = Number.isFinite(options?.rowIndex) ? options.rowIndex : 0
  const norm = normalizeCostImportColumns(row)
  const invs = Array.isArray(inventoryProducts) ? inventoryProducts : []

  // 1) Match by inventoryItemId first (cheapest + most explicit).
  let invItem = null
  if (norm.inventoryItemId) {
    invItem = invs.find(i => i?.id === norm.inventoryItemId) ?? null
  }
  // 2) Otherwise match by exact normalized name.
  let ambiguous = false
  if (!invItem && norm.name) {
    const target = normalizeName(norm.name)
    const candidates = invs.filter(i => normalizeName(i?.name) === target)
    if (candidates.length === 1) {
      invItem = candidates[0]
    } else if (candidates.length > 1) {
      ambiguous = true
    }
  }

  const base = {
    rowIndex,
    inventoryItemId: invItem?.id ?? null,
    inventoryName:   invItem?.name ?? null,
    importedName:    norm.name,
    costPerUnit:     norm.costPerUnit,
    costUnit:        norm.costUnit,
    // Phase 7K (1/?) — when the steward leaves Source empty we default
    // to 'imported' so the future apply step has a clean attribution.
    // Any explicit value is preserved as-is and validated below.
    costSource:      norm.costSource ?? 'imported',
    costNotes:       norm.costNotes,
  }

  // 3) Ambiguous name resolution wins over unmatched (we did find rows,
  //    just too many to pick automatically).
  if (ambiguous) {
    return {
      ...base,
      status: 'ambiguous',
      message: `Multiple inventory items match "${norm.name}"; pick one before applying.`,
    }
  }

  // 4) No match at all.
  if (!invItem) {
    return {
      ...base,
      status: 'unmatched',
      message: norm.name
        ? `No inventory item matches "${norm.name}".`
        : 'Row has no item name or inventory id to match against.',
    }
  }

  // 5) Validate cost + unit + source before declaring the row ready.
  if (norm.costPerUnit == null) {
    return {
      ...base,
      status: 'invalid',
      message: 'Cost value is missing or not numeric.',
    }
  }
  if (norm.costPerUnit <= 0) {
    return {
      ...base,
      status: 'invalid',
      message: 'Cost value must be positive.',
    }
  }
  if (!norm.costUnit) {
    return {
      ...base,
      status: 'invalid',
      message: 'Unit is required when a cost is set.',
    }
  }
  if (norm.costSource && !COST_SOURCE_VALUES.has(norm.costSource)) {
    return {
      ...base,
      // Source vocabulary violation is a row-level validation gap, not
      // a missing match — still surface as invalid so the steward can
      // fix the column before apply.
      status: 'invalid',
      message: `Source must be one of ${[...COST_SOURCE_VALUES].join(' / ')}.`,
    }
  }

  return {
    ...base,
    status: 'ready',
    message: `Ready to apply to "${invItem.name}".`,
  }
}

// ── Whole-import review ──────────────────────────────────────────────────

/**
 * Walk every imported row and build the review model.
 *
 * @param {Array} rows
 * @param {Array} inventoryProducts
 * @param {Object} [options]
 * @returns {{
 *   totals: {
 *     rowsReviewed: number,
 *     ready: number,
 *     unmatched: number,
 *     ambiguous: number,
 *     invalid: number,
 *   },
 *   rows: Array<ReturnType<typeof mapCostImportRow>>,
 * }}
 */
export function buildCostImportReview(rows = [], inventoryProducts = [], options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const reviewed = []
  let ready = 0, unmatched = 0, ambiguous = 0, invalid = 0

  for (let i = 0; i < list.length; i++) {
    const r = mapCostImportRow(list[i], inventoryProducts, { ...options, rowIndex: i })
    reviewed.push(r)
    switch (r.status) {
      case 'ready':     ready++;     break
      case 'unmatched': unmatched++; break
      case 'ambiguous': ambiguous++; break
      case 'invalid':   invalid++;   break
      default: break
    }
  }

  return {
    totals: {
      rowsReviewed: reviewed.length,
      ready, unmatched, ambiguous, invalid,
    },
    rows: reviewed,
  }
}

/**
 * One-line summary for review headers / chips.
 *
 * @param {ReturnType<typeof buildCostImportReview>} review
 * @returns {{ isClean: boolean, message: string }}
 */
export function summarizeCostImportReview(review) {
  if (!review || !review.totals) {
    return { isClean: true, message: 'No import review available.' }
  }
  const t = review.totals
  if (t.rowsReviewed === 0) {
    return { isClean: true, message: 'No rows in this import.' }
  }
  const issues = (t.unmatched ?? 0) + (t.ambiguous ?? 0) + (t.invalid ?? 0)
  if (issues === 0) {
    return {
      isClean: true,
      message: `${t.ready} of ${t.rowsReviewed} row${t.rowsReviewed !== 1 ? 's' : ''} ready to apply.`,
    }
  }
  return {
    isClean: false,
    message: `${t.ready} ready · ${t.unmatched} unmatched · ${t.ambiguous} ambiguous · ${t.invalid} invalid (of ${t.rowsReviewed})`,
  }
}

// Exported for the smoke; not part of the public render contract.
export const __TEST = {
  COLUMN_ALIASES,
  COST_SOURCE_VALUES,
  normalizeKey,
  normalizeName,
  pickFromRow,
  asFiniteNumber,
}
