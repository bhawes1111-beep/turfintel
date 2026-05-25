// Phase 7F (1/?) — Spray Program Planner client store.
//
// Mirrors the inventoryStore pattern:
//   - module-level cache + useSyncExternalStore
//   - session-cookie auth via credentials: 'same-origin'; no x-admin-key
//   - optimistic create/update/delete with rollback on error
//   - course-scoped GETs through withCourseScope
//
// Two normalized collections:
//   - programs[]               (top-level plan envelopes)
//   - itemsByProgramId[progId] (per-program plan rows)
//
// Items are loaded lazily on demand via listSprayProgramItems(progId);
// the store never bulk-fetches every program's items.
//
// Phase 7F.1 deliberately does NOT touch product_catalog or
// inventory_items writes — programs/items are intent only.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = {
  programs:     '/api/spray-programs',
  programItem:  '/api/spray-program-items',  // peer collection for PATCH/DELETE
}

let state = {
  programs:          [],
  itemsByProgramId:  {},
  loading:           true,
  error:             null,
  lastFetch:         null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

// ── Programs ───────────────────────────────────────────────────────────────

export async function refreshSprayPrograms(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API.programs)
    if (opts.status) url += `&status=${encodeURIComponent(opts.status)}`
    const programs = await fetchJSON(url)
    setState({ programs, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => {
  if (!hasBooted) return
  refreshSprayPrograms()
  // Items are per-program; clear the cache so the next per-program
  // GET refetches against the new course scope.
  setState({ itemsByProgramId: {} })
})

/**
 * Create a new spray program. Optimistic — inserts a temp row so the
 * planner workspace can navigate to the new program immediately.
 *
 * @param {Object} payload  Program fields (name required).
 * @returns {Object}        The saved program row.
 */
export async function createSprayProgram(payload = {}) {
  const tempId = `pending-${Math.random().toString(36).slice(2, 9)}`
  const optimistic = {
    id:          tempId,
    courseId:    null,
    name:        payload.name ?? '',
    seasonYear:  payload.seasonYear ?? null,
    programType: payload.programType ?? null,
    status:      payload.status ?? 'draft',
    notes:       payload.notes ?? null,
    source:      payload.source ?? 'manual',
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    archivedAt:  null,
    _pending:    true,
  }
  setState({ programs: [optimistic, ...state.programs] })

  try {
    const saved = await fetchJSON(API.programs, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify(payload),
    })
    setState({
      programs: state.programs.map(p => p.id === tempId ? saved : p),
    })
    return saved
  } catch (err) {
    setState({
      programs: state.programs.filter(p => p.id !== tempId),
      error:    err.message,
    })
    throw err
  }
}

/**
 * Patch a program in-place. Optimistic; rolls back on error.
 */
export async function updateSprayProgram(id, patch) {
  const prev = state.programs
  setState({
    programs: prev.map(p => p.id === id ? { ...p, ...patch } : p),
  })
  try {
    const saved = await fetchJSON(
      `${API.programs}/${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify(patch) },
    )
    setState({ programs: state.programs.map(p => p.id === id ? saved : p) })
    return saved
  } catch (err) {
    setState({ programs: prev, error: err.message })
    throw err
  }
}

/**
 * Soft-archive a program (Worker `DELETE` returns the archived row).
 * Optimistic — drops the row from the visible list, since the default
 * `useSprayPrograms` view excludes archived programs.
 */
export async function archiveSprayProgram(id) {
  const prev = state.programs
  setState({ programs: prev.filter(p => p.id !== id) })
  try {
    await fetchJSON(`${API.programs}/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ programs: prev, error: err.message })
    refreshSprayPrograms()
    throw err
  }
}

// ── Items (lazy per-program) ──────────────────────────────────────────────

/**
 * Fetch the items for a single program and cache them. Returns the
 * loaded array on success. Repeated calls re-fetch — the planner UI
 * is expected to debounce / call this in an effect.
 */
