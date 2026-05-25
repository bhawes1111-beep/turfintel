// Inventory CRUD endpoints (Phase 5.2).
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Mappers ────────────────────────────────────────────────────────────────

export function rowToItem(row) {
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
    analysis:        row.analysis,
    nitrogenSource:  row.nitrogen_source,
    tankCapacity:    row.tank_capacity,
    currentLevel:  row.current_level,
    lastFill:      row.last_fill,
    relatedUsage,
    // Phase 7C.1 (5/6) — read-only catalog linkage. The column was added
    // by migration 0043 and is nullable; not in MUTABLE_COLUMNS because
    // no UI / API path can write it in this phase (no manual link wizard,
    // no auto-link). Surfacing it lets the inventory tabs render the
    // 📋 Catalog chip on rows whose import already populated it.
    productCatalogId: row.product_catalog_id ?? null,
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
  analysis:       'analysis',
  nitrogenSource: 'nitrogen_source',
  tankCapacity:   'tank_capacity',
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
      analysis, nitrogen_source,
      tank_capacity, current_level, last_fill,
      related_usage, course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.kind,
    body.name,
    body.category       ?? null,
    body.unit           ?? null,
    body.quantity       ?? 0,
    body.reorderLevel   ?? null,
    body.location       ?? null,
    body.vendor         ?? null,
    body.costPerUnit    ?? null,
    body.notes          ?? null,
    body.manufacturer   ?? null,
    body.epaNumber      ?? null,
    body.expiryDate     ?? null,
    body.partNumber     ?? null,
    body.equipment      ?? null,
    body.analysis       ?? null,
    body.nitrogenSource ?? null,
    body.tankCapacity   ?? null,
    body.currentLevel   ?? null,
    body.lastFill       ?? null,
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

// ── Phase 7C.2 (1/?) — narrow catalog-link patch ───────────────────────────
//
// PATCH /api/inventory/:id/catalog-link
// Body: { productCatalogId: string | null }
//
// The ONE write path into inventory_items.product_catalog_id. Lives off
// MUTABLE_COLUMNS on purpose:
//   - keeps the generic PATCH /api/inventory/:id handler small and
//     unchanged (the catalog FK was never intended as a bulk-editable
//     field on the item form);
//   - lets us validate the productCatalogId against product_catalog
//     before persisting — so a typo'd id can't orphan an inventory row;
//   - keeps the spec's "single narrow endpoint" requirement explicit.
//
// Read-only product_catalog stays read-only: this handler runs a SELECT
// against it (to validate existence) but never writes.
export async function patchInventoryCatalogLink(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)

  // Body must include the key, even if null. Defending against an empty
  // PATCH that would silently no-op the link.
  if (!Object.prototype.hasOwnProperty.call(body, 'productCatalogId')) {
    return badRequest("Body must include 'productCatalogId' (string | null)")
  }
  const raw = body.productCatalogId
  const productCatalogId = (raw === null || raw === '') ? null
    : typeof raw === 'string' ? raw.trim() || null
    : null

  // Inventory row must exist (course scoping continues to flow via the
  // FK on the row itself — we don't widen the read here).
  const inv = await env.DB.prepare(
    'SELECT id FROM inventory_items WHERE id = ?',
  ).bind(id).first()
  if (!inv) return notFound('Inventory item not found')

  // If linking (not unlinking), require the catalog row to exist. This
  // is the hard guarantee against stale/typo'd FKs landing in the DB.
  if (productCatalogId !== null) {
    const cat = await env.DB.prepare(
      'SELECT id FROM product_catalog WHERE id = ?',
    ).bind(productCatalogId).first()
    if (!cat) return badRequest(`Unknown productCatalogId: ${productCatalogId}`)
  }

  const result = await env.DB.prepare(
    `UPDATE inventory_items
       SET product_catalog_id = ?,
           updated_at         = datetime('now')
     WHERE id = ?`,
  ).bind(productCatalogId, id).run()

  if (!result.success || result.meta.changes === 0) {
    return notFound('Inventory item not found')
  }
  return getInventory(env, id)
}

// Phase 27D — cascade cleanup on delete.
//
// inventory_product_labels and operational_attachments don't have FK
// constraints back to inventory_items (D1 schema kept lean), so a plain
// DELETE used to leave both an orphan label row and an orphan R2 PDF
// behind. We now clean both up in the same handler:
//
//   1. Collect any label rows for this item, capture their pdf_attachment_id.
//   2. Delete the label rows.
//   3. For each captured PDF attachment id, soft-delete the metadata row
//      and hard-delete the R2 object (matching the soft-delete pattern
//      already used by /api/attachments/:id DELETE).
//   4. Delete the inventory item itself.
//
// Failures past step 1 are logged but don't abort — leaving an extra
// R2 object is preferable to leaving the inventory item alive when the
// caller asked to delete it. Returns the cleanup summary so the caller
// can surface "deleted X with N attachments" if useful.

export async function deleteInventory(env, id) {
  // 1+2: gather + delete label rows; capture pdf_attachment_id values.
  let labelAttachmentIds = []
  let labelRowsDeleted   = 0
  try {
    const { results } = await env.DB.prepare(
      'SELECT pdf_attachment_id FROM inventory_product_labels WHERE inventory_item_id = ?',
    ).bind(id).all()
    labelAttachmentIds = (results ?? [])
      .map(r => r.pdf_attachment_id)
      .filter(v => typeof v === 'string' && v.length > 0)

    const labelDel = await env.DB.prepare(
      'DELETE FROM inventory_product_labels WHERE inventory_item_id = ?',
    ).bind(id).run()
    labelRowsDeleted = labelDel.meta?.changes ?? 0
  } catch (err) {
    console.warn('[deleteInventory] label-row cleanup failed:', err?.message)
  }

  // 3: soft-delete each PDF attachment + best-effort R2 object delete.
  let attachmentsCleaned = 0
  for (const attId of labelAttachmentIds) {
    try {
      const row = await env.DB.prepare(
        'SELECT r2_key FROM operational_attachments WHERE id = ? AND status = ?',
      ).bind(attId, 'active').first()
      if (row?.r2_key && env.PHOTOS) {
        try { await env.PHOTOS.delete(row.r2_key) } catch { /* best-effort cleanup */ }
      }
      await env.DB.prepare(
        `UPDATE operational_attachments SET status = 'deleted' WHERE id = ?`,
      ).bind(attId).run()
      attachmentsCleaned++
    } catch (err) {
      console.warn(`[deleteInventory] attachment ${attId} cleanup failed:`, err?.message)
    }
  }

  // 4: delete the inventory item.
  const result = await env.DB.prepare(
    'DELETE FROM inventory_items WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Inventory item not found')

  return json({
    ok: true,
    id,
    cleanup: {
      labelRowsDeleted,
      attachmentsCleaned,
    },
  })
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
