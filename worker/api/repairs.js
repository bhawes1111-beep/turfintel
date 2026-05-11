// Repairs CRUD endpoints (Phase 5.1c).
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

function rowToRepair(row) {
  if (!row) return null
  let partsUsed = []
  if (row.parts_used) {
    try { partsUsed = JSON.parse(row.parts_used) }
    catch { partsUsed = [] }
  }
  return {
    // Legacy field name kept for UI compatibility — Repairs.jsx already
    // uses `repairId` everywhere.
    repairId:     row.id,
    id:           row.id,
    issueType:    row.issue_type,
    area:         row.area,
    hole:         row.hole,
    headNumber:   row.head_number,
    description:  row.description,
    priority:     row.priority,
    status:       row.status,
    assignedTo:   row.assigned_to,
    laborHours:   row.labor_hours,
    partsUsed,
    dateReported: row.date_reported,
    dateCompleted: row.completed_at,
    notes:        row.notes,
    courseId:     row.course_id,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

const MUTABLE_COLUMNS = {
  issueType:     'issue_type',
  area:          'area',
  hole:          'hole',
  headNumber:    'head_number',
  description:   'description',
  priority:      'priority',
  status:        'status',
  assignedTo:    'assigned_to',
  laborHours:    'labor_hours',
  partsUsed:     'parts_used',     // value serialized as JSON below
  dateReported:  'date_reported',
  dateCompleted: 'completed_at',
  notes:         'notes',
}

export async function listRepairs(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM repairs ${where}
     ORDER BY datetime(date_reported) DESC, created_at DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToRepair))
}

export async function getRepair(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM repairs WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Repair not found')
  return json(rowToRepair(row))
}

export async function createRepair(env, request) {
  const body = await readJson(request)
  if (!body.issueType) return badRequest('issueType is required')
  if (!body.area)      return badRequest('area is required')

  const id = body.id ?? body.repairId ?? generateId('rep')

  await env.DB.prepare(`
    INSERT INTO repairs (
      id, issue_type, area, hole, head_number, description,
      priority, status, assigned_to, labor_hours, parts_used,
      date_reported, completed_at, notes, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.issueType,
    body.area,
    body.hole ?? null,
    body.headNumber ?? null,
    body.description ?? null,
    body.priority ?? 'medium',
    body.status ?? 'open',
    body.assignedTo ?? null,
    body.laborHours ?? 0,
    body.partsUsed != null ? JSON.stringify(body.partsUsed) : null,
    body.dateReported ?? null,
    body.dateCompleted ?? null,
    body.notes ?? null,
    resolveCourseId(body),
  ).run()

  return getRepair(env, id)
}

export async function updateRepair(env, id, request) {
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

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE repairs SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Repair not found')
  return getRepair(env, id)
}

export async function deleteRepair(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM repairs WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Repair not found')
  return json({ ok: true, id })
}
