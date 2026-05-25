import { useMemo, useState } from 'react'
import {
  useProductCatalog,
  searchProductCatalog,
  listCatalogCategories,
  listCatalogFracGroups,
  listCatalogHracGroups,
  listCatalogIracGroups,
  listCatalogPgrClasses,
} from '../../../../utils/productCatalog/productCatalogStore'
import styles from './PlannerPickers.module.css'

// Phase 7F (3/?) — Single-step product-catalog picker for the planner.
//
// Same search semantics as the inventory CatalogLinkPicker but with no
// two-step "confirm and link" — the planner doesn't write to D1 on
// pick; it just populates the planned item's productCatalogId field.
// Read-only across the catalog; never mutates product_catalog.

const ALL = 'All'

export default function ProductCatalogPickerModal({ onSelect, onCancel }) {
  const { products, loading, error } = useProductCatalog()

  const [search, setSearch] = useState('')
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

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Pick catalog product">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Select catalog product</h2>
            <p className={styles.subtitle}>
              Catalog links provide read-only intelligence. This does not
              create a completed spray record.
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
          <div className={styles.errorBanner}>Could not load catalog: {error}</div>
        )}

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
                onClick={() => onSelect(p)}
                aria-label={`Choose ${p.productName}`}
              >
                <div className={styles.resultMain}>
                  <span className={styles.resultName}>{p.productName}</span>
                  <span className={styles.resultSub}>
                    {[p.brandOwner, p.manufacturer].filter(Boolean)
                      .filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                    {p.epaNumber ? ` · EPA ${p.epaNumber}` : ''}
                  </span>
                  <span className={styles.resultChips}>
                    {p.fracGroup && <span className={`${styles.chip} ${styles.chipFrac}`}>FRAC {p.fracGroup}</span>}
                    {p.hracGroup && <span className={`${styles.chip} ${styles.chipHrac}`}>HRAC {p.hracGroup}</span>}
                    {p.iracGroup && <span className={`${styles.chip} ${styles.chipIrac}`}>IRAC {p.iracGroup}</span>}
                    {p.pgrClass  && <span className={`${styles.chip} ${styles.chipPgr}`}>PGR {p.pgrClass}</span>}
                    {p.restrictedUse && <span className={`${styles.chip} ${styles.chipRup}`}>RUP</span>}
                  </span>
                </div>
                <span className={styles.resultCategory}>{p.category}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

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
