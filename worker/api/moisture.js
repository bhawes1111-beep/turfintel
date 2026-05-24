// Phase: Moisture + Handwatering Intelligence Foundation — CRUD.
//
// Field moisture observations. Mutation auth is enforced centrally in
// worker/index.js. Course-scoped. Pure storage — no agronomic inference
// here; trend/priority logic lives client-side (moistureIntel.js) and stays
// explainable.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}
function bit(v) { return v ? 1 : 0 }

function rowToObs(row) {
  if (!row) return null
  return {
    id:               row.id,
    courseId:         row.course_id,
    observedAt:       row.observed_at,
    observedBy:       row.observed_by,
    location:         row.location,
    hole:             row.hole,
    moisturePct:      row.moisture_pct,
    surfaceNote:      row.surface_note,
    wiltStress:       row.wilt_stress === 1,
    drySpot:          row.dry_spot === 1,
    handwaterRec:     row.handwater_rec === 1,
    syringeRec:       row.syringe_rec === 1,
    notes:            row.notes,
    // Phase 7A.1 capture-time provenance. All optional; older rows return null.
    clientId:         row.client_id         ?? null,
    clientObservedAt: row.client_observed_at ?? null,
    lat:              row.lat               ?? null,
    lng:              row.lng               ?? null,
    gpsAccuracy:      row.gps_accuracy      ?? null,
    createdAt:        row.created_at,
  }
}

// Patchable columns: apiKey → db column. Flags handled separately (0/1).
const CORE_COLUMNS = {
  observedBy:  'observed_by',
  location:    'location',
  surfaceNote: 'surface_note',
  notes:       'notes',
}
const FLAG_COLUMNS = {
  wiltStress:   'wilt_stress',
  drySpot:      'dry_spot',
  handwaterRec: 'handwater_rec',
  syringeRec:   'syringe_rec',
}

// ── List + Get ──────────────────────────────────────────────────────────────

/**
 * GET /api/moisture?courseId=...&location=...&days=N&limit=N
 * Newest first.
 */
export async function listMoisture(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.location) { sets.push('location = ?'); all.push(opts.location) }
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) {
      sets.push("observed_at >= datetime('now', ?)")
      all.push(`-${d} days`)
    }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 1000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM moisture_observations ${whereClause}
     ORDER BY datetime(observed_at) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToObs))
}

export async function getMoisture(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM moisture_observations WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Moisture observation not found')
  return json(rowToObs(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createMoisture(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body.location || typeof body.location !== 'string' || body.location.trim() === '') {
    return badRequest('location is required')
  }

  // Phase 7A.1: clientId dedup. If the browser retried a previous submit
  // (e.g. flaky network on the course), we don't want a duplicate row —
  // return the prior row so the client's optimistic insert resolves cleanly.
  const clientId = typeof body.clientId === 'string' && body.clientId.trim() !== ''
    ? body.clientId.trim() : null
  if (clientId) {
    const existing = await env.DB.prepare(
      'SELECT * FROM moisture_observations WHERE client_id = ?',
    ).bind(clientId).first()
    if (existing) return json(rowToObs(existing))
  }

  const id         = body.id ?? generateId('moist')
  const courseId   = resolveCourseId(body)
  const observedAt = body.observedAt ?? new Date().toISOString()

  await env.DB.prepare(`
    INSERT INTO moisture_observations (
      id, course_id, observed_at, observed_by, location, hole,
      moisture_pct, surface_note,
      wilt_stress, dry_spot, handwater_rec, syringe_rec, notes,
      client_id, client_observed_at, lat, lng, gps_accuracy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, observedAt,
    body.observedBy ?? null,
    body.location.trim(),
    num(body.hole),
    num(body.moisturePct),
    body.surfaceNote ?? null,
    bit(body.wiltStress), bit(body.drySpot), bit(body.handwaterRec), bit(body.syringeRec),
    body.notes ?? null,
    clientId,
    typeof body.clientObservedAt === 'string' && body.clientObservedAt ? body.clientObservedAt : null,
    num(body.lat),
    num(body.lng),
    num(body.gpsAccuracy),
  ).run()

  return getMoisture(env, id)
}

export async function updateMoisture(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []

  for (const [apiKey, col] of Object.entries(CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'location') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('location cannot be empty')
    }
    sets.push(`${col} = ?`); binds.push(v)
  }
  for (const [apiKey, col] of Object.entries(FLAG_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    sets.push(`${col} = ?`); binds.push(bit(body[apiKey]))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'moisturePct')) {
    sets.push('moisture_pct = ?'); binds.push(num(body.moisturePct))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hole')) {
    sets.push('hole = ?'); binds.push(num(body.hole))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE moisture_observations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Moisture observation not found')
  return getMoisture(env, id)
}

export async function deleteMoisture(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare(
    'DELETE FROM moisture_observations WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Moisture observation not found')
  return json({ ok: true, id })
}
