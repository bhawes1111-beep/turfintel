// ── Action type constants ─────────────────────────────────────────────────────

export const CREATE_CALENDAR_EVENT = 'CREATE_CALENDAR_EVENT'
export const CREATE_ALERT          = 'CREATE_ALERT'
export const ASSIGN_CREW           = 'ASSIGN_CREW'
export const RESERVE_EQUIPMENT     = 'RESERVE_EQUIPMENT'
export const DISMISS_ALERT         = 'DISMISS_ALERT'
export const ACKNOWLEDGE_ALERT     = 'ACKNOWLEDGE_ALERT'
export const DEDUCT_INVENTORY      = 'DEDUCT_INVENTORY'

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
  makeCalendarEvent,
  makeAlert,
  makeCrewAssignment,
  makeEquipmentReservation,
  makeInventoryUsage,
} from './schemas'

export function createCalendarEvent(fields) {
  return { type: CREATE_CALENDAR_EVENT, payload: makeCalendarEvent(fields) }
}

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

export function deductInventory(fields) {
  return { type: DEDUCT_INVENTORY, payload: makeInventoryUsage(fields) }
}
