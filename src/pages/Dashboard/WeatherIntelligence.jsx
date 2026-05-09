import { useMemo } from 'react'
import { generateWeatherRecommendations } from '../../utils/weather/recommendations'
import { useWeather } from '../../utils/weather/useWeather'
import styles from './WeatherIntelligence.module.css'

const SEVERITY_META = {
  high:   { label: 'High',   color: '#e07070', bg: 'rgba(220,80,80,0.10)',   border: 'rgba(220,80,80,0.25)'   },
  medium: { label: 'Medium', color: '#d4883a', bg: 'rgba(210,130,40,0.10)',  border: 'rgba(210,130,40,0.25)'  },
  low:    { label: 'Low',    color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',   border: 'rgba(74,158,74,0.25)'   },
}

const MODULE_LABEL = {
  spray:      'Spray',
  irrigation: 'Irrigation',
  disease:    'Disease',
  agronomy:   'Agronomy',
  crew:       'Crew',
}

export default function WeatherIntelligence() {
  const { current, forecast, loading, isLive } = useWeather()

  const recommendations = useMemo(
    () => generateWeatherRecommendations(current, forecast),
    [current, forecast]
  )

  if (loading) {
    return <p className={styles.wiEmpty}>Loading weather data…</p>
  }

  if (recommendations.length === 0) {
    return <p className={styles.wiEmpty}>No weather advisories at this time. Conditions are favorable.</p>
  }

  return (
    <div className={styles.wiWrap}>
      {isLive && <p className={styles.wiSourceNote}>Based on live NWS data for KSAV</p>}
      <div className={styles.wiList}>
        {recommendations.map(rec => {
          const meta = SEVERITY_META[rec.severity] || SEVERITY_META.low
          return (
            <div
              key={rec.id}
              className={styles.wiItem}
              style={{
                '--wi-color':  meta.color,
                '--wi-bg':     meta.bg,
                '--wi-border': meta.border,
              }}
            >
              <div className={styles.wiItemLeft}>
                <span className={styles.wiIcon}>{rec.icon}</span>
                <span className={styles.wiSeverityLabel} style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </div>

              <div className={styles.wiItemBody}>
                <div className={styles.wiItemTop}>
                  <span className={styles.wiTitle}>{rec.title}</span>
                  <span className={styles.wiModulePill}>
                    {MODULE_LABEL[rec.module] || rec.module}
                  </span>
                </div>
                <p className={styles.wiMessage}>{rec.message}</p>
                <p className={styles.wiAction}>→ {rec.recommendedAction}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
