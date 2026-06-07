// Phase 9C.11 — Task Templates CRUD endpoints.
//
// Backs the Daily Assignment Board task dropdown via the
// reusable task library at /api/task-templates. The DAB no longer
// reads its dropdown options from same-day calendar_events or from a
// hardcoded JS list; instead it reads active rows from this table.
//
// Mutation auth (canEditAssignments) is applied centrally in
// worker/index.js via mutationPermissions.js. Course scoping follows the
// Phase 5.7 contract (course_id required on writes, filtered on reads).

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_STATUSES = new Set(['active', 'archived'])

function rowToTemplate(row) {
  if (!row) return null
  return {
    id:                row.id,
    courseId:          row.course_id,
    name:              row.name,
    category:          row.category,
    defaultStartTime:  row.default_start_time,
    defaultLocation:   row.default_location,
    defaultNotes:      row.default_notes,
    sortOrder:         row.sort_order,
    status:            row.status,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

const CORE_COLUMNS = {
  name:              'name',
  category:          'category',
  defaultStartTime:  'default_start_time',
  defaultLocation:   'default_location',
  defaultNotes:      'default_notes',
  sortOrder:         'sort_order',
  status:            'status',
}

// ── List + Get ────────────────────────────────────────────────────────────

/**
 * GET /api/task-templates?courseId=...&status=all
 *
 * Default: returns active templates only (the DAB dropdown's hot path).
 * Pass ?status=all to include archived rows (used by the Tasks tab
 * "Show archived" toggle so a supervisor can reactivate an old name).
 */
export async function listTaskTemplates(env, courseId = null, opts = {}) {
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.status !== 'all') {
    sets.push("status = 'active'")
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM task_templates
     ${whereClause}
     ORDER BY sort_order ASC, name ASC`,
  ).bind(...all).all()
  return json(results.map(rowToTemplate))
}

export async function getTaskTemplate(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM task_templates WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Task template not found')
  return json(rowToTemplate(row))
}

// ── Create + Update ───────────────────────────────────────────────────────

export async function createTaskTemplate(env, request) {
  const body = await readJson(request)
  const name = (body.name ?? '').trim()
  if (!name) return badRequest('name is required')

  const id        = body.id ?? generateId('tmpl')
  const courseId  = resolveCourseId(body)
  const sortOrder = Number.isFinite(body.sortOrder) ? body.sortOrder : 0
  const status    = ALLOWED_STATUSES.has(body.status) ? body.status : 'active'

  try {
    await env.DB.prepare(`
      INSERT INTO task_templates (
        id, course_id, name, category, default_start_time,
        default_location, default_notes, sort_order, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      courseId,
      name,
      body.category          ?? null,
      body.defaultStartTime  ?? null,
      body.defaultLocation   ?? null,
      body.defaultNotes      ?? null,
      sortOrder,
      status,
    ).run()
  } catch (err) {
    // UNIQUE(course_id, name) collision — return the existing row so the
    // client UX can render "already exists" without a hard error path.
    if (String(err.message ?? '').includes('UNIQUE')) {
      const existing = await env.DB.prepare(
        'SELECT * FROM task_templates WHERE course_id = ? AND name = ?',
      ).bind(courseId, name).first()
      if (existing) return json(rowToTemplate(existing), 200)
    }
    throw err
  }

  return getTaskTemplate(env, id)
}

export async function updateTaskTemplate(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'name' && typeof value === 'string') {
      value = value.trim()
      if (value === '') return badRequest('name cannot be empty')
    }
    if (apiKey === 'status' && !ALLOWED_STATUSES.has(value)) {
      return badRequest(`Invalid status "${body.status}"`)
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE task_templates SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Task template not found')
  return getTaskTemplate(env, id)
}

// Archive is just a PATCH { status: 'archived' } — no DELETE handler.
// Hard delete would orphan historical assignments that pointed at the
// template's generated calendar_event; we intentionally preserve the
// row so the supervisor can reactivate or rename rather than recreate.
