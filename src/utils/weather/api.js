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

import { normalizeObservation, normalizeForecast, normalizeMetar, normalizeAmbient } from './normalize.js'

const CACHE_KEY      = 'turfintel-weather-cache'
const CACHE_TTL_MS   = 10 * 60 * 1000
const STATION        = 'KSAV'
const NWS_OBS_URL    = `https://api.weather.gov/stations/${STATION}/observations/latest`
const NWS_POINTS_URL = 'https://api.weather.gov/points/32.1274,-81.2014'
const METAR_URL      = `https://aviationweather.gov/api/data/metar?ids=${STATION}&format=json`
const NWS_HEADERS    = { 'User-Agent': 'TurfIntelPro/1.0 (bhawes1111@gmail.com)' }

// Module-level cache — shared across hook instances; survives multiple calls within one session
let _forecastUrl = null
let _forecastHourlyUrl = null

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
    const rest = { ...bundle }
    delete rest._cacheAgeMs
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

async function resolveForecastHourlyUrl() {
  if (_forecastHourlyUrl) return _forecastHourlyUrl
  const points = await safeJson(NWS_POINTS_URL, { headers: NWS_HEADERS })
  const url = points?.properties?.forecastHourly ?? null
  if (url) _forecastHourlyUrl = url
  return url
}

function validApplicationDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
}

function applicationTargetMs(date, time) {
  if (!validApplicationDate(date)) return null
  const parsed = new Date(`${date}T${time || '12:00'}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function nearestNwsObservation(features, targetMs, date) {
  let nearest = null
  let nearestDiff = Infinity
  for (const feature of features ?? []) {
    const timestamp = feature?.properties?.timestamp
    const observedMs = Date.parse(timestamp)
    if (!Number.isFinite(observedMs) || localDateKey(observedMs) !== date) continue
    const diff = Math.abs(observedMs - targetMs)
    if (diff < nearestDiff) {
      nearest = feature
      nearestDiff = diff
    }
  }
  return nearest
}

function forecastWindMph(value) {
  const values = String(value ?? '').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? []
  return values.length ? Math.max(...values) : null
}

function hourlyForecastCurrent(period) {
  if (!period) return null
  const temperature = Number(period.temperature)
  const humidity = Number(period.relativeHumidity?.value)
  const wind = forecastWindMph(period.windSpeed)
  return {
    currentTemp: Number.isFinite(temperature) ? temperature : null,
    humidity: Number.isFinite(humidity) ? humidity : null,
    wind,
    windDir: period.windDirection || '',
    soilTemp: null,
    timestamp: period.startTime || null,
    observedAt: period.startTime || null,
    source: 'nws-forecast',
    sourceLabel: 'NWS hourly forecast',
  }
}

function matchingHourlyForecast(periods, targetMs) {
  let nearest = null
  let nearestDiff = Infinity
  for (const period of periods ?? []) {
    const startMs = Date.parse(period?.startTime)
    const endMs = Date.parse(period?.endTime)
    if (!Number.isFinite(startMs)) continue
    if (targetMs >= startMs && (!Number.isFinite(endMs) || targetMs < endMs)) return period
    const diff = Math.abs(startMs - targetMs)
    if (diff < nearestDiff) {
      nearest = period
      nearestDiff = diff
    }
  }
  return nearest
}

// Returns date-aware weather for the application builder. Historical station
// observations and future hourly forecasts remain separate from live weather
// so a selected date can never silently receive today's conditions.
export async function fetchApplicationDateWeather({ date, time } = {}) {
  const targetMs = applicationTargetMs(date, time)
  if (!Number.isFinite(targetMs)) return null

  if (targetMs < Date.now()) {
    const windowMs = 18 * 60 * 60 * 1000
    const url = `${NWS_OBS_URL.replace('/latest', '')}`
      + `?start=${encodeURIComponent(new Date(targetMs - windowMs).toISOString())}`
      + `&end=${encodeURIComponent(new Date(targetMs + windowMs).toISOString())}`
      + '&limit=500'
    const payload = await safeJson(url, { headers: NWS_HEADERS })
    const matched = nearestNwsObservation(payload?.features, targetMs, date)
    const current = normalizeObservation(matched)
    return current ? {
      current,
      observedAt: current.timestamp ?? matched?.properties?.timestamp ?? null,
      sourceLabel: 'NWS historical observation',
      kind: 'historical',
    } : null
  }

  const url = await resolveForecastHourlyUrl()
  if (!url) return null
  const payload = await safeJson(url, { headers: NWS_HEADERS })
  const period = matchingHourlyForecast(payload?.properties?.periods, targetMs)
  if (!period || localDateKey(period.startTime) !== date) return null
  const current = hourlyForecastCurrent(period)
  return current ? {
    current,
    observedAt: period.startTime ?? null,
    sourceLabel: 'NWS hourly forecast',
    kind: 'forecast',
  } : null
}

// ── Ambient Weather (primary) ──────────────────────────────────────────────────
// Hits the worker proxy, which holds the API keys. Reads the JSON body
// even on non-2xx so it can tell "keys not configured" (503) apart from
// "Ambient API failed" (502) — both fall back to NWS, but with distinct
// console diagnostics.

async function fetchAmbientCurrent(ambientPath = '/api/weather/ambient/current') {
  let payload
  try {
    const res = await fetch(ambientPath, {
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

async function fetchCurrentWithSource({ ambientPath } = {}) {
  const ambient = await fetchAmbientCurrent(ambientPath)
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

export async function fetchCurrentWeather(options = {}) {
  const { data } = await fetchCurrentWithSource(options)
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

export async function fetchWeatherBundle(options = {}) {
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
  const [currentResult, forecast] = await Promise.all([fetchCurrentWithSource(options), fetchForecast()])
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
