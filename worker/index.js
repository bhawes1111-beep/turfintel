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
  patchInventoryCatalogLink,
  patchInventoryCostBasis,
  listInventoryCostBasisAudit,
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
  listSprayPrograms,
  getSprayProgram,
  createSprayProgram,
  updateSprayProgram,
  archiveSprayProgram,
  listSprayProgramItems,
  createSprayProgramItem,
  updateSprayProgramItem,
  deleteSprayProgramItem,
  patchSprayProgramItemCompletedLink,
} from './api/sprayPrograms.js'
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
  listTaskTemplates,
  getTaskTemplate,
  createTaskTemplate,
  updateTaskTemplate,
} from './api/taskTemplates.js'
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
import {
  listMoisture,
  getMoisture,
  createMoisture,
  updateMoisture,
  deleteMoisture,
} from './api/moisture.js'
import {
  listConditionLogs,
  getConditionLogByDate,
  upsertConditionLog,
  deleteConditionLog,
} from './api/conditionLog.js'
import {
  listNutrition,
  getNutrition,
  createNutrition,
  updateNutrition,
  deleteNutrition,
} from './api/nutrition.js'
import {
  listCulturalPractices,
  getCulturalPractice,
  createCulturalPractice,
  updateCulturalPractice,
  deleteCulturalPractice,
} from './api/culturalPractices.js'
import {
  listDisease,
  getDisease,
  createDisease,
  updateDisease,
  deleteDisease,
} from './api/disease.js'
import {
  listTurfHealth,
  getTurfHealth,
  createTurfHealth,
  updateTurfHealth,
  deleteTurfHealth,
} from './api/turfHealth.js'
import {
  listProductCatalog,
  getProductCatalog,
} from './api/productCatalog.js'
import {
  bootstrapAdmin,
  login,
  logout,
  me,
  setPassword,
  tokenStatus,
  resetRequest,
} from './api/auth.js'
import {
  listUsers,
  createUser,
  inviteUser,
  updateUser,
} from './api/users.js'
import { resolveActor, actorHasPermission } from './lib/actor.js'
import { isMutationAllowed, ruleNeedsBody } from './lib/mutationPermissions.js'
// Phase 9C.5c3 — Auto-translate kiosk content via Cloudflare Workers AI.
import { runAutoTranslateSweep } from './lib/autoTranslate.js'
// Phase 9C.5c3d — Translation diagnostics surfaced via ?debug=1 on the
// manual trigger route. Returns the most-recent translate() attempts
// (provider payload mode + privacy-safe response shape + caught error)
// so admins can see why a translation came back null without leaking
// source / translated text into HTTP responses.
import { getLastTranslateAttempts } from './lib/translate.js'
import {
  isCourseScopedReadPath,
  courseReadDecision,
  emptyBodyForPath,
  filterCoursesForActor,
  enforceRowCourseAccess,
} from './lib/courseScope.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url, ctx)
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
    // Phase 9C.5c3 — Auto-translate kiosk content for Spanish-needing
    // crew members. Best-effort: early-returns when no employee needs
    // translation, never throws, budget-capped via TRANSLATE_MAX_PER_RUN.
    // Runs alongside the weather job (independent waitUntil so a slow
    // translation provider doesn't block the weather pipeline).
    ctx.waitUntil(
      runAutoTranslateSweep(env)
        .then(s => console.log('[TurfIntel Translate] cron sweep:', JSON.stringify(s)))
        .catch(err => console.warn('[TurfIntel Translate] cron error:', err?.message)),
    )
  },
}

