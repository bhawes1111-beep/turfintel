// Phase 7C.1 (6/6) — Spray Builder product-intelligence resolver.
//
// Pure-compute, deterministic lookup that answers "what do we know about
// this spray row's product?" by consulting three tiers in a fixed order:
//
//   1. product_catalog        — global, EPA-verified intelligence
//   2. inventory_product_labels — course-imported label PDFs (Phase 27C)
//   3. legacy name-match      — best-effort fallback for unimported rows
//
// The result is a single normalized `intel` object with a `source` tag
// so callers (and the UI) know exactly where each piece of intelligence
// came from. NEVER returns a mixed/merged record — first hit wins so we
// don't silently overlay catalog data on top of inventory-imported
// label data, and vice versa.
//
// Read-only. Resolver inputs are not mutated; the returned `intel` is a
// fresh plain object. Catalog rows go in as the camelCase Worker
// payload (productName, fracGroup, etc.); label rows go in as the
// labelImportStore shape (productName, fracGroup, hracGroup, …).

const NAME_PUNCT = /[^a-z0-9]+/g

function normalizeName(s) {
  if (s == null) return ''
  return String(s).toLowerCase().trim().replace(NAME_PUNCT, '-').replace(/^-+|-+$/g, '')
}

function pickActiveIngredientSummary(ai) {
  if (!Array.isArray(ai) || ai.length === 0) return null
  return ai
    .map(a => {
      if (!a?.name) return null
      return a.percentage != null ? `${a.name} ${a.percentage}%` : a.name
    })
    .filter(Boolean)
    .join(' + ') || null
}

/**
 * @typedef {Object} SprayIntel
 * @property {'catalog'|'label'|'legacy'|'none'} source
 *           Which tier supplied the data. 'none' = nothing resolved.
 * @property {string|null} catalogId
 *           Set when source === 'catalog'.
 * @property {string|null} category
 *           e.g. 'fungicide' | 'herbicide' | 'pgr' | 'fertilizer'. Best-effort
 *           from the row's `category`/`kind` for the legacy tier.
 * @property {string|null} fracGroup
 * @property {string|null} hracGroup
 * @property {string|null} iracGroup
 * @property {string|null} pgrClass
 * @property {string|null} activeIngredientSummary
 * @property {string|null} signalWord
 * @property {number|null} reiHours
 * @property {number|null} phiHours
 * @property {Array}       rates    Catalog rate objects (label tier has no
 *                                  structured rates here, so [] for label).
 * @property {string|null} labelUrl
 */

function emptyIntel() {
  return {
    source: 'none',
    catalogId: null,
    category: null,
    fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
    activeIngredientSummary: null,
    signalWord: null,
    reiHours: null,
    phiHours: null,
    rates: [],
    labelUrl: null,
  }
}

// ── Tier 1: product_catalog ─────────────────────────────────────────────────
//
// Two probes:
//   a. exact catalog id (when the inventory row was previously linked)
//   b. normalized-name match against catalog.productName
//
// Name match is intentionally strict — we slugify both sides and compare
// for equality. No fuzzy/Levenshtein guessing; a wrong match here would
// surface the wrong FRAC group, which is operationally dangerous.

function fromCatalog(catalogProduct) {
  return {
    source:    'catalog',
    catalogId: catalogProduct.id ?? null,
    category:  catalogProduct.category ?? null,
    fracGroup: catalogProduct.fracGroup ?? null,
    hracGroup: catalogProduct.hracGroup ?? null,
    iracGroup: catalogProduct.iracGroup ?? null,
    pgrClass:  catalogProduct.pgrClass  ?? null,
    activeIngredientSummary: pickActiveIngredientSummary(catalogProduct.activeIngredients),
    signalWord: catalogProduct.signalWord ?? null,
    reiHours:   catalogProduct.reiHours   ?? null,
    phiHours:   catalogProduct.phiHours   ?? null,
    rates:      Array.isArray(catalogProduct.rates) ? catalogProduct.rates : [],
    labelUrl:   catalogProduct.labelUrl   ?? null,
  }
}

