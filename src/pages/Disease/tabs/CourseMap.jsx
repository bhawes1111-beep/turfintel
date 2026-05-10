import { useState } from 'react'
import styles from '../Disease.module.css'
import { MAP_PINS } from '../../../data/disease'
import { useCourse } from '../../../context/CourseContext'
import { EmptyState } from '../../../components/shared/EmptyState'

export default function CourseMap() {
  const { activeCourse } = useCourse()
  const [hoveredPin, setHoveredPin] = useState(null)
  const [severityFilter, setSeverityFilter] = useState('all')

  const pins = severityFilter === 'all' ? MAP_PINS : MAP_PINS.filter(p => p.severity === severityFilter)

  return (
    <div className={styles.mapWrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div className={styles.mapLegend}>
          {['high', 'medium', 'low'].map(sev => (
            <div key={sev} className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles[sev]}`} />
              <span style={{ textTransform: 'capitalize' }}>{sev} severity</span>
            </div>
          ))}
        </div>
        <select
          className={styles.filterSelect}
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          style={{ fontSize: 12 }}
        >
          <option value="all">All Severities</option>
          <option value="high">High Only</option>
          <option value="medium">Medium Only</option>
          <option value="low">Low Only</option>
        </select>
      </div>

      <div className={styles.mapContainer}>
        <div className={styles.mapBg} />
        <div className={styles.mapLabel}>{activeCourse.name} — Disease Map</div>

        {MAP_PINS.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              compact
              title="No disease locations mapped."
              description="Pinned outbreaks will appear here once recorded."
            />
          </div>
        )}

        {pins.map(pin => (
          <div
            key={pin.id}
            className={styles.mapPin}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            onMouseEnter={() => setHoveredPin(pin.id)}
            onMouseLeave={() => setHoveredPin(null)}
          >
            <div className={`${styles.pinDot} ${styles[pin.severity]}`} />
            {hoveredPin === pin.id && (
              <div className={styles.pinTooltip}>
                <strong>{pin.label}</strong>
                {pin.issue}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className={styles.mapNote}>
        Pin positions are approximate placeholders. Actual GPS-mapped locations will be integrated in a future update.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {pins.map(pin => (
          <div
            key={pin.id}
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
            }}
          >
            <div className={`${styles.legendDot} ${styles[pin.severity]}`} style={{ width: 8, height: 8 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 1 }}>{pin.label}</div>
              <div style={{ color: 'var(--color-text-muted)' }}>{pin.issue}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
