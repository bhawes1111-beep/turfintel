// Crew Assignments + Equipment Reservations CRUD (Phase 5.4c).
//
// Two tables, one module. Both link back to calendar_events.id via
// calendar_event_id (soft FK) so each handoff survives reload alongside
// its event.
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.
//
// Idempotency: each table has a UNIQUE composite index on
// (calendar_event_id, employee_name) and (calendar_event_id,
// equipment_name) respectively. A duplicate POST returns the existing row
// with 200 instead of erroring, mirroring calendar_events Phase 5.4a
// behavior so fire-and-forget callers (MaintenanceLogs → reservation)
// stay idempotent across retries.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mappers ───────────────────────────────────────────────────────────────

function rowToCrewAssignment(row) {
  if (!row) return null
  return {
    id:              row.id,
    calendarEventId: row.calendar_event_id,
    employeeId:      row.employee_id,
    employeeName:    row.employee_name,
    role:            row.role,
    status:          row.status,
    notes:           row.notes,
    assignedAt:      row.assigned_at,
    courseId:        row.course_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

function rowToEquipmentReservation(row) {
  if (!row) return null
  return {
    id:              row.id,
    calendarEventId: row.calendar_event_id,
    equipmentId:     row.equipment_id,
    equipmentName:   row.equipment_name,
    status:          row.status,
    notes:           row.notes,
    reservedAt:      row.reserved_at,
    courseId:        row.course_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

const CREW_CORE_COLUMNS = {
  calendarEventId: 'calendar_event_id',
  employeeId:      'employee_id',
  employeeName:    'employee_name',
  role:            'role',
  status:          'status',
  notes:           'notes',
  assignedAt:      'assigned_at',
}

const RES_CORE_COLUMNS = {
  calendarEventId: 'calendar_event_id',
  equipmentId:     'equipment_id',
  equipmentName:   'equipment_name',
  status:          'status',
  notes:           'notes',
  reservedAt:      'reserved_at',
}

// ── Crew Assignments ──────────────────────────────────────────────────────

export async function listCrewAssignments(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM crew_assignments ${where} ORDER BY datetime(assigned_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToCrewAssignment))
}

export async function getCrewAssignment(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM crew_assignments WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Crew assignment not found')
  return json(rowToCrewAssignment(row))
}

export async function createCrewAssignment(env, request) {
  const body = await readJson(request)
  if (!body.employeeName) return badRequest('employeeName is required')

  const calendarEventId = body.calendarEventId ?? null

  // Dedupe — (calendar_event_id, employee_name) is UNIQUE. Return the
  // existing row instead of 409 so fire-and-forget callers stay idempotent.
  if (calendarEventId) {
    const existing = await env.DB.prepare(
      `SELECT * FROM crew_assignments
       WHERE calendar_event_id = ? AND employee_name = ?
       LIMIT 1`,
    ).bind(calendarEventId, body.employeeName).first()
    if (existing) return json(rowToCrewAssignment(existing))
  }

  const id = body.id ?? generateId('ca')

  await env.DB.prepare(`
    INSERT INTO crew_assignments (
      id, calendar_event_id, employee_id, employee_name, role, status, notes, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    calendarEventId,
    body.employeeId   ?? null,
    body.employeeName,
    body.role   ?? null,
    body.status ?? 'assigned',
    body.notes  ?? null,
    resolveCourseId(body),
  ).run()

  return getCrewAssignment(env, id)
}

export async function updateCrewAssignment(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CREW_CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE crew_assignments SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Crew assignment not found')
  return getCrewAssignment(env, id)
}

export async function deleteCrewAssignment(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM crew_assignments WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Crew assignment not found')
  return json({ ok: true, id })
}

// ── Equipment Reservations ────────────────────────────────────────────────

export async function listEquipmentReservations(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM equipment_reservations ${where} ORDER BY datetime(reserved_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToEquipmentReservation))
}

export async function getEquipmentReservation(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM equipment_reservations WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Equipment reservation not found')
  return json(rowToEquipmentReservation(row))
}

export async function createEquipmentReservation(env, request) {
  const body = await readJson(request)
  if (!body.equipmentName) return badRequest('equipmentName is required')

  const calendarEventId = body.calendarEventId ?? null

  // Dedupe — (calendar_event_id, equipment_name) is UNIQUE.
  if (calendarEventId) {
    const existing = await env.DB.prepare(
      `SELECT * FROM equipment_reservations
       WHERE calendar_event_id = ? AND equipment_name = ?
       LIMIT 1`,
    ).bind(calendarEventId, body.equipmentName).first()
    if (existing) return json(rowToEquipmentReservation(existing))
  }

  const id = body.id ?? generateId('er')

  await env.DB.prepare(`
    INSERT INTO equipment_reservations (
      id, calendar_event_id, equipment_id, equipment_name, status, notes, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    calendarEventId,
    body.equipmentId ?? null,
    body.equipmentName,
    body.status      ?? 'reserved',
    body.notes       ?? null,
    resolveCourseId(body),
  ).run()

  return getEquipmentReservation(env, id)
}

export async function updateEquipmentReservation(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(RES_CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE equipment_reservations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Equipment reservation not found')
  return getEquipmentReservation(env, id)
}

export async function deleteEquipmentReservation(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM equipment_reservations WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Equipment reservation not found')
  return json({ ok: true, id })
}
