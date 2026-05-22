// Shared mutation auth — Phase 3D (public key retired from the bundle).
//
// Browser mutations authenticate via the httpOnly `ti_session` cookie, which
// rides along automatically when a request sets `credentials: 'same-origin'`.
// The Worker gate enforces the logged-in user's role / permissions.
//
// This file used to export a public ADMIN_KEY constant and an
// adminKeyHeader() helper (which attached `x-admin-key` to every browser
// mutation). Both have been REMOVED — no browser mutation sends the key, and
// no client file contains the literal value. The server still accepts the
// key from non-browser callers (manual tooling, transitional automation)
// during Phase 3; removal of the server-side fallback is a separate phase.
//
// Stores call mutationHeaders() for JSON Content-Type and pass
// `credentials: 'same-origin'` on their mutation fetches (or merge
// sessionInit()) so the session cookie is sent.

/** JSON mutation headers — session cookie carries auth, no key header. */
export function mutationHeaders() {
  return { 'Content-Type': 'application/json' }
}

/** Fetch init fragment that sends the httpOnly session cookie. */
export function sessionInit() {
  return { credentials: 'same-origin' }
}
