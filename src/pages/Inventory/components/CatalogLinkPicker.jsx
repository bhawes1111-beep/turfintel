import { useMemo, useState } from 'react'
import {
  useProductCatalog,
  searchProductCatalog,
  listCatalogCategories,
  listCatalogFracGroups,
  listCatalogHracGroups,
  listCatalogIracGroups,
  listCatalogPgrClasses,
  getCatalogProductById,
} from '../../../utils/productCatalog/productCatalogStore'
import styles from './CatalogLinkPicker.module.css'

// Phase 7C.2 (1/?) — Manual catalog-link picker.
//
// Two-step stewardship modal:
//   1. Search + filter the catalog cache; pick a candidate row.
//   2. Confirmation summary card (category, ingredients, FRAC/HRAC/IRAC/
//      PGR chips) + explicit "Link this product" button.
//
// Read-only over the catalog (uses store filter helpers; no fetch). The
// only mutation happens in the parent when the user clicks "Link" — we
// just call onConfirm(productCatalogId). This component never touches
// product_catalog or inventory_items directly.
//
// Wording is intentional ("data stewardship"): the framing makes clear
// that linking attaches intelligence and does not change stock counts
// or product records.

const ALL = 'All'

export default function CatalogLinkPicker({
  inventoryItem,                 // the inventory row being linked (for context)
  initialProductCatalogId = null,
  onConfirm,                     // (productCatalogId) => Promise<void>
  onCancel,
}) {
  const { products, loading, error } = useProductCatalog()

  const [step, setStep] = useState('search')   // 'search' | 'confirm'
  const [selectedId, setSelectedId] = useState(initialProductCatalogId)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState(null)

  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState(ALL)
  const [frac, setFrac] = useState(ALL)
  const [hrac, setHrac] = useState(ALL)
  const [irac, setIrac] = useState(ALL)
  const [pgr,  setPgr]  = useState(ALL)

  const categories = useMemo(() => [ALL, ...listCatalogCategories()], [products])
  const fracGroups = useMemo(() => [ALL, ...listCatalogFracGroups()], [products])
  const hracGroups = useMemo(() => [ALL, ...listCatalogHracGroups()], [products])
  const iracGroups = useMemo(() => [ALL, ...listCatalogIracGroups()], [products])
  const pgrClasses = useMemo(() => [ALL, ...listCatalogPgrClasses()], [products])

  const visible = useMemo(() => searchProductCatalog(search, {
    category: category === ALL ? null : category,
    frac:     frac     === ALL ? null : frac,
    hrac:     hrac     === ALL ? null : hrac,
    irac:     irac     === ALL ? null : irac,
    pgr:      pgr      === ALL ? null : pgr,
  }), [search, category, frac, hrac, irac, pgr, products])

  const selected = selectedId ? getCatalogProductById(selectedId) : null

  function pick(id) {
    setSelectedId(id)
    setStep('confirm')
  }

  async function commit() {
    if (!selectedId) return
    setSubmitting(true)
    setSubmitErr(null)
    try {
      await onConfirm(selectedId)
    } catch (err) {
      setSubmitErr(err.message || 'Link failed')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Link catalog intelligence">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>
              {step === 'search' ? 'Link catalog intelligence' : 'Confirm catalog link'}
            </h2>
            <p className={styles.subtitle}>
              {step === 'search'
                ? <>Attach agronomic data to <strong>{inventoryItem?.name ?? 'this item'}</strong>. This does not change inventory stock or product records.</>
                : <>Review the catalog product before linking it to <strong>{inventoryItem?.name ?? 'this item'}</strong>.</>
              }
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            aria-label="Close"
          >✕</button>
        </header>

        {error && (
          <div className={styles.errorBanner}>
            Could not load the catalog: {error}
          </div>
        )}

        {step === 'search' ? (
          <>
            <div className={styles.toolbar}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search name, brand, manufacturer, EPA, ingredient, target…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search catalog"
                autoFocus
              />
              <FilterRow label="Category" options={categories} value={category} onChange={setCategory} />
              {fracGroups.length > 1 && <FilterRow label="FRAC" options={fracGroups} value={frac} onChange={setFrac} />}
              {hracGroups.length > 1 && <FilterRow label="HRAC" options={hracGroups} value={hrac} onChange={setHrac} />}
              {iracGroups.length > 1 && <FilterRow label="IRAC" options={iracGroups} value={irac} onChange={setIrac} />}
              {pgrClasses.length > 1 && <FilterRow label="PGR"  options={pgrClasses} value={pgr}  onChange={setPgr} />}
            </div>

            <div className={styles.resultSummary}>
              {visible.length} catalog product{visible.length !== 1 ? 's' : ''}
              {loading && products.length === 0 ? ' · loading…' : ''}
            </div>

            <ul className={styles.resultList}>
              {visible.length === 0 ? (
                <li className={styles.empty}>
                  {products.length === 0
                    ? 'No catalog products available.'
                    : 'No catalog products match the current filters.'}
                </li>
              ) : visible.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.resultBtn}
                    onClick={() => pick(p.id)}
                    aria-label={`Choose ${p.productName}`}
                  >
                    <div className={styles.resultMain}>
                      <span className={styles.resultName}>{p.productName}</span>
                      <span className={styles.resultSub}>
                        {[p.brandOwner, p.manufacturer].filter(Boolean)
                          .filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                        {p.epaNumber ? ` · EPA ${p.epaNumber}` : ''}
                      </span>
                    </div>
                    <span className={styles.resultCategory}>{p.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ConfirmationCard
            product={selected}
            inventoryItem={inventoryItem}
            onBack={() => { setStep('search'); setSubmitErr(null) }}
            onConfirm={commit}
            submitting={submitting}
            submitErr={submitErr}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
function FilterRow({ label, options, value, onChange }) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterGroupLabel}>{label}</span>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`${styles.filterBtn} ${value === opt ? styles.filterBtnActive : ''}`}
          onClick={() => onChange(opt)}
        >{opt}</button>
      ))}
    </div>
  )
}

