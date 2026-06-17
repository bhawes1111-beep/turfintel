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

// ── Phase E.2 — Per-date schedule overrides ───────────────────────────────
//
// employee_schedule_overrides is a peer table to employee_schedules. The
// recurring weekly grid lives in employee_schedules; one-date "off this
// Wednesday only" / "called out today" rows live here. The UNIQUE index
// on (course_id, employee_id, effective_date) makes a POST that targets
// an existing triple idempotent — same dedupe pattern as the recurring
// table — so the client can fire-and-forget when the user edits a row.
//
// Lifecycle:
//   • An override row ALWAYS wins over the recurring row for that date.
//   • DELETE returns the employee to recurring behavior — the recurring
//     weekly grid is untouched.

function rowToOverride(row) {
  if (!row) return null
  return {
    id:            row.id,
    courseId:      row.course_id,
    employeeId:    row.employee_id,
    effectiveDate: row.effective_date,
    startTime:     row.start_time,
    endTime:       row.end_time,
    role:          row.role,
    status:        row.status,
    notes:         row.notes,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  }
}

const OVERRIDE_CORE_COLUMNS = {
  employeeId:    'employee_id',
  effectiveDate: 'effective_date',
  startTime:     'start_time',
  endTime:       'end_time',
  role:          'role',
  status:        'status',
  notes:         'notes',
}

