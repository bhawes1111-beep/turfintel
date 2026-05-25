// Phase 7C.2 (2/?) — Catalog Link Review helpers.
//
// Pure-compute, no I/O, no React. Three responsibilities:
//
//   1. resolveInventoryCatalogLinkStatus(item, catalogProducts)
//        → 'linked' | 'unlinked' | 'stale'
//      The FK is the source of truth; 'stale' just means the FK is set
//      but the cached catalog can't resolve it. (Same fall-through
//      contract the Spray Builder resolver already documents.)
//
//   2. findExactCatalogNameMatch(item, catalogProducts)
//        → catalog row | null
//      Deterministic exact match on the normalized product name only.
//      No fuzzy scoring. The match is READ-ONLY: it never writes the FK
//      and never mutates either side. The Link Review UI surfaces it as
//      a "possible match" hint that still requires the user to click
//      through the existing two-step picker.
//
//   3. buildLinkReviewBuckets(items, catalogProducts)
//        → { linked, unlinked, stale, suggestionsByItemId }
//      Splits the inventory list into three review groups and pre-
//      computes per-item suggestions in a single pass so the tab body
//      doesn't N×M scan on every render.
//
// Only inventory items relevant to the catalog (kind === 'product' |
// 'chemical' | 'fertilizer') are bucketed — parts/fuel/etc. are not
// catalog candidates and are filtered out at the boundary so the review
// queue stays small and operational.
//
// No auto-link, no fuzzy-apply. Exact name match only.

const NAME_PUNCT = /[^a-z0-9]+/g

export function normalizeProductName(s) {
  if (s == null) return ''
  return String(s).toLowerCase().trim().replace(NAME_PUNCT, '-').replace(/^-+|-+$/g, '')
}

// Which inventory kinds are catalog candidates. Anything else gets
// dropped at the bucket boundary — there is no FRAC group for a mower
// belt or a propane tank.
export const REVIEWABLE_KINDS = new Set(['product', 'chemical', 'fertilizer'])

/**
 * Resolve the current link status of an inventory item against the
 * cached catalog.
 *
 * @param {Object}    item              inventory_items row (camelCase)
 * @param {Object[]}  catalogProducts   productCatalogStore.products
 * @returns {'linked'|'unlinked'|'stale'}
 */
export function resolveInventoryCatalogLinkStatus(item, catalogProducts = []) {
  if (!item || !item.productCatalogId) return 'unlinked'
  const hit = catalogProducts.find(c => c.id === item.productCatalogId)
  return hit ? 'linked' : 'stale'
}

/**
 * Exact normalized-name match against the catalog. Returns the first
 * hit (deterministic — catalog ids are stable). If multiple catalog
 * rows share a normalized name we'd rather surface no suggestion than
 * one of N — silent ambiguity is safer than a 50/50 guess.
 *
 * @param {Object}   item
 * @param {Object[]} catalogProducts
 * @returns {Object|null}
 */
export function findExactCatalogNameMatch(item, catalogProducts = []) {
  if (!item?.name) return null
  const norm = normalizeProductName(item.name)
  if (!norm) return null
  // Single pass, count + capture so we can disambiguate at the end.
  let first = null
  let count = 0
  for (const c of catalogProducts) {
    if (normalizeProductName(c.productName) === norm) {
      first = first ?? c
      count++
      if (count > 1) return null   // ambiguous → no suggestion
    }
  }
  return first
}

/**
 * Split the inventory list into Link Review buckets.
 *
 * @param {Object[]} items            inventoryStore.items
 * @param {Object[]} catalogProducts  productCatalogStore.products
 * @returns {{
 *   linked: Object[],
 *   unlinked: Object[],
 *   stale: Object[],
 *   suggestionsByItemId: Object<string, Object>,
 *   totals: { linked: number, unlinked: number, stale: number,
 *             unlinkedWithSuggestion: number },
 * }}
 */
export function buildLinkReviewBuckets(items = [], catalogProducts = []) {
  // Index catalog by id once for O(1) status checks.
  const byId  = new Map()
  for (const c of catalogProducts) if (c?.id) byId.set(c.id, c)

  // Index by normalized name once so the suggestion pass is O(n) total.
  // Tracks counts so ambiguous duplicates produce no suggestion.
  const byNorm = new Map()  // norm → { hit, count }
  for (const c of catalogProducts) {
    if (!c?.productName) continue
    const norm = normalizeProductName(c.productName)
    if (!norm) continue
    const slot = byNorm.get(norm)
    if (slot) slot.count++
    else      byNorm.set(norm, { hit: c, count: 1 })
  }

  const linked   = []
  const unlinked = []
  const stale    = []
  const suggestionsByItemId = {}
  let unlinkedWithSuggestion = 0

  for (const item of items) {
    if (!item || !REVIEWABLE_KINDS.has(item.kind)) continue

    const fk = item.productCatalogId ?? null
    if (fk) {
      if (byId.has(fk)) linked.push(item)
      else              stale.push(item)
      continue
    }

    unlinked.push(item)
    const norm = normalizeProductName(item.name)
    if (!norm) continue
    const slot = byNorm.get(norm)
    if (slot && slot.count === 1) {
      suggestionsByItemId[item.id] = slot.hit
      unlinkedWithSuggestion++
    }
  }

  return {
    linked,
    unlinked,
    stale,
    suggestionsByItemId,
    totals: {
      linked:   linked.length,
      unlinked: unlinked.length,
      stale:    stale.length,
      unlinkedWithSuggestion,
    },
  }
}

// Exposed for the smoke. Intentionally not part of the public contract.
export const __TEST = { normalizeProductName }
