/**
 * useAppPrefs — small hook for app-wide preferences.
 *
 * Persists to localStorage via the existing persistence layer
 * (key: turfintel-app-prefs). Reusable for future app-wide prefs
 * (theme, density default, etc.) — Phase 1 only stores pageNavStyle.
 *
 * Schema:
 *   {
 *     pageNavStyle: 'dropdown' | 'buttons'   // default: 'dropdown'
 *   }
 */

import { useEffect, useState } from 'react'
import { loadSync, save } from '../persistence/persistence'

export const APP_PREFS_KEY = 'turfintel-app-prefs'

export const APP_PREFS_DEFAULTS = {
  pageNavStyle: 'dropdown',
}

function hydrate(saved) {
  if (!saved || typeof saved !== 'object') return { ...APP_PREFS_DEFAULTS }
  return { ...APP_PREFS_DEFAULTS, ...saved }
}

export function useAppPrefs() {
  const [prefs, setPrefsState] = useState(() => hydrate(loadSync(APP_PREFS_KEY)))

  useEffect(() => {
    save(APP_PREFS_KEY, prefs)
  }, [prefs])

  function setPref(key, value) {
    setPrefsState(p => ({ ...p, [key]: value }))
  }

  function resetPrefs() {
    setPrefsState({ ...APP_PREFS_DEFAULTS })
  }

  return { prefs, setPref, resetPrefs }
}
