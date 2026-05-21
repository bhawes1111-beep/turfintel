// Weather observation history — client store (Phase 18).
//
// Separate from the live useWeather() hook: useWeather is the real-time
// provider feed (Ambient → NWS → METAR); this store is the persistent
// captured-snapshot record backed by the weather_observations table.
//
// Mirrors the other vertical stores — module-level cache,
// useSyncExternalStore, course-scoped, refetch on course change.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/weather'


let state = {
  history:   [],
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

export async function refreshWeatherHistory(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(`${API}/history`)
    if (opts.from)  url += `&from=${encodeURIComponent(opts.from)}`
    if (opts.to)    url += `&to=${encodeURIComponent(opts.to)}`
    if (opts.limit) url += `&limit=${encodeURIComponent(opts.limit)}`
    const history = await fetchJSON(url)
    setState({ history, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

/**
 * captureCurrentWeather — stores a snapshot of the live normalized
 * weather object. Pass the `current` object straight from useWeather().
 * frost_risk is derived server-side from temp.
 */
export async function captureCurrentWeather(current, source) {
  if (!current || typeof current !== 'object') {
    throw new Error('captureCurrentWeather requires the normalized current object')
  }
  const saved = await fetchJSON(`${API}/observations`, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId:   getSelectedCourseId(),
      source:     source ?? current.source ?? null,
      observedAt: current.observedAt ?? current.timestamp ?? null,
      current,
    }),
  })
  // Prepend to the local cache so the History tab updates immediately.
  setState({ history: [saved, ...state.history] })
  return saved
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshWeatherHistory()
    subscribeCourseChange(() => refreshWeatherHistory())
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useWeatherHistoryData — read-only subscription.
 * Returns { history, loading, error, lastFetch }.
 */
export function useWeatherHistoryData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
