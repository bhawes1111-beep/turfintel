// Invite + password-reset token helpers — Phase 4 Step 3.1.
//
// Reuses the session-token primitives in sessions.js: 32-byte CSPRNG token,
// SHA-256 hashed at rest. The raw token only ever leaves the server in the
// API response that returns the URL — never logged, never stored.
//
// Lifecycle: mint → verify → consume (one-time). Re-issue revokes prior
// active tokens for the same (user_id, type). Expired rows are transitioned
// lazily on verify; expired rows older than 7 days are pruned opportunistically
// so the table stays small without a cron.

import { mintToken, hashToken } from './sessions.js'
import { generateId } from './id.js'

export const TOKEN_TYPE_INVITE = 'invite'
export const TOKEN_TYPE_RESET  = 'password_reset'
export const TOKEN_TYPES = [TOKEN_TYPE_INVITE, TOKEN_TYPE_RESET]

// TTLs in minutes (tunable; values mirror the pre-coding report).
export const INVITE_TTL_MINUTES = 72 * 60   // 72 hours
export const RESET_TTL_MINUTES  = 30        // 30 minutes
// Used/expired/revoked rows older than this are eligible for opportunistic prune.
export const PRUNE_GRACE_DAYS = 7

/** ISO timestamp `minutes` from now. */
function expiresInMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

/** Is an ISO `expires_at` in the past? Mirrors sessions.js#isExpired. */
function isExpiredIso(iso) {
  const t = Date.parse(iso)
  return !Number.isFinite(t) || t <= Date.now()
}

/**
 * mintAuthToken — issue a fresh token row.
 *
 *   type:               'invite' | 'password_reset'
 *   userId:             target user id (nullable for future flows; required for invite/reset today)
 *   email:              recorded for audit + lookup
 *   createdByUserId:    inviting admin id (NULL for self-service reset)
 *   metadata:           any JSON-serializable snapshot (role/course_access/overrides for invites)
 *   ttlMinutes:         override TTL; defaults per token type
 *
 * Returns { token, hash, id, expiresAt } — `token` is the RAW value the
 * caller embeds in a URL. The DB stores only `hash`.
 */
export async function mintAuthToken(env, {
  type,
  userId = null,
  email,
  createdByUserId = null,
  metadata = null,
  ttlMinutes,
} = {}) {
  if (!env?.DB) throw new Error('mintAuthToken: env.DB not configured')
  if (!TOKEN_TYPES.includes(type)) throw new Error(`mintAuthToken: invalid type "${type}"`)
  if (typeof email !== 'string' || !email) throw new Error('mintAuthToken: email is required')
  const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0
    ? ttlMinutes
    : (type === TOKEN_TYPE_INVITE ? INVITE_TTL_MINUTES : RESET_TTL_MINUTES)

  const token = mintToken()
  const hash  = await hashToken(token)
  const id    = generateId('atk')
  const expiresAt = expiresInMinutes(ttl)

  await env.DB.prepare(`
    INSERT INTO auth_tokens (
      id, token_hash, token_type, user_id, email, status,
      created_by_user_id, expires_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    id, hash, type, userId, email, createdByUserId, expiresAt,
    metadata == null ? null : JSON.stringify(metadata),
  ).run()

  return { token, hash, id, expiresAt }
}

/**
 * verifyAuthToken — look up a raw token by hash; check active + unexpired,
 * and (if `expectedType` supplied) type-match. Lazily transitions
 * status='active' rows past expires_at to status='expired'.
 *
 * Returns { valid: true, row } on success, { valid: false, reason } otherwise.
 * Reasons are for internal logging only; HTTP callers MUST respond generically
 * to avoid enumeration.
 */
export async function verifyAuthToken(env, token, expectedType = null) {
  if (!env?.DB) return { valid: false, reason: 'no-db' }
  if (typeof token !== 'string' || !token) return { valid: false, reason: 'empty' }

  let hash
  try { hash = await hashToken(token) } catch { return { valid: false, reason: 'hash-failed' } }

  const row = await env.DB.prepare('SELECT * FROM auth_tokens WHERE token_hash = ?')
    .bind(hash).first().catch(() => null)
  if (!row) return { valid: false, reason: 'not-found' }

  if (row.status !== 'active') return { valid: false, reason: `status-${row.status}` }
  if (isExpiredIso(row.expires_at)) {
    // Lazy transition; best-effort.
    await env.DB.prepare("UPDATE auth_tokens SET status = 'expired' WHERE id = ? AND status = 'active'")
      .bind(row.id).run().catch(() => {})
    return { valid: false, reason: 'expired' }
  }
  if (expectedType && row.token_type !== expectedType) {
    return { valid: false, reason: 'type-mismatch' }
  }
  return { valid: true, row }
}

/**
 * consumeAuthToken — atomically mark a token used (one-time use). Uses a
 * conditional UPDATE so two simultaneous consumers can't both succeed.
 *
 * Returns true if THIS call won the race (token was active and is now used),
 * false otherwise.
 */
export async function consumeAuthToken(env, tokenHash) {
  if (!env?.DB || !tokenHash) return false
  const res = await env.DB.prepare(
    "UPDATE auth_tokens SET status = 'used', used_at = datetime('now') WHERE token_hash = ? AND status = 'active'",
  ).bind(tokenHash).run().catch(() => null)
  return !!(res && res.success && res.meta && res.meta.changes > 0)
}

/**
 * revokeActiveTokensFor — when re-issuing a token of the same type for a
 * user, revoke any prior active ones so the old URL is dead immediately.
 * Returns the number of rows revoked.
 */
export async function revokeActiveTokensFor(env, userId, type) {
  if (!env?.DB || !userId || !TOKEN_TYPES.includes(type)) return 0
  const res = await env.DB.prepare(
    "UPDATE auth_tokens SET status = 'revoked' WHERE user_id = ? AND token_type = ? AND status = 'active'",
  ).bind(userId, type).run().catch(() => null)
  return res?.meta?.changes ?? 0
}

/**
 * pruneOldTokens — best-effort delete of rows older than the grace window.
 * Safe to call from any auth handler; failures are swallowed.
 */
export async function pruneOldTokens(env) {
  if (!env?.DB) return 0
  const res = await env.DB.prepare(
    `DELETE FROM auth_tokens
     WHERE status IN ('used', 'expired', 'revoked')
       AND expires_at < datetime('now', ?)`,
  ).bind(`-${PRUNE_GRACE_DAYS} days`).run().catch(() => null)
  return res?.meta?.changes ?? 0
}
