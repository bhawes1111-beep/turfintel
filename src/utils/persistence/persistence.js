// ── TurfIntel Persistence Layer ────────────────────────────────────────────────
// Public API for all app persistence. Consumers never touch localStorage or
// IndexedDB directly — they call these five functions.
//
// Strategy: sync-bootstrap + dual-write + async migration
//   loadSync()  — synchronous localStorage read for useReducer initializers
//   load()      — async read: IDB primary, localStorage fallback
//   save()      — dual-write: localStorage sync first, then IDB async
//   clear()     — removes key from both stores
//   migrate()   — one-time copy: localStorage → IDB (safe to call every mount)
//
// localStorage always stays current so the app can cold-start without IDB.

import { resolveAdapter, localStorageAdapter } from './storageAdapter'

// ── loadSync ───────────────────────────────────────────────────────────────────
// Synchronous read from localStorage. The only acceptable call site is a
// useReducer lazy initializer — everywhere else use load().

export function loadSync(key) {
  return localStorageAdapter.getSync(key)
}

// ── load ───────────────────────────────────────────────────────────────────────
// Async read. Tries IDB first; falls back to localStorage if IDB is
// unavailable or returns null.

export async function load(key, defaultValue = null) {
  try {
    const adapter = await resolveAdapter()
    const value   = await adapter.get(key)
    if (value !== null) return value
  } catch {
    // IDB failed — fall through to localStorage backup.
  }
  return localStorageAdapter.getSync(key) ?? defaultValue
}

// ── save ───────────────────────────────────────────────────────────────────────
// Dual-write: localStorage first (synchronous, immediate backup), then IDB
// (async, primary store). Returns a Promise that resolves when IDB write
// completes but callers can safely fire-and-forget.

export async function save(key, value) {
  // 1. Synchronous localStorage backup — always written first.
  localStorageAdapter.setSync(key, value)

  // 2. Async IDB write — best-effort, never crashes the app.
  try {
    const adapter = await resolveAdapter()
    if (adapter !== localStorageAdapter) {
      await adapter.set(key, value)
    }
  } catch {
    // IDB write failed — localStorage backup is sufficient.
  }
}

// ── clear ──────────────────────────────────────────────────────────────────────
// Removes key from both stores. Errors are swallowed so clear() never throws.

export async function clear(key) {
  localStorageAdapter.removeSync(key)
  try {
    const adapter = await resolveAdapter()
    if (adapter !== localStorageAdapter) await adapter.remove(key)
  } catch { /* ignore */ }
}

// ── migrate ────────────────────────────────────────────────────────────────────
// One-time promotion: if the key exists in localStorage but not yet in IDB,
// copies the value into IDB. Safe to call on every app mount — it is a no-op
// when IDB already has data for this key.

export async function migrate(key) {
  try {
    const adapter = await resolveAdapter()
    if (adapter === localStorageAdapter) return // IDB unavailable — nothing to do.

    const existing = await adapter.get(key)
    if (existing !== null) return // Already in IDB — no migration needed.

    const lsValue = localStorageAdapter.getSync(key)
    if (lsValue === null) return // Nothing in localStorage to migrate.

    await adapter.set(key, lsValue)
    console.debug('[persistence] Migrated "%s": localStorage → IndexedDB', key)
  } catch {
    // Migration is non-critical — silently skip on any error.
    console.debug('[persistence] Migration skipped for "%s" — IDB error', key)
  }
}
