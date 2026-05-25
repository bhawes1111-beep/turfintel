// Phase 7B.1 — Turf Health type metadata shared by every workspace surface.
//
// Single source of truth for the 12 health-type presets. Keep in sync with
// ALLOWED_HEALTH_TYPES in worker/api/turfHealth.js — smoke covers the set
// equality between the Worker validation list and this UI list.

export const HEALTH_TYPE_LABELS = {
  'morning-shade':      'Morning shade',
  'afternoon-shade':    'Afternoon shade',
  'all-day-shade':      'All-day shade',
  'poor-airflow':       'Poor airflow',
  'wet-pocket':         'Wet pocket',
  'weak-bermuda':       'Weak bermuda',
  'slow-recovery':      'Slow recovery',
  'algae-moss':         'Algae / moss',
  'chronic-wilt':       'Chronic wilt',
  'localized-dry-spot': 'Dry spot',
  'traffic-stress':     'Traffic',
  'scalping-thin':      'Scalping / thin',
}

export const HEALTH_TYPE_ICONS = {
  'morning-shade':      '🌅',
  'afternoon-shade':    '🌇',
  'all-day-shade':      '🌑',
  'poor-airflow':       '🌬️',
  'wet-pocket':         '💧',
  'weak-bermuda':       '🌾',
  'slow-recovery':      '🐢',
  'algae-moss':         '🪨',
  'chronic-wilt':       '🥵',
  'localized-dry-spot': '🟤',
  'traffic-stress':     '👣',
  'scalping-thin':      '✂️',
}

export function healthTypeLabel(key) {
  return HEALTH_TYPE_LABELS[key] ?? key ?? '—'
}

export function healthTypeIcon(key) {
  return HEALTH_TYPE_ICONS[key] ?? '🌱'
}

// Severity ordering for sorting (lower index = more urgent).
export const SEVERITY_ORDER = { high: 0, moderate: 1, low: 2 }

// Display labels for severity (capitalized for the UI).
export const SEVERITY_LABELS = {
  low:      'Low',
  moderate: 'Moderate',
  high:     'High',
}
