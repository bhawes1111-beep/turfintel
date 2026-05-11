// Spray records CRUD endpoints (Phase 5.3).
//
// Each spray record is composed of three rows: spray_records (top-level),
// spray_products (1+ rows per record), spray_areas (1+ rows per record).
// The API presents and accepts the nested shape so frontend consumers can
// keep their existing record-with-nested-products view.
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mappers ────────────────────────────────────────────────────────────────

function rowToRecord(row, products = [], areas = []) {
  if (!row) return null
  let holes = []
  if (row.holes) {
    try { holes = JSON.parse(row.holes) } catch { holes = [] }
  }
  return {
    id:              row.id,
    applicationName: row.application_name,
    targetPest:      row.target,
    applicator:      row.operator,
    course:          row.course,
    date:            row.spray_date,
    startTime:       row.start_time,
    endTime:         row.end_time,
    status:          row.status,
    // Conditions reassembled as a nested object (matches existing UI shape).
    conditions: {
      temp:     row.temperature,
      wind:     row.wind,
      humidity: row.humidity,
      soilTemp: row.soil_temp,
    },
    rei:           row.rei,
    phi:           row.phi,
    carrierVolume: row.carrier_volume,
    totalVolume:   row.total_volume,
    holes,
    // First area is exposed as `area` (most UI uses a single area string);
    // the full list is exposed as `areas` for any future multi-area UI.
    area:          areas[0]?.area_name ?? null,
    areas:         areas.map(a => ({
                     id:       a.id,
                     name:     a.area_name,
                     acreage:  a.acreage,
                   })),
    products:      products.map(p => ({
                     id:               p.id,
                     name:             p.product_name,
                     type:             p.product_type,
                     rate:             p.rate,
                     unit:             p.unit,
                     quantityUsed:     p.quantity_used,
                     inventoryItemId:  p.inventory_item_id,
                   })),
    notes:        row.notes,
    courseId:     row.course_id,
    // Phase 5.9 — soft-delete audit fields.
    deletedAt:         row.deleted_at,
    deletedBy:         row.deleted_by,
    inventoryReverted: row.inventory_reverted === 1,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

const MUTABLE_RECORD_COLS = {
  applicationName: 'application_name',
  targetPest:      'target',
  applicator:      'operator',
  course:          'course',
  date:            'spray_date',
  startTime:       'start_time',
  endTime:         'end_time',
  status:          'status',
  rei:             'rei',
  phi:             'phi',
  carrierVolume:   'carrier_volume',
  totalVolume:     'total_volume',
  notes:           'notes',
}

// ── List + Get ────────────────────────────────────────────────────────────

async function fetchProductsForRecords(env, recordIds) {
  if (recordIds.length === 0) return new Map()
  const placeholders = recordIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_products WHERE spray_record_id IN (${placeholders}) ORDER BY created_at ASC`,
  ).bind(...recordIds).all()
  const byRecord = new Map()
  for (const r of results) {
    if (!byRecord.has(r.spray_record_id)) byRecord.set(r.spray_record_id, [])
    byRecord.get(r.spray_record_id).push(r)
  }
  return byRecord
}

async function fetchAreasForRecords(env, recordIds) {
  if (recordIds.length === 0) return new Map()
  const placeholders = recordIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_areas WHERE spray_record_id IN (${placeholders}) ORDER BY created_at ASC`,
  ).bind(...recordIds).all()
  const byRecord = new Map()
  for (const r of results) {
    if (!byRecord.has(r.spray_record_id)) byRecord.set(r.spray_record_id, [])
    byRecord.get(r.spray_record_id).push(r)
  }
  return byRecord
}

export async function listSprays(env, courseId = null) {
  // Phase 5.9 — soft-delete filter. By default, callers see only live
  // applications (deleted_at IS NULL). Audit views can pass an
  // includeDeleted hint via the URL (not currently wired in
  // worker/index.js — surface here for future use).
  const courseFilter = buildCourseFilter(courseId)
  const where = courseFilter.where
    ? `${courseFilter.where} AND deleted_at IS NULL`
    : 'WHERE deleted_at IS NULL'
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM spray_records ${where}
     ORDER BY datetime(spray_date) DESC, created_at DESC`,
  ).bind(...courseFilter.binds).all()
  const ids = rows.map(r => r.id)
  const productsBy = await fetchProductsForRecords(env, ids)
  const areasBy    = await fetchAreasForRecords(env, ids)
  return json(rows.map(r => rowToRecord(r, productsBy.get(r.id) ?? [], areasBy.get(r.id) ?? [])))
}

export async function getSpray(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM spray_records WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Spray record not found')
  const productsBy = await fetchProductsForRecords(env, [id])
  const areasBy    = await fetchAreasForRecords(env, [id])
  return json(rowToRecord(row, productsBy.get(id) ?? [], areasBy.get(id) ?? []))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createSpray(env, request) {
  const body = await readJson(request)
  if (!body.applicator && !body.operator) return badRequest('applicator (operator) is required')

  const id = body.id ?? generateId('spray')

  await env.DB.prepare(`
    INSERT INTO spray_records (
      id, application_name, target, operator, course,
      spray_date, start_time, end_time, status,
      temperature, wind, humidity, soil_temp,
      rei, phi, carrier_volume, total_volume,
      holes, notes, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.applicationName ?? null,
    body.targetPest      ?? body.target      ?? null,
    body.applicator      ?? body.operator    ?? null,
    body.course          ?? null,
    body.date            ?? body.sprayDate   ?? null,
    body.startTime       ?? null,
    body.endTime         ?? null,
    body.status          ?? 'planned',
    body.conditions?.temp     ?? body.temperature ?? null,
    body.conditions?.wind     ?? body.wind        ?? null,
    body.conditions?.humidity ?? body.humidity    ?? null,
    body.conditions?.soilTemp ?? body.soilTemp    ?? null,
    body.rei             ?? null,
    body.phi             ?? null,
    body.carrierVolume   ?? null,
    body.totalVolume     ?? null,
    body.holes != null ? JSON.stringify(body.holes) : null,
    body.notes           ?? null,
    resolveCourseId(body),
  ).run()

  // Products
  if (Array.isArray(body.products)) {
    for (const p of body.products) {
      await env.DB.prepare(`
        INSERT INTO spray_products (
          id, spray_record_id, inventory_item_id,
          product_name, product_type, rate, unit, quantity_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        p.id ?? generateId('sprod'),
        id,
        p.inventoryItemId ?? null,
        p.name ?? p.product_name,
        p.type ?? null,
        p.rate ?? null,
        p.unit ?? null,
        p.quantityUsed ?? null,
      ).run()
    }
  }

  // Areas — accept either body.areas (array of {name, acreage}) or
  // a single body.area string for the common single-area case.
  if (Array.isArray(body.areas)) {
    for (const a of body.areas) {
      await env.DB.prepare(`
        INSERT INTO spray_areas (id, spray_record_id, area_name, acreage)
        VALUES (?, ?, ?, ?)
      `).bind(
        a.id ?? generateId('sarea'),
        id,
        a.name ?? a.area_name,
        a.acreage ?? null,
      ).run()
    }
  } else if (body.area) {
    await env.DB.prepare(`
      INSERT INTO spray_areas (id, spray_record_id, area_name, acreage)
      VALUES (?, ?, ?, ?)
    `).bind(generateId('sarea'), id, body.area, body.acreage ?? null).run()
  }

  return getSpray(env, id)
}

export async function updateSpray(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(MUTABLE_RECORD_COLS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      binds.push(body[apiKey])
    }
  }
  // Conditions (nested) flatten to four columns
  if (body.conditions) {
    if (body.conditions.temp     !== undefined) { sets.push('temperature = ?'); binds.push(body.conditions.temp) }
    if (body.conditions.wind     !== undefined) { sets.push('wind = ?');        binds.push(body.conditions.wind) }
    if (body.conditions.humidity !== undefined) { sets.push('humidity = ?');    binds.push(body.conditions.humidity) }
    if (body.conditions.soilTemp !== undefined) { sets.push('soil_temp = ?');   binds.push(body.conditions.soilTemp) }
  }
  if (body.holes !== undefined) {
    sets.push('holes = ?')
    binds.push(body.holes != null ? JSON.stringify(body.holes) : null)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE spray_records SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Spray record not found')
  return getSpray(env, id)
}

/**
 * Soft-delete a spray application and restore the inventory it consumed.
 *
 * Phase 5.9 — DELETE never removes rows. The sequence is:
 *   1. Fetch the spray record. Refuse if already deleted.
 *   2. Walk inventory_usage WHERE source_id = id AND reverted_at IS NULL.
 *   3. For each row, look up the inventory_items match (by name) and
 *      increment its quantity by quantity_used; mark the usage row
 *      reverted_at = now so the audit shows the reversal.
 *   4. UPDATE spray_records SET status='deleted', deleted_at=now,
 *      deleted_by=<header or 'system'>, inventory_reverted=1.
 *
 * Returns { ok, id, restored: { count, items: [{name, qty}], misses: [...] } }
 * so callers can show "X of Y products restored" feedback.
 *
 * The spray_products / spray_areas cascade is NOT triggered (we keep the
 * record itself for audit). Hard delete is intentionally not supported.
 */
export async function deleteSpray(env, id, request) {
  // 1. Load + guard.
  const row = await env.DB.prepare(
    'SELECT * FROM spray_records WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Spray record not found')
  if (row.deleted_at) return json({ error: 'Spray already deleted' }, 409)

  // 2. Gather live usage rows for this spray.
  const { results: usageRows } = await env.DB.prepare(
    `SELECT * FROM inventory_usage
      WHERE source_id = ? AND reverted_at IS NULL`,
  ).bind(id).all()

  // 3. Restore inventory + mark each usage row reverted.
  const restored = { count: 0, items: [], misses: [] }
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ')
  for (const u of usageRows) {
    // Match by exact name first, fall back to case-insensitive.
    let item = await env.DB.prepare(
      'SELECT id, quantity FROM inventory_items WHERE name = ? LIMIT 1',
    ).bind(u.product_name).first()
    if (!item) {
      item = await env.DB.prepare(
        'SELECT id, quantity FROM inventory_items WHERE LOWER(name) = LOWER(?) LIMIT 1',
      ).bind(u.product_name).first()
    }
    if (item) {
      const restoredQty = (item.quantity ?? 0) + (u.quantity_used ?? 0)
      await env.DB.prepare(
        `UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(restoredQty, item.id).run()
      await env.DB.prepare(
        `UPDATE inventory_usage SET reverted_at = ? WHERE id = ?`,
      ).bind(nowIso, u.id).run()
      restored.count += 1
      restored.items.push({ name: u.product_name, quantity: u.quantity_used })
    } else {
      restored.misses.push(u.product_name)
    }
  }

  // 4. Mark the spray itself deleted. inventory_reverted=1 only if every
  // tracked usage row found a matching item — otherwise leave it 0 so an
  // operator can investigate the misses.
  const fullyReverted = restored.misses.length === 0 ? 1 : 0
  const deletedBy = request?.headers?.get?.('x-deleted-by') ?? 'system'
  const result = await env.DB.prepare(
    `UPDATE spray_records
        SET status = 'deleted',
            deleted_at = datetime('now'),
            deleted_by = ?,
            inventory_reverted = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  ).bind(deletedBy, fullyReverted, id).run()
  if (!result.success || result.meta.changes === 0) {
    return notFound('Spray record not found')
  }

  return json({ ok: true, id, restored })
}
