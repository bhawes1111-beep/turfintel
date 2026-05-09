// ── TurfIntel Shared Intelligence — Severity System ───────────────────────────

// Canonical 5-level system (highest → lowest)
export const SEVERITY = {
  CRITICAL: 'critical',
  WARNING:  'warning',
  CAUTION:  'caution',
  INFO:     'info',
  GOOD:     'good',
}

// Covers both new 5-level names and legacy 3-level aliases
export const SEVERITY_ORDER = {
  critical: 0,
  high:     0,  // legacy alias → critical
  warning:  1,
  medium:   2,  // legacy alias → caution
  caution:  2,
  info:     3,
  low:      3,  // legacy alias → info
  good:     4,
}

export function sortBySeverity(arr) {
  return [...arr].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  )
}

// ── Weather / spray severity palette (danger semantics) ───────────────────────
// Exact colors from WeatherIntelligence.jsx SEVERITY_META — do not change
export const SEVERITY_TOKENS = {
  critical: { color: '#e07070', bg: 'rgba(220,80,80,0.10)',  border: 'rgba(220,80,80,0.25)',  label: 'Critical' },
  high:     { color: '#e07070', bg: 'rgba(220,80,80,0.10)',  border: 'rgba(220,80,80,0.25)',  label: 'High' },
  warning:  { color: '#d4883a', bg: 'rgba(210,130,40,0.10)', border: 'rgba(210,130,40,0.25)', label: 'Warning' },
  medium:   { color: '#d4883a', bg: 'rgba(210,130,40,0.10)', border: 'rgba(210,130,40,0.25)', label: 'Medium' },
  caution:  { color: '#d4883a', bg: 'rgba(210,130,40,0.10)', border: 'rgba(210,130,40,0.25)', label: 'Caution' },
  info:     { color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.25)',  label: 'Info' },
  low:      { color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.25)',  label: 'Low' },
  good:     { color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.25)',  label: 'Good' },
}

// ── Irrigation severity palette (water-context semantics) ─────────────────────
// Exact colors from IrrigationIntelligence.jsx SEVERITY_META — do not change
export const IRRIGATION_SEVERITY_TOKENS = {
  critical: { color: '#3a8ad4', bg: 'rgba(58,138,212,0.10)', border: 'rgba(58,138,212,0.28)', label: 'Critical' },
  high:     { color: '#3a8ad4', bg: 'rgba(58,138,212,0.10)', border: 'rgba(58,138,212,0.28)', label: 'High' },
  warning:  { color: '#4a9e4a', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.28)',  label: 'Warning' },
  medium:   { color: '#4a9e4a', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.28)',  label: 'Medium' },
  caution:  { color: '#4a9e4a', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.28)',  label: 'Caution' },
  info:     { color: '#7a9e7a', bg: 'rgba(74,158,74,0.06)',  border: 'rgba(74,158,74,0.18)',  label: 'Info' },
  low:      { color: '#7a9e7a', bg: 'rgba(74,158,74,0.06)',  border: 'rgba(74,158,74,0.18)',  label: 'Low' },
  good:     { color: '#7a9e7a', bg: 'rgba(74,158,74,0.06)',  border: 'rgba(74,158,74,0.18)',  label: 'Good' },
}
