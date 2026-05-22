// Plant Nutrition — standalone applications data store.
//
// Course-scoped CRUD over /api/nutrition. Mirrors the moisture/condition-log
// store pattern. Derived-from-spray nutrients are NOT stored here — they're
// computed live in nutritionTotals.js from the spray + inventory stores.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/nutrition'

let state = { applications: [], loading: true, error: null, lastFetch: null }
const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshNutrition(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days) url += `&days=${encodeURIComponent(opts.days)}`
    const applications = await fetchJSON(url)
    setState({ applications, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshNutrition() })

export async function createNutritionApplication(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ applications: [saved, ...state.applications] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchNutritionApplication(id, updates) {
  const prev = state.applications
  setState({ applications: prev.map(a => a.id === id ? { ...a, ...updates } : a) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ applications: state.applications.map(a => a.id === id ? saved : a) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshNutrition()
    throw err
  }
}

export async function deleteNutritionApplication(id) {
  const prev = state.applications
  setState({ applications: prev.filter(a => a.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: mutationHeaders() })
  } catch (err) {
    setState({ error: err.message })
    refreshNutrition()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) { hasBooted = true; refreshNutrition({ days: 240 }) }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useNutritionData — { applications, loading, error, lastFetch }. */
export function useNutritionData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
