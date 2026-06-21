// Crew Assignments + Equipment Reservations CRUD (Phase 5.4c).
//
// Two tables, one module. Both link back to calendar_events.id via
// calendar_event_id (soft FK) so each handoff survives reload alongside
// its event.
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.
//
// Idempotency: each table has a UNIQUE composite index on
// (calendar_event_id, employee_name) and (calendar_event_id,
// equipment_name) respectively. A duplicate POST returns the existing row
// with 200 instead of erroring, mirroring calendar_events Phase 5.4a
// behavior so fire-and-forget callers (MaintenanceLogs → reservation)
// stay idempotent across retries.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mappers ───────────────────────────────────────────────────────────────

function rowToCrewAssignment(row) {
  if (!row) return null
  return {
    id:              row.id,
    calendarEventId: row.calendar_event_id,
    employeeId:      row.employee_id,
    employeeName:    row.employee_name,
    role:            row.role,
    status:          row.status,
    notes:           row.notes,
    // Phase 9C.5b1 — manual Spanish translation for kiosk display.
    notesEs:         row.notes_es,
    assignedAt:      row.assigned_at,
    courseId:        row.course_id,
    // Phase DAB.10a — Position of this job within the employee's
    // ordered list for the day. 0 = primary "1st Job"; 1 = "2nd Job";
    // etc. Legacy rows pre-migration default to 0 → render as the
    // primary slot with no UI change.
    jobOrder:        row.job_order ?? 0,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

function rowToEquipmentReservation(row) {
  if (!row) return null
  return {
    id:                row.id,
    calendarEventId:   row.calendar_event_id,
    // Phase 10 — soft FK to a specific crew_assignment so the Display
    // Board can render this chip next to the operator who's using it.
    crewAssignmentId:  row.crew_assignment_id,
    equipmentId:       row.equipment_id,
    equipmentName:     row.equipment_name,
    status:            row.status,
    notes:             row.notes,
    reservedAt:        row.reserved_at,
    courseId:          row.course_id,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

const CREW_CORE_COLUMNS = {
  calendarEventId: 'calendar_event_id',
  employeeId:      'employee_id',
  employeeName:    'employee_name',
  role:            'role',
  status:          'status',
  notes:           'notes',
  notesEs:         'notes_es',                              // Phase 9C.5b1
  assignedAt:      'assigned_at',
  jobOrder:        'job_order',                             // Phase DAB.10a
}

const RES_CORE_COLUMNS = {
  calendarEventId:   'calendar_event_id',
  crewAssignmentId:  'crew_assignment_id',
  equipmentId:       'equipment_id',
  equipmentName:     'equipment_name',
  status:            'status',
  notes:             'notes',
  reservedAt:        'reserved_at',
}

// ── Crew Assignments ──────────────────────────────────────────────────────

export async function listCrewAssignments(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM crew_assignments ${where} ORDER BY datetime(assigned_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToCrewAssignment))
}

export async function getCrewAssignment(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM crew_assignments WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Crew assignment not found')
  return json(rowToCrewAssignment(row))
}

export async function createCrewAssignment(env, request) {
  const body = await readJson(request)
  if (!body.employeeName) return badRequest('employeeName is required')

  const calendarEventId = body.calendarEventId ?? null
  // Phase DAB.10a — Caller may supply jobOrder. Default 0 (primary
  // "1st Job"). Validated as a non-negative integer.
  const jobOrder = Number.isFinite(Number(body.jobOrder))
    ? Math.max(0, Math.floor(Number(body.jobOrder)))
    : 0

  // Dedupe — (calendar_event_id, employee_name, job_order) is UNIQUE.
  // Return the existing row instead of 409 so fire-and-forget callers
  // stay idempotent. Pre-DAB.10a single-job callers omit jobOrder
  // → dedupe on (event, employee, 0) which matches legacy rows.
  if (calendarEventId) {
    const existing = await env.DB.prepare(
      `SELECT * FROM crew_assignments
       WHERE calendar_event_id = ? AND employee_name = ? AND job_order = ?
       LIMIT 1`,
    ).bind(calendarEventId, body.employeeName, jobOrder).first()
    if (existing) return json(rowToCrewAssignment(existing))
  }

  const id = body.id ?? generateId('ca')

  await env.DB.prepare(`
    INSERT INTO crew_assignments (
      id, calendar_event_id, employee_id, employee_name, role, status,
      notes, notes_es, course_id, job_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    calendarEventId,
    body.employeeId   ?? null,
    body.employeeName,
    body.role   ?? null,
    body.status ?? 'assigned',
    body.notes    ?? null,
    body.notesEs  ?? null,                                  // Phase 9C.5b1
    resolveCourseId(body),
    jobOrder,                                               // Phase DAB.10a
  ).run()

  return getCrewAssignment(env, id)
}

// Phase DAB.10a — Determine whether a job payload row is "blank".
// Used by bulkReplaceEmployeeJobs to filter empty 2nd/3rd-job slots
// the editor may submit before the user types anything. A blank job
// is NOT persisted. Definition: no notes AND no notesEs AND no role
// AND status falls back to default. Status alone never carries
// meaning since it defaults to 'assigned' even on a fresh row.
function isBlankJobPayload(j) {
  if (j == null || typeof j !== 'object') return true
  const notes   = j.notes   == null ? '' : String(j.notes).trim()
  const notesEs = j.notesEs == null ? '' : String(j.notesEs).trim()
  const role    = j.role    == null ? '' : String(j.role).trim()
  return notes === '' && notesEs === '' && role === ''
}

// Phase DAB.10a — Bulk-replace the job list for a single (event,
// employee). Used by the DAB editor when the supervisor saves an
// employee's multi-job slate in one go. Sequence:
//
//   1. Filter out blank jobs from the payload.
//   2. DELETE every crew_assignments row for (event, employee).
//   3. INSERT each surviving job in payload order with
//      job_order = 0..N-1.
//
// Caller passes:
//   {
//     calendarEventId,
//     employeeName,
//     employeeId,    // optional, used as default for every row
//     role,          // optional, used as default for every row
//     jobs: [
//       { notes, notesEs, status, role },
//       …
//     ]
//   }
//
// Empty `jobs: []` (or all-blank jobs filtered to empty) deletes
// every row for that pair without re-inserting — this is the
// intentional "clear all jobs for this employee" path.
//
// Sequential pattern matches deleteSpray / replaceSprayProducts —
// if the worker dies between DELETE and INSERTs the user can retry
// safely. Permission gating is upstream via /api/crew-assignments
// rule in MUTATION_RULES → canEditAssignments. No new rule needed.
export async function bulkReplaceEmployeeJobs(env, request) {
  const body = await readJson(request)
  if (!body.calendarEventId) return badRequest('calendarEventId is required')
  if (!body.employeeName)    return badRequest('employeeName is required')
  if (!Array.isArray(body.jobs)) return badRequest('jobs must be an array')

  // Validate each job before any DB mutation so partial replacement
  // isn't possible on input-shape errors. The blank filter runs
  // after this so a malformed object is still rejected loudly.
  for (let i = 0; i < body.jobs.length; i++) {
    const j = body.jobs[i]
    if (j != null && typeof j !== 'object') {
      return badRequest(`jobs[${i}] must be an object`)
    }
  }

  // Filter out blank jobs.
  const populatedJobs = body.jobs.filter(j => !isBlankJobPayload(j))

  // 1. Drop existing rows for this (event, employee).
  await env.DB.prepare(
    `DELETE FROM crew_assignments
     WHERE calendar_event_id = ? AND employee_name = ?`,
  ).bind(body.calendarEventId, body.employeeName).run()

  // 2. Insert surviving jobs in payload order.
  const insertedIds = []
  for (let i = 0; i < populatedJobs.length; i++) {
    const j  = populatedJobs[i]
    const id = j.id ?? generateId('ca')
    await env.DB.prepare(`
      INSERT INTO crew_assignments (
        id, calendar_event_id, employee_id, employee_name, role, status,
        notes, notes_es, course_id, job_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.calendarEventId,
      body.employeeId ?? j.employeeId ?? null,
      body.employeeName,
      j.role    ?? body.role ?? null,
      j.status  ?? 'assigned',
      j.notes   ?? null,
      j.notesEs ?? null,
      resolveCourseId(body),
      i,                                                    // job_order = payload index
    ).run()
    insertedIds.push(id)
  }

  if (insertedIds.length === 0) {
    return json({
      ok:              true,
      calendarEventId: body.calendarEventId,
      employeeName:    body.employeeName,
      rows:            [],
    })
  }

  // Return the freshly-inserted rows in order for the caller to
  // merge into its local state without a second round-trip.
  const placeholders = insertedIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT * FROM crew_assignments
     WHERE id IN (${placeholders}) ORDER BY job_order ASC`,
  ).bind(...insertedIds).all()
  return json({
    ok:              true,
    calendarEventId: body.calendarEventId,
    employeeName:    body.employeeName,
    rows:            results.map(rowToCrewAssignment),
  })
}

export async function updateCrewAssignment(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CREW_CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }

  // Phase 9C.5c3 — English-edit invalidation. When an author changes
  // the English notes WITHOUT supplying a fresh Spanish translation in
  // the same PATCH, NULL the cached notes_es so the next cron sweep
  // re-translates the new English. A PATCH that supplies notesEs
  // explicitly (manual authoring) takes the human-supplied value
  // verbatim and the loop above already covered it.
  if (Object.prototype.hasOwnProperty.call(body, 'notes')
      && !Object.prototype.hasOwnProperty.call(body, 'notesEs')) {
    sets.push('notes_es = NULL')
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE crew_assignments SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Crew assignment not found')
  return getCrewAssignment(env, id)
}

export async function deleteCrewAssignment(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM crew_assignments WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Crew assignment not found')
  return json({ ok: true, id })
}

// ── Equipment Reservations ────────────────────────────────────────────────

export async function listEquipmentReservations(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM equipment_reservations ${where} ORDER BY datetime(reserved_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToEquipmentReservation))
}

export async function getEquipmentReservation(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM equipment_reservations WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Equipment reservation not found')
  return json(rowToEquipmentReservation(row))
}

export async function createEquipmentReservation(env, request) {
  const body = await readJson(request)
  if (!body.equipmentName) return badRequest('equipmentName is required')

  const calendarEventId = body.calendarEventId ?? null

  // Dedupe — (calendar_event_id, equipment_name) is UNIQUE.
  if (calendarEventId) {
    const existing = await env.DB.prepare(
      `SELECT * FROM equipment_reservations
       WHERE calendar_event_id = ? AND equipment_name = ?
       LIMIT 1`,
    ).bind(calendarEventId, body.equipmentName).first()
    if (existing) return json(rowToEquipmentReservation(existing))
  }

  const id = body.id ?? generateId('er')

  await env.DB.prepare(`
    INSERT INTO equipment_reservations (
      id, calendar_event_id, crew_assignment_id,
      equipment_id, equipment_name, status, notes, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    calendarEventId,
    body.crewAssignmentId ?? null,
    body.equipmentId      ?? null,
    body.equipmentName,
    body.status           ?? 'reserved',
    body.notes            ?? null,
    resolveCourseId(body),
  ).run()

  return getEquipmentReservation(env, id)
}

export async function updateEquipmentReservation(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(RES_CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE equipment_reservations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Equipment reservation not found')
  return getEquipmentReservation(env, id)
}

export async function deleteEquipmentReservation(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM equipment_reservations WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Equipment reservation not found')
  return json({ ok: true, id })
}
