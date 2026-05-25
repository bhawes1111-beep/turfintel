import { useState, useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import CatalogChip from '../components/CatalogChip'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryFertilizer({ onOpenCatalog } = {}) {
  const { items } = useInventoryData()
  const fertilizers = useMemo(() => items.filter(i => i.kind === 'fertilizer'), [items])
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    return fertilizers.filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.analysis ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (f.location ?? '').toLowerCase().includes(search.toLowerCase())
    )
  }, [search, fertilizers])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Fertilizer"
        subtitle="Granular and liquid fertilizer stock."
      >
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
        fertilizers.length === 0 ? (
          <EmptyState
            title="No fertilizer inventory yet."
            description="Granular and liquid fertilizers will appear here once stocked."
          />
        ) : (
          <EmptyState
            compact
            title="No matches."
            description="No fertilizers match the current search."
          />
        )
      ) : (
        <div className={styles.cardGrid}>
          {visible.map(f => {
            const status = stockStatus(f.quantity, f.reorderLevel)
            return (
              <div key={f.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{f.name}</span>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <CatalogChip productCatalogId={f.productCatalogId} onOpen={onOpenCatalog} />
                    <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
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
      </WorkspaceSection>
    </div>
  )
}
