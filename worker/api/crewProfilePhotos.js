import { badRequest, json, notFound } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { actorCanAccessCourse } from '../lib/actor.js'

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const EXTENSION_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024

function safeFileName(name, extension) {
  const base = String(name || 'profile-photo')
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return base || `profile-photo.${extension}`
}

async function findEmployee(env, employeeId, courseId) {
  if (!employeeId || !courseId) return null
  return env.DB.prepare(
    'SELECT id, course_id FROM crew_employees WHERE id = ? AND course_id = ?',
  ).bind(employeeId, courseId).first()
}

async function findActivePhoto(env, employeeId, courseId) {
  return env.DB.prepare(`
    SELECT *
      FROM operational_attachments
     WHERE parent_type = 'crew_employee'
       AND parent_id = ?
       AND course_id = ?
       AND status = 'active'
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT 1
  `).bind(employeeId, courseId).first()
}

function photoResponse(row, employeeId, courseId) {
  return {
    id: row.id,
    employeeId,
    courseId,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    url: `/api/crew-employees/${encodeURIComponent(employeeId)}/profile-photo?courseId=${encodeURIComponent(courseId)}&v=${encodeURIComponent(row.created_at ?? row.id)}`,
  }
}

function streamPhotoObject(obj, row, cacheControl) {
  const headers = new Headers()
  headers.set('content-type', row.content_type)
  headers.set('cache-control', cacheControl)
  headers.set('x-content-type-options', 'nosniff')
  if (obj.httpEtag) headers.set('etag', obj.httpEtag)
  if (row.file_size != null) headers.set('content-length', String(row.file_size))
  return new Response(obj.body, { headers })
}

export async function uploadCrewProfilePhoto(env, employeeId, request, actor) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  if (!env.PHOTOS) return json({ error: 'R2 binding (PHOTOS) not configured' }, 503)

  let form
  try {
    form = await request.formData()
  } catch {
    return badRequest('Expected multipart/form-data body')
  }

  const courseId = String(form.get('courseId') ?? '').trim()
  const file = form.get('file')
  if (!actorCanAccessCourse(actor, courseId)) return notFound('Crew employee not found')
  const employee = await findEmployee(env, employeeId, courseId)
  if (!employee) return notFound('Crew employee not found')
  if (!file || typeof file === 'string') return badRequest('file is required')

  const contentType = file.type || 'application/octet-stream'
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return badRequest('Profile photo must be a JPEG, PNG, or WebP image')
  }
  if (file.size <= 0) return badRequest('Profile photo cannot be empty')
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return badRequest('Profile photo cannot exceed 5 MB')
  }

  const current = await findActivePhoto(env, employeeId, courseId)
  const id = generateId('profile-photo')
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType]
  const fileName = safeFileName(file.name, extension)
  const r2Key = `attachments/${courseId}/crew_employee/${employeeId}/${id}.${extension}`

  try {
    await env.PHOTOS.put(r2Key, file.stream(), {
      httpMetadata: { contentType },
    })
  } catch (error) {
    return json({ error: `Profile photo upload failed: ${error.message}` }, 500)
  }

  const statements = [env.DB.prepare(`
    INSERT INTO operational_attachments (
      id, course_id, parent_type, parent_id, file_name, content_type,
      r2_key, file_size, caption, uploaded_by, status
    ) VALUES (?, ?, 'crew_employee', ?, ?, ?, ?, ?, NULL, NULL, 'active')
  `).bind(id, courseId, employeeId, fileName, contentType, r2Key, file.size)]

  if (current) {
    statements.push(env.DB.prepare(
      "UPDATE operational_attachments SET status = 'deleted' WHERE id = ?",
    ).bind(current.id))
  }

  try {
    await env.DB.batch(statements)
  } catch (error) {
    try { await env.PHOTOS.delete(r2Key) } catch { /* best-effort cleanup */ }
    return json({ error: `Profile photo metadata save failed: ${error.message}` }, 500)
  }

  if (current?.r2_key) {
    try { await env.PHOTOS.delete(current.r2_key) } catch { /* best-effort cleanup */ }
  }

  const saved = await findActivePhoto(env, employeeId, courseId)
  return json(photoResponse(saved, employeeId, courseId), 201)
}

export async function deleteCrewProfilePhoto(env, employeeId, courseId, actor) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  if (!env.PHOTOS) return json({ error: 'R2 binding (PHOTOS) not configured' }, 503)
  if (!actorCanAccessCourse(actor, courseId)) return notFound('Crew employee not found')
  const employee = await findEmployee(env, employeeId, courseId)
  if (!employee) return notFound('Crew employee not found')

  const current = await findActivePhoto(env, employeeId, courseId)
  if (!current) return json({ ok: true, employeeId, removed: false })

  await env.DB.prepare(
    "UPDATE operational_attachments SET status = 'deleted' WHERE id = ?",
  ).bind(current.id).run()
  try { await env.PHOTOS.delete(current.r2_key) } catch { /* best-effort cleanup */ }

  return json({ ok: true, employeeId, removed: true })
}

export async function streamCrewProfilePhoto(env, employeeId, courseId, actor) {
  if (!env.DB || !env.PHOTOS) return new Response('Not found', { status: 404 })
  if (!actorCanAccessCourse(actor, courseId)) return new Response('Not found', { status: 404 })
  const employee = await findEmployee(env, employeeId, courseId)
  if (!employee) return new Response('Not found', { status: 404 })
  const row = await findActivePhoto(env, employeeId, courseId)
  if (!row) return new Response('Not found', { status: 404 })
  const obj = await env.PHOTOS.get(row.r2_key)
  if (!obj) return new Response('Not found', { status: 404 })
  return streamPhotoObject(obj, row, 'private, max-age=300')
}

export async function streamBoardCrewProfilePhoto(env, employeeId, courseId) {
  if (!env.DB || !env.PHOTOS || !employeeId || !courseId) {
    return new Response('Not found', { status: 404 })
  }

  const setting = await env.DB.prepare(`
    SELECT display_board_show_profile_photos
      FROM courses
     WHERE id = ?
  `).bind(courseId).first()
  if (setting?.display_board_show_profile_photos !== 1) {
    return new Response('Not found', { status: 404 })
  }

  const employee = await findEmployee(env, employeeId, courseId)
  if (!employee) return new Response('Not found', { status: 404 })
  const row = await findActivePhoto(env, employeeId, courseId)
  if (!row) return new Response('Not found', { status: 404 })
  const obj = await env.PHOTOS.get(row.r2_key)
  if (!obj) return new Response('Not found', { status: 404 })
  return streamPhotoObject(obj, row, 'public, max-age=300')
}
