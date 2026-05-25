import { useEffect, useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import SideDrawer from '../../../components/primitives/SideDrawer'
import {
  useProductCatalog,
  searchProductCatalog,
  listCatalogCategories,
  listCatalogFracGroups,
  listCatalogHracGroups,
  listCatalogIracGroups,
  listCatalogPgrClasses,
} from '../../../utils/productCatalog/productCatalogStore'
import inv      from '../Inventory.module.css'
import styles   from './InventoryCatalog.module.css'

// Phase 7C.1 (4/6) — Inventory Catalog tab.
//
// Read-only browser over the global product_catalog (FRAC/HRAC/IRAC/PGR
// chemistry, REI hours, label URLs, active ingredients). Search runs
// locally against the cached array — keystroke responsive without a
// network round-trip. No mutations, no inventory writes, no "Add to
// Inventory" CTA, no Spray Builder coupling. Existing course-owned
// inventory tabs (Products / Chemicals / etc.) are unchanged.

const ALL = 'All'

export default function InventoryCatalog({ initialSelectedId = null, onConsumeSeed } = {}) {
  const { products, loading, error } = useProductCatalog()

  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState(ALL)
  const [frac,     setFrac]     = useState(ALL)
  const [hrac,     setHrac]     = useState(ALL)
  const [irac,     setIrac]     = useState(ALL)
  const [pgr,      setPgr]      = useState(ALL)
  const [selectedId, setSelectedId] = useState(initialSelectedId)

  // Phase 7C.1 (5/6) — if the parent passes a seed id (e.g. after the user
  // clicks a 📋 chip on Chemicals/Fertilizer/Products), open that row's
  // drawer. Consume the seed so re-clicking the chip while the drawer is
  // already open doesn't fight the user's manual close. The effect is
  // idempotent — only fires when initialSelectedId changes.
  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId)
      onConsumeSeed?.()
    }
    // onConsumeSeed is a stable identity callback from the parent; omitting
    // it from deps would still be safe, but lint prefers the explicit dep.
  }, [initialSelectedId, onConsumeSeed])

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

  const selected = useMemo(
    () => products.find(p => p.id === selectedId) ?? null,
    [products, selectedId],
  )

  const filtersActive = !!search
    || category !== ALL || frac !== ALL || hrac !== ALL || irac !== ALL || pgr !== ALL

  return (
    <div className={inv.tabContent}>
      <WorkspaceSection
        title="Product Catalog"
        subtitle="Global, read-only reference: FRAC/HRAC/IRAC chemistry, REI, active ingredients, label URLs. Independent of course-owned stock."
      >
        {/* ── Toolbar: search + filter pills ── */}
        <div className={inv.toolbar}>
          <input
            type="search"
            className={inv.searchInput}
            placeholder="Search name, brand, manufacturer, EPA, ingredient, target…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search product catalog"
          />

          <div className={styles.toolbarStack}>
            <FilterRow label="Category"   options={categories} value={category} onChange={setCategory} />
            {fracGroups.length > 1 &&
              <FilterRow label="FRAC"     options={fracGroups} value={frac}     onChange={setFrac} />}
            {hracGroups.length > 1 &&
              <FilterRow label="HRAC"     options={hracGroups} value={hrac}     onChange={setHrac} />}
            {iracGroups.length > 1 &&
              <FilterRow label="IRAC"     options={iracGroups} value={irac}     onChange={setIrac} />}
            {pgrClasses.length > 1 &&
              <FilterRow label="PGR"      options={pgrClasses} value={pgr}      onChange={setPgr} />}
          </div>
        </div>

        <div className={styles.summaryRow}>
          <span className={styles.summaryCount}>
            {visible.length} product{visible.length !== 1 ? 's' : ''}
            {filtersActive && ' (filtered)'}
          </span>
          <span className={styles.summaryHint}>
            Catalog is read-only. Stock lives in the Products / Chemicals tabs.
          </span>
        </div>

        {/* ── Body states ── */}
        {error ? (
          <EmptyState
            title="Could not load the product catalog."
            description={error}
          />
        ) : loading && products.length === 0 ? (
          <EmptyState compact title="Loading catalog…" />
        ) : visible.length === 0 ? (
          products.length === 0 ? (
            <EmptyState
              title="No catalog products available."
              description="The catalog is empty. Seed data is loaded server-side via the import pipeline."
            />
          ) : (
            <EmptyState compact title="No matches." description="No catalog products match the current filters." />
          )
        ) : (
          <div className={styles.list}>
            {visible.map(p => (
              <ProductCard key={p.id} product={p} onClick={() => setSelectedId(p.id)} />
            ))}
          </div>
        )}
      </WorkspaceSection>

      {/* ── Detail drawer ── */}
      {selected && (
        <SideDrawer
          open={!!selected}
          onClose={() => setSelectedId(null)}
          ariaLabel="Catalog product details"
        >
          <SideDrawer.Header
            title={selected.productName}
            subtitle={[selected.brandOwner, selected.manufacturer]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)   // dedupe brand==mfr
              .join(' · ') || null}
            status={<span className={styles.categoryPill}>{selected.category}</span>}
            onClose={() => setSelectedId(null)}
          />
          <SideDrawer.Body>
            <CatalogDetail product={selected} />
          </SideDrawer.Body>
        </SideDrawer>
      )}
    </div>
  )
}

