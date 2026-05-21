// Equipment + Maintenance data store (Phase 5.0).
//
// A tiny module-level cache that fetches the Equipment vertical from the
// Worker API once on first import and exposes the result via a React hook
// (useEquipmentData) plus a few mutation helpers. Multiple components can
// subscribe; one network round-trip is shared across all of them.
//
// Intentionally NOT a state-management library. No Redux, no Zustand, no
// React context. The store is plain JS + useSyncExternalStore.
//
// Failure mode: when the API is unavailable (e.g. local Vite dev without
// wrangler dev), fetches set { error: ... }. Consumers can render the
// previously-cached value (initially empty arrays) and display the error.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
// Phase 5.1b mutation auth — centralized in R3. See src/utils/auth/mutationAuth.js.
import { mutationHeaders } from '../auth/mutationAuth'

const API = {
  equipment:   '/api/equipment',
  maintenance: '/api/maintenance',
}

let state = {
  equipment:  [],
  serviceLog: [],
  loading:    true,
  error:      null,
  lastFetch:  null,
}

const subscribers = new Set()
let hasBooted = false

function notify() {
  subscribers.forEach(cb => cb())
}

function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

async function fetchJSON(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshEquipmentData() {
  setState({ loading: true, error: null })
  try {
    const [equipment, serviceLog] = await Promise.all([
      fetchJSON(withCourseScope(API.equipment)),
      fetchJSON(withCourseScope(API.maintenance)),
    ])
    setState({ equipment, serviceLog, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// Phase 5.7 — switch operational course → refetch.
subscribeCourseChange(() => { if (hasBooted) refreshEquipmentData() })

// ── Optimistic mutations ──────────────────────────────────────────────────
// We apply the patch to local state immediately so the UI feels fast, then
// confirm with the server. On failure, we re-fetch to recover the truth.

export async function patchEquipment(id, updates) {
  const prev = state.equipment
  const next = prev.map(eq => eq.id === id ? { ...eq, ...updates } : eq)
  setState({ equipment: next })
  try {
    const saved = await fetchJSON(`${API.equipment}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ equipment: state.equipment.map(eq => eq.id === id ? saved : eq) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshEquipmentData()
    throw err
  }
}

export async function createEquipment(payload) {
  try {
    const saved = await fetchJSON(API.equipment, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ equipment: [...state.equipment, saved] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function deleteEquipment(id) {
  const prev = state.equipment
  setState({ equipment: prev.filter(eq => eq.id !== id) })
  try {
    await fetchJSON(`${API.equipment}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshEquipmentData()
    throw err
  }
}

export async function patchMaintenance(id, updates) {
  const prev = state.serviceLog
  const next = prev.map(ml => ml.id === id ? { ...ml, ...updates } : ml)
  setState({ serviceLog: next })
  try {
    const saved = await fetchJSON(`${API.maintenance}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ serviceLog: state.serviceLog.map(ml => ml.id === id ? saved : ml) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshEquipmentData()
    throw err
  }
}

export async function createMaintenance(payload) {
  try {
    const saved = await fetchJSON(API.maintenance, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ serviceLog: [saved, ...state.serviceLog] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

// ── React hook ────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshEquipmentData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() {
  return state
}

/**
 * useEquipmentData — read-only subscription to the Equipment vertical.
 *
 * Returns { equipment, serviceLog, loading, error, lastFetch }.
 *
 * Fetches once on first mount across the app; later mounts reuse the cache.
 * Call refreshEquipmentData() to re-fetch. Call patchEquipment /
 * patchMaintenance / createMaintenance for mutations (apply optimistically,
 * confirm against the server).
 */
export function useEquipmentData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
