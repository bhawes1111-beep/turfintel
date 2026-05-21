// Phase 31 — Pilot Feedback data store.
//
// Mirrors the equipment/notes store pattern: a module-level cache fetched
// once on first subscribe, exposed via useSyncExternalStore, with optimistic
// mutations that re-fetch on failure. Course-scoped.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/pilot-feedback'


let state = {
  feedback:  [],
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() {
  subscribers.forEach(cb => cb())
}

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

export async function refreshFeedbackData() {
  setState({ loading: true, error: null })
  try {
    const feedback = await fetchJSON(withCourseScope(API))
    setState({ feedback, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// Switch operational course → refetch.
subscribeCourseChange(() => { if (hasBooted) refreshFeedbackData() })

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createFeedback(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ feedback: [saved, ...state.feedback] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchFeedback(id, updates) {
  const prev = state.feedback
  const next = prev.map(f => f.id === id ? { ...f, ...updates } : f)
  setState({ feedback: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ feedback: state.feedback.map(f => f.id === id ? saved : f) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshFeedbackData()
    throw err
  }
}

export async function deleteFeedback(id) {
  const prev = state.feedback
  setState({ feedback: prev.filter(f => f.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshFeedbackData()
    throw err
  }
}

// ── React hook ────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshFeedbackData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * usePilotFeedback — read-only subscription to the pilot feedback vertical.
 * Returns { feedback, loading, error, lastFetch }.
 */
export function usePilotFeedback() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
