// ── Weather API fetch layer ────────────────────────────────────────────────────
// Fetches from NWS and METAR sources; falls back to localStorage cache.
// Returns normalized, evaluator-compatible objects only — never raw API shapes.
// Never throws — all failures return null or [].
//
// Source priority chain (fetchWeatherBundle):
//   1. Fresh localStorage cache (< 15 min TTL)
//   2. NWS KSAV observation  →  normalize to current
//   3. AviationWeather METAR →  normalize to current  (if NWS fails)
//   4. NWS gridpoint forecast (parallel with current)
//   5. Stale localStorage cache (any age, if all live sources fail)
// Diagnostics logged to console.debug — no UI exposure.

import { normalizeObservation, normalizeForecast, normalizeMetar } from './normalize'

const CACHE_KEY      = 'turfintel-weather-cache'
const CACHE_TTL_MS   = 15 * 60 * 1000
const STATION        = 'KSAV'
const NWS_OBS_URL    = `https://api.weather.gov/stations/${STATION}/observations/latest`
const NWS_POINTS_URL = 'https://api.weather.gov/points/32.1274,-81.2014'
const METAR_URL      = `https://aviationweather.gov/api/data/metar?ids=${STATION}&format=json`
const NWS_HEADERS    = { 'User-Agent': 'TurfIntelPro/1.0 (bhawes1111@gmail.com)' }

// Module-level cache — shared across hook instances; survives multiple calls within one session
let _forecastUrl = null

async function safeJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

function readCache(allowStale = false) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const bundle = JSON.parse(raw)
    if (!bundle?.timestamp || !bundle?.current) return null
    const ageMs = Date.now() - bundle.timestamp
    if (!allowStale && ageMs > CACHE_TTL_MS) return null
    return { ...bundle, _cacheAgeMs: ageMs }
  } catch {
    return null
  }
}

function writeCache(bundle) {
  try {
    // _cacheAgeMs is ephemeral — strip it before writing
    const { _cacheAgeMs, ...rest } = bundle
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...rest, timestamp: Date.now() }))
  } catch { /* storage quota — silently skip */ }
}

// ── NWS forecast URL resolution ────────────────────────────────────────────────

async function resolveForecastUrl() {
  if (_forecastUrl) return _forecastUrl
  const points = await safeJson(NWS_POINTS_URL, { headers: NWS_HEADERS })
  const url = points?.properties?.forecast ?? null
  if (url) _forecastUrl = url
  return url
}

// ── Internal: fetch current with source label ──────────────────────────────────

async function fetchCurrentWithSource() {
  const nwsObs = await safeJson(NWS_OBS_URL, { headers: NWS_HEADERS })
  const nwsData = normalizeObservation(nwsObs)
  if (nwsData) return { data: nwsData, source: 'nws' }

  const metar = await safeJson(METAR_URL)
  const metarData = normalizeMetar(metar)
  if (metarData) return { data: metarData, source: 'metar' }

  return { data: null, source: null }
}

// ── Public: individual fetchers ────────────────────────────────────────────────

export async function fetchCurrentWeather() {
  const { data } = await fetchCurrentWithSource()
  return data
}

export async function fetchForecast() {
  const url = await resolveForecastUrl()
  if (!url) return []
  const json = await safeJson(url, { headers: NWS_HEADERS })
  return normalizeForecast(json)
}

// ── fetchWeatherBundle ─────────────────────────────────────────────────────────
// Returns { current, forecast, source, timestamp } or null if all sources fail.
// Diagnostics: source used, cache age, stale status, fetch timestamp — console.debug only.

export async function fetchWeatherBundle() {
  // 1. Fresh cache
  const fresh = readCache(false)
  if (fresh) {
    const { _cacheAgeMs, ...bundle } = fresh
    console.debug(
      '[TurfIntel Weather] source=cache age=%dmin cached-at=%s',
      Math.round(_cacheAgeMs / 60000),
      new Date(bundle.timestamp).toISOString()
    )
    return bundle
  }

  // 2. Live fetch — current and forecast in parallel
  const [currentResult, forecast] = await Promise.all([fetchCurrentWithSource(), fetchForecast()])
  const { data: current, source } = currentResult

  if (current) {
    const bundle = { current, forecast: forecast.length ? forecast : [], source }
    writeCache(bundle)
    console.debug(
      '[TurfIntel Weather] source=%s forecastDays=%d%s fetched-at=%s',
      source,
      forecast.length,
      forecast.length === 0 ? ' (forecast unavailable — placeholder will be used)' : '',
      new Date().toISOString()
    )
    return bundle
  }

  // 3. Stale cache fallback
  const stale = readCache(true)
  if (stale) {
    const { _cacheAgeMs, ...bundle } = stale
    console.debug(
      '[TurfIntel Weather] source=stale-cache age=%dmin stale=true cached-at=%s',
      Math.round(_cacheAgeMs / 60000),
      new Date(bundle.timestamp).toISOString()
    )
    return { ...bundle, stale: true }
  }

  console.debug('[TurfIntel Weather] all sources failed — no data available')
  return null
}
