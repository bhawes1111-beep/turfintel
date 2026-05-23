// Admin users store — CRUD over /api/users.
//
// Uses the session cookie for auth (credentials: same-origin) — the admin
// page is for logged-in admins. Simple fetch helpers + a useUsers() hook
// over useSyncExternalStore, matching the other stores.

import { useSyncExternalStore } from 'react'

const API = '/api/users'

let state = { users: [], loading: true, error: null }
const subscribers = new Set()
function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  let data = null
  try { data = await res.json() } catch { /* empty ok */ }
  if (!res.ok) throw new Error(data?.error || `${init?.method ?? 'GET'} ${url} → ${res.status}`)
  return data
}

export async function refreshUsers() {
  setState({ loading: true, error: null })
  try {
    const users = await fetchJSON(API)
    setState({ users: Array.isArray(users) ? users : [], loading: false })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function createUser(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  setState({ users: [...state.users, saved] })
  return saved
}

/**
 * inviteUser — POST /api/users/invite. Creates a user with status='invited'
 * and mints an invite token; the server returns the raw one-time URL.
 *
 * IMPORTANT: the returned { inviteUrl, expiresAt } is given back to the
 * caller for a one-shot copy-link UI. The store DOES NOT cache it — the
 * URL never enters `state.users` nor any other persisted slot. Only the
 * public user projection (no token) is added to the list.
 */
export async function inviteUser(payload) {
  const res = await fetchJSON(`${API}/invite`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (res?.user) setState({ users: [...state.users, res.user] })
  return res   // { ok, user, inviteUrl, expiresAt }
}

export async function updateUser(id, updates) {
  const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(updates),
  })
  setState({ users: state.users.map(u => u.id === id ? saved : u) })
  return saved
}

function subscribe(cb) {
  subscribers.add(cb)
  if (state.loading && state.users.length === 0) refreshUsers()
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

export function useUsers() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
