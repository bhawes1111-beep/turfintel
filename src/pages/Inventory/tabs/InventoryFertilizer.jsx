import { useState, useMemo } from 'react'
import { FERTILIZERS } from '../../../data/inventory'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryFertilizer() {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    return FERTILIZERS.filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.analysis.toLowerCase().includes(search.toLowerCase()) ||
      f.location.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search fertilizers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search fertilizers"
        />
      </div>

      {visible.length === 0 ? (
        FERTILIZERS.length === 0 ? (
          <EmptyState
            title="No fertilizer inventory yet."
            description="Granular and liquid fertilizers will appear here once stocked."
          />
        ) : (
          <p className={styles.emptyState}>No fertilizers match your search.</p>
        )
      ) : (
        <div className={styles.cardGrid}>
          {visible.map(f => {
            const status = stockStatus(f.quantity, f.reorderLevel)
            return (
              <div key={f.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{f.name}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Analysis</span>
                    <span>{f.analysis}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Location</span>
                    <span>{f.location}</span>
                  </div>
                </div>
                <div className={styles.cardQtyRow}>
                  <span className={styles.cardQty}>{f.quantity}</span>
                  <span className={styles.cardQtyUnit}>{f.unit}</span>
                  <span className={styles.cardReorder}>· reorder at {f.reorderLevel}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
