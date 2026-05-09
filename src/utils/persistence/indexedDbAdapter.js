// ── IndexedDB Adapter ──────────────────────────────────────────────────────────
// Key-value store backed by IndexedDB.
// DB: 'turfintel-db'  |  Object store: 'keyval'  |  Version: 1
//
// Stores plain JS values (no JSON serialization — IDB handles structured clone).
// Module-level cached connection so the DB is only opened once per session.
// All methods return Promises and propagate IDB errors for callers to handle.

const DB_NAME    = 'turfintel-db'
const STORE_NAME = 'keyval'
const DB_VERSION = 1

let _db = null

function openDb() {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    req.onsuccess  = e => { _db = e.target.result; resolve(_db) }
    req.onerror    = e => reject(e.target.error)
    req.onblocked  = () => reject(new Error('IndexedDB blocked'))
  })
}

function idbGet(key) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = e => reject(e.target.error)
  }))
}

function idbSet(key, value) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}

function idbRemove(key) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}

export const indexedDbAdapter = {
  get:    idbGet,
  set:    idbSet,
  remove: idbRemove,
}
