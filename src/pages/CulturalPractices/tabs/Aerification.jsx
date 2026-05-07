import styles from '../CulturalPractices.module.css'
import { AERIFICATION_EVENTS } from '../../../data/culturalPractices'

function recoveryBadgeClass(status, s) {
  if (status === 'recovered')  return s.statusRecovered
  if (status === 'recovering') return s.statusRecovering
  return s.statusPlanned
}

export default function Aerification() {
  return (
    <div>
      {AERIFICATION_EVENTS.map(ev => (
        <div key={ev.id} className={styles.eventCard}>
          <div className={styles.eventCardHeader}>
            <div>
              <div className={styles.eventAreaName}>{ev.area}</div>
              <div className={styles.eventMeta}>{ev.date} · {ev.type}</div>
            </div>
            <div className={styles.eventBadges}>
              <span className={`${styles.badge} ${recoveryBadgeClass(ev.recovery, styles)}`}>
                {ev.recovery}
              </span>
              {ev.planned && (
                <span className={`${styles.badge} ${styles.statusPlanned}`}>planned</span>
              )}
              {ev.topdress && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 12,
                  color: '#3a8ad4', background: 'rgba(58,138,212,0.1)',
                  border: '1px solid rgba(58,138,212,0.25)',
                }}>
                  + topdress
                </span>
              )}
            </div>
          </div>

          <div className={styles.specsGrid}>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Tine Size</div>
              <div className={styles.specValue}>{ev.tineSize}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Tine Type</div>
              <div className={styles.specValue}>{ev.tineType}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Depth</div>
              <div className={styles.specValue}>{ev.depth}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Spacing</div>
              <div className={styles.specValue}>{ev.spacing}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Coverage</div>
              <div className={styles.specValue}>{ev.coverage}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Passes</div>
              <div className={styles.specValue}>{ev.passes}</div>
            </div>
            <div className={styles.specBox} style={{ gridColumn: '1 / -1' }}>
              <div className={styles.specLabel}>Equipment</div>
              <div className={styles.specValue}>{ev.equipment}</div>
            </div>
          </div>

          {ev.recoveryDays && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Recovery time: <strong style={{ color: 'var(--color-text)' }}>{ev.recoveryDays} days</strong>
            </div>
          )}

          {ev.notes && (
            <div className={styles.eventNotes}>{ev.notes}</div>
          )}
        </div>
      ))}
    </div>
  )
}
