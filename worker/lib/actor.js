// Centralized actor resolution + authorization helpers.
//
// "Actor" = the principal behind a request. Two ways to authenticate in the
// transition phase:
//   1. ADMIN_KEY header  → a synthetic owner_admin actor (automation, cron,
//      internal tooling, and the not-yet-migrated client stores).
//   2. session cookie    → the real user row from the sessions table.
// Unauthenticated requests resolve to null.
//
// All authorization decisions go through the shared permission matrix
// (worker/lib/permissions.js) via these helpers, so route handlers never
// re-implement role logic. resolveActor is async (it may hit D1 for the
// session); the rest are pure.

import { requireAdminKey } from './auth.js'
import { resolveSession } from '../api/auth.js'
import { can, permissionsFor } from './permissions.js'

// A synthetic actor representing a valid ADMIN_KEY caller. Flagged so callers
// can distinguish automation from a real signed-in user when it matters.
const ADMIN_KEY_ACTOR = { role: 'owner_admin', synthetic: true, automation: true }

/**
 * resolveActor — returns the principal for this request, or null.
 *   ADMIN_KEY present & valid → synthetic owner_admin (automation).
 *   else valid session cookie → the user row.
 *   else                      → null.
 */
export async function resolveActor(request, env) {
  const key = requireAdminKey(request, env)
  if (key.ok) return ADMIN_KEY_ACTOR
  const user = await resolveSession(request, env)
  return user || null
}

/** actorHasPermission — single permission check; null actor → false. */
export function actorHasPermission(actor, permission) {
  if (!actor) return false
  return can(actor, permission)
}

/** isAutomationActor — true for the ADMIN_KEY synthetic actor (not a user). */
export function isAutomationActor(actor) {
  return !!(actor && actor.automation === true)
}

/**
 * actorCanAccessCourse — may this actor see/operate on `courseId`?
 *   - automation (ADMIN_KEY) and owner_admin: all courses.
 *   - superintendent: all courses (full operational authority).
 *   - others: only course ids in their course_access list. A NULL/absent
 *     course_access means "all courses" (the Phase-1 default for every user).
 *   - null actor or null courseId: deny / allow-unscoped is the caller's
 *     concern — here a null actor is false, a null courseId is true (unscoped
 *     reads stay legacy-compatible).
 * NOTE: full enforcement across list endpoints lands in P3; this helper is the
 * single source of truth those routes will call.
 */
export function actorCanAccessCourse(actor, courseId) {
  if (!actor) return false
  if (courseId == null) return true
  const role = typeof actor === 'string' ? actor : actor.role
  if (isAutomationActor(actor) || role === 'owner_admin' || role === 'superintendent') return true

  const raw = actor.course_access
  if (raw == null) return true   // null = all courses
  let list = raw
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw) } catch { return false }
  }
  return Array.isArray(list) ? list.includes(courseId) : true
}

/** Convenience: the resolved permission map for an actor (deny-all if null). */
export function actorPermissions(actor) {
  return actor ? permissionsFor(actor) : {}
}

/**
 * actorAccessibleCourses — the set of course ids an actor may see.
 *   - null  → ALL courses (owner_admin, superintendent, ADMIN_KEY, or any
 *             user whose course_access is NULL — the single-course default).
 *   - array → the explicit allow-list (possibly empty → sees nothing).
 *   - null actor → [] (sees nothing).
 * Callers use null as "no filter"; an array means "filter to these ids".
 */
export function actorAccessibleCourses(actor) {
  if (!actor) return []
  const role = typeof actor === 'string' ? actor : actor.role
  if (isAutomationActor(actor) || role === 'owner_admin' || role === 'superintendent') return null

  const raw = actor.course_access
  if (raw == null) return null   // null = all courses
  let list = raw
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw) } catch { return [] }
  }
  return Array.isArray(list) ? list : null
}
