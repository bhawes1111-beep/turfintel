// Declarative mutation route → permission map + resolver.
//
// The central gate (worker/index.js) consults this to decide whether a
// mutation (POST/PATCH/DELETE) is allowed for the resolved actor. Design:
//   - match by longest path PREFIX (so /api/inventory/usage resolves before
//     /api/inventory).
//   - a mapped route requires the named permission.
//   - an UNMAPPED mutation route is allowed for any authenticated actor
//     (Phase-2 conservative default; tighten later).
//   - ADMIN_KEY automation actor and owner_admin always pass (handled by the
//     permission matrix: owner_admin has every permission).
//   - superintendent passes everything operational via the matrix.
//
// Special cases (functions) get the method + parsed body so they can branch
// (e.g. crew-assignments status-only PATCH → canUpdateTaskStatus).

import { actorHasPermission, isAutomationActor } from './actor.js'
import { PERMISSION_KEYS } from './permissions.js'

// Longest-prefix-first ordering matters: list specific sub-paths before their
// parents. Each entry is [prefix, permission | specialFn].
const MUTATION_RULES = [
  // Inventory sub-paths before the parent.
  ['/api/inventory/import-label', 'canEditInventory'],
  ['/api/inventory/usage',        'canEditInventory'],
  ['/api/inventory',              'canEditInventory'],

  ['/api/condition-logs',         'canEditConditionLogs'],
  ['/api/moisture',               'canEditMoisture'],
  ['/api/sprays',                 'canEditSprays'],
  // Phase S.2 — Spray planning routes were unmapped, which meant any
  // authenticated actor could create / edit / archive a spray program
  // or item. matchRule uses prefix matching with a trailing-slash
  // guard, so '/api/spray-programs' covers the bare collection POST,
  // the /:id PATCH/DELETE, AND the nested /:id/items POST. Similarly
  // '/api/spray-program-items' covers item PATCH/DELETE and the
  // /:itemId/completed-link PATCH. '/api/sprays' (records of record)
  // and '/api/spray-programs' / '/api/spray-program-items' are
  // distinct prefixes — neither startsWith the other thanks to the
  // '/api/sprays/' vs '/api/spray-programs/' separator boundary, so
  // ordering relative to '/api/sprays' is safe either way.
  ['/api/spray-programs',         'canEditSprays'],
  ['/api/spray-program-items',    'canEditSprays'],

  ['/api/equipment-reservations', 'canEditEquipment'],
  ['/api/equipment',              'canEditEquipment'],
  ['/api/maintenance',            'canEditEquipment'],
  ['/api/repairs',                'canEditEquipment'],

  ['/api/nutrition',              'canEditNutrition'],
  ['/api/cultural-practices',     'canEditCulturalPractices'],
  ['/api/disease',                'canEditDisease'],

  ['/api/calendar-events',        'canEditAssignments'],
  ['/api/task-templates',         'canEditAssignments'],   // Phase 9C.11
  ['/api/schedule-templates',     'canEditAssignments'],
  ['/api/employee-schedules',     'canEditAssignments'],
  ['/api/employee-schedule-overrides', 'canEditAssignments'],   // Phase E.2
  ['/api/crew-employees',         'canEditAssignments'],
  ['/api/alerts',                 'canEditAssignments'],

  ['/api/operations-notes',       'canSendCrewNotes'],

  ['/api/courses',                'canManageCourses'],
  ['/api/weather/capture',        'canManageCourses'],   // or ADMIN_KEY (automation passes anyway)
  ['/api/water-balance/rollup',   'canManageCourses'],   // or ADMIN_KEY

  // Special cases (function rules).
  ['/api/crew-assignments',       crewAssignmentRule],
  ['/api/attachments',            attachmentsRule],
]

// crew-assignments: a PATCH whose body changes ONLY task status → the lighter
// canUpdateTaskStatus. Create / delete / fuller edits → canEditAssignments.
function crewAssignmentRule(actor, { method, body }) {
  const statusOnly =
    method === 'PATCH' &&
    body && typeof body === 'object' &&
    Object.keys(body).length > 0 &&
    Object.keys(body).every(k => k === 'status' || k === 'id')
  if (statusOnly) {
    return actorHasPermission(actor, 'canUpdateTaskStatus') || actorHasPermission(actor, 'canEditAssignments')
  }
  return actorHasPermission(actor, 'canEditAssignments')
}

// attachments: any authenticated actor holding at least ONE operational edit
// permission may attach. ADMIN_KEY passes (automation).
const OPERATIONAL_EDIT_PERMS = PERMISSION_KEYS.filter(p => p.startsWith('canEdit'))
function attachmentsRule(actor) {
  if (isAutomationActor(actor)) return true
  return OPERATIONAL_EDIT_PERMS.some(p => actorHasPermission(actor, p))
}

/** Find the matching rule (longest prefix wins via array order). */
function matchRule(pathname) {
  for (const [prefix, rule] of MUTATION_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return rule
  }
  return null
}

/**
 * isMutationAllowed — authorization decision for a mutation.
 *   actor: resolved principal (never null here — the gate checks auth first).
 *   pathname/method: request line.
 *   body: parsed JSON body (only needed for special-case rules; may be null).
 * Returns true/false. Automation (ADMIN_KEY) and owner_admin pass everything
 * because owner_admin holds every permission in the matrix.
 */
export function isMutationAllowed(actor, pathname, method, body = null) {
  if (!actor) return false                 // defensive; gate already enforced auth
  if (isAutomationActor(actor)) return true
  const rule = matchRule(pathname)
  if (rule == null) return true            // unmapped → any authenticated passes
  if (typeof rule === 'function') return rule(actor, { method, body })
  return actorHasPermission(actor, rule)
}

/** True if the route consults the request body (needs the gate to parse it). */
export function ruleNeedsBody(pathname) {
  const rule = matchRule(pathname)
  return rule === crewAssignmentRule
}

// Exported for tests.
export { matchRule, MUTATION_RULES }
