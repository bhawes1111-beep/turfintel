import { useState, useEffect } from 'react'
import { loadSync, save } from '../persistence/persistence'

const PREFS_KEY = 'turfintel-dashboard-prefs'

const DEFAULT_PREFS = {
  density: 'comfortable',
  visibility: {
    alerts:                 true,
    quickActions:           true,
    opsCommand:             true,
    schedulingAwareness:    true,
    weatherIntelligence:    true,
    irrigationIntelligence: true,
    gdd:                    true,
    activity:               true,
    calendar:               true,
    equipmentAlerts:        true,
    upcomingApplications:   true,
    recentNotes:            true,
  },
}

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState(() => {
    const saved = loadSync(PREFS_KEY)
    if (!saved) return DEFAULT_PREFS
    return {
      density:    saved.density    ?? DEFAULT_PREFS.density,
      visibility: { ...DEFAULT_PREFS.visibility, ...saved.visibility },
    }
  })

  useEffect(() => {
    save(PREFS_KEY, prefs)
  }, [prefs])

  function setDensity(density) {
    setPrefs(p => ({ ...p, density }))
  }

  function toggleSection(key) {
    setPrefs(p => ({
      ...p,
      visibility: { ...p.visibility, [key]: !p.visibility[key] },
    }))
  }

  return { prefs, setDensity, toggleSection }
}
