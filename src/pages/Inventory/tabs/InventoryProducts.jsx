import { useState, useMemo } from 'react'
import { useOperations } from '../../../utils/operations/OperationsContext'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import SideDrawer from '../../../components/primitives/SideDrawer'
import StatusBoard from '../../../components/primitives/StatusBoard'
import styles from '../Inventory.module.css'

const STOCK_FILTERS = ['All', 'Good', 'Low', 'Critical', 'Out of Stock']

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0)                          return 'out'
  if (quantity <= reorderLevel * 0.5)         return 'critical'
  if (quantity <= reorderLevel)               return 'low'
  return 'good'
}

const STATUS_META = {
  good:     { label: 'Good',         cls: styles.ipStockGood     },
  low:      { label: 'Low',          cls: styles.ipStockLow      },
  critical: { label: 'Critical',     cls: styles.ipStockCritical },
  out:      { label: 'Out of Stock', cls: styles.ipStockOut      },
}

const FILTER_KEY = { 'Good': 'good', 'Low': 'low', 'Critical': 'critical', 'Out of Stock': 'out' }

const SORT_STATUS = { out: 0, critical: 1, low: 2, good: 3 }

export default function InventoryProducts({ initialSelectedId = null }) {
  const { state }       = useOperations()
  const inventoryProducts = state.inventoryProducts

  const [search,    setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [stkFilter, setStkFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(initialSelectedId)

  // Derive selected product from live state so modal reflects current quantities
  const selected = useMemo(
    () => inventoryProducts.find(p => p.id === selectedId) ?? null,
    [selectedId, inventoryProducts]
  )

  // Categories derived from live data so chemical types appear automatically
  const categories = useMemo(
    () => ['All', ...new Set(inventoryProducts.map(p => p.category))],
    [inventoryProducts]
  )

  const counts = useMemo(() => {
    const c = { good: 0, low: 0, critical: 0, out: 0 }
    inventoryProducts.forEach(p => { c[stockStatus(p.quantity, p.reorderLevel)]++ })
    return c
  }, [inventoryProducts])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return inventoryProducts
      .filter(p => {
        const status = stockStatus(p.quantity, p.reorderLevel)
        const matchCat = catFilter === 'All' || p.category === catFilter
        const matchStk = stkFilter === 'All' || status === FILTER_KEY[stkFilter]
        const matchSearch = !q ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          (p.vendor && p.vendor.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q))
        return matchCat && matchStk && matchSearch
      })
      .sort((a, b) =>
        SORT_STATUS[stockStatus(a.quantity, a.reorderLevel)] -
        SORT_STATUS[stockStatus(b.quantity, b.reorderLevel)]
      )
  }, [search, catFilter, stkFilter, inventoryProducts])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Products"
        subtitle="Operational stock, organized by category and stock status."
      >

      {/* ── Stat row ── */}
      <StatusBoard columns={4}>
        <StatusBoard.Tile value={counts.out}      label="Out of Stock" tone="critical" />
        <StatusBoard.Tile value={counts.critical} label="Critical"     tone="critical" />
        <StatusBoard.Tile value={counts.low}      label="Low Stock"    tone="warn" />
        <StatusBoard.Tile value={counts.good}     label="Good"         tone="ok" />
      </StatusBoard>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search name, category, location, vendor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className={styles.filterRow}>
          {categories.map(c => (
            <button
              key={c}
              className={`${styles.filterBtn} ${catFilter === c ? styles.filterBtnActive : ''}`}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className={styles.filterRow}>
          {STOCK_FILTERS.map(s => (
            <button
              key={s}
              className={`${styles.filterBtn} ${stkFilter === s ? styles.filterBtnActive : ''}`}
              onClick={() => setStkFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.ipCount}>
        {visible.length} product{visible.length !== 1 ? 's' : ''}
        {(catFilter !== 'All' || stkFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── Product list ── */}
      {visible.length === 0 ? (
        inventoryProducts.length === 0 ? (
          <EmptyState
            title="No products in inventory yet."
            description="Products will appear here once added."
          />
        ) : (
          <EmptyState
            compact
            title="No matches."
            description="No products match the current filters."
          />
        )
      ) : (
        <div className={styles.ipList}>
          {visible.map(p => {
            const status = stockStatus(p.quantity, p.reorderLevel)
            const meta   = STATUS_META[status]
            const pct    = p.reorderLevel > 0
              ? Math.min(100, Math.round((p.quantity / (p.reorderLevel * 2)) * 100))
              : 100
            return (
              <button
                key={p.id}
                className={`${styles.ipCard} ${styles[`ipCard_${status}`]}`}
                onClick={() => setSelectedId(p.id)}
                aria-label={`View details for ${p.name}`}
              >
                {/* Left: name + category + location */}
                <div className={styles.ipCardMain}>
                  <div className={styles.ipCardTitle}>
                    <span className={styles.ipCardName}>{p.name}</span>
                    <span className={styles.ipCategoryPill}>{p.category}</span>
                  </div>
                  <div className={styles.ipCardSub}>
                    <span className={styles.ipCardLocation}>{p.location}</span>
                    {p.vendor && (
                      <span className={styles.ipCardVendor}>{p.vendor}</span>
                    )}
                  </div>

                  {/* Stock bar */}
                  <div className={styles.ipBarWrap}>
                    <div
                      className={`${styles.ipBar} ${styles[`ipBar_${status}`]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Right: qty + status badge */}
                <div className={styles.ipCardRight}>
                  <span className={`${styles.ipBigQty} ${status === 'out' ? styles.ipBigQtyOut : ''}`}>
                    {p.quantity}
                  </span>
                  <span className={styles.ipCardUnit}>{p.unit}</span>
                  <span className={`${styles.stockBadge} ${meta.cls}`}>{meta.label}</span>
                  <span className={styles.ipViewDetail}>Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      </WorkspaceSection>

      {/* ── Detail drawer ── */}
      {(() => {
        if (!selected) return null
        const status = stockStatus(selected.quantity, selected.reorderLevel)
        const meta   = STATUS_META[status]
        const accentColors = {
          good:     '#4ecb4e',
          low:      '#d4883a',
          critical: '#e05050',
          out:      '#c03030',
        }
        return (
          <SideDrawer
            open={!!selected}
            onClose={() => setSelectedId(null)}
            accentColor={accentColors[status]}
            ariaLabel="Product details"
          >
            <SideDrawer.Header
              title={selected.name}
              subtitle={`${selected.category} · ${selected.location}`}
              status={
                <span className={`${styles.stockBadge} ${meta.cls}`}>{meta.label}</span>
              }
              onClose={() => setSelectedId(null)}
            />

            <SideDrawer.Body>

                {/* Product Overview */}
                <section className={styles.ipModalSection}>
                  <h3 className={styles.ipModalSectionTitle}>Product Overview</h3>
                  <div className={styles.ipModalGrid}>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Category</span>
                      <span className={styles.ipModalFieldValue}>{selected.category}</span>
                    </div>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Unit</span>
                      <span className={styles.ipModalFieldValue}>{selected.unit}</span>
                    </div>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Stock Status</span>
                      <span className={`${styles.stockBadge} ${meta.cls}`}>{meta.label}</span>
                    </div>
                  </div>
                </section>

                {/* Stock Information */}
                <section className={styles.ipModalSection}>
                  <h3 className={styles.ipModalSectionTitle}>Stock Information</h3>
                  <div className={styles.ipModalGrid}>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Quantity on Hand</span>
                      <span className={`${styles.ipModalFieldValue} ${styles.ipModalQtyBig}`}>
                        {selected.quantity} <span className={styles.ipModalQtyUnit}>{selected.unit}</span>
                      </span>
                    </div>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Minimum Threshold</span>
                      <span className={styles.ipModalFieldValue}>{selected.reorderLevel} {selected.unit}</span>
                    </div>
                    <div className={styles.ipModalField}>
                      <span className={styles.ipModalFieldLabel}>Surplus / Deficit</span>
                      <span className={styles.ipModalFieldValue}
                        style={{ color: selected.quantity >= selected.reorderLevel ? '#4ecb4e' : '#e05050' }}
                      >
                        {selected.quantity >= selected.reorderLevel
                          ? `+${(selected.quantity - selected.reorderLevel).toFixed ? (selected.quantity - selected.reorderLevel) : selected.quantity - selected.reorderLevel} above threshold`
                          : `${selected.quantity - selected.reorderLevel} below threshold`
                        }
                      </span>
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div className={styles.ipModalBarWrap}>
                    <div
                      className={`${styles.ipBar} ${styles[`ipBar_${status}`]}`}
                      style={{
                        width: `${Math.min(100, Math.round((selected.quantity / (selected.reorderLevel * 2)) * 100))}%`,
                        height: '8px',
                        borderRadius: '6px',
                      }}
                    />
                    <div className={styles.ipModalBarLabels}>
                      <span>0</span>
                      <span>Min: {selected.reorderLevel}</span>
                      <span>Target: {selected.reorderLevel * 2}</span>
                    </div>
                  </div>
                </section>

                {/* Storage / Vendor */}
                {(selected.location || selected.vendor) && (
                  <section className={styles.ipModalSection}>
                    <h3 className={styles.ipModalSectionTitle}>Storage / Vendor</h3>
                    <div className={styles.ipModalGrid}>
                      {selected.location && (
                        <div className={styles.ipModalField}>
                          <span className={styles.ipModalFieldLabel}>Storage Location</span>
                          <span className={styles.ipModalFieldValue}>{selected.location}</span>
                        </div>
                      )}
                      {selected.vendor && (
                        <div className={styles.ipModalField}>
                          <span className={styles.ipModalFieldLabel}>Vendor</span>
                          <span className={styles.ipModalFieldValue}>{selected.vendor}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Cost Information */}
                {selected.costPerUnit != null && (
                  <section className={styles.ipModalSection}>
                    <h3 className={styles.ipModalSectionTitle}>Cost Information</h3>
                    <div className={styles.ipModalGrid}>
                      <div className={styles.ipModalField}>
                        <span className={styles.ipModalFieldLabel}>Cost per {selected.unit}</span>
                        <span className={styles.ipModalFieldValue}>
                          ${selected.costPerUnit.toFixed(2)}
                        </span>
                      </div>
                      <div className={styles.ipModalField}>
                        <span className={styles.ipModalFieldLabel}>Current Stock Value</span>
                        <span className={styles.ipModalFieldValue}>
                          ${(selected.quantity * selected.costPerUnit).toFixed(2)}
                        </span>
                      </div>
                      {selected.quantity < selected.reorderLevel && (
                        <div className={styles.ipModalField}>
                          <span className={styles.ipModalFieldLabel}>Reorder Cost (to min)</span>
                          <span className={styles.ipModalFieldValue}>
                            ${((selected.reorderLevel - selected.quantity) * selected.costPerUnit).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Usage Tracking */}
                {selected.relatedUsage && selected.relatedUsage.length > 0 && (
                  <section className={styles.ipModalSection}>
                    <h3 className={styles.ipModalSectionTitle}>Usage Tracking</h3>
                    <div className={styles.ipUsageList}>
                      {selected.relatedUsage.map((u, i) => (
                        <span key={i} className={styles.ipUsageTag}>{u}</span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Notes */}
                {selected.notes && (
                  <section className={styles.ipModalSection}>
                    <h3 className={styles.ipModalSectionTitle}>Notes</h3>
                    <p className={styles.ipModalNotes}>{selected.notes}</p>
                  </section>
                )}

            </SideDrawer.Body>
          </SideDrawer>
        )
      })()}

    </div>
  )
}
