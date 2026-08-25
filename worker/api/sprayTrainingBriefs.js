import { extractText, getDocumentProxy } from 'unpdf'
import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { resolveCourseId } from '../lib/scope.js'
import { resolveActor, actorCanAccessCourse, actorHasPermission } from '../lib/actor.js'
import {
  TRAINING_BRIEF_STATUSES,
  TRAINING_SOURCE_TYPES,
  DEFAULT_TRAINING_CHECKLISTS,
  validateTrainingUpload,
  sanitizeTrainingFileName,
  normalizeApplicationSnapshot,
  normalizeProductSnapshot,
  normalizeInstructionsSnapshot,
  normalizeChecklists,
  findCriticalSafetyGaps,
  buildTrainingNarrative,
  buildKnowledgeCheck,
  scoreKnowledgeResponses,
  buildApprovedSnapshot,
} from '../lib/sprayTrainingBriefs.js'

const EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

function actorName(actor) {
  return actor?.display_name || actor?.displayName || actor?.email || (actor?.automation ? 'Automation' : 'Manager')
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function prettyIngredients(raw) {
  const parsed = parseJson(raw, raw)
  if (Array.isArray(parsed)) {
    return parsed.map(item => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      return [item.name || item.ingredient, item.percent || item.percentage].filter(Boolean).join(' ')
    }).filter(Boolean).join(', ')
  }
  return asText(parsed)
}

function normalizeQuestions(value, application, products) {
  if (!Array.isArray(value)) return buildKnowledgeCheck(application, products)
  return value.slice(0, 5).map((question, index) => ({
    id: asText(question?.id) || `question-${index + 1}`,
    prompt: asText(question?.prompt),
    answer: asText(question?.answer),
  }))
}

function rowToBrief(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    sourceType: row.source_type,
    sourceRecordId: row.source_record_id,
    sourceAttachmentId: row.source_attachment_id,
    sourceDocumentUrl: row.source_attachment_id
      ? `/api/attachments/${encodeURIComponent(row.source_attachment_id)}/file`
      : null,
    status: row.status,
    title: row.title,
    application: parseJson(row.application_snapshot_json, {}),
    products: parseJson(row.products_snapshot_json, []),
    instructions: parseJson(row.instructions_snapshot_json, {}),
    checklists: parseJson(row.checklist_snapshot_json, DEFAULT_TRAINING_CHECKLISTS),
    knowledgeCheck: parseJson(row.knowledge_check_json, []),
    missingFields: parseJson(row.missing_fields_json, []),
    managerEdits: parseJson(row.manager_edits_json, {}),
    approvedSnapshot: parseJson(row.approved_snapshot_json, null),
    approvedVersion: Number(row.approved_version) || 0,
    extractionStatus: row.extraction_status,
    extractionNote: row.extraction_note,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    approvedByUserId: row.approved_by_user_id,
    approvedByName: row.approved_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    archivedAt: row.archived_at,
  }
}

function rowToAcknowledgment(row) {
  return {
    id: row.id,
    briefId: row.brief_id,
    briefVersion: row.brief_version,
    userId: row.user_id,
    assistantName: row.assistant_name,
    responses: parseJson(row.responses_json, []),
    score: row.score,
    totalQuestions: row.total_questions,
    acknowledged: row.acknowledged === 1,
    completedAt: row.completed_at,
    acknowledgedAt: row.acknowledged_at,
  }
}

async function getBriefRow(env, id) {
  return env.DB.prepare('SELECT * FROM spray_training_briefs WHERE id = ?').bind(id).first()
}

async function authorizeBriefRead(env, request, row) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorCanAccessCourse(actor, row?.course_id)) return { actor: null, allow: false }
  const manager = actorHasPermission(actor, 'canEditSprays')
  const assistantVisible = row.status === 'ready_for_training' || row.status === 'reviewed'
  return { actor, manager, allow: manager || assistantVisible }
}

