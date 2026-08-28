import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const VALID_STATUSES = new Set(['done', 'not-done', 'in-progress'])

function normalizeYear(value) {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null
}

function rowToGoal(row) {
  return row ? {
    id: row.id,
    year: row.goal_year,
    note: row.note,
    notes: row.notes ?? '',
    carriedFromGoalId: row.carried_from_goal_id ?? null,
    status: row.status,
    courseId: row.course_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null
}

async function carryForwardNotDoneGoal(env, goal) {
  if (!goal || goal.status !== 'not-done') return
  const nextYear = normalizeYear(goal.year + 1)
  if (!nextYear) return
  const existing = await env.DB.prepare(
    'SELECT id FROM yearly_goals WHERE carried_from_goal_id = ? LIMIT 1',
  ).bind(goal.id).first()
  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE yearly_goals
      SET goal_year = ?, note = ?, notes = ?, course_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextYear, goal.note, goal.notes || null, goal.courseId ?? null, existing.id).run()
    return
  }
  await env.DB.prepare(`
    INSERT INTO yearly_goals
      (id, goal_year, note, notes, status, course_id, carried_from_goal_id)
    VALUES (?, ?, ?, ?, 'in-progress', ?, ?)
  `).bind(
    generateId('yeargoal'), nextYear, goal.note, goal.notes || null,
    goal.courseId ?? null, goal.id,
  ).run()
}

export async function listYearlyGoals(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM yearly_goals ${where} ORDER BY goal_year DESC, created_at DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToGoal))
}

export async function getYearlyGoal(env, id) {
  const row = await env.DB.prepare('SELECT * FROM yearly_goals WHERE id = ?').bind(id).first()
  if (!row) return notFound('Yearly goal not found')
  return json(rowToGoal(row))
}

export async function createYearlyGoal(env, request) {
  const body = await readJson(request)
  const year = normalizeYear(body.year)
  const note = String(body.note ?? '').trim()
  const notes = String(body.notes ?? '').trim()
  const status = String(body.status ?? 'in-progress').trim()
  if (!year) return badRequest('valid year is required')
  if (!note) return badRequest('note is required')
  if (!VALID_STATUSES.has(status)) return badRequest('invalid status')
  const id = body.id ?? generateId('yeargoal')
  await env.DB.prepare(`
    INSERT INTO yearly_goals (id, goal_year, note, notes, status, course_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, year, note, notes || null, status, resolveCourseId(body)).run()
  const response = await getYearlyGoal(env, id)
  await carryForwardNotDoneGoal(env, await response.clone().json())
  return response
}

export async function updateYearlyGoal(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  if (Object.prototype.hasOwnProperty.call(body, 'year')) {
    const year = normalizeYear(body.year)
    if (!year) return badRequest('valid year is required')
    sets.push('goal_year = ?'); binds.push(year)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'note')) {
    const note = String(body.note ?? '').trim()
    if (!note) return badRequest('note is required')
    sets.push('note = ?'); binds.push(note)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    sets.push('notes = ?'); binds.push(String(body.notes ?? '').trim() || null)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status ?? '').trim()
    if (!VALID_STATUSES.has(status)) return badRequest('invalid status')
    sets.push('status = ?'); binds.push(status)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`); binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE yearly_goals SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Yearly goal not found')
  const response = await getYearlyGoal(env, id)
  await carryForwardNotDoneGoal(env, await response.clone().json())
  return response
}

export async function deleteYearlyGoal(env, id) {
  const result = await env.DB.prepare('DELETE FROM yearly_goals WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Yearly goal not found')
  return json({ ok: true, id })
}

function rowToOption(row) {
  return row ? { id: row.id, label: row.label, courseId: row.course_id, createdAt: row.created_at } : null
}

export async function listYearlyGoalOptions(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM yearly_goal_options ${where} ORDER BY label COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToOption))
}

export async function createYearlyGoalOption(env, request) {
  const body = await readJson(request)
  const label = String(body.label ?? '').trim()
  if (!label) return badRequest('label is required')
  const courseId = resolveCourseId(body)
  const existing = await env.DB.prepare(`
    SELECT * FROM yearly_goal_options
    WHERE lower(label) = lower(?) AND (course_id = ? OR (course_id IS NULL AND ? IS NULL))
    LIMIT 1
  `).bind(label, courseId, courseId).first()
  if (existing) return json(rowToOption(existing))
  const id = body.id ?? generateId('yeargoalopt')
  await env.DB.prepare(
    'INSERT INTO yearly_goal_options (id, label, course_id) VALUES (?, ?, ?)',
  ).bind(id, label, courseId).run()
  return json(rowToOption(await env.DB.prepare(
    'SELECT * FROM yearly_goal_options WHERE id = ?',
  ).bind(id).first()))
}

export async function deleteYearlyGoalOption(env, id) {
  const result = await env.DB.prepare('DELETE FROM yearly_goal_options WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Yearly goal option not found')
  return json({ ok: true, id })
}
