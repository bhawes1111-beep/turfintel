// Phase E.2 — Per-date schedule overrides client store.
//
// Mirrors schedulesStore: module-level cache, useSyncExternalStore
// subscription, optimistic mutations, refresh-on-error. Course-scoped
// via the shared withCourseScope helper; refetches on course change.
//
// The store loads ALL overrides for the active course up front (a course
// will typically have at most a couple weeks of override rows live —
// historical entries are cheap to keep around so the daily merge can
// look back without an extra fetch). The Today's Schedule UI filters
// by effectiveDate client-side; the worker daily endpoint does the
// authoritative merge for write paths.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/employee-schedule-overrides'

let state = {
  overrides: [],
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
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshScheduleOverridesData() {
  setState({ loading: true, error: null })
  try {
    const overrides = await fetchJSON(withCourseScope(API))
    setState({ overrides, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function createScheduleOverride(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  // Worker may dedupe by (course, employee, date) and return the
  // existing row. Replace any row with the same id; otherwise append.
  setState({
    overrides: state.overrides.some(o => o.id === saved.id)
      ? state.overrides.map(o => o.id === saved.id ? saved : o)
      : [...state.overrides, saved],
  })
  return saved
}

export async function patchScheduleOverride(id, updates) {
  const prev = state.overrides
  setState({ overrides: prev.map(o => o.id === id ? { ...o, ...updates } : o) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ overrides: state.overrides.map(o => o.id === id ? saved : o) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshScheduleOverridesData()
    throw err
  }
}

export async function deleteScheduleOverride(id) {
  const prev = state.overrides
  setState({ overrides: prev.filter(o => o.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshScheduleOverridesData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshScheduleOverridesData()
    subscribeCourseChange(refreshScheduleOverridesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useScheduleOverridesData — read-only subscription.
 * Returns { overrides, loading, error, lastFetch }.
 */
export function useScheduleOverridesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
