// User management API — /api/users.
//
// Unlike the operational endpoints (Phase 1 = log-only), user management is
// ENFORCED from day one: creating/editing accounts is inherently privileged.
// The actor is resolved from the session cookie; an ADMIN_KEY caller is
// treated as owner_admin (full authority) for transitional tooling.
//
// Authority rules (worker/lib/permissions.js):
//   - actor must have canManageUsers
//   - actor may only create/edit roles strictly below their own
//     (owner_admin may manage all; superintendent may manage lower only)

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { hashPassword } from '../lib/passwords.js'
import { resolveSession } from './auth.js'
import { ROLES, canManageRole, can } from '../lib/permissions.js'
import { requireAdminKey } from '../lib/auth.js'

function normEmail(v) { return typeof v === 'string' ? v.trim().toLowerCase() : '' }

function publicUser(row) {
  if (!row) return null
  return {
    id:           row.id,
    email:        row.email,
    displayName:  row.display_name,
    role:         row.role,
    status:       row.status,
    courseAccess: row.course_access ? safeParseArray(row.course_access) : null,
    viewPrivateNotes: row.view_private_notes === 1,
    sendCrewNotes:    row.send_crew_notes === 1,
    createdAt:    row.created_at,
    lastLoginAt:  row.last_login_at ?? null,
  }
}
function safeParseArray(s) { try { const a = JSON.parse(s); return Array.isArray(a) ? a : null } catch { return null } }

/**
 * encodeCourseAccess — turn an API value into the DB column value.
 *
 * Semantics (Phase 4 Step 4):
 *   undefined  → undefined  (caller decides: skip the column on UPDATE, or use
 *                            the default NULL on INSERT)
 *   null       → null       (stored as NULL = unrestricted, all courses)
 *   []         → '"[]"'      (explicit empty allow-list = NO course access)
 *   ['a','b']  → '["a","b"]' (restricted to listed courses)
 *
 * Any non-array, non-null, non-undefined value (e.g. a string, number, object)
 * is rejected — callers should validate before calling. Returning undefined
 * here signals "invalid"; callers may map that to a 400.
 */
export function encodeCourseAccess(v) {
  if (v === undefined) return undefined
  if (v === null) return null
  if (Array.isArray(v)) return JSON.stringify(v)   // [] → '[]', [..] → JSON
  return undefined   // invalid input
}

/**
 * Resolve the acting user. A valid ADMIN_KEY → synthetic owner_admin actor.
 * Otherwise the session user. Returns null if neither.
 */
async function resolveActor(request, env) {
  const key = requireAdminKey(request, env)
  if (key.ok) return { role: 'owner_admin', synthetic: true }
  return resolveSession(request, env)
}

// ── List ────────────────────────────────────────────────────────────────
export async function listUsers(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const actor = await resolveActor(request, env)
  if (!can(actor, 'canManageUsers')) return json({ error: 'Forbidden' }, 403)
  const { results } = await env.DB.prepare(
    'SELECT * FROM users ORDER BY created_at ASC',
  ).all()
  return json((results ?? []).map(publicUser))
}

// ── Create ──────────────────────────────────────────────────────────────
export async function createUser(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const actor = await resolveActor(request, env)
  if (!can(actor, 'canManageUsers')) return json({ error: 'Forbidden' }, 403)

  const body  = await readJson(request)
  const email = normEmail(body.email)
  const role  = typeof body.role === 'string' ? body.role : 'crew'
  if (!email || !email.includes('@')) return badRequest('Valid email required')
  if (!ROLES.includes(role)) return badRequest(`Invalid role "${body.role}"`)
  if (!canManageRole(actor, role)) return json({ error: 'Cannot assign a role at or above your own' }, 403)
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return badRequest('Password must be at least 8 characters')
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return json({ error: 'A user with that email already exists' }, 409)

  const id   = generateId('usr')
  const hash = await hashPassword(body.password)
  // courseAccess semantics: omitted → NULL (all courses, the create default);
  // null → NULL (all); [] → '[]' (no courses); ['..'] → JSON allow-list.
  let courseAccess
  if (Object.prototype.hasOwnProperty.call(body, 'courseAccess')) {
    courseAccess = encodeCourseAccess(body.courseAccess)
    if (courseAccess === undefined) return badRequest('courseAccess must be null or an array')
  } else {
    courseAccess = null   // omitted on create defaults to NULL = all access
  }
  await env.DB.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status, course_access, view_private_notes, send_crew_notes)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    id, email, hash, (body.displayName ?? '').trim() || null, role, courseAccess,
    body.viewPrivateNotes ? 1 : 0, body.sendCrewNotes ? 1 : 0,
  ).run()
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  return json(publicUser(row), 201)
}

// ── Update (role / status / overrides / password / course access) ─────────
const MUTABLE = {
  displayName:      'display_name',
  status:           'status',
}
export async function updateUser(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const actor = await resolveActor(request, env)
  if (!can(actor, 'canManageUsers')) return json({ error: 'Forbidden' }, 403)

  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!target) return notFound('User not found')
  // The actor must outrank the target's CURRENT role to touch it at all.
  if (!canManageRole(actor, target.role)) return json({ error: 'Cannot manage a user at or above your own role' }, 403)

  const body  = await readJson(request)
  const sets  = []
  const binds = []

  for (const [apiKey, col] of Object.entries(MUTABLE)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    if (apiKey === 'status' && !['active', 'disabled'].includes(body.status)) {
      return badRequest(`Invalid status "${body.status}"`)
    }
    sets.push(`${col} = ?`); binds.push(body[apiKey])
  }
  // Role change: target role must also be one the actor may assign.
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    if (!ROLES.includes(body.role)) return badRequest(`Invalid role "${body.role}"`)
    if (!canManageRole(actor, body.role)) return json({ error: 'Cannot assign a role at or above your own' }, 403)
    sets.push('role = ?'); binds.push(body.role)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'viewPrivateNotes')) {
    sets.push('view_private_notes = ?'); binds.push(body.viewPrivateNotes ? 1 : 0)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sendCrewNotes')) {
    sets.push('send_crew_notes = ?'); binds.push(body.sendCrewNotes ? 1 : 0)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'courseAccess')) {
    // Semantics: null → NULL (all), [] → '[]' (none), ['..'] → JSON allow-list.
    // Omitted (handled above by hasOwnProperty) leaves the column untouched.
    const ca = encodeCourseAccess(body.courseAccess)
    if (ca === undefined) return badRequest('courseAccess must be null or an array')
    sets.push('course_access = ?'); binds.push(ca)
  }
  if (typeof body.password === 'string') {
    if (body.password.length < 8) return badRequest('Password must be at least 8 characters')
    sets.push('password_hash = ?'); binds.push(await hashPassword(body.password))
    // Changing a password invalidates that user's existing sessions.
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run().catch(() => {})
  }

  if (sets.length === 0) return badRequest('No mutable fields supplied')
  sets.push(`updated_at = datetime('now')`)
  binds.push(id)
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  // Deactivating a user kills their sessions immediately.
  if (body.status === 'disabled') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run().catch(() => {})
  }
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  return json(publicUser(row))
}
