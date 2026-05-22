// Phase: Cultural Practices Intelligence Foundation — CRUD.
//
// One row per practice event. Mutation auth enforced centrally in
// worker/index.js. Course-scoped. Pure storage — recovery state is a
// user-set field, not inferred here; any display defaulting is client-side.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_STATUS   = new Set(['planned', 'completed', 'skipped'])
const ALLOWED_RECOVERY = new Set(['not-started', 'in-progress', 'recovering', 'recovered', 'needs-attention'])

function rowToPractice(row) {
  if (!row) return null
  return {
    id:                    row.id,
    courseId:              row.course_id,
    practiceDate:          row.practice_date,
    practiceType:          row.practice_type,
    targetArea:            row.target_area,
    holes:                 row.holes,
    status:                row.status,
    recoveryStatus:        row.recovery_status,
    equipmentUsed:         row.equipment_used,
    materialUsed:          row.material_used,
    materialRate:          row.material_rate,
    depth:                 row.depth,
    tineSpacing:           row.tine_spacing,
    sandAmount:            row.sand_amount,
    laborNotes:            row.labor_notes,
    recoveryNotes:         row.recovery_notes,
    playabilityImpact:     row.playability_impact,
    weatherWindowNotes:    row.weather_window_notes,
    linkedCalendarEventId: row.linked_calendar_event_id,
    linkedTaskId:          row.linked_task_id,
    notes:                 row.notes,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  }
}

// Patchable text columns (apiKey → db column).
const COLUMNS = {
  practiceDate:          'practice_date',
  practiceType:          'practice_type',
  targetArea:            'target_area',
  holes:                 'holes',
  status:                'status',
  recoveryStatus:        'recovery_status',
  equipmentUsed:         'equipment_used',
  materialUsed:          'material_used',
  materialRate:          'material_rate',
  depth:                 'depth',
  tineSpacing:           'tine_spacing',
  sandAmount:            'sand_amount',
  laborNotes:            'labor_notes',
  recoveryNotes:         'recovery_notes',
  playabilityImpact:     'playability_impact',
  weatherWindowNotes:    'weather_window_notes',
  linkedCalendarEventId: 'linked_calendar_event_id',
  linkedTaskId:          'linked_task_id',
  notes:                 'notes',
}

function coerceStatus(v)   { return typeof v === 'string' && ALLOWED_STATUS.has(v) ? v : null }
function coerceRecovery(v) { return typeof v === 'string' && ALLOWED_RECOVERY.has(v) ? v : null }

// ── List + Get ──────────────────────────────────────────────────────────────

/** GET /api/cultural-practices?courseId=...&days=N&status=... — newest first. */
export async function listCulturalPractices(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.status && coerceStatus(opts.status)) { sets.push('status = ?'); all.push(opts.status) }
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) { sets.push("practice_date >= date('now', ?)"); all.push(`-${d} days`) }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 365, 1), 1000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM cultural_practices ${whereClause}
     ORDER BY date(practice_date) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToPractice))
}

export async function getCulturalPractice(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare('SELECT * FROM cultural_practices WHERE id = ?').bind(id).first()
  if (!row) return notFound('Cultural practice not found')
  return json(rowToPractice(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createCulturalPractice(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body.practiceType || typeof body.practiceType !== 'string' || body.practiceType.trim() === '') {
    return badRequest('practiceType is required')
  }
  const id       = body.id ?? generateId('cp')
  const courseId = resolveCourseId(body)
  const date     = body.practiceDate ?? new Date().toISOString().slice(0, 10)
  const status   = coerceStatus(body.status) ?? 'planned'
  const recovery = coerceRecovery(body.recoveryStatus)

  await env.DB.prepare(`
    INSERT INTO cultural_practices (
      id, course_id, practice_date, practice_type, target_area, holes, status,
      recovery_status, equipment_used, material_used, material_rate, depth,
      tine_spacing, sand_amount, labor_notes, recovery_notes, playability_impact,
      weather_window_notes, linked_calendar_event_id, linked_task_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, date, body.practiceType.trim(),
    body.targetArea ?? null, body.holes ?? null, status, recovery,
    body.equipmentUsed ?? null, body.materialUsed ?? null, body.materialRate ?? null,
    body.depth ?? null, body.tineSpacing ?? null, body.sandAmount ?? null,
    body.laborNotes ?? null, body.recoveryNotes ?? null, body.playabilityImpact ?? null,
    body.weatherWindowNotes ?? null, body.linkedCalendarEventId ?? null, body.linkedTaskId ?? null,
    body.notes ?? null,
  ).run()
  return getCulturalPractice(env, id)
}

export async function updateCulturalPractice(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []
  for (const [apiKey, col] of Object.entries(COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'status') {
      v = coerceStatus(v); if (v === null) return badRequest(`Invalid status "${body.status}"`)
    }
    if (apiKey === 'recoveryStatus' && v != null && v !== '') {
      v = coerceRecovery(v); if (v === null) return badRequest(`Invalid recoveryStatus "${body.recoveryStatus}"`)
    }
    if (apiKey === 'practiceType') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('practiceType cannot be empty')
    }
    sets.push(`${col} = ?`); binds.push(v)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE cultural_practices SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Cultural practice not found')
  return getCulturalPractice(env, id)
}

export async function deleteCulturalPractice(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare('DELETE FROM cultural_practices WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Cultural practice not found')
  return json({ ok: true, id })
}
