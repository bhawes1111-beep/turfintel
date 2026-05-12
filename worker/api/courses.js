// Courses CRUD endpoints (Phase 5.7 + Phase 1 acreage configuration).
//
// The courses table is the canonical multi-course registry. Operational
// verticals (equipment, sprays, calendar_events, …) scope to courses
// via a `course_id` column added in migration 0015.
//
// Phase 1 (migration 0017) adds course configuration:
//   • Seven built-in acreage columns (acres_total/greens/tees/fairways/
//     rough/sprayable/practice) — REAL, nullable.
//   • custom_course_areas — TEXT, JSON-encoded list of { name, acres }.
//   • default_spray_units — TEXT, nullable.
//
// Mutation auth gate (Phase 5.1b) applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'

const ALLOWED_SPRAY_UNITS = new Set([
  'oz_per_acre',
  'oz_per_1000sqft',
  'gallons_per_acre',
  'gallons_per_1000sqft',
])

function parseCustomAreas(raw) {
  if (raw == null) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(entry => ({
        name:  typeof entry?.name === 'string' ? entry.name : '',
        acres: Number.isFinite(entry?.acres) ? entry.acres : null,
      }))
      .filter(entry => entry.name.trim() !== '')
  } catch {
    return []
  }
}

function normalizeCustomAreas(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(entry => {
      const name  = typeof entry?.name === 'string' ? entry.name.trim() : ''
      const acres = entry?.acres === '' || entry?.acres == null
        ? null
        : Number(entry.acres)
      return {
        name,
        acres: Number.isFinite(acres) ? acres : null,
      }
    })
    .filter(entry => entry.name !== '')
}

function rowToCourse(row) {
  if (!row) return null
  return {
    id:                 row.id,
    name:               row.name,
    shortName:          row.short_name,
    location:           row.location,
    status:             row.status,
    acresTotal:         row.acres_total,
    acresGreens:        row.acres_greens,
    acresTees:          row.acres_tees,
    acresFairways:      row.acres_fairways,
    acresRough:         row.acres_rough,
    acresSprayable:     row.acres_sprayable,
    acresPractice:      row.acres_practice,
    customCourseAreas:  parseCustomAreas(row.custom_course_areas),
    defaultSprayUnits:  row.default_spray_units,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

// Maps API (camelCase) → DB column (snake_case) for fields editable via
// createCourse + updateCourse. Plain scalar columns only — the JSON column
// `custom_course_areas` is handled separately below so we can serialize.
const CORE_COLUMNS = {
  name:               'name',
  shortName:          'short_name',
  location:           'location',
  status:             'status',
  acresTotal:         'acres_total',
  acresGreens:        'acres_greens',
  acresTees:          'acres_tees',
  acresFairways:      'acres_fairways',
  acresRough:         'acres_rough',
  acresSprayable:     'acres_sprayable',
  acresPractice:      'acres_practice',
  defaultSprayUnits:  'default_spray_units',
}

function coerceColumnValue(apiKey, value) {
  // Acreage columns are REAL — accept empty string / null → NULL,
  // otherwise coerce to a finite number.
  if (apiKey.startsWith('acres')) {
    if (value === '' || value == null) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (apiKey === 'defaultSprayUnits') {
    if (value == null || value === '') return null
    return ALLOWED_SPRAY_UNITS.has(value) ? value : null
  }
  return value
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

  const customJson = body.customCourseAreas !== undefined
    ? JSON.stringify(normalizeCustomAreas(body.customCourseAreas))
    : null

  await env.DB.prepare(`
    INSERT INTO courses (
      id, name, short_name, location, status,
      acres_total, acres_greens, acres_tees, acres_fairways,
      acres_rough, acres_sprayable, acres_practice,
      custom_course_areas, default_spray_units
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.id,
    body.name,
    body.shortName ?? null,
    body.location  ?? null,
    body.status    ?? 'active',
    coerceColumnValue('acresTotal',     body.acresTotal),
    coerceColumnValue('acresGreens',    body.acresGreens),
    coerceColumnValue('acresTees',      body.acresTees),
    coerceColumnValue('acresFairways',  body.acresFairways),
    coerceColumnValue('acresRough',     body.acresRough),
    coerceColumnValue('acresSprayable', body.acresSprayable),
    coerceColumnValue('acresPractice',  body.acresPractice),
    customJson,
    coerceColumnValue('defaultSprayUnits', body.defaultSprayUnits),
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
      binds.push(coerceColumnValue(apiKey, body[apiKey]))
    }
  }
  // JSON column handled separately so we can serialize.
  if (Object.prototype.hasOwnProperty.call(body, 'customCourseAreas')) {
    sets.push('custom_course_areas = ?')
    binds.push(JSON.stringify(normalizeCustomAreas(body.customCourseAreas)))
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
