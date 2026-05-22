// Login rate limiting — lightweight, D1-backed.
//
// Throttles brute-force login attempts by email OR IP within a sliding
// window. Pure helpers here; the login handler (worker/api/auth.js) calls
// them. No secrets are recorded — only email, IP, timestamp, success flag.

import { generateId } from './id.js'

export const WINDOW_MINUTES = 15
export const MAX_FAILED = 8   // failed attempts per email OR per IP in the window

/**
 * clientIp — a Worker-safe source IP for the request.
 * Prefers CF-Connecting-IP, then the first X-Forwarded-For hop, else 'unknown'.
 */
export function clientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP')
  if (cf) return cf.trim()
  const xff = request.headers.get('X-Forwarded-For')
  if (xff) return xff.split(',')[0].trim() || 'unknown'
  return 'unknown'
}

/**
 * isRateLimited — true if failed attempts for this email OR ip exceed the
 * threshold within the window. Best-effort: any DB error → not limited (fail
 * open on the throttle so a transient error never locks legitimate users out;
 * the password check still gates access).
 */
export async function isRateLimited(env, email, ip) {
  if (!env.DB) return false
  const since = `-${WINDOW_MINUTES} minutes`
  try {
    const row = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS by_email,
        SUM(CASE WHEN ip = ?    THEN 1 ELSE 0 END) AS by_ip
      FROM auth_attempts
      WHERE success = 0 AND attempted_at >= datetime('now', ?)
    `).bind(email || '', ip || '', since).first()
    const byEmail = Number(row?.by_email || 0)
    const byIp    = Number(row?.by_ip || 0)
    return byEmail >= MAX_FAILED || byIp >= MAX_FAILED
  } catch {
    return false
  }
}

/** recordAttempt — log one attempt (success or failure). Best-effort. */
export async function recordAttempt(env, email, ip, success) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      INSERT INTO auth_attempts (id, email, ip, success) VALUES (?, ?, ?, ?)
    `).bind(generateId('att'), email || null, ip || null, success ? 1 : 0).run()
  } catch { /* best-effort */ }
}

/**
 * clearFailures — on a successful login, neutralize this email's recent
 * failures so a legitimate user isn't throttled by their own earlier typos.
 * Best-effort.
 */
export async function clearFailures(env, email) {
  if (!env.DB || !email) return
  try {
    await env.DB.prepare(
      'DELETE FROM auth_attempts WHERE email = ? AND success = 0',
    ).bind(email).run()
  } catch { /* best-effort */ }
}

/**
 * pruneOld — opportunistically delete attempts older than the window so the
 * table stays small. Best-effort; safe to skip on error.
 */
export async function pruneOld(env) {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `DELETE FROM auth_attempts WHERE attempted_at < datetime('now', ?)`,
    ).bind(`-${WINDOW_MINUTES} minutes`).run()
  } catch { /* best-effort */ }
}
