import { useState } from 'react'
import styles from '../PlantNutrition.module.css'
import { TREND_SERIES } from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'

function getTrendStatus(points, optimal) {
  const last = points[points.length - 1].value
  if (last < optimal[0]) return 'low'
  if (last > optimal[1]) return 'high'
  return 'ok'
}

function getBarColor(value, optimal) {
  if (value < optimal[0]) return '#d4883a'
  if (value > optimal[1]) return '#e05050'
  return 'var(--color-accent)'
}

function statusClass(status, s) {
  if (status === 'low')  return s.statusLow
  if (status === 'high') return s.statusHigh
  return s.statusOk
}

export default function NutrientTrends() {
  const [selected, setSelected] = useState('all')
  const nutrientNames = [...new Set(TREND_SERIES.map(t => t.nutrient.split(' — ')[0]))]

  const series = selected === 'all'
    ? TREND_SERIES
    : TREND_SERIES.filter(t => t.nutrient.startsWith(selected))

  if (TREND_SERIES.length === 0) {
    return (
      <div>
        <EmptyState
          title="No nutrient trend data yet."
          description="Trends across soil and tissue reports will graph here once enough data is collected."
        />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', ...nutrientNames].map(n => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: selected === n ? 'var(--color-accent)' : 'var(--color-card)',
              color: selected === n ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            {n === 'all' ? 'All' : n}
          </button>
        ))}
      </div>

      <div className={styles.trendsGrid}>
        {series.map(trend => {
          const values = trend.points.map(p => p.value)
          const maxVal  = Math.max(...values, trend.optimal[1] * 1.15)
          const status  = getTrendStatus(trend.points, trend.optimal)
          const latest  = trend.points[trend.points.length - 1]
          const prev    = trend.points[trend.points.length - 2]
          const delta   = latest.value - prev.value
          const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(2)

          return (
            <div key={trend.id} className={styles.trendCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className={styles.trendCardTitle}>{trend.nutrient}</div>
                <span className={`${styles.statusBadge} ${statusClass(status, styles)}`}>{status}</span>
              </div>

              <div className={styles.trendChartArea}>
                {trend.points.map((pt, i) => {
                  const heightPct = maxVal > 0 ? (pt.value / maxVal) * 100 : 0
                  return (
                    <div key={i} className={styles.trendBar} style={{ height: `${heightPct}%`, background: getBarColor(pt.value, trend.optimal) }}>
                      <span className={styles.trendBarValue}>{pt.value}{trend.unit}</span>
                      <span className={styles.trendBarLabel}>{pt.date.split(' ')[0].slice(0, 3)}</span>
                    </div>
                  )
                })}
              </div>

              <div className={styles.trendFooter}>
                <span>
                  Latest: <strong style={{ color: 'var(--color-text)' }}>{latest.value}{trend.unit}</strong>
                  <span style={{ marginLeft: 6, color: delta >= 0 ? 'var(--color-accent)' : '#e05050' }}>
                    {deltaStr}
                  </span>
                </span>
                <span className={styles.trendOptimalRange}>
                  Opt: {trend.optimal[0]}–{trend.optimal[1]}{trend.unit}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 16 }}>
        Charts show lab report values over time. Charting library integration planned for a future update.
      </p>
    </div>
  )
}
