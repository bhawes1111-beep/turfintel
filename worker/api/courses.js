// Courses CRUD endpoints (Phase 5.7).
//
// The courses table is the canonical multi-course registry. Operational
// verticals (equipment, sprays, calendar_events, …) scope to courses
// via a `course_id` column added in migration 0015.
//
// Mutation auth gate (Phase 5.1b) applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'

function rowToCourse(row) {
  if (!row) return null
  return {
    id:         row.id,
    name:       row.name,
    shortName:  row.short_name,
    location:   row.location,
    status:     row.status,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

const CORE_COLUMNS = {
  name:      'name',
  shortName: 'short_name',
  location:  'location',
  status:    'status',
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listCourses(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM courses ORDER BY name COLLATE NOCASE ASC',
  ).all()
  return json(results.map(rowToCourse))
}

export async function getCourse(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM courses WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Course not found')
  return json(rowToCourse(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createCourse(env, request) {
  const body = await readJson(request)
  if (!body.name) return badRequest('name is required')
  if (!body.id)   return badRequest('id is required (slug, e.g. "crossroads-gc")')

  await env.DB.prepare(`
    INSERT INTO courses (id, name, short_name, location, status)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    body.id,
    body.name,
    body.shortName ?? null,
    body.location  ?? null,
    body.status    ?? 'active',
  ).run()

  return getCourse(env, body.id)
}

export async function updateCourse(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(CORE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE courses SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Course not found')
  return getCourse(env, id)
}

export async function deleteCourse(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM courses WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Course not found')
  return json({ ok: true, id })
}
