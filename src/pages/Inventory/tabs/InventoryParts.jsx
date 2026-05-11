import { useState, useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryParts() {
  const { items } = useInventoryData()
  const parts = useMemo(() => items.filter(i => i.kind === 'part'), [items])
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    return parts.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.equipment ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.partNumber ?? '').toLowerCase().includes(search.toLowerCase())
    )
  }, [search, parts])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Parts"
        subtitle="Equipment and irrigation replacement parts."
      >
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by part name or equipment…"
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
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const status = stockStatus(p.quantity, p.reorderLevel)
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.equipment}</td>
                    <td><span className={styles.partNumber}>{p.partNumber}</span></td>
                    <td>{p.location}</td>
                    <td>{p.quantity}</td>
                    <td>
                      <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </WorkspaceSection>
    </div>
  )
}
