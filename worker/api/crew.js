// Crew employees CRUD endpoints (Phase 5.6).
//
// Mutation auth gate (Phase 5.1b) applied centrally in worker/index.js.
//
// Field-name back-compat: the rowToEmployee mapper returns both the new
// canonical keys (id, name) AND the legacy aliases (employeeId, fullName)
// that the static EMPLOYEES array used. This lets the existing crew tabs
// and OperationsBoard swap data source without changing field reads —
// the per-consumer field-rename churn moves to a later phase, or never.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mapper ────────────────────────────────────────────────────────────────

function parseJsonArray(raw) {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function rowToEmployee(row) {
  if (!row) return null
  return {
    id:                row.id,
    employeeId:        row.id,                              // legacy alias
    name:              row.name,
    fullName:          row.name,                            // legacy alias
    role:              row.role,
    department:        row.department,
    status:            row.status,
    phone:             row.phone,
    email:             row.email,
    assignedArea:      row.assigned_area,
    skills:            parseJsonArray(row.skills_json),
    certifications:    parseJsonArray(row.certifications_json),
    notes:             row.notes,
    // Phase 4 — employee management fields. pay_rate is PRIVATE
    // management data; UI must not render it outside Employee Management.
    payRate:           row.pay_rate,
    hireDate:          row.hire_date,
    pesticideLicense:  row.pesticide_license,
    emergencyContact:  row.emergency_contact,
    courseId:          row.course_id,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

// Mutable column map. JSON-encoded array fields are handled separately
// in updateCrewEmployee so callers can pass real arrays instead of
// pre-stringified blobs.
const CORE_COLUMNS = {
  name:              'name',
  fullName:          'name',           // legacy alias accepted on write
  role:              'role',
  department:        'department',
  status:            'status',
  phone:             'phone',
  email:             'email',
  assignedArea:      'assigned_area',
  notes:             'notes',
  payRate:           'pay_rate',
  hireDate:          'hire_date',
  pesticideLicense:  'pesticide_license',
  emergencyContact:  'emergency_contact',
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listCrewEmployees(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM crew_employees ${where} ORDER BY name COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToEmployee))
}

export async function getCrewEmployee(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM crew_employees WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Crew employee not found')
  return json(rowToEmployee(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createCrewEmployee(env, request) {
  const body = await readJson(request)
  const name = body.name ?? body.fullName
  if (!name) return badRequest('name is required')

  const id = body.id ?? generateId('emp')

  await env.DB.prepare(`
    INSERT INTO crew_employees (
      id, name, role, department, status, phone, email,
      assigned_area, skills_json, certifications_json, notes,
      pay_rate, hire_date, pesticide_license, emergency_contact,
      course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    name,
    body.role             ?? null,
    body.department       ?? null,
    body.status           ?? 'active',
    body.phone            ?? null,
    body.email            ?? null,
    body.assignedArea     ?? null,
    body.skills         ? JSON.stringify(body.skills)         : null,
    body.certifications ? JSON.stringify(body.certifications) : null,
    body.notes            ?? null,
    body.payRate          ?? null,
    body.hireDate         ?? null,
    body.pesticideLicense ?? null,
    body.emergencyContact ?? null,
    resolveCourseId(body),
  ).run()

  return getCrewEmployee(env, id)
}

export async function updateCrewEmployee(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  // Array fields → JSON.
  if (Object.prototype.hasOwnProperty.call(body, 'skills')) {
    sets.push('skills_json = ?')
    binds.push(body.skills ? JSON.stringify(body.skills) : null)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'certifications')) {
    sets.push('certifications_json = ?')
    binds.push(body.certifications ? JSON.stringify(body.certifications) : null)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE crew_employees SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Crew employee not found')
  return getCrewEmployee(env, id)
}

export async function deleteCrewEmployee(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM crew_employees WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Crew employee not found')
  return json({ ok: true, id })
}
