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
  extractLabelDraft,
  saveImportedLabel,
  listImportedLabels,
} from './api/inventoryLabels.js'
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
import {
  listCrewAssignments,
  getCrewAssignment,
  createCrewAssignment,
  updateCrewAssignment,
  deleteCrewAssignment,
  listEquipmentReservations,
  getEquipmentReservation,
  createEquipmentReservation,
  updateEquipmentReservation,
  deleteEquipmentReservation,
} from './api/assignments.js'
import {
  listCrewEmployees,
  getCrewEmployee,
  createCrewEmployee,
  updateCrewEmployee,
  deleteCrewEmployee,
} from './api/crew.js'
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from './api/courses.js'
import {
  listOperationsNotes,
  getOperationsNote,
  createOperationsNote,
  updateOperationsNote,
  deleteOperationsNote,
} from './api/operationsNotes.js'
import {
  listPilotFeedback,
  getPilotFeedback,
  createPilotFeedback,
  updatePilotFeedback,
  deletePilotFeedback,
} from './api/pilotFeedback.js'
import {
  listAttachments,
  getAttachment,
  streamAttachment,
  createAttachment,
  deleteAttachment,
} from './api/attachments.js'
import {
  listEmployeeSchedules,
  getEmployeeSchedule,
  createEmployeeSchedule,
  updateEmployeeSchedule,
  deleteEmployeeSchedule,
} from './api/schedules.js'
import {
  listScheduleTemplates,
  getScheduleTemplate,
  createScheduleTemplate,
  updateScheduleTemplate,
  deleteScheduleTemplate,
  applyScheduleTemplate,
} from './api/scheduleTemplates.js'
import {
  getAmbientCurrent,
  createWeatherObservation,
  listWeatherHistory,
  getLatestWeather,
  postWeatherCapture,
  captureWeatherForAllCourses,
} from './api/weather.js'
import {
  listWaterBalance,
  postWaterBalanceRollup,
  rollupAllCourses,
} from './api/waterBalance.js'

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

  // Scheduled (cron) entry point — automatic weather history capture.
  // Configured in wrangler.jsonc triggers.crons (every 30 min). Each run
  // stores an Ambient snapshot per course, with window-guard + DB-level
  // dedup so overlapping/missed ticks never duplicate rows. Best-effort:
  // failures are logged, never thrown, so a bad tick can't wedge the cron.
  async scheduled(event, env, ctx) {
    // Capture the Ambient snapshot, then roll today's water balance up from
    // it. Rollup runs after capture so the day's newest observation is
    // included. Both are best-effort and never throw.
    ctx.waitUntil(
      captureWeatherForAllCourses(env, { intervalMinutes: 30 })
        .then(r => console.log('[TurfIntel Weather] cron capture:', JSON.stringify(r)))
        .then(() => rollupAllCourses(env))
        .then(r => console.log('[TurfIntel WaterBalance] cron rollup:', JSON.stringify(r)))
        .catch(err => console.warn('[TurfIntel Weather] cron error:', err?.message)),
    )
  },
}

