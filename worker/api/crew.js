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

// rowToEmployee — serialize a crew_employees row. `canViewPrivate` gates
// the management-only fields: when false, the private keys are OMITTED
// entirely (not null, not ''), mirroring the conditionLog.js privateNotes
// precedent. Enforcement lives in the serializer so every read path is
// covered uniformly.
//
// Public-safe (always returned):
//   id, employeeId, name, fullName, role, department, status,
//   assignedArea, skills, certifications, courseId, createdAt, updatedAt
//
// Private (only included when canViewPrivate === true):
//   phone, email, notes, payRate, hireDate, pesticideLicense, emergencyContact
//
// Phase 9C.5a.5 — Closes the gap where /display-board/board (the public
// kiosk route) could observe pay rates etc. over the wire even though the
// kiosk itself never rendered them.
function rowToEmployee(row, canViewPrivate = false) {
  if (!row) return null
  const out = {
    id:                row.id,
    employeeId:        row.id,                              // legacy alias
    name:              row.name,
    fullName:          row.name,                            // legacy alias
    role:              row.role,
    department:        row.department,
    status:            row.status,
    assignedArea:      row.assigned_area,
    skills:            parseJsonArray(row.skills_json),
    certifications:    parseJsonArray(row.certifications_json),
    // Phase 9C.5c1 — translation preferences. Public-safe by design:
    // the anonymous kiosk needs them to decide whether to auto-translate
    // board / task notes for this operator (gating lands in 9C.5c4).
    autoTranslateBoardNotes: row.auto_translate_board_notes === 1,
    boardLanguage:           row.board_language ?? 'en',
    courseId:          row.course_id,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
  if (canViewPrivate) {
    out.phone            = row.phone
    out.email            = row.email
    out.notes            = row.notes
    out.payRate          = row.pay_rate
    out.hireDate         = row.hire_date
    out.pesticideLicense = row.pesticide_license
    out.emergencyContact = row.emergency_contact
  }
  return out
}

// Mutable column map. JSON-encoded array fields are handled separately
// in updateCrewEmployee so callers can pass real arrays instead of
// pre-stringified blobs. Boolean-valued fields are normalized to 0/1
// when binding (see BOOLEAN_COLUMNS below).
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
  // Phase 9C.5c1 — translation preferences.
  autoTranslateBoardNotes: 'auto_translate_board_notes',
  boardLanguage:           'board_language',
}

// Phase 9C.5c1 — keys whose JS values need 0/1 normalization before
// binding to a SQLite INTEGER column. Booleans, 'true'/'false' strings,
// and JS truthy/falsy all collapse to 0 or 1.
const BOOLEAN_COLUMNS = new Set(['autoTranslateBoardNotes'])
function normalizeBoolean(v) {
  if (v === 1 || v === 0) return v
  if (v === true)  return 1
  if (v === false) return 0
  if (v === 'true')  return 1
  if (v === 'false') return 0
  return v ? 1 : 0
}

// ── List + Get ────────────────────────────────────────────────────────────

// `canViewPrivate` (resolved from the actor in worker/index.js) gates
// management-only fields per-row via the serializer.
export async function listCrewEmployees(env, courseId = null, canViewPrivate = false) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM crew_employees ${where} ORDER BY name COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(r => rowToEmployee(r, canViewPrivate)))
}

export async function getCrewEmployee(env, id, canViewPrivate = false) {
  const row = await env.DB.prepare(
    'SELECT * FROM crew_employees WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Crew employee not found')
  return json(rowToEmployee(row, canViewPrivate))
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
      auto_translate_board_notes, board_language,
      course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    // Phase 9C.5c1 — translation preferences. The boolean is normalized
    // to 0/1 for SQLite INTEGER storage; board_language defaults to 'en'
    // when not supplied so existing English-only callers stay happy.
    body.autoTranslateBoardNotes ? 1 : 0,
    body.boardLanguage    ?? 'en',
    resolveCourseId(body),
  ).run()

  // Phase 9C.5a.5 — Mutation handlers are already past the worker mutation
  // gate, so the caller is an authenticated actor. Echo back the full
  // record (including private fields) so Employee Management sees the
  // freshly-saved row it just submitted.
  return getCrewEmployee(env, id, true)
}

export async function updateCrewEmployee(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      // Phase 9C.5c1 — boolean PATCH values (e.g. autoTranslateBoardNotes)
      // arrive as JS true/false from the UI; SQLite expects 0/1 for the
      // INTEGER column. normalizeBoolean leaves non-boolean values alone.
      const raw = body[apiKey]
      binds.push(BOOLEAN_COLUMNS.has(apiKey) ? normalizeBoolean(raw) : raw)
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
  // Phase 9C.5a.5 — see createCrewEmployee comment; the PATCH caller is
  // already authenticated past the mutation gate, so echo back the full
  // record.
  return getCrewEmployee(env, id, true)
}

export async function deleteCrewEmployee(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM crew_employees WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Crew employee not found')
  return json({ ok: true, id })
}
