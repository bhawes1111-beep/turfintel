// Inventory data store (Phase 5.2).
//
// Mirrors equipmentStore + repairsStore: module-level cache, fetched once
// on first import, exposed via React's useSyncExternalStore. Optimistic
// mutations, x-admin-key header on every write, refresh-on-error.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'

const API = {
  items: '/api/inventory',
  usage: '/api/inventory/usage',
}

const ADMIN_KEY = 'TurfAdmin2025!'

function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key':  ADMIN_KEY,
  }
}

let state = {
  items:      [],
  usage:      [],
  loading:    true,
  error:      null,
  lastFetch:  null,
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

export async function refreshInventoryData() {
  setState({ loading: true, error: null })
  try {
    const [items, usage] = await Promise.all([
      fetchJSON(withCourseScope(API.items)),
      fetchJSON(withCourseScope(API.usage)),
    ])
    setState({ items, usage, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshInventoryData() })

// ── Optimistic mutations ──────────────────────────────────────────────────

export async function patchInventory(id, updates) {
  const prev = state.items
  const next = prev.map(i => i.id === id ? { ...i, ...updates } : i)
  setState({ items: next })
  try {
    const saved = await fetchJSON(`${API.items}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ items: state.items.map(i => i.id === id ? saved : i) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshInventoryData()
    throw err
  }
}

export async function createInventory(payload) {
  try {
    const saved = await fetchJSON(API.items, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ items: [...state.items, saved] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function deleteInventory(id) {
  const prev = state.items
  setState({ items: prev.filter(i => i.id !== id) })
  try {
    await fetchJSON(`${API.items}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshInventoryData()
    throw err
  }
}

/**
 * Records a usage event atomically. Server-side: finds the matching item by
 * name, decrements its quantity (max 0), and inserts a usage row in one
 * transaction. Locally: patches the affected item and appends the usage.
 */
export async function recordInventoryUsage(payload) {
  try {
    const { item, usage } = await fetchJSON(API.usage, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({
      items: item
        ? state.items.map(i => i.id === item.id ? item : i)
        : state.items,
      usage: [usage, ...state.usage],
    })
    return { item, usage }
  } catch (err) {
    setState({ error: err.message })
    refreshInventoryData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshInventoryData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useInventoryData — read-only subscription to the Inventory vertical.
 * Returns { items, usage, loading, error, lastFetch }.
 */
export function useInventoryData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