async function catalogForIdentity(env, product) {
  let catalogId = asText(product.productCatalogId)
  if (!catalogId && product.inventoryItemId) {
    const inventory = await env.DB.prepare(
      'SELECT product_catalog_id FROM inventory_items WHERE id = ?',
    ).bind(product.inventoryItemId).first()
    catalogId = asText(inventory?.product_catalog_id)
  }
  if (!catalogId) return null
  return env.DB.prepare('SELECT * FROM product_catalog WHERE id = ?').bind(catalogId).first()
}

async function enrichProducts(env, rawProducts) {
  const products = []
  for (const raw of rawProducts ?? []) {
    const catalog = await catalogForIdentity(env, raw)
    products.push(normalizeProductSnapshot({
      ...raw,
      productCatalogId: raw.productCatalogId || catalog?.id,
      name: raw.name || raw.productName || catalog?.product_name,
      category: raw.category || raw.type || catalog?.category,
      activeIngredient: raw.activeIngredient || raw.activeIngredientsSnapshot || prettyIngredients(catalog?.active_ingredients_json),
      fracGroup: raw.fracGroup || catalog?.frac_group,
      hracGroup: raw.hracGroup || catalog?.hrac_group,
      iracGroup: raw.iracGroup || catalog?.irac_group,
      labelUrl: raw.labelUrl || catalog?.label_url,
      source: raw.source || catalog?.source,
      signalWord: raw.signalWord || catalog?.signal_word,
      reiHours: raw.reiHours ?? catalog?.rei_hours,
      phiHours: raw.phiHours ?? catalog?.phi_hours,
      restrictedUse: raw.restrictedUse ?? (catalog?.restricted_use === 1),
      verificationStatus: raw.verificationStatus || 'unverified',
    }))
  }
  return products
}

