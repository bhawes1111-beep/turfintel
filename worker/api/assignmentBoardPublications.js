import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { resolveCourseId } from '../lib/scope.js'
import { actorCanAccessCourse, isAutomationActor } from '../lib/actor.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function rowToPublication(row, courseId, publicationDate) {
  if (!row) {
    return {
      courseId,
      publicationDate,
      status: 'draft',
      posted: false,
      postedBy: null,
      postedAt: null,
      updatedAt: null,
    }
  }
  return {
    id: row.id,
    courseId: row.course_id,
    publicationDate: row.publication_date,
    status: row.status,
    posted: row.status === 'posted',
    postedBy: row.posted_by,
    postedAt: row.posted_at,
    updatedAt: row.updated_at,
  }
}

function actorLabel(actor) {
  if (!actor) return null
  if (isAutomationActor(actor)) return 'System administrator'
  return actor.name ?? actor.full_name ?? actor.email ?? actor.id ?? null
}

export async function findAssignmentBoardPublication(env, courseId, publicationDate) {
  if (!env?.DB || !courseId || !ISO_DATE_RE.test(publicationDate ?? '')) {
    return rowToPublication(null, courseId, publicationDate)
  }
  try {
    const row = await env.DB.prepare(`
      SELECT *
        FROM assignment_board_publications
       WHERE course_id = ? AND publication_date = ?
       LIMIT 1
    `).bind(courseId, publicationDate).first()
    return rowToPublication(row, courseId, publicationDate)
  } catch {
    // During a rolling deployment the Worker may briefly be ahead of the D1
    // migration. Fail closed: the board keeps showing first jobs only.
    return rowToPublication(null, courseId, publicationDate)
  }
}

export async function getAssignmentBoardPublication(env, courseId, publicationDate) {
  if (!publicationDate || !ISO_DATE_RE.test(publicationDate)) {
    return badRequest('date must be YYYY-MM-DD')
  }
  return json(await findAssignmentBoardPublication(env, courseId, publicationDate))
}

export async function postAssignmentBoardPublication(env, request, actor) {
  const body = await readJson(request)
  const courseId = resolveCourseId(body)
  const publicationDate = body.publicationDate ?? body.date
  if (!publicationDate || !ISO_DATE_RE.test(publicationDate)) {
    return badRequest('publicationDate must be YYYY-MM-DD')
  }
  if (!actorCanAccessCourse(actor, courseId)) {
    return json({ error: 'Forbidden - course access required' }, 403)
  }

  const id = generateId('board-post')
  const postedBy = actorLabel(actor)
  await env.DB.prepare(`
    INSERT INTO assignment_board_publications (
      id, course_id, publication_date, status, posted_by, posted_at, updated_at
    ) VALUES (?, ?, ?, 'posted', ?, datetime('now'), datetime('now'))
    ON CONFLICT(course_id, publication_date) DO UPDATE SET
      status = 'posted',
      posted_by = excluded.posted_by,
      posted_at = datetime('now'),
      updated_at = datetime('now')
  `).bind(id, courseId, publicationDate, postedBy).run()

  return json(await findAssignmentBoardPublication(env, courseId, publicationDate))
}
