// Phase E.5 — Shift Templates client store.
//
// Mirrors taskTemplateStore / scheduleOverridesStore: module-level
// cache, useSyncExternalStore subscription, optimistic mutations,
// course-scoped. Each template carries a `rowCount` summary on list
// reads; the full rows[] array is fetched on demand via getShiftTemplate.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/shift-templates'

let state = {
  templates: [],
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

export async function refreshShiftTemplatesData() {
  setState({ loading: true, error: null })
  try {
    const templates = await fetchJSON(withCourseScope(API))
    setState({ templates, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// One-shot fetch for the full template (header + rows).
export async function fetchShiftTemplateById(id) {
  return fetchJSON(`${API}/${encodeURIComponent(id)}`)
}

export async function createShiftTemplate(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  const exists = state.templates.some(t => t.id === saved.id)
  setState({
    templates: exists
      ? state.templates.map(t => t.id === saved.id ? saved : t)
      : [saved, ...state.templates],
  })
  return saved
}

export async function patchShiftTemplate(id, updates) {
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
    refreshShiftTemplatesData()
    throw err
  }
}

export async function deleteShiftTemplate(id) {
  const prev = state.templates
  setState({ templates: prev.filter(t => t.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshShiftTemplatesData()
    throw err
  }
}

// Apply a template to a specific effective_date. Returns the worker's
// summary { applied, skipped, replaced } so the UI can toast cleanly.
export async function applyShiftTemplate(id, { effectiveDate, replace }) {
  return fetchJSON(`${API}/${encodeURIComponent(id)}/apply`, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify({ effectiveDate, replace: replace === true }),
  })
}

// Copy a day's merged schedule onto another date. Used by the
// calendar's drag-to-copy interaction.
export async function copyScheduleDay({ sourceDate, destinationDate, replace }) {
  return fetchJSON('/api/employee-schedules/copy-day', {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      sourceDate,
      destinationDate,
      replace: replace === true,
    }),
  })
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshShiftTemplatesData()
    subscribeCourseChange(refreshShiftTemplatesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

export function useShiftTemplatesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