async function handleApi(request, env, url, ctx) {
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

  // ── /api/auth/* ─────────────────────────────────────────────────────
  // Handled BEFORE the mutation gate: login/logout establish identity and
  // cannot require a pre-existing session, and bootstrap does its own
  // ADMIN_KEY check. /me is a public read (returns { user: null } if absent).
  if (pathname === '/api/auth/bootstrap' && method === 'POST') {
    const check = requireAdminKey(request, env)         // bootstrap is key-gated
    if (!check.ok) return json({ error: check.message }, check.status)
    return bootstrapAdmin(env, request)
  }
  if (pathname === '/api/auth/login'  && method === 'POST') return login(env, request)
  if (pathname === '/api/auth/logout' && method === 'POST') return logout(env, request)
  if (pathname === '/api/auth/me'     && method === 'GET')  return me(env, request)
  // Token-gated: the invitee/resetter has no session — the auth_tokens row
  // is the authority. Must be handled BEFORE the mutation gate below.
  if (pathname === '/api/auth/set-password'  && method === 'POST') return setPassword(env, request)
  if (pathname === '/api/auth/token-status'  && method === 'GET')  return tokenStatus(env, request)
  // Self-service: enumeration-safe, throttled (shares auth_attempts with /login).
  // Admin-mode response additionally includes debug.resetUrl when the caller
  // has canManageUsers — for hand-delivering reset links pre-email-provider.
  if (pathname === '/api/auth/reset-request' && method === 'POST') return resetRequest(env, request, ctx)

  // ── Mutation auth + permission gate (Phase 2 P2) ────────────────────
  // Every POST/PATCH/DELETE must be authorized by EITHER a valid session
  // cookie OR the x-admin-key header (401 otherwise). GETs remain public.
  //
  // ADMIN_KEY stays fully valid (cron, internal tools, transition) and maps to
  // a synthetic owner_admin that passes every check. A session actor is now
  // permission-ENFORCED per route via worker/lib/mutationPermissions.js: a
  // mapped route requires the named permission (403 if missing); unmapped
  // mutation routes still allow any authenticated actor. owner_admin and
  // superintendent pass everything operational through the matrix.
  if (isMutation(method)) {
    const actor = await resolveActor(request, env)
    if (!actor) {
      const keyCheck = requireAdminKey(request, env)   // produces the 401/503 message
      return json({ error: keyCheck.message }, keyCheck.status)
    }
    // Some rules (crew-assignments status-only PATCH) inspect the body. Parse
    // a CLONE so the handler still sees the original request stream.
    let body = null
    if (method !== 'DELETE' && ruleNeedsBody(pathname)) {
      try { body = await request.clone().json() } catch { body = null }
    }
    if (!isMutationAllowed(actor, pathname, method, body)) {
      return json({ error: 'Forbidden — missing required permission' }, 403)
    }
  }

  // ── Course-access read scoping (Phase 2 P3) ─────────────────────────
  // For course-scoped GET reads, a RESTRICTED user requesting a course they
  // can't access (or holding an empty allow-list) gets an empty result
  // instead of another course's data. owner_admin / superintendent /
  // ADMIN_KEY and users with course_access = NULL are unrestricted, so the
  // single-course production default is unchanged. Reads stay public (no 401
  // added) — only the data scope narrows.
  if (method === 'GET' && isCourseScopedReadPath(pathname)) {
    const actor = await resolveActor(request, env)
    if (actor) {   // anonymous reads keep legacy behavior (no widening/narrowing)
      const decision = courseReadDecision(actor, courseId)
      if (!decision.allow) return json(emptyBodyForPath(pathname))
    }
  }

  // Until the D1 binding is bootstrapped (see wrangler.jsonc), every
  // resource endpoint returns empty data instead of crashing. This keeps
  // the frontend functional with empty operational state.
  if (!env.DB) {
    if (method === 'GET') return json([])
    return json({ error: 'D1 not configured yet — run the bootstrap commands in wrangler.jsonc' }, 503)
  }

  // ── /api/admin/translate/run — manual auto-translation sweep (Phase 9C.5c3b)
  //
  // Authenticated-admin-only trigger for the same translation sweep the
  // 30-min cron runs. Useful for:
  //   • troubleshooting a row that the cron didn't translate
  //   • forcing an immediate refresh after a new English-only briefing
  //     so kiosks show Spanish before the next cron tick
  //   • dry-run preview without actually translating (?dryRun=1)
  //
  // Authorization:
  //   • Path is reached only after the mutation gate above, which has
  //     already enforced "valid session OR ADMIN_KEY" (401 otherwise).
  //   • In addition, we require `canSystemSettings` so only owner_admin
  //     (or the ADMIN_KEY synthetic actor) can fire it. Translation
  //     calls cost real money and can hammer Workers AI rate limits, so
  //     this stays gated above the operational tier (superintendents
  //     don't get it). 403 otherwise.
  //   • The endpoint is therefore NEVER reachable from anonymous /
  //     public/no-login callers, including the public kiosk route.
  if (pathname === '/api/admin/translate/run' && method === 'POST') {
    const actor = await resolveActor(request, env)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (!actorHasPermission(actor, 'canSystemSettings')) {
      return json({ error: 'Forbidden — canSystemSettings required' }, 403)
    }
    const dryRun = url.searchParams.get('dryRun') === '1'
    const debug  = url.searchParams.get('debug')  === '1'
    if (dryRun) {
      // Same gating logic as the real sweep, but never calls the
      // provider — returns the would-translate row counts so an admin
      // can preview without spending neurons. Implemented by flipping
      // TRANSLATE_PROVIDER to 'none' on a one-shot env clone; the
      // sweep's existing kill-switch short-circuit makes this safe.
      const fakeEnv = { ...env, TRANSLATE_PROVIDER: 'none' }
      const summary = await runAutoTranslateSweep(fakeEnv)
      return json({ ok: true, dryRun: true, summary })
    }
    // Phase 9C.5c3d — Debug mode runs ONE row through the sweep
    // (TRANSLATE_MAX_PER_RUN=1 on an env clone) and returns the
    // privacy-safe attempts buffer from the last translate() call.
    // Each attempt entry holds only { mode, ok, shape, error } so the
    // admin can see what the Workers AI runtime actually returned
    // without any source or translated text leaking into the HTTP
    // response.
    if (debug) {
      const debugEnv = { ...env, TRANSLATE_MAX_PER_RUN: '1' }
      const summary  = await runAutoTranslateSweep(debugEnv)
      const attempts = getLastTranslateAttempts(debugEnv)
      return json({
        ok: true,
        summary,
        diagnostics: {
          provider: env.TRANSLATE_PROVIDER ?? 'none',
          model:    env.TRANSLATE_MODEL    ?? null,
          attempts,
        },
      })
    }
    const summary = await runAutoTranslateSweep(env)
    return json({ ok: true, summary })
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

  // ── /api/moisture ─────────────────────────────────────────────────────
  // Field moisture observations (Moisture + Handwatering Intelligence).
  if (pathname === '/api/moisture') {
    if (method === 'GET') {
      const location = url.searchParams.get('location') || null
      const days     = url.searchParams.get('days')     || null
      const limit    = url.searchParams.get('limit')    || null
      return listMoisture(env, courseId, { location, days, limit })
    }
    if (method === 'POST') return createMoisture(env, request)
  }

  // ── /api/moisture/:id ─────────────────────────────────────────────────
  const moistureMatch = pathname.match(/^\/api\/moisture\/([^/]+)$/)
  if (moistureMatch) {
    const id = decodeURIComponent(moistureMatch[1])
    if (method === 'GET')    return getMoisture(env, id)
    if (method === 'PATCH')  return updateMoisture(env, id, request)
    if (method === 'DELETE') return deleteMoisture(env, id)
  }

  // ── /api/condition-logs/by-date ───────────────────────────────────────
  // Matched BEFORE /:id so "by-date" isn't treated as an id.
  if (pathname === '/api/condition-logs/by-date') {
    if (method === 'GET') {
      const date = url.searchParams.get('date') || null
      const actor = await resolveActor(request, env)
      const canViewPrivate = actorHasPermission(actor, 'canViewPrivateNotes')
      return getConditionLogByDate(env, courseId, date, canViewPrivate)
    }
  }

  // ── /api/condition-logs ───────────────────────────────────────────────
  // Superintendent's structured daily field log (one per course/date).
  // private_notes is stripped server-side unless the resolved actor has
  // canViewPrivateNotes (owner_admin / superintendent / override / ADMIN_KEY).
  if (pathname === '/api/condition-logs') {
    if (method === 'GET') {
      const days = url.searchParams.get('days') || null
      const actor = await resolveActor(request, env)
      const canViewPrivate = actorHasPermission(actor, 'canViewPrivateNotes')
      return listConditionLogs(env, courseId, { days }, canViewPrivate)
    }
    if (method === 'POST') {
      const actor = await resolveActor(request, env)
      const canViewPrivate = actorHasPermission(actor, 'canViewPrivateNotes')
      return upsertConditionLog(env, request, canViewPrivate)   // upsert
    }
  }

  // ── /api/condition-logs/:id ───────────────────────────────────────────
  const conditionMatch = pathname.match(/^\/api\/condition-logs\/([^/]+)$/)
  if (conditionMatch) {
    const id = decodeURIComponent(conditionMatch[1])
    if (method === 'DELETE') return deleteConditionLog(env, id)
  }

  // ── /api/nutrition ────────────────────────────────────────────────────
  // Standalone nutrient applications (Plant Nutrition Intelligence).
  if (pathname === '/api/nutrition') {
    if (method === 'GET') {
      const days  = url.searchParams.get('days')  || null
      const limit = url.searchParams.get('limit') || null
      return listNutrition(env, courseId, { days, limit })
    }
    if (method === 'POST') return createNutrition(env, request)
  }

  // ── /api/nutrition/:id ────────────────────────────────────────────────
  const nutritionMatch = pathname.match(/^\/api\/nutrition\/([^/]+)$/)
  if (nutritionMatch) {
    const id = decodeURIComponent(nutritionMatch[1])
    if (method === 'GET')    return getNutrition(env, id)
    if (method === 'PATCH')  return updateNutrition(env, id, request)
    if (method === 'DELETE') return deleteNutrition(env, id)
  }

  // ── /api/cultural-practices ───────────────────────────────────────────
  if (pathname === '/api/cultural-practices') {
    if (method === 'GET') {
      const days   = url.searchParams.get('days')   || null
      const status = url.searchParams.get('status') || null
      const limit  = url.searchParams.get('limit')  || null
      return listCulturalPractices(env, courseId, { days, status, limit })
    }
    if (method === 'POST') return createCulturalPractice(env, request)
  }

  // ── /api/cultural-practices/:id ───────────────────────────────────────
  const cpMatch = pathname.match(/^\/api\/cultural-practices\/([^/]+)$/)
  if (cpMatch) {
    const id = decodeURIComponent(cpMatch[1])
    if (method === 'GET')    return getCulturalPractice(env, id)
    if (method === 'PATCH')  return updateCulturalPractice(env, id, request)
    if (method === 'DELETE') return deleteCulturalPractice(env, id)
  }

  // ── /api/disease ──────────────────────────────────────────────────────
  if (pathname === '/api/disease') {
    if (method === 'GET') {
      const days   = url.searchParams.get('days')   || null
      const status = url.searchParams.get('status') || null
      const limit  = url.searchParams.get('limit')  || null
      return listDisease(env, courseId, { days, status, limit })
    }
    if (method === 'POST') return createDisease(env, request)
  }

  // ── /api/disease/:id ──────────────────────────────────────────────────
  const dzMatch = pathname.match(/^\/api\/disease\/([^/]+)$/)
  if (dzMatch) {
    const id = decodeURIComponent(dzMatch[1])
    if (method === 'GET')    return getDisease(env, id)
    if (method === 'PATCH')  return updateDisease(env, id, request)
    if (method === 'DELETE') return deleteDisease(env, id)
  }

  // ── /api/turf-health ──────────────────────────────────────────────────
  // Phase 7B.1 — shade / airflow / weak-turf / chronic-stress observations.
  // Same routing shape as /api/disease; mutation auth applied centrally.
  if (pathname === '/api/turf-health') {
    if (method === 'GET') {
      const days       = url.searchParams.get('days')       || null
      const status     = url.searchParams.get('status')     || null
      const healthType = url.searchParams.get('healthType') || null
      const limit      = url.searchParams.get('limit')      || null
      return listTurfHealth(env, courseId, { days, status, healthType, limit })
    }
    if (method === 'POST') return createTurfHealth(env, request)
  }

  // ── /api/turf-health/:id ──────────────────────────────────────────────
  const thMatch = pathname.match(/^\/api\/turf-health\/([^/]+)$/)
  if (thMatch) {
    const id = decodeURIComponent(thMatch[1])
    if (method === 'GET')    return getTurfHealth(env, id)
    if (method === 'PATCH')  return updateTurfHealth(env, id, request)
    if (method === 'DELETE') return deleteTurfHealth(env, id)
  }

  // ── /api/product-catalog ──────────────────────────────────────────────
  // Phase 7C.1 — read-only global product catalog. No mutations in v1.
  // /search is matched BEFORE /:id so 'search' isn't consumed as an id.
  if (pathname === '/api/product-catalog') {
    if (method === 'GET') {
      const q        = url.searchParams.get('q')        || null
      const category = url.searchParams.get('category') || null
      const status   = url.searchParams.get('status')   || null
      const frac     = url.searchParams.get('frac')     || null
      const hrac     = url.searchParams.get('hrac')     || null
      const irac     = url.searchParams.get('irac')     || null
      const pgr      = url.searchParams.get('pgr')      || null
      const limit    = url.searchParams.get('limit')    || null
      return listProductCatalog(env, { q, category, status, frac, hrac, irac, pgr, limit })
    }
  }
  if (pathname === '/api/product-catalog/search') {
    if (method === 'GET') {
      const q        = url.searchParams.get('q')        || null
      const category = url.searchParams.get('category') || null
      const status   = url.searchParams.get('status')   || null
      const frac     = url.searchParams.get('frac')     || null
      const hrac     = url.searchParams.get('hrac')     || null
      const irac     = url.searchParams.get('irac')     || null
      const pgr      = url.searchParams.get('pgr')      || null
      const limit    = url.searchParams.get('limit')    || null
      return listProductCatalog(env, { q, category, status, frac, hrac, irac, pgr, limit })
    }
  }
  const pcMatch = pathname.match(/^\/api\/product-catalog\/([^/]+)$/)
  if (pcMatch) {
    const id = decodeURIComponent(pcMatch[1])
    if (method === 'GET') return getProductCatalog(env, id)
  }

  // ── /api/users ────────────────────────────────────────────────────────
  // User management is permission-ENFORCED (not log-only): each handler
  // resolves the actor and checks canManageUsers + role hierarchy.
  //
  // Note: /api/users/invite is matched BEFORE the /api/users/:id regex so
  // the literal subpath wins (otherwise it would resolve to id='invite').
  if (pathname === '/api/users/invite' && method === 'POST') return inviteUser(env, request, ctx)
  if (pathname === '/api/users') {
    if (method === 'GET')  return listUsers(env, request)
    if (method === 'POST') return createUser(env, request)
  }
  const usrMatch = pathname.match(/^\/api\/users\/([^/]+)$/)
  if (usrMatch) {
    const id = decodeURIComponent(usrMatch[1])
    if (method === 'PATCH') return updateUser(env, id, request)
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

  // ── /api/inventory/:id/catalog-link (Phase 7C.2) ──────────────────────
  // Must precede /api/inventory/:id so 'catalog-link' isn't consumed as
  // a sub-id. PATCH only — narrow controlled link/unlink endpoint that
  // validates productCatalogId against product_catalog before writing.
  const invCatLinkMatch = pathname.match(/^\/api\/inventory\/([^/]+)\/catalog-link$/)
  if (invCatLinkMatch) {
    const id = decodeURIComponent(invCatLinkMatch[1])
    if (method === 'PATCH') return patchInventoryCatalogLink(env, id, request)
  }

  // ── /api/inventory/:id/cost-basis (Phase 7J.1) ────────────────────────
  // Same pattern as catalog-link: must precede the generic /:id route.
  // The narrow PATCH writes only the cost-basis cluster
  // (cost_per_unit, cost_unit, cost_source, cost_updated_at, cost_notes)
  // and never touches product_catalog or inventory_usage.
  const invCostBasisMatch = pathname.match(/^\/api\/inventory\/([^/]+)\/cost-basis$/)
  if (invCostBasisMatch) {
    const id = decodeURIComponent(invCostBasisMatch[1])
    if (method === 'PATCH') return patchInventoryCostBasis(env, id, request)
  }

  // ── /api/inventory/:id/cost-basis-audit (Phase 7M.1) ──────────────────
  // GET-only history endpoint. Read-only over
  // inventory_cost_basis_audit; never writes.
  const invCostBasisAuditMatch = pathname.match(/^\/api\/inventory\/([^/]+)\/cost-basis-audit$/)
  if (invCostBasisAuditMatch) {
    const id = decodeURIComponent(invCostBasisAuditMatch[1])
    if (method === 'GET') return listInventoryCostBasisAudit(env, id)
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

  // ── /api/spray-programs (Phase 7F.1 — Spray Program Planner) ──────────
  if (pathname === '/api/spray-programs') {
    if (method === 'GET') {
      const status = url.searchParams.get('status') || null
      return listSprayPrograms(env, courseId, { status })
    }
    if (method === 'POST') return createSprayProgram(env, request)
  }

  // ── /api/spray-programs/:id/items ─────────────────────────────────────
  // Must precede /api/spray-programs/:id so 'items' isn't consumed.
  const sprogItemsMatch = pathname.match(/^\/api\/spray-programs\/([^/]+)\/items$/)
  if (sprogItemsMatch) {
    const id = decodeURIComponent(sprogItemsMatch[1])
    if (method === 'GET')  return listSprayProgramItems(env, id)
    if (method === 'POST') return createSprayProgramItem(env, id, request)
  }

  // ── /api/spray-programs/:id ───────────────────────────────────────────
  // DELETE is a SOFT archive — keeps the row + its items for audit and
  // future reactivation. Matches the spray_records soft-delete pattern.
  const sprogMatch = pathname.match(/^\/api\/spray-programs\/([^/]+)$/)
  if (sprogMatch) {
    const id = decodeURIComponent(sprogMatch[1])
    if (method === 'GET')    return getSprayProgram(env, id)
    if (method === 'PATCH')  return updateSprayProgram(env, id, request)
    if (method === 'DELETE') return archiveSprayProgram(env, id)
  }

  // ── /api/spray-program-items/:itemId/completed-link (Phase 7F.4) ──────
  // Must precede the generic /:itemId route so 'completed-link' isn't
  // consumed as a sub-id. Narrow controlled link/unlink endpoint that
  // validates the target spray_records row exists (and shares course
  // scope) before writing linked_spray_record_id.
  const sprogItemLinkMatch = pathname.match(/^\/api\/spray-program-items\/([^/]+)\/completed-link$/)
  if (sprogItemLinkMatch) {
    const id = decodeURIComponent(sprogItemLinkMatch[1])
    if (method === 'PATCH') return patchSprayProgramItemCompletedLink(env, id, request)
  }

  // ── /api/spray-program-items/:itemId ──────────────────────────────────
  // Peer collection so item PATCH/DELETE can be addressed without
  // re-walking the program. Items are hard-deleted — they're plan
  // entries, not audit-bearing operational records.
  const sprogItemMatch = pathname.match(/^\/api\/spray-program-items\/([^/]+)$/)
  if (sprogItemMatch) {
    const id = decodeURIComponent(sprogItemMatch[1])
    if (method === 'PATCH')  return updateSprayProgramItem(env, id, request)
    if (method === 'DELETE') return deleteSprayProgramItem(env, id)
  }

  // ── /api/task-templates (Phase 9C.11) ─────────────────────────────────
  if (pathname === '/api/task-templates') {
    if (method === 'GET') {
      const status = url.searchParams.get('status') || null
      return listTaskTemplates(env, courseId, { status })
    }
    if (method === 'POST') return createTaskTemplate(env, request)
  }
  const taskTemplateMatch = pathname.match(/^\/api\/task-templates\/([^/]+)$/)
  if (taskTemplateMatch) {
    const id = decodeURIComponent(taskTemplateMatch[1])
    if (method === 'GET')   return getTaskTemplate(env, id)
    if (method === 'PATCH') return updateTaskTemplate(env, id, request)
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
  // Phase 9C.5a.5 — Public GETs strip management-only fields. Resolve the
  // actor and thread canViewEmployeePrivate through the serializer so an
  // anonymous kiosk caller can never see payRate / emergencyContact /
  // pesticideLicense / phone / email / employee notes / hireDate over the
  // wire. owner_admin and superintendent retain full visibility (with the
  // optional view_employee_private per-user override for assistants).
  if (pathname === '/api/crew-employees') {
    if (method === 'GET') {
      const actor = await resolveActor(request, env)
      const canViewPrivate = actorHasPermission(actor, 'canViewEmployeePrivate')
      return listCrewEmployees(env, courseId, canViewPrivate)
    }
    if (method === 'POST') return createCrewEmployee(env, request)
  }

  // ── /api/crew-employees/:id ───────────────────────────────────────────
  const empMatch = pathname.match(/^\/api\/crew-employees\/([^/]+)$/)
  if (empMatch) {
    const id = decodeURIComponent(empMatch[1])
    if (method === 'GET') {
      const actor = await resolveActor(request, env)
      const canViewPrivate = actorHasPermission(actor, 'canViewEmployeePrivate')
      return getCrewEmployee(env, id, canViewPrivate)
    }
    if (method === 'PATCH')  return updateCrewEmployee(env, id, request)
    if (method === 'DELETE') return deleteCrewEmployee(env, id)
  }

  // ── /api/attachments/:id/file (must precede /api/attachments/:id) ─────
  // Row-level course scoping (Phase 4 Step 5): a restricted actor requesting
  // an attachment that belongs to a course they cannot access gets a uniform
  // 404 — no existence leak (same response as for a missing id).
  const attachFileMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/file$/)
  if (attachFileMatch) {
    const id = decodeURIComponent(attachFileMatch[1])
    if (method === 'GET') {
      const actor = await resolveActor(request, env)
      const decision = await enforceRowCourseAccess(env, actor, 'operational_attachments', id)
      if (!decision.allow) return new Response('Not found', { status: 404 })
      return streamAttachment(env, id)
    }
  }

  // ── /api/attachments ──────────────────────────────────────────────────
  // LIST + UPLOAD — list is already course-scoped (via the GET guard above
  // and the ?courseId param); upload is gate-permission-checked.
  if (pathname === '/api/attachments') {
    if (method === 'GET') {
      const parentType = url.searchParams.get('parentType') || null
      const parentId   = url.searchParams.get('parentId')   || null
      return listAttachments(env, courseId, { parentType, parentId })
    }
    if (method === 'POST') return createAttachment(env, request)
  }

  // ── /api/attachments/:id ──────────────────────────────────────────────
  // Same row-level scoping for metadata reads as the /file route above.
  const attachMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachMatch) {
    const id = decodeURIComponent(attachMatch[1])
    if (method === 'GET') {
      const actor = await resolveActor(request, env)
      const decision = await enforceRowCourseAccess(env, actor, 'operational_attachments', id)
      if (!decision.allow) return notFound('Attachment not found')
      return getAttachment(env, id)
    }
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
    if (method === 'GET') {
      // Filter the registry to the actor's accessible courses. owner_admin /
      // superintendent / ADMIN_KEY / course_access=NULL see all; a restricted
      // user sees only assigned ids; an empty allow-list sees [].
      const actor = await resolveActor(request, env)
      const res = await listCourses(env)
      const all = await res.json().catch(() => [])
      return json(filterCoursesForActor(actor, all))
    }
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
