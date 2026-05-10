import { PURCHASE_HISTORY } from '../../../data/inventory'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Inventory.module.css'

const STATUS_CLASS = {
  Received: styles.statusReceived,
  Ordered:  styles.statusOrdered,
  Pending:  styles.statusPending,
}

export default function InventoryPurchaseHistory() {
  if (PURCHASE_HISTORY.length === 0) {
    return (
      <div className={styles.tabContent}>
        <EmptyState
          title="No purchase history yet."
          description="Past and pending orders will appear here once recorded."
        />
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Vendor</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {PURCHASE_HISTORY.map(row => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.product}</td>
                <td>{row.category}</td>
                <td>{row.quantity} {row.unit}</td>
                <td>{row.vendor}</td>
                <td className={styles.costCell}>${row.cost.toFixed(2)}</td>
                <td>
                  <span className={`${styles.orderStatus} ${STATUS_CLASS[row.status] ?? ''}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
