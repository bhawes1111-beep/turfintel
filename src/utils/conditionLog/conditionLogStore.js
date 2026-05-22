// Course Condition Log — data store.
//
// Course-scoped store over /api/condition-logs. One primary log per date;
// saveConditionLog upserts (the Worker updates in place when a log already
// exists for that date). Mirrors the moisture/feedback store pattern:
// module-level cache, useSyncExternalStore, course-scoped refetch.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/condition-logs'

let state = {
  logs:      [],     // recent logs, newest first
  loading:   true,
  error:     null,
  lastFetch: null,
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

export async function refreshConditionLogs(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days) url += `&days=${encodeURIComponent(opts.days)}`
    const logs = await fetchJSON(url)
    setState({ logs, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshConditionLogs() })

// Fetch the single log for a given date (or { empty: true }). Used by the
// editor to load an existing day and by historical review.
export async function fetchConditionLogByDate(date) {
  const courseId = getSelectedCourseId()
  const url = `${API}/by-date?courseId=${encodeURIComponent(courseId)}&date=${encodeURIComponent(date)}`
  return fetchJSON(url)
}

// Upsert (create or update-in-place for the date). Updates the cache so the
// list + overview reflect the save immediately.
export async function saveConditionLog(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    const others = state.logs.filter(l => l.id !== saved.id && l.logDate !== saved.logDate)
    setState({ logs: [saved, ...others].sort((a, b) => (b.logDate ?? '').localeCompare(a.logDate ?? '')) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function deleteConditionLog(id) {
  const prev = state.logs
  setState({ logs: prev.filter(l => l.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshConditionLogs()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshConditionLogs({ days: 60 })
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useConditionLogs — { logs, loading, error, lastFetch }.
 * `logs` are recent condition logs, newest first.
 */
export function useConditionLogs() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
