import { useState, useMemo } from 'react'
import { deleteInventory, useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import CatalogChip from '../components/CatalogChip'
import EditInventoryQuantityModal from '../components/EditInventoryQuantityModal'
import { formatContainerSize } from '../../../utils/inventory/containerSize'
import { formatNutrientSourceSummary } from '../../../utils/inventory/nutrientForms'
import { formatFertilizerCoatingSummary } from '../../../utils/inventory/fertilizerCoatings'
import { useAuth } from '../../../context/AuthContext'
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
  const [editingItem, setEditingItem] = useState(null)
  const { can } = useAuth()
  const canEditInventory = can('canEditInventory')

  async function handleDeleteItem(item) {
    if (!item) return
    const ok = window.confirm(
      `Delete ${item.name} from fertilizer inventory? This removes the inventory item and any saved label tied to it.`,
    )
    if (!ok) return

    try {
      await deleteInventory(item.id)
      if (editingItem?.id === item.id) setEditingItem(null)
    } catch (err) {
      window.alert(err?.message || 'Could not delete this fertilizer item.')
    }
  }

  const visible = useMemo(() => {
    return fertilizers.filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.analysis ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (f.nitrogenSource ?? '').toLowerCase().includes(search.toLowerCase()) ||
      formatNutrientSourceSummary(f.nutrientSources).toLowerCase().includes(search.toLowerCase()) ||
      formatFertilizerCoatingSummary(f.fertilizerCoating).toLowerCase().includes(search.toLowerCase()) ||
      (f.location ?? '').toLowerCase().includes(search.toLowerCase()),
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
            placeholder="Search fertilizers..."
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
              const containerSize = formatContainerSize(f)
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
                    {f.analysis && (
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Analysis</span>
                        <span>{f.analysis}</span>
                      </div>
                    )}
                    {f.nitrogenSource && (
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Source</span>
                        <span>{f.nitrogenSource}</span>
                      </div>
                    )}
                    {formatNutrientSourceSummary(f.nutrientSources) && (
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Nutrients</span>
                        <span>{formatNutrientSourceSummary(f.nutrientSources)}</span>
                      </div>
                    )}
                    {formatFertilizerCoatingSummary(f.fertilizerCoating) && (
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Coating</span>
                        <span>{formatFertilizerCoatingSummary(f.fertilizerCoating)}</span>
                      </div>
                    )}
                    <div className={styles.cardMetaRow}>
                      <span className={styles.cardMetaLabel}>Location</span>
                      <span>{f.location}</span>
                    </div>
                    {containerSize && (
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Package</span>
                        <span>{containerSize}</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.cardQtyRow}>
                    <span className={styles.cardQty}>{f.quantity}</span>
                    <span className={styles.cardQtyUnit}>{f.unit}</span>
                    <span className={styles.cardReorder}>reorder at {f.reorderLevel}</span>
                  </div>
                  {canEditInventory && (
                    <div className={styles.cardEditBtnRow}>
                      <button
                        type="button"
                        className={styles.cardEditBtn}
                        onClick={() => setEditingItem(f)}
                        aria-label={`Edit inventory item ${f.name}`}
                      >
                        Edit item
                      </button>
                      <button
                        type="button"
                        className={`${styles.cardEditBtn} ${styles.cardDeleteBtn}`}
                        onClick={() => handleDeleteItem(f)}
                        aria-label={`Delete fertilizer item ${f.name}`}
                      >
                        Delete item
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </WorkspaceSection>

      {editingItem && (
        <EditInventoryQuantityModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
