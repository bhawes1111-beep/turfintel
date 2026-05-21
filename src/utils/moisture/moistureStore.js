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
  const res = await fetch(url, init)
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
