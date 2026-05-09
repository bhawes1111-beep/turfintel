// ── NWS API response normalizer ────────────────────────────────────────────────
// Converts raw NWS observation + forecast JSON into the evaluator-compatible shape.
// evaluator.js and recommendations.js are never modified — only this layer changes.

const KMH_TO_MPH = 0.621371
const MS_TO_MPH  = 2.23694
const MM_TO_IN   = 0.0393701
const C_TO_F     = c => (c * 9 / 5) + 32

const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']

function degreesToDir(deg) {
  if (deg == null) return ''
  return WIND_DIRS[Math.round(deg / 22.5) % 16]
}

function parseWindKmh(value, unitCode = '') {
  if (value == null) return 0
  if (unitCode.includes('m_s-1') || unitCode.includes('m/s')) return value * MS_TO_MPH
  return value * KMH_TO_MPH
}

function heatIndex(tempF, rh) {
  if (tempF < 80 || rh < 40) return tempF
  const T = tempF, R = rh
  return Math.round(
    -42.379 + 2.04901523*T + 10.14333127*R - 0.22475541*T*R
    - 0.00683783*T*T - 0.05391553*R*R + 0.00122874*T*T*R
    + 0.00085282*T*R*R - 0.00000199*T*T*R*R
  )
}

function windChill(tempF, windMph) {
  if (tempF > 50 || windMph <= 3) return tempF
  const V = windMph ** 0.16
  return Math.round(35.74 + 0.6215*tempF - 35.75*V + 0.4275*tempF*V)
}

function feelsLike(tempF, rh, windMph) {
  if (tempF >= 80) return heatIndex(tempF, rh)
  if (tempF <= 50) return windChill(tempF, windMph)
  return tempF
}

function computeDiseasePressure(tempF, humidity, dewPointF) {
  const spread = tempF - dewPointF
  if (humidity >= 90 && spread <= 5)  return 'critical'
  if (humidity >= 85 && spread <= 8)  return 'high'
  if (humidity >= 75 && spread <= 12) return 'medium'
  return 'low'
}

function computeSprayWindow(windMph, humidity, tempF) {
  if (windMph > 10 || tempF > 95)   return 'poor'
  if (windMph > 7 || humidity > 85) return 'caution'
  return 'ideal'
}

// Empirical ET estimate calibrated to southeastern US turfgrass conditions
// (0.024 coefficient yields ~0.22 in/day at 78°F, 72% RH, 8 mph — matches KSAV baseline)
function estimateET(tempF, humidity, windMph) {
  const t  = Math.max(0, tempF - 50)
  const vpd = Math.max(0, (100 - humidity) / 100)
  const wf  = 1 + Math.min(windMph, 30) / 50
  return parseFloat((0.024 * t * vpd * wf).toFixed(2))
}

// ── normalizeObservation ───────────────────────────────────────────────────────
// Input: NWS observation response body (parsed JSON)
// Output: evaluator-compatible `current` object

export function normalizeObservation(obs) {
  const p = obs?.properties
  if (!p) return null

  const tempC    = p.temperature?.value
  const dewC     = p.dewpoint?.value
  const windKmh  = p.windSpeed?.value
  const windUnit = p.windSpeed?.unitCode ?? ''
  const humidity = p.relativeHumidity?.value ?? 0
  const precipMm = p.precipitationLastHour?.value ?? 0
  const windDeg  = p.windDirection?.value

  if (tempC == null) return null

  const tempF   = Math.round(C_TO_F(tempC))
  const dewF    = dewC != null ? Math.round(C_TO_F(dewC)) : tempF - 15
  const windMph = Math.round(parseWindKmh(windKmh, windUnit))
  const windDir = degreesToDir(windDeg)
  const rain    = parseFloat((precipMm * MM_TO_IN).toFixed(2))

  const etRate    = estimateET(tempF, humidity, windMph)
  const etDeficit = parseFloat((etRate * 0.85).toFixed(2))

  return {
    location:        'Savannah, GA',
    currentTemp:     tempF,
    feelsLike:       feelsLike(tempF, humidity, windMph),
    humidity:        Math.round(humidity),
    wind:            windMph,
    windDir,
    rainfall24h:     rain,
    soilTemp:        null,
    solarRadiation:  null,
    dewPoint:        dewF,
    etRate,
    etDeficit,
    diseasePressure: computeDiseasePressure(tempF, humidity, dewF),
    sprayWindow:     computeSprayWindow(windMph, humidity, tempF),
    timestamp:       p.timestamp ?? new Date().toISOString(),
  }
}

// ── normalizeForecast ──────────────────────────────────────────────────────────
// Input: NWS gridpoint forecast response body (parsed JSON)
// Output: evaluator-compatible 7-element `forecast` array