function coerceDate(value) {
  // Cheap ISO-date sanity check: YYYY-MM-DD. The worker should never
  // store free-text dates in this column.
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export async function listEmployeeScheduleOverrides(env, courseId = null, opts = {}) {
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  // Optional date filter — the daily endpoint passes ?date=YYYY-MM-DD
  // to keep the wire payload small on busy courses.
  if (opts.date) {
    sets.push('effective_date = ?')
    all.push(opts.date)
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM employee_schedule_overrides
     ${whereClause}
     ORDER BY effective_date ASC, employee_id ASC`,
  ).bind(...all).all()
  return json(results.map(rowToOverride))
}

export async function getEmployeeScheduleOverride(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM employee_schedule_overrides WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Schedule override not found')
  return json(rowToOverride(row))
}

export async function createEmployeeScheduleOverride(env, request) {
  const body = await readJson(request)
  if (!body.employeeId) return badRequest('employeeId is required')
  const effectiveDate = coerceDate(body.effectiveDate)
  if (!effectiveDate) return badRequest('effectiveDate must be a YYYY-MM-DD string')
  const status = coerceStatus(body.status ?? 'scheduled')
  if (!status) return badRequest('Invalid status (must be scheduled | off | vacation | sick)')

  const courseId = resolveCourseId(body)

  // Idempotent: if (course, employee, date) already exists, return it
  // unchanged. Client uses PATCH to mutate. Mirrors the recurring path.
  const existing = await env.DB.prepare(`
    SELECT * FROM employee_schedule_overrides
     WHERE course_id = ? AND employee_id = ? AND effective_date = ?
     LIMIT 1
  `).bind(courseId, body.employeeId, effectiveDate).first()
  if (existing) return json(rowToOverride(existing))

  const id = body.id ?? generateId('schov')

  await env.DB.prepare(`
    INSERT INTO employee_schedule_overrides (
      id, course_id, employee_id, effective_date,
      start_time, end_time, role, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    body.employeeId,
    effectiveDate,
    body.startTime ?? null,
    body.endTime   ?? null,
    body.role      ?? null,
    status,
    body.notes     ?? null,
  ).run()

  return getEmployeeScheduleOverride(env, id)
}

export async function updateEmployeeScheduleOverride(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(OVERRIDE_CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'status') {
      value = coerceStatus(value)
      if (!value) return badRequest('Invalid status')
    }
    if (apiKey === 'effectiveDate') {
      value = coerceDate(value)
      if (!value) return badRequest('effectiveDate must be YYYY-MM-DD')
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE employee_schedule_overrides SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Schedule override not found')
  return getEmployeeScheduleOverride(env, id)
}

export async function deleteEmployeeScheduleOverride(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM employee_schedule_overrides WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Schedule override not found')
  return json({ ok: true, id })
}

// ── Phase E.2 — Daily schedule merge ──────────────────────────────────────
//
// GET /api/employee-schedules/daily?courseId=...&date=YYYY-MM-DD
//
// Returns one row per ACTIVE crew employee for the requested date. The
// merge is:
//   1. Compute day_of_week from the date.
//   2. Load active employees for the course (status active | on-leave).
//   3. Load recurring employee_schedules for that day_of_week.
//   4. Load employee_schedule_overrides for that exact effective_date.
//   5. For each employee:
//        • If an override exists → use it (source: 'override').
//        • Else if a recurring row exists → use it (source: 'recurring').
//        • Else → status='scheduled' with NULL times (source: 'none').
//   6. Return the merged shape so the Today's Schedule UI doesn't have
//      to re-join client-side.

export async function listEmployeesDailySchedule(env, courseId = null, date = null) {
  const dateIso = coerceDate(date)
  if (!dateIso) return badRequest('date query param must be a YYYY-MM-DD string')
  const dow = new Date(`${dateIso}T00:00:00`).getDay()

  const courseFilter = buildCourseFilter(courseId)

  // Active employees only. Inactive crew never appear on a daily roster.
  const { results: employees } = await env.DB.prepare(
    `SELECT id, name, role, status
       FROM crew_employees
       ${courseFilter.where}${courseFilter.where ? ' AND' : 'WHERE'} status != 'inactive'
       ORDER BY name ASC`,
  ).bind(...courseFilter.binds).all()

  // Recurring rows for this DOW.
  const recurringFilter = buildCourseFilter(courseId)
  const { results: recurringRows } = await env.DB.prepare(
    `SELECT * FROM employee_schedules
       ${recurringFilter.where}${recurringFilter.where ? ' AND' : 'WHERE'} day_of_week = ?`,
  ).bind(...recurringFilter.binds, dow).all()
  const recurringByEmp = new Map()
  for (const r of recurringRows) recurringByEmp.set(r.employee_id, r)

  // Overrides for this exact date.
  const overrideFilter = buildCourseFilter(courseId)
  const { results: overrideRows } = await env.DB.prepare(
    `SELECT * FROM employee_schedule_overrides
       ${overrideFilter.where}${overrideFilter.where ? ' AND' : 'WHERE'} effective_date = ?`,
  ).bind(...overrideFilter.binds, dateIso).all()
  const overrideByEmp = new Map()
  for (const r of overrideRows) overrideByEmp.set(r.employee_id, r)

  const merged = employees.map(emp => {
    const ov  = overrideByEmp.get(emp.id)
    const rec = recurringByEmp.get(emp.id)
    if (ov) {
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        role:         ov.role ?? rec?.role ?? emp.role ?? null,
        status:       ov.status,
        startTime:    ov.start_time,
        endTime:      ov.end_time,
        notes:        ov.notes,
        source:       'override',
        overrideId:   ov.id,
        recurringId:  rec?.id ?? null,
      }
    }
    if (rec) {
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        role:         rec.role ?? emp.role ?? null,
        status:       rec.status,
        startTime:    rec.start_time,
        endTime:      rec.end_time,
        notes:        null,
        source:       'recurring',
        overrideId:   null,
        recurringId:  rec.id,
      }
    }
    return {
      employeeId:   emp.id,
      employeeName: emp.name,
      role:         emp.role ?? null,
      status:       'scheduled',
      startTime:    null,
      endTime:      null,
      notes:        null,
      source:       'none',
      overrideId:   null,
      recurringId:  null,
    }
  })

  return json({
    date:      dateIso,
    dayOfWeek: dow,
    rows:      merged,
  })
}
