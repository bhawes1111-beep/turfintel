import styles from '../CulturalPractices.module.css'
import { VERTICUT_EVENTS } from '../../../data/culturalPractices'

function impactClass(impact, s) {
  if (impact === 'high')   return s.impactHigh
  if (impact === 'medium') return s.impactMedium
  return s.impactLow
}

export default function Verticutting() {
  return (
    <div>
      {VERTICUT_EVENTS.map(ev => (
        <div key={ev.id} className={styles.eventCard}>
          <div className={styles.eventCardHeader}>
            <div>
              <div className={styles.eventAreaName}>{ev.area}</div>
              <div className={styles.eventMeta}>{ev.date} · {ev.purpose}</div>
            </div>
            <div className={styles.eventBadges}>
              <span className={`${styles.impactBadge} ${impactClass(ev.surfaceImpact, styles)}`}>
                {ev.surfaceImpact} impact
              </span>
              {ev.planned && (
                <span className={`${styles.badge} ${styles.statusPlanned}`}>planned</span>
              )}
            </div>
          </div>

          <div className={styles.specsGrid}>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Blade Spacing</div>
              <div className={styles.specValue}>{ev.bladeSpacing}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Depth</div>
              <div className={styles.specValue}>{ev.depth || '0" (surface)'}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Direction</div>
              <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.direction}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Passes</div>
              <div className={styles.specValue}>{ev.passes}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Clippings</div>
              <div className={styles.specValue} style={{ fontSize: 11 }}>
                {ev.clippingsRemoved ? 'Removed' : 'Left / Mulched'}
              </div>
            </div>
            <div className={styles.specBox} style={{ gridColumn: '1 / -1' }}>
              <div className={styles.specLabel}>Equipment</div>
              <div className={styles.specValue}>{ev.equipment}</div>
            </div>
          </div>

          {ev.notes && (
            <div className={styles.eventNotes}>{ev.notes}</div>
          )}
        </div>
      ))}
    </div>
  )
}
