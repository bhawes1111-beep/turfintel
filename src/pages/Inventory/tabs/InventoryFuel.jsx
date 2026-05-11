import { useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Inventory.module.css'

function fuelPct(current, capacity) {
  return Math.min(100, Math.round((current / capacity) * 100))
}

function fuelBarClass(pct) {
  if (pct <= 20) return styles.fuelBarCritical
  if (pct <= 40) return styles.fuelBarLow
  return styles.fuelBarOk
}

function stockStatus(pct) {
  if (pct <= 20) return 'critical'
  if (pct <= 40) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'Adequate', low: 'Low', critical: 'Critical' }
const STATUS_CLASS  = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryFuel() {
  const { items } = useInventoryData()
  const fuel = useMemo(() => items.filter(i => i.kind === 'fuel'), [items])
  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Fuel"
        subtitle="Diesel, gasoline, and other fuel storage levels."
      >
      {fuel.length === 0 ? (
        <EmptyState
          title="No fuel tanks tracked yet."
          description="Diesel, gasoline, and other fuel storage will appear here once configured."
        />
      ) : (
        <div className={styles.fuelGrid}>
          {fuel.map(f => {
            const pct    = fuelPct(f.currentLevel, f.tankCapacity)
            const status = stockStatus(pct)
            return (
              <div key={f.id} className={styles.fuelCard}>
                <div className={styles.cardTop}>
                  <span className={styles.fuelType}>{f.category}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <span className={styles.fuelLocation}>{f.location}</span>
                <div className={styles.fuelStats}>
                  <span className={styles.fuelLevel}>
                    {f.currentLevel} <span className={styles.fuelCapacity}>/ {f.tankCapacity} {f.unit}</span>
                  </span>
                  <span className={styles.fuelCapacity}>{pct}%</span>
                </div>
                <div className={styles.fuelBarWrap}>
                  <div
                    className={`${styles.fuelBar} ${fuelBarClass(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={styles.fuelLastFill}>Last fill: {f.lastFill}</span>
              </div>
            )
          })}
        </div>
      )}
      </WorkspaceSection>
    </div>
  )
}
