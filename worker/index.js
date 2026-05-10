// TurfIntel Worker entry — Phase 5.0
//
// /api/*  → handled here against the D1 binding
// every other request → served from the static ASSETS binding (SPA fallback
// for unknown paths is configured in wrangler.jsonc).

import { json, notFound, serverError } from './lib/json.js'
import { requireAdminKey, isMutation } from './lib/auth.js'
import {
  listEquipment,
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from './api/equipment.js'
import {
  listMaintenance,
  getMaintenance,
  createMaintenance,
  updateMaintenance,
} from './api/maintenance.js'
import {
  listRepairs,
  getRepair,
  createRepair,
  updateRepair,
  deleteRepair,
} from './api/repairs.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url)
      } catch (err) {
        return serverError(err)
      }
    }

    // Defer everything else to the static asset binding.
    return env.ASSETS.fetch(request)
  },
}

async function handleApi(request, env, url) {
  const { pathname } = url
  const method       = request.method

  // ── /api/health ───────────────────────────────────────────────────────
  if (pathname === '/api/health') {
    return json({
      ok:   true,
      db:   !!env.DB,
      auth: !!env.ADMIN_KEY,
      ts:   new Date().toISOString(),
    })
  }

  // ── Mutation auth gate (Phase 5.1b) ─────────────────────────────────
  // Every POST/PATCH/DELETE must carry a valid x-admin-key header.
  // GETs remain public. The gate runs before the D1 check so that an
  // unauthenticated mutation rejects with 401 even if D1 is unbound.
  if (isMutation(method)) {
    const check = requireAdminKey(request, env)
    if (!check.ok) return json({ error: check.message }, check.status)
  }

  // Until the D1 binding is bootstrapped (see wrangler.jsonc), every
  // resource endpoint returns empty data instead of crashing. This keeps
  // the frontend functional with empty operational state.
  if (!env.DB) {
    if (method === 'GET') return json([])
    return json({ error: 'D1 not configured yet — run the bootstrap commands in wrangler.jsonc' }, 503)
  }

  // ── /api/equipment ────────────────────────────────────────────────────
  if (pathname === '/api/equipment') {
    if (method === 'GET')  return listEquipment(env)
    if (method === 'POST') return createEquipment(env, request)
  }

  // ── /api/equipment/:id ────────────────────────────────────────────────
  const eqMatch = pathname.match(/^\/api\/equipment\/([^/]+)$/)
  if (eqMatch) {
    const id = decodeURIComponent(eqMatch[1])
    if (method === 'GET')    return getEquipment(env, id)
    if (method === 'PATCH')  return updateEquipment(env, id, request)
    if (method === 'DELETE') return deleteEquipment(env, id)
  }

  // ── /api/maintenance ──────────────────────────────────────────────────
  if (pathname === '/api/maintenance') {
    if (method === 'GET')  return listMaintenance(env)
    if (method === 'POST') return createMaintenance(env, request)
  }

  // ── /api/maintenance/:id ──────────────────────────────────────────────
  const mlMatch = pathname.match(/^\/api\/maintenance\/([^/]+)$/)
  if (mlMatch) {
    const id = decodeURIComponent(mlMatch[1])
    if (method === 'GET')   return getMaintenance(env, id)
    if (method === 'PATCH') return updateMaintenance(env, id, request)
  }

  // ── /api/repairs ──────────────────────────────────────────────────────
  if (pathname === '/api/repairs') {
    if (method === 'GET')  return listRepairs(env)
    if (method === 'POST') return createRepair(env, request)
  }

  // ── /api/repairs/:id ──────────────────────────────────────────────────
  const repMatch = pathname.match(/^\/api\/repairs\/([^/]+)$/)
  if (repMatch) {
    const id = decodeURIComponent(repMatch[1])
    if (method === 'GET')    return getRepair(env, id)
    if (method === 'PATCH')  return updateRepair(env, id, request)
    if (method === 'DELETE') return deleteRepair(env, id)
  }

  return notFound()
}
