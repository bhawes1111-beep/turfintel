// Shared mutation auth — Phase 3C (session cutover, in progress).
//
// HISTORY: this module used to attach the shared `x-admin-key` header (the
// public ADMIN_KEY) to every browser mutation. Phase 3 moves browser
// mutations to SESSION-COOKIE auth: the httpOnly `ti_session` cookie rides
// along automatically when a request sets `credentials: 'same-origin'`, and
// the Worker gate enforces the logged-in user's role/permissions.
//
// During the cutover the helpers below stay (so the ~21 imports keep
// resolving) but NO LONGER emit the key:
//
//   - mutationHeaders() — JSON headers ONLY ({ 'Content-Type': ... }). No key.
//   - adminKeyHeader()  — now returns {} (multipart callers add nothing; the
//     browser still sets the multipart boundary itself).
//   - sessionInit()     — the credentials default for mutation fetches.
//
// Stores must additionally pass `credentials: 'same-origin'` on their mutation
// fetches (or merge sessionInit()) so the session cookie is sent.
//
// ADMIN_KEY remains accepted SERVER-SIDE as a fallback during the transition,
// but the browser no longer sends it. The legacy constant export below is
// retained only until Phase 3D removes it; it is no longer used by any helper.

export const ADMIN_KEY = 'TurfAdmin2025!'   // legacy; unused by helpers, removed in Phase 3D

/** JSON mutation headers — session cookie carries auth, no key header. */
export function mutationHeaders() {
  return { 'Content-Type': 'application/json' }
}

/** Multipart callers: no headers (browser sets the multipart boundary). */
export function adminKeyHeader() {
  return {}
}

/** Fetch init fragment that sends the httpOnly session cookie. */
export function sessionInit() {
  return { credentials: 'same-origin' }
}
