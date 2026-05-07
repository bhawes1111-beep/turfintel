import { useState, useMemo } from 'react'
import { CHEMICALS } from '../../../data/inventory'
import styles from '../Inventory.module.css'

const TYPES = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR']

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryChemicals() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  const visible = useMemo(() => {
    return CHEMICALS.filter(c => {
      const matchFilter = filter === 'All' || c.type === filter
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                          c.location.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [search, filter])

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search chemicals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search chemicals"
        />
        <div className={styles.filterRow}>
          {TYPES.map(t => (
            <button
              key={t}
              className={`${styles.filterBtn} ${filter === t ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.emptyState}>No chemicals match your search.</p>
      ) : (
        <div className={styles.cardGrid}>
          {visible.map(c => {
            const status = stockStatus(c.quantity, c.reorderLevel)
            return (
              <div key={c.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{c.name}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Type</span>
                    <span>{c.type}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Location</span>
                    <span>{c.location}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Expires</span>
                    <span>{c.expiryDate}</span>
                  </div>
                </div>
                <div className={styles.cardQtyRow}>
                  <span className={styles.cardQty}>{c.quantity}</span>
                  <span className={styles.cardQtyUnit}>{c.unit}</span>
                  <span className={styles.cardReorder}>· reorder at {c.reorderLevel}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
