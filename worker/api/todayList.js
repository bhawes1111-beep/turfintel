import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const VALID_STATUSES = new Set(['active', 'archived'])

function rowToItem(row) {
  return row ? {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    notes: row.notes ?? '',
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null
}

export async function listTodayItems(env, courseId, status = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const conditions = where ? [where.replace('WHERE ', '')] : []
  if (status && VALID_STATUSES.has(status)) {
    conditions.push('status = ?')
    binds.push(status)
  }
  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM today_list_items ${clause}
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
              datetime(COALESCE(completed_at, created_at)) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToItem))
}

export async function getTodayItem(env, id) {
  const row = await env.DB.prepare('SELECT * FROM today_list_items WHERE id = ?').bind(id).first()
  if (!row) return notFound('Today List item not found')
  return json(rowToItem(row))
}

export async function createTodayItem(env, request) {
  const body = await readJson(request)
  const title = String(body.title ?? '').trim()
  const notes = String(body.notes ?? '').trim()
  if (!title) return badRequest('title is required')
  const id = body.id || generateId('today')
  await env.DB.prepare(`INSERT INTO today_list_items
    (id, course_id, title, notes, status) VALUES (?, ?, ?, ?, 'active')`)
    .bind(id, resolveCourseId(body), title, notes || null).run()
  return getTodayItem(env, id)
}

export async function updateTodayItem(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = String(body.title ?? '').trim()
    if (!title) return badRequest('title is required')
    sets.push('title = ?'); binds.push(title)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    sets.push('notes = ?'); binds.push(String(body.notes ?? '').trim() || null)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status ?? '').trim()
    if (!VALID_STATUSES.has(status)) return badRequest('invalid status')
    sets.push('status = ?'); binds.push(status)
    sets.push(status === 'archived' ? "completed_at = datetime('now')" : 'completed_at = NULL')
  }
  if (!sets.length) return badRequest('No mutable fields supplied')
  sets.push("updated_at = datetime('now')")
  binds.push(id)
  const result = await env.DB.prepare(`UPDATE today_list_items SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Today List item not found')
  return getTodayItem(env, id)
}

export async function deleteTodayItem(env, id) {
  const attachments = await env.DB.prepare(
    "SELECT id, r2_key FROM operational_attachments WHERE parent_type = 'today_list_item' AND parent_id = ? AND status = 'active'",
  ).bind(id).all()
  const statements = [env.DB.prepare('DELETE FROM today_list_items WHERE id = ?').bind(id)]
  for (const attachment of attachments.results ?? []) {
    statements.push(env.DB.prepare("UPDATE operational_attachments SET status = 'deleted' WHERE id = ?").bind(attachment.id))
  }
  await env.DB.batch(statements)
  for (const attachment of attachments.results ?? []) {
    try { await env.PHOTOS?.delete(attachment.r2_key) } catch { /* best effort */ }
  }
  return json({ ok: true, id })
}
