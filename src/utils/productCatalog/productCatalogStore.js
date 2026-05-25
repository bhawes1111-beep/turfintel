// Phase 7C.1 (3/6) — Product Catalog client store.
//
// Globally-scoped (NOT course-scoped) read-only cache of /api/product-catalog.
// Catalog data is reference material — FRAC group, REI hours, label URLs do
// not change per-course — so there's exactly one cache for the whole app,
// loaded lazily on first hook subscription. Phase 7C.1 ships read-only;
// there are no mutations, no clientId/optimistic-insert paths, no
// attachments, and no course-change subscription.
//
// Public exports:
//   - useProductCatalog()            : { products, loading, error, lastFetch }
//   - refreshProductCatalog()        : force re-fetch
//   - searchProductCatalog(q, opts)  : local filter against the cache
//   - getCatalogProductById(id)      : O(1) cache lookup (Map)
//   - listCatalogCategories()        : distinct categories present in cache
//   - listCatalogFracGroups()        : distinct frac_group values
//   - listCatalogHracGroups()        : distinct hrac_group values
//   - listCatalogIracGroups()        : distinct irac_group values
//   - listCatalogPgrClasses()        : distinct pgr_class values
//
// Auth: session cookie only (`credentials: 'same-origin'`). No x-admin-key.
// The Worker GET endpoints are open to any authenticated session — the
// SPA's login flow gates access; this file never touches headers.

import { useSyncExternalStore } from 'react'

const API = '/api/product-catalog'

// status='active' is the default the Worker applies anyway, but pass it
// explicitly so the URL is unambiguous in DevTools / server logs.
const DEFAULT_FETCH_PARAMS = { status: 'active' }

let state = {
  products:  [],
  byId:      new Map(),
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

function buildUrl(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v == null || v === '') continue
    q.set(k, String(v))
  }
  const qs = q.toString()
  return qs ? `${API}?${qs}` : API
}

// ── List refresh ───────────────────────────────────────────────────────────

/**
 * Re-fetch the catalog. Replaces the cache wholesale; existing IDs lose
 * their object identity by design (the catalog can be re-imported with
 * new EPA-sync data and any consumer should see the fresh row).
 *
 * @param {Object} [opts]  extra query params to merge over DEFAULT_FETCH_PARAMS
 */
export async function refreshProductCatalog(opts = {}) {
  setState({ loading: true, error: null })
  try {
    const url = buildUrl({ ...DEFAULT_FETCH_PARAMS, ...opts })
    const products = await fetchJSON(url)
    const byId = new Map()
    for (const p of products) if (p?.id) byId.set(p.id, p)
    setState({ products, byId, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// ── Local filters ──────────────────────────────────────────────────────────
//
// All filter functions run against the cached array. The catalog is bounded
// (O(1000) rows in v1) so a fresh filter on every keystroke is cheap and
// avoids the latency / failure modes of a server round-trip per character.
// If the catalog ever outgrows this assumption, swap searchProductCatalog
// to call the Worker LIKE endpoint instead — the public signature is stable.

function normalize(s) {
  return s == null ? '' : String(s).toLowerCase()
}

// Mirror the Worker's denormalized search_text — name + brand + manufacturer +
// EPA + formulation + chemical class + analysis + ingredient names + targets.
// Computed lazily per row on demand; caching this on the row object would
// outlive refreshes which we don't want.
function rowSearchText(p) {
  const ai = Array.isArray(p.activeIngredients)
    ? p.activeIngredients.map(a => a?.name).filter(Boolean)
    : []
  const tg = Array.isArray(p.targets) ? p.targets : []
  return [
    p.productName, p.brandOwner, p.manufacturer, p.epaNumber,
    p.formulation, p.chemicalClass, p.fertilizerAnalysis,
    ...ai, ...tg,
  ].filter(Boolean).map(normalize).join(' ')
}

/**
 * Filter the cached catalog. All filters are AND-composed.
 *
 * @param {string} [q]                free-text match against rowSearchText
 * @param {Object} [filters]
 * @param {string} [filters.category]
 * @param {string} [filters.frac]
 * @param {string} [filters.hrac]
 * @param {string} [filters.irac]
 * @param {string} [filters.pgr]
 * @param {string} [filters.status]   default: 'active' (matches Worker default)
 */
export function searchProductCatalog(q, filters = {}) {
  const needle   = normalize(q).trim()
  const category = filters.category ? normalize(filters.category) : null
  const frac     = filters.frac     ? String(filters.frac).trim() : null
  const hrac     = filters.hrac     ? String(filters.hrac).trim() : null
  const irac     = filters.irac     ? String(filters.irac).trim() : null
  const pgr      = filters.pgr      ? String(filters.pgr).trim()  : null
  // status defaults to 'active' to match the Worker. Explicit null/''
  // means "no status filter" (caller wants discontinued + unverified too).
  const status   = filters.status === null || filters.status === ''
    ? null
    : normalize(filters.status ?? 'active')

  return state.products.filter(p => {
    if (status   && normalize(p.status) !== status)         return false
    if (category && normalize(p.category) !== category)     return false
    if (frac     && p.fracGroup !== frac)                   return false
    if (hrac     && p.hracGroup !== hrac)                   return false
    if (irac     && p.iracGroup !== irac)                   return false
    if (pgr      && p.pgrClass  !== pgr)                    return false
    if (needle   && !rowSearchText(p).includes(needle))     return false
    return true
  })
}

/** O(1) lookup against the cache. Returns null if not cached / unknown id. */
export function getCatalogProductById(id) {
  if (!id) return null
  return state.byId.get(id) ?? null
}

// Distinct-value helpers for filter dropdowns. Each returns a sorted array
// of strings with falsy values removed. Cheap to recompute (small N); not
// memoized to keep the store free of stale-cache hazards.
function distinct(field) {
  const set = new Set()
  for (const p of state.products) {
    const v = p?.[field]
    if (v == null || v === '') continue
    set.add(v)
  }
  return [...set].sort((a, b) => String(a).localeCompare(String(b)))
}
export function listCatalogCategories()  { return distinct('category')  }
export function listCatalogFracGroups()  { return distinct('fracGroup') }
export function listCatalogHracGroups()  { return distinct('hracGroup') }
export function listCatalogIracGroups()  { return distinct('iracGroup') }
export function listCatalogPgrClasses()  { return distinct('pgrClass')  }

// ── React hook ─────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshProductCatalog()
  }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useProductCatalog — { products, loading, error, lastFetch }. */
export function useProductCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Test-only seam — lets the smoke inject a synthetic cache without
// monkeypatching fetch. NOT a public export contract.
export const __TEST = {
  setCache(products) {
    const byId = new Map()
    for (const p of products) if (p?.id) byId.set(p.id, p)
    setState({ products, byId, loading: false, error: null, lastFetch: Date.now() })
  },
  reset() {
    setState({ products: [], byId: new Map(), loading: true, error: null, lastFetch: null })
    hasBooted = false
  },
}
