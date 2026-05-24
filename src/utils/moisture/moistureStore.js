// Moisture + Handwatering Intelligence — data store.
//
// Course-scoped CRUD over /api/moisture, mirroring the feedback/notes store
// pattern: module-level cache, useSyncExternalStore, optimistic create with
// refetch-on-failure. No local-only analytics — observations persist in D1.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/moisture'

let state = {
  observations: [],   // newest first
  loading:      true,
  error:        null,
  lastFetch:    null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  // Phase 3C: session-cookie auth — credentials sends the httpOnly ti_session
  // cookie; no x-admin-key from the browser. The Worker gate enforces role.
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshMoisture(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days)  url += `&days=${encodeURIComponent(opts.days)}`
    if (opts.limit) url += `&limit=${encodeURIComponent(opts.limit)}`
    const observations = await fetchJSON(url)
    setState({ observations, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshMoisture() })

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createMoistureObservation(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ observations: [saved, ...state.observations] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

// ── Phase 7A.1: capture-flow wrapper ────────────────────────────────────────
//
// Splits the user action ("tap Save") from the network round-trip. Inserts an
// optimistic pending row IMMEDIATELY so the mobile modal can close in zero
// network time; the network call resolves the pending row in-place, OR
// stamps it with `_error` and `_pending` so the UI can show a retry badge.
//
// Architectural note (Phase 7A rule): this is the only path the new mobile
// FAB uses. The legacy createMoistureObservation() is preserved for the
// existing MoistureOverview flow and any other caller, so no regressions.
// A future IndexedDB-backed offline queue can replace the body of submit()
// without changing this contract.

function uuid() {
  // RFC4122 v4-ish — crypto.randomUUID() exists in modern browsers + Node 19+,
  // fall back to Math.random for older runtimes (smoke tests run on Node 20).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'mxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * submitMoistureObservation — capture-flow entry point.
 *
 * Returns synchronously with the optimistic row (carries _pending: true).
 * The eventual network resolution updates the same row in the store; on
 * failure, the row stays in the list with _pending: true and _error set,
 * ready for a retry handler to call retryPendingObservation(clientId).
 *
 * @param {Object} payload  - moisture observation fields (location required).
 * @returns {Object}        - the optimistic row stamped with clientId.
 */
export function submitMoistureObservation(payload = {}) {
  const clientId         = payload.clientId         ?? uuid()
  const clientObservedAt = payload.clientObservedAt ?? new Date().toISOString()
  const courseId         = getSelectedCourseId()

  const optimistic = {
    // Synthetic id for React keys; replaced by server id on success.
    id:               `pending-${clientId}`,
    courseId,
    observedAt:       payload.observedAt ?? clientObservedAt,
    observedBy:       payload.observedBy ?? null,
    location:         payload.location ?? '',
    hole:             payload.hole ?? null,
    moisturePct:      payload.moisturePct ?? null,
    surfaceNote:      payload.surfaceNote ?? null,
    wiltStress:       !!payload.wiltStress,
    drySpot:          !!payload.drySpot,
    handwaterRec:     !!payload.handwaterRec,
    syringeRec:       !!payload.syringeRec,
    notes:            payload.notes ?? null,
    clientId,
    clientObservedAt,
    lat:              payload.lat ?? null,
    lng:              payload.lng ?? null,
    gpsAccuracy:      payload.gpsAccuracy ?? null,
    createdAt:        clientObservedAt,
    _pending:         true,
    _error:           null,
  }

  setState({ observations: [optimistic, ...state.observations] })

  // Fire-and-forget network call; reconciles by clientId so retries are safe.
  void sendToServer({
    ...payload,
    clientId,
    clientObservedAt,
    courseId,
  })

  return optimistic
}

async function sendToServer(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify(payload),
    })
    // Replace the matching pending row with the canonical server row.
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId ? saved : o,
      ),
    })
  } catch (err) {
    // Keep the row in the list with retry badge. The user keeps their work.
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId
          ? { ...o, _pending: true, _error: err.message }
          : o,
      ),
    })
  }
}

/**
 * Retry a previously-failed capture. Looks up the pending row by clientId
 * and re-fires the network call with the same payload.
 */
export function retryPendingObservation(clientId) {
  const row = state.observations.find(o => o.clientId === clientId)
  if (!row) return
  // Clear _error before retry so the UI reflects in-flight state.
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId ? { ...o, _error: null } : o,
    ),
  })
  void sendToServer({
    location:         row.location,
    hole:             row.hole,
    moisturePct:      row.moisturePct,
    surfaceNote:      row.surfaceNote,
    wiltStress:       row.wiltStress,
    drySpot:          row.drySpot,
    handwaterRec:     row.handwaterRec,
    syringeRec:       row.syringeRec,
    notes:            row.notes,
    lat:              row.lat,
    lng:              row.lng,
    gpsAccuracy:      row.gpsAccuracy,
    clientId:         row.clientId,
    clientObservedAt: row.clientObservedAt,
    courseId:         row.courseId,
  })
}

/**
 * Drop a pending row the user explicitly wants to discard.
 */
export function dismissPendingObservation(clientId) {
  setState({
    observations: state.observations.filter(o => o.clientId !== clientId || !o._pending),
  })
}

export async function patchMoistureObservation(id, updates) {
  const prev = state.observations
  setState({ observations: prev.map(o => o.id === id ? { ...o, ...updates } : o) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ observations: state.observations.map(o => o.id === id ? saved : o) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshMoisture()
    throw err
  }
}

export async function deleteMoistureObservation(id) {
  const prev = state.observations
  setState({ observations: prev.filter(o => o.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshMoisture()
    throw err
  }
}

// ── React hook ────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshMoisture({ days: 14 })
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useMoistureData — { observations, loading, error, lastFetch }.
 * `observations` are newest-first.
 */
export function useMoistureData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
