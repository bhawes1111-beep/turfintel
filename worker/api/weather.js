// Phase 16 — Ambient Weather provider (server-side).
//
// The Ambient Weather REST API requires two keys (an application key
// and an API key). Both are stored as Cloudflare Worker secrets and
// must NEVER reach the browser — that's the whole reason this endpoint
// exists. The frontend calls /api/weather/ambient/current; the worker
// calls Ambient with the secrets and returns the station's latest
// observation.
//
// Secrets (set via `wrangler secret put`):
//   AMBIENT_WEATHER_APPLICATION_KEY
//   AMBIENT_WEATHER_API_KEY
//
// Response contract:
//   200 { configured: true,  source: 'ambient', sourceLabel, deviceName,
//         observedAt, lastData }   — lastData is Ambient's raw obs object;
//                                    the frontend normalizer maps it.
//   503 { configured: false, error }  — keys not set → frontend falls back to NWS
//   502 { configured: true,  error }  — Ambient API failed → frontend falls back to NWS
//
// This endpoint never throws — every failure path returns a JSON body
// the frontend can branch on, so a missing key or an Ambient outage
// degrades to the existing NWS/KSAV pipeline instead of crashing.

import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const AMBIENT_DEVICES_URL = 'https://rt.ambientweather.net/v1/devices'
const FETCH_TIMEOUT_MS    = 8000

export async function getAmbientCurrent(env) {
  const appKey = env.AMBIENT_WEATHER_APPLICATION_KEY
  const apiKey = env.AMBIENT_WEATHER_API_KEY

  if (!appKey || !apiKey) {
    // Not a server error — an expected "not wired up yet" state. The
    // frontend treats 503 here as "fall back to NWS, label it NWS".
    console.warn('[TurfIntel Weather] Ambient keys not configured — frontend will fall back to NWS')
    return json({
      configured: false,
      error: 'Ambient Weather keys not set. Run: wrangler secret put '
           + 'AMBIENT_WEATHER_APPLICATION_KEY and AMBIENT_WEATHER_API_KEY',
    }, 503)
  }

  const url = `${AMBIENT_DEVICES_URL}?applicationKey=${encodeURIComponent(appKey)}`
            + `&apiKey=${encodeURIComponent(apiKey)}`

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    console.warn('[TurfIntel Weather] Ambient fetch failed:', err.message)
    return json({ configured: true, error: `Ambient fetch failed: ${err.message}` }, 502)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[TurfIntel Weather] Ambient API non-200:', res.status, text.slice(0, 120))
    return json({ configured: true, error: `Ambient API ${res.status}` }, 502)
  }

  let devices
  try {
    devices = await res.json()
  } catch {
    return json({ configured: true, error: 'Ambient API returned non-JSON' }, 502)
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    return json({ configured: true, error: 'No Ambient devices on this account' }, 502)
  }

  // One course = one station. Take the first device; if a future
  // multi-station setup needs selection, add a ?mac= param here.
  const device   = devices[0]
  const lastData = device?.lastData ?? null
  if (!lastData || typeof lastData.tempf !== 'number') {
    return json({ configured: true, error: 'Ambient device has no usable lastData' }, 502)
  }

  return json({
    configured:  true,
    source:      'ambient',
    sourceLabel: 'Ambient Weather',
    deviceName:  device?.info?.name ?? device?.info?.location ?? null,
    observedAt:  lastData.date ?? null,
    // Raw Ambient observation — the frontend normalizer (normalizeAmbient
    // in weather/normalize.js) maps these fields into the TurfIntel
    // `current` shape, reusing the same ET / disease / spray helpers as
    // the NWS path so the two providers stay consistent.
    lastData,
  })
}

