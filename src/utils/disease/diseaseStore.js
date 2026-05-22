// Disease Observations — data store.
//
// Course-scoped CRUD over /api/disease. Mirrors the cultural-practices /
// nutrition store pattern: module-level cache, useSyncExternalStore,
// optimistic mutations with refetch-on-failure. Pure storage — disease
// pressure awareness is computed live in diseasePressureAwareness.js, not
// stored here.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/disease'

let state = { observations: [], loading: true, error: null, lastFetch: null }
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

export async function refreshDisease(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days)   url += `&days=${encodeURIComponent(opts.days)}`
    if (opts.status) url += `&status=${encodeURIComponent(opts.status)}`
    const observations = await fetchJSON(url)
    setState({ observations, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshDisease() })

export async function createDisease(payload) {
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

export async function patchDisease(id, updates) {
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
    refreshDisease()
    throw err
  }
}

export async function deleteDisease(id) {
  const prev = state.observations
  setState({ observations: prev.filter(o => o.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: mutationHeaders() })
  } catch (err) {
    setState({ error: err.message })
    refreshDisease()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) { hasBooted = true; refreshDisease({ days: 180 }) }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useDisease — { observations, loading, error, lastFetch }. */
export function useDisease() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
