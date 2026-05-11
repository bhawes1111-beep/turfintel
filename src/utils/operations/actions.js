// ── Action type constants ─────────────────────────────────────────────────────

// CREATE_CALENDAR_EVENT removed in Phase 5.4a — calendar events are
// persisted via createCalendarEvent() in calendarStore.
export const CREATE_ALERT          = 'CREATE_ALERT'
export const ASSIGN_CREW           = 'ASSIGN_CREW'
export const RESERVE_EQUIPMENT     = 'RESERVE_EQUIPMENT'
export const DISMISS_ALERT         = 'DISMISS_ALERT'
export const ACKNOWLEDGE_ALERT     = 'ACKNOWLEDGE_ALERT'
// DEDUCT_INVENTORY removed in Phase 5.2 — inventory is persisted via
// inventoryStore (recordInventoryUsage). UPDATE_REPAIR_OVERRIDE /
// UPDATE_EQUIPMENT_OVERRIDE removed in Phase 5.1c — those domains
// persist via repairsStore / equipmentStore.

// ── Pure action creators ──────────────────────────────────────────────────────
//
// Each returns a { type, payload } object ready for dispatch().
//
// API-READY: When a backend exists, wrap these in async thunks:
//   1. Dispatch optimistically with the local payload
//   2. POST to the API
//   3. On success: dispatch an UPDATE action with the server ID
//   4. On failure: dispatch a REVERT action

import {
  makeAlert,
  makeCrewAssignment,
  makeEquipmentReservation,
} from './schemas'
// makeInventoryUsage removed in Phase 5.2; makeCalendarEvent removed in
// Phase 5.4a. Both schema helpers remain exported from schemas.js for
// reportBuilder back-compat.

// createCalendarEvent action creator removed in Phase 5.4a — use
// createCalendarEvent() from src/utils/calendar/calendarStore instead.

export function createAlert(fields) {
  return { type: CREATE_ALERT, payload: makeAlert(fields) }
}

export function assignCrew(fields) {
  return { type: ASSIGN_CREW, payload: makeCrewAssignment(fields) }
}

export function reserveEquipment(fields) {
  return { type: RESERVE_EQUIPMENT, payload: makeEquipmentReservation(fields) }
}

export function dismissAlert(id) {
  return { type: DISMISS_ALERT, payload: { id } }
}

export function acknowledgeAlert(id) {
  return { type: ACKNOWLEDGE_ALERT, payload: { id } }
}

// deductInventory removed in Phase 5.2. Use recordInventoryUsage() from
// inventoryStore — atomic D1 op that decrements quantity + inserts usage.
// updateRepairOverride / updateEquipmentOverride removed in Phase 5.1c.