// ── Weather observation history (Phase 18) ─────────────────────────────────
//
// The worker is a pure storage layer here — the frontend already holds
// the fully-normalized `current` object from useWeather and POSTs that
// snapshot. raw_json keeps the whole object so future fields survive
// without a schema change.

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function rowToObservation(row) {
  if (!row) return null
  let raw = null
  if (row.raw_json) {
    try { raw = JSON.parse(row.raw_json) } catch { raw = null }
  }
  return {
    id:               row.id,
    courseId:         row.course_id,
    source:           row.source,
    observedAt:       row.observed_at,
    tempF:            row.temp_f,
    feelsLikeF:       row.feels_like_f,
    humidity:         row.humidity,
    dewPointF:        row.dew_point_f,
    windMph:          row.wind_mph,
    windGustMph:      row.wind_gust_mph,
    windDir:          row.wind_dir,
    rainfallTodayIn:  row.rainfall_today_in,
    hourlyRainIn:     row.hourly_rain_in,
    pressureIn:       row.pressure_in,
    etIn:             row.et_in,
    diseasePressure:  row.disease_pressure,
    sprayWindow:      row.spray_window,
    frostRisk:        row.frost_risk === 1,
    raw,
    createdAt:        row.created_at,
  }
}

/**
 * POST /api/weather/observations  (admin-key gated upstream)
 *
 * Body: { courseId?, source?, observedAt?, current }
 *   `current` is the normalized weather object from useWeather().
 * Stores one snapshot row. frost_risk is derived server-side from
 * temp_f (<= 36°F) so the client can't drift it.
 */
export async function createWeatherObservation(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)

  const body = await readJson(request)
  const cur  = body?.current
  if (!cur || typeof cur !== 'object') {
    return badRequest('current (normalized weather object) is required')
  }

  const id        = body.id ?? generateId('wob')
  const courseId  = resolveCourseId(body)
  const source    = body.source ?? cur.source ?? null
  const observed  = body.observedAt ?? cur.observedAt ?? cur.timestamp ?? null
  const tempF     = numOrNull(cur.currentTemp)
  const frostRisk = tempF != null && tempF <= 36 ? 1 : 0

  await env.DB.prepare(`
    INSERT INTO weather_observations (
      id, course_id, source, observed_at,
      temp_f, feels_like_f, humidity, dew_point_f,
      wind_mph, wind_gust_mph, wind_dir,
      rainfall_today_in, hourly_rain_in, pressure_in, et_in,
      disease_pressure, spray_window, frost_risk, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    source,
    observed,
    tempF,
    numOrNull(cur.feelsLike),
    numOrNull(cur.humidity),
    numOrNull(cur.dewPoint),
    numOrNull(cur.wind),
    numOrNull(cur.windGust),
    cur.windDir ?? null,
    numOrNull(cur.rainfall24h),
    numOrNull(cur.rainfallHourly),
    numOrNull(cur.pressure),
    numOrNull(cur.etRate),
    cur.diseasePressure ?? null,
    cur.sprayWindow ?? null,
    frostRisk,
    JSON.stringify(cur),
  ).run()

  const row = await env.DB.prepare(
    'SELECT * FROM weather_observations WHERE id = ?',
  ).bind(id).first()
  return json(rowToObservation(row))
}

/**
 * GET /api/weather/history?courseId=...&from=ISO&to=ISO&limit=N
 * Course-scoped, newest first. from/to filter on observed_at.
 */
export async function listWeatherHistory(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets  = where ? [where.replace('WHERE ', '')] : []
  const all   = [...binds]
  if (opts.from) { sets.push('observed_at >= ?'); all.push(opts.from) }
  if (opts.to)   { sets.push('observed_at <= ?'); all.push(opts.to) }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 1000)

  const { results } = await env.DB.prepare(
    `SELECT * FROM weather_observations
     ${whereClause}
     ORDER BY datetime(created_at) DESC
     LIMIT ${limit}`,
  ).bind(...all).all()
  return json(results.map(rowToObservation))
}

/**
 * GET /api/weather/current?courseId=...
 * Latest stored observation for the course (the most recent capture),
 * or { empty: true } when nothing has been captured yet.
 */
export async function getLatestWeather(env, courseId) {
  if (!env.DB) return json({ empty: true })
  const { where, binds } = buildCourseFilter(courseId)
  const row = await env.DB.prepare(
    `SELECT * FROM weather_observations
     ${where}
     ORDER BY datetime(created_at) DESC
     LIMIT 1`,
  ).bind(...binds).first()
  if (!row) return json({ empty: true })
  return json(rowToObservation(row))
}