export async function listSprayProgramItems(programId) {
  if (!programId) return []
  try {
    const items = await fetchJSON(`${API.programs}/${encodeURIComponent(programId)}/items`)
    setState({
      itemsByProgramId: { ...state.itemsByProgramId, [programId]: items },
    })
    return items
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

/**
 * Optimistic create. Falls back on error.
 */
export async function createSprayProgramItem(programId, payload = {}) {
  if (!programId) throw new Error('programId is required')
  const tempId = `pending-${Math.random().toString(36).slice(2, 9)}`
  const optimistic = {
    id:          tempId,
    programId,
    courseId:    null,
    targetArea:        payload.targetArea         ?? null,
    plannedStartDate:  payload.plannedStartDate   ?? null,
    plannedEndDate:    payload.plannedEndDate     ?? null,
    plannedWindowLabel:payload.plannedWindowLabel ?? null,
    productName:       payload.productName        ?? null,
    inventoryItemId:   payload.inventoryItemId    ?? null,
    productCatalogId:  payload.productCatalogId   ?? null,
    rateValue:         payload.rateValue          ?? null,
    rateUnit:          payload.rateUnit           ?? null,
    carrierVolumeValue:payload.carrierVolumeValue ?? null,
    carrierVolumeUnit: payload.carrierVolumeUnit  ?? null,
    applicationNotes:  payload.applicationNotes   ?? null,
    sortOrder:         payload.sortOrder          ?? 0,
    status:            payload.status             ?? 'planned',
    linkedSprayRecordId: null,
    createdAt:         new Date().toISOString(),
    updatedAt:         new Date().toISOString(),
    _pending:          true,
  }
  const prevItems = state.itemsByProgramId[programId] ?? []
  setState({
    itemsByProgramId: {
      ...state.itemsByProgramId,
      [programId]: [...prevItems, optimistic],
    },
  })

  try {
    const saved = await fetchJSON(
      `${API.programs}/${encodeURIComponent(programId)}/items`,
      { method: 'POST', headers: mutationHeaders(), body: JSON.stringify(payload) },
    )
    setState({
      itemsByProgramId: {
        ...state.itemsByProgramId,
        [programId]: (state.itemsByProgramId[programId] ?? []).map(i => i.id === tempId ? saved : i),
      },
    })
    return saved
  } catch (err) {
    setState({
      itemsByProgramId: { ...state.itemsByProgramId, [programId]: prevItems },
      error: err.message,
    })
    throw err
  }
}

/**
 * Patch a single item in-place. Optimistic.
 */
export async function updateSprayProgramItem(itemId, patch) {
  // Find the item to know which programId bucket to roll back.
  let programId = null
  for (const pid of Object.keys(state.itemsByProgramId)) {
    if ((state.itemsByProgramId[pid] ?? []).some(i => i.id === itemId)) {
      programId = pid
      break
    }
  }
  const prevItems = programId ? state.itemsByProgramId[programId] : null
  if (programId) {
    setState({
      itemsByProgramId: {
        ...state.itemsByProgramId,
        [programId]: prevItems.map(i => i.id === itemId ? { ...i, ...patch } : i),
      },
    })
  }
  try {
    const saved = await fetchJSON(
      `${API.programItem}/${encodeURIComponent(itemId)}`,
      { method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify(patch) },
    )
    if (programId) {
      setState({
        itemsByProgramId: {
          ...state.itemsByProgramId,
          [programId]: (state.itemsByProgramId[programId] ?? []).map(i => i.id === itemId ? saved : i),
        },
      })
    }
    return saved
  } catch (err) {
    if (programId && prevItems) {
      setState({
        itemsByProgramId: { ...state.itemsByProgramId, [programId]: prevItems },
      })
    }
    setState({ error: err.message })
    throw err
  }
}

/**
 * Phase 7F (4/?) — Manual plan-vs-actual link.
 *
 * Narrow client wrapper around the dedicated completed-link endpoint:
 *   PATCH /api/spray-program-items/:itemId/completed-link
 *   body: { linkedSprayRecordId: string | null }
 *
 * Optimistic — patches the local item's linkedSprayRecordId immediately
 * so the linked-summary card flips without waiting on the network.
 * Rolls back on error. NEVER calls createSpray or recordInventoryUsage:
 * this only re-points an existing planned item at an existing completed
 * spray_records row. Null clears the link.
 */
export async function setProgramItemCompletedLink(itemId, linkedSprayRecordId) {
  const next = linkedSprayRecordId === null || linkedSprayRecordId === ''
    ? null
    : String(linkedSprayRecordId)

  // Find the item's program bucket so we can patch / roll back the
  // right per-program cache slice.
  let programId = null
  for (const pid of Object.keys(state.itemsByProgramId)) {
    if ((state.itemsByProgramId[pid] ?? []).some(i => i.id === itemId)) {
      programId = pid
      break
    }
  }
  const prevItems = programId ? state.itemsByProgramId[programId] : null
  if (programId) {
    setState({
      itemsByProgramId: {
        ...state.itemsByProgramId,
        [programId]: prevItems.map(i =>
          i.id === itemId ? { ...i, linkedSprayRecordId: next } : i,
        ),
      },
    })
  }

  try {
    const saved = await fetchJSON(
      `${API.programItem}/${encodeURIComponent(itemId)}/completed-link`,
      {
        method:  'PATCH',
        headers: mutationHeaders(),
        body:    JSON.stringify({ linkedSprayRecordId: next }),
      },
    )
    if (programId) {
      setState({
        itemsByProgramId: {
          ...state.itemsByProgramId,
          [programId]: (state.itemsByProgramId[programId] ?? []).map(i =>
            i.id === itemId ? saved : i,
          ),
        },
      })
    }
    return saved
  } catch (err) {
    if (programId && prevItems) {
      setState({
        itemsByProgramId: { ...state.itemsByProgramId, [programId]: prevItems },
      })
    }
    setState({ error: err.message })
    throw err
  }
}

/**
 * Hard-delete a program item (the items don't carry audit obligations).
 */
export async function deleteSprayProgramItem(itemId) {
  let programId = null
  for (const pid of Object.keys(state.itemsByProgramId)) {
    if ((state.itemsByProgramId[pid] ?? []).some(i => i.id === itemId)) {
      programId = pid
      break
    }
  }
  const prevItems = programId ? state.itemsByProgramId[programId] : null
  if (programId) {
    setState({
      itemsByProgramId: {
        ...state.itemsByProgramId,
        [programId]: prevItems.filter(i => i.id !== itemId),
      },
    })
  }
  try {
    await fetchJSON(`${API.programItem}/${encodeURIComponent(itemId)}`, {
      method: 'DELETE', headers: mutationHeaders(),
    })
  } catch (err) {
    if (programId && prevItems) {
      setState({
        itemsByProgramId: { ...state.itemsByProgramId, [programId]: prevItems },
      })
    }
    setState({ error: err.message })
    throw err
  }
}

// ── React hook ─────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshSprayPrograms()
  }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useSprayPrograms — { programs, itemsByProgramId, loading, error, lastFetch }. */
export function useSprayPrograms() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Test-only seam — never part of the public render contract.
export const __TEST = {
  reset() {
    setState({
      programs: [], itemsByProgramId: {},
      loading: true, error: null, lastFetch: null,
    })
    hasBooted = false
  },
}
