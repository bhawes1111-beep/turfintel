// ── Action type constants ─────────────────────────────────────────────────────

// CREATE_CALENDAR_EVENT removed in Phase 5.4a — calendar events are
// persisted via createCalendarEvent() in calendarStore.
// CREATE_ALERT / DISMISS_ALERT / ACKNOWLEDGE_ALERT removed in Phase 5.4b —
// alerts are persisted via alertsStore (createAlert / patchAlert).
export const ASSIGN_CREW           = 'ASSIGN_CREW'
export const RESERVE_EQUIPMENT     = 'RESERVE_EQUIPMENT'
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
  makeCrewAssignment,
  makeEquipmentReservation,
} from './schemas'
// makeInventoryUsage removed in Phase 5.2; makeCalendarEvent removed in
// Phase 5.4a. makeAlert remains exported from schemas.js for back-compat
// but is no longer used here (Phase 5.4b — alertsStore is server-of-truth).

// createCalendarEvent action creator removed in Phase 5.4a — use
// createCalendarEvent() from src/utils/calendar/calendarStore instead.
// createAlert / dismissAlert / acknowledgeAlert action creators removed in
// Phase 5.4b — use the equivalents from src/utils/alerts/alertsStore.

export function assignCrew(fields) {
  return { type: ASSIGN_CREW, payload: makeCrewAssignment(fields) }
}

export function reserveEquipment(fields) {
  return { type: RESERVE_EQUIPMENT, payload: makeEquipmentReservation(fields) }
}

// deductInventory removed in Phase 5.2. Use recordInventoryUsage() from
// inventoryStore — atomic D1 op that decrements quantity + inserts usage.
// updateRepairOverride / updateEquipmentOverride removed in Phase 5.1c.
