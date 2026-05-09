// ── Weather API fetch layer ────────────────────────────────────────────────────
// Fetches from NWS and METAR sources; falls back to localStorage cache.
// Returns normalized, evaluator-compatible objects only — never raw API shapes.
// Never throws — all failures return null or [].

import { normalizeObservation, normalizeForecast, normalizeMetar } from './normalize'

const CACHE_KEY      = 'turfintel-weather-cache'
const CACHE_TTL_MS   = 15 * 60 * 1000
const STATION        = 'KSAV'
const NWS_OBS_URL    = `https://api.weather.gov/stations/${STATION}/observations/latest`
const NWS_POINTS_URL = 'https://api.weather.gov/points/32.1274,-81.2014'
const METAR_URL      = `https://aviationweather.gov/api/data/metar?ids=${STATION}&format=json`
const NWS_HEADERS    = { 'User-Agent': 'TurfIntelPro/1.0 (bhawes1111@gmail.com)' }

// Module-level cache so multiple hook instances share the same resolved URL
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
    if (!allowStale && Date.now() - bundle.timestamp > CACHE_TTL_MS) return null
    return bundle
  } catch {
    return null
  }
}

function writeCache(bundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...bundle, timestamp: Date.now() }))
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

// ── Individual fetchers ────────────────────────────────────────────────────────

export async function fetchCurrentWeather() {
  const nwsObs = await safeJson(NWS_OBS_URL, { headers: NWS_HEADERS })
  const normalized = normalizeObservation(nwsObs)
  if (normalized) return normalized

  const metar = await safeJson(METAR_URL)
  return normalizeMetar(metar)
}

export async function fetchForecast() {
  const url = await resolveForecastUrl()
  if (!url) return []
  const json = await safeJson(url, { headers: NWS_HEADERS })
  return normalizeForecast(json)
}

// ── fetchWeatherBundle ─────────────────────────────────────────────────────────
// Priority chain:
//   1. Fresh localStorage cache (< 15 min)
//   2. Live NWS observation + NWS gridpoint forecast
//   3. Live METAR (embedded in fetchCurrentWeather fallback)
//   4. Stale localStorage cache (any age)
// Returns { current, forecast, timestamp } or null if all sources fail.

export async function fetchWeatherBundle() {
  const fresh = readCache(false)
  if (fresh) return fresh

  const [current, forecast] = await Promise.all([fetchCurrentWeather(), fetchForecast()])

  if (current) {
    const bundle = { current, forecast: forecast.length ? forecast : [] }
    writeCache(bundle)
    return bundle
  }

  const stale = readCache(true)
  if (stale) return { ...stale, stale: true }

  return null
}
