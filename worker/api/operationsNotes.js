// Operations Daily Notes — CRUD endpoints (Phase 6).
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_PRIORITIES = new Set([
  'routine', 'important', 'urgent', 'weather', 'safety',
])

function rowToNote(row) {
  if (!row) return null
  return {
    id:         row.id,
    courseId:   row.course_id,
    noteDate:   row.note_date,
    title:      row.title,
    body:       row.body,
    // Phase 9C.5b1 — manual Spanish translations for kiosk display.
    titleEs:    row.title_es,
    bodyEs:     row.body_es,
    priority:   row.priority,
    pinned:     row.pinned === 1,
    createdBy:  row.created_by,
    status:     row.status,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

const CORE_COLUMNS = {
  noteDate:   'note_date',
  title:      'title',
  body:       'body',
  titleEs:    'title_es',                                   // Phase 9C.5b1
  bodyEs:     'body_es',                                    // Phase 9C.5b1
  priority:   'priority',
  createdBy:  'created_by',
  status:     'status',
}

function coercePriority(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_PRIORITIES.has(value) ? value : null
}

// ── List + Get ────────────────────────────────────────────────────────────

/**
 * GET /api/operations-notes?courseId=...&date=YYYY-MM-DD
 *
 * date filter: optional. When supplied, returns only notes for that
 * note_date. Used by the Display Board to fetch "today's notices."
 * Status filter: hides archived notes by default; pass status=all to
 * include them.
 */
export async function listOperationsNotes(env, courseId = null, opts = {}) {
  const { where, binds } = buildCourseFilter(courseId)
  const sets  = where ? [where.replace('WHERE ', '')] : []
  const all   = [...binds]
  if (opts.date) {
    sets.push('note_date = ?')
    all.push(opts.date)
  }
  if (opts.status !== 'all') {
    sets.push("status = 'active'")
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM operations_daily_notes
     ${whereClause}
     ORDER BY pinned DESC, datetime(updated_at) DESC`,
  ).bind(...all).all()
  return json(results.map(rowToNote))
}

export async function getOperationsNote(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM operations_daily_notes WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Daily note not found')
  return json(rowToNote(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createOperationsNote(env, request) {
  const body = await readJson(request)
  if (!body.body || typeof body.body !== 'string' || body.body.trim() === '') {
    return badRequest('body is required')
  }

  const id        = body.id ?? generateId('note')
  const noteDate  = body.noteDate ?? new Date().toISOString().slice(0, 10)
  const priority  = coercePriority(body.priority) ?? 'routine'
  const pinned    = body.pinned ? 1 : 0
  const courseId  = resolveCourseId(body)

  await env.DB.prepare(`
    INSERT INTO operations_daily_notes (
      id, course_id, note_date, title, body, title_es, body_es,
      priority, pinned, created_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    noteDate,
    body.title       ?? null,
    body.body.trim(),
    body.titleEs     ?? null,                               // Phase 9C.5b1
    body.bodyEs      ?? null,                               // Phase 9C.5b1
    priority,
    pinned,
    body.createdBy   ?? null,
    body.status      ?? 'active',
  ).run()

  return getOperationsNote(env, id)
}

export async function updateOperationsNote(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'priority') {
      value = coercePriority(value)
      if (value === null) return badRequest(`Invalid priority "${body.priority}"`)
    }
    if (apiKey === 'body' && typeof value === 'string') {
      value = value.trim()
      if (value === '') return badRequest('body cannot be empty')
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  // Pinned is a boolean → 0/1
  if (Object.prototype.hasOwnProperty.call(body, 'pinned')) {
    sets.push('pinned = ?')
    binds.push(body.pinned ? 1 : 0)
  }

  // Phase 9C.5c3 — English-edit invalidation. When an author changes
  // English title/body without supplying matching Spanish in the same
  // PATCH, NULL the cached *_es so the next cron sweep re-translates.
  // A PATCH that includes titleEs / bodyEs is treated as manual
  // authoring and the CORE_COLUMNS loop above already wrote the value.
  if (Object.prototype.hasOwnProperty.call(body, 'title')
      && !Object.prototype.hasOwnProperty.call(body, 'titleEs')) {
    sets.push('title_es = NULL')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'body')
      && !Object.prototype.hasOwnProperty.call(body, 'bodyEs')) {
    sets.push('body_es = NULL')
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE operations_daily_notes SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Daily note not found')
  return getOperationsNote(env, id)
}

export async function deleteOperationsNote(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM operations_daily_notes WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Daily note not found')
  return json({ ok: true, id })
}
