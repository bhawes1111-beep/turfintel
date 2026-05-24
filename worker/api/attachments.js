// Operational photo attachments (Phase 8).
//
// Image bytes live in R2 (env.PHOTOS). This module handles:
//   POST   /api/attachments              — multipart upload, writes R2 + metadata
//   GET    /api/attachments              — list by (parentType, parentId), course-scoped
//   GET    /api/attachments/:id          — metadata for one row
//   GET    /api/attachments/:id/file     — stream image bytes from R2
//   DELETE /api/attachments/:id          — soft-delete metadata + hard-delete R2 object
//
// Course scoping: every metadata row carries course_id. Lists honor the
// existing buildCourseFilter helper. R2 keys also carry the course id
// in the path so the bucket can be audited by course.
//
// Mutation auth (POST/DELETE) is enforced centrally in worker/index.js.

import { json, badRequest, notFound } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter } from '../lib/scope.js'

const ALLOWED_PARENT_TYPES = new Set([
  'daily_briefing',
  'operations_task',
  // Phase 19 — Chemical Import Wizard stores the source label PDF here,
  // keyed to the inventory item id it will be saved against.
  'inventory_label',
  // Phase 7A.1 — mobile moisture capture may attach a field photo to the
  // observation row. UI lands in v2; the whitelist is opened now so the
  // contract is stable.
  'moisture_observation',
  // Phase 7B.1 — Turf Health observations (shade, airflow, traffic, chronic
  // stress) attach field photos via the same R2 pipeline. Same UI patterns
  // as moisture: row chip + lightbox + delete. Worker contract opened up
  // front so the client + Worker ship in lockstep.
  'turf_health_observation',
])

// Whitelist mirrors what mobile crews are likely to upload. HEIC covers
// modern iPhones; webp covers Android photo apps. Phase 19 adds PDF for
// the Chemical Import Wizard's label uploads.
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])

const MAX_FILE_BYTES = 8 * 1024 * 1024  // 8 MB

const EXT_FOR_CONTENT_TYPE = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/heic':      'heic',
  'image/heif':      'heif',
  'application/pdf': 'pdf',
}

function rowToAttachment(row, baseUrl = '') {
  if (!row) return null
  return {
    id:           row.id,
    courseId:     row.course_id,
    parentType:   row.parent_type,
    parentId:     row.parent_id,
    fileName:     row.file_name,
    contentType:  row.content_type,
    fileSize:     row.file_size,
    caption:      row.caption,
    uploadedBy:   row.uploaded_by,
    status:       row.status,
    createdAt:    row.created_at,
    // Stable URL the client uses for <img src>. Cached at the edge for
    // 1 hour by the streamAttachment handler below.
    url:          `${baseUrl}/api/attachments/${encodeURIComponent(row.id)}/file`,
  }
}

// ── List + Get ────────────────────────────────────────────────────────────

export async function listAttachments(env, courseId, opts = {}) {
  if (!env.DB) return json({ error: 'D1 not configured yet' }, 503)
  const { where, binds } = buildCourseFilter(courseId)
  const sets  = where ? [where.replace('WHERE ', '')] : []
  const all   = [...binds]
  if (opts.parentType) {
    sets.push('parent_type = ?')
    all.push(opts.parentType)
  }
  if (opts.parentId) {
    sets.push('parent_id = ?')
    all.push(opts.parentId)
  }
  sets.push("status = 'active'")
  const whereClause = `WHERE ${sets.join(' AND ')}`
  const { results } = await env.DB.prepare(
    `SELECT * FROM operational_attachments
     ${whereClause}
     ORDER BY datetime(created_at) DESC`,
  ).bind(...all).all()
  return json(results.map(r => rowToAttachment(r)))
}

export async function getAttachment(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured yet' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM operational_attachments WHERE id = ?',
  ).bind(id).first()
  if (!row || row.status !== 'active') return notFound('Attachment not found')
  return json(rowToAttachment(row))
}

// ── Stream file from R2 ───────────────────────────────────────────────────

