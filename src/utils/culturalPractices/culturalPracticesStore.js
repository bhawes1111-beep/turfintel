// Cultural Practices — data store.
//
// Course-scoped CRUD over /api/cultural-practices. Mirrors the nutrition/
// moisture store pattern: module-level cache, useSyncExternalStore,
// optimistic mutations with refetch-on-failure.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/cultural-practices'

let state = { practices: [], loading: true, error: null, lastFetch: null }
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

export async function refreshCulturalPractices(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days) url += `&days=${encodeURIComponent(opts.days)}`
    const practices = await fetchJSON(url)
    setState({ practices, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshCulturalPractices() })

export async function createCulturalPractice(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ practices: [saved, ...state.practices] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchCulturalPractice(id, updates) {
  const prev = state.practices
  setState({ practices: prev.map(p => p.id === id ? { ...p, ...updates } : p) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ practices: state.practices.map(p => p.id === id ? saved : p) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshCulturalPractices()
    throw err
  }
}

export async function deleteCulturalPractice(id) {
  const prev = state.practices
  setState({ practices: prev.filter(p => p.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: mutationHeaders() })
  } catch (err) {
    setState({ error: err.message })
    refreshCulturalPractices()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) { hasBooted = true; refreshCulturalPractices({ days: 180 }) }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useCulturalPractices — { practices, loading, error, lastFetch }. */
export function useCulturalPractices() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
