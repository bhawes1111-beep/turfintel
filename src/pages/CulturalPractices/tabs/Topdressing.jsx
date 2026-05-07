import styles from '../CulturalPractices.module.css'
import { TOPDRESS_EVENTS } from '../../../data/culturalPractices'

const TYPE_STYLE = {
  heavy: { color: '#7c5cbf', bg: 'rgba(124,92,191,0.1)', border: 'rgba(124,92,191,0.25)' },
  light: { color: '#3a8ad4', bg: 'rgba(58,138,212,0.1)', border: 'rgba(58,138,212,0.25)' },
}

export default function Topdressing() {
  const totalMaterial = TOPDRESS_EVENTS.reduce((sum, ev) => {
    const tons = parseFloat(ev.totalMaterial)
    return isNaN(tons) ? sum : sum + tons
  }, 0).toFixed(1)

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Events YTD', value: TOPDRESS_EVENTS.length },
          { label: 'Total Material YTD', value: `${totalMaterial} tons` },
          { label: 'Heavy Applications', value: TOPDRESS_EVENTS.filter(e => e.type === 'heavy').length },
          { label: 'Light Applications', value: TOPDRESS_EVENTS.filter(e => e.type === 'light').length },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 14px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {TOPDRESS_EVENTS.map(ev => {
        const ts = TYPE_STYLE[ev.type] || TYPE_STYLE.light
        return (
          <div key={ev.id} className={styles.eventCard}>
            <div className={styles.eventCardHeader}>
              <div>
                <div className={styles.eventAreaName}>{ev.area}</div>
                <div className={styles.eventMeta}>{ev.date} · {ev.frequency}</div>
              </div>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 12,
                color: ts.color, background: ts.bg, border: `1px solid ${ts.border}`,
              }}>
                {ev.type} topdress
              </span>
            </div>

            <div className={styles.specsGrid}>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Sand Type</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.sandType}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Supplier</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.supplier}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Rate</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.rate}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Total Material</div>
                <div className={styles.specValue}>{ev.totalMaterial}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Method</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.method}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Coverage</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{ev.areasCovered}</div>
              </div>
            </div>

            {ev.notes && (
              <div className={styles.eventNotes}>{ev.notes}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
