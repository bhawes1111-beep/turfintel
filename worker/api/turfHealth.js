// Phase 7B.1 — Turf Health Observation Foundation: CRUD.
//
// Field observations of shade, airflow, weak turf, and chronic stress.
// Mutation auth enforced centrally in worker/index.js. Course-scoped.
// Pure storage — any future "stress heatmap" / shade analytics layers
// will be computed at read time from these rows, never stored.
//
// Schema mirrors disease + moisture deliberately; the existing client
// patterns (optimistic submit, retry, batched attachment cache, photo
// chip) all work over this row shape without accommodation.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// Same severity vocabulary as disease — three rungs the field user can
// distinguish without thinking. New levels are a UX decision, not a Worker
// decision; both client and Worker must move together if this ever grows.
const ALLOWED_SEVERITY  = new Set(['low', 'moderate', 'high'])
const ALLOWED_STATUS    = new Set(['active', 'monitoring', 'resolved'])

// The 12 v1 observation types (also surfaced as preset pills in the
// capture sheet). Editing this list ships immediately by editing this
// set + the client preset list — no migration. Anything outside this set
// gets rejected with a clear 400.
const ALLOWED_HEALTH_TYPES = new Set([
  'morning-shade',
  'afternoon-shade',
  'all-day-shade',
  'poor-airflow',
  'wet-pocket',
  'weak-bermuda',
  'slow-recovery',
  'algae-moss',
  'chronic-wilt',
  'localized-dry-spot',
  'traffic-stress',
  'scalping-thin',
])

// Area-type is descriptive metadata — not enforced as strictly. Accept any
// non-empty string but normalize to a known set when matched.
const KNOWN_AREA_TYPES = new Set([
  'green', 'tee', 'fairway', 'approach', 'rough', 'bunker', 'cart-path', 'other',
])

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}

function coerceSeverity(v)   { return typeof v === 'string' && ALLOWED_SEVERITY.has(v)   ? v : null }
function coerceStatus(v)     { return typeof v === 'string' && ALLOWED_STATUS.has(v)     ? v : null }
function coerceHealthType(v) { return typeof v === 'string' && ALLOWED_HEALTH_TYPES.has(v) ? v : null }
function coerceAreaType(v) {
  if (typeof v !== 'string' || v.trim() === '') return null
  const norm = v.trim().toLowerCase()
  return KNOWN_AREA_TYPES.has(norm) ? norm : norm  // accept unknowns; descriptive only
}

// tags arrive as either a JS array (client) or a JSON string (storage).
// Always store as JSON string; return as parsed array.
function tagsToJson(v) {
  if (v == null) return null
  if (Array.isArray(v)) return JSON.stringify(v.filter(t => typeof t === 'string' && t.trim() !== ''))
  if (typeof v === 'string' && v.trim().startsWith('[')) return v
  return null
}
function parseTags(raw) {
  if (!raw) return []
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [] }
  catch { return [] }
}

function rowToObs(row) {
  if (!row) return null
  return {
    id:               row.id,
    courseId:         row.course_id,
    observedAt:       row.observed_at,
    observedBy:       row.observed_by,
    location:         row.location,
    hole:             row.hole,
    areaType:         row.area_type,
    healthType:       row.health_type,
    severity:         row.severity,
    surfaceNote:      row.surface_note,
    notes:            row.notes,
    tags:             parseTags(row.tags_json),
    status:           row.status,
    followUpDate:     row.follow_up_date,
    // Capture-time provenance (Phase 7A.1 pattern).
    clientId:         row.client_id         ?? null,
    clientObservedAt: row.client_observed_at ?? null,
    lat:              row.lat               ?? null,
    lng:              row.lng               ?? null,
    gpsAccuracy:      row.gps_accuracy      ?? null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

// Patchable columns (apiKey → db column). Values handled specially in
// updateTurfHealth below: severity / status / healthType are coerced; tags
// goes through tagsToJson.
const TEXT_COLUMNS = {
  observedAt:    'observed_at',
  observedBy:    'observed_by',
  location:      'location',
  areaType:      'area_type',
  healthType:    'health_type',
  severity:      'severity',
  status:        'status',
  surfaceNote:   'surface_note',
  notes:         'notes',
  followUpDate:  'follow_up_date',
}

// ── List + Get ──────────────────────────────────────────────────────────────

/** GET /api/turf-health?courseId=...&days=N&status=... — newest first. */
export async function listTurfHealth(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.status && coerceStatus(opts.status)) { sets.push('status = ?'); all.push(opts.status) }
  if (opts.healthType && coerceHealthType(opts.healthType)) {
    sets.push('health_type = ?'); all.push(opts.healthType)
  }
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) {
      sets.push("observed_at >= datetime('now', ?)"); all.push(`-${d} days`)
    }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 365, 1), 1000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM turf_health_observations ${whereClause}
     ORDER BY datetime(observed_at) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToObs))
}