export async function streamAttachment(env, id) {
  if (!env.DB)     return new Response('D1 not configured', { status: 503 })
  if (!env.PHOTOS) return new Response('R2 binding (PHOTOS) not configured', { status: 503 })

  const row = await env.DB.prepare(
    'SELECT * FROM operational_attachments WHERE id = ? AND status = ?',
  ).bind(id, 'active').first()
  if (!row) return new Response('Not found', { status: 404 })

  const obj = await env.PHOTOS.get(row.r2_key)
  if (!obj) return new Response('Object missing in R2', { status: 410 })

  const headers = new Headers()
  headers.set('content-type',  row.content_type)
  headers.set('cache-control', 'public, max-age=3600')
  headers.set('etag',          obj.httpEtag)
  if (row.file_size != null) headers.set('content-length', String(row.file_size))

  return new Response(obj.body, { headers })
}

// ── Upload ────────────────────────────────────────────────────────────────
//
// Multipart form fields:
//   parentType, parentId, file (required)
//   caption, uploadedBy, courseId (optional)
//
// Validations: parent_type whitelist, content_type whitelist, size cap.

export async function createAttachment(env, request) {
  if (!env.DB)     return json({ error: 'D1 not configured' },     503)
  if (!env.PHOTOS) return json({ error: 'R2 binding (PHOTOS) not configured' }, 503)

  let form
  try {
    form = await request.formData()
  } catch {
    return badRequest('Expected multipart/form-data body')
  }

  const parentType = form.get('parentType')
  const parentId   = form.get('parentId')
  const caption    = form.get('caption')
  const uploadedBy = form.get('uploadedBy')
  const courseId   = form.get('courseId') || 'crossroads-gc'
  const file       = form.get('file')

  if (!parentType || !ALLOWED_PARENT_TYPES.has(parentType)) {
    return badRequest(`parentType must be one of: ${[...ALLOWED_PARENT_TYPES].join(', ')}`)
  }
  if (!parentId) return badRequest('parentId is required')
  if (!file || typeof file === 'string') return badRequest('file is required (multipart binary)')

  const contentType = file.type || 'application/octet-stream'
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return badRequest(`contentType ${contentType} not allowed. Whitelist: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`)
  }
  if (file.size > MAX_FILE_BYTES) {
    return badRequest(`File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit (got ${file.size} bytes)`)
  }

  const id    = generateId('attach')
  const ext   = EXT_FOR_CONTENT_TYPE[contentType] ?? 'bin'
  const r2Key = `attachments/${courseId}/${parentType}/${parentId}/${id}.${ext}`

  // Push to R2 first; only insert the metadata row after the object is
  // safely stored. If R2 fails, we never have an orphan DB row pointing
  // to a missing object.
  try {
    await env.PHOTOS.put(r2Key, file.stream(), {
      httpMetadata: { contentType },
    })
  } catch (err) {
    return json({ error: `R2 upload failed: ${err.message}` }, 500)
  }

  try {
    await env.DB.prepare(`
      INSERT INTO operational_attachments (
        id, course_id, parent_type, parent_id,
        file_name, content_type, r2_key, file_size,
        caption, uploaded_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      courseId,
      parentType,
      parentId,
      file.name || null,
      contentType,
      r2Key,
      file.size || null,
      typeof caption    === 'string' && caption.trim()    ? caption.trim()    : null,
      typeof uploadedBy === 'string' && uploadedBy.trim() ? uploadedBy.trim() : null,
      'active',
    ).run()
  } catch (err) {
    // Roll back the R2 object so we don't leak storage on metadata failure.
    try { await env.PHOTOS.delete(r2Key) } catch { /* best-effort cleanup */ }
    return json({ error: `Metadata insert failed: ${err.message}` }, 500)
  }

  return getAttachment(env, id)
}

// ── Delete ────────────────────────────────────────────────────────────────

export async function deleteAttachment(env, id) {
  if (!env.DB)     return json({ error: 'D1 not configured' },     503)
  if (!env.PHOTOS) return json({ error: 'R2 binding (PHOTOS) not configured' }, 503)

  const row = await env.DB.prepare(
    'SELECT * FROM operational_attachments WHERE id = ? AND status = ?',
  ).bind(id, 'active').first()
  if (!row) return notFound('Attachment not found or already deleted')

  // Hard-delete the R2 object (storage is the cost driver) then soft-
  // delete the metadata so audit trail survives.
  try { await env.PHOTOS.delete(row.r2_key) } catch { /* best-effort cleanup */ }

  await env.DB.prepare(
    `UPDATE operational_attachments
        SET status = 'deleted'
      WHERE id = ?`,
  ).bind(id).run()

  return json({ ok: true, id })
}
