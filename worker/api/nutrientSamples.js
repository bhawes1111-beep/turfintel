import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const SAMPLE_TYPES = new Set(['soil', 'tissue'])
const NUTRIENTS = new Set(['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Fe', 'Mn', 'Zn', 'Cu', 'B', 'Mo', 'Cl', 'Ni'])
const RESULT_ANALYTES = new Set([...NUTRIENTS, 'Na', 'Si', 'pH', 'CEC', 'OM', 'EC', 'SAR'])
const RESULT_UNITS = new Set(['ppm', '%', 'meq/100g', 'lb/acre', 'index', 'pH', 'dS/m'])
const RATINGS = new Set(['', 'low', 'adequate', 'high', 'excessive'])

function parseArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function finite(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function cleanResults(value) {
  return parseArray(value).map(row => ({
    nutrient: RESULT_ANALYTES.has(row?.nutrient) ? row.nutrient : null,
    value: finite(row?.value),
    unit: RESULT_UNITS.has(row?.unit) ? row.unit : 'ppm',
    rating: RATINGS.has(row?.rating ?? '') ? (row.rating ?? '') : '',
  })).filter(row => row.nutrient && row.value != null)
}

function cleanRecommendations(value) {
  return parseArray(value).map(row => ({
    nutrient: NUTRIENTS.has(row?.nutrient) ? row.nutrient : null,
    rateLbPer1000: finite(row?.rateLbPer1000),
    note: typeof row?.note === 'string' ? row.note.trim() : '',
  })).filter(row => row.nutrient && row.rateLbPer1000 != null && row.rateLbPer1000 >= 0)
}

function cleanOptionalDate(value) {
  if (value == null || value === '') return null
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function rowToSample(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    sampleType: row.sample_type,
    sampleDate: row.sample_date,
    location: row.location,
    areaType: row.area_type,
    labName: row.lab_name,
    labSampleId: row.lab_sample_id,
    depthInches: row.depth_inches,
    previousSampleId: row.previous_sample_id ?? null,
    nextSampleDate: row.next_sample_date ?? null,
    results: cleanResults(row.results_json),
    recommendations: cleanRecommendations(row.recommendations_json),
    notes: row.notes,
    sourceAttachmentId: row.source_attachment_id,
    sourcePdfUrl: row.source_attachment_id
      ? `/api/attachments/${encodeURIComponent(row.source_attachment_id)}/file`
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function validate(body) {
  if (!SAMPLE_TYPES.has(body.sampleType)) return `sampleType must be soil or tissue`
  if (typeof body.sampleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.sampleDate)) return 'sampleDate is required'
  if (typeof body.location !== 'string' || !body.location.trim()) return 'location is required'
  if (body.nextSampleDate && !cleanOptionalDate(body.nextSampleDate)) return 'nextSampleDate must be YYYY-MM-DD'
  if (body.nextSampleDate && body.nextSampleDate < body.sampleDate) return 'nextSampleDate cannot be before sampleDate'
  return null
}

async function validatePreviousSample(env, previousSampleId, courseId, sampleType, sampleDate, selfId = null) {
  const previousId = typeof previousSampleId === 'string' ? previousSampleId.trim() : ''
  if (!previousId) return null
  if (selfId && previousId === selfId) return 'previousSampleId cannot reference the same sample'
  const previous = await env.DB.prepare(
    'SELECT id, sample_type, sample_date FROM turf_nutrient_samples WHERE id = ? AND course_id = ?',
  ).bind(previousId, courseId).first()
  if (!previous) return 'previousSampleId must reference a sample from this course'
  if (previous.sample_type !== sampleType) return 'Follow-up samples must use the same sample type'
  if (previous.sample_date >= sampleDate) return 'A follow-up sample must be dated after its previous sample'
  return null
}

export async function listNutrientSamples(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const clauses = where ? [where.replace('WHERE ', '')] : []
  if (opts.sampleType && SAMPLE_TYPES.has(opts.sampleType)) {
    clauses.push('sample_type = ?'); binds.push(opts.sampleType)
  }
  const suffix = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM turf_nutrient_samples ${suffix} ORDER BY sample_date DESC, created_at DESC`,
  ).bind(...binds).all()
  return json((results ?? []).map(rowToSample))
}

export async function getNutrientSample(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare('SELECT * FROM turf_nutrient_samples WHERE id = ?').bind(id).first()
  return row ? json(rowToSample(row)) : notFound('Nutrient sample not found')
}

export async function createNutrientSample(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  const error = validate(body)
  if (error) return badRequest(error)
  const id = body.id ?? generateId('ns')
  const courseId = resolveCourseId(body)
  const previousError = await validatePreviousSample(
    env, body.previousSampleId, courseId, body.sampleType, body.sampleDate, id,
  )
  if (previousError) return badRequest(previousError)
  await env.DB.prepare(`
    INSERT INTO turf_nutrient_samples (
      id, course_id, sample_type, sample_date, location, area_type,
      lab_name, lab_sample_id, depth_inches, previous_sample_id, next_sample_date,
      results_json, recommendations_json, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, body.sampleType, body.sampleDate, body.location.trim(),
    body.areaType || null, body.labName || null, body.labSampleId || null,
    finite(body.depthInches), body.previousSampleId?.trim() || null, cleanOptionalDate(body.nextSampleDate),
    JSON.stringify(cleanResults(body.results)),
    JSON.stringify(cleanRecommendations(body.recommendations)), body.notes || null,
  ).run()
  return getNutrientSample(env, id)
}

export async function updateNutrientSample(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const current = await env.DB.prepare('SELECT * FROM turf_nutrient_samples WHERE id = ?').bind(id).first()
  if (!current) return notFound('Nutrient sample not found')
  const body = await readJson(request)
  const merged = { ...rowToSample(current), ...body }
  const error = validate(merged)
  if (error) return badRequest(error)
  const previousError = await validatePreviousSample(
    env, merged.previousSampleId, current.course_id, merged.sampleType, merged.sampleDate, id,
  )
  if (previousError) return badRequest(previousError)
  await env.DB.prepare(`
    UPDATE turf_nutrient_samples SET
      sample_type = ?, sample_date = ?, location = ?, area_type = ?, lab_name = ?,
      lab_sample_id = ?, depth_inches = ?, previous_sample_id = ?, next_sample_date = ?,
      results_json = ?, recommendations_json = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    merged.sampleType, merged.sampleDate, merged.location.trim(), merged.areaType || null,
    merged.labName || null, merged.labSampleId || null, finite(merged.depthInches),
    merged.previousSampleId?.trim() || null, cleanOptionalDate(merged.nextSampleDate),
    JSON.stringify(cleanResults(merged.results)), JSON.stringify(cleanRecommendations(merged.recommendations)),
    merged.notes || null, id,
  ).run()
  return getNutrientSample(env, id)
}

export async function deleteNutrientSample(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare('DELETE FROM turf_nutrient_samples WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Nutrient sample not found')
  return json({ ok: true })
}