function firstNumber(value) {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

async function sourceFromSprayRecord(env, courseId, id) {
  const row = await env.DB.prepare(
    'SELECT * FROM spray_records WHERE id = ? AND course_id = ? AND deleted_at IS NULL',
  ).bind(id, courseId).first()
  if (!row) return null
  const { results: productRows } = await env.DB.prepare(
    'SELECT * FROM spray_products WHERE spray_record_id = ? ORDER BY created_at ASC',
  ).bind(id).all()
  const { results: areaRows } = await env.DB.prepare(
    'SELECT * FROM spray_areas WHERE spray_record_id = ? ORDER BY created_at ASC',
  ).bind(id).all()
  const products = await enrichProducts(env, productRows.map(product => ({
    inventoryItemId: product.inventory_item_id,
    name: product.product_name,
    category: product.product_type,
    activeIngredient: product.active_ingredients_snapshot,
    rate: product.rate,
    rateUnit: product.unit,
    totalAmount: product.quantity_used,
    totalUnit: product.unit,
    signalWord: null,
    reiHours: row.rei,
    phiHours: row.phi,
  })))
  const areas = areaRows.map(area => ({ name: area.area_name, acreage: area.acreage }))
  const acreage = areas.reduce((sum, area) => sum + (Number(area.acreage) || 0), 0) || null
  const weather = [
    row.temperature != null ? `${row.temperature} F` : '',
    row.humidity != null ? `${row.humidity}% RH` : '',
    row.wind_speed_mph != null ? `${row.wind_speed_mph} mph ${row.wind_direction || ''}`.trim() : row.wind,
  ].filter(Boolean).join(' | ')
  return {
    title: row.application_name || `${areas[0]?.name || 'Application'} training brief`,
    application: normalizeApplicationSnapshot({
      name: row.application_name,
      applicationType: row.application_type,
      plannedDate: row.spray_date,
      startTime: row.start_time,
      endTime: row.end_time,
      areas,
      acreage,
      target: row.target,
      equipment: row.equipment_name,
      gpa: firstNumber(row.carrier_volume),
      tankVolume: row.tank_capacity || row.total_volume,
      loads: row.tank_capacity && row.total_volume ? Math.ceil(row.total_volume / row.tank_capacity) : null,
      operator: row.operator,
      weather,
      objective: row.target,
      managerNotes: row.notes,
    }),
    products,
    instructions: normalizeInstructionsSnapshot({
      sprayer: row.equipment_name,
      waterVolume: row.carrier_volume,
      observations: row.notes,
    }),
  }
}

async function sourceFromPlannedProgram(env, courseId, id) {
  const program = await env.DB.prepare(
    'SELECT * FROM spray_programs WHERE id = ? AND course_id = ?',
  ).bind(id, courseId).first()
  if (!program) return null
  const { results: items } = await env.DB.prepare(
    `SELECT * FROM spray_program_items
      WHERE program_id = ? AND course_id = ? AND status NOT IN ('skipped', 'canceled')
      ORDER BY sort_order ASC, created_at ASC`,
  ).bind(id, courseId).all()
  const products = await enrichProducts(env, items.map(item => ({
    inventoryItemId: item.inventory_item_id,
    productCatalogId: item.product_catalog_id,
    name: item.product_name,
    rate: item.rate_value,
    rateUnit: item.rate_unit,
    inclusionReason: item.application_notes,
  })))
  const areaNames = [...new Set(items.map(item => asText(item.target_area)).filter(Boolean))]
  const dates = items.map(item => item.planned_start_date).filter(Boolean).sort()
  const carrier = items.find(item => item.carrier_volume_value != null)
  return {
    title: program.name,
    application: normalizeApplicationSnapshot({
      name: program.name,
      applicationType: 'planned',
      plannedDate: dates[0] || '',
      areas: areaNames.map(name => ({ name })),
      target: program.notes,
      gpa: carrier?.carrier_volume_value,
      objective: program.notes,
      managerNotes: program.notes,
    }),
    products,
    instructions: normalizeInstructionsSnapshot({
      waterVolume: carrier ? `${carrier.carrier_volume_value} ${carrier.carrier_volume_unit || ''}`.trim() : '',
      observations: items.map(item => item.application_notes).filter(Boolean).join('\n'),
    }),
  }
}

async function sourceFromWizard(env, snapshot) {
  const application = normalizeApplicationSnapshot(snapshot?.application ?? snapshot)
  const products = await enrichProducts(env, snapshot?.products ?? snapshot?.rows ?? [])
  return {
    title: application.name || `${application.areas[0]?.name || 'Application'} training brief`,
    application,
    products,
    instructions: normalizeInstructionsSnapshot(snapshot?.instructions ?? {}),
  }
}

async function insertBrief(env, actor, courseId, sourceType, sourceRecordId, source, extraction = {}) {
  const id = generateId('training-brief')
  const application = normalizeApplicationSnapshot(source.application)
  const products = (source.products ?? []).map(normalizeProductSnapshot)
  const instructions = normalizeInstructionsSnapshot(source.instructions)
  const checklists = normalizeChecklists(source.checklists)
  const narrative = buildTrainingNarrative(application, products)
  if (!application.overallExplanation) application.overallExplanation = narrative.explanation
  const knowledgeCheck = normalizeQuestions(source.knowledgeCheck, application, products)
  const missingFields = findCriticalSafetyGaps(application, products)
  const title = asText(source.title || application.name) || 'Spray Training Brief'
  const managerEdits = { createdFrom: sourceType }

  await env.DB.prepare(`INSERT INTO spray_training_briefs (
    id, course_id, source_type, source_record_id, source_attachment_id,
    status, title, application_snapshot_json, products_snapshot_json,
    instructions_snapshot_json, checklist_snapshot_json, knowledge_check_json,
    missing_fields_json, manager_edits_json, extraction_status,
    extraction_note, extraction_raw_text, created_by_user_id, created_by_name
  ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, courseId, sourceType, sourceRecordId || null, extraction.attachmentId || null,
      title, JSON.stringify(application), JSON.stringify(products), JSON.stringify(instructions),
      JSON.stringify(checklists), JSON.stringify(knowledgeCheck), JSON.stringify(missingFields),
      JSON.stringify(managerEdits), extraction.status || 'not_requested', extraction.note || null,
      extraction.rawText ? extraction.rawText.slice(0, 200000) : null,
      actor?.id || null, actorName(actor),
    ).run()
  return getBriefRow(env, id)
}

async function parseUploadedSource(env, text, fileName) {
  const compact = String(text ?? '').replaceAll(String.fromCharCode(0), '')
  const dateMatch = compact.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)
  let plannedDate = ''
  if (dateMatch) {
    const parsed = new Date(dateMatch[1])
    if (!Number.isNaN(parsed.getTime())) plannedDate = parsed.toISOString().slice(0, 10)
  }
  const acreage = firstNumber(compact.match(/\b(?:acres?|acreage)\s*[:#-]?\s*\d+(?:\.\d+)?/i)?.[0])
  const gpa = firstNumber(compact.match(/\b(?:gpa|gal(?:lons?)?\s*\/\s*acre)\s*[:#-]?\s*\d+(?:\.\d+)?/i)?.[0])
  const tankVolume = firstNumber(compact.match(/\b(?:tank(?:\s+volume|\s+capacity)?)\s*[:#-]?\s*\d+(?:\.\d+)?/i)?.[0])
  const { results: catalogRows } = await env.DB.prepare(
    `SELECT * FROM product_catalog
      WHERE is_active = 1 AND length(product_name) >= 4
      ORDER BY length(product_name) DESC LIMIT 2000`,
  ).all()
  const lower = compact.toLowerCase()
  const matched = []
  const seen = new Set()
  for (const row of catalogRows ?? []) {
    const name = asText(row.product_name)
    if (!name || seen.has(name.toLowerCase()) || !lower.includes(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    matched.push({
      productCatalogId: row.id,
      name,
      category: row.category,
      activeIngredient: prettyIngredients(row.active_ingredients_json),
      fracGroup: row.frac_group,
      hracGroup: row.hrac_group,
      iracGroup: row.irac_group,
      labelUrl: row.label_url,
      source: row.source,
      signalWord: row.signal_word,
      reiHours: row.rei_hours,
      phiHours: row.phi_hours,
      restrictedUse: row.restricted_use === 1,
      verificationStatus: 'unverified',
    })
    if (matched.length >= 20) break
  }
  return {
    title: sanitizeTrainingFileName(fileName).replace(/\.[^.]+$/, ''),
    application: {
      name: sanitizeTrainingFileName(fileName).replace(/\.[^.]+$/, ''),
      plannedDate,
      acreage,
      gpa,
      tankVolume,
      areas: [],
    },
    products: matched,
    instructions: {},
  }
}

export async function listSprayTrainingBriefs(env, request, courseId, status) {
  const actor = await resolveActor(request, env)
  if (!actor) return json({ error: 'Unauthorized' }, 401)
  if (courseId && !actorCanAccessCourse(actor, courseId)) return json([])
  const conditions = ['course_id = ?']
  const binds = [courseId || 'crossroads-gc']
  const manager = actorHasPermission(actor, 'canEditSprays')
  if (status && TRAINING_BRIEF_STATUSES.has(status)) {
    conditions.push('status = ?')
    binds.push(status)
  } else if (!manager) {
    conditions.push("status IN ('ready_for_training', 'reviewed')")
  } else {
    conditions.push("status != 'archived'")
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_training_briefs WHERE ${conditions.join(' AND ')}
      ORDER BY datetime(updated_at) DESC`,
  ).bind(...binds).all()
  return json((results ?? []).map(rowToBrief))
}

export async function getSprayTrainingBrief(env, request, id) {
  const row = await getBriefRow(env, id)
  if (!row) return notFound('Training brief not found')
  const access = await authorizeBriefRead(env, request, row)
  if (!access.allow) return notFound('Training brief not found')
  const brief = rowToBrief(row)
  const conditions = ['brief_id = ?']
  const binds = [id]
  if (!access.manager) {
    conditions.push('user_id = ?')
    binds.push(access.actor.id || '')
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM spray_training_brief_acknowledgments
      WHERE ${conditions.join(' AND ')} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json({ ...brief, acknowledgments: (results ?? []).map(rowToAcknowledgment) })
}

export async function createSprayTrainingBrief(env, request) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  const body = await readJson(request)
  const sourceType = asText(body?.sourceType)
  if (!TRAINING_SOURCE_TYPES.has(sourceType) || sourceType === 'upload') {
    return badRequest('sourceType must be planned_spray, wizard_draft, or spray_record')
  }
  const courseId = resolveCourseId(body)
  if (!actorCanAccessCourse(actor, courseId)) return json({ error: 'Forbidden' }, 403)
  let source = null
  if (sourceType === 'spray_record') source = await sourceFromSprayRecord(env, courseId, body.sourceId)
  if (sourceType === 'planned_spray') source = await sourceFromPlannedProgram(env, courseId, body.sourceId)
  if (sourceType === 'wizard_draft') source = await sourceFromWizard(env, body.sourceSnapshot)
  if (!source) return notFound('Source spray was not found for this course')
  const row = await insertBrief(env, actor, courseId, sourceType, body.sourceId, source)
  return json(rowToBrief(row), 201)
}

export async function uploadSprayTrainingBrief(env, request) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  if (!env.PHOTOS) return json({ error: 'R2 upload storage is not configured' }, 503)
  let form
  try { form = await request.formData() } catch { return badRequest('Expected multipart/form-data body') }
  const file = form.get('file')
  const uploadError = validateTrainingUpload(file)
  if (uploadError) return badRequest(uploadError)
  const courseId = String(form.get('courseId') || 'crossroads-gc')
  if (!actorCanAccessCourse(actor, courseId)) return json({ error: 'Forbidden' }, 403)
  const briefId = generateId('training-brief')
  const attachmentId = generateId('attach')
  const safeName = sanitizeTrainingFileName(file.name)
  const extension = EXTENSIONS[file.type] || 'bin'
  const r2Key = `attachments/${courseId}/spray_training_brief/${briefId}/${attachmentId}.${extension}`
  const bytes = await file.arrayBuffer()
  let rawText = ''
  let extractionStatus = 'manual_required'
  let extractionNote = 'Image extraction is not configured. Review the image and enter the application details manually.'
  if (file.type === 'application/pdf') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes))
      const result = await extractText(pdf, { mergePages: true })
      rawText = typeof result?.text === 'string' ? result.text : Array.isArray(result?.text) ? result.text.join('\n') : ''
      extractionStatus = rawText.trim() ? 'extracted' : 'manual_required'
      extractionNote = rawText.trim()
        ? 'Possible details were extracted. Every field is unverified until a manager reviews and approves it.'
        : 'No selectable PDF text was found. Enter the application details manually.'
    } catch (error) {
      extractionStatus = 'failed'
      extractionNote = `PDF extraction failed. Enter the application details manually. ${error?.message || ''}`.trim()
    }
  }
  const source = await parseUploadedSource(env, rawText, safeName)
  const application = normalizeApplicationSnapshot(source.application)
  const products = (source.products ?? []).map(normalizeProductSnapshot)
  const instructions = normalizeInstructionsSnapshot(source.instructions)
  const checklists = normalizeChecklists({})
  const knowledgeCheck = buildKnowledgeCheck(application, products)
  const missingFields = findCriticalSafetyGaps(application, products)
  try {
    await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType: file.type } })
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO operational_attachments (
        id, course_id, parent_type, parent_id, file_name, content_type, r2_key,
        file_size, caption, uploaded_by, status
      ) VALUES (?, ?, 'spray_training_brief', ?, ?, ?, ?, ?, 'Source spray document', ?, 'active')`)
        .bind(attachmentId, courseId, briefId, safeName, file.type, r2Key, file.size, actorName(actor)),
      env.DB.prepare(`INSERT INTO spray_training_briefs (
        id, course_id, source_type, source_attachment_id, status, title,
        application_snapshot_json, products_snapshot_json, instructions_snapshot_json,
        checklist_snapshot_json, knowledge_check_json, missing_fields_json,
        manager_edits_json, extraction_status, extraction_note, extraction_raw_text,
        created_by_user_id, created_by_name
      ) VALUES (?, ?, 'upload', ?, 'draft', ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`)
        .bind(
          briefId, courseId, attachmentId, source.title, JSON.stringify(application),
          JSON.stringify(products), JSON.stringify(instructions), JSON.stringify(checklists),
          JSON.stringify(knowledgeCheck), JSON.stringify(missingFields), extractionStatus,
          extractionNote, rawText.slice(0, 200000), actor.id || null, actorName(actor),
        ),
    ])
  } catch (error) {
    try { await env.PHOTOS.delete(r2Key) } catch { /* best effort */ }
    return json({ error: `Could not save training upload: ${error.message}` }, 500)
  }
  return json(rowToBrief(await getBriefRow(env, briefId)), 201)
}

export async function updateSprayTrainingBrief(env, request, id) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  const row = await getBriefRow(env, id)
  if (!row || !actorCanAccessCourse(actor, row.course_id)) return notFound('Training brief not found')
  if (row.status === 'archived') return badRequest('Archived briefs cannot be edited')
  const current = rowToBrief(row)
  const body = await readJson(request)
  const application = normalizeApplicationSnapshot(body.application ?? current.application)
  const products = (body.products ?? current.products).map(normalizeProductSnapshot)
  const instructions = normalizeInstructionsSnapshot(body.instructions ?? current.instructions)
  const checklists = normalizeChecklists(body.checklists ?? current.checklists)
  const knowledgeCheck = normalizeQuestions(body.knowledgeCheck ?? current.knowledgeCheck, application, products)
  const missingFields = findCriticalSafetyGaps(application, products)
  const requested = asText(body.status)
  let status = requested === 'draft' || requested === 'needs_review' ? requested : current.status
  if (current.status === 'ready_for_training' || current.status === 'reviewed') status = 'needs_review'
  const title = asText(body.title ?? current.title) || 'Spray Training Brief'
  const edit = { title, application, products, instructions, checklists, knowledgeCheck }
  const revision = generateId('training-revision')
  await env.DB.batch([
    env.DB.prepare(`UPDATE spray_training_briefs SET
      status = ?, title = ?, application_snapshot_json = ?, products_snapshot_json = ?,
      instructions_snapshot_json = ?, checklist_snapshot_json = ?, knowledge_check_json = ?,
      missing_fields_json = ?, manager_edits_json = ?, updated_at = datetime('now')
      WHERE id = ? AND course_id = ?`)
      .bind(
        status, title, JSON.stringify(application), JSON.stringify(products),
        JSON.stringify(instructions), JSON.stringify(checklists), JSON.stringify(knowledgeCheck),
        JSON.stringify(missingFields), JSON.stringify(edit), id, row.course_id,
      ),
    env.DB.prepare(`INSERT INTO spray_training_brief_revisions (
      id, brief_id, course_id, revision_type, snapshot_json, edited_by_id, edited_by_name
    ) VALUES (?, ?, ?, 'manager_edit', ?, ?, ?)`)
      .bind(revision, id, row.course_id, JSON.stringify(edit), actor.id || null, actorName(actor)),
  ])
  return json(rowToBrief(await getBriefRow(env, id)))
}

export async function approveSprayTrainingBrief(env, request, id) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  const row = await getBriefRow(env, id)
  if (!row || !actorCanAccessCourse(actor, row.course_id)) return notFound('Training brief not found')
  const brief = rowToBrief(row)
  const missing = findCriticalSafetyGaps(brief.application, brief.products)
  if (brief.knowledgeCheck.length !== 5) missing.push('Five-question knowledge check')
  brief.knowledgeCheck.forEach((question, index) => {
    if (!asText(question.prompt) || !asText(question.answer)) missing.push(`Knowledge question ${index + 1} and approved answer`)
  })
  if (missing.length) {
    await env.DB.prepare(
      `UPDATE spray_training_briefs SET status = 'needs_review', missing_fields_json = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(JSON.stringify([...new Set(missing)]), id).run()
    return json({ error: 'Critical information must be resolved before training', missingFields: [...new Set(missing)] }, 409)
  }
  const now = new Date().toISOString()
  const version = brief.approvedVersion + 1
  const approved = buildApprovedSnapshot({
    ...brief,
    approvedAt: now,
    approvedByName: actorName(actor),
  })
  await env.DB.batch([
    env.DB.prepare(`UPDATE spray_training_briefs SET
      status = 'ready_for_training', approved_snapshot_json = ?, approved_version = ?,
      approved_by_user_id = ?, approved_by_name = ?, approved_at = ?,
      missing_fields_json = '[]', updated_at = datetime('now') WHERE id = ?`)
      .bind(JSON.stringify(approved), version, actor.id || null, actorName(actor), now, id),
    env.DB.prepare(`INSERT INTO spray_training_brief_revisions (
      id, brief_id, course_id, revision_type, snapshot_json, edited_by_id, edited_by_name
    ) VALUES (?, ?, ?, 'approval', ?, ?, ?)`)
      .bind(generateId('training-revision'), id, row.course_id, JSON.stringify(approved), actor.id || null, actorName(actor)),
  ])
  return json(rowToBrief(await getBriefRow(env, id)))
}

