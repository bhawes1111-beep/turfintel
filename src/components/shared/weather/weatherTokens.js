// ── Condition token map ────────────────────────────────────────────────────
// Applied via CSS class to set --cond-* custom properties consumed by badges
// and banners. Also drives spray window and disease pressure badges.
export const CONDITION_TOKENS = {
  favorable: { label: 'Favorable', color: '#4a9e4a', bg: 'rgba(74,158,74,0.12)',   border: 'rgba(74,158,74,0.25)' },
  caution:   { label: 'Caution',   color: '#d4883a', bg: 'rgba(210,130,40,0.12)',  border: 'rgba(210,130,40,0.25)' },
  danger:    { label: 'Danger',    color: '#e05050', bg: 'rgba(220,60,60,0.12)',   border: 'rgba(220,60,60,0.25)' },
  ideal:     { label: 'Ideal',     color: '#3a8ad4', bg: 'rgba(58,138,212,0.12)',  border: 'rgba(58,138,212,0.25)' },
}

// ── Spray window tokens ────────────────────────────────────────────────────
export const SPRAY_WINDOW_TOKENS = {
  ideal:   { label: 'Ideal Window',    color: '#4a9e4a', bg: 'rgba(74,158,74,0.12)',   border: 'rgba(74,158,74,0.25)',   icon: '✓' },
  caution: { label: 'Marginal',        color: '#d4883a', bg: 'rgba(210,130,40,0.12)',  border: 'rgba(210,130,40,0.25)',  icon: '⚠' },
  poor:    { label: 'Poor Conditions', color: '#e05050', bg: 'rgba(220,60,60,0.12)',   border: 'rgba(220,60,60,0.25)',   icon: '✕' },
}

// ── Disease pressure tokens ────────────────────────────────────────────────
export const DISEASE_PRESSURE_TOKENS = {
  low:      { label: 'Low',      color: '#4a9e4a', bg: 'rgba(74,158,74,0.12)',   border: 'rgba(74,158,74,0.25)',   order: 0 },
  medium:   { label: 'Moderate', color: '#d4883a', bg: 'rgba(210,130,40,0.12)',  border: 'rgba(210,130,40,0.25)',  order: 1 },
  high:     { label: 'High',     color: '#e05050', bg: 'rgba(220,60,60,0.12)',   border: 'rgba(220,60,60,0.25)',   order: 2 },
  critical: { label: 'Critical', color: '#b03030', bg: 'rgba(176,48,48,0.15)',   border: 'rgba(176,48,48,0.35)',   order: 3 },
}

// ── Weather icon map (Unicode/emoji) ───────────────────────────────────────
export const WEATHER_ICONS = {
  sunny:        '☀',
  partlyCloudy: '⛅',
  cloudy:       '☁',
  rainy:        '🌧',
  stormy:       '⛈',
  windy:        '💨',
  foggy:        '🌫',
}

// ── Current conditions — empty until weather feed is wired ────────────────
// Shape mirrors what a future NOAA / Weather.gov feed will provide. Values
// are null/empty so consumers can detect "no data yet" via simple checks.
export const PLACEHOLDER_CURRENT = {
  location:        '',
  currentTemp:     null,
  feelsLike:       null,
  humidity:        null,
  wind:            null,
  windDir:         '',
  rainfall24h:     null,
  soilTemp:        null,
  solarRadiation:  null,
  dewPoint:        null,
  etRate:          null,
  etDeficit:       null,
  diseasePressure: null,
  sprayWindow:     null,
  timestamp:       null,
}

// ── 7-day ET trend — empty until feed is wired ────────────────────────────
export const PLACEHOLDER_ET_TREND = []

// ── 7-day forecast — empty until feed is wired ────────────────────────────
export const PLACEHOLDER_FORECAST = []

// ── Weather alert banners — empty until feed is wired ─────────────────────
export const PLACEHOLDER_WEATHER_ALERTS = []

// ── Helper functions ───────────────────────────────────────────────────────

export function resolveCondition(key) {
  return CONDITION_TOKENS[key] ?? CONDITION_TOKENS.caution
}

export function resolveSprayWindow(key) {
  return SPRAY_WINDOW_TOKENS[key] ?? SPRAY_WINDOW_TOKENS.caution
}

export function resolveDiseasePressure(key) {
  return DISEASE_PRESSURE_TOKENS[key] ?? DISEASE_PRESSURE_TOKENS.low
}

export function resolveWeatherIcon(key) {
  return WEATHER_ICONS[key] ?? WEATHER_ICONS.sunny
}

export function formatEt(val) {
  return `${Number(val).toFixed(2)}" ET`
}

export function formatTemp(val) {
  return `${val}°F`
}

export function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
