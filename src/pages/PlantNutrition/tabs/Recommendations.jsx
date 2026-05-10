import { useState } from 'react'
import styles from '../PlantNutrition.module.css'
import { RECOMMENDATIONS } from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'

function priorityClass(p, s) {
  if (p === 'high')   return s.priorityHigh
  if (p === 'medium') return s.priorityMedium
  return s.priorityLow
}

export default function Recommendations() {
  const [filter, setFilter] = useState('all')

  const recs = filter === 'all'
    ? RECOMMENDATIONS
    : RECOMMENDATIONS.filter(r => r.priority === filter)

  const counts = {
    high:   RECOMMENDATIONS.filter(r => r.priority === 'high').length,
    medium: RECOMMENDATIONS.filter(r => r.priority === 'medium').length,
    low:    RECOMMENDATIONS.filter(r => r.priority === 'low').length,
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 20,
      }}>
        {[['high', '#e05050'], ['medium', '#d4883a'], ['low', '#c8b830']].map(([p, color]) => (
          <div
            key={p}
            style={{
              background: 'var(--color-card)',
              border: `1px solid var(--color-border)`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              cursor: 'pointer',
              opacity: filter !== 'all' && filter !== p ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
            onClick={() => setFilter(filter === p ? 'all' : p)}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>{counts[p]}</div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', color }}>
              {p} priority
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: filter === f ? 'var(--color-accent)' : 'var(--color-card)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {recs.map(rec => (
        <div key={rec.id} className={`${styles.recCard} ${priorityClass(rec.priority, styles)}`}>
          <div className={styles.recHeader}>
            <div>
              <div className={styles.recTitle}>{rec.title}</div>
              <div className={styles.recArea}>{rec.area}</div>
            </div>
            <div className={styles.recBadges}>
              <span className={`${styles.priorityBadge} ${priorityClass(rec.priority, styles)}`}>
                {rec.priority}
              </span>
            </div>
          </div>

          <div className={styles.recDetail}>{rec.detail}</div>

          <div className={styles.recProductGrid}>
            <div className={styles.recProductBox}>
              <div className={styles.recProductBoxLabel}>Product</div>
              <div className={styles.recProductBoxValue}>{rec.product}</div>
            </div>
            <div className={styles.recProductBox}>
              <div className={styles.recProductBoxLabel}>Rate</div>
              <div className={styles.recProductBoxValue}>{rec.rate}</div>
            </div>
            <div className={styles.recProductBox}>
              <div className={styles.recProductBoxLabel}>Timing</div>
              <div className={styles.recProductBoxValue}>{rec.timing}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className={styles.nutrientTags}>
              {rec.nutrients.map(n => (
                <span key={n} className={styles.nutrientTag}>{n}</span>
              ))}
            </div>
            <div className={styles.recSource}>{rec.source}</div>
          </div>
        </div>
      ))}

      {recs.length === 0 && (
        RECOMMENDATIONS.length === 0 ? (
          <EmptyState
            title="No agronomic recommendations yet."
            description="Recommendations will populate based on uploaded soil, tissue, and water reports."
          />
        ) : (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No recommendations match this filter.</p>
        )
      )}
    </div>
  )
}
