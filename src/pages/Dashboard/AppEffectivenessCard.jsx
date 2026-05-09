import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import { computeApplicationEffectiveness } from '../../utils/agronomy/applicationEffectiveness'
import styles from './AppEffectivenessCard.module.css'

function CircleGauge({ score, color }) {
  const r    = 30
  const circ = 2 * Math.PI * r
  const off  = circ * (1 - score / 100)
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
      <circle
        cx="38" cy="38" r={r}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="6"
      />
      <circle
        cx="38" cy="38" r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circ}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 38 38)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  )
}

function recText(score) {
  if (score >= 80) return 'Conditions are favorable — applications made today should perform well.'
  if (score >= 60) return 'Acceptable window. Monitor wind and humidity before spraying.'
  if (score >= 40) return 'Marginal conditions. Consider delaying non-critical applications.'
  return 'Poor conditions. Delay applications until weather improves.'
}

export default function AppEffectivenessCard() {
  const { current, forecast, loading } = useWeather()

  const result = useMemo(
    () => computeApplicationEffectiveness(current, forecast),
    [current, forecast]
  )

  if (loading || !result) return <p className={styles.aeEmpty}>Loading conditions…</p>

  const { score, rating, positives, negatives } = result

  return (
    <div className={styles.aeWrap}>

      <div className={styles.aeBody}>

        <div className={styles.aeGaugeWrap}>
          <CircleGauge score={score} color={rating.color} />
          <div className={styles.aeGaugeCenter}>
            <span className={styles.aeScoreNum} style={{ color: rating.color }}>{score}</span>
            <span className={styles.aeRatingTag} style={{ color: rating.color }}>{rating.label}</span>
          </div>
        </div>

        <div className={styles.aeFactors}>
          {positives.map(note => (
            <div key={note} className={`${styles.aeFactorRow} ${styles.aePos}`}>
              <span className={styles.aeFactorIcon}>✓</span>
              <span className={styles.aeFactorText}>{note}</span>
            </div>
          ))}
          {negatives.map(note => (
            <div key={note} className={`${styles.aeFactorRow} ${styles.aeNeg}`}>
              <span className={styles.aeFactorIcon}>✕</span>
              <span className={styles.aeFactorText}>{note}</span>
            </div>
          ))}
        </div>

      </div>

      <p className={styles.aeRec}>{recText(score)}</p>

    </div>
  )
}
