// Operations Daily Notes data store (Phase 6).
//
// Mirrors alertsStore / spraysStore: module-level cache, useSyncExternalStore
// subscription, optimistic mutations, x-admin-key on writes, refresh-on-error.
//
// Course-scoped: every GET is wrapped via withCourseScope(); a course
// change triggers a refetch. Writes inject courseId from the selected
// course unless the caller supplies one.
//
// Filter conventions:
//   listFor(date)  → GET /api/operations-notes?courseId=...&date=YYYY-MM-DD
//   listAll()      → GET /api/operations-notes?courseId=...
// Both default to status='active' server-side (archived rows hidden).

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/operations-notes'


let state = {
  notes:     [],
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

export async function refreshOperationsNotesData() {
  setState({ loading: true, error: null })
  try {
    const notes = await fetchJSON(withCourseScope(API))
    setState({ notes, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function createOperationsNote(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  setState({ notes: [saved, ...state.notes] })
  return saved
}

export async function patchOperationsNote(id, updates) {
  const prev = state.notes
  // Optimistic update.
  setState({ notes: prev.map(n => n.id === id ? { ...n, ...updates } : n) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ notes: state.notes.map(n => n.id === id ? saved : n) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshOperationsNotesData()
    throw err
  }
}

export async function archiveOperationsNote(id) {
  return patchOperationsNote(id, { status: 'archived' })
}

export async function unarchiveOperationsNote(id) {
  return patchOperationsNote(id, { status: 'active' })
}

export async function deleteOperationsNote(id) {
  const prev = state.notes
  setState({ notes: prev.filter(n => n.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshOperationsNotesData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshOperationsNotesData()
    subscribeCourseChange(refreshOperationsNotesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useOperationsNotesData — read-only subscription.
 * Returns { notes, loading, error, lastFetch }.
 */
export function useOperationsNotesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
