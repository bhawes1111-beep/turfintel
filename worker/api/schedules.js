// Employee weekly schedules CRUD (Phase 13).
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.
//
// Idempotency: UNIQUE(course_id, employee_id, day_of_week) lets a POST
// dedupe — if a row already exists for that triple we return it
// instead of erroring. Use PATCH to change times / status.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_STATUS = new Set(['scheduled', 'off', 'vacation', 'sick'])

function rowToSchedule(row) {
  if (!row) return null
  return {
    id:           row.id,
    courseId:     row.course_id,
    employeeId:   row.employee_id,
    dayOfWeek:    row.day_of_week,
    startTime:    row.start_time,
    endTime:      row.end_time,
    role:         row.role,
    status:       row.status,
    isRecurring:  row.is_recurring === 1,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

const CORE_COLUMNS = {
  employeeId:  'employee_id',
  dayOfWeek:   'day_of_week',
  startTime:   'start_time',
  endTime:     'end_time',
  role:        'role',
  status:      'status',
}

function coerceStatus(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_STATUS.has(value) ? value : null
}

function coerceDay(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 6) return null
  return n
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listEmployeeSchedules(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM employee_schedules ${where} ORDER BY day_of_week ASC, employee_id ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToSchedule))
}

export async function getEmployeeSchedule(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM employee_schedules WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Schedule row not found')
  return json(rowToSchedule(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createEmployeeSchedule(env, request) {
  const body = await readJson(request)
  if (!body.employeeId) return badRequest('employeeId is required')
  const dow = coerceDay(body.dayOfWeek)
  if (dow === null) return badRequest('dayOfWeek must be an integer 0-6')
  const status = coerceStatus(body.status ?? 'scheduled')
  if (!status) return badRequest('Invalid status (must be scheduled | off | vacation | sick)')

  const courseId = resolveCourseId(body)

  // Idempotent: if (course, employee, day) already exists, return it.
  const existing = await env.DB.prepare(`
    SELECT * FROM employee_schedules
     WHERE course_id = ? AND employee_id = ? AND day_of_week = ?
     LIMIT 1
  `).bind(courseId, body.employeeId, dow).first()
  if (existing) return json(rowToSchedule(existing))

  const id = body.id ?? generateId('sch')

  await env.DB.prepare(`
    INSERT INTO employee_schedules (
      id, course_id, employee_id, day_of_week,
      start_time, end_time, role, status, is_recurring
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    body.employeeId,
    dow,
    body.startTime ?? null,
    body.endTime   ?? null,
    body.role      ?? null,
    status,
    body.isRecurring === false ? 0 : 1,
  ).run()

  return getEmployeeSchedule(env, id)
}

export async function updateEmployeeSchedule(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'status') {
      value = coerceStatus(value)
      if (!value) return badRequest('Invalid status')
    }
    if (apiKey === 'dayOfWeek') {
      value = coerceDay(value)
      if (value === null) return badRequest('dayOfWeek must be 0-6')
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE employee_schedules SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Schedule row not found')
  return getEmployeeSchedule(env, id)
}

export async function deleteEmployeeSchedule(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM employee_schedules WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Schedule row not found')
  return json({ ok: true, id })
}
