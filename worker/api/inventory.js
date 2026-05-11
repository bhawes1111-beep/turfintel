// Inventory CRUD endpoints (Phase 5.2).
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mappers ────────────────────────────────────────────────────────────────

function rowToItem(row) {
  if (!row) return null
  let relatedUsage = []
  if (row.related_usage) {
    try { relatedUsage = JSON.parse(row.related_usage) } catch { relatedUsage = [] }
  }
  return {
    id:           row.id,
    kind:         row.kind,
    name:         row.name,
    category:     row.category,
    unit:         row.unit,
    quantity:     row.quantity,
    reorderLevel: row.reorder_level,
    location:     row.location,
    vendor:       row.vendor,
    costPerUnit:  row.cost_per_unit,
    notes:        row.notes,
    // Kind-specific (only populated for the relevant kind)
    manufacturer:  row.manufacturer,
    epaNumber:     row.epa_number,
    expiryDate:    row.expiry_date,
    partNumber:    row.part_number,
    equipment:     row.equipment,
    analysis:      row.analysis,
    tankCapacity:  row.tank_capacity,
    currentLevel:  row.current_level,
    lastFill:      row.last_fill,
    relatedUsage,
    courseId:     row.course_id,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

function rowToUsage(row) {
  if (!row) return null
  return {
    id:            row.id,
    productName:   row.product_name,
    quantityUsed:  row.quantity_used,
    unit:          row.unit,
    sourceId:      row.source_id,
    date:          row.date,
    area:          row.area,
    applicator:    row.applicator,
    courseId:      row.course_id,
    createdAt:     row.created_at,
  }
}

const MUTABLE_COLUMNS = {
  kind:         'kind',
  name:         'name',
  category:     'category',
  unit:         'unit',
  quantity:     'quantity',
  reorderLevel: 'reorder_level',
  location:     'location',
  vendor:       'vendor',
  costPerUnit:  'cost_per_unit',
  notes:        'notes',
  manufacturer: 'manufacturer',
  epaNumber:    'epa_number',
  expiryDate:   'expiry_date',
  partNumber:   'part_number',
  equipment:    'equipment',
  analysis:     'analysis',
  tankCapacity: 'tank_capacity',
  currentLevel: 'current_level',
  lastFill:     'last_fill',
  relatedUsage: 'related_usage',   // JSON-stringified below
}

// ── Items: CRUD ────────────────────────────────────────────────────────────

export async function listInventory(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM inventory_items ${where} ORDER BY kind ASC, name ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToItem))
}

export async function getInventory(env, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM inventory_items WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Inventory item not found')
  return json(rowToItem(row))
}

export async function createInventory(env, request) {
  const body = await readJson(request)
  if (!body.kind) return badRequest('kind is required')
  if (!body.name) return badRequest('name is required')

  const id = body.id ?? generateId('inv')

  await env.DB.prepare(`
    INSERT INTO inventory_items (
      id, kind, name, category, unit, quantity, reorder_level,
      location, vendor, cost_per_unit, notes,
      manufacturer, epa_number, expiry_date,
      part_number, equipment,
      analysis,
      tank_capacity, current_level, last_fill,
      related_usage, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.kind,
    body.name,
    body.category     ?? null,
    body.unit         ?? null,
    body.quantity     ?? 0,
    body.reorderLevel ?? null,
    body.location     ?? null,
    body.vendor       ?? null,
    body.costPerUnit  ?? null,
    body.notes        ?? null,
    body.manufacturer ?? null,
    body.epaNumber    ?? null,
    body.expiryDate   ?? null,
    body.partNumber   ?? null,
    body.equipment    ?? null,
    body.analysis     ?? null,
    body.tankCapacity ?? null,
    body.currentLevel ?? null,
    body.lastFill     ?? null,
    body.relatedUsage != null ? JSON.stringify(body.relatedUsage) : null,
    resolveCourseId(body),
  ).run()

  return getInventory(env, id)
}

export async function updateInventory(env, id, request) {
  const body = await readJson(request)
  const sets = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(MUTABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(body, apiKey)) {
      sets.push(`${dbCol} = ?`)
      let value = body[apiKey]
      if (apiKey === 'relatedUsage' && value != null) value = JSON.stringify(value)
      binds.push(value)
    }
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  sets.push(`updated_at = datetime('now')`)
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE inventory_items SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()

  if (!result.success || result.meta.changes === 0) return notFound('Inventory item not found')
  return getInventory(env, id)
}

export async function deleteInventory(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM inventory_items WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Inventory item not found')
  return json({ ok: true, id })
}

// ── Usage: list + atomic record ────────────────────────────────────────────

export async function listInventoryUsage(env, courseId = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM inventory_usage ${where} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToUsage))
}

/**
 * POST /api/inventory/usage
 *
 * Atomic: (1) finds the matching inventory_item by name (case-insensitive),
 * (2) decrements its quantity (floored at 0), (3) inserts the usage record.
 * Returns { item: updatedOrNull, usage }.
 *
 * If no matching item is found, the usage record is still inserted (the
 * spray sheet may reference products not yet in inventory). item is null.
 */
export async function recordInventoryUsage(env, request) {
  const body = await readJson(request)
  if (!body.productName)         return badRequest('productName is required')
  if (body.quantityUsed == null) return badRequest('quantityUsed is required')

  const usageId = body.id ?? generateId('use')

  // 1. Find matching item — exact name first, then case-insensitive.
  let item = await env.DB.prepare(
    'SELECT * FROM inventory_items WHERE name = ? LIMIT 1',
  ).bind(body.productName).first()
  if (!item) {
    item = await env.DB.prepare(
      'SELECT * FROM inventory_items WHERE LOWER(name) = LOWER(?) LIMIT 1',
    ).bind(body.productName).first()
  }

  // 2. Decrement quantity if item found.
  let updatedItem = null
  if (item) {
    const newQty = Math.max(0, (item.quantity ?? 0) - body.quantityUsed)
    await env.DB.prepare(
      `UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(newQty, item.id).run()
    const fresh = await env.DB.prepare(
      'SELECT * FROM inventory_items WHERE id = ?',
    ).bind(item.id).first()
    updatedItem = rowToItem(fresh)
  }

  // 3. Record usage.
  await env.DB.prepare(`
    INSERT INTO inventory_usage (
      id, product_name, quantity_used, unit, source_id, date, area, applicator, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    usageId,
    body.productName,
    body.quantityUsed,
    body.unit       ?? null,
    body.sourceId   ?? null,
    body.date       ?? null,
    body.area       ?? null,
    body.applicator ?? null,
    resolveCourseId(body),
  ).run()

  const usageRow = await env.DB.prepare(
    'SELECT * FROM inventory_usage WHERE id = ?',
  ).bind(usageId).first()

  return json({ item: updatedItem, usage: rowToUsage(usageRow) })
}
