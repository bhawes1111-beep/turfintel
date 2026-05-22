// Server-key mutation auth — Phase 5.1b + Phase 3B (dual key).
//
// Public reads, gated writes. A POST/PATCH/DELETE may carry an `x-admin-key`
// header matching EITHER:
//   - env.ADMIN_KEY      — the legacy key (still shipped in the client bundle
//     and sent by the stores during the Phase 3 cutover; kept valid).
//   - env.AUTOMATION_KEY — a SERVER-ONLY key (Worker secret) for internal /
//     manual tooling. Never imported under src/, never in the browser bundle.
//
// Both keys resolve to the same synthetic owner_admin automation actor
// (worker/lib/actor.js). If NEITHER env var is configured, that's a
// server-misconfiguration (503) so a deploy without any key fails closed.
//
// Cron does NOT use this — the scheduled() handler calls capture/rollup
// in-process, with no HTTP and no key. This function only gates HTTP requests.

export function requireAdminKey(request, env) {
  const adminKey = env.ADMIN_KEY
  const autoKey  = env.AUTOMATION_KEY
  if (!adminKey && !autoKey) {
    return {
      ok:      false,
      status:  503,
      message: 'No server key configured on Worker — run: npx wrangler secret put ADMIN_KEY',
    }
  }
  const provided = request.headers.get('x-admin-key')
  const matches = !!provided && ((adminKey && provided === adminKey) || (autoKey && provided === autoKey))
  if (!matches) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }
  return { ok: true }
}

export function isMutation(method) {
  return method === 'POST' || method === 'PATCH' || method === 'DELETE'
}
