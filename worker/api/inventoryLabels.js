// Phase 19 — Inventory Chemical Import Wizard (server side).
//
// The wizard uploads a label PDF (via the existing /api/attachments
// system, parent_type 'inventory_label'), then the user reviews/edits
// the metadata and saves. This module handles:
//
//   POST /api/inventory/import-label/extract  — AI extraction draft.
//        No AI provider is wired yet, so this returns a "not configured"
//        contract the frontend branches on to fall back to manual entry.
//        When an AI binding is added, this is the only function to change.
//
//   POST /api/inventory/import-label/save     — creates the inventory_items
//        row AND the inventory_product_labels row in one request.
//        Duplicate handling via dedupeMode. Admin-key gated upstream.
//
//   GET  /api/inventory/import-label/labels   — course-scoped list of saved
//        labels so the Chemicals tab can surface a "Label PDF" link.
//
// The inventory_items row stays the canonical stock record; the related
// inventory_product_labels row holds the richer regulatory metadata that
// doesn't belong in the lean inventory_items schema.

import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'
import { rowToItem } from './inventory.js'

// ── Mappers ────────────────────────────────────────────────────────────────

function parseJsonArray(raw) {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function rowToLabel(row) {
  if (!row) return null
  return {
    id:                row.id,
    courseId:          row.course_id,
    inventoryItemId:   row.inventory_item_id,
    pdfAttachmentId:   row.pdf_attachment_id,
    productName:       row.product_name,
    manufacturer:      row.manufacturer,
    epaNumber:         row.epa_number,
    activeIngredients: row.active_ingredients,
    signalWord:        row.signal_word,
    restrictedUse:     row.restricted_use === 1,
    reiHours:          row.rei_hours,
    phi:               row.phi,
    fracGroup:         row.frac_group,
    hracGroup:         row.hrac_group,
    iracGroup:         row.irac_group,
    chemicalClass:     row.chemical_class,
    applicationRates:  parseJsonArray(row.application_rates_json),
    targets:           parseJsonArray(row.targets_json),
    turfSites:         row.turf_sites,
    safetyNotes:       row.safety_notes,
    storageNotes:      row.storage_notes,
    labelUrl:          row.label_url,
    pdfUrl:            row.pdf_attachment_id
      ? `/api/attachments/${encodeURIComponent(row.pdf_attachment_id)}/file`
      : null,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

/**
 * The empty draft skeleton the extract endpoint returns when AI is not
 * configured. Keeps the frontend form bound to a stable shape whether
 * the fields come from AI or manual entry.
 */
function emptyDraft() {
  return {
    name:              null,
    kind:              'chemical',
    category:          null,
    unit:              null,
    quantity:          0,
    manufacturer:      null,
    epaNumber:         null,
    activeIngredients: null,
    chemicalClass:     null,
    signalWord:        null,
    restrictedUse:     false,
    reiHours:          null,
    phi:               null,
    fracGroup:         null,
    hracGroup:         null,
    iracGroup:         null,
    applicationRates:  [],
    targets:           [],
    turfSites:         null,
    safetyNotes:       null,
    storageNotes:      null,
    labelUrl:          null,
    notes:             null,
  }
}

// ── Extract ────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/import-label/extract
 * Body: { attachmentId } — the uploaded PDF's attachment id.
 *
 * No AI provider is configured. This returns the contract the frontend
 * branches on: `configured: false` → show the "not configured" state and
 * fall through to manual entry. When a Workers AI / LLM binding is added,
 * branch on it here and populate `draft` from the extraction result.
 */
export async function extractLabelDraft(env, request) {
  const body = await readJson(request)
  return json({
    configured:   false,
    message:      'AI extraction is not configured yet. Enter the label details manually below.',
    attachmentId: body?.attachmentId ?? null,
    draft:        emptyDraft(),
  })
}

// ── Save ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/import-label/save
 *
 * Body: {
 *   courseId?, dedupeMode?, pdfAttachmentId?,
 *   item:  { id?, name, kind, category, unit, quantity, reorderLevel,
 *            costPerUnit, manufacturer, epaNumber, expiryDate,
 *            analysis, nitrogenSource, notes },
 *   label: { productName, manufacturer, epaNumber, activeIngredients,
 *            signalWord, restrictedUse, reiHours, phi, fracGroup,
 *            hracGroup, iracGroup, chemicalClass, applicationRates,
 *            targets, turfSites, safetyNotes, storageNotes, labelUrl,
 *            rawExtraction }
 * }
 *
 * dedupeMode:
 *   'check'  (default) — if an item with the same name exists in the
 *                        course, respond 409 { duplicate, existing } and
 *                        save nothing. The wizard then re-submits with
 *                        'create' or 'update'.
 *   'create'           — always insert a new inventory_items row.
 *   'update'           — update the existing item in place and replace
 *                        its label row.
 */
export async function saveImportedLabel(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)

  const body  = await readJson(request)
  const item  = body?.item
  const label = body?.label ?? {}
  if (!item || typeof item !== 'object') return badRequest('item object is required')
  if (!item.name || !String(item.name).trim()) return badRequest('item.name is required')

  const courseId   = resolveCourseId(body)
  const dedupeMode = body.dedupeMode ?? 'check'

  // Duplicate check — case-insensitive name match within the course.
  const existing = await env.DB.prepare(
    `SELECT * FROM inventory_items WHERE course_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
  ).bind(courseId, item.name).first()

  if (existing && dedupeMode === 'check') {
    return json({
      duplicate: true,
      existing:  rowToItem(existing),
      message:   `An inventory item named "${existing.name}" already exists in this course.`,
    }, 409)
  }

  // ── Resolve the inventory item (create new or update in place) ──────────
  let itemId
  if (existing && dedupeMode === 'update') {
    itemId = existing.id
    await env.DB.prepare(`
      UPDATE inventory_items SET
        kind = ?, name = ?, category = ?, unit = ?, quantity = ?,
        reorder_level = ?, cost_per_unit = ?, notes = ?,
        manufacturer = ?, epa_number = ?, expiry_date = ?,
        analysis = ?, nitrogen_source = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      item.kind ?? 'chemical',
      item.name,
      item.category       ?? null,
      item.unit           ?? null,
      item.quantity       ?? 0,
      item.reorderLevel   ?? null,
      item.costPerUnit    ?? null,
      item.notes          ?? null,
      item.manufacturer   ?? null,
      item.epaNumber      ?? null,
      item.expiryDate     ?? null,
      item.analysis       ?? null,
      item.nitrogenSource ?? null,
      itemId,
    ).run()
  } else {
    // 'create', or 'check' with no existing match. The wizard pre-generates
    // item.id up front so the label PDF could be uploaded keyed to it.
    itemId = item.id ?? generateId('inv')
    await env.DB.prepare(`
      INSERT INTO inventory_items (
        id, kind, name, category, unit, quantity, reorder_level,
        cost_per_unit, notes, manufacturer, epa_number, expiry_date,
        analysis, nitrogen_source, course_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      itemId,
      item.kind ?? 'chemical',
      item.name,
      item.category       ?? null,
      item.unit           ?? null,
      item.quantity       ?? 0,
      item.reorderLevel   ?? null,
      item.costPerUnit    ?? null,
      item.notes          ?? null,
      item.manufacturer   ?? null,
      item.epaNumber      ?? null,
      item.expiryDate     ?? null,
      item.analysis       ?? null,
      item.nitrogenSource ?? null,
      courseId,
    ).run()
  }

  // ── Upsert the label row (one label per item) ──────────────────────────
  await env.DB.prepare(
    `DELETE FROM inventory_product_labels WHERE inventory_item_id = ?`,
  ).bind(itemId).run()

  const labelId = generateId('lbl')
  await env.DB.prepare(`
    INSERT INTO inventory_product_labels (
      id, course_id, inventory_item_id, pdf_attachment_id,
      product_name, manufacturer, epa_number, active_ingredients,
      signal_word, restricted_use, rei_hours, phi,
      frac_group, hrac_group, irac_group, chemical_class,
      application_rates_json, targets_json, turf_sites,
      safety_notes, storage_notes, label_url, raw_extraction_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    labelId,
    courseId,
    itemId,
    body.pdfAttachmentId ?? null,
    label.productName       ?? item.name ?? null,
    label.manufacturer      ?? item.manufacturer ?? null,
    label.epaNumber         ?? item.epaNumber ?? null,
    label.activeIngredients ?? null,
    label.signalWord        ?? null,
    label.restrictedUse ? 1 : 0,
    label.reiHours          ?? null,
    label.phi               ?? null,
    label.fracGroup         ?? null,
    label.hracGroup         ?? null,
    label.iracGroup         ?? null,
    label.chemicalClass     ?? null,
    Array.isArray(label.applicationRates) && label.applicationRates.length > 0
      ? JSON.stringify(label.applicationRates) : null,
    Array.isArray(label.targets) && label.targets.length > 0
      ? JSON.stringify(label.targets) : null,
    label.turfSites    ?? null,
    label.safetyNotes  ?? null,
    label.storageNotes ?? null,
    label.labelUrl     ?? null,
    label.rawExtraction != null ? JSON.stringify(label.rawExtraction) : null,
  ).run()

  const savedItem  = await env.DB.prepare(
    'SELECT * FROM inventory_items WHERE id = ?',
  ).bind(itemId).first()
  const savedLabel = await env.DB.prepare(
    'SELECT * FROM inventory_product_labels WHERE id = ?',
  ).bind(labelId).first()

  return json({
    item:    rowToItem(savedItem),
    label:   rowToLabel(savedLabel),
    updated: !!(existing && dedupeMode === 'update'),
  })
}

// ── List ───────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/import-label/labels?courseId=...
 * Course-scoped, newest first. Used by the Chemicals tab to show a
 * "Label PDF" link on items that were imported through the wizard.
 */
export async function listImportedLabels(env, courseId) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM inventory_product_labels ${where} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToLabel))
}
