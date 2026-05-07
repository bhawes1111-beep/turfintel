import styles from './Weather.module.css'
import {
  PLACEHOLDER_CURRENT,
  resolveSprayWindow,
  resolveDiseasePressure,
  formatTimestamp,
} from './weatherTokens'

const SPRAY_CLASS = {
  ideal:   styles.sprayIdeal,
  caution: styles.sprayCaution,
  poor:    styles.sprayPoor,
}

const DISEASE_CLASS = {
  low:      styles.diseaseLow,
  medium:   styles.diseaseMedium,
  high:     styles.diseaseHigh,
  critical: styles.diseaseCritical,
}

/**
 * Current-conditions card.
 *
 * Props:
 *   data — current conditions object (defaults to PLACEHOLDER_CURRENT)
 *          Shape: { location, currentTemp, feelsLike, humidity, wind, windDir,
 *                   dewPoint, soilTemp, rainfall24h, solarRadiation,
 *                   etRate, etDeficit, diseasePressure, sprayWindow, timestamp }
 */
export default function WeatherCard({ data = PLACEHOLDER_CURRENT }) {
  const spray      = resolveSprayWindow(data.sprayWindow)
  const disease    = resolveDiseasePressure(data.diseasePressure)
  const sprayCls   = SPRAY_CLASS[data.sprayWindow]   ?? styles.sprayCaution
  const diseaseCls = DISEASE_CLASS[data.diseasePressure] ?? styles.diseaseMedium

  return (
    <div className={styles.weatherCard}>

      <div className={styles.weatherCardHeader}>
        <span className={styles.weatherLocation}>{data.location}</span>
        {data.timestamp && (
          <span className={styles.weatherTimestamp}>Updated {formatTimestamp(data.timestamp)}</span>
        )}
      </div>

      <div className={styles.weatherMain}>
        <div className={styles.weatherMainTemp}>{data.currentTemp}°</div>
        <div className={styles.weatherMainRight}>
          <div className={styles.weatherFeelsLike}>Feels like {data.feelsLike}°F</div>
          <div className={`${styles.sprayBadge} ${sprayCls}`}>
            {spray.icon} {spray.label}
          </div>
        </div>
      </div>

      <div className={styles.weatherGrid}>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.humidity}%</div>
          <div className={styles.weatherStatLabel}>Humidity</div>
        </div>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.wind} mph</div>
          <div className={styles.weatherStatLabel}>Wind {data.windDir}</div>
        </div>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.dewPoint}°F</div>
          <div className={styles.weatherStatLabel}>Dew Point</div>
        </div>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.soilTemp}°F</div>
          <div className={styles.weatherStatLabel}>Soil Temp</div>
        </div>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.rainfall24h}"</div>
          <div className={styles.weatherStatLabel}>Rain 24h</div>
        </div>
        <div className={styles.weatherStat}>
          <div className={styles.weatherStatValue}>{data.solarRadiation}</div>
          <div className={styles.weatherStatLabel}>Solar W/m²</div>
        </div>
      </div>

      <div className={styles.weatherFooter}>
        <span className={styles.weatherFooterLabel}>Disease Pressure</span>
        <span className={`${styles.diseaseBadge} ${diseaseCls}`}>{disease.label}</span>
        <span className={styles.weatherFooterLabel} style={{ marginLeft: 'auto' }}>
          ET Today
        </span>
        <span className={styles.weatherStatValue} style={{ fontSize: '13px' }}>
          {Number(data.etRate).toFixed(2)}"
        </span>
      </div>

    </div>
  )
}
