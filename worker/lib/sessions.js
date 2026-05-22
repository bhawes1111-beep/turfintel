// Session tokens — opaque random tokens, stored only as SHA-256 hashes.
//
// The raw token lives ONLY in an httpOnly Secure SameSite=Lax cookie. The DB
// stores sha256(token), so a database leak does not yield usable sessions.
// No token ever appears in a URL or a log line.

export const SESSION_COOKIE = 'ti_session'
export const SESSION_TTL_DAYS = 14

const TOKEN_BYTES = 32

function toHex(bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** mintToken — 32 bytes of CSPRNG randomness as a hex string. */
export function mintToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

/** hashToken — SHA-256 hex of the raw token, for at-rest storage + lookup. */
export async function hashToken(token) {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

/** ISO timestamp `days` from now (session expiry). */
export function expiryFromNow(days = SESSION_TTL_DAYS) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

/** True if an ISO expires_at is in the past. */
export function isExpired(expiresAtIso) {
  const t = Date.parse(expiresAtIso)
  return !Number.isFinite(t) || t <= Date.now()
}

/** Build the Set-Cookie header value for a fresh session. */
export function buildSessionCookie(token, { days = SESSION_TTL_DAYS } = {}) {
  const maxAge = days * 86_400
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

/** Build the Set-Cookie header value that clears the session (logout). */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

/** Pull the raw session token out of a request's Cookie header (or null). */
export function readSessionCookie(request) {
  const header = request.headers.get('Cookie') || request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === SESSION_COOKIE) return part.slice(eq + 1).trim() || null
  }
  return null
}
