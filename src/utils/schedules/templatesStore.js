// Schedule templates — client store (Phase 14).
//
// Same vertical-store template as the others, plus a dedicated apply()
// helper that triggers a refresh of the schedules store so the editor
// reflects the new state immediately.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'
import { refreshEmployeeSchedulesData } from './schedulesStore'

const API = '/api/schedule-templates'


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
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshScheduleTemplatesData() {
  setState({ loading: true, error: null })
  try {
    const templates = await fetchJSON(withCourseScope(API))
    setState({ templates, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function getScheduleTemplate(id) {
  return fetchJSON(`${API}/${encodeURIComponent(id)}`)
}

export async function createScheduleTemplate(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  setState({ templates: [saved, ...state.templates] })
  return saved
}

export async function patchScheduleTemplate(id, updates) {
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
    refreshScheduleTemplatesData()
    throw err
  }
}

export async function deleteScheduleTemplate(id) {
  const prev = state.templates
  setState({ templates: prev.filter(t => t.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshScheduleTemplatesData()
    throw err
  }
}

/**
 * applyScheduleTemplate — server-side full replace of the course's
 * employee_schedules with the template's rows. Returns { applied,
 * skipped, templateName }. The schedules store is refreshed
 * automatically so the editor picks up the new state.
 */
export async function applyScheduleTemplate(id) {
  const result = await fetchJSON(`${API}/${encodeURIComponent(id)}/apply`, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify({}),
  })
  await refreshEmployeeSchedulesData()
  return result
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshScheduleTemplatesData()
    subscribeCourseChange(refreshScheduleTemplatesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useScheduleTemplatesData — read-only subscription.
 * Returns { templates, loading, error, lastFetch }.
 */
export function useScheduleTemplatesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
