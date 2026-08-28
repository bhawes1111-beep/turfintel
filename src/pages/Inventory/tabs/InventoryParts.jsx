import { useState, useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import EditInventoryQuantityModal from '../components/EditInventoryQuantityModal'
import {
  calculateContainerInventoryValue,
  formatMoney,
} from '../../../utils/inventory/containerSize'
import { useAuth } from '../../../context/AuthContext'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

function partPrice(item) {
  const containerPrice = Number(item?.containerPrice)
  if (item?.containerPrice != null && Number.isFinite(containerPrice)) return containerPrice
  const costPerUnit = Number(item?.costPerUnit)
  return item?.costPerUnit != null && Number.isFinite(costPerUnit) ? costPerUnit : null
}

function partInventoryValue(item) {
  if (item?.containerCount != null && item?.containerPrice != null) {
    const packageValue = calculateContainerInventoryValue(item.containerCount, item.containerPrice)
    if (packageValue != null) return packageValue
  }

  const quantity = Number(item?.quantity)
  if (item?.costPerUnit == null) return null
  const costPerUnit = Number(item.costPerUnit)
  if (!Number.isFinite(quantity) || !Number.isFinite(costPerUnit)) return null
  return Math.round(quantity * costPerUnit * 100) / 100
}

export default function InventoryParts() {
  const { items } = useInventoryData()
  const parts = useMemo(() => items.filter(i => i.kind === 'part'), [items])
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const { can } = useAuth()
  const canEditInventory = can('canEditInventory')

  const valueSummary = useMemo(() => {
    let total = 0
    let priced = 0
    for (const part of parts) {
      const value = partInventoryValue(part)
      if (value == null) continue
      total += value
      priced += 1
    }
    return { total, priced, unpriced: parts.length - priced }
  }, [parts])

  const visible = useMemo(() => {
    return parts.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.equipmentList ?? [p.equipment]).filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()) ||
      (p.partNumber ?? '').toLowerCase().includes(search.toLowerCase()),
    )
  }, [search, parts])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Parts"
        subtitle="Equipment and irrigation replacement parts."
      >
        <div className={styles.partsValueSummary}>
          <div>
            <span className={styles.partsValueLabel}>Total parts inventory value</span>
            <strong className={styles.partsValueAmount}>{formatMoney(valueSummary.total)}</strong>
          </div>
          <span className={styles.partsValueCoverage}>
            {valueSummary.priced} of {parts.length} parts priced
            {valueSummary.unpriced > 0 ? ` - ${valueSummary.unpriced} need a price` : ''}
          </span>
        </div>

        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search by part name or equipment..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search parts"
          />
        </div>

        {visible.length === 0 ? (
          parts.length === 0 ? (
            <EmptyState
              title="No inventory items added yet."
              description="Equipment and irrigation parts will appear here once added."
            />
          ) : (
            <EmptyState
              compact
              title="No matches."
              description="No parts match the current search."
            />
          )
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Part Name</th>
                  <th>Equipment</th>
                  <th>Part #</th>
                  <th>Location</th>
                  <th className={styles.moneyHeader}>Price</th>
                  <th>Qty</th>
                  <th className={styles.moneyHeader}>Inventory Value</th>
                  <th>Status</th>
                  {canEditInventory && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const status = stockStatus(p.quantity, p.reorderLevel)
                  const price = partPrice(p)
                  const inventoryValue = partInventoryValue(p)
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{(p.equipmentList ?? [p.equipment]).filter(Boolean).join(', ') || '-'}</td>
                      <td><span className={styles.partNumber}>{p.partNumber}</span></td>
                      <td>{p.location}</td>
                      <td className={styles.moneyCell}>{price == null ? '-' : formatMoney(price)}</td>
                      <td>{p.quantity}</td>
                      <td className={styles.moneyCell}>{inventoryValue == null ? '-' : formatMoney(inventoryValue)}</td>
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
                            onClick={() => setEditingItem(p)}
                            aria-label={`Edit inventory item ${p.name}`}
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
