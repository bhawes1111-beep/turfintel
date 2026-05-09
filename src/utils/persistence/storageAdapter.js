// ── Storage Adapter Resolver ───────────────────────────────────────────────────
// Detects IndexedDB availability once at runtime and caches the result.
// Returns the best adapter for the current environment.
//
// Falls back to localStorage when:
//   - IndexedDB API is absent (old browsers, some SSR environments)
//   - IDB throws on open (private browsing in Firefox/Safari, storage quota)
//   - Any other IDB error during the availability probe
//
// The probe key is never exposed to application code — it is cleaned up after
// detection (best-effort; leftover probe entries are harmless).

import { indexedDbAdapter  } from './indexedDbAdapter'
import { localStorageAdapter } from './localStorageAdapter'

const PROBE_KEY = '__turfintel_idb_probe__'

let _resolvedAdapter = null  // null = not yet detected

export async function resolveAdapter() {
  if (_resolvedAdapter !== null) return _resolvedAdapter

  if (typeof indexedDB === 'undefined') {
    console.debug('[persistence] IndexedDB not available — using localStorage')
    _resolvedAdapter = localStorageAdapter
    return _resolvedAdapter
  }

  try {
    await indexedDbAdapter.set(PROBE_KEY, 1)
    await indexedDbAdapter.remove(PROBE_KEY)
    _resolvedAdapter = indexedDbAdapter
    console.debug('[persistence] IndexedDB available — using as primary store')
  } catch {
    console.debug('[persistence] IndexedDB unavailable — falling back to localStorage')
    _resolvedAdapter = localStorageAdapter
  }

  return _resolvedAdapter
}

export { indexedDbAdapter, localStorageAdapter }