export async function regenerateSprayTrainingBrief(env, request, id) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  const row = await getBriefRow(env, id)
  if (!row || !actorCanAccessCourse(actor, row.course_id)) return notFound('Training brief not found')
  const brief = rowToBrief(row)
  const narrative = buildTrainingNarrative(brief.application, brief.products)
  const application = { ...brief.application, overallExplanation: narrative.explanation }
  const knowledgeCheck = buildKnowledgeCheck(application, brief.products)
  const status = brief.status === 'ready_for_training' || brief.status === 'reviewed' ? 'needs_review' : brief.status
  await env.DB.prepare(`UPDATE spray_training_briefs SET
    status = ?, application_snapshot_json = ?, knowledge_check_json = ?, updated_at = datetime('now')
    WHERE id = ?`)
    .bind(status, JSON.stringify(application), JSON.stringify(knowledgeCheck), id).run()
  return json(rowToBrief(await getBriefRow(env, id)))
}

export async function archiveSprayTrainingBrief(env, request, id) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canEditSprays')) return json({ error: 'Forbidden' }, 403)
  const row = await getBriefRow(env, id)
  if (!row || !actorCanAccessCourse(actor, row.course_id)) return notFound('Training brief not found')
  await env.DB.prepare(`UPDATE spray_training_briefs SET
    status = 'archived', archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(id).run()
  return json({ ok: true, id })
}

export async function acknowledgeSprayTrainingBrief(env, request, id) {
  const actor = await resolveActor(request, env)
  if (!actor || !actorHasPermission(actor, 'canAccessDisplayBoard')) return json({ error: 'Forbidden' }, 403)
  const row = await getBriefRow(env, id)
  if (!row || !actorCanAccessCourse(actor, row.course_id)) return notFound('Training brief not found')
  if (row.status !== 'ready_for_training' && row.status !== 'reviewed') {
    return badRequest('This brief is not ready for training')
  }
  const body = await readJson(request)
  if (body?.acknowledged !== true) return badRequest('Acknowledgment is required')
  const snapshot = parseJson(row.approved_snapshot_json, null)
  if (!snapshot) return badRequest('Approved historical snapshot is missing')
  const questions = Array.isArray(snapshot.knowledgeCheck) ? snapshot.knowledgeCheck : []
  if (questions.length !== 5) return badRequest('The approved knowledge check is incomplete')
  const graded = scoreKnowledgeResponses(questions, body.responses)
  if (graded.responses.some(response => !asText(response.answer))) return badRequest('Answer all five questions')
  const now = new Date().toISOString()
  const acknowledgment = generateId('training-ack')
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO spray_training_brief_acknowledgments (
      id, brief_id, course_id, brief_version, user_id, assistant_name,
      responses_json, score, total_questions, acknowledged, brief_snapshot_json,
      completed_at, acknowledged_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .bind(
        acknowledgment, id, row.course_id, row.approved_version, actor.id || null,
        actorName(actor), JSON.stringify(graded.responses), graded.score, graded.total,
        JSON.stringify(snapshot), now, now,
      ),
    env.DB.prepare(`UPDATE spray_training_briefs SET
      status = 'reviewed', updated_at = datetime('now') WHERE id = ?`)
      .bind(id),
  ])
  const saved = await env.DB.prepare(
    'SELECT * FROM spray_training_brief_acknowledgments WHERE id = ?',
  ).bind(acknowledgment).first()
  return json(rowToAcknowledgment(saved), 201)
}
