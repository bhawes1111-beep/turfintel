import styles from './Weather.module.css'
import { PLACEHOLDER_FORECAST, resolveSprayWindow, resolveWeatherIcon } from './weatherTokens'

const SPRAY_CLASS = {
  ideal:   styles.sprayIdeal,
  caution: styles.sprayCaution,
  poor:    styles.sprayPoor,
}

/**
 * Horizontally scrollable 7-day forecast strip.
 *
 * Props:
 *   forecast — array of forecast day objects:
 *              { day, date, high, low, icon, rainfall, etRate, sprayWindow, diseasePressure }
 */
export default function ForecastStrip({ forecast = PLACEHOLDER_FORECAST }) {
  return (
    <div className={styles.forecastStrip}>
      <div className={styles.forecastTrack}>
        {forecast.map((day, i) => {
          const spray    = resolveSprayWindow(day.sprayWindow)
          const sprayCls = SPRAY_CLASS[day.sprayWindow] ?? styles.sprayCaution

          return (
            <div key={i} className={styles.forecastCard}>
              <div className={styles.forecastDay}>{day.day}</div>
              <div className={styles.forecastDate}>{day.date}</div>
              <div className={styles.forecastIcon}>{resolveWeatherIcon(day.icon)}</div>
              <div className={styles.forecastTemps}>
                <span className={styles.forecastHigh}>{day.high}°</span>
                <span className={styles.forecastLow}>{day.low}°</span>
              </div>
              {day.rainfall > 0 && (
                <div className={styles.forecastRain}>🌧 {day.rainfall}"</div>
              )}
              <div className={styles.forecastEt}>{day.etRate.toFixed(2)}" ET</div>
              <div className={`${styles.sprayBadge} ${sprayCls}`}>
                {spray.icon} {spray.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
