import { createContext, useContext, useReducer } from 'react'
import { CALENDAR_EVENTS } from '../../data/dashboardCalendarEvents'
import { DASHBOARD_ALERTS } from '../../data/dashboardAlerts'
import {
  CREATE_CALENDAR_EVENT,
  CREATE_ALERT,
  ASSIGN_CREW,
  RESERVE_EQUIPMENT,
  DISMISS_ALERT,
  ACKNOWLEDGE_ALERT,
} from './actions'

// ── Initial state ─────────────────────────────────────────────────────────────
//
// Seeded with existing static datasets so existing UI is unaffected.
// All runtime mutations flow through the reducer — no direct state mutation.

const initialState = {
  calendarEvents:        [...CALENDAR_EVENTS],
  alerts:                [...DASHBOARD_ALERTS],
  crewAssignments:       [],
  equipmentReservations: [],
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function operationsReducer(state, { type, payload }) {
  switch (type) {

    case CREATE_CALENDAR_EVENT:
      return { ...state, calendarEvents: [payload, ...state.calendarEvents] }

    case CREATE_ALERT:
      return { ...state, alerts: [payload, ...state.alerts] }

    case ASSIGN_CREW: {
      // Patch the matching event's assignedStaff array (deduped)
      const calendarEvents = state.calendarEvents.map(evt =>
        evt.id === payload.eventId
          ? { ...evt, assignedStaff: [...new Set([...evt.assignedStaff, ...payload.staffNames])] }
          : evt
      )
      return {
        ...state,
        calendarEvents,
        crewAssignments: [...state.crewAssignments, payload],
      }
    }

    case RESERVE_EQUIPMENT: {
      // Patch the matching event's equipment array (deduped)
      const calendarEvents = state.calendarEvents.map(evt =>
        evt.id === payload.eventId
          ? { ...evt, equipment: [...new Set([...evt.equipment, ...payload.equipmentNames])] }
          : evt
      )
      return {
        ...state,
        calendarEvents,
        equipmentReservations: [...state.equipmentReservations, payload],
      }
    }

    case DISMISS_ALERT:
      return { ...state, alerts: state.alerts.filter(a => a.id !== payload.id) }

    case ACKNOWLEDGE_ALERT:
      return {
        ...state,
        alerts: state.alerts.map(a =>
          a.id === payload.id ? { ...a, status: 'acknowledged' } : a
        ),
      }

    default:
      return state
  }
}

// ── Context + Provider ────────────────────────────────────────────────────────

const OperationsContext = createContext(null)

export function OperationsProvider({ children }) {
  const [state, dispatch] = useReducer(operationsReducer, initialState)
  return (
    <OperationsContext.Provider value={{ state, dispatch }}>
      {children}
    </OperationsContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOperations() {
  const ctx = useContext(OperationsContext)
  if (!ctx) throw new Error('useOperations must be called inside <OperationsProvider>')
  return ctx
}
