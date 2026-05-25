// Phase 7F (1/?) — Spray Program Planner CRUD endpoints.
//
// Programs hold INTENT (what's planned). They never deduct inventory,
// never create spray_records, never mutate product_catalog. The
// linked_spray_record_id column is the plan-vs-actual bridge and stays
// null in this commit; future commits populate it explicitly.
//
// Mutation auth gate (Phase 5.1b) is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

// ── Allowed enum values ────────────────────────────────────────────────────

const PROGRAM_TYPES   = new Set(['greens', 'tees', 'fairways', 'rough', 'landscape', 'custom'])
const PROGRAM_STATUS  = new Set(['draft', 'active', 'archived'])
const PROGRAM_SOURCE  = new Set(['manual', 'imported'])
const ITEM_STATUS     = new Set(['planned', 'completed', 'skipped', 'canceled'])

// ── Mappers ────────────────────────────────────────────────────────────────

export function rowToProgram(row) {
  if (!row) return null
  return {
    id:          row.id,
    courseId:    row.course_id,
    name:        row.name,
    seasonYear:  row.season_year,
    programType: row.program_type,
    status:      row.status,
    notes:       row.notes,
    source:      row.source,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    archivedAt:  row.archived_at,
  }
}

export function rowToItem(row) {
  if (!row) return null
  return {
    id:                  row.id,
    programId:           row.program_id,
    courseId:            row.course_id,
    targetArea:          row.target_area,
    plannedStartDate:    row.planned_start_date,
    plannedEndDate:      row.planned_end_date,
    plannedWindowLabel:  row.planned_window_label,
    productName:         row.product_name,
    inventoryItemId:     row.inventory_item_id,
    productCatalogId:    row.product_catalog_id,
    rateValue:           row.rate_value,
    rateUnit:            row.rate_unit,
    carrierVolumeValue:  row.carrier_volume_value,
    carrierVolumeUnit:   row.carrier_volume_unit,
    applicationNotes:    row.application_notes,
    sortOrder:           row.sort_order,
    status:              row.status,
    linkedSprayRecordId: row.linked_spray_record_id,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  }
}

// Mutable column maps (mirror the inventory pattern). NEITHER map ever
// includes linked_spray_record_id — that linkage is populated only by a
// future narrow endpoint, never via generic PATCH.
const PROGRAM_MUTABLE = {
  name:        'name',
  seasonYear:  'season_year',
  programType: 'program_type',
  status:      'status',
  notes:       'notes',
}

const ITEM_MUTABLE = {
  targetArea:         'target_area',
  plannedStartDate:   'planned_start_date',
  plannedEndDate:     'planned_end_date',
  plannedWindowLabel: 'planned_window_label',
  productName:        'product_name',
  inventoryItemId:    'inventory_item_id',
  productCatalogId:   'product_catalog_id',
  rateValue:          'rate_value',
  rateUnit:           'rate_unit',
  carrierVolumeValue: 'carrier_volume_value',
  carrierVolumeUnit:  'carrier_volume_unit',
  applicationNotes:   'application_notes',
  sortOrder:          'sort_order',
  status:             'status',
}

// ── Validation helpers ─────────────────────────────────────────────────────

async function validateLinkedIds(env, body) {
  // product_catalog_id must be null OR exist in product_catalog.
  if (body.productCatalogId != null && body.productCatalogId !== '') {
    const cat = await env.DB.prepare(
      'SELECT id FROM product_catalog WHERE id = ?',
    ).bind(String(body.productCatalogId)).first()
    if (!cat) return `Unknown productCatalogId: ${body.productCatalogId}`
  }
  // inventory_item_id must be null OR exist in inventory_items.
  if (body.inventoryItemId != null && body.inventoryItemId !== '') {
    const inv = await env.DB.prepare(
      'SELECT id FROM inventory_items WHERE id = ?',
    ).bind(String(body.inventoryItemId)).first()
    if (!inv) return `Unknown inventoryItemId: ${body.inventoryItemId}`
  }
  return null
}

function constrainEnum(value, allowed, fallback) {
  if (value == null || value === '') return fallback
  const v = String(value)
  return allowed.has(v) ? v : fallback
}

// ── Programs CRUD ──────────────────────────────────────────────────────────

export async function listSprayPrograms(env, courseId = null, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets   = where ? [where.replace(/^WHERE\s+/, '')] : []
  const allBinds = [...binds]

  // Status filter: default behavior excludes 'archived' so the planner
  // workspace doesn't bury active/draft programs under archives. Caller
  // can opt in with ?status=archived or ?status=all.
  const status = opts.status ?? 'active-or-draft'
  if (status === 'active-or-draft') {
    sets.push("status != 'archived'")
  } else if (status === 'all') {
    /* no extra filter */
  } else {
    const constrained = constrainEnum(status, PROGRAM_STATUS, null)
    if (constrained) {
      sets.push('status = ?')
      allBinds.push(constrained)
    }
  }

  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_programs
     ${whereClause}
     ORDER BY status ASC, season_year DESC, created_at DESC`,
  ).bind(...allBinds).all()
  return json((results ?? []).map(rowToProgram))
}

export async function getSprayProgram(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM spray_programs WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Spray program not found')
  return json(rowToProgram(row))
}

export async function createSprayProgram(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body?.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return badRequest('name is required')
  }

  const id = body.id ?? generateId('sprog')
  const programType = constrainEnum(body.programType, PROGRAM_TYPES, null)
  const status      = constrainEnum(body.status, PROGRAM_STATUS, 'draft')
  const source      = constrainEnum(body.source, PROGRAM_SOURCE, 'manual')

  await env.DB.prepare(`
    INSERT INTO spray_programs (
      id, course_id, name, season_year, program_type, status, notes, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    resolveCourseId(body),
    body.name.trim(),
    Number.isFinite(body.seasonYear) ? Math.trunc(body.seasonYear) : null,
    programType,
    status,
    body.notes ?? null,
    source,
  ).run()

  return getSprayProgram(env, id)
}

