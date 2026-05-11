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
import {
  listInventory,
  getInventory,
  createInventory,
  updateInventory,
  deleteInventory,
  listInventoryUsage,
  recordInventoryUsage,
} from './api/inventory.js'
import {
  listSprays,
  getSpray,
  createSpray,
  updateSpray,
  deleteSpray,
} from './api/sprays.js'
import {
  listCalendarEvents,
  getCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from './api/calendar.js'
import {
  listAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
} from './api/alerts.js'

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

  // ── /api/inventory ────────────────────────────────────────────────────
  if (pathname === '/api/inventory') {
    if (method === 'GET')  return listInventory(env)
    if (method === 'POST') return createInventory(env, request)
  }

  // ── /api/inventory/usage ──────────────────────────────────────────────
  // NOTE: This route must be matched BEFORE /api/inventory/:id below,
  // because 'usage' would otherwise be consumed as an id.
  if (pathname === '/api/inventory/usage') {
    if (method === 'GET')  return listInventoryUsage(env)
    if (method === 'POST') return recordInventoryUsage(env, request)
  }

  // ── /api/inventory/:id ────────────────────────────────────────────────
  const invMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/)
  if (invMatch) {
    const id = decodeURIComponent(invMatch[1])
    if (method === 'GET')    return getInventory(env, id)
    if (method === 'PATCH')  return updateInventory(env, id, request)
    if (method === 'DELETE') return deleteInventory(env, id)
  }

  // ── /api/sprays ───────────────────────────────────────────────────────
  if (pathname === '/api/sprays') {
    if (method === 'GET')  return listSprays(env)
    if (method === 'POST') return createSpray(env, request)
  }

  // ── /api/sprays/:id ───────────────────────────────────────────────────
  const sprayMatch = pathname.match(/^\/api\/sprays\/([^/]+)$/)
  if (sprayMatch) {
    const id = decodeURIComponent(sprayMatch[1])
    if (method === 'GET')    return getSpray(env, id)
    if (method === 'PATCH')  return updateSpray(env, id, request)
    if (method === 'DELETE') return deleteSpray(env, id)
  }

  // ── /api/calendar-events ──────────────────────────────────────────────
  if (pathname === '/api/calendar-events') {
    if (method === 'GET')  return listCalendarEvents(env)
    if (method === 'POST') return createCalendarEvent(env, request)
  }

  // ── /api/calendar-events/:id ──────────────────────────────────────────
  const calMatch = pathname.match(/^\/api\/calendar-events\/([^/]+)$/)
  if (calMatch) {
    const id = decodeURIComponent(calMatch[1])
    if (method === 'GET')    return getCalendarEvent(env, id)
    if (method === 'PATCH')  return updateCalendarEvent(env, id, request)
    if (method === 'DELETE') return deleteCalendarEvent(env, id)
  }

  // ── /api/alerts ───────────────────────────────────────────────────────
  if (pathname === '/api/alerts') {
    if (method === 'GET')  return listAlerts(env)
    if (method === 'POST') return createAlert(env, request)
  }

  // ── /api/alerts/:id ───────────────────────────────────────────────────
  const alertMatch = pathname.match(/^\/api\/alerts\/([^/]+)$/)
  if (alertMatch) {
    const id = decodeURIComponent(alertMatch[1])
    if (method === 'GET')    return getAlert(env, id)
    if (method === 'PATCH')  return updateAlert(env, id, request)
    if (method === 'DELETE') return deleteAlert(env, id)
  }

  return notFound()
}
