// Sprays data store (Phase 5.3).
//
// Mirrors equipmentStore / repairsStore / inventoryStore: module-level
// cache, fetched once on first import, exposed via useSyncExternalStore.
// Optimistic mutations, x-admin-key on writes, refresh-on-error.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/sprays'


let state = {
  records:   [],
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
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshSpraysData() {
  setState({ loading: true, error: null })
  try {
    const records = await fetchJSON(withCourseScope(API))
    setState({ records, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshSpraysData() })

// ── Optimistic mutations ───────────────────────────────────────────────────

export async function patchSpray(id, updates) {
  const prev = state.records
  const next = prev.map(r => r.id === id ? { ...r, ...updates } : r)
  setState({ records: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ records: state.records.map(r => r.id === id ? saved : r) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshSpraysData()
    throw err
  }
}

export async function createSpray(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ records: [saved, ...state.records] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function deleteSpray(id) {
  const prev = state.records
  setState({ records: prev.filter(r => r.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshSpraysData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshSpraysData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useSpraysData — read-only subscription to the Sprays vertical.
 * Returns { records, loading, error, lastFetch }.
 *
 * Each record carries nested { products: [...], areas: [...] } arrays,
 * a nested conditions object, and the same shape the static SPRAY_RECORDS
 * exposed pre-5.3 (with one addition: products[].inventoryItemId for the
 * cross-module deduction link).
 */
export function useSpraysData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
