// Phase: Disease Intelligence Foundation — CRUD.
//
// Field disease observations. Mutation auth enforced centrally in
// worker/index.js. Course-scoped. Pure storage — environmental pressure
// awareness is computed client-side from weather (explainable, not stored,
// not predicted).

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_STATUS   = new Set(['suspected', 'confirmed', 'treated', 'monitoring', 'resolved'])
const ALLOWED_SEVERITY = new Set(['low', 'moderate', 'high'])

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}

function rowToObs(row) {
  if (!row) return null
  return {
    id:                row.id,
    courseId:          row.course_id,
    observedAt:        row.observed_at,
    diseaseName:       row.disease_name,
    status:            row.status,
    severity:          row.severity,
    location:          row.location,
    hole:              row.hole,
    affectedArea:      row.affected_area,
    symptoms:          row.symptoms,
    turfSpecies:       row.turf_species,
    treatmentNotes:    row.treatment_notes,
    linkedSprayId:     row.linked_spray_id,
    photoAttachmentId: row.photo_attachment_id,
    followUpDate:      row.follow_up_date,
    recoveryNotes:     row.recovery_notes,
    notes:             row.notes,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

const TEXT_COLUMNS = {
  diseaseName:       'disease_name',
  status:            'status',
  severity:          'severity',
  location:          'location',
  affectedArea:      'affected_area',
  symptoms:          'symptoms',
  turfSpecies:       'turf_species',
  treatmentNotes:    'treatment_notes',
  linkedSprayId:     'linked_spray_id',
  photoAttachmentId: 'photo_attachment_id',
  followUpDate:      'follow_up_date',
  recoveryNotes:     'recovery_notes',
  notes:             'notes',
}

function coerceStatus(v)   { return typeof v === 'string' && ALLOWED_STATUS.has(v) ? v : null }
function coerceSeverity(v) { return typeof v === 'string' && ALLOWED_SEVERITY.has(v) ? v : null }

// ── List + Get ──────────────────────────────────────────────────────────────

/** GET /api/disease?courseId=...&days=N&status=... — newest first. */
export async function listDisease(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.status && coerceStatus(opts.status)) { sets.push('status = ?'); all.push(opts.status) }
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) { sets.push("observed_at >= datetime('now', ?)"); all.push(`-${d} days`) }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 365, 1), 1000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM disease_observations ${whereClause}
     ORDER BY datetime(observed_at) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToObs))
}

export async function getDisease(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare('SELECT * FROM disease_observations WHERE id = ?').bind(id).first()
  if (!row) return notFound('Disease observation not found')
  return json(rowToObs(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createDisease(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body.diseaseName || typeof body.diseaseName !== 'string' || body.diseaseName.trim() === '') {
    return badRequest('diseaseName is required')
  }
  const id       = body.id ?? generateId('dz')
  const courseId = resolveCourseId(body)
  const observed = body.observedAt ?? new Date().toISOString()
  const status   = coerceStatus(body.status) ?? 'suspected'
  const severity = coerceSeverity(body.severity)

  await env.DB.prepare(`
    INSERT INTO disease_observations (
      id, course_id, observed_at, disease_name, status, severity, location, hole,
      affected_area, symptoms, turf_species, treatment_notes, linked_spray_id,
      photo_attachment_id, follow_up_date, recovery_notes, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, observed, body.diseaseName.trim(), status, severity,
    body.location ?? null, num(body.hole), body.affectedArea ?? null,
    body.symptoms ?? null, body.turfSpecies ?? null, body.treatmentNotes ?? null,
    body.linkedSprayId ?? null, body.photoAttachmentId ?? null,
    body.followUpDate ?? null, body.recoveryNotes ?? null, body.notes ?? null,
  ).run()
  return getDisease(env, id)
}

export async function updateDisease(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []
  for (const [apiKey, col] of Object.entries(TEXT_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'status') {
      v = coerceStatus(v); if (v === null) return badRequest(`Invalid status "${body.status}"`)
    }
    if (apiKey === 'severity' && v != null && v !== '') {
      v = coerceSeverity(v); if (v === null) return badRequest(`Invalid severity "${body.severity}"`)
    }
    if (apiKey === 'diseaseName') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('diseaseName cannot be empty')
    }
    sets.push(`${col} = ?`); binds.push(v)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hole')) {
    sets.push('hole = ?'); binds.push(num(body.hole))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE disease_observations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Disease observation not found')
  return getDisease(env, id)
}

export async function deleteDisease(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare('DELETE FROM disease_observations WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Disease observation not found')
  return json({ ok: true, id })
}
