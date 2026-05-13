// Employee weekly schedules — client store (Phase 13).
//
// Mirrors notesStore / alertsStore: module-level cache, useSyncExternalStore
// subscription, optimistic mutations, x-admin-key on writes, refresh-on-error.
// Course-scoped via the shared withCourseScope helper; refetches on
// course change.

import { useSyncExternalStore } from 'react'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/employee-schedules'

const ADMIN_KEY = 'TurfAdmin2025!'

function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key':  ADMIN_KEY,
  }
}

let state = {
  schedules: [],
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

export async function refreshEmployeeSchedulesData() {
  setState({ loading: true, error: null })
  try {
    const schedules = await fetchJSON(withCourseScope(API))
    setState({ schedules, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function createEmployeeSchedule(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  // Worker may dedupe by (course, employee, day) and return the existing
  // row. Replace any row with the same id; otherwise append.
  setState({
    schedules: state.schedules.some(s => s.id === saved.id)
      ? state.schedules.map(s => s.id === saved.id ? saved : s)
      : [...state.schedules, saved],
  })
  return saved
}

export async function patchEmployeeSchedule(id, updates) {
  const prev = state.schedules
  setState({ schedules: prev.map(s => s.id === id ? { ...s, ...updates } : s) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ schedules: state.schedules.map(s => s.id === id ? saved : s) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshEmployeeSchedulesData()
    throw err
  }
}

export async function deleteEmployeeSchedule(id) {
  const prev = state.schedules
  setState({ schedules: prev.filter(s => s.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshEmployeeSchedulesData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshEmployeeSchedulesData()
    subscribeCourseChange(refreshEmployeeSchedulesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useEmployeeSchedulesData — read-only subscription.
 * Returns { schedules, loading, error, lastFetch }.
 */
export function useEmployeeSchedulesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