async function handleApi(request, env, url) {
  const { pathname } = url
  const method       = request.method
  // Phase 5.7 — operational scope filter. If the caller passes
  // ?courseId=... on a list endpoint, the handler filters by course_id.
  // Absent → unscoped (legacy behavior, preserved for direct API
  // consumers that haven't been updated).
  const courseId = url.searchParams.get('courseId')

  // ── /api/health ───────────────────────────────────────────────────────
  if (pathname === '/api/health') {
    return json({
      ok:      true,
      db:      !!env.DB,
      auth:    !!env.ADMIN_KEY,
      ambient: !!env.AMBIENT_WEATHER_API_KEY && !!env.AMBIENT_WEATHER_APPLICATION_KEY,
      ts:      new Date().toISOString(),
    })
  }

  // ── /api/weather/ambient/current ──────────────────────────────────────
  // Read-only, no D1 dependency. Handled before the D1 guard so weather
  // works even if the database binding is ever absent. Server-side only —
  // the Ambient secrets never reach the browser.
  if (pathname === '/api/weather/ambient/current') {
    if (method === 'GET') return getAmbientCurrent(env)
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

  // ── /api/weather/current ──────────────────────────────────────────────
  // Latest STORED observation for the course (most recent capture).
  if (pathname === '/api/weather/current') {
    if (method === 'GET') return getLatestWeather(env, courseId)
  }

  // ── /api/weather/history ──────────────────────────────────────────────
  if (pathname === '/api/weather/history') {
    if (method === 'GET') {
      const from  = url.searchParams.get('from')  || null
      const to    = url.searchParams.get('to')    || null
      const limit = url.searchParams.get('limit') || null
      return listWeatherHistory(env, courseId, { from, to, limit })
    }
  }

  // ── /api/weather/observations ─────────────────────────────────────────
  // POST is mutation-gated above. Stores one normalized snapshot.
  if (pathname === '/api/weather/observations') {
    if (method === 'POST') return createWeatherObservation(env, request)
  }

  // ── /api/weather/capture ──────────────────────────────────────────────
  // Manual trigger of the SAME server-side Ambient capture the cron runs
  // (for testing + an optional UI button). Mutation-gated above. Honors
  // the window-guard + dedup, so spamming it won't create duplicates.
  if (pathname === '/api/weather/capture') {
    if (method === 'POST') return postWeatherCapture(env, courseId)
  }

  // ── /api/water-balance ────────────────────────────────────────────────
  // Daily ET / rainfall / net rollup (Irrigation Intelligence Foundation).
  if (pathname === '/api/water-balance') {
    if (method === 'GET') {
      const days = url.searchParams.get('days') || null
      return listWaterBalance(env, courseId, { days })
    }
  }

  // ── /api/water-balance/rollup ─────────────────────────────────────────
  // Manual rollup (+ optional backfill / GA-Network etReference). The cron
  // also runs the rollup automatically after each capture. Mutation-gated.
  if (pathname === '/api/water-balance/rollup') {
    if (method === 'POST') return postWaterBalanceRollup(env, request, courseId)
  }

  // ── /api/equipment ────────────────────────────────────────────────────
  if (pathname === '/api/equipment') {
    if (method === 'GET')  return listEquipment(env, courseId)
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
    if (method === 'GET')  return listMaintenance(env, courseId)
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
    if (method === 'GET')  return listRepairs(env, courseId)
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
    if (method === 'GET')  return listInventory(env, courseId)
    if (method === 'POST') return createInventory(env, request)
  }

  // ── /api/inventory/usage ──────────────────────────────────────────────
  // NOTE: This route must be matched BEFORE /api/inventory/:id below,
  // because 'usage' would otherwise be consumed as an id.
  if (pathname === '/api/inventory/usage') {
    if (method === 'GET')  return listInventoryUsage(env, courseId)
    if (method === 'POST') return recordInventoryUsage(env, request)
  }

  // ── /api/inventory/import-label/* (Phase 19 — Chemical Import Wizard) ──
  // Must precede /api/inventory/:id. POSTs are mutation-gated above.
  if (pathname === '/api/inventory/import-label/extract') {
    if (method === 'POST') return extractLabelDraft(env, request)
  }
  if (pathname === '/api/inventory/import-label/save') {
    if (method === 'POST') return saveImportedLabel(env, request)
  }
  if (pathname === '/api/inventory/import-label/labels') {
    if (method === 'GET')  return listImportedLabels(env, courseId)
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
    if (method === 'GET')  return listSprays(env, courseId)
    if (method === 'POST') return createSpray(env, request)
  }

  // ── /api/sprays/:id ───────────────────────────────────────────────────
  const sprayMatch = pathname.match(/^\/api\/sprays\/([^/]+)$/)
  if (sprayMatch) {
    const id = decodeURIComponent(sprayMatch[1])
    if (method === 'GET')    return getSpray(env, id)
    if (method === 'PATCH')  return updateSpray(env, id, request)
    if (method === 'DELETE') return deleteSpray(env, id, request)
  }

  // ── /api/calendar-events ──────────────────────────────────────────────
  if (pathname === '/api/calendar-events') {
    if (method === 'GET')  return listCalendarEvents(env, courseId)
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
    if (method === 'GET')  return listAlerts(env, courseId)
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

  // ── /api/crew-assignments ─────────────────────────────────────────────
  if (pathname === '/api/crew-assignments') {
    if (method === 'GET')  return listCrewAssignments(env, courseId)
    if (method === 'POST') return createCrewAssignment(env, request)
  }

  // ── /api/crew-assignments/:id ─────────────────────────────────────────
  const crewMatch = pathname.match(/^\/api\/crew-assignments\/([^/]+)$/)
  if (crewMatch) {
    const id = decodeURIComponent(crewMatch[1])
    if (method === 'GET')    return getCrewAssignment(env, id)
    if (method === 'PATCH')  return updateCrewAssignment(env, id, request)
    if (method === 'DELETE') return deleteCrewAssignment(env, id)
  }

  // ── /api/equipment-reservations ───────────────────────────────────────
  if (pathname === '/api/equipment-reservations') {
    if (method === 'GET')  return listEquipmentReservations(env, courseId)
    if (method === 'POST') return createEquipmentReservation(env, request)
  }

  // ── /api/equipment-reservations/:id ───────────────────────────────────
  const resMatch = pathname.match(/^\/api\/equipment-reservations\/([^/]+)$/)
  if (resMatch) {
    const id = decodeURIComponent(resMatch[1])
    if (method === 'GET')    return getEquipmentReservation(env, id)
    if (method === 'PATCH')  return updateEquipmentReservation(env, id, request)
    if (method === 'DELETE') return deleteEquipmentReservation(env, id)
  }

  // ── /api/crew-employees ───────────────────────────────────────────────
  if (pathname === '/api/crew-employees') {
    if (method === 'GET')  return listCrewEmployees(env, courseId)
    if (method === 'POST') return createCrewEmployee(env, request)
  }

  // ── /api/crew-employees/:id ───────────────────────────────────────────
  const empMatch = pathname.match(/^\/api\/crew-employees\/([^/]+)$/)
  if (empMatch) {
    const id = decodeURIComponent(empMatch[1])
    if (method === 'GET')    return getCrewEmployee(env, id)
    if (method === 'PATCH')  return updateCrewEmployee(env, id, request)
    if (method === 'DELETE') return deleteCrewEmployee(env, id)
  }

  // ── /api/attachments/:id/file (must precede /api/attachments/:id) ─────
  const attachFileMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/file$/)
  if (attachFileMatch) {
    const id = decodeURIComponent(attachFileMatch[1])
    if (method === 'GET') return streamAttachment(env, id)
  }

  // ── /api/attachments ──────────────────────────────────────────────────
  if (pathname === '/api/attachments') {
    if (method === 'GET') {
      const parentType = url.searchParams.get('parentType') || null
      const parentId   = url.searchParams.get('parentId')   || null
      return listAttachments(env, courseId, { parentType, parentId })
    }
    if (method === 'POST') return createAttachment(env, request)
  }

  // ── /api/attachments/:id ──────────────────────────────────────────────
  const attachMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachMatch) {
    const id = decodeURIComponent(attachMatch[1])
    if (method === 'GET')    return getAttachment(env, id)
    if (method === 'DELETE') return deleteAttachment(env, id)
  }

  // ── /api/schedule-templates/:id/apply (must precede /:id) ────────────
  const tplApplyMatch = pathname.match(/^\/api\/schedule-templates\/([^/]+)\/apply$/)
  if (tplApplyMatch) {
    const id = decodeURIComponent(tplApplyMatch[1])
    if (method === 'POST') return applyScheduleTemplate(env, id)
  }

  // ── /api/schedule-templates ───────────────────────────────────────────
  if (pathname === '/api/schedule-templates') {
    if (method === 'GET')  return listScheduleTemplates(env, courseId)
    if (method === 'POST') return createScheduleTemplate(env, request)
  }

  // ── /api/schedule-templates/:id ───────────────────────────────────────
  const tplMatch = pathname.match(/^\/api\/schedule-templates\/([^/]+)$/)
  if (tplMatch) {
    const id = decodeURIComponent(tplMatch[1])
    if (method === 'GET')    return getScheduleTemplate(env, id)
    if (method === 'PATCH')  return updateScheduleTemplate(env, id, request)
    if (method === 'DELETE') return deleteScheduleTemplate(env, id)
  }

  // ── /api/employee-schedules ───────────────────────────────────────────
  if (pathname === '/api/employee-schedules') {
    if (method === 'GET')  return listEmployeeSchedules(env, courseId)
    if (method === 'POST') return createEmployeeSchedule(env, request)
  }

  // ── /api/employee-schedules/:id ───────────────────────────────────────
  const schedMatch = pathname.match(/^\/api\/employee-schedules\/([^/]+)$/)
  if (schedMatch) {
    const id = decodeURIComponent(schedMatch[1])
    if (method === 'GET')    return getEmployeeSchedule(env, id)
    if (method === 'PATCH')  return updateEmployeeSchedule(env, id, request)
    if (method === 'DELETE') return deleteEmployeeSchedule(env, id)
  }

  // ── /api/operations-notes ─────────────────────────────────────────────
  if (pathname === '/api/operations-notes') {
    if (method === 'GET') {
      const date   = url.searchParams.get('date')   || null
      const status = url.searchParams.get('status') || 'active'
      return listOperationsNotes(env, courseId, { date, status })
    }
    if (method === 'POST') return createOperationsNote(env, request)
  }

  // ── /api/operations-notes/:id ─────────────────────────────────────────
  const notesMatch = pathname.match(/^\/api\/operations-notes\/([^/]+)$/)
  if (notesMatch) {
    const id = decodeURIComponent(notesMatch[1])
    if (method === 'GET')    return getOperationsNote(env, id)
    if (method === 'PATCH')  return updateOperationsNote(env, id, request)
    if (method === 'DELETE') return deleteOperationsNote(env, id)
  }

  // ── /api/pilot-feedback ────────────────────────────────────────────────
  if (pathname === '/api/pilot-feedback') {
    if (method === 'GET') {
      const status   = url.searchParams.get('status')   || null
      const category = url.searchParams.get('category') || null
      return listPilotFeedback(env, courseId, { status, category })
    }
    if (method === 'POST') return createPilotFeedback(env, request)
  }

  // ── /api/pilot-feedback/:id ────────────────────────────────────────────
  const feedbackMatch = pathname.match(/^\/api\/pilot-feedback\/([^/]+)$/)
  if (feedbackMatch) {
    const id = decodeURIComponent(feedbackMatch[1])
    if (method === 'GET')    return getPilotFeedback(env, id)
    if (method === 'PATCH')  return updatePilotFeedback(env, id, request)
    if (method === 'DELETE') return deletePilotFeedback(env, id)
  }

  // ── /api/courses ──────────────────────────────────────────────────────
  if (pathname === '/api/courses') {
    if (method === 'GET')  return listCourses(env)
    if (method === 'POST') return createCourse(env, request)
  }

  // ── /api/courses/:id ──────────────────────────────────────────────────
  const courseMatch = pathname.match(/^\/api\/courses\/([^/]+)$/)
  if (courseMatch) {
    const id = decodeURIComponent(courseMatch[1])
    if (method === 'GET')    return getCourse(env, id)
    if (method === 'PATCH')  return updateCourse(env, id, request)
    if (method === 'DELETE') return deleteCourse(env, id)
  }

  return notFound()
}
