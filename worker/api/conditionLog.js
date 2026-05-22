// Phase: Course Condition Log — CRUD (upsert one log per course/date).
//
// Mutation auth is enforced centrally in worker/index.js. Course-scoped.
// One primary log per (course_id, log_date) — POST upserts against the
// UNIQUE index. private_notes is returned here (this is the superintendent
// editor surface); crew/display surfaces must read their own tables, not
// this endpoint.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const FIELDS = {
  author:             'author',
  overallRating:      'overall_rating',
  greensCondition:    'greens_condition',
  teesCondition:      'tees_condition',
  fairwaysCondition:  'fairways_condition',
  bunkersCondition:   'bunkers_condition',
  roughCondition:     'rough_condition',
  moistureSummary:    'moisture_summary',
  diseasePest:        'disease_pest',
  irrigationConcerns: 'irrigation_concerns',
  playabilityNotes:   'playability_notes',
  followupNotes:      'followup_notes',
  privateNotes:       'private_notes',
}

function rowToLog(row) {
  if (!row) return null
  return {
    id:                 row.id,
    courseId:           row.course_id,
    logDate:            row.log_date,
    author:             row.author,
    overallRating:      row.overall_rating,
    greensCondition:    row.greens_condition,
    teesCondition:      row.tees_condition,
    fairwaysCondition:  row.fairways_condition,
    bunkersCondition:   row.bunkers_condition,
    roughCondition:     row.rough_condition,
    moistureSummary:    row.moisture_summary,
    diseasePest:        row.disease_pest,
    irrigationConcerns: row.irrigation_concerns,
    playabilityNotes:   row.playability_notes,
    followupNotes:      row.followup_notes,
    privateNotes:       row.private_notes,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

// ── List + Get-by-date ──────────────────────────────────────────────────────

/** GET /api/condition-logs?courseId=...&days=N  — newest first. */
export async function listConditionLogs(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const limit = Math.min(Math.max(parseInt(opts.days, 10) || 60, 1), 365)
  const { results } = await env.DB.prepare(
    `SELECT * FROM course_condition_logs ${where} ORDER BY log_date DESC LIMIT ${limit}`,
  ).bind(...binds).all()
  return json((results ?? []).map(rowToLog))
}

/** GET /api/condition-logs/by-date?courseId=...&date=YYYY-MM-DD */
export async function getConditionLogByDate(env, courseId, date) {
  if (!env.DB) return json({ empty: true })
  if (!date) return badRequest('date is required')
  const scoped = courseId ?? 'crossroads-gc'
  const row = await env.DB.prepare(
    'SELECT * FROM course_condition_logs WHERE course_id = ? AND log_date = ?',
  ).bind(scoped, date).first()
  if (!row) return json({ empty: true })
  return json(rowToLog(row))
}

// ── Upsert (one log per course/date) ────────────────────────────────────────

/**
 * POST /api/condition-logs
 * Body: { courseId?, logDate?, ...fields }. Upserts on (course_id, log_date):
 * re-saving the same date UPDATEs the existing record in place.
 */
export async function upsertConditionLog(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body     = await readJson(request)
  const courseId = resolveCourseId(body)
  const logDate  = body.logDate ?? new Date().toISOString().slice(0, 10)

  // Resolve the field values in a stable column order.
  const cols = Object.values(FIELDS)
  const vals = Object.keys(FIELDS).map(k => (body[k] != null && body[k] !== '' ? body[k] : null))

  // Find existing row for this course/date.
  const existing = await env.DB.prepare(
    'SELECT id FROM course_condition_logs WHERE course_id = ? AND log_date = ?',
  ).bind(courseId, logDate).first()

  if (existing) {
    const setClause = cols.map(c => `${c} = ?`).join(', ')
    await env.DB.prepare(
      `UPDATE course_condition_logs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    ).bind(...vals, existing.id).run()
    return getConditionLogById(env, existing.id)
  }

  const id = body.id ?? generateId('ccl')
  const placeholders = cols.map(() => '?').join(', ')
  await env.DB.prepare(
    `INSERT INTO course_condition_logs (id, course_id, log_date, ${cols.join(', ')})
     VALUES (?, ?, ?, ${placeholders})`,
  ).bind(id, courseId, logDate, ...vals).run()
  return getConditionLogById(env, id)
}

async function getConditionLogById(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM course_condition_logs WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Condition log not found')
  return json(rowToLog(row))
}

export async function deleteConditionLog(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare(
    'DELETE FROM course_condition_logs WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Condition log not found')
  return json({ ok: true, id })
}
