// Calendar events CRUD endpoints (Phase 5.4a).
//
// Mutation auth gate (Phase 5.1b) applied centrally in worker/index.js.
//
// Cross-module dedupe: the POST handler enforces the pre-5.4a dedupe
// guard (sourceId + event_type + start_date must be unique). Existing
// duplicate creates return 200 with the existing row instead of 409,
// preserving the pre-5.4a fire-and-forget dispatch ergonomics from
// BuildSpraySheet / Repairs / MaintenanceLogs.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mapper ────────────────────────────────────────────────────────────────
//
// Reassembles the nested shape the existing UI consumers expect:
//   { id, category (alias of event_type), priority, status, title, date
//     (alias of start_date), startTime, endTime, location, assignedStaff,
//     equipment, tags, notes (alias of description), metadata: {
//     sourceModule, sourceId, createdAt } }

function rowToEvent(row) {
  if (!row) return null
  let payload = {}
  if (row.payload_json) {
    try { payload = JSON.parse(row.payload_json) }
    catch { payload = {} }
  }
  return {
    id:            row.id,
    sourceType:    row.source_type,
    sourceId:      row.source_id,
    title:         row.title,
    eventType:     row.event_type,
    category:      row.event_type,             // legacy alias
    status:        row.status,
    startDate:     row.start_date,
    date:          row.start_date,             // legacy alias
    startTime:     row.start_time,
    endDate:       row.end_date,
    endTime:       row.end_time,
    location:      row.location,
    description:   row.description,
    notes:         row.description,            // legacy alias
    priority:      payload.priority   ?? 'medium',
    assignedStaff: payload.assignedStaff ?? [],
    equipment:     payload.equipment    ?? [],
    tags:          payload.tags         ?? [],
    course:        payload.course       ?? null,
    metadata: {
      createdBy:   'operations-layer',
      createdAt:   row.created_at,
      sourceModule: row.source_type,
      sourceId:     row.source_id,
    },
    courseId:      row.course_id,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  }
}

const CORE_COLUMNS = {
  title:       'title',
  eventType:   'event_type',
  status:      'status',
  startDate:   'start_date',
  startTime:   'start_time',
  endDate:     'end_date',
  endTime:     'end_time',
  location:    'location',
  description: 'description',
  sourceType:  'source_type',
  sourceId:    'source_id',
}

const PAYLOAD_KEYS = ['priority', 'assignedStaff', 'equipment', 'tags', 'course']

function buildPayloadJson(body, existing = null) {
  const base = existing && typeof existing === 'object' ? existing : {}
  let touched = false
  for (const k of PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      base[k] = body[k]
      touched = true
    }
  }
  return touched || existing ? JSON.stringify(base) : null
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listCalendarEvents(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM calendar_events ${where} ORDER BY start_date DESC, created_at DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToEvent))
}

export async function getCalendarEvent(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM calendar_events WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Calendar event not found')
  return json(rowToEvent(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createCalendarEvent(env, request) {
  const body = await readJson(request)
  if (!body.title) return badRequest('title is required')

  // Accept legacy field names (category → eventType, date → startDate,
  // notes → description, sourceModule → sourceType).
  const eventType   = body.eventType   ?? body.category     ?? null
  const startDate   = body.startDate   ?? body.date         ?? null
  const description = body.description ?? body.notes        ?? null
  const sourceType  = body.sourceType  ?? body.sourceModule ?? null
  const sourceId    = body.sourceId    ?? null

  // Dedupe guard — sourceId + event_type + start_date must be unique
  // when sourceId is present. Returns the existing row instead of 409.
  if (sourceId) {
    const existing = await env.DB.prepare(
      `SELECT * FROM calendar_events
       WHERE source_id = ? AND event_type = ? AND start_date = ?
       LIMIT 1`,
    ).bind(sourceId, eventType, startDate).first()
    if (existing) return json(rowToEvent(existing))
  }

  const id          = body.id ?? generateId('cal')
  const payloadJson = buildPayloadJson(body)

  await env.DB.prepare(`
    INSERT INTO calendar_events (
      id, source_type, source_id, title, event_type, status,
      start_date, start_time, end_date, end_time,
      location, description, payload_json, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    sourceType,
    sourceId,
    body.title,
    eventType,
    body.status     ?? 'scheduled',
    startDate,
    body.startTime  ?? null,
    body.endDate    ?? null,
    body.endTime    ?? null,
    body.location   ?? null,
    description,
    payloadJson,
    resolveCourseId(body),
  ).run()

  return getCalendarEvent(env, id)
}

export async function updateCalendarEvent(env, id, request) {
  const body = await readJson(request)

  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  // Payload merge (assignedStaff, equipment, tags, priority, course)
  const touchesPayload = PAYLOAD_KEYS.some(k => Object.prototype.hasOwnProperty.call(body, k))
  if (touchesPayload) {
    const current = await env.DB.prepare(
      'SELECT payload_json FROM calendar_events WHERE id = ?',
    ).bind(id).first()
    let existing = {}
    if (current?.payload_json) {
      try { existing = JSON.parse(current.payload_json) } catch { existing = {} }
    }
    sets.push('payload_json = ?')
    binds.push(buildPayloadJson(body, existing))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Calendar event not found')
  return getCalendarEvent(env, id)
}

export async function deleteCalendarEvent(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM calendar_events WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Calendar event not found')
  return json({ ok: true, id })
}
