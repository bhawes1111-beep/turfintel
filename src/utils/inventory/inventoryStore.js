// Inventory data store (Phase 5.2).
//
// Mirrors equipmentStore + repairsStore: module-level cache, fetched once
// on first import, exposed via React's useSyncExternalStore. Optimistic
// mutations, x-admin-key header on every write, refresh-on-error.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = {
  items: '/api/inventory',
  usage: '/api/inventory/usage',
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
  // Phase 3C: session-cookie auth — credentials sends the httpOnly ti_session
  // cookie; no x-admin-key from the browser. The Worker gate enforces role.
  const res = await fetch(url, { credentials: 'same-origin', ...init })
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

// Phase 7C.2 (1/?) — Manual catalog-link control.
//
// Narrow client wrapper around PATCH /api/inventory/:id/catalog-link.
// Optimistic: patches the local row's productCatalogId first so the
// 📋 chip and Spray Builder resolver flip immediately; on error we
// roll back and surface the message. Pass `null` to unlink.
//
// Kept distinct from patchInventory() on purpose — link is not a form
// field, it's a stewardship action with its own validation server-side.
export async function setInventoryCatalogLink(id, productCatalogId) {
  const next = productCatalogId === null || productCatalogId === ''
    ? null
    : String(productCatalogId)
  const prev = state.items
  setState({
    items: prev.map(i => i.id === id ? { ...i, productCatalogId: next } : i),
  })
  try {
    const saved = await fetchJSON(
      `${API.items}/${encodeURIComponent(id)}/catalog-link`,
      {
        method:  'PATCH',
        headers: mutationHeaders(),
        body:    JSON.stringify({ productCatalogId: next }),
      },
    )
    setState({ items: state.items.map(i => i.id === id ? saved : i) })
    return saved
  } catch (err) {
    setState({ items: prev, error: err.message })
    throw err
  }
}

// Phase 7J (1/?) — Cost-basis stewardship control.
//
// Narrow client wrapper around PATCH /api/inventory/:id/cost-basis.
// Optimistic: patches the local row's cost-basis fields first so the
// drawer reflects the new state immediately; on error we roll back
// and surface the message.
//
// Kept distinct from patchInventory() on purpose — cost basis is a
// stewardship action with its own server-side validation (the unit
// is required when a cost is set, costSource is constrained to the
// allowed vocabulary, and the timestamp is server-stamped).
//
// Pass costPerUnit=null to clear the entire cost-basis cluster.
export async function setInventoryCostBasis(id, patch) {
  const costPerUnit = patch?.costPerUnit ?? null
  const costUnit    = patch?.costUnit    ?? null
  const costSource  = patch?.costSource  ?? null
  const costNotes   = patch?.costNotes   ?? null
  // Phase 7M.1 — optional audit attribution. Callers pick from
  // 'manual' / 'import-single-row' / 'unknown'; the server validates
  // the value before writing. Omitting it lets the server default
  // to 'manual'.
  const changeSource = patch?.changeSource ?? null

  const prev = state.items
  const optimistic = prev.map(i => i.id === id ? {
    ...i,
    costPerUnit,
    costUnit,
    costSource:    costPerUnit === null ? null
                  : (costSource || 'manual'),
    costUpdatedAt: costPerUnit === null ? null : new Date().toISOString(),
    costNotes,
  } : i)
  setState({ items: optimistic })

  try {
    const body = { costPerUnit, costUnit, costSource, costNotes }
    if (changeSource != null) body.changeSource = changeSource
    const saved = await fetchJSON(
      `${API.items}/${encodeURIComponent(id)}/cost-basis`,
      {
        method:  'PATCH',
        headers: mutationHeaders(),
        body:    JSON.stringify(body),
      },
    )
    // Phase 7M.2 — strip the optional audit-failure marker from the
    // cached row so the inventory store never carries an out-of-band
    // status string into other consumers (the cost-awareness helpers,
    // the planner, etc.). The marker is still returned to the
    // immediate caller so the editor can render an audit-warning
    // banner.
    const { _costBasisAuditError, ...cachedRow } = saved ?? {}
    setState({ items: state.items.map(i => i.id === id ? cachedRow : i) })
    return saved
  } catch (err) {
    setState({ items: prev, error: err.message })
    throw err
  }
}

// Phase 7M (1/?) — Inventory cost-basis audit history reader.
//
// Read-only wrapper around GET /api/inventory/:id/cost-basis-audit.
// Returns the per-item history newest-first as a plain array. Audit
// data is never cached in the inventory store — it's a per-drawer
// fetch so the UI always renders the live trail.
export async function listInventoryCostBasisAudit(inventoryItemId) {
  if (!inventoryItemId) return []
  const url = `${API.items}/${encodeURIComponent(inventoryItemId)}/cost-basis-audit`
  return fetchJSON(url)
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
