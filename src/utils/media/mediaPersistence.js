// ── TurfIntel Media — IndexedDB Persistence ───────────────────────────────────
//
// Separate database from the main app store — deliberately isolated so media
// blob storage cannot destabilize operations persistence.
//
// Database:  turfintel-media-db  (version 1)
// Stores:
//   media-meta  — JSON metadata records (keyPath: 'id')
//                 Indexes: by_module, by_type, by_createdAt
//   media-blobs — Raw Blob objects (out-of-line keys)
//                 Keys: '{id}' for main blob, '{id}-thumb' for thumbnail
//
// IDB stores Blobs natively via structured clone — no JSON serialization needed.
// All functions return Promises and propagate IDB errors to callers.

const DB_NAME    = 'turfintel-media-db'
const META_STORE = 'media-meta'
const BLOB_STORE = 'media-blobs'
const DB_VERSION = 1

let _db = null

function openDb() {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result

      if (!db.objectStoreNames.contains(META_STORE)) {
        const store = db.createObjectStore(META_STORE, { keyPath: 'id' })
        store.createIndex('by_module',    'module',    { unique: false })
        store.createIndex('by_type',      'type',      { unique: false })
        store.createIndex('by_createdAt', 'createdAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE)   // out-of-line keys — put(blob, key)
      }
    }

    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = e => reject(e.target.error)
    req.onblocked = () => reject(new Error('turfintel-media-db blocked by another tab'))
  })
}

// ── Metadata operations ────────────────────────────────────────────────────────

export function saveMeta(record) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(META_STORE, 'readwrite')
    const req = tx.objectStore(META_STORE).put(record)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}

export function getMeta(id) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = e => reject(e.target.error)
  }))
}

export function getAllMeta() {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = e => reject(e.target.error)
  }))
}

export function getMetaByModule(module) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(META_STORE, 'readonly')
    const range = IDBKeyRange.only(module)
    const req   = tx.objectStore(META_STORE).index('by_module').getAll(range)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = e => reject(e.target.error)
  }))
}

export function getMetaByType(type) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(META_STORE, 'readonly')
    const range = IDBKeyRange.only(type)
    const req   = tx.objectStore(META_STORE).index('by_type').getAll(range)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = e => reject(e.target.error)
  }))
}

export function deleteMeta(id) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(META_STORE, 'readwrite')
    const req = tx.objectStore(META_STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}

// ── Blob operations ────────────────────────────────────────────────────────────
// IDB delete is idempotent — deleting a non-existent key succeeds silently.

export function saveBlob(key, blob) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(BLOB_STORE, 'readwrite')
    const req = tx.objectStore(BLOB_STORE).put(blob, key)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}

export function getBlob(key) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(BLOB_STORE, 'readonly')
    const req = tx.objectStore(BLOB_STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = e => reject(e.target.error)
  }))
}

export function deleteBlob(key) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(BLOB_STORE, 'readwrite')
    const req = tx.objectStore(BLOB_STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  }))
}
