import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const VALID_STATUSES = new Set(['done', 'not-done', 'in-progress'])

function mondayDate(value) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date.toISOString().slice(0, 10)
}

function nextMondayDate(value) {
  const monday = mondayDate(value)
  if (!monday) return ''
  const date = new Date(`${monday}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 7)
  return date.toISOString().slice(0, 10)
}

function rowToGoal(row) {
  if (!row) return null
  return {
    id:        row.id,
    date:      row.goal_date,
    note:      row.note,
    notes:     row.notes ?? '',
    carriedFromGoalId: row.carried_from_goal_id ?? null,
    status:    row.status,
    courseId:  row.course_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function carryForwardUnfinishedGoal(env, goal) {
  if (!goal || !['not-done', 'in-progress'].includes(goal.status)) return
  const nextDate = nextMondayDate(goal.date)
  if (!nextDate) return

  const existing = await env.DB.prepare(
    'SELECT id FROM weekly_goals WHERE carried_from_goal_id = ? LIMIT 1',
  ).bind(goal.id).first()

  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE weekly_goals
      SET goal_date = ?, note = ?, notes = ?, course_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextDate, goal.note, goal.notes || null, goal.courseId ?? null, existing.id).run()
    return
  }

  await env.DB.prepare(`
    INSERT INTO weekly_goals
      (id, goal_date, note, notes, status, course_id, carried_from_goal_id)
    VALUES (?, ?, ?, ?, 'in-progress', ?, ?)
  `).bind(
    generateId('goal'),
    nextDate,
    goal.note,
    goal.notes || null,
    goal.courseId ?? null,
    goal.id,
  ).run()
}

export async function listWeeklyGoals(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM weekly_goals ${where}
      ORDER BY goal_date DESC, created_at DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToGoal))
}

export async function getWeeklyGoal(env, id) {
  const row = await env.DB.prepare('SELECT * FROM weekly_goals WHERE id = ?').bind(id).first()
  if (!row) return notFound('Weekly goal not found')
  return json(rowToGoal(row))
}

export async function createWeeklyGoal(env, request) {
  const body = await readJson(request)
  const date = mondayDate(String(body.date ?? '').trim())
  const note = String(body.note ?? '').trim()
  const notes = String(body.notes ?? '').trim()
  const status = String(body.status ?? 'in-progress').trim()
  if (!date) return badRequest('date is required')
  if (!note) return badRequest('note is required')
  if (!VALID_STATUSES.has(status)) return badRequest('invalid status')

  const id = body.id ?? generateId('goal')
  await env.DB.prepare(`
    INSERT INTO weekly_goals (id, goal_date, note, notes, status, course_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, date, note, notes || null, status, resolveCourseId(body)).run()
  const response = await getWeeklyGoal(env, id)
  const saved = await response.clone().json()
  await carryForwardUnfinishedGoal(env, saved)
  return response
}

export async function updateWeeklyGoal(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  if (Object.prototype.hasOwnProperty.call(body, 'date')) {
    const date = mondayDate(String(body.date ?? '').trim())
    if (!date) return badRequest('date is required')
    sets.push('goal_date = ?')
    binds.push(date)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'note')) {
    const note = String(body.note ?? '').trim()
    if (!note) return badRequest('note is required')
    sets.push('note = ?')
    binds.push(note)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    sets.push('notes = ?')
    binds.push(String(body.notes ?? '').trim() || null)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status ?? '').trim()
    if (!VALID_STATUSES.has(status)) return badRequest('invalid status')
    sets.push('status = ?')
    binds.push(status)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE weekly_goals SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Weekly goal not found')
  const response = await getWeeklyGoal(env, id)
  const saved = await response.clone().json()
  await carryForwardUnfinishedGoal(env, saved)
  return response
}

export async function deleteWeeklyGoal(env, id) {
  const result = await env.DB.prepare('DELETE FROM weekly_goals WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Weekly goal not found')
  return json({ ok: true, id })
}

function rowToGoalOption(row) {
  return row ? {
    id: row.id,
    label: row.label,
    courseId: row.course_id,
    createdAt: row.created_at,
  } : null
}

export async function listWeeklyGoalOptions(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM weekly_goal_options ${where} ORDER BY label COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToGoalOption))
}

export async function createWeeklyGoalOption(env, request) {
  const body = await readJson(request)
  const label = String(body.label ?? '').trim()
  if (!label) return badRequest('label is required')
  const courseId = resolveCourseId(body)
  const existing = await env.DB.prepare(`
    SELECT * FROM weekly_goal_options
    WHERE lower(label) = lower(?)
      AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))
    LIMIT 1
  `).bind(label, courseId, courseId).first()
  if (existing) return json(rowToGoalOption(existing))

  const id = body.id ?? generateId('goalopt')
  await env.DB.prepare(`
    INSERT INTO weekly_goal_options (id, label, course_id) VALUES (?, ?, ?)
  `).bind(id, label, courseId).run()
  const saved = await env.DB.prepare('SELECT * FROM weekly_goal_options WHERE id = ?').bind(id).first()
  return json(rowToGoalOption(saved))
}

export async function deleteWeeklyGoalOption(env, id) {
  const result = await env.DB.prepare('DELETE FROM weekly_goal_options WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Weekly goal option not found')
  return json({ ok: true, id })
}
