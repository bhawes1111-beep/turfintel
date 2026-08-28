import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const VALID_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'resolved'])
const VALID_PRIORITIES = new Set(['critical', 'high', 'routine', 'low'])

const ISSUE_COLUMNS = {
  equipmentId:      'equipment_id',
  equipmentName:    'equipment_name',
  category:         'category',
  issueType:        'issue_type',
  priority:         'priority',
  status:           'status',
  location:         'location',
  reportedBy:       'reported_by',
  description:      'description',
  supervisorNotes:  'supervisor_notes',
}

function normalizeStatus(value, fallback = 'pending_review') {
  return VALID_STATUSES.has(value) ? value : fallback
}

function normalizePriority(value) {
  return VALID_PRIORITIES.has(value) ? value : 'routine'
}

function rowToIssue(row) {
  if (!row) return null
  return {
    id:              row.id,
    courseId:        row.course_id,
    equipmentId:     row.equipment_id,
    equipmentName:   row.equipment_name,
    category:        row.category,
    issueType:       row.issue_type,
    priority:        row.priority,
    status:          row.status,
    location:        row.location,
    reportedBy:      row.reported_by,
    description:     row.description,
    supervisorNotes: row.supervisor_notes,
    reviewedAt:      row.reviewed_at,
    approvedAt:      row.approved_at,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

function rowToEquipment(row) {
  if (!row) return null
  return {
    id:               row.id,
    name:             row.name,
    category:         row.category,
    status:           row.status,
    hours:            row.hours,
    nextServiceHours: row.next_service_hours,
    manufacturer:     row.manufacturer,
    model:            row.model,
    serviceInterval:  row.service_interval,
    notes:            row.notes,
    courseId:         row.course_id,
  }
}

function rowToMaintenance(row) {
  if (!row) return null
  let partsUsed = []
  if (row.parts_used) {
    try { partsUsed = JSON.parse(row.parts_used) } catch { partsUsed = [] }
  }
  return {
    id:             row.id,
    equipmentId:    row.equipment_id,
    equipmentName:  row.equipment_name,
    category:       row.category,
    serviceType:    row.service_type,
    status:         row.status,
    priority:       row.priority,
    date:           row.date,
    completedDate:  row.completed_date,
    hoursAtService: row.hours_at_service,
    nextDueHours:   row.next_due_hours,
    cost:           row.cost,
    technician:     row.technician,
    notes:          row.notes,
    partsUsed,
    courseId:       row.course_id,
    createdAt:      row.created_at,
  }
}

export async function listEquipmentIssues(env, courseId = null, { status = null } = {}) {
  const { where, binds } = buildCourseFilter(courseId)
  const clauses = where ? [where.replace(/^WHERE /, '')] : []
  if (status && VALID_STATUSES.has(status)) {
    clauses.push('status = ?')
    binds.push(status)
  }
  const sqlWhere = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM equipment_issues ${sqlWhere}
     ORDER BY
       CASE status
         WHEN 'pending_review' THEN 0
         WHEN 'approved' THEN 1
         WHEN 'resolved' THEN 2
         ELSE 3
       END,
       CASE priority
         WHEN 'critical' THEN 0
         WHEN 'high' THEN 1
         WHEN 'routine' THEN 2
         ELSE 3
       END,
       datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToIssue))
}

export async function getEquipmentIssue(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM equipment_issues WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Equipment issue not found')
  return json(rowToIssue(row))
}

export async function createEquipmentIssue(env, request, { publicSubmission = false } = {}) {
  const body = await readJson(request)
  const equipmentName = String(body.equipmentName ?? '').trim()
  const description = String(body.description ?? '').trim()
  if (!equipmentName) return badRequest('equipmentName is required')
  if (!description) return badRequest('description is required')

  const id = body.id ?? generateId('ei')
  const status = publicSubmission
    ? 'pending_review'
    : normalizeStatus(body.status)

  await env.DB.prepare(`
    INSERT INTO equipment_issues (
      id, course_id, equipment_id, equipment_name, category, issue_type,
      priority, status, location, reported_by, description, supervisor_notes,
      reviewed_at, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    resolveCourseId(body),
    body.equipmentId ?? null,
    equipmentName,
    body.category ?? null,
    body.issueType ?? 'issue',
    normalizePriority(body.priority),
    status,
    body.location ?? null,
    body.reportedBy ?? null,
    description,
    body.supervisorNotes ?? null,
    status === 'pending_review' ? null : new Date().toISOString(),
    status === 'approved' ? new Date().toISOString() : null,
  ).run()

  return getEquipmentIssue(env, id)
}

export async function updateEquipmentIssue(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(ISSUE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'status') value = normalizeStatus(value)
    if (apiKey === 'priority') value = normalizePriority(value)
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    sets.push('reviewed_at = ?')
    binds.push(body.status === 'pending_review' ? null : new Date().toISOString())
    if (body.status === 'approved') {
      sets.push('approved_at = ?')
      binds.push(new Date().toISOString())
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE equipment_issues SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Equipment issue not found')
  return getEquipmentIssue(env, id)
}

export async function deleteEquipmentIssue(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM equipment_issues WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Equipment issue not found')
  return json({ ok: true, id })
}

export async function listEquipmentBoardState(env, courseId = null) {
  const eqWhere = courseId ? 'WHERE course_id = ?' : ''
  const scopedBinds = courseId ? [courseId] : []
  const maintenanceWhere = courseId ? 'WHERE ml.course_id = ?' : ''
  const issueWhere = courseId
    ? "WHERE course_id = ? AND status = 'approved'"
    : "WHERE status = 'approved'"

  const [equipmentRes, maintenanceRes, issueRes] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM equipment ${eqWhere} ORDER BY name ASC`,
    ).bind(...scopedBinds).all(),
    env.DB.prepare(`
      SELECT ml.*, e.name AS equipment_name, e.category AS category
      FROM maintenance_logs ml
      LEFT JOIN equipment e ON e.id = ml.equipment_id
      ${maintenanceWhere}
      ORDER BY
        CASE ml.priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'routine' THEN 2
          ELSE 3
        END,
        datetime(ml.date) ASC,
        datetime(ml.created_at) DESC
    `).bind(...scopedBinds).all(),
    env.DB.prepare(`
      SELECT * FROM equipment_issues ${issueWhere}
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'routine' THEN 2
          ELSE 3
        END,
        datetime(created_at) DESC
    `).bind(...scopedBinds).all(),
  ])

  return {
    equipment:  (equipmentRes.results ?? []).map(rowToEquipment),
    serviceLog: (maintenanceRes.results ?? []).map(rowToMaintenance),
    issues:     (issueRes.results ?? []).map(rowToIssue),
  }
}