// ── Tier 2: inventory_product_labels ───────────────────────────────────────
//
// labelImportStore rows have FRAC/HRAC/IRAC as comma-separated strings
// (e.g. "3, 11") — we keep them as-is. The chemistry-analyzer downstream
// already understands this shape.

function fromLabel(labelRow) {
  return {
    source:    'label',
    catalogId: null,
    category:  null,                       // labels don't carry our category vocab
    fracGroup: labelRow.fracGroup ?? null,
    hracGroup: labelRow.hracGroup ?? null,
    iracGroup: labelRow.iracGroup ?? null,
    pgrClass:  null,                       // labels don't structure PGR class
    activeIngredientSummary: labelRow.activeIngredients ?? null,
    signalWord: labelRow.signalWord ?? null,
    reiHours:   typeof labelRow.reiHours === 'number' ? labelRow.reiHours : null,
    phiHours:   typeof labelRow.phi === 'number'      ? labelRow.phi      : null,
    rates:      [],                        // label tier has no structured rates
    labelUrl:   labelRow.pdfUrl ?? null,
  }
}

// ── Tier 3: legacy ──────────────────────────────────────────────────────────
//
// No structured chemistry intelligence exists; we just surface whatever
// the inventory row itself carries (kind/category) so the row isn't
// totally bare in the UI.

function fromLegacy(inventoryItem) {
  if (!inventoryItem) return { ...emptyIntel(), source: 'legacy' }
  return {
    ...emptyIntel(),
    source:   'legacy',
    category: inventoryItem.category ?? inventoryItem.kind ?? null,
  }
}

/**
 * Resolve product intelligence for a spray-builder row.
 *
 * @param {Object}   row                       The spray row being resolved.
 * @param {string}   row.name                  Display name of the product.
 * @param {string?}  row.inventoryItemId       FK into inventoryProducts.
 * @param {Object}   inputs
 * @param {Object[]} inputs.inventoryProducts  inventoryStore items[].
 * @param {Object[]} inputs.catalogProducts    productCatalogStore.products.
 * @param {Object}   inputs.labelsByItemId     { invItemId → label row }.
 * @returns {SprayIntel}                       Always returns an object.
 */
export function resolveSprayProductIntel(row, {
  inventoryProducts = [],
  catalogProducts   = [],
  labelsByItemId    = {},
} = {}) {
  if (!row) return emptyIntel()

  // Resolve the inventory item (same precedence the builder already uses
  // for stock math: explicit id first, then exact name).
  const inv = row.inventoryItemId
    ? inventoryProducts.find(p => p.id === row.inventoryItemId)
    : inventoryProducts.find(p => p.name === row.name)

  // ── Tier 1a: explicit catalog FK on the inventory row ─────────────────
  if (inv?.productCatalogId) {
    const hit = catalogProducts.find(c => c.id === inv.productCatalogId)
    if (hit) return fromCatalog(hit)
    // FK points at a catalog row that isn't in the cache — fall through
    // to other tiers rather than 404. Don't fabricate intelligence from
    // a stale id.
  }

  // ── Tier 1b: normalized-name match against the catalog ────────────────
  const candidateName = inv?.name ?? row?.name
  if (candidateName) {
    const norm = normalizeName(candidateName)
    if (norm) {
      const hit = catalogProducts.find(c => normalizeName(c.productName) === norm)
      if (hit) return fromCatalog(hit)
    }
  }

  // ── Tier 2: inventory_product_labels ──────────────────────────────────
  if (inv?.id) {
    const label = labelsByItemId[inv.id]
    if (label) return fromLabel(label)
  }

  // ── Tier 3: legacy inventory-only context ─────────────────────────────
  if (inv) return fromLegacy(inv)

  // Nothing resolved.
  return emptyIntel()
}

// Exported for the smoke; intentionally not part of the public render contract.
export const __TEST = {
  normalizeName,
  pickActiveIngredientSummary,
  emptyIntel,
}
