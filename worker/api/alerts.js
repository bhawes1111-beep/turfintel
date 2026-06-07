// Alerts CRUD endpoints (Phase 5.4b).
// Mutation auth gate (Phase 5.1b) applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mapper ────────────────────────────────────────────────────────────────
// Reassembles the pre-5.4b alert shape for the UI:
//   { id, title, message, module, priority, status, course, date,
//     actionLabel, actionTarget, metadata: { sourceId, createdAt, sourceModule } }

function rowToAlert(row) {
  if (!row) return null
  return {
    id:             row.id,
    sourceType:     row.source_type,
    sourceId:       row.source_id,
    module:         row.module,
    priority:       row.priority,
    status:         row.status,
    title:          row.title,
    message:        row.message,
    // Phase 9C.5b1 — manual Spanish translations for kiosk marquee.
    titleEs:        row.title_es,
    messageEs:      row.message_es,
    course:         row.course,
    actionLabel:    row.action_label,
    actionTarget:   row.action_target,
    date:           legacyDateString(row.created_at),
    metadata: {
      sourceId:     row.source_id,
      sourceModule: row.source_type ?? row.module,
      createdAt:    row.created_at,
    },
    courseId:       row.course_id,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    dismissedAt:    row.dismissed_at,
  }
}

// Format an ISO timestamp as "May 6" — preserves the pre-5.4b display
// convention used by Dashboard alert cards.
function legacyDateString(isoOrNull) {
  if (!isoOrNull) return null
  const d = new Date(isoOrNull)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CORE_COLUMNS = {
  sourceType:     'source_type',
  sourceId:       'source_id',
  module:         'module',
  priority:       'priority',
  status:         'status',
  title:          'title',
  message:        'message',
  titleEs:        'title_es',                               // Phase 9C.5b1
  messageEs:      'message_es',                             // Phase 9C.5b1
  course:         'course',
  actionLabel:    'action_label',
  actionTarget:   'action_target',
  acknowledgedAt: 'acknowledged_at',
  dismissedAt:    'dismissed_at',
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listAlerts(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM alerts ${where} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToAlert))
}

export async function getAlert(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM alerts WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Alert not found')
  return json(rowToAlert(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createAlert(env, request) {
  const body = await readJson(request)
  if (!body.title) return badRequest('title is required')

  // Accept legacy field names (sourceModule → sourceType, sourceId stays).
  const sourceType = body.sourceType ?? body.sourceModule ?? body.module ?? null

  const id = body.id ?? generateId('al')

  await env.DB.prepare(`
    INSERT INTO alerts (
      id, source_type, source_id, module, priority, status,
      title, message, title_es, message_es,
      course, action_label, action_target, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    sourceType,
    body.sourceId      ?? null,
    body.module        ?? null,
    body.priority      ?? 'medium',
    body.status        ?? 'new',
    body.title,
    body.message       ?? null,
    body.titleEs       ?? null,                             // Phase 9C.5b1
    body.messageEs     ?? null,                             // Phase 9C.5b1
    body.course        ?? null,
    body.actionLabel   ?? null,
    body.actionTarget  ?? null,
    resolveCourseId(body),
  ).run()

  return getAlert(env, id)
}

export async function updateAlert(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE alerts SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Alert not found')
  return getAlert(env, id)
}

export async function deleteAlert(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM alerts WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Alert not found')
  return json({ ok: true, id })
}
