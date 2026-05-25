import { useProductCatalog, getCatalogProductById } from '../../../utils/productCatalog/productCatalogStore'
import styles from './CatalogChip.module.css'

// Phase 7C.1 (5/6) — Inventory → Catalog jump chip.
//
// Compact 📋 Catalog chip rendered on inventory rows whose
// product_catalog_id resolves to a row in the cached catalog. Hides
// silently when either piece is missing:
//   - inventory row has no product_catalog_id
//   - catalog cache hasn't loaded yet, or the id isn't in the cache
//     (catalog row deleted/superseded between import and now)
//
// Click pipes through `onOpen(productCatalogId)`. The Inventory shell
// handles the "switch to Catalog tab + open drawer" wiring — this chip
// is dumb on purpose so the same component drops into Chemicals,
// Fertilizer, and Products without any per-tab navigation knowledge.
//
// Read-only: no fetch, no mutation. Subscribing to useProductCatalog
// lazy-triggers the one-time catalog fetch the first time ANY inventory
// row with a linkage renders.

export default function CatalogChip({ productCatalogId, onOpen }) {
  // Subscribe so the chip re-renders when the catalog cache settles.
  // We don't actually need products[] here — getCatalogProductById is
  // module-level and would resolve without the hook — but subscribing
  // ensures the chip appears the moment the cache populates.
  useProductCatalog()

  if (!productCatalogId) return null
  const product = getCatalogProductById(productCatalogId)
  if (!product) return null

  // Rendered as <span role="button"> rather than <button> because some
  // inventory rows (Products tab card) are themselves <button>s, and
  // nesting an interactive button inside a button is invalid HTML; the
  // inner element can be silently dropped from the tab/click order in
  // some user agents. stopPropagation prevents the chip click from also
  // triggering the parent row's onClick.
  function activate(e) {
    e.stopPropagation()
    onOpen?.(productCatalogId)
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(e)
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={styles.chip}
      onClick={activate}
      onKeyDown={onKeyDown}
      title={`View "${product.productName}" in the global Catalog`}
      aria-label={`View ${product.productName} in catalog`}
    >
      <span className={styles.icon} aria-hidden>📋</span>
      <span className={styles.label}>Catalog</span>
    </span>
  )
}
