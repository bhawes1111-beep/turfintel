// Phase 9C.11 — Task Templates data store.
//
// Reusable task library that powers the Daily Assignment Board dropdown.
// Mirrors notesStore / alertsStore / spraysStore: module-level cache,
// useSyncExternalStore subscription, optimistic mutations, mutation
// headers on writes, refresh-on-error.
//
// Course-scoped: every GET is wrapped via withCourseScope(); a course
// change triggers a refetch. Writes inject courseId from the selected
// course unless the caller supplies one.
//
// Server contract: GET /api/task-templates returns active rows only by
// default (the DAB dropdown's hot path). For the Tasks tab "show
// archived" toggle, callers can refresh with includeArchived=true.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/task-templates'


let state = {
  templates: [],
  loading:   true,
  error:     null,
  lastFetch: null,
  // Toggled by the Tasks tab when the supervisor shows archived rows.
  // The DAB dropdown ignores archived rows regardless of this flag —
  // it filters on status === 'active' at the consumer.
  includeArchived: false,
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

export async function refreshTaskTemplatesData({ includeArchived = false } = {}) {
  setState({ loading: true, error: null, includeArchived })
  try {
    const base = withCourseScope(API)
    const url  = includeArchived
      ? `${base}${base.includes('?') ? '&' : '?'}status=all`
      : base
    const templates = await fetchJSON(url)
    setState({ templates, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshTaskTemplatesData({ includeArchived: state.includeArchived }) })

// ── Optimistic mutations ───────────────────────────────────────────────

export async function createTaskTemplate(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  // The server may return an existing row when the (course_id, name)
  // unique index collides — dedupe locally so the list never doubles.
  const exists = state.templates.some(t => t.id === saved.id)
  setState({
    templates: exists
      ? state.templates.map(t => t.id === saved.id ? saved : t)
      : [saved, ...state.templates],
  })
  return saved
}

export async function patchTaskTemplate(id, updates) {
  const prev = state.templates
  setState({ templates: prev.map(t => t.id === id ? { ...t, ...updates } : t) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ templates: state.templates.map(t => t.id === id ? saved : t) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshTaskTemplatesData({ includeArchived: state.includeArchived })
    throw err
  }
}

export async function archiveTaskTemplate(id) {
  return patchTaskTemplate(id, { status: 'archived' })
}

export async function unarchiveTaskTemplate(id) {
  return patchTaskTemplate(id, { status: 'active' })
}

// ── Subscription hook ──────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshTaskTemplatesData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useTaskTemplatesData — read-only subscription to the task templates
 * vertical. Returns { templates, loading, error, lastFetch,
 * includeArchived }. The DAB dropdown reads `templates` and filters on
 * status === 'active' so the archived toggle does not leak into row
 * pickers.
 */
export function useTaskTemplatesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
