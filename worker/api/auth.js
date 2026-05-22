// Auth API — bootstrap, login, logout, current-user.
//
// Phase 1: session auth lives ALONGSIDE the existing ADMIN_KEY. These
// endpoints create users and mint session cookies; the central gate
// (worker/index.js) accepts EITHER a valid session OR the admin key, so no
// existing flow breaks. Passwords are PBKDF2-hashed; session tokens are
// stored only as SHA-256 hashes. Nothing sensitive is logged.

import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { hashPassword, verifyPassword } from '../lib/passwords.js'
import {
  mintToken, hashToken, expiryFromNow, isExpired,
  buildSessionCookie, clearSessionCookie, readSessionCookie, SESSION_TTL_DAYS,
} from '../lib/sessions.js'
import { ROLES, permissionsFor } from '../lib/permissions.js'

// Response with a Set-Cookie header (json() can't carry custom headers).
function jsonWithCookie(data, cookie, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie },
  })
}

function normEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

// Public-safe projection of a user row (never includes password_hash).
function publicUser(row) {
  if (!row) return null
  return {
    id:           row.id,
    email:        row.email,
    displayName:  row.display_name,
    role:         row.role,
    status:       row.status,
    courseAccess: row.course_access ? safeParseArray(row.course_access) : null,
    permissions:  permissionsFor(row),
    lastLoginAt:  row.last_login_at ?? null,
  }
}

function safeParseArray(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : null } catch { return null }
}

// ── Session resolution (used by the gate + /me) ────────────────────────────

/**
 * resolveSession — read the session cookie, look it up, return the user row
 * (or null). Expired sessions are treated as absent. Best-effort: never
 * throws. Touches last_seen_at opportunistically.
 */
export async function resolveSession(request, env) {
  if (!env.DB) return null
  const token = readSessionCookie(request)
  if (!token) return null
  let th
  try { th = await hashToken(token) } catch { return null }
  const sess = await env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash = ?',
  ).bind(th).first().catch(() => null)
  if (!sess || isExpired(sess.expires_at)) return null
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(sess.user_id).first().catch(() => null)
  if (!user || user.status !== 'active') return null
  // Opportunistic last-seen update; ignore failures.
  env.DB.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(sess.id).run().catch(() => {})
  return user
}

// ── Bootstrap first Owner/Admin ────────────────────────────────────────────

/**
 * POST /api/auth/bootstrap — ADMIN_KEY-gated (enforced at the gate). Creates
 * the first owner_admin. Refuses (409) if ANY user already exists.
 */
export async function bootstrapAdmin(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()
  if (existing && existing.n > 0) {
    return json({ error: 'An account already exists — bootstrap is closed' }, 409)
  }
  const body  = await readJson(request)
  const email = normEmail(body.email)
  if (!email || !email.includes('@')) return badRequest('Valid email required')
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return badRequest('Password must be at least 8 characters')
  }
  const id   = generateId('usr')
  const hash = await hashPassword(body.password)
  await env.DB.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status, view_private_notes, send_crew_notes)
    VALUES (?, ?, ?, ?, 'owner_admin', 'active', 1, 1)
  `).bind(id, email, hash, (body.displayName ?? '').trim() || null).run()
  // Do not auto-login here; the operator logs in normally afterward.
  return json({ ok: true, id, email, role: 'owner_admin' }, 201)
}

// ── Login / Logout / Me ────────────────────────────────────────────────────

/** POST /api/auth/login — { email, password } → sets session cookie. */
export async function login(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const email = normEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  // Generic failure message — never reveal whether the email exists.
  const fail = () => json({ error: 'Invalid email or password' }, 401)
  if (!email || !password) return fail()

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
  if (!user || user.status !== 'active') return fail()
  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) return fail()

  // Mint a session: store only the SHA-256 hash of the opaque token.
  const token = mintToken()
  const th    = await hashToken(token)
  const sid   = generateId('ses')
  await env.DB.prepare(`
    INSERT INTO sessions (id, token_hash, user_id, expires_at, last_seen_at, user_agent)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
  `).bind(sid, th, user.id, expiryFromNow(SESSION_TTL_DAYS),
    (request.headers.get('User-Agent') || '').slice(0, 256) || null).run()
  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
    .bind(user.id).run().catch(() => {})

  return jsonWithCookie({ ok: true, user: publicUser(user) }, buildSessionCookie(token))
}

/** POST /api/auth/logout — clears the cookie + deletes the session row. */
export async function logout(env, request) {
  const token = readSessionCookie(request)
  if (token && env.DB) {
    const th = await hashToken(token).catch(() => null)
    if (th) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run().catch(() => {})
  }
  return jsonWithCookie({ ok: true }, clearSessionCookie())
}

/** GET /api/auth/me — current user (or { user: null } when unauthenticated). */
export async function me(env, request) {
  const user = await resolveSession(request, env)
  return json({ user: publicUser(user) })
}

export { ROLES }
