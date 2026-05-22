// Repairs data store (Phase 5.1c).
//
// Mirrors the equipmentStore pattern verbatim: a tiny module-level cache
// fetched once on first import, exposed via React's useSyncExternalStore.
// Mutations apply optimistically, then confirm against the server; failure
// triggers a re-fetch to recover truth.
//
// Carries the Phase 5.1b x-admin-key header on every mutation.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/repairs'


let state = {
  repairs:   [],
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

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

export async function refreshRepairsData() {
  setState({ loading: true, error: null })
  try {
    const repairs = await fetchJSON(withCourseScope(API))
    setState({ repairs, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshRepairsData() })

export async function patchRepair(id, updates) {
  const prev = state.repairs
  const next = prev.map(r => r.repairId === id ? { ...r, ...updates } : r)
  setState({ repairs: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ repairs: state.repairs.map(r => r.repairId === id ? saved : r) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshRepairsData()
    throw err
  }
}

export async function createRepair(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ repairs: [saved, ...state.repairs] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function deleteRepair(id) {
  const prev = state.repairs
  setState({ repairs: prev.filter(r => r.repairId !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshRepairsData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshRepairsData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() {
  return state
}

/**
 * useRepairsData — read-only subscription to the Repairs vertical.
 * Returns { repairs, loading, error, lastFetch }.
 */
export function useRepairsData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
