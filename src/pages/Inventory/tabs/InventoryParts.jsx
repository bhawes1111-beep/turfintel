import { useState, useMemo } from 'react'
import { PARTS } from '../../../data/inventory'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Inventory.module.css'

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryParts() {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    return PARTS.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.equipment.toLowerCase().includes(search.toLowerCase()) ||
      p.partNumber.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  return (
    <div className={styles.tabContent}>
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
        PARTS.length === 0 ? (
          <EmptyState
            title="No inventory items added yet."
            description="Equipment and irrigation parts will appear here once added."
          />
        ) : (
          <p className={styles.emptyState}>No parts match your search.</p>
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
    </div>
  )
}
