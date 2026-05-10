// Lightweight mutation auth — Phase 5.1b.
//
// Public reads, gated writes. Every POST/PATCH/DELETE must carry
// an `x-admin-key` header matching env.ADMIN_KEY. Missing env var
// is treated as a server-misconfiguration error (503) so a deploy
// without the secret set fails closed rather than open.

export function requireAdminKey(request, env) {
  const expected = env.ADMIN_KEY
  if (!expected) {
    return {
      ok:      false,
      status:  503,
      message: 'ADMIN_KEY not configured on Worker — run: npx wrangler secret put ADMIN_KEY',
    }
  }
  const provided = request.headers.get('x-admin-key')
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }
  return { ok: true }
}

export function isMutation(method) {
  return method === 'POST' || method === 'PATCH' || method === 'DELETE'
}
