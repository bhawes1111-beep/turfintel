// Phase 7C.1 — Product Catalog: read-only Worker API.
//
// Globally-scoped catalog of known products (FRAC groups, label URLs,
// active ingredients, normalized rates/targets). Distinct from
// inventory_items (which is course-scoped stock). See migration
// 0043_product_catalog.sql for the schema rationale.
//
// READ-ONLY in Phase 7C.1:
//   - GET /api/product-catalog         (list + filters)
//   - GET /api/product-catalog/search  (alias of list with q=)
//   - GET /api/product-catalog/:id     (one row)
//
// No POST/PATCH/DELETE. The catalog is seed-driven in v1 (import script
// lands in a later commit). User-editable catalog is a Phase 7C.2+
// concern — the audit surface stays small now.
//
// Auth: session required (the central guard in worker/index.js will
// reject anonymous GETs); no per-route permission gate beyond that.
// Catalog data is reference material — anyone with a TurfIntel session
// can read it.

import { json, notFound } from '../lib/json.js'

const ALLOWED_CATEGORIES = new Set([
  'herbicide', 'fungicide', 'insecticide', 'pgr', 'fertilizer', 'biostimulant',
])
const ALLOWED_STATUSES = new Set(['active', 'discontinued', 'unverified'])

// Hard cap to keep payloads bounded even if the catalog grows. The full
// catalog is expected to be O(1000) rows; a single GET returning them all
// is fine over gzip. Tunable later.
const DEFAULT_LIMIT = 500
const MAX_LIMIT     = 2000

function coerceCategory(v) {
  if (typeof v !== 'string') return null
  const norm = v.trim().toLowerCase()
  return ALLOWED_CATEGORIES.has(norm) ? norm : null
}

function coerceStatus(v) {
  if (typeof v !== 'string') return null
  const norm = v.trim().toLowerCase()
  return ALLOWED_STATUSES.has(norm) ? norm : null
}

function parseJsonField(raw) {
  if (raw == null || raw === '') return null
  try { return JSON.parse(raw) }
  catch { return null }
}

function rowToProduct(row) {
  if (!row) return null
  return {
    id:                 row.id,
    productName:        row.product_name,
    brandOwner:         row.brand_owner         ?? null,
    manufacturer:       row.manufacturer        ?? null,
    epaNumber:          row.epa_number          ?? null,
    formulation:        row.formulation         ?? null,
    category:           row.category,
    fracGroup:          row.frac_group          ?? null,
    hracGroup:          row.hrac_group          ?? null,
    iracGroup:          row.irac_group          ?? null,
    pgrClass:           row.pgr_class           ?? null,
    chemicalClass:      row.chemical_class      ?? null,
    activeIngredients:  parseJsonField(row.active_ingredients_json) ?? [],
    fertilizerAnalysis: row.fertilizer_analysis ?? null,
    rates:              parseJsonField(row.rates_json)              ?? [],
    targets:            parseJsonField(row.targets_json)            ?? [],
    turfSites:          parseJsonField(row.turf_sites_json)         ?? [],
    restrictedUse:      row.restricted_use === 1,
    signalWord:         row.signal_word         ?? null,
    reiHours:           row.rei_hours           ?? null,
    phiHours:           row.phi_hours           ?? null,
    labelUrl:           row.label_url           ?? null,
    notes:              row.notes               ?? null,
    status:             row.status,
    isActive:           row.is_active === 1,
    source:             row.source              ?? null,
    sourceVersion:      row.source_version      ?? null,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

// ── List + search (same handler; search is just list with q=) ─────────────

/**
 * GET /api/product-catalog
 * Query params (all optional):
 *   q          — search text (matched against the denormalized search_text
 *                column with case-insensitive LIKE)
 *   category   — filter by ALLOWED_CATEGORIES
 *   status     — filter by ALLOWED_STATUSES (default: 'active')
 *   frac       — exact match on frac_group
 *   hrac       — exact match on hrac_group
 *   irac       — exact match on irac_group
 *   pgr        — exact match on pgr_class
 *   limit      — DEFAULT_LIMIT, capped at MAX_LIMIT
 */
export async function listProductCatalog(env, opts = {}) {
  if (!env.DB) return json([])

  const sets  = []
  const binds = []

  // q search — denormalized lowercased column, single LIKE.
  if (opts.q && typeof opts.q === 'string' && opts.q.trim() !== '') {
    sets.push('search_text LIKE ?')
    binds.push(`%${opts.q.trim().toLowerCase()}%`)
  }

  const category = coerceCategory(opts.category)
  if (category) {
    sets.push('category = ?')
    binds.push(category)
  }

  // status defaults to 'active' unless an explicit valid value is supplied.
  // Anything invalid silently falls back to 'active' (don't reveal valid
  // values via an enumeration error on a public-ish read endpoint).
  const status = coerceStatus(opts.status) ?? 'active'
  sets.push('status = ?')
  binds.push(status)

  if (typeof opts.frac === 'string' && opts.frac.trim() !== '') {
    sets.push('frac_group = ?')
    binds.push(opts.frac.trim())
  }
  if (typeof opts.hrac === 'string' && opts.hrac.trim() !== '') {
    sets.push('hrac_group = ?')
    binds.push(opts.hrac.trim())
  }
  if (typeof opts.irac === 'string' && opts.irac.trim() !== '') {
    sets.push('irac_group = ?')
    binds.push(opts.irac.trim())
  }
  if (typeof opts.pgr === 'string' && opts.pgr.trim() !== '') {
    sets.push('pgr_class = ?')
    binds.push(opts.pgr.trim())
  }

  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''

  // Limit + cap.
  let limit = parseInt(opts.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT

  const { results } = await env.DB.prepare(
    `SELECT * FROM product_catalog
     ${whereClause}
     ORDER BY product_name ASC
     LIMIT ${limit}`,
  ).bind(...binds).all()

  return json((results ?? []).map(rowToProduct))
}

/** GET /api/product-catalog/:id */
export async function getProductCatalog(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM product_catalog WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Product not found in catalog')
  return json(rowToProduct(row))
}
