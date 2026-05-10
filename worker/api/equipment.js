// Equipment CRUD endpoints (Phase 5.0).

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'

// ── Mappers (snake_case DB ↔ camelCase API) ──────────────────────────────

function rowToEquipment(row) {
  if (!row) return null
  return {
    id:                 row.id,
    name:               row.name,
    category:           row.category,
    status:             row.status,
    hours:              row.hours,
    nextServiceHours:   row.next_service_hours,
    manufacturer:       row.manufacturer,
    model:              row.model,
    year:               row.year,
    serialNumber:       row.serial_number,
    fuelType:           row.fuel_type,
    assignedOperator:   row.assigned_operator,
    lastService:        row.last_service,
    lastServiceHours:   row.last_service_hours,
    serviceInterval:    row.service_interval,
    notes:              row.notes,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

// Allowed mutable columns. Keys are the API field names; values are the DB column names.
const MUTABLE_COLUMNS = {
  name:             'name',
  category:         'category',
  status:           'status',
  hours:            'hours',
  nextServiceHours: 'next_service_hours',
  manufacturer:     'manufacturer',
  model:            'model',
  year:             'year',
  serialNumber:     'serial_number',
  fuelType:         'fuel_type',
  assignedOperator: 'assigned_operator',
  lastService:      'last_service',
  lastServiceHours: 'last_service_hours',
  serviceInterval:  'service_interval',
  notes:            'notes',
}

// ── Handlers ──────────────────────────────────────────────────────────────

export async function listEquipment(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM equipment ORDER BY name ASC',
  ).all()
  return json(results.map(rowToEquipment))
}

export async function getEquipment(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM equipment WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Equipment not found')
  return json(rowToEquipment(row))
}

export async function createEquipment(env, request) {
  const body = await readJson(request)
  if (!body.name)     return badRequest('name is required')
  if (!body.category) return badRequest('category is required')

  const id = body.id ?? generateId('eq')

  await env.DB.prepare(`
    INSERT INTO equipment (
      id, name, category, status, hours, next_service_hours,
      manufacturer, model, year, serial_number, fuel_type,
      assigned_operator, last_service, last_service_hours, service_interval, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.category,
    body.status            ?? 'operational',
    body.hours             ?? 0,
    body.nextServiceHours  ?? null,
    body.manufacturer      ?? null,
    body.model             ?? null,
    body.year              ?? null,
    body.serialNumber      ?? null,
    body.fuelType          ?? null,
    body.assignedOperator  ?? null,
    body.lastService       ?? null,
    body.lastServiceHours  ?? null,
    body.serviceInterval   ?? null,
    body.notes             ?? null,
  ).run()

  return getEquipment(env, id)
}

export async function updateEquipment(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(MUTABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE equipment SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Equipment not found')
  return getEquipment(env, id)
}

export async function deleteEquipment(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM equipment WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Equipment not found')
  return json({ ok: true, id })
}