const ICON_MAP = [
  ['Sunny',         'sunny'],
  ['Clear',         'sunny'],
  ['Mostly Sunny',  'sunny'],
  ['Mostly Clear',  'sunny'],
  ['Partly Cloudy', 'partlyCloudy'],
  ['Partly Sunny',  'partlyCloudy'],
  ['Mostly Cloudy', 'cloudy'],
  ['Overcast',      'cloudy'],
  ['Cloudy',        'cloudy'],
  ['Thunderstorm',  'stormy'],
  ['Thunder',       'stormy'],
  ['Rain',          'rainy'],
  ['Showers',       'rainy'],
  ['Drizzle',       'rainy'],
  ['Fog',           'foggy'],
  ['Windy',         'windy'],
]

function resolveIcon(shortForecast) {
  if (!shortForecast) return 'partlyCloudy'
  for (const [key, val] of ICON_MAP) {
    if (shortForecast.includes(key)) return val
  }
  const lc = shortForecast.toLowerCase()
  if (lc.includes('rain') || lc.includes('shower')) return 'rainy'
  if (lc.includes('storm')) return 'stormy'
  return 'partlyCloudy'
}

function parseWindMph(str) {
  const m = String(str ?? '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

export function normalizeForecast(forecastJson) {
  const periods = forecastJson?.properties?.periods ?? []
  if (!periods.length) return []

  const days = []
  let i = 0
  while (days.length < 7 && i < periods.length) {
    const p = periods[i]
    if (!p.isDaytime) { i++; continue }

    const night   = periods[i + 1]
    const highF   = p.temperature ?? 0
    const lowF    = night?.temperature ?? Math.round(highF - 15)
    const pop     = p.probabilityOfPrecipitation?.value ?? 0
    const windMph = parseWindMph(p.windSpeed)

    // Rough rainfall estimate from precipitation probability
    const rainfall = pop >= 70 ? parseFloat((pop / 100 * 1.1).toFixed(2)) :
                     pop >= 30 ? parseFloat((pop / 100 * 0.5).toFixed(2)) : 0

    // Forecast periods don't include humidity — use neutral estimate
    const humidity        = 68
    const etRate          = estimateET(highF, humidity, windMph)
    const sprayWindow     = computeSprayWindow(windMph, humidity, highF)
    const diseasePressure = rainfall > 0.3 ? 'high' : rainfall > 0.1 ? 'medium' : 'low'

    const startDate = new Date(p.startTime)
    const dayLabel  = days.length === 0 ? 'Today'
      : startDate.toLocaleDateString('en-US', { weekday: 'short' })
    const dateLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    days.push({ day: dayLabel, date: dateLabel, high: highF, low: lowF, icon: resolveIcon(p.shortForecast), rainfall, etRate, sprayWindow, diseasePressure })
    i += 2
  }
  return days
}

// ── normalizeMetar ─────────────────────────────────────────────────────────────
// Input: AviationWeather.gov METAR JSON array
// Output: evaluator-compatible `current` object

export function normalizeMetar(metarArr) {
  const m = Array.isArray(metarArr) ? metarArr[0] : null
  if (!m || m.tmpf == null) return null

  const tempF    = Math.round(m.tmpf)
  const dewF     = m.dwpf != null ? Math.round(m.dwpf) : tempF - 15
  const humidity = m.relh != null ? Math.round(m.relh) : 65
  const windMph  = m.sped != null ? Math.round(m.sped) : 0
  const windDir  = m.drct != null ? degreesToDir(m.drct) : ''
  const rain     = m.p01m != null ? parseFloat((m.p01m * MM_TO_IN).toFixed(2)) : 0

  const etRate    = estimateET(tempF, humidity, windMph)
  const etDeficit = parseFloat((etRate * 0.85).toFixed(2))

  return {
    location:        'Savannah, GA',
    currentTemp:     tempF,
    feelsLike:       feelsLike(tempF, humidity, windMph),
    humidity,
    wind:            windMph,
    windDir,
    rainfall24h:     rain,
    soilTemp:        null,
    solarRadiation:  null,
    dewPoint:        dewF,
    etRate,
    etDeficit,
    diseasePressure: computeDiseasePressure(tempF, humidity, dewF),
    sprayWindow:     computeSprayWindow(windMph, humidity, tempF),
    timestamp:       new Date().toISOString(),
  }
}

// ── buildEtTrend ───────────────────────────────────────────────────────────────
// Derives 7-day ET bar chart data from the normalized forecast array.

export function buildEtTrend(forecast) {
  return forecast.map(day => ({ day: day.day, date: day.date, et: day.etRate }))
}
