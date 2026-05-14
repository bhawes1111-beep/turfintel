// ── Weather API fetch layer ────────────────────────────────────────────────────
// Fetches from the course's Ambient Weather station (primary), then NWS
// and METAR (fallback); falls back to localStorage cache. Returns
// normalized, evaluator-compatible objects only — never raw API shapes.
// Never throws — all failures return null or [].
//
// Source priority chain (fetchCurrentWithSource):
//   1. Ambient Weather station — via the worker (/api/weather/ambient/current),
//      which holds the API keys server-side. Primary live source.
//   2. NWS KSAV observation    — fallback if Ambient is unconfigured/down.
//   3. AviationWeather METAR   — fallback if NWS also fails.
//
// fetchWeatherBundle wraps that with:
//   0. Fresh localStorage cache (< 10 min TTL)
//   …current chain above…  +  NWS gridpoint forecast (always — Ambient
//      stations report real-time obs only, no forecast)
//   last. Stale localStorage cache (any age, if all live sources fail)
//
// Every bundle carries { source, sourceLabel, observedAt } so the UI can
// show a subtle "Ambient Weather" / "NWS fallback" label.
// Diagnostics logged to console.debug — no UI exposure.

import { normalizeObservation, normalizeForecast, normalizeMetar, normalizeAmbient } from './normalize'

const CACHE_KEY      = 'turfintel-weather-cache'
const CACHE_TTL_MS   = 10 * 60 * 1000
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

// ── Ambient Weather (primary) ──────────────────────────────────────────────────
// Hits the worker proxy, which holds the API keys. Reads the JSON body
// even on non-2xx so it can tell "keys not configured" (503) apart from
// "Ambient API failed" (502) — both fall back to NWS, but with distinct
// console diagnostics.

async function fetchAmbientCurrent() {
  let payload
  try {
    const res = await fetch('/api/weather/ambient/current', {
      signal: AbortSignal.timeout(8000),
    })
    payload = await res.json().catch(() => null)
  } catch {
    console.debug('[TurfIntel Weather] Ambient endpoint unreachable — falling back to NWS')
    return null
  }
  if (!payload) return null
  if (payload.configured === false) {
    console.debug('[TurfIntel Weather] Ambient Weather not configured (worker secrets unset) — using NWS')
    return null
  }
  if (payload.error || !payload.lastData) {
    console.debug('[TurfIntel Weather] Ambient Weather unavailable (%s) — using NWS', payload.error ?? 'no data')
    return null
  }
  const data = normalizeAmbient(payload.lastData, {
    deviceName:  payload.deviceName,
    observedAt:  payload.observedAt,
    sourceLabel: payload.sourceLabel,
  })
  if (!data) return null
  return {
    data,
    source:      'ambient',
    sourceLabel: 'Ambient Weather',
    observedAt:  payload.observedAt ?? data.observedAt ?? null,
  }
}

// ── Internal: fetch current with source label ──────────────────────────────────
// Ambient first, then NWS, then METAR. Each result carries source +
// sourceLabel + observedAt.

async function fetchCurrentWithSource() {
  const ambient = await fetchAmbientCurrent()
  if (ambient) return ambient

  const nwsObs = await safeJson(NWS_OBS_URL, { headers: NWS_HEADERS })
  const nwsData = normalizeObservation(nwsObs)
  if (nwsData) {
    return {
      data: nwsData,
      source: 'nws',
      sourceLabel: 'NWS fallback',
      observedAt: nwsData.timestamp ?? null,
    }
  }

  const metar = await safeJson(METAR_URL)
  const metarData = normalizeMetar(metar)
  if (metarData) {
    return {
      data: metarData,
      source: 'metar',
      sourceLabel: 'METAR fallback',
      observedAt: metarData.timestamp ?? null,
    }
  }

  return { data: null, source: null, sourceLabel: null, observedAt: null }
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
  const { data: current, source, sourceLabel, observedAt } = currentResult

  if (current) {
    const bundle = {
      current,
      forecast: forecast.length ? forecast : [],
      source,
      sourceLabel,
      observedAt,
    }
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