export async function updateSprayProgram(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  const sets  = []
  const binds = []

  for (const [apiKey, dbCol] of Object.entries(PROGRAM_MUTABLE)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'status'      && value != null) value = constrainEnum(value, PROGRAM_STATUS, 'draft')
    if (apiKey === 'programType' && value != null) value = constrainEnum(value, PROGRAM_TYPES, null)
    if (apiKey === 'name' && (typeof value !== 'string' || value.trim() === '')) {
      return badRequest('name cannot be empty')
    }
    if (apiKey === 'name') value = value.trim()
    if (apiKey === 'seasonYear' && value != null) {
      value = Number.isFinite(value) ? Math.trunc(value) : null
    }
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push("updated_at = datetime('now')")
  binds.push(id)

  const result = await env.DB.prepare(
    `UPDATE spray_programs SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Spray program not found')
  return getSprayProgram(env, id)
}

// Soft-archive — keep the row and its items for audit / reactivation.
// Matches the spray_records soft-delete pattern (never hard-delete here).
export async function archiveSprayProgram(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT id FROM spray_programs WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Spray program not found')

  await env.DB.prepare(`
    UPDATE spray_programs
       SET status      = 'archived',
           archived_at = datetime('now'),
           updated_at  = datetime('now')
     WHERE id = ?
  `).bind(id).run()

  return getSprayProgram(env, id)
}

// ── Items CRUD ─────────────────────────────────────────────────────────────

export async function listSprayProgramItems(env, programId) {
  if (!env.DB) return json([])
  // Validate the program exists before returning anything — keeps 404
  // semantics consistent with /api/spray-programs/:id.
  const program = await env.DB.prepare(
    'SELECT id FROM spray_programs WHERE id = ?',
  ).bind(programId).first()
  if (!program) return notFound('Spray program not found')

  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_program_items
      WHERE program_id = ?
      ORDER BY sort_order ASC, created_at ASC`,
  ).bind(programId).all()
  return json((results ?? []).map(rowToItem))
}

export async function getSprayProgramItem(env, itemId) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM spray_program_items WHERE id = ?',
  ).bind(itemId).first()
  if (!row) return notFound('Spray program item not found')
  return json(rowToItem(row))
}

export async function createSprayProgramItem(env, programId, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)

  // Program must exist (and is the only field client cannot override).
  const program = await env.DB.prepare(
    'SELECT id, course_id FROM spray_programs WHERE id = ?',
  ).bind(programId).first()
  if (!program) return notFound('Spray program not found')

  // Validate optional linkage ids.
  const linkErr = await validateLinkedIds(env, body)
  if (linkErr) return badRequest(linkErr)

  const id = body.id ?? generateId('sprogi')
  const status = constrainEnum(body.status, ITEM_STATUS, 'planned')

  await env.DB.prepare(`
    INSERT INTO spray_program_items (
      id, program_id, course_id,
      target_area, planned_start_date, planned_end_date, planned_window_label,
      product_name, inventory_item_id, product_catalog_id,
      rate_value, rate_unit, carrier_volume_value, carrier_volume_unit,
      application_notes, sort_order, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    programId,
    program.course_id ?? resolveCourseId(body),
    body.targetArea         ?? null,
    body.plannedStartDate   ?? null,
    body.plannedEndDate     ?? null,
    body.plannedWindowLabel ?? null,
    body.productName        ?? null,
    body.inventoryItemId    ?? null,
    body.productCatalogId   ?? null,
    Number.isFinite(body.rateValue)           ? body.rateValue           : null,
    body.rateUnit           ?? null,
    Number.isFinite(body.carrierVolumeValue)  ? body.carrierVolumeValue  : null,
    body.carrierVolumeUnit  ?? null,
    body.applicationNotes   ?? null,
    Number.isFinite(body.sortOrder)           ? Math.trunc(body.sortOrder) : 0,
    status,
  ).run()

  return getSprayProgramItem(env, id)
}

export async function updateSprayProgramItem(env, itemId, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)

  // Validate linkage ids on a per-field basis.
  const linkErr = await validateLinkedIds(env, body)
  if (linkErr) return badRequest(linkErr)

  const sets  = []
  const binds = []
  for (const [apiKey, dbCol] of Object.entries(ITEM_MUTABLE)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let value = body[apiKey]
    if (apiKey === 'status' && value != null) value = constrainEnum(value, ITEM_STATUS, 'planned')
    sets.push(`${dbCol} = ?`)
    binds.push(value)
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push("updated_at = datetime('now')")
  binds.push(itemId)

  const result = await env.DB.prepare(
    `UPDATE spray_program_items SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Spray program item not found')
  return getSprayProgramItem(env, itemId)
}

export async function deleteSprayProgramItem(env, itemId) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare(
    'DELETE FROM spray_program_items WHERE id = ?',
  ).bind(itemId).run()
  if (!result.success || result.meta.changes === 0) return notFound('Spray program item not found')
  return json({ ok: true, id: itemId })
}
