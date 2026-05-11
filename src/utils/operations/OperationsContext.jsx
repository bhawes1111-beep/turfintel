import { createContext, useContext, useEffect, useReducer } from 'react'
import { loadSync, save, migrate } from '../persistence/persistence'
import { DASHBOARD_ALERTS } from '../../data/dashboardAlerts'
import {
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
  alerts:                [...DASHBOARD_ALERTS],
  crewAssignments:       [],
  equipmentReservations: [],
  // calendarEvents removed in Phase 5.4a (→ calendarStore).
  // inventoryProducts / inventoryUsage removed in Phase 5.2 (→ inventoryStore).
  // repairOverrides / equipmentOverrides removed in Phase 5.1c.
}

// ── Persistence adapter ────────────────────────────────────────────────────────
// Delegates to src/utils/persistence/persistence.js — never call localStorage
// directly here. Swap the persistence layer there, not here.

function loadState() {
  // Synchronous read from localStorage — safe for the useReducer lazy initializer.
  // IndexedDB (primary store) is populated asynchronously via migrate() on mount.
  return loadSync(STORAGE_KEY)
}

function saveState(state) {
  // Dual-write: localStorage sync first (immediate backup), then IDB async.
  save(STORAGE_KEY, state)
}

// Merge loaded state with seed defaults so new state keys added in future
// deploys are automatically initialized without corrupting persisted data.
function mergeWithSeed(loaded) {
  const merged = { ...seedState }
  for (const key of Object.keys(seedState)) {
    if (loaded[key] !== undefined) merged[key] = loaded[key]
  }
  return merged
}

// ── Reducer ────────────────────────────────────────────────────────────────────

function operationsReducer(state, { type, payload }) {
  switch (type) {

    // CREATE_CALENDAR_EVENT case removed in Phase 5.4a — calendar events
    // now persist via createCalendarEvent() in calendarStore. Worker-side
    // dedupe (sourceId + event_type + start_date) handles the guard that
    // used to live here.

    case CREATE_ALERT:
      return { ...state, alerts: [payload, ...state.alerts] }

    // ASSIGN_CREW / RESERVE_EQUIPMENT no longer mutate calendarEvents
    // (those moved to calendarStore in Phase 5.4a). The originating
    // calendar event is already created with assignedStaff / equipment
    // populated, so the mutation was redundant; these cases now only
    // append to their respective slots.
    case ASSIGN_CREW:
      return { ...state, crewAssignments: [...state.crewAssignments, payload] }

    case RESERVE_EQUIPMENT:
      return { ...state, equipmentReservations: [...state.equipmentReservations, payload] }

    case DISMISS_ALERT:
      return { ...state, alerts: state.alerts.filter(a => a.id !== payload.id) }

    case ACKNOWLEDGE_ALERT:
      return {
        ...state,
        alerts: state.alerts.map(a =>
          a.id === payload.id ? { ...a, status: 'acknowledged' } : a
        ),
      }

    // DEDUCT_INVENTORY case removed in Phase 5.2 — inventory deductions now
    // persist via recordInventoryUsage() in inventoryStore (atomic D1 op).
    // UPDATE_REPAIR_OVERRIDE / UPDATE_EQUIPMENT_OVERRIDE cases removed in
    // Phase 5.1c.

    default:
      return state
  }
}

// ── Context + Provider ─────────────────────────────────────────────────────────

const OperationsContext = createContext(null)

export function OperationsProvider({ children }) {
  // Lazy initializer: reads localStorage once on mount, merges with seed defaults.
  const [state, dispatch] = useReducer(
    operationsReducer,
    undefined,
    () => {
      const loaded = loadState()
      return loaded ? mergeWithSeed(loaded) : seedState
    },
  )

  // Write-back: persists on every state change (dual-write LS + IDB).
  useEffect(() => {
    saveState(state)
  }, [state])

  // One-time migration: promotes existing localStorage data into IndexedDB.
  // No-op if IDB already has data or is unavailable. Safe to call every mount.
  useEffect(() => {
    migrate(STORAGE_KEY)
  }, [])

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
