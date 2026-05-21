// Phase: Irrigation Intelligence Foundation — daily water balance.
//
// Rolls weather_observations (raw 30-min snapshots) up into one
// daily_water_balance row per course per day: ET, rainfall, and net.
// Rolling 3/7/14-day deficits are summed from these daily rows at read time.
//
// ET provenance is explicit (et_source):
//   - 'georgia_weather_network' when a reference ET is supplied for the day
//   - 'estimated' otherwise — a transparent fallback derived from the day's
//     observations using the SAME formula as the client normalizer, so the
//     two never diverge. We never present an estimate as a measured value.
//
// Pure storage + arithmetic. No agronomic modeling, no auto-control.

import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}

// Mirrors estimateET() in src/utils/weather/normalize.js — keep in sync.
// Daily estimate: uses the day's peak temp + representative humidity/wind.
function estimateDailyEt(peakTempF, humidity, windMph) {
  if (peakTempF == null) return null
  const t   = Math.max(0, peakTempF - 50)
  const vpd = Math.max(0, (100 - (humidity ?? 50)) / 100)
  const wf  = 1 + Math.min(windMph ?? 0, 30) / 50
  return parseFloat((0.024 * t * vpd * wf).toFixed(2))
}

// Aggregate one day's observations → { rainfall_in, et_estimate, obs_count, ... }.
// rainfall: Ambient dailyrainin is a running daily total → take the max.
// ET estimate: peak temp + median humidity/wind across the day.
function aggregateDay(rows) {
  let peakTemp = null, rainMax = 0, count = 0
  const hums = [], winds = []
  for (const r of rows) {
    count += 1
    const t = num(r.temp_f)
    if (t != null && (peakTemp == null || t > peakTemp)) peakTemp = t
    const rain = num(r.rainfall_today_in)
    if (rain != null && rain > rainMax) rainMax = rain
    const h = num(r.humidity); if (h != null) hums.push(h)
    const w = num(r.wind_mph);  if (w != null) winds.push(w)
  }
  const median = arr => {
    if (arr.length === 0) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  return {
    obsCount:    count,
    rainfallIn:  rainMax,
    etEstimate:  estimateDailyEt(peakTemp, median(hums), median(winds)),
  }
}

/**
 * Upsert the daily_water_balance row for one course + date.
 *
 * @param env
 * @param courseId
 * @param opts.date         YYYY-MM-DD (defaults to today UTC)
 * @param opts.etReference  GA-Network reference ET (inches) for the day, or null
 * Returns { ok, date, etIn, etSource, rainfallIn, netIn, obsCount } or { ok:false, error }.
 */
export async function rollupDailyWaterBalance(env, courseId, opts = {}) {
  if (!env.DB) return { ok: false, error: 'D1 not configured' }
  const scoped = courseId ?? 'crossroads-gc'
  const date   = opts.date ?? new Date().toISOString().slice(0, 10)

  // Pull the day's observations (observed_at within the date, fallback created_at).
  const { results } = await env.DB.prepare(
    `SELECT temp_f, humidity, wind_mph, rainfall_today_in, observed_at, created_at
     FROM weather_observations
     WHERE course_id = ?
       AND substr(COALESCE(observed_at, created_at), 1, 10) = ?`,
  ).bind(scoped, date).all()

  const rows = results ?? []
  if (rows.length === 0) {
    return { ok: false, error: `no observations for ${scoped} on ${date}` }
  }

  const agg      = aggregateDay(rows)
  const etRef    = num(opts.etReference)
  const etIn     = etRef != null ? etRef : agg.etEstimate
  const etSource = etRef != null ? 'georgia_weather_network' : 'estimated'
  const netIn    = etIn != null ? parseFloat((agg.rainfallIn - etIn).toFixed(2)) : null

  // Idempotent upsert against UNIQUE(course_id, date).
  const id = generateId('dwb')
  await env.DB.prepare(`
    INSERT INTO daily_water_balance (id, course_id, date, et_in, et_source, rainfall_in, net_in, obs_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(course_id, date) DO UPDATE SET
      et_in       = excluded.et_in,
      et_source   = excluded.et_source,
      rainfall_in = excluded.rainfall_in,
      net_in      = excluded.net_in,
      obs_count   = excluded.obs_count,
      updated_at  = datetime('now')
  `).bind(id, scoped, date, etIn, etSource, agg.rainfallIn, netIn, agg.obsCount).run()

  return { ok: true, date, etIn, etSource, rainfallIn: agg.rainfallIn, netIn, obsCount: agg.obsCount }
}

// Roll up "today" for every course that has observations. Best-effort.
export async function rollupAllCourses(env, opts = {}) {
  if (!env.DB) return { courses: 0, rolled: 0 }
  let ids = []
  try {
    const { results } = await env.DB.prepare('SELECT id FROM courses').all()
    ids = (results ?? []).map(r => r.id).filter(Boolean)
  } catch { /* courses table absent — use default */ }
  if (ids.length === 0) ids = ['crossroads-gc']

  let rolled = 0
  for (const cid of ids) {
    try {
      const r = await rollupDailyWaterBalance(env, cid, opts)
      if (r.ok) rolled += 1
    } catch (err) {
      console.warn(`[TurfIntel WaterBalance] rollup failed for ${cid}:`, err?.message)
    }
  }
  return { courses: ids.length, rolled }
}

// Backfill every distinct observation-day for a course (one-time catch-up).
export async function backfillWaterBalance(env, courseId) {
  if (!env.DB) return { ok: false, error: 'D1 not configured' }
  const scoped = courseId ?? 'crossroads-gc'
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT substr(COALESCE(observed_at, created_at), 1, 10) AS d
     FROM weather_observations WHERE course_id = ? ORDER BY d`,
  ).bind(scoped).all()
  const days = (results ?? []).map(r => r.d).filter(Boolean)
  let rolled = 0
  for (const d of days) {
    const r = await rollupDailyWaterBalance(env, scoped, { date: d })
    if (r.ok) rolled += 1
  }
  return { ok: true, days: days.length, rolled }
}

function rowToBalance(row) {
  if (!row) return null
  return {
    id:         row.id,
    courseId:   row.course_id,
    date:       row.date,
    etIn:       row.et_in,
    etSource:   row.et_source,
    rainfallIn: row.rainfall_in,
    netIn:      row.net_in,
    obsCount:   row.obs_count,
    updatedAt:  row.updated_at,
  }
}

/**
 * GET /api/water-balance?courseId=...&days=N
 * Daily rows, newest first (default 30 days).
 */
export async function listWaterBalance(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const limit = Math.min(Math.max(parseInt(opts.days, 10) || 30, 1), 365)
  const { results } = await env.DB.prepare(
    `SELECT * FROM daily_water_balance ${where} ORDER BY date DESC LIMIT ${limit}`,
  ).bind(...binds).all()
  return json((results ?? []).map(rowToBalance))
}

/**
 * POST /api/water-balance/rollup  (admin-key gated upstream)
 * Body: { courseId?, date?, etReference?, backfill? }
 */
export async function postWaterBalanceRollup(env, request, courseId) {
  let body
  try { body = await readJson(request) } catch { body = {} }
  const cid = body.courseId ?? courseId ?? resolveCourseId(body)
  if (body.backfill) {
    const r = await backfillWaterBalance(env, cid)
    return json(r, r.ok ? 200 : 502)
  }
  const r = await rollupDailyWaterBalance(env, cid, {
    date: body.date ?? null,
    etReference: body.etReference ?? null,
  })
  if (!r.ok && !body.date) return badRequest(r.error)
  return json(r, r.ok ? 200 : 502)
}
