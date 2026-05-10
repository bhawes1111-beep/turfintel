import styles from '../PlantNutrition.module.css'
import { SOIL_REPORTS } from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'

const BASE_SAT_COLORS = {
  ca: '#4a9e4a',
  mg: '#5b8fd4',
  k:  '#d4883a',
  na: '#a05cbb',
  h:  '#888',
}

const BASE_SAT_LABELS = { ca: 'Ca', mg: 'Mg', k: 'K', na: 'Na', h: 'H' }

function statusClass(status) {
  if (status === 'low')  return styles.statusLow
  if (status === 'high') return styles.statusHigh
  return styles.statusOk
}

function TrendIcon({ trend }) {
  if (trend === 'up')     return <span className={styles.trendUp}>↑ Rising</span>
  if (trend === 'down')   return <span className={styles.trendDown}>↓ Falling</span>
  return <span className={styles.trendStable}>→ Stable</span>
}

function phStatus(value, optimal) {
  if (value < optimal[0]) return 'low'
  if (value > optimal[1]) return 'high'
  return 'ok'
}

export default function SoilReports() {
  if (SOIL_REPORTS.length === 0) {
    return (
      <div>
        <EmptyState
          title="No soil reports uploaded yet."
          description="Upload soil lab reports to track pH, CEC, organic matter, and nutrient levels."
        />
      </div>
    )
  }

  return (
    <div>
      {SOIL_REPORTS.map(report => (
        <div key={report.id} className={styles.reportCard}>
          <div className={styles.reportCardHeader}>
            <div>
              <div className={styles.reportAreaName}>{report.area}</div>
              <div className={styles.reportMeta}>
                {report.lab} · Depth: {report.depth} · {report.date} · {report.turf}
              </div>
            </div>
            <div className={styles.reportHeaderRight}>
              <button className={styles.uploadBtn}>+ Upload New</button>
            </div>
          </div>

          {/* Key metrics */}
          <div className={styles.soilKeyMetrics}>
            <div className={styles.keyMetricBox}>
              <div className={styles.keyMetricLabel}>pH</div>
              <div className={styles.keyMetricValue}>
                {report.ph.value}
              </div>
              <div className={styles.keyMetricRange}>Opt: {report.ph.optimal[0]}–{report.ph.optimal[1]}</div>
              <div className={styles.trendIndicator}><TrendIcon trend={report.ph.trend} /></div>
              <span className={`${styles.statusBadge} ${statusClass(phStatus(report.ph.value, report.ph.optimal))}`}>
                {phStatus(report.ph.value, report.ph.optimal)}
              </span>
            </div>

            <div className={styles.keyMetricBox}>
              <div className={styles.keyMetricLabel}>CEC</div>
              <div>
                <span className={styles.keyMetricValue}>{report.cec.value}</span>
                <span className={styles.keyMetricUnit}> {report.cec.unit}</span>
              </div>
              <div className={styles.keyMetricRange}>Opt: {report.cec.optimal[0]}–{report.cec.optimal[1]}</div>
              <div className={styles.trendIndicator}><TrendIcon trend={report.cec.trend} /></div>
              <span className={`${styles.statusBadge} ${styles.statusOk}`}>ok</span>
            </div>

            <div className={styles.keyMetricBox}>
              <div className={styles.keyMetricLabel}>Organic Matter</div>
              <div>
                <span className={styles.keyMetricValue}>{report.om.value}</span>
                <span className={styles.keyMetricUnit}>{report.om.unit}</span>
              </div>
              <div className={styles.keyMetricRange}>Opt: {report.om.optimal[0]}–{report.om.optimal[1]}%</div>
              <div className={styles.trendIndicator}><TrendIcon trend={report.om.trend} /></div>
              <span className={`${styles.statusBadge} ${styles.statusOk}`}>ok</span>
            </div>
          </div>

          {/* Base saturation */}
          <div>
            <div className={styles.sectionLabel}>Base Saturation</div>
            <div className={styles.baseSatBar}>
              {Object.entries(report.baseSaturation).map(([key, pct]) => (
                <div
                  key={key}
                  className={styles.baseSatSegment}
                  style={{ width: `${pct}%`, background: BASE_SAT_COLORS[key], borderRadius: 0 }}
                  title={`${BASE_SAT_LABELS[key]}: ${pct}%`}
                />
              ))}
            </div>
            <div className={styles.baseSatLegend}>
              {Object.entries(report.baseSaturation).map(([key, pct]) => (
                <div key={key} className={styles.baseSatItem}>
                  <div className={styles.baseSatDot} style={{ background: BASE_SAT_COLORS[key] }} />
                  {BASE_SAT_LABELS[key]}: {pct}%
                </div>
              ))}
            </div>
          </div>

          {/* Nutrient table */}
          <div>
            <div className={styles.sectionLabel}>Soil Nutrients</div>
            <table className={styles.nutrientTable}>
              <thead>
                <tr>
                  <th>Nutrient</th>
                  <th>Value</th>
                  <th>Optimal Range</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.nutrients).map(([key, n]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{n.value} {n.unit}</td>
                    <td>{n.optimal[0]}–{n.optimal[1]} {n.unit}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClass(n.status)}`}>
                        {n.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
