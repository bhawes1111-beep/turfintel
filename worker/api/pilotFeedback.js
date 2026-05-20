// Phase 31 — Pilot Feedback CRUD endpoints.
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.
// Intentionally simple: capture, list, change status, delete. No threads,
// no assignees.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_CATEGORIES = new Set([
  'bug', 'workflow', 'confusing', 'mobile', 'display-board',
  'assignment', 'spray', 'irrigation', 'weather', 'equipment',
])

const ALLOWED_STATUSES = new Set(['new', 'reviewed', 'fixed', 'ignored'])

function rowToFeedback(row) {
  if (!row) return null
  return {
    id:        row.id,
    courseId:  row.course_id,
    category:  row.category,
    note:      row.note,
    context:   row.context,
    status:    row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function coerceCategory(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_CATEGORIES.has(value) ? value : null
}

function coerceStatus(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_STATUSES.has(value) ? value : null
}

// ── List + Get ──────────────────────────────────────────────────────────────

/**
 * GET /api/pilot-feedback?courseId=...&status=...&category=...
 * Newest first. status/category filters optional.
 */
export async function listPilotFeedback(env, courseId = null, opts = {}) {
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.status && coerceStatus(opts.status)) {
    sets.push('status = ?')
    all.push(opts.status)
  }
  if (opts.category && coerceCategory(opts.category)) {
    sets.push('category = ?')
    all.push(opts.category)
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM pilot_feedback
     ${whereClause}
     ORDER BY datetime(created_at) DESC`,
  ).bind(...all).all()
  return json(results.map(rowToFeedback))
}

export async function getPilotFeedback(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM pilot_feedback WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Feedback not found')
  return json(rowToFeedback(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createPilotFeedback(env, request) {
  const body = await readJson(request)
  if (!body.note || typeof body.note !== 'string' || body.note.trim() === '') {
    return badRequest('note is required')
  }

  const id       = body.id ?? generateId('fb')
  const category = coerceCategory(body.category) ?? 'workflow'
  const courseId = resolveCourseId(body)

  await env.DB.prepare(`
    INSERT INTO pilot_feedback (
      id, course_id, category, note, context, status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    category,
    body.note.trim(),
    body.context ?? null,
    coerceStatus(body.status) ?? 'new',
  ).run()

  return getPilotFeedback(env, id)
}

export async function updatePilotFeedback(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = coerceStatus(body.status)
    if (status === null) return badRequest(`Invalid status "${body.status}"`)
    sets.push('status = ?')
    binds.push(status)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'category')) {
    const category = coerceCategory(body.category)
    if (category === null) return badRequest(`Invalid category "${body.category}"`)
    sets.push('category = ?')
    binds.push(category)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'note')) {
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (note === '') return badRequest('note cannot be empty')
    sets.push('note = ?')
    binds.push(note)
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE pilot_feedback SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Feedback not found')
  return getPilotFeedback(env, id)
}

export async function deletePilotFeedback(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM pilot_feedback WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Feedback not found')
  return json({ ok: true, id })
}