export async function getTurfHealth(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM turf_health_observations WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Turf health observation not found')
  return json(rowToObs(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createTurfHealth(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)

  if (!body.location || typeof body.location !== 'string' || body.location.trim() === '') {
    return badRequest('location is required')
  }
  const healthType = coerceHealthType(body.healthType)
  if (!healthType) {
    return badRequest(`healthType must be one of: ${[...ALLOWED_HEALTH_TYPES].join(', ')}`)
  }

  // Phase 7A.1 — clientId dedup. If the browser retried a previous submit
  // (flaky network), return the prior row so the optimistic insert resolves
  // cleanly instead of duplicating.
  const clientId = typeof body.clientId === 'string' && body.clientId.trim() !== ''
    ? body.clientId.trim() : null
  if (clientId) {
    const existing = await env.DB.prepare(
      'SELECT * FROM turf_health_observations WHERE client_id = ?',
    ).bind(clientId).first()
    if (existing) return json(rowToObs(existing))
  }

  const id         = body.id ?? generateId('th')
  const courseId   = resolveCourseId(body)
  const observedAt = body.observedAt ?? new Date().toISOString()
  const severity   = coerceSeverity(body.severity)
  const status     = coerceStatus(body.status) ?? 'active'
  const areaType   = coerceAreaType(body.areaType)
  const tagsJson   = tagsToJson(body.tags)

  await env.DB.prepare(`
    INSERT INTO turf_health_observations (
      id, course_id, observed_at, observed_by,
      location, hole, area_type, health_type, severity,
      surface_note, notes, tags_json, status, follow_up_date,
      client_id, client_observed_at, lat, lng, gps_accuracy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, observedAt, body.observedBy ?? null,
    body.location.trim(),
    num(body.hole),
    areaType,
    healthType,
    severity,
    body.surfaceNote ?? null,
    body.notes ?? null,
    tagsJson,
    status,
    body.followUpDate ?? null,
    clientId,
    typeof body.clientObservedAt === 'string' && body.clientObservedAt ? body.clientObservedAt : null,
    num(body.lat),
    num(body.lng),
    num(body.gpsAccuracy),
  ).run()

  return getTurfHealth(env, id)
}

export async function updateTurfHealth(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []

  for (const [apiKey, col] of Object.entries(TEXT_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'severity' && v != null && v !== '') {
      v = coerceSeverity(v); if (v === null) return badRequest(`Invalid severity "${body.severity}"`)
    }
    if (apiKey === 'status') {
      v = coerceStatus(v); if (v === null) return badRequest(`Invalid status "${body.status}"`)
    }
    if (apiKey === 'healthType') {
      v = coerceHealthType(v); if (v === null) return badRequest(`Invalid healthType "${body.healthType}"`)
    }
    if (apiKey === 'location') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('location cannot be empty')
    }
    if (apiKey === 'areaType') v = coerceAreaType(v)
    sets.push(`${col} = ?`); binds.push(v)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hole')) {
    sets.push('hole = ?'); binds.push(num(body.hole))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    sets.push('tags_json = ?'); binds.push(tagsToJson(body.tags))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE turf_health_observations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Turf health observation not found')
  return getTurfHealth(env, id)
}

export async function deleteTurfHealth(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare(
    'DELETE FROM turf_health_observations WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Turf health observation not found')
  return json({ ok: true, id })
}
