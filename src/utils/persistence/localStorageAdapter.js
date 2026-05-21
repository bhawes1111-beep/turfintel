// ── localStorage Adapter ───────────────────────────────────────────────────────
// Sync-first adapter that wraps localStorage with JSON handling.
// All reads return parsed values (not raw strings); all writes serialize to JSON.
// Never throws — returns null on any read failure, silently skips write failures.

export const localStorageAdapter = {

  // Synchronous read — safe to call in useReducer lazy initializer.
  getSync(key) {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  // Synchronous write — called first inside persistence.save() for immediate backup.
  setSync(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded or restricted storage — fail silently.
    }
  },

  // Synchronous remove.
  removeSync(key) {
    try {
      localStorage.removeItem(key)
    } catch { /* ignore */ }
  },

  // Promise wrappers — satisfy the shared adapter interface used by storageAdapter.js.
  get(key)        { return Promise.resolve(this.getSync(key)) },
  set(key, value) { return Promise.resolve(this.setSync(key, value)) },
  remove(key)     { return Promise.resolve(this.removeSync(key)) },
}
