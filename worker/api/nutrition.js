// Phase: Plant Nutrition Intelligence Foundation — CRUD.
//
// Standalone nutrient applications. Mutation auth is enforced centrally in
// worker/index.js. Course-scoped. Pure storage — the N/P/K snapshot is
// computed by the client calc layer (nutritionTotals.js) so the math stays
// explainable in one place; the worker just persists what it's given.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}

function rowToApp(row) {
  if (!row) return null
  return {
    id:              row.id,
    courseId:        row.course_id,
    applicationDate: row.application_date,
    area:            row.area,
    productId:       row.product_id,
    productName:     row.product_name,
    analysis:        row.analysis,
    rate:            row.rate,
    unit:            row.unit,
    areaAcres:       row.area_acres,
    nLb:             row.n_lb,
    pLb:             row.p_lb,
    kLb:             row.k_lb,
    caLb:            row.ca_lb,
    mgLb:            row.mg_lb,
    sLb:             row.s_lb,
    feLb:            row.fe_lb,
    mnLb:            row.mn_lb,
    source:          row.source,
    sourceSprayId:   row.source_spray_id,
    notes:           row.notes,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

const NUM_FIELDS = {
  rate: 'rate', areaAcres: 'area_acres',
  nLb: 'n_lb', pLb: 'p_lb', kLb: 'k_lb',
  caLb: 'ca_lb', mgLb: 'mg_lb', sLb: 's_lb', feLb: 'fe_lb', mnLb: 'mn_lb',
}
const TEXT_FIELDS = {
  applicationDate: 'application_date', area: 'area', productId: 'product_id',
  productName: 'product_name', analysis: 'analysis', unit: 'unit',
  source: 'source', sourceSprayId: 'source_spray_id', notes: 'notes',
}

// ── List + Get ──────────────────────────────────────────────────────────────

/** GET /api/nutrition?courseId=...&days=N — newest first. */
export async function listNutrition(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) {
      sets.push("application_date >= date('now', ?)")
      all.push(`-${d} days`)
    }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 365, 1), 1000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM nutrition_applications ${whereClause}
     ORDER BY date(application_date) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToApp))
}

export async function getNutrition(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare('SELECT * FROM nutrition_applications WHERE id = ?').bind(id).first()
  if (!row) return notFound('Nutrition application not found')
  return json(rowToApp(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createNutrition(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body.productName || typeof body.productName !== 'string' || body.productName.trim() === '') {
    return badRequest('productName is required')
  }
  const id       = body.id ?? generateId('nut')
  const courseId = resolveCourseId(body)
  const date     = body.applicationDate ?? new Date().toISOString().slice(0, 10)

  await env.DB.prepare(`
    INSERT INTO nutrition_applications (
      id, course_id, application_date, area, product_id, product_name,
      analysis, rate, unit, area_acres,
      n_lb, p_lb, k_lb, ca_lb, mg_lb, s_lb, fe_lb, mn_lb,
      source, source_spray_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, date,
    body.area ?? null, body.productId ?? null, body.productName.trim(),
    body.analysis ?? null, num(body.rate), body.unit ?? null, num(body.areaAcres),
    num(body.nLb), num(body.pLb), num(body.kLb),
    num(body.caLb), num(body.mgLb), num(body.sLb), num(body.feLb), num(body.mnLb),
    body.source ?? 'manual', body.sourceSprayId ?? null, body.notes ?? null,
  ).run()
  return getNutrition(env, id)
}

export async function updateNutrition(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []
  for (const [apiKey, col] of Object.entries(TEXT_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'productName') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('productName cannot be empty')
    }
    sets.push(`${col} = ?`); binds.push(v)
  }
  for (const [apiKey, col] of Object.entries(NUM_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    sets.push(`${col} = ?`); binds.push(num(body[apiKey]))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE nutrition_applications SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Nutrition application not found')
  return getNutrition(env, id)
}

export async function deleteNutrition(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare('DELETE FROM nutrition_applications WHERE id = ?').bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Nutrition application not found')
  return json({ ok: true, id })
}
