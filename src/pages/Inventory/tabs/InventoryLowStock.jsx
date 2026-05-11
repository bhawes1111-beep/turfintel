import { useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS  = { low: styles.stockLow, critical: styles.stockCritical }

const KIND_LABEL = {
  product:    'Products',
  chemical:   'Chemicals',
  fertilizer: 'Fertilizer',
  part:       'Parts',
}

function buildAlerts(items) {
  return items
    .filter(item => item.reorderLevel != null && KIND_LABEL[item.kind])
    .map(item => ({
      id:           `${item.kind}-${item.id}`,
      name:         item.name,
      category:     KIND_LABEL[item.kind],
      quantity:     item.quantity,
      unit:         item.unit,
      reorderLevel: item.reorderLevel,
      status:       stockStatus(item.quantity, item.reorderLevel),
    }))
    .filter(a => a.status !== 'ok')
}

export default function InventoryLowStock() {
  const { items } = useInventoryData()
  const trackedItems = useMemo(
    () => items.filter(i => KIND_LABEL[i.kind]),
    [items],
  )
  const alerts   = useMemo(() => buildAlerts(items), [items])
  const critical = alerts.filter(a => a.status === 'critical')
  const low      = alerts.filter(a => a.status === 'low')

  const allClear  = critical.length === 0 && low.length === 0
  const hasAnyInv = trackedItems.length > 0

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Low Stock"
        subtitle="Items running below their reorder threshold."
      >

      {allClear && (
        hasAnyInv ? (
          <EmptyState
            title="All inventory levels are adequate."
            description="Items running below their reorder threshold will appear here."
          />
        ) : (
          <EmptyState
            title="No inventory tracked yet."
            description="Once products, chemicals, fertilizers, or parts are added, low-stock alerts will appear here."
          />
        )
      )}

      {critical.length > 0 && (
        <div className={styles.alertSection}>
          <p className={styles.alertSectionLabel}>Out of Stock — {critical.length} item{critical.length !== 1 ? 's' : ''}</p>
          <div className={styles.alertList}>
            {critical.map(a => (
              <div key={a.id} className={styles.alertItem}>
                <div className={styles.alertItemLeft}>
                  <span className={styles.alertItemName}>{a.name}</span>
                  <span className={styles.alertItemMeta}>{a.category}</span>
                </div>
                <div className={styles.alertItemRight}>
                  <span className={styles.alertQty}>0 {a.unit}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[a.status]}`}>
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {low.length > 0 && (
        <div className={styles.alertSection}>
          <p className={styles.alertSectionLabel}>Low Stock — {low.length} item{low.length !== 1 ? 's' : ''}</p>
          <div className={styles.alertList}>
            {low.map(a => (
              <div key={a.id} className={styles.alertItem}>
                <div className={styles.alertItemLeft}>
                  <span className={styles.alertItemName}>{a.name}</span>
                  <span className={styles.alertItemMeta}>{a.category} · reorder at {a.reorderLevel} {a.unit}</span>
                </div>
                <div className={styles.alertItemRight}>
                  <span className={styles.alertQty}>{a.quantity} {a.unit}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[a.status]}`}>
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </WorkspaceSection>
    </div>
  )
}
