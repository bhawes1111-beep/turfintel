import { createContext, useContext, useEffect, useReducer } from 'react'
import { loadSync, save, migrate } from '../persistence/persistence'
import { CALENDAR_EVENTS } from '../../data/dashboardCalendarEvents'
import { DASHBOARD_ALERTS } from '../../data/dashboardAlerts'
import { PRODUCTS, CHEMICALS } from '../../data/inventory'
import {
  CREATE_CALENDAR_EVENT,
  CREATE_ALERT,
  ASSIGN_CREW,
  RESERVE_EQUIPMENT,
  DISMISS_ALERT,
  ACKNOWLEDGE_ALERT,
  DEDUCT_INVENTORY,
} from './actions'

const STORAGE_KEY = 'turfintel-operations'

// ── Inventory normalization ────────────────────────────────────────────────────
// Unifies PRODUCTS (category field) and CHEMICALS (type field) into one pool.
// IDs are prefixed ('p-' / 'c-') to prevent collision between datasets.

function toInventoryProduct(p, prefix) {
  return {
    id:           `${prefix}${p.id}`,
    name:         p.name,
    category:     p.category || p.type || 'Other',
    unit:         p.unit,
    quantity:     p.quantity,
    reorderLevel: p.reorderLevel,
    location:     p.location  || '',
    vendor:       p.vendor    || '',
    notes:        p.notes     || (p.expiryDate ? `Expires: ${p.expiryDate}` : ''),
    costPerUnit:  p.costPerUnit != null ? p.costPerUnit : null,
    relatedUsage: p.relatedUsage || [],
  }
}

// ── Static seeds ───────────────────────────────────────────────────────────────
// Used on first load or when persisted state is absent / corrupt.

const seedState = {
  calendarEvents:        [...CALENDAR_EVENTS],
  alerts:                [...DASHBOARD_ALERTS],
  crewAssignments:       [],
  equipmentReservations: [],
  inventoryProducts:     [
    ...PRODUCTS.map(p  => toInventoryProduct(p, 'p-')),
    ...CHEMICALS.map(c => toInventoryProduct(c, 'c-')),
  ],
  inventoryUsage:        [],
  // repairOverrides / equipmentOverrides removed in Phase 5.1c — those
  // domains now persist via repairsStore / equipmentStore.
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

    case DEDUCT_INVENTORY: {
      // payload is a makeInventoryUsage() record — contains productName + quantityUsed.
      // Pure arithmetic only — alert dispatch happens before this action is fired.
      const { productName, quantityUsed } = payload
      const lc = productName.toLowerCase()

      let matchIdx = state.inventoryProducts.findIndex(p => p.name === productName)
      if (matchIdx === -1) {
        matchIdx = state.inventoryProducts.findIndex(p => p.name.toLowerCase() === lc)
      }

      if (matchIdx === -1) {
        // Product not tracked — record the usage attempt without deducting.
        return { ...state, inventoryUsage: [...state.inventoryUsage, payload] }
      }

      const product = state.inventoryProducts[matchIdx]
      const newQty  = Math.max(0, product.quantity - quantityUsed)

      return {
        ...state,
        inventoryProducts: state.inventoryProducts.map((p, i) =>
          i === matchIdx ? { ...p, quantity: newQty } : p
        ),
        inventoryUsage: [...state.inventoryUsage, payload],
      }
    }

    // UPDATE_REPAIR_OVERRIDE / UPDATE_EQUIPMENT_OVERRIDE cases removed in
    // Phase 5.1c — those domains are now persisted via repairsStore /
    // equipmentStore. The overlay-era reducer is officially retired.

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
