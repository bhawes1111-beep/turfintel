// Course-access scoping for GET list reads (Phase 2 P3).
//
// A conservative read-side guard: when a restricted user requests a course
// they may not access, the endpoint returns an empty result instead of that
// course's data. owner_admin / superintendent / ADMIN_KEY are never
// restricted, and a user with course_access = NULL sees everything (the
// single-course production default), so existing behavior is preserved.
//
// This guards at the gate (before dispatch) so individual handlers stay
// untouched. Only the explicitly-listed scoped paths are guarded; everything
// else is unaffected this phase (documented deferrals in the report).

import { actorCanAccessCourse, actorAccessibleCourses } from './actor.js'

/**
 * enforceRowCourseAccess — row-level course-access guard for a GET-by-id read.
 *
 * Fetches `id, course_id` from `table` and checks the actor's course access.
 * Returns:
 *   { allow: true,  row: { id, course_id } } — row exists AND actor may access
 *   { allow: false }                          — row missing OR denied
 *
 * Callers map `allow: false` to **404** so a denied caller can't distinguish
 * "exists but not yours" from "doesn't exist" — no existence leak. (The same
 * uniform 404 covers a malformed/empty id and an actor with NULL DB.)
 *
 * The helper deliberately does not enforce auth itself (the central gate
 * handles 401); it only enforces course-access for an already-resolved actor.
 * Pass `null` for `actor` only if you intend public-read semantics — in that
 * case actorCanAccessCourse returns false and the helper denies (no leak).
 */
export async function enforceRowCourseAccess(env, actor, table, id) {
  if (!env?.DB || !id) return { allow: false }
  // Whitelist `table` to a safe set so the column name is never user-controlled.
  // The intersection of "course-keyed table" and "currently uses this helper":
  const ALLOWED = new Set(['operational_attachments'])
  if (!ALLOWED.has(table)) return { allow: false }

  let row
  try {
    row = await env.DB.prepare(
      `SELECT id, course_id FROM ${table} WHERE id = ?`,
    ).bind(id).first()
  } catch {
    return { allow: false }
  }
  if (!row) return { allow: false }
  if (!actorCanAccessCourse(actor, row.course_id)) return { allow: false }
  return { allow: true, row }
}

// GET list/read endpoints that are course-scoped and safe to guard now.
// Matched by exact path OR `${path}/...` sub-path (e.g. /by-date).
export const COURSE_SCOPED_READ_PATHS = [
  '/api/condition-logs',
  '/api/moisture',
  '/api/sprays',
  '/api/inventory',
  '/api/equipment',
  '/api/nutrition',
  '/api/cultural-practices',
  '/api/disease',
  '/api/water-balance',
  '/api/weather/history',
  '/api/weather/current',
  '/api/crew-assignments',
  '/api/operations-notes',
  '/api/calendar-events',
]

export function isCourseScopedReadPath(pathname) {
  return COURSE_SCOPED_READ_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

// A few scoped reads return a single object ({ empty: true }) rather than an
// array. For those, the "denied" empty response must match that shape so the
// client parses it normally. Everything else returns an empty array.
const OBJECT_EMPTY_PATHS = ['/api/weather/current', '/api/condition-logs/by-date']
export function emptyBodyForPath(pathname) {
  return OBJECT_EMPTY_PATHS.includes(pathname) ? { empty: true } : []
}

/**
 * courseReadDecision — decide how a GET read should be scoped for this actor.
 *
 * Returns one of:
 *   { allow: true }                    → proceed unchanged (unrestricted, or
 *                                         requesting an accessible course).
 *   { allow: false, empty: true }      → restricted actor requesting a course
 *                                         they can't access, or has an empty
 *                                         allow-list → return an empty result.
 *
 * `requestedCourseId` is the ?courseId= param (may be null = unscoped).
 * For an unrestricted actor (accessible === null) everything is allowed.
 * For a restricted actor:
 *   - a requested course they can access → allow
 *   - a requested course they cannot     → empty
 *   - no course specified, but they have at least one allowed course → allow
 *     (the handler's own default scope applies; we don't widen it)
 *   - no course specified and an EMPTY allow-list → empty
 */
export function courseReadDecision(actor, requestedCourseId) {
  const accessible = actorAccessibleCourses(actor)
  if (accessible === null) return { allow: true }          // unrestricted
  if (accessible.length === 0) return { allow: false, empty: true }
  if (requestedCourseId == null) return { allow: true }     // handler default scope
  return actorCanAccessCourse(actor, requestedCourseId)
    ? { allow: true }
    : { allow: false, empty: true }
}

/**
 * filterCoursesForActor — restrict a courses[] array to what the actor may see.
 * Unrestricted actor → unchanged. Restricted → only ids in the allow-list.
 */
export function filterCoursesForActor(actor, courses) {
  const accessible = actorAccessibleCourses(actor)
  if (accessible === null) return courses
  const allow = new Set(accessible)
  return (courses ?? []).filter(c => allow.has(c.id))
}
