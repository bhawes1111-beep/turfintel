import { useMemo } from 'react'
import { generateWeatherRecommendations } from '../../utils/weather/recommendations'
import { useWeather } from '../../utils/weather/useWeather'
import { SEVERITY_TOKENS } from '../../utils/intelligence/severity'
import RecommendationList from '../../components/intelligence/RecommendationList'
import styles from './WeatherIntelligence.module.css'

export default function WeatherIntelligence() {
  const { current, forecast, loading, isLive } = useWeather()

  const recommendations = useMemo(
    () => generateWeatherRecommendations(current, forecast),
    [current, forecast]
  )

  if (loading) {
    return <p className={styles.wiEmpty}>Loading weather data…</p>
  }

  return (
    <div className={styles.wiWrap}>
      {isLive && <p className={styles.wiSourceNote}>Based on live NWS data for KSAV</p>}
      <RecommendationList
        recommendations={recommendations}
        tokens={SEVERITY_TOKENS}
        showModule
        emptyText="No weather advisories at this time. Conditions are favorable."
      />
    </div>
  )
}
