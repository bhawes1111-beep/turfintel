import { createContext, useContext, useEffect, useReducer } from 'react'
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

const STORAGE_KEY = 'turfintel-operations'

// ── Static seeds ───────────────────────────────────────────────────────────────
// Used on first load or when persisted state is absent / corrupt.

const seedState = {
  calendarEvents:        [...CALENDAR_EVENTS],
  alerts:                [...DASHBOARD_ALERTS],
  crewAssignments:       [],
  equipmentReservations: [],
}

// ── Persistence adapter ────────────────────────────────────────────────────────
// Replace loadState / saveState to migrate to API, Cloudflare D1, Supabase,
// or Firebase — reducers and consuming modules remain unchanged.

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    console.warn('[operations] Corrupt localStorage state — resetting to defaults.')
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded or restricted storage — fail silently.
  }
}

// ── Reducer ────────────────────────────────────────────────────────────────────

function operationsReducer(state, { type, payload }) {
  switch (type) {

    case CREATE_CALENDAR_EVENT: {
      // Deduplication guard: sourceId + category + date must be unique.
      // Events without a sourceId (no originating record) are always allowed.
      if (payload.metadata?.sourceId) {
        const exists = state.calendarEvents.some(
          e =>
            e.metadata?.sourceId === payload.metadata.sourceId &&
            e.category           === payload.category          &&
            e.date               === payload.date
        )
        if (exists) return state
      }
      return { ...state, calendarEvents: [payload, ...state.calendarEvents] }
    }

    case CREATE_ALERT:
      return { ...state, alerts: [payload, ...state.alerts] }

    case ASSIGN_CREW: {
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

// ── Context + Provider ─────────────────────────────────────────────────────────

const OperationsContext = createContext(null)

export function OperationsProvider({ children }) {
  // Lazy initializer: reads localStorage once on mount, falls back to seedState.
  const [state, dispatch] = useReducer(
    operationsReducer,
    undefined,
    () => loadState() ?? seedState,
  )

  // Write-back: persists on every state change.
  useEffect(() => {
    saveState(state)
  }, [state])

  return (
    <OperationsContext.Provider value={{ state, dispatch }}>
      {children}
    </OperationsContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useOperations() {
  const ctx = useContext(OperationsContext)
  if (!ctx) throw new Error('useOperations must be called inside <OperationsProvider>')
  return ctx
}
