// Schedule templates CRUD + apply (Phase 14).
//
// Templates are reusable weekly labor structures. The apply endpoint
// fully replaces employee_schedules for the course, skipping rows whose
// employee no longer exists. Mutation auth (Phase 5.1b) handled centrally.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_CATEGORY = new Set([
  'standard',
  'tournament',
  'weather',
  'spray',
  'cultural_practice',
  'aerification',
])

const ALLOWED_STATUS = new Set(['scheduled', 'off', 'vacation', 'sick'])

function rowToTemplate(row, extras = {}) {
  if (!row) return null
  return {
    id:          row.id,
    courseId:    row.course_id,
    name:        row.name,
    description: row.description,
    category:    row.category,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    ...extras,
  }
}

function rowToTemplateRow(row) {
  if (!row) return null
  return {
    id:          row.id,
    templateId:  row.template_id,
    employeeId:  row.employee_id,
    dayOfWeek:   row.day_of_week,
    startTime:   row.start_time,
    endTime:     row.end_time,
    role:        row.role,
    status:      row.status,
  }
}

function coerceCategory(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_CATEGORY.has(value) ? value : null
}

function coerceStatus(value) {
  if (typeof value !== 'string') return 'scheduled'
  return ALLOWED_STATUS.has(value) ? value : 'scheduled'
}

function coerceDay(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 6) return null
  return n
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listScheduleTemplates(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT t.*, (
       SELECT COUNT(*) FROM schedule_template_rows r WHERE r.template_id = t.id
     ) AS row_count
       FROM schedule_templates t
       ${where}
       ORDER BY datetime(updated_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(r => rowToTemplate(r, { rowCount: r.row_count })))
}

export async function getScheduleTemplate(env, id) {
  const tplRow = await env.DB.prepare(
    'SELECT * FROM schedule_templates WHERE id = ?',
  ).bind(id).first()
  if (!tplRow) return notFound('Template not found')
  const { results: rowRecords } = await env.DB.prepare(
    `SELECT * FROM schedule_template_rows
      WHERE template_id = ?
      ORDER BY day_of_week ASC, employee_id ASC`,
  ).bind(id).all()
  return json({
    ...rowToTemplate(tplRow),
    rows: rowRecords.map(rowToTemplateRow),
  })
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createScheduleTemplate(env, request) {
  const body = await readJson(request)
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return badRequest('name is required')
  }
  const category = coerceCategory(body.category) ?? 'standard'
  const courseId = resolveCourseId(body)
  const id       = body.id ?? generateId('tpl')

  await env.DB.prepare(`
    INSERT INTO schedule_templates (id, course_id, name, description, category)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    courseId,
    body.name.trim(),
    body.description ?? null,
    category,
  ).run()

  // Insert rows (best-effort, one at a time so a single bad row doesn't
  // poison the rest).
  let rowsInserted = 0
  if (Array.isArray(body.rows)) {
    for (const r of body.rows) {
      const dow = coerceDay(r.dayOfWeek)
      if (dow === null || !r.employeeId) continue
      try {
        await env.DB.prepare(`
          INSERT INTO schedule_template_rows (
            id, template_id, employee_id, day_of_week,
            start_time, end_time, role, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          generateId('tpr'),
          id,
          r.employeeId,
          dow,
          r.startTime ?? null,
          r.endTime   ?? null,
          r.role      ?? null,
          coerceStatus(r.status),
        ).run()
        rowsInserted += 1
      } catch {
        // skip the bad row, keep going
      }
    }
  }

  // Return the full template with rows so the client cache fills in.
  const created = await env.DB.prepare(
    'SELECT * FROM schedule_templates WHERE id = ?',
  ).bind(id).first()
  return json({
    ...rowToTemplate(created, { rowCount: rowsInserted }),
    rowsInserted,
  })
}

export async function updateScheduleTemplate(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (!body.name || body.name.trim() === '') return badRequest('name cannot be empty')
    sets.push('name = ?'); binds.push(body.name.trim())
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    sets.push('description = ?'); binds.push(body.description ?? null)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'category')) {
    const cat = coerceCategory(body.category)
    if (!cat) return badRequest('Invalid category')
    sets.push('category = ?'); binds.push(cat)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE schedule_templates SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Template not found')
  return getScheduleTemplate(env, id)
}

export async function deleteScheduleTemplate(env, id) {
  // Cascade by hand — SQLite doesn't enforce FK without PRAGMA.
  await env.DB.prepare(
    'DELETE FROM schedule_template_rows WHERE template_id = ?',
  ).bind(id).run()
  const result = await env.DB.prepare(
    'DELETE FROM schedule_templates WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Template not found')
  return json({ ok: true, id })
}

// ── Apply ─────────────────────────────────────────────────────────────────
//
// Full-replace: drops every employee_schedules row for the course and
// then inserts each template row whose employee still exists. Returns
// { applied, skipped } so the client toast can report skipped rows.
//
// Course scoping: the template's course_id is the source of truth. The
// caller may pass courseId in the body for backward compat but we
// always replace on the template's course.

export async function applyScheduleTemplate(env, templateId) {
  const tplRow = await env.DB.prepare(
    'SELECT * FROM schedule_templates WHERE id = ?',
  ).bind(templateId).first()
  if (!tplRow) return notFound('Template not found')

  const courseId = tplRow.course_id

  const { results: templateRows } = await env.DB.prepare(
    'SELECT * FROM schedule_template_rows WHERE template_id = ?',
  ).bind(templateId).all()

  // Build a set of valid employee ids for safe-skip behavior.
  const { results: empRows } = await env.DB.prepare(
    'SELECT id FROM crew_employees WHERE course_id = ?',
  ).bind(courseId).all()
  const validEmpIds = new Set(empRows.map(r => r.id))

  // Wipe current schedules for the course.
  await env.DB.prepare(
    'DELETE FROM employee_schedules WHERE course_id = ?',
  ).bind(courseId).run()

  let applied = 0
  let skipped = 0
  for (const r of templateRows) {
    if (!validEmpIds.has(r.employee_id)) { skipped += 1; continue }
    try {
      await env.DB.prepare(`
        INSERT INTO employee_schedules (
          id, course_id, employee_id, day_of_week,
          start_time, end_time, role, status, is_recurring
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        generateId('sch'),
        courseId,
        r.employee_id,
        r.day_of_week,
        r.start_time,
        r.end_time,
        r.role,
        r.status,
      ).run()
      applied += 1
    } catch {
      skipped += 1
    }
  }

  return json({
    ok:         true,
    templateId,
    templateName: tplRow.name,
    applied,
    skipped,
  })
}
