import { useMemo, useState } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import EditInventoryQuantityModal from '../components/EditInventoryQuantityModal'
import { formatContainerSize } from '../../../utils/inventory/containerSize'
import { useAuth } from '../../../context/AuthContext'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (reorderLevel != null && reorderLevel > 0 && quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryIrrigation() {
  const { items } = useInventoryData()
  const irrigation = useMemo(() => items.filter(i => i.kind === 'irrigation'), [items])
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const { can } = useAuth()
  const canEditInventory = can('canEditInventory')

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return irrigation.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.category ?? '').toLowerCase().includes(q) ||
      (item.equipment ?? '').toLowerCase().includes(q) ||
      (item.partNumber ?? '').toLowerCase().includes(q) ||
      (item.location ?? '').toLowerCase().includes(q),
    )
  }, [search, irrigation])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Irrigation"
        subtitle="Heads, nozzles, valves, fittings, wire, and irrigation repair stock."
      >
        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search irrigation stock..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search irrigation inventory"
          />
        </div>

        {visible.length === 0 ? (
          irrigation.length === 0 ? (
            <EmptyState
              title="No irrigation inventory yet."
              description="Heads, nozzles, valves, fittings, and irrigation repair parts will appear here once added."
            />
          ) : (
            <EmptyState
              compact
              title="No matches."
              description="No irrigation stock matches the current search."
            />
          )
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>System / Equipment</th>
                  <th>Part #</th>
                  <th>Location</th>
                  <th>Package</th>
                  <th>Qty</th>
                  <th>Status</th>
                  {canEditInventory && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map(item => {
                  const status = stockStatus(item.quantity, item.reorderLevel)
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.category || '-'}</td>
                      <td>{item.equipment || '-'}</td>
                      <td><span className={styles.partNumber}>{item.partNumber || '-'}</span></td>
                      <td>{item.location || '-'}</td>
                      <td>{formatContainerSize(item) || '-'}</td>
                      <td>{item.quantity} {item.unit || ''}</td>
                      <td>
                        <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      {canEditInventory && (
                        <td>
                          <button
                            type="button"
                            className={styles.cardEditBtn}
                            onClick={() => setEditingItem(item)}
                            aria-label={`Edit irrigation inventory item ${item.name}`}
                          >
                            Edit item
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
