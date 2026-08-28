// Task Library category CRUD endpoints.
//
// Categories are reusable task groupings. task_templates.category stores
// the category slug, while this table stores the supervisor-facing name
// and order. Mutation auth is applied centrally in worker/index.js.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { resolveCourseId } from '../lib/scope.js'

function slugify(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function rowToCategory(row) {
  if (!row) return null
  return {
    id:          row.id,
    courseId:    row.course_id,
    slug:        row.slug,
    name:        row.name,
    sortOrder:   row.sort_order,
    activeCount: row.active_count ?? 0,
    totalCount:  row.total_count ?? 0,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

async function getTaskCategoryRow(env, id) {
  return env.DB.prepare(
    `SELECT c.*,
      (SELECT COUNT(*) FROM task_templates t
        WHERE t.course_id = c.course_id
          AND lower(coalesce(t.category, '')) = c.slug
          AND t.status = 'active') AS active_count,
      (SELECT COUNT(*) FROM task_templates t
        WHERE t.course_id = c.course_id
          AND lower(coalesce(t.category, '')) = c.slug) AS total_count
     FROM task_categories c
     WHERE c.id = ?`,
  ).bind(id).first()
}

export async function listTaskCategories(env, courseId = null) {
  const where = courseId ? 'WHERE c.course_id = ?' : ''
  const binds = courseId ? [courseId] : []
  const { results } = await env.DB.prepare(
    `SELECT c.*,
      (SELECT COUNT(*) FROM task_templates t
        WHERE t.course_id = c.course_id
          AND lower(coalesce(t.category, '')) = c.slug
          AND t.status = 'active') AS active_count,
      (SELECT COUNT(*) FROM task_templates t
        WHERE t.course_id = c.course_id
          AND lower(coalesce(t.category, '')) = c.slug) AS total_count
     FROM task_categories c
     ${where}
     ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`,
  ).bind(...binds).all()
  return json(results.map(rowToCategory))
}

export async function createTaskCategory(env, request) {
  const body = await readJson(request)
  const name = (body.name ?? '').trim()
  if (!name) return badRequest('name is required')

  const courseId = resolveCourseId(body)
  const slug = slugify(body.slug || name)
  if (!slug) return badRequest('area name must include letters or numbers')

  let sortOrder = Number(body.sortOrder)
  if (!Number.isFinite(sortOrder)) {
    const row = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort FROM task_categories WHERE course_id = ?',
    ).bind(courseId).first()
    sortOrder = row?.next_sort ?? 10
  }

  const id = body.id ?? generateId('tcat')

  try {
    await env.DB.prepare(
      `INSERT INTO task_categories (id, course_id, slug, name, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, courseId, slug, name, sortOrder).run()
  } catch (err) {
    if (String(err.message ?? '').includes('UNIQUE')) {
      const existing = await env.DB.prepare(
        'SELECT id FROM task_categories WHERE course_id = ? AND slug = ?',
      ).bind(courseId, slug).first()
      if (existing) return json(rowToCategory(await getTaskCategoryRow(env, existing.id)), 200)
    }
    throw err
  }

  return json(rowToCategory(await getTaskCategoryRow(env, id)))
}

export async function updateTaskCategory(env, id, request) {
  const row = await getTaskCategoryRow(env, id)
  if (!row) return notFound('Task category not found')

  const body = await readJson(request)
  const name = Object.prototype.hasOwnProperty.call(body, 'name')
    ? (body.name ?? '').trim()
    : row.name
  if (!name) return badRequest('name is required')

  const nextSlug = Object.prototype.hasOwnProperty.call(body, 'slug') || name !== row.name
    ? slugify(body.slug || name)
    : row.slug
  if (!nextSlug) return badRequest('area name must include letters or numbers')

  const sortOrder = Number.isFinite(Number(body.sortOrder))
    ? Number(body.sortOrder)
    : row.sort_order

  try {
    const result = await env.DB.prepare(
      `UPDATE task_categories
        SET slug = ?, name = ?, sort_order = ?, updated_at = datetime('now')
        WHERE id = ?`,
    ).bind(nextSlug, name, sortOrder, id).run()
    if (!result.success || result.meta.changes === 0) return notFound('Task category not found')
  } catch (err) {
    if (String(err.message ?? '').includes('UNIQUE')) {
      return badRequest(`Area "${name}" already exists`)
    }
    throw err
  }

  if (nextSlug !== row.slug) {
    await env.DB.prepare(
      `UPDATE task_templates
        SET category = ?, updated_at = datetime('now')
        WHERE course_id = ?
          AND lower(coalesce(category, '')) = ?`,
    ).bind(nextSlug, row.course_id, row.slug).run()
  }

  return json(rowToCategory(await getTaskCategoryRow(env, id)))
}

export async function deleteTaskCategory(env, id) {
  const row = await getTaskCategoryRow(env, id)
  if (!row) return notFound('Task category not found')

  const moved = await env.DB.prepare(
    `UPDATE task_templates
      SET category = NULL, updated_at = datetime('now')
      WHERE course_id = ?
        AND lower(coalesce(category, '')) = ?`,
  ).bind(row.course_id, row.slug).run()

  const result = await env.DB.prepare(
    'DELETE FROM task_categories WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Task category not found')
  return json({ ok: true, id, movedTasks: moved.meta?.changes ?? 0 })
}
