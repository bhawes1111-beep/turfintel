import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import { computeApplicationEffectiveness } from '../../utils/agronomy/applicationEffectiveness'
import styles from './AppEffectivenessCard.module.css'

export default function AppEffectivenessCard() {
  const { current, forecast, loading } = useWeather()

  const result = useMemo(
    () => computeApplicationEffectiveness(current, forecast),
    [current, forecast]
  )

  if (loading || !result) return <p className={styles.aeEmpty}>Loading conditions…</p>

  const { score, rating, factors, positives, negatives } = result

  return (
    <div className={styles.aeWrap}>

      <div className={styles.aeScore} style={{ borderColor: rating.border }}>
        <span className={styles.aeScoreNumber} style={{ color: rating.color }}>
          {score}%
        </span>
        <div className={styles.aeScoreRight}>
          <span
            className={styles.aeRatingBadge}
            style={{ color: rating.color, background: rating.bg, borderColor: rating.border }}
          >
            {rating.label}
          </span>
          <span className={styles.aeRatingLabel}>Application Conditions</span>
        </div>
      </div>

      <div className={styles.aeFactors}>
        {factors.map(f => {
          const pct   = (f.pts / f.max) * 100
          const color = pct >= 75 ? '#4ecb4e' : pct >= 50 ? '#d4883a' : '#e07070'
          return (
            <div key={f.label} className={styles.aeFactor}>
              <span className={styles.aeFactorLabel}>{f.label}</span>
              <div className={styles.aeTrack}>
                <div className={styles.aeFill} style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className={styles.aeFactorPts}>{f.pts}/{f.max}</span>
            </div>
          )
        })}
      </div>

      {(positives.length > 0 || negatives.length > 0) && (
        <div className={styles.aeNotes}>
          {positives.map(note => (
            <div key={note} className={`${styles.aeNote} ${styles.aePositive}`}>
              <span className={styles.aeNoteIcon}>✓</span>
              <span>{note}</span>
            </div>
          ))}
          {negatives.map(note => (
            <div key={note} className={`${styles.aeNote} ${styles.aeNegative}`}>
              <span className={styles.aeNoteIcon}>✕</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
