// Employee training CRUD endpoints.
//
// Training records are course-scoped and linked to crew_employees. They are
// intentionally separate from employee.certifications so managers can track
// classes, orientations, safety training, refreshers, and renewal dates.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { resolveCourseId } from '../lib/scope.js'

const STATUS_VALUES = new Set(['planned', 'in-progress', 'complete', 'expired', 'waived'])

function text(value) {
  return value == null ? '' : String(value)
}

function clean(value) {
  const trimmed = text(value).trim()
  return trimmed || null
}

function normalizeStatus(value) {
  const status = clean(value) ?? 'planned'
  return STATUS_VALUES.has(status) ? status : 'planned'
}

function rowToTraining(row) {
  if (!row) return null
  return {
    id:            row.id,
    courseId:      row.course_id,
    employeeId:    row.employee_id,
    employeeName:  row.employee_name ?? null,
    employeeRole:  row.employee_role ?? null,
    trainingName:  row.training_name,
    category:      row.category,
    status:        row.status,
    completedDate: row.completed_date,
    dueDate:       row.due_date,
    expiresDate:   row.expires_date,
    trainer:       row.trainer,
    notes:         row.notes,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  }
}

async function getTrainingRow(env, id) {
  return env.DB.prepare(
    `SELECT tr.*, ce.name AS employee_name, ce.role AS employee_role
       FROM employee_training_records tr
       LEFT JOIN crew_employees ce ON ce.id = tr.employee_id
      WHERE tr.id = ?`,
  ).bind(id).first()
}

export async function listEmployeeTraining(env, courseId = null, opts = {}) {
  const sets = []
  const binds = []
  if (courseId) {
    sets.push('tr.course_id = ?')
    binds.push(courseId)
  }
  if (opts.employeeId) {
    sets.push('tr.employee_id = ?')
    binds.push(opts.employeeId)
  }
  if (opts.status) {
    sets.push('tr.status = ?')
    binds.push(opts.status)
  }

  const where = sets.length ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT tr.*, ce.name AS employee_name, ce.role AS employee_role
       FROM employee_training_records tr
       LEFT JOIN crew_employees ce ON ce.id = tr.employee_id
      ${where}
      ORDER BY
        CASE
          WHEN tr.due_date IS NULL OR tr.due_date = '' THEN 1
          ELSE 0
        END,
        tr.due_date ASC,
        tr.training_name COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToTraining))
}

export async function getEmployeeTraining(env, id) {
  const row = await getTrainingRow(env, id)
  if (!row) return notFound('Training record not found')
  return json(rowToTraining(row))
}

export async function createEmployeeTraining(env, request) {
  const body = await readJson(request)
  const employeeId = clean(body.employeeId)
  const trainingName = clean(body.trainingName)
  if (!employeeId) return badRequest('employeeId is required')
  if (!trainingName) return badRequest('trainingName is required')

  const id = body.id ?? generateId('trn')
  await env.DB.prepare(
    `INSERT INTO employee_training_records (
       id, course_id, employee_id, training_name, category, status,
       completed_date, due_date, expires_date, trainer, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    resolveCourseId(body),
    employeeId,
    trainingName,
    clean(body.category),
    normalizeStatus(body.status),
    clean(body.completedDate),
    clean(body.dueDate),
    clean(body.expiresDate),
    clean(body.trainer),
    clean(body.notes),
  ).run()

  return getEmployeeTraining(env, id)
}

const MUTABLE_COLUMNS = {
  employeeId:    'employee_id',
  trainingName:  'training_name',
  category:      'category',
  status:        'status',
  completedDate: 'completed_date',
  dueDate:       'due_date',
  expiresDate:   'expires_date',
  trainer:       'trainer',
  notes:         'notes',
}

export async function updateEmployeeTraining(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(MUTABLE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    if (apiKey === 'trainingName' && !clean(body[apiKey])) return badRequest('trainingName is required')
    if (apiKey === 'employeeId' && !clean(body[apiKey])) return badRequest('employeeId is required')
    sets.push(`${dbCol} = ?`)
    binds.push(apiKey === 'status' ? normalizeStatus(body[apiKey]) : clean(body[apiKey]))
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE employee_training_records SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Training record not found')
  return getEmployeeTraining(env, id)
}

export async function deleteEmployeeTraining(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM employee_training_records WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Training record not found')
  return json({ ok: true, id })
}
