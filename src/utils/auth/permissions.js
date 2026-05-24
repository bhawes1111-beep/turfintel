// Permission matrix — client mirror of worker/lib/permissions.js.
//
// Code checks PERMISSIONS, never raw role strings, so access rules live in
// one place. This file is kept byte-identical to the worker source in its
// ROLES / PERMISSION_KEYS / ROLE_PERMISSIONS / OVERRIDE_FLAGS / ROLE_RANK and
// the can/permissionsFor/canManageRole logic; smoke-auth.mjs asserts the two
// stay in sync so they can never silently drift.
//
// Role rule: Superintendent has full operational + agronomic authority by
// default. Only platform/system-owner functions are owner_admin-only.

export const ROLES = [
  'owner_admin',
  'superintendent',
  'assistant_super',
  'crew_lead',
  'crew',
  'read_only',
]

export const PERMISSION_KEYS = [
  'canManageUsers',
  'canManageCourses',
  'canSystemSettings',
  'canViewPrivateNotes',
  'canDeleteRecords',
  'canEditSprays',
  'canEditInventory',
  'canEditEquipment',
  'canEditMoisture',
  'canEditConditionLogs',
  'canEditCulturalPractices',
  'canEditDisease',
  'canEditNutrition',
  'canEditAssignments',
  'canEditTurfHealth',
  'canUpdateTaskStatus',
  'canAccessDisplayBoard',
  'canSendCrewNotes',
  'canViewReports',
]

// Convenience bundle: the full operational/agronomic edit set a
// Superintendent / Assistant gets. Owner/Admin also gets these.
const OPERATIONAL = {
  canDeleteRecords:         true,
  canEditSprays:            true,
  canEditInventory:         true,
  canEditEquipment:         true,
  canEditMoisture:          true,
  canEditConditionLogs:     true,
  canEditCulturalPractices: true,
  canEditDisease:           true,
  canEditNutrition:         true,
  canEditAssignments:       true,
  canEditTurfHealth:        true,
  canUpdateTaskStatus:      true,
  canAccessDisplayBoard:    true,
  canSendCrewNotes:         true,
  canViewReports:           true,
}

export const ROLE_PERMISSIONS = {
  owner_admin: {
    canManageUsers:    true,
    canManageCourses:  true,
    canSystemSettings: true,
    canViewPrivateNotes: true,
    ...OPERATIONAL,
  },
  superintendent: {
    // Full operational authority. canManageUsers is granted but scoped at the
    // API to roles BELOW superintendent (cannot create/edit admins) — the flag
    // here means "may manage lower users"; system-owner functions stay false.
    canManageUsers:    true,
    canManageCourses:  false,
    canSystemSettings: false,
    canViewPrivateNotes: true,
    ...OPERATIONAL,
  },
  assistant_super: {
    canManageUsers:    false,
    canManageCourses:  false,
    canSystemSettings: false,
    canViewPrivateNotes: false,   // optional per-user override may grant it
    ...OPERATIONAL,
  },
  crew_lead: {
    canUpdateTaskStatus:   true,
    canEditMoisture:       true,
    canEditTurfHealth:     true,   // crew leads walk the course and spot chronic stress same as moisture
    canAccessDisplayBoard: true,
    canSendCrewNotes:      false,  // optional per-user override may grant it
  },
  crew: {
    canUpdateTaskStatus:   true,
    canAccessDisplayBoard: true,
  },
  read_only: {
    canAccessDisplayBoard: true,
    canViewReports:        true,
  },
}

// Per-user override flags (columns on the users row) that can grant a
// permission the base role does not. Keep this list tiny and explicit.
const OVERRIDE_FLAGS = {
  view_private_notes: 'canViewPrivateNotes',
  send_crew_notes:    'canSendCrewNotes',
}

/**
 * permissionsFor — resolve a user row (or role string) to a permission map.
 * Accepts either a role string or a user object { role, view_private_notes,
 * send_crew_notes }. Unknown roles get the empty (deny-all) set.
 */
export function permissionsFor(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
  const base = ROLE_PERMISSIONS[role] || {}
  const out = {}
  for (const key of PERMISSION_KEYS) out[key] = base[key] === true

  if (userOrRole && typeof userOrRole === 'object') {
    for (const [col, perm] of Object.entries(OVERRIDE_FLAGS)) {
      if (userOrRole[col] === 1 || userOrRole[col] === true) out[perm] = true
    }
  }
  return out
}

/** can — single permission check for a user row / role string. */
export function can(userOrRole, permission) {
  if (!userOrRole) return false
  return permissionsFor(userOrRole)[permission] === true
}

// Role hierarchy for "may manage users below me" checks. Lower index = higher
// authority. A superintendent may manage anyone strictly below superintendent.
export const ROLE_RANK = {
  owner_admin:     0,
  superintendent:  1,
  assistant_super: 2,
  crew_lead:       3,
  crew:            4,
  read_only:       5,
}

/**
 * canManageRole — may `actor` create/edit a user with `targetRole`?
 * owner_admin may manage all roles. superintendent may manage strictly-lower
 * roles only (never another superintendent or an owner_admin). Anyone else: no.
 */
export function canManageRole(actor, targetRole) {
  if (!actor || !can(actor, 'canManageUsers')) return false
  const actorRole = typeof actor === 'string' ? actor : actor.role
  if (actorRole === 'owner_admin') return true
  const aRank = ROLE_RANK[actorRole]
  const tRank = ROLE_RANK[targetRole]
  if (aRank == null || tRank == null) return false
  return tRank > aRank   // strictly lower authority than the actor
}

// Friendly labels for the admin UI (client-only — not part of the synced core).
export const ROLE_LABELS = {
  owner_admin:     'Owner / Admin',
  superintendent:  'Superintendent',
  assistant_super: 'Assistant Superintendent',
  crew_lead:       'Crew Lead',
  crew:            'Crew',
  read_only:       'Read Only',
}
