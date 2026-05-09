import { useState, useEffect, useCallback } from 'react'
import { fetchWeatherBundle } from './api'
import { buildEtTrend } from './normalize'
import {
  PLACEHOLDER_CURRENT,
  PLACEHOLDER_FORECAST,
  PLACEHOLDER_ET_TREND,
} from '../../components/shared/weather/weatherTokens'

export function useWeather() {
  const [current,     setCurrent]     = useState(null)
  const [forecast,    setForecast]    = useState([])
  const [etTrend,     setEtTrend]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isStale,     setIsStale]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const bundle = await fetchWeatherBundle()
      if (bundle?.current) {
        setCurrent(bundle.current)
        const fc = bundle.forecast ?? []
        setForecast(fc)
        setEtTrend(buildEtTrend(fc))
        setLastUpdated(new Date())
        setIsStale(!!bundle.stale)
      } else {
        console.debug('[TurfIntel Weather] hook: no bundle — falling back to placeholder data')
        setError('Live weather unavailable.')
      }
    } catch {
      setError('Live weather unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Fall back to placeholder data while loading or on error
  const resolvedCurrent  = current                ?? PLACEHOLDER_CURRENT
  const resolvedForecast = forecast.length        ? forecast  : PLACEHOLDER_FORECAST
  const resolvedEtTrend  = etTrend.length         ? etTrend   : PLACEHOLDER_ET_TREND

  return {
    current:     resolvedCurrent,
    forecast:    resolvedForecast,
    etTrend:     resolvedEtTrend,
    loading,
    error,
    lastUpdated,
    isStale,
    isLive:      !!current && !isStale,
    refresh:     load,
  }
}
