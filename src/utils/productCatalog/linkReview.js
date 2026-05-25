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

// ── Phase 7C.2 (3/?) — Workflow polish helpers ─────────────────────────────
//
// filterLinkReviewItems / sortLinkReviewItems / calculateLinkReviewProgress
// are pure-compute extensions on top of buildLinkReviewBuckets. They live
// here (not in the UI component) so the same filter+sort semantics can
// later be applied to a saved-view JSON blob or a CLI audit without any
// React. No I/O, no React, no store imports.

/**
 * Filter modes supported by the review tab. Stable identifiers — the UI
 * imports this set so the filter pills can't drift out of sync.
 */
export const LINK_REVIEW_FILTERS = Object.freeze({
  ALL:       'all',          // every reviewable item
  UNLINKED:  'unlinked',     // FK is null
  SUGGESTED: 'suggested',    // unlinked + has exact-name suggestion
  STALE:     'stale',        // FK set but cache miss
  LINKED:    'linked',       // FK resolves
})

const FILTER_VALUES = new Set(Object.values(LINK_REVIEW_FILTERS))

/**
 * Sort modes. Each produces a stable order (name as tiebreaker so a
 * re-render doesn't shuffle the list).
 */
export const LINK_REVIEW_SORTS = Object.freeze({
  NAME:           'name',           // name A→Z
  STATUS:         'status',         // unlinked-with-suggestion → unlinked → stale → linked → name
  SUGGESTED_FIRST:'suggestedFirst', // suggested first → then alpha
  STALE_FIRST:    'staleFirst',     // stale first → then alpha
})

const SORT_VALUES = new Set(Object.values(LINK_REVIEW_SORTS))

// Cheap "row category" used by status-sort. Lower is earlier in the list.
function rowCategory(item, buckets) {
  if (!item) return 99
  const fk = item.productCatalogId ?? null
  if (fk) {
    // Need the bucket info to distinguish linked vs stale without re-
    // resolving against the catalog. buildLinkReviewBuckets indexes
    // those into arrays — we accept the buckets as input so the sort
    // helper doesn't need the raw catalog list.
    if (buckets.staleIds.has(item.id))  return 2
    if (buckets.linkedIds.has(item.id)) return 3
    // FK set but item wasn't categorized (shouldn't happen) — treat as stale.
    return 2
  }
  // Unlinked: with-suggestion (0) sorts before plain unlinked (1).
  return buckets.suggestionsByItemId[item.id] ? 0 : 1
}

function nameCmp(a, b) {
  const an = (a?.name ?? '').toLowerCase()
  const bn = (b?.name ?? '').toLowerCase()
  return an < bn ? -1 : an > bn ? 1 : 0
}

// Build a fast-lookup overlay over the buckets so filter+sort can ask
// "is this item linked / stale / suggested" in O(1) without re-indexing
// per call.
function indexBuckets(buckets) {
  return {
    linkedIds: new Set(buckets.linked.map(i => i.id)),
    staleIds:  new Set(buckets.stale.map(i => i.id)),
    suggestionsByItemId: buckets.suggestionsByItemId ?? {},
  }
}

/**
 * Filter the reviewable inventory items by status filter + free-text
 * search against item name. Always returns a NEW array; never mutates.
 *
 * @param {Object[]} items    inventoryStore.items
 * @param {Object}   buckets  output of buildLinkReviewBuckets()
 * @param {Object}   opts
 * @param {string}   [opts.filter='all']  one of LINK_REVIEW_FILTERS
 * @param {string}   [opts.search='']     case-insensitive substring on name
 * @returns {Object[]}
 */
