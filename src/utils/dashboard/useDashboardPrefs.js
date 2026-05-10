import { useState, useEffect } from 'react'
import { loadSync, save } from '../persistence/persistence'

const PREFS_KEY = 'turfintel-dashboard-prefs'

// Cards that participate in the resizable grid.
// gdd / calendar live outside .grid (intelligenceRow + calendarSection) — sizing N/A.
// opsCommand is locked to full-width Phase 1.
export const SIZEABLE_CARDS = [
  'alerts',
  'quickActions',
  'schedulingAwareness',
  'weatherIntelligence',
  'irrigationIntelligence',
  'equipmentAlerts',
  'activity',
  'upcomingApplications',
  'recentNotes',
]

export const LOCKED_FULL_WIDTH = ['opsCommand']

export const ALL_VISIBILITY_KEYS = [
  'alerts',
  'quickActions',
  'opsCommand',
  'schedulingAwareness',
  'weatherIntelligence',
  'irrigationIntelligence',
  'gdd',
  'activity',
  'calendar',
  'equipmentAlerts',
  'upcomingApplications',
  'recentNotes',
]

const DEFAULT_VISIBILITY = ALL_VISIBILITY_KEYS.reduce((acc, k) => {
  acc[k] = true
  return acc
}, {})

// Desktop defaults mirror what was previously hardcoded as JSX props.
const DEFAULT_SIZES_DESKTOP = {
  alerts:                 'wide-tall',
  quickActions:           'full',
  schedulingAwareness:    'default',
  weatherIntelligence:    'wide',
  irrigationIntelligence: 'wide',
  equipmentAlerts:        'default',
  activity:               'full',
  upcomingApplications:   'wide',
  recentNotes:            'default',
}

// Tablet caps at 'wide' — no full-width spanning, lower vertical density.
const DEFAULT_SIZES_TABLET = {
  alerts:                 'wide',
  quickActions:           'wide',
  schedulingAwareness:    'default',
  weatherIntelligence:    'wide',
  irrigationIntelligence: 'wide',
  equipmentAlerts:        'default',
  activity:               'wide',
  upcomingApplications:   'wide',
  recentNotes:            'default',
}

const DEFAULT_PREFS = {
  density: 'comfortable',
  visibility: {
    desktop: { ...DEFAULT_VISIBILITY },
    tablet:  { ...DEFAULT_VISIBILITY },
    mobile:  { ...DEFAULT_VISIBILITY },
  },
  sizes: {
    desktop: { ...DEFAULT_SIZES_DESKTOP },
    tablet:  { ...DEFAULT_SIZES_TABLET },
    mobile:  {},
  },
}

// Migration: old payloads stored visibility flat. Promote to per-device.
function hydrate(saved) {
  if (!saved) return DEFAULT_PREFS

  // Detect legacy flat visibility shape.
  const isLegacyVisibility =
    saved.visibility &&
    typeof saved.visibility === 'object' &&
    !('desktop' in saved.visibility)

  const visibility = isLegacyVisibility
    ? {
        desktop: { ...DEFAULT_VISIBILITY, ...saved.visibility },
        tablet:  { ...DEFAULT_VISIBILITY, ...saved.visibility },
        mobile:  { ...DEFAULT_VISIBILITY, ...saved.visibility },
      }
    : {
        desktop: { ...DEFAULT_VISIBILITY, ...(saved.visibility?.desktop ?? {}) },
        tablet:  { ...DEFAULT_VISIBILITY, ...(saved.visibility?.tablet  ?? {}) },
        mobile:  { ...DEFAULT_VISIBILITY, ...(saved.visibility?.mobile  ?? {}) },
      }

  return {
    density: saved.density ?? DEFAULT_PREFS.density,
    visibility,
    sizes: {
      desktop: { ...DEFAULT_SIZES_DESKTOP, ...(saved.sizes?.desktop ?? {}) },
      tablet:  { ...DEFAULT_SIZES_TABLET,  ...(saved.sizes?.tablet  ?? {}) },
      mobile:  {},
    },
  }
}

function detectTier() {
  if (typeof window === 'undefined') return 'desktop'
  if (window.matchMedia('(max-width: 768px)').matches)  return 'mobile'
  if (window.matchMedia('(max-width: 1100px)').matches) return 'tablet'
  return 'desktop'
}

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState(() => hydrate(loadSync(PREFS_KEY)))
  const [tier, setTier]   = useState(() => detectTier())

  // Persist on every change.
  useEffect(() => {
    save(PREFS_KEY, prefs)
  }, [prefs])

  // Re-detect tier on viewport changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mqMobile = window.matchMedia('(max-width: 768px)')
    const mqTablet = window.matchMedia('(max-width: 1100px)')
    const update = () => setTier(detectTier())
    mqMobile.addEventListener('change', update)
    mqTablet.addEventListener('change', update)
    return () => {
      mqMobile.removeEventListener('change', update)
      mqTablet.removeEventListener('change', update)
    }
  }, [])

  function setDensity(density) {
    setPrefs(p => ({ ...p, density }))
  }

  function toggleSection(key) {
    setPrefs(p => ({
      ...p,
      visibility: {
        ...p.visibility,
        [tier]: { ...p.visibility[tier], [key]: !p.visibility[tier][key] },
      },
    }))
  }

  function setSize(key, size) {
    setPrefs(p => ({
      ...p,
      sizes: {
        ...p.sizes,
        [tier]: { ...p.sizes[tier], [key]: size },
      },
    }))
  }

  function resetCurrentLayout() {
    setPrefs(p => ({
      ...p,
      visibility: {
        ...p.visibility,
        [tier]: { ...DEFAULT_VISIBILITY },
      },
      sizes: {
        ...p.sizes,
        [tier]:
          tier === 'desktop' ? { ...DEFAULT_SIZES_DESKTOP }
          : tier === 'tablet' ? { ...DEFAULT_SIZES_TABLET }
          : {},
      },
    }))
  }

  // Helpers consumers use for the active tier.
  const visible = key => prefs.visibility[tier][key] !== false
  const sizeFor = key => {
    if (tier === 'mobile') return 'default'
    if (LOCKED_FULL_WIDTH.includes(key)) return 'full'
    return prefs.sizes[tier][key] ?? 'default'
  }

  return {
    prefs,
    tier,
    visible,
    sizeFor,
    setDensity,
    toggleSection,
    setSize,
    resetCurrentLayout,
  }
}
