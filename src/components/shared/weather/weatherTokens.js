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

// ── Placeholder: current conditions ───────────────────────────────────────
// Shape mirrors what a future NOAA / Weather.gov feed will provide.
export const PLACEHOLDER_CURRENT = {
  location:        'Savannah, GA',
  currentTemp:     78,
  feelsLike:       81,
  humidity:        72,
  wind:            8,
  windDir:         'SSW',
  rainfall24h:     0.12,
  soilTemp:        68,
  solarRadiation:  620,
  dewPoint:        67,
  etRate:          0.22,
  etDeficit:       0.18,
  diseasePressure: 'high',
  sprayWindow:     'caution',
  timestamp:       '2026-05-07T14:00',
}

// ── Placeholder: 7-day ET trend ────────────────────────────────────────────
export const PLACEHOLDER_ET_TREND = [
  { day: 'Tue', date: 'May 1',  et: 0.18 },
  { day: 'Wed', date: 'May 2',  et: 0.24 },
  { day: 'Thu', date: 'May 3',  et: 0.21 },
  { day: 'Fri', date: 'May 4',  et: 0.19 },
  { day: 'Sat', date: 'May 5',  et: 0.26 },
  { day: 'Sun', date: 'May 6',  et: 0.15 },
  { day: 'Mon', date: 'May 7',  et: 0.22 },
]

// ── Placeholder: 7-day forecast ────────────────────────────────────────────
export const PLACEHOLDER_FORECAST = [
  { day: 'Today', date: 'May 7',  high: 78, low: 63, icon: 'partlyCloudy', rainfall: 0.12, etRate: 0.22, sprayWindow: 'caution', diseasePressure: 'high'     },
  { day: 'Wed',   date: 'May 8',  high: 82, low: 64, icon: 'sunny',        rainfall: 0,    etRate: 0.28, sprayWindow: 'ideal',   diseasePressure: 'medium'   },
  { day: 'Thu',   date: 'May 9',  high: 85, low: 67, icon: 'sunny',        rainfall: 0,    etRate: 0.31, sprayWindow: 'ideal',   diseasePressure: 'medium'   },
  { day: 'Fri',   date: 'May 10', high: 79, low: 66, icon: 'partlyCloudy', rainfall: 0.05, etRate: 0.20, sprayWindow: 'caution', diseasePressure: 'high'     },
  { day: 'Sat',   date: 'May 11', high: 72, low: 61, icon: 'rainy',        rainfall: 0.85, etRate: 0.12, sprayWindow: 'poor',    diseasePressure: 'critical' },
  { day: 'Sun',   date: 'May 12', high: 68, low: 58, icon: 'rainy',        rainfall: 0.40, etRate: 0.10, sprayWindow: 'poor',    diseasePressure: 'high'     },
  { day: 'Mon',   date: 'May 13', high: 74, low: 60, icon: 'cloudy',       rainfall: 0,    etRate: 0.18, sprayWindow: 'caution', diseasePressure: 'medium'   },
]

// ── Placeholder: weather alert banners ────────────────────────────────────
export const PLACEHOLDER_WEATHER_ALERTS = [
  { id: 'wa-1', severity: 'danger',  message: 'High disease pressure: Dollar Spot conditions favorable for 6 consecutive days. Curative window opens tomorrow.' },
  { id: 'wa-2', severity: 'caution', message: 'Spray conditions marginal — wind 8 mph SSW, humidity 72%. Monitor before application.' },
]

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
