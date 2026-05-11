// Alerts data store (Phase 5.4b).
//
// Mirrors equipmentStore / repairsStore / inventoryStore / spraysStore /
// calendarStore: module-level cache, useSyncExternalStore subscription,
// optimistic mutations, x-admin-key on writes, refresh-on-error.
//
// Cross-module alert writers (BuildSpraySheet REI / insufficient-stock /
// stock-threshold, Repairs high-priority) now call createAlert() here
// instead of dispatching CREATE_ALERT.
//
// Soft state semantics:
//   dismissAlert(id)     → status='resolved',    dismissed_at=now
//   acknowledgeAlert(id) → status='acknowledged', acknowledged_at=now
// Audit trail is preserved server-side; consumers filter by status to
// hide resolved alerts from active surfaces.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'

const API = '/api/alerts'

const ADMIN_KEY = 'TurfAdmin2025!'

function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key':  ADMIN_KEY,
  }
}

let state = {
  alerts:    [],
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

export async function refreshAlertsData() {
  setState({ loading: true, error: null })
  try {
    const alerts = await fetchJSON(withCourseScope(API))
    setState({ alerts, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshAlertsData() })

// ── Optimistic mutations ───────────────────────────────────────────────────

export async function createAlert(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ alerts: [saved, ...state.alerts] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchAlert(id, updates) {
  const prev = state.alerts
  const next = prev.map(a => a.id === id ? { ...a, ...updates } : a)
  setState({ alerts: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ alerts: state.alerts.map(a => a.id === id ? saved : a) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshAlertsData()
    throw err
  }
}

export async function dismissAlert(id) {
  return patchAlert(id, {
    status:       'resolved',
    dismissedAt:  new Date().toISOString(),
  })
}

export async function acknowledgeAlert(id) {
  return patchAlert(id, {
    status:          'acknowledged',
    acknowledgedAt:  new Date().toISOString(),
  })
}

export async function deleteAlert(id) {
  const prev = state.alerts
  setState({ alerts: prev.filter(a => a.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshAlertsData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshAlertsData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useAlertsData — read-only subscription to the Alerts vertical.
 * Returns { alerts, loading, error, lastFetch }.
 *
 * Each alert preserves the pre-5.4b nested shape used by Dashboard alert
 * cards and OperationalSummary: { id, title, message, module, priority,
 * status, course, date ("May 6" string), actionLabel, metadata: {
 * sourceId, sourceModule, createdAt } }.
 */
export function useAlertsData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
