import { useState, useMemo } from 'react'
import { PRODUCTS } from '../../../data/inventory'
import styles from '../Inventory.module.css'

const CATEGORIES = ['All', 'Substrate', 'Seed', 'Soil Amendment', 'Misc', 'Tools']

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryProducts() {
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('All')

  const visible = useMemo(() => {
    return PRODUCTS.filter(p => {
      const matchFilter = filter === 'All' || p.category === filter
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                          p.location.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [search, filter])

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search products…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className={styles.filterRow}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`${styles.filterBtn} ${filter === c ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.emptyState}>No products match your search.</p>
      ) : (
        <div className={styles.cardGrid}>
          {visible.map(p => {
            const status = stockStatus(p.quantity, p.reorderLevel)
            return (
              <div key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{p.name}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Category</span>
                    <span>{p.category}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Location</span>
                    <span>{p.location}</span>
                  </div>
                </div>
                <div className={styles.cardQtyRow}>
                  <span className={styles.cardQty}>{p.quantity}</span>
                  <span className={styles.cardQtyUnit}>{p.unit}</span>
                  <span className={styles.cardReorder}>· reorder at {p.reorderLevel}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
