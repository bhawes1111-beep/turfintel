import { FUEL } from '../../../data/inventory'
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
  return (
    <div className={styles.tabContent}>
      <div className={styles.fuelGrid}>
        {FUEL.map(f => {
          const pct    = fuelPct(f.currentLevel, f.tankCapacity)
          const status = stockStatus(pct)
          return (
            <div key={f.id} className={styles.fuelCard}>
              <div className={styles.cardTop}>
                <span className={styles.fuelType}>{f.type}</span>
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
    </div>
  )
}