export function filterLinkReviewItems(items = [], buckets, opts = {}) {
  if (!buckets) return []
  const filter = FILTER_VALUES.has(opts.filter) ? opts.filter : LINK_REVIEW_FILTERS.ALL
  const search = String(opts.search ?? '').trim().toLowerCase()
  const idx    = indexBuckets(buckets)
  const result = []

  for (const item of items) {
    if (!item || !REVIEWABLE_KINDS.has(item.kind)) continue

    // Apply status filter.
    if (filter !== LINK_REVIEW_FILTERS.ALL) {
      const fk = item.productCatalogId ?? null
      if (filter === LINK_REVIEW_FILTERS.LINKED   && !idx.linkedIds.has(item.id))   continue
      if (filter === LINK_REVIEW_FILTERS.STALE    && !idx.staleIds.has(item.id))    continue
      if (filter === LINK_REVIEW_FILTERS.UNLINKED && fk)                            continue
      if (filter === LINK_REVIEW_FILTERS.SUGGESTED) {
        if (fk) continue
        if (!idx.suggestionsByItemId[item.id]) continue
      }
    }

    // Apply search filter (item name only — the simplest predicate that
    // a steward can type while reading a card).
    if (search && !(item.name ?? '').toLowerCase().includes(search)) continue

    result.push(item)
  }

  return result
}

/**
 * Sort a filtered list by the chosen mode. NEVER mutates the input;
 * returns a fresh sorted copy. Name is the tiebreaker on every sort
 * mode so renders are stable.
 *
 * @param {Object[]} items
 * @param {Object}   buckets  output of buildLinkReviewBuckets()
 * @param {string}   [sortMode='name']
 * @returns {Object[]}
 */
export function sortLinkReviewItems(items = [], buckets, sortMode = LINK_REVIEW_SORTS.NAME) {
  if (!buckets) return [...items]
  const mode = SORT_VALUES.has(sortMode) ? sortMode : LINK_REVIEW_SORTS.NAME
  const idx  = indexBuckets(buckets)
  const copy = [...items]

  switch (mode) {
    case LINK_REVIEW_SORTS.NAME:
      copy.sort(nameCmp)
      break

    case LINK_REVIEW_SORTS.STATUS:
      copy.sort((a, b) => {
        const ac = rowCategory(a, idx)
        const bc = rowCategory(b, idx)
        return ac !== bc ? ac - bc : nameCmp(a, b)
      })
      break

    case LINK_REVIEW_SORTS.SUGGESTED_FIRST:
      copy.sort((a, b) => {
        const aHas = a && !a.productCatalogId && !!idx.suggestionsByItemId[a.id]
        const bHas = b && !b.productCatalogId && !!idx.suggestionsByItemId[b.id]
        if (aHas !== bHas) return aHas ? -1 : 1
        return nameCmp(a, b)
      })
      break

    case LINK_REVIEW_SORTS.STALE_FIRST:
      copy.sort((a, b) => {
        const aStale = !!(a && idx.staleIds.has(a.id))
        const bStale = !!(b && idx.staleIds.has(b.id))
        if (aStale !== bStale) return aStale ? -1 : 1
        return nameCmp(a, b)
      })
      break
  }
  return copy
}

/**
 * Compute "review progress" for the summary tile row. Pure derivation
 * from the bucket totals — same numbers as the legend in Commit 2, plus
 * a percent linked. We compute percent against (linked + unlinked +
 * stale) so the denominator is reviewable-and-in-cache items, not the
 * raw items[] length (which can include parts/fuel).
 *
 * @param {Object} buckets  output of buildLinkReviewBuckets()
 * @returns {{
 *   total: number,
 *   linked: number,
 *   unlinked: number,
 *   stale: number,
 *   unlinkedWithSuggestion: number,
 *   percentLinked: number   // integer 0..100
 * }}
 */
export function calculateLinkReviewProgress(buckets) {
  const t = buckets?.totals ?? { linked: 0, unlinked: 0, stale: 0, unlinkedWithSuggestion: 0 }
  const total = (t.linked ?? 0) + (t.unlinked ?? 0) + (t.stale ?? 0)
  const percentLinked = total === 0 ? 0 : Math.round(((t.linked ?? 0) / total) * 100)
  return {
    total,
    linked:   t.linked   ?? 0,
    unlinked: t.unlinked ?? 0,
    stale:    t.stale    ?? 0,
    unlinkedWithSuggestion: t.unlinkedWithSuggestion ?? 0,
    percentLinked,
  }
}

// Exposed for the smoke. Intentionally not part of the public contract.
export const __TEST = { normalizeProductName, rowCategory, indexBuckets }