// ── Filter row ──────────────────────────────────────────────────────────────
function FilterRow({ label, options, value, onChange }) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterGroupLabel}>{label}</span>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`${inv.filterBtn} ${value === opt ? inv.filterBtnActive : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────
function ProductCard({ product, onClick }) {
  const ai = Array.isArray(product.activeIngredients) ? product.activeIngredients : []
  const aiText = ai.length === 0
    ? null
    : ai.map(a => a.percentage != null ? `${a.name} ${a.percentage}%` : a.name).join(' + ')

  const targets = Array.isArray(product.targets) ? product.targets : []
  const primaryTargets = targets.slice(0, 4)

  const subtitleParts = [product.brandOwner, product.manufacturer]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)

  return (
    <button type="button" className={styles.card} onClick={onClick}
      aria-label={`View details for ${product.productName}`}>
      <div className={styles.cardMain}>
        <div className={styles.cardTitle}>
          <span className={styles.cardName}>{product.productName}</span>
          {product.formulation && (
            <span className={styles.epaChip}>{product.formulation}</span>
          )}
          {product.epaNumber && (
            <span className={styles.epaChip}>EPA {product.epaNumber}</span>
          )}
        </div>
        {subtitleParts.length > 0 && (
          <div className={styles.cardSub}>{subtitleParts.join(' · ')}</div>
        )}
        {aiText && <div className={styles.cardIngredients}>{aiText}</div>}
        {primaryTargets.length > 0 && (
          <div className={styles.cardTargets}>
            Targets: {primaryTargets.join(', ')}
            {targets.length > primaryTargets.length && ` +${targets.length - primaryTargets.length} more`}
          </div>
        )}
      </div>
      <div className={styles.cardRight}>
        <span className={styles.categoryPill}>{product.category}</span>
        <Chips product={product} />
      </div>
    </button>
  )
}

// ── Chips (FRAC / HRAC / IRAC / PGR / RUP) ─────────────────────────────────
function Chips({ product }) {
  return (
    <div className={styles.chipRow}>
      {product.fracGroup && (
        <span className={`${styles.chip} ${styles.chipFrac}`} title="FRAC group">
          <span className={styles.chipLabel}>FRAC</span>{product.fracGroup}
        </span>
      )}
      {product.hracGroup && (
        <span className={`${styles.chip} ${styles.chipHrac}`} title="HRAC group">
          <span className={styles.chipLabel}>HRAC</span>{product.hracGroup}
        </span>
      )}
      {product.iracGroup && (
        <span className={`${styles.chip} ${styles.chipIrac}`} title="IRAC group">
          <span className={styles.chipLabel}>IRAC</span>{product.iracGroup}
        </span>
      )}
      {product.pgrClass && (
        <span className={`${styles.chip} ${styles.chipPgr}`} title="PGR class">
          <span className={styles.chipLabel}>PGR</span>{product.pgrClass}
        </span>
      )}
      {product.restrictedUse && (
        <span className={`${styles.chip} ${styles.chipRup}`} title="Restricted Use Pesticide">RUP</span>
      )}
    </div>
  )
}

// ── Detail body ────────────────────────────────────────────────────────────
function CatalogDetail({ product }) {
  const ai      = Array.isArray(product.activeIngredients) ? product.activeIngredients : []
  const rates   = Array.isArray(product.rates) ? product.rates : []
  const targets = Array.isArray(product.targets) ? product.targets : []
  const sites   = Array.isArray(product.turfSites) ? product.turfSites : []

  return (
    <>
      {/* Identification */}
      <section className={styles.detailSection}>
        <h3 className={styles.detailSectionTitle}>Identification</h3>
        <div className={styles.detailGrid}>
          {product.epaNumber && (<>
            <span className={styles.detailLabel}>EPA #</span>
            <span className={styles.detailValue}>{product.epaNumber}</span>
          </>)}
          {product.formulation && (<>
            <span className={styles.detailLabel}>Formulation</span>
            <span className={styles.detailValue}>{product.formulation}</span>
          </>)}
          {product.brandOwner && (<>
            <span className={styles.detailLabel}>Brand owner</span>
            <span className={styles.detailValue}>{product.brandOwner}</span>
          </>)}
          {product.manufacturer && product.manufacturer !== product.brandOwner && (<>
            <span className={styles.detailLabel}>Manufacturer</span>
            <span className={styles.detailValue}>{product.manufacturer}</span>
          </>)}
          {product.chemicalClass && (<>
            <span className={styles.detailLabel}>Chemical class</span>
            <span className={styles.detailValue}>{product.chemicalClass}</span>
          </>)}
          {product.fertilizerAnalysis && (<>
            <span className={styles.detailLabel}>Analysis</span>
            <span className={styles.detailValue}>{product.fertilizerAnalysis}</span>
          </>)}
        </div>
        <div style={{ marginTop: 10 }}><Chips product={product} /></div>
      </section>

      {/* Active ingredients */}
      {ai.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Active ingredients</h3>
          <ul className={styles.detailList}>
            {ai.map((a, i) => (
              <li key={i}>
                {a.name}{a.percentage != null && <> — {a.percentage}%</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rates */}
      {rates.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Label rates</h3>
          {rates.map((r, i) => (
            <div key={i} className={styles.rateRow}>
              {r.rate}{r.unit ? ` ${r.unit}` : ''}
              {r.interval && <span className={styles.rateInterval}>· {r.interval}</span>}
            </div>
          ))}
        </section>
      )}

      {/* Targets */}
      {targets.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Targets</h3>
          <ul className={styles.detailList}>
            {targets.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      )}

      {/* Turf sites */}
      {sites.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Turf sites</h3>
          <div className={styles.detailValue}>{sites.join(', ')}</div>
        </section>
      )}

      {/* Regulatory + safety */}
      {(product.signalWord != null || product.reiHours != null || product.phiHours != null
        || product.restrictedUse) && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Regulatory &amp; safety</h3>
          <div className={styles.detailGrid}>
            {product.signalWord && (<>
              <span className={styles.detailLabel}>Signal word</span>
              <span className={styles.detailValue}>{product.signalWord}</span>
            </>)}
            {product.reiHours != null && (<>
              <span className={styles.detailLabel}>REI</span>
              <span className={styles.detailValue}>{product.reiHours} h</span>
            </>)}
            {product.phiHours != null && (<>
              <span className={styles.detailLabel}>PHI</span>
              <span className={styles.detailValue}>{product.phiHours} h</span>
            </>)}
            {product.restrictedUse && (<>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.detailValue}>Restricted Use Pesticide</span>
            </>)}
          </div>
        </section>
      )}

      {/* Label link */}
      {product.labelUrl && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Label</h3>
          <a
            href={product.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.labelLink}
          >
            {product.labelUrl} ↗
          </a>
        </section>
      )}

      {/* Notes */}
      {product.notes && (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Notes</h3>
          <p className={styles.notesBlock}>{product.notes}</p>
        </section>
      )}

      {/* Provenance */}
      <section className={styles.detailSection}>
        <h3 className={styles.detailSectionTitle}>Source</h3>
        <div className={styles.provenance}>
          {[product.source, product.sourceVersion].filter(Boolean).join(' · ') || '(unspecified)'}
          {' · '}id: {product.id}
        </div>
      </section>
    </>
  )
}
