// Maintenance log CRUD endpoints (Phase 5.0).

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { resolveCourseId } from '../lib/scope.js'

function rowToLog(row) {
  if (!row) return null
  let partsUsed = []
  if (row.parts_used) {
    try { partsUsed = JSON.parse(row.parts_used) }
    catch { partsUsed = [] }
  }
  return {
    id:               row.id,
    equipmentId:      row.equipment_id,
    equipmentName:    row.equipment_name ?? null, // join field, if present
    category:         row.category ?? null,       // join field, if present
    serviceType:      row.service_type,
    status:           row.status,
    priority:         row.priority,
    date:             row.date,
    completedDate:    row.completed_date,
    hoursAtService:   row.hours_at_service,
    nextDueHours:     row.next_due_hours,
    cost:             row.cost,
    technician:       row.technician,
    notes:            row.notes,
    partsUsed,
    courseId:         row.course_id,
    createdAt:        row.created_at,
  }
}

const MUTABLE_COLUMNS = {
  serviceType:     'service_type',
  status:          'status',
  priority:        'priority',
  date:            'date',
  completedDate:   'completed_date',
  hoursAtService:  'hours_at_service',
  nextDueHours:    'next_due_hours',
  cost:            'cost',
  technician:      'technician',
  notes:           'notes',
  partsUsed:       'parts_used', // value is serialized as JSON below
}

const SELECT_WITH_JOIN = `
  SELECT
    ml.*,
    e.name     AS equipment_name,
    e.category AS category
  FROM maintenance_logs ml
  LEFT JOIN equipment e ON e.id = ml.equipment_id
`

export async function listMaintenance(env, courseId = null) {
  const where = courseId ? 'WHERE ml.course_id = ?' : ''
  const binds = courseId ? [courseId] : []
  const { results } = await env.DB.prepare(
    `${SELECT_WITH_JOIN} ${where} ORDER BY datetime(ml.date) DESC, ml.created_at DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToLog))
}

export async function getMaintenance(env, id) {
  const row = await env.DB.prepare(
    `${SELECT_WITH_JOIN} WHERE ml.id = ?`,
  ).bind(id).first()
  if (!row) return notFound('Maintenance log not found')
  return json(rowToLog(row))
}

export async function createMaintenance(env, request) {
  const body = await readJson(request)
  if (!body.equipmentId) return badRequest('equipmentId is required')
  if (!body.serviceType) return badRequest('serviceType is required')

  const id = body.id ?? generateId('ml')

  await env.DB.prepare(`
    INSERT INTO maintenance_logs (
      id, equipment_id, service_type, status, priority, date,
      completed_date, hours_at_service, next_due_hours, cost,
      technician, notes, parts_used, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.equipmentId,
    body.serviceType,
    body.status         ?? 'open',
    body.priority       ?? 'routine',
    body.date           ?? null,
    body.completedDate  ?? null,
    body.hoursAtService ?? null,
    body.nextDueHours   ?? null,
    body.cost           ?? 0,
    body.technician     ?? null,
    body.notes          ?? null,
    body.partsUsed != null ? JSON.stringify(body.partsUsed) : null,
    resolveCourseId(body),
  ).run()

  return getMaintenance(env, id)
}

export async function updateMaintenance(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(MUTABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      let value = body[apiKey]
      if (apiKey === 'partsUsed' && value != null) value = JSON.stringify(value)
      binds.push(value)
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE maintenance_logs SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Maintenance log not found')
  return getMaintenance(env, id)
}
