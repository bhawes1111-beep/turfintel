// Crew employees data store (Phase 5.6).
//
// Mirrors the seven other vertical stores: module-level cache,
// useSyncExternalStore subscription, optimistic mutations, x-admin-key
// on writes, refresh-on-error.
//
// Each row exposes both the new canonical keys (id, name) and the legacy
// aliases (employeeId, fullName, assignedArea) so the static-EMPLOYEES
// consumers (OperationsBoard, CrewEmployees, CrewSchedule, CrewTasks)
// swap data source without a field-rename pass.

import { useSyncExternalStore } from 'react'

const API = '/api/crew-employees'

const ADMIN_KEY = 'TurfAdmin2025!'

function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key':  ADMIN_KEY,
  }
}

let state = {
  employees: [],
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

export async function refreshCrewData() {
  setState({ loading: true, error: null })
  try {
    const employees = await fetchJSON(API)
    setState({ employees, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// ── Optimistic mutations ───────────────────────────────────────────────────

export async function createCrewEmployee(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify(payload),
    })
    setState({ employees: [saved, ...state.employees] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchCrewEmployee(id, updates) {
  const prev = state.employees
  const next = prev.map(e => e.id === id ? { ...e, ...updates } : e)
  setState({ employees: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ employees: state.employees.map(e => e.id === id ? saved : e) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshCrewData()
    throw err
  }
}

export async function deleteCrewEmployee(id) {
  const prev = state.employees
  setState({ employees: prev.filter(e => e.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshCrewData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshCrewData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useCrewData — read-only subscription to the crew vertical.
 * Returns { employees, loading, error, lastFetch }.
 *
 * Each employee row carries both new canonical keys (id, name) AND
 * legacy aliases (employeeId, fullName, assignedArea) so existing
 * consumers keep working without field-rename churn.
 */
export function useCrewData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
