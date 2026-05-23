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
import {
  clientIp, isRateLimited, recordAttempt, clearFailures, pruneOld,
} from '../lib/rateLimit.js'
import {
  mintAuthToken, verifyAuthToken, consumeAuthToken,
  revokeActiveTokensFor, pruneOldTokens,
  TOKEN_TYPE_INVITE, TOKEN_TYPE_RESET,
} from '../lib/inviteTokens.js'
import { sendMail, resetEmailBody } from '../lib/mail.js'

// Response with a Set-Cookie header (json() can't carry custom headers).
// Exported so the set-password handler (and any future cookie-issuing
// auth endpoint) can reuse the exact same shape as login().
export function jsonWithCookie(data, cookie, status = 200) {
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
  const ip = clientIp(request)
  // Generic failure message — never reveal whether the email exists.
  const fail = () => json({ error: 'Invalid email or password' }, 401)

  // Throttle BEFORE touching the password path. A throttled request gets a
  // generic 429 — it does not reveal whether the email exists, and we do not
  // record it (so the attacker can't extend their own lockout indefinitely).
  if (await isRateLimited(env, email, ip)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  if (!email || !password) {
    await recordAttempt(env, email, ip, false)
    return fail()
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
  if (!user || user.status !== 'active') {
    await recordAttempt(env, email, ip, false)
    return fail()
  }
  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    await recordAttempt(env, email, ip, false)
    return fail()
  }

  // Success: clear this email's recent failures, record the success, prune.
  await clearFailures(env, email)
  await recordAttempt(env, email, ip, true)
  pruneOld(env)   // fire-and-forget; not awaited

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

// ── Set Password (Phase 4 Step 3.2) ─────────────────────────────────────
//
// Shared endpoint for invite-accept (token_type='invite') and password
// reset (token_type='password_reset'). The token itself is the authority —
// this handler is reached BEFORE the mutation gate in worker/index.js, so
// an unauthenticated invitee can call it.
//
// Strict order (approved in the Step 3.2 audit):
//   1) verify token       — covers missing/empty/unknown/used/expired/revoked
//   2) hash password      — PBKDF2 (~100k iters)
//   3) update users row   — password_hash + status='active'
//   4) invalidate sessions — mirrors admin password-change (users.js); no-op
//                             for fresh invitees, closes hijacked sessions
//                             for resets
//   5) consume token      — race-safe one-time-use; the password is ALREADY
//                            changed by the time consume runs, so a lost
//                            race is NOT a user-facing failure
//   6) optionally issue session — invite=yes (auto-login), reset=no (force
//                                  re-auth on the login screen)
//
// All failure modes return identical {GENERIC} 400 to prevent enumeration.
//
// TODO(hardening): PBKDF2 only runs on the success path. A valid-token
// request is therefore measurably slower than a bogus-token one, giving an
// observer a timing oracle for "is this token real?". This matches the
// existing /api/auth/login behavior (hash runs only on found user) and was
// accepted in the Step 3.2 audit. A future pass can add a constant-time
// dummy hash on the reject path to close the side-channel uniformly across
// auth surfaces.
const SET_PASSWORD_GENERIC = { error: 'This link is invalid or has expired' }

export async function setPassword(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)

  let body
  try { body = await readJson(request) } catch { return json(SET_PASSWORD_GENERIC, 400) }
  const rawToken = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  // 1) verify token. verifyAuthToken handles empty/unknown/used/expired/revoked
  //    and lazily transitions an active-but-expired row to 'expired'.
  const verdict = await verifyAuthToken(env, rawToken)
  if (!verdict.valid) return json(SET_PASSWORD_GENERIC, 400)
  const { row } = verdict
  // Defense-in-depth: schema only mints these two types today, but pin it.
  if (row.token_type !== TOKEN_TYPE_INVITE && row.token_type !== TOKEN_TYPE_RESET) {
    return json(SET_PASSWORD_GENERIC, 400)
  }
  // Weak-password parity: same generic message so a probe can't distinguish
  // "valid token + bad password" from "bad token."
  if (password.length < 8) return json(SET_PASSWORD_GENERIC, 400)

  // Target user must still exist and not be disabled. (Invite rows have
  // status='invited' here; we flip to 'active' in step 3.)
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first().catch(() => null)
  if (!user || user.status === 'disabled') return json(SET_PASSWORD_GENERIC, 400)

  // 2) hash password
  let hash
  try { hash = await hashPassword(password) } catch { return json(SET_PASSWORD_GENERIC, 400) }

  // 3) update password + flip status to 'active'
  const upd = await env.DB.prepare(
    "UPDATE users SET password_hash = ?, status = 'active', updated_at = datetime('now') WHERE id = ?",
  ).bind(hash, user.id).run().catch(() => null)
  if (!upd || !upd.success) return json(SET_PASSWORD_GENERIC, 400)

  // 4) invalidate sessions for this user (closes any hijacked session on
  //    reset; no-op for fresh invitees who have no sessions yet)
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run().catch(() => {})

  // 5) consume token (race-safe one-time-use). Password is already updated,
  //    so a lost race is not a user-facing failure — log internally only.
  await consumeAuthToken(env, row.token_hash)

  // Opportunistic prune; fire-and-forget.
  pruneOldTokens(env).catch(() => {})

  // 6) optionally issue session — invite-only per the Step 3.2 audit.
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()
  const payload = { ok: true, user: publicUser(fresh) }
  if (row.token_type === TOKEN_TYPE_INVITE) {
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
    return jsonWithCookie(payload, buildSessionCookie(token))
  }
  return json(payload)
}

// ── Token status (Phase 4 Step 3.2) ─────────────────────────────────────
//
// GET /api/auth/token-status?token=<raw>
//
// SPA pre-flight before rendering the accept-invite / reset-password form.
// Returns { valid: true, type, email } if active + unexpired + matching user,
// { valid: false } for ALL other cases (missing/empty/unknown/used/expired/
// revoked/disabled-user/type-mismatch). The single negative shape prevents an
// attacker from probing whether a specific raw token was ever issued.
//
// Public read — token IS the authority. No throttle (anonymous read with
// zero side effects); the consume path at set-password is throttle-eligible
// via the existing rate-limit table indirectly through reset-request volume.
export async function tokenStatus(env, request) {
  const NEG = { valid: false }
  if (!env.DB) return json(NEG)

  const url = new URL(request.url)
  const raw = url.searchParams.get('token') || ''
  const verdict = await verifyAuthToken(env, raw)
  if (!verdict.valid) return json(NEG)
  const { row } = verdict

  // Resolve email defensively from the users row when possible — the token
  // row's email may be stale if the admin edited the user between mint and
  // verify. Falls back to the token row.
  const user = await env.DB.prepare('SELECT email, status FROM users WHERE id = ?')
    .bind(row.user_id).first().catch(() => null)
  if (user && user.status === 'disabled') return json(NEG)
  const email = user?.email ?? row.email

  return json({ valid: true, type: row.token_type, email })
}

// ── Password reset request (Phase 4 Step 3.2) ──────────────────────────
//
// POST /api/auth/reset-request  { email }
//
// ENUMERATION-SAFE: always responds 200 with a generic body regardless of
// whether the email matches an active user. The token (if minted) is stored
// hashed; the URL appears in the response body ONLY when the caller is an
// authenticated admin (canManageUsers) — the "admin debug" interim path so
// admins can hand-deliver reset links until an email provider is wired.
//
// Throttled via the existing auth_attempts table (shared with /login): 8
// failed attempts per email OR IP per 15 min → generic 429.
//
// Decisions locked in the Step 3.2 audit:
//   - admin-mode debug.url present when actor has canManageUsers; never for
//     anonymous callers
//   - re-request revokes prior active reset tokens for the user (so old
//     links die immediately)
//   - matching no-op path mints no token but DOES sleep an attacker-visible
//     amount? No — see TODO(hardening) below; we accept timing-leak parity
//     with /login here for consistency.
const RESET_GENERIC = { ok: true, message: 'If that email is registered, a reset link has been sent.' }

export async function resetRequest(env, request, ctx) {
  if (!env.DB) return json(RESET_GENERIC)

  const ip = clientIp(request)
  let body
  try { body = await readJson(request) } catch { return json(RESET_GENERIC) }
  const email = normEmail(body?.email)

  // Rate-limit (shared with login). Throttled → generic 429.
  if (await isRateLimited(env, email, ip)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  // Record this attempt for throttle accounting regardless of outcome —
  // marks success=0 (treat as a guess). Successful set-password later
  // clears the email's failures via the existing clearFailures() helper.
  await recordAttempt(env, email, ip, false)

  // Lookup user. If absent or disabled, we still respond 200 generic.
  const user = email
    ? await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first().catch(() => null)
    : null

  // Resolve actor for the admin-mode debug.url decision. Done LAST so the
  // critical path is the same shape for everyone; only the response body
  // differs for an admin.
  const isAdmin = (await resolveSessionAsAdmin(env, request)) === true

  if (!user || user.status !== 'active') {
    return json(RESET_GENERIC)   // anonymous + admin both see this when no eligible user
  }

  // Mint a reset token. Revoke any prior active reset tokens first so the
  // old URL is dead immediately.
  await revokeActiveTokensFor(env, user.id, TOKEN_TYPE_RESET)
  const { token, expiresAt } = await mintAuthToken(env, {
    type:   TOKEN_TYPE_RESET,
    userId: user.id,
    email:  user.email,
    // created_by_user_id: NULL for self-service; admin path stays NULL too
    // because we don't store which admin requested it (admin can re-request
    // freely and the audit signal is in auth_attempts).
  })

  const origin = new URL(request.url).origin
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`

  // Phase 5: send the reset email if a provider is configured. Fire-and-
  // forget via ctx.waitUntil so the response shape + timing are identical
  // for the email-configured and no-email paths — preserves enumeration
  // safety. The send result is intentionally not reflected in the response.
  if (env.MAIL_PROVIDER && ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(sendMail(env, {
      to:      user.email,
      subject: 'Reset your TurfIntel password',
      text:    resetEmailBody({ resetUrl, expiresAt }),
    }))
  }

  // Admin-mode debug.resetUrl: auto-disabled once MAIL_PROVIDER is set, so
  // admins use email like everyone else. An explicit MAIL_DEBUG_ALLOWED
  // secret keeps the escape hatch for recovery during transition.
  // Anonymous path always sees the bare generic body.
  const debugAllowed = !env.MAIL_PROVIDER || env.MAIL_DEBUG_ALLOWED
  if (isAdmin && debugAllowed) {
    return json({ ...RESET_GENERIC, debug: { resetUrl, expiresAt } })
  }
  return json(RESET_GENERIC)
}

// Lightweight admin check — resolveSession + canManageUsers. Kept private to
// the reset-request flow so the public path stays uniform; ADMIN_KEY callers
// pass through `requireAdminKey` upstream (the gate runs after /api/auth/*,
// so we re-check here defensively).
async function resolveSessionAsAdmin(env, request) {
  // Lazy imports to avoid pulling actor.js into every cold start of auth.js.
  const { resolveActor, actorHasPermission } = await import('../lib/actor.js')
  const actor = await resolveActor(request, env)
  return actorHasPermission(actor, 'canManageUsers')
}

export { ROLES }
