// Phase E.5 — Shift Templates CRUD + apply.
//
// Day-agnostic templates that the supervisor can apply to any date.
// Distinct from schedule_templates (which rewrites the recurring weekly
// grid via day_of_week keys). Shift template apply writes rows into
// employee_schedule_overrides for the requested effective_date —
// recurring grid stays untouched.
//
// Mutation auth (Phase 5.1b) is applied centrally in worker/index.js
// via mutationPermissions.js — canEditAssignments required.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const ALLOWED_STATUS = new Set(['scheduled', 'off', 'vacation', 'sick'])

function coerceStatus(value) {
  if (typeof value !== 'string') return null
  return ALLOWED_STATUS.has(value) ? value : null
}

function coerceDate(value) {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function rowToTemplate(row, extras = {}) {
  if (!row) return null
  return {
    id:          row.id,
    courseId:    row.course_id,
    name:        row.name,
    label:       row.label,
    description: row.description,
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
    status:      row.status,
    startTime:   row.start_time,
    endTime:     row.end_time,
    role:        row.role,
    notes:       row.notes,
    sortOrder:   row.sort_order,
  }
}

const ROW_CORE_COLUMNS = {
  employeeId: 'employee_id',
  status:     'status',
  startTime:  'start_time',
  endTime:    'end_time',
  role:       'role',
  notes:      'notes',
  sortOrder:  'sort_order',
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listShiftTemplates(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT t.*, (
       SELECT COUNT(*) FROM shift_template_rows r WHERE r.template_id = t.id
     ) AS row_count
       FROM shift_templates t
       ${where}
       ORDER BY name ASC`,
  ).bind(...binds).all()
  return json(results.map(r => rowToTemplate(r, { rowCount: r.row_count ?? 0 })))
}

export async function getShiftTemplate(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM shift_templates WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Shift template not found')
  const { results } = await env.DB.prepare(
    'SELECT * FROM shift_template_rows WHERE template_id = ? ORDER BY sort_order ASC, employee_id ASC',
  ).bind(id).all()
  return json(rowToTemplate(row, { rows: results.map(rowToTemplateRow) }))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createShiftTemplate(env, request) {
  const body = await readJson(request)
  const name = (body.name ?? '').trim()
  if (!name) return badRequest('name is required')

  const id       = body.id ?? generateId('shift')
  const courseId = resolveCourseId(body)

  try {
    await env.DB.prepare(`
      INSERT INTO shift_templates (id, course_id, name, label, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      id,
      courseId,
      name,
      body.label       ?? null,
      body.description ?? null,
    ).run()
  } catch (err) {
    if (String(err.message ?? '').includes('UNIQUE')) {
      const existing = await env.DB.prepare(
        'SELECT * FROM shift_templates WHERE course_id = ? AND name = ?',
      ).bind(courseId, name).first()
      if (existing) return json(rowToTemplate(existing), 200)
    }
    throw err
  }

  // Rows — body.rows[] when present. Empty templates are valid (the
  // supervisor can populate later via the inline editor).
  if (Array.isArray(body.rows)) {
    for (const r of body.rows) {
      if (!r.employeeId) continue
      const status = coerceStatus(r.status ?? 'scheduled') ?? 'scheduled'
      await env.DB.prepare(`
        INSERT INTO shift_template_rows (
          id, template_id, employee_id, status,
          start_time, end_time, role, notes, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        r.id ?? generateId('shiftrow'),
        id,
        r.employeeId,
        status,
        r.startTime ?? null,
        r.endTime   ?? null,
        r.role      ?? null,
        r.notes     ?? null,
        Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
      ).run()
    }
  }

  return getShiftTemplate(env, id)
}

export async function updateShiftTemplate(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries({
    name:        'name',
    label:       'label',
    description: 'description',
  })) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'name' && typeof value === 'string') {
      value = value.trim()
      if (value === '') return badRequest('name cannot be empty')
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  // Rows replace — when body.rows is supplied, wipe + reinsert. This
  // is the simplest "save my changes" semantics for an inline editor.
  // Omit rows from the body to update header fields only.
  const willReplaceRows = Array.isArray(body.rows)

  if (sets.length > 0) {
    sets.push(`updated_at = datetime('now')`)
    const result = await env.DB.prepare(
      `UPDATE shift_templates SET ${sets.join(', ')} WHERE id = ?`,
    ).bind(...binds, id).run()
    if (!result.success || result.meta.changes === 0) {
      if (!willReplaceRows) return notFound('Shift template not found')
    }
  }

  if (willReplaceRows) {
    // Confirm template exists before we wipe (avoid orphaning rows).
    const tpl = await env.DB.prepare(
      'SELECT id FROM shift_templates WHERE id = ?',
    ).bind(id).first()
    if (!tpl) return notFound('Shift template not found')

    await env.DB.prepare(
      'DELETE FROM shift_template_rows WHERE template_id = ?',
    ).bind(id).run()
    for (const r of body.rows) {
      if (!r.employeeId) continue
      const status = coerceStatus(r.status ?? 'scheduled') ?? 'scheduled'
      await env.DB.prepare(`
        INSERT INTO shift_template_rows (
          id, template_id, employee_id, status,
          start_time, end_time, role, notes, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        r.id ?? generateId('shiftrow'),
        id,
        r.employeeId,
        status,
        r.startTime ?? null,
        r.endTime   ?? null,
        r.role      ?? null,
        r.notes     ?? null,
        Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
      ).run()
    }
  }

  return getShiftTemplate(env, id)
}

export async function deleteShiftTemplate(env, id) {
  // Hard delete — templates are reusable scratch, not audit-bearing.
  // Cascade rows manually since SQLite FK enforcement isn't on by
  // default for these tables.
  await env.DB.prepare(
    'DELETE FROM shift_template_rows WHERE template_id = ?',
  ).bind(id).run()
  const result = await env.DB.prepare(
    'DELETE FROM shift_templates WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Shift template not found')
  return json({ ok: true, id })
}

// ── Apply ─────────────────────────────────────────────────────────────────
//
// POST /api/shift-templates/:id/apply  body { effectiveDate, replace }
//
// Writes each template row into employee_schedule_overrides for the
// requested effective_date. When `replace: true`, any existing
// overrides for that date are deleted first; otherwise the apply
// MERGES, skipping rows whose (course, employee, date) triple
// already exists (the unique index would reject the INSERT anyway).
//
// Returns { applied, skipped, replaced } so the UI can report cleanly.
//
// CRITICAL: this NEVER touches employee_schedules (the recurring grid).
// All writes land in employee_schedule_overrides so the weekly editor
// + recurring rules stay pristine.

export async function applyShiftTemplate(env, templateId, request) {
  const body = await readJson(request)
  const effectiveDate = coerceDate(body.effectiveDate)
  if (!effectiveDate) return badRequest('effectiveDate must be a YYYY-MM-DD string')
  const replace = body.replace === true

  const tplRow = await env.DB.prepare(
    'SELECT * FROM shift_templates WHERE id = ?',
  ).bind(templateId).first()
  if (!tplRow) return notFound('Shift template not found')

  const courseId = tplRow.course_id

  const { results: rows } = await env.DB.prepare(
    'SELECT * FROM shift_template_rows WHERE template_id = ?',
  ).bind(templateId).all()

  // Validate employees still exist in this course.
  const { results: empRows } = await env.DB.prepare(
    'SELECT id FROM crew_employees WHERE course_id = ?',
  ).bind(courseId).all()
  const validEmpIds = new Set(empRows.map(r => r.id))

  let replaced = 0
  if (replace) {
    const wipe = await env.DB.prepare(
      `DELETE FROM employee_schedule_overrides
        WHERE course_id = ? AND effective_date = ?`,
    ).bind(courseId, effectiveDate).run()
    replaced = wipe.meta?.changes ?? 0
  }

  let applied = 0, skipped = 0
  for (const r of rows) {
    if (!validEmpIds.has(r.employee_id)) { skipped += 1; continue }
    try {
      await env.DB.prepare(`
        INSERT INTO employee_schedule_overrides (
          id, course_id, employee_id, effective_date,
          start_time, end_time, role, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId('schov'),
        courseId,
        r.employee_id,
        effectiveDate,
        r.start_time,
        r.end_time,
        r.role,
        r.status,
        r.notes,
      ).run()
      applied += 1
    } catch {
      // UNIQUE collision on (course, employee, date) — merge semantics
      // means we leave existing override in place.
      skipped += 1
    }
  }

  return json({
    ok:            true,
    templateId,
    templateName:  tplRow.name,
    effectiveDate,
    replace,
    replaced,
    applied,
    skipped,
  })
}
