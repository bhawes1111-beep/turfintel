import styles from '../PlantNutrition.module.css'
import { TISSUE_REPORTS } from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'

function clamp(v) { return Math.max(0, Math.min(100, v)) }

function barPercent(value, optimal) {
  // Map value onto a 0–100% display where optimal center = 60%
  const [lo, hi] = optimal
  const range = hi - lo
  if (value < lo) {
    return clamp((value / lo) * 50)
  }
  if (value > hi) {
    const over = Math.min((value - hi) / range, 1)
    return clamp(80 + over * 20)
  }
  const pos = (value - lo) / range
  return clamp(50 + pos * 30)
}

function barClass(status, s) {
  if (status === 'low')  return s.barLow
  if (status === 'high') return s.barHigh
  return s.barOk
}

function statusClass(status, s) {
  if (status === 'low')  return s.statusLow
  if (status === 'high') return s.statusHigh
  return s.statusOk
}

export default function TissueReports() {
  if (TISSUE_REPORTS.length === 0) {
    return (
      <div>
        <EmptyState
          title="No tissue reports uploaded yet."
          description="Upload tissue lab reports to monitor in-plant nutrient status."
        />
      </div>
    )
  }
  return (
    <div>
      {TISSUE_REPORTS.map(report => (
        <div key={report.id} className={styles.reportCard}>
          <div className={styles.reportCardHeader}>
            <div>
              <div className={styles.reportAreaName}>{report.area}</div>
              <div className={styles.reportMeta}>
                {report.lab} · {report.date} · {report.turf}
              </div>
            </div>
            <button className={styles.uploadBtn}>+ Upload New</button>
          </div>

          <div className={styles.nutrientBarsGrid}>
            {report.nutrients.map(n => (
              <div key={n.name} className={styles.nutrientBarCard}>
                <div className={styles.nutrientBarHeader}>
                  <div>
                    <span className={styles.nutrientBarName}>{n.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>{n.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className={styles.nutrientBarValue}>{n.value} {n.unit}</span>
                    <span className={`${styles.statusBadge} ${statusClass(n.status, styles)}`}>
                      {n.status}
                    </span>
                  </div>
                </div>

                <div className={styles.nutrientBarTrack}>
                  <div
                    className={`${styles.nutrientBarFill} ${barClass(n.status, styles)}`}
                    style={{ width: `${barPercent(n.value, n.optimal)}%` }}
                  />
                </div>

                <div className={styles.nutrientBarRange}>
                  <span>Low &lt;{n.optimal[0]}{n.unit}</span>
                  <span>Optimal: {n.optimal[0]}–{n.optimal[1]} {n.unit}</span>
                  <span>High &gt;{n.optimal[1]}{n.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