function ConfirmationCard({ product, inventoryItem, onBack, onConfirm, submitting, submitErr }) {
  if (!product) {
    return (
      <div className={styles.confirmEmpty}>
        Selected catalog row is no longer cached. Try searching again.
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onBack}>← Back</button>
        </div>
      </div>
    )
  }

  const ai = Array.isArray(product.activeIngredients) ? product.activeIngredients : []
  const aiText = ai.length === 0
    ? null
    : ai.map(a => a.percentage != null ? `${a.name} ${a.percentage}%` : a.name).join(' + ')

  return (
    <div className={styles.confirmBody}>
      <section className={styles.confirmCard}>
        <h3 className={styles.confirmName}>{product.productName}</h3>
        {[product.brandOwner, product.manufacturer].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length > 0 && (
          <div className={styles.confirmSub}>
            {[product.brandOwner, product.manufacturer].filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
            {product.epaNumber ? ` · EPA ${product.epaNumber}` : ''}
          </div>
        )}

        <div className={styles.confirmGrid}>
          <span className={styles.confirmLabel}>Category</span>
          <span className={styles.confirmValue}>{product.category}</span>

          {aiText && (<>
            <span className={styles.confirmLabel}>Active ingredients</span>
            <span className={styles.confirmValue}>{aiText}</span>
          </>)}

          {product.fertilizerAnalysis && (<>
            <span className={styles.confirmLabel}>Analysis</span>
            <span className={styles.confirmValue}>{product.fertilizerAnalysis}</span>
          </>)}
        </div>

        <div className={styles.confirmChips}>
          {product.fracGroup && <span className={`${styles.chip} ${styles.chipFrac}`}>FRAC {product.fracGroup}</span>}
          {product.hracGroup && <span className={`${styles.chip} ${styles.chipHrac}`}>HRAC {product.hracGroup}</span>}
          {product.iracGroup && <span className={`${styles.chip} ${styles.chipIrac}`}>IRAC {product.iracGroup}</span>}
          {product.pgrClass  && <span className={`${styles.chip} ${styles.chipPgr}`}>PGR {product.pgrClass}</span>}
          {product.restrictedUse && <span className={`${styles.chip} ${styles.chipRup}`}>RUP</span>}
        </div>
      </section>

      <p className={styles.disclaimer}>
        Linking attaches catalog intelligence to <strong>{inventoryItem?.name ?? 'this item'}</strong>.
        Inventory stock counts, vendor, cost, and notes are <strong>not</strong> changed.
        You can remove the link at any time.
      </p>

      {submitErr && (
        <div className={styles.errorBanner}>{submitErr}</div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onBack}
          disabled={submitting}
        >← Back</button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onConfirm}
          disabled={submitting}
        >{submitting ? 'Linking…' : 'Link this product'}</button>
      </div>
    </div>
  )
}
