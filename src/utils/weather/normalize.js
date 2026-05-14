// ── Weather normalizer ─────────────────────────────────────────────────────────
// Converts raw provider JSON (NWS observation/forecast, METAR, and the
// Ambient Weather station feed) into the single evaluator-compatible
// `current` / `forecast` shape. evaluator.js and recommendations.js are
// never modified — only this layer changes. Every provider runs through
// the same ET / disease / spray helpers so the derived fields stay
// consistent regardless of which source supplied the raw observation.

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

// ── Feels-like ────────────────────────────────────────────────────────────────

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

function computeFeelsLike(tempF, rh, windMph) {
  if (tempF >= 80) return heatIndex(tempF, rh)
  if (tempF <= 50) return windChill(tempF, windMph)
  return tempF
}

// ── Disease pressure ──────────────────────────────────────────────────────────
// Heuristic from single-observation humidity, dew point spread, and temperature range.
// Dollar spot / pythium most active in the 65–88°F band with sustained leaf wetness.

function computeDiseasePressure(tempF, humidity, dewPointF) {
  const spread        = tempF - dewPointF
  const inActiveRange = tempF >= 65 && tempF <= 88

  if (spread <= 3 || humidity >= 92)                   return 'critical'
  if (humidity >= 85 && spread <= 8)                   return 'high'
  if (humidity >= 75 && spread <= 12 && inActiveRange) return 'high'
  if (humidity >= 75 && spread <= 12)                  return 'medium'
  if (humidity >= 65 && spread <= 15 && inActiveRange) return 'medium'
  return 'low'
}

function computeSprayWindow(windMph, humidity, tempF) {
  if (windMph > 10 || tempF > 95)   return 'poor'
  if (windMph > 7 || humidity > 85) return 'caution'
  return 'ideal'
}

// ── ET estimation ─────────────────────────────────────────────────────────────
// Empirical formula calibrated to southeastern US turfgrass conditions.
// 0.024 base coefficient yields ~0.22 in/day at 78°F, 72% RH, 8 mph, clear sky.
// solarFactor: 1.0 = clear sky, 0.55 = fully cloudy/raining (varies with PoP).

function estimateET(tempF, humidity, windMph, solarFactor = 1.0) {
  const t   = Math.max(0, tempF - 50)
  const vpd = Math.max(0, (100 - humidity) / 100)
  const wf  = 1 + Math.min(windMph, 30) / 50
  return parseFloat((0.024 * t * vpd * wf * solarFactor).toFixed(2))
}

// Linear interpolation: 0% PoP → 1.0 (clear sky), 100% PoP → 0.55 (overcast)
function solarFactorFromPoP(pop) {
  return parseFloat((1.0 - (pop / 100) * 0.45).toFixed(3))
}

// ── Rainfall estimation from PoP + NWS forecast wording ──────────────────────
// Combines probability with intensity keywords — much more accurate than PoP alone.
// Expected amount = P(rain) × conditional intensity given rain occurs.

function estimateRainfallIn(pop, shortForecast) {
  if (!pop || pop < 20) return 0
  const p  = pop / 100
  const lc = (shortForecast ?? '').toLowerCase()

  if (lc.includes('heavy'))                                 return parseFloat(Math.min(p * 1.8, 3.0).toFixed(2))
  if (lc.includes('thunder') || lc.includes('storm'))      return parseFloat(Math.min(p * 1.2, 2.5).toFixed(2))
  if (lc.includes('scattered') || lc.includes('isolated')) return parseFloat((p * 0.5).toFixed(2))
  if (lc.includes('slight') || lc.includes('light'))       return parseFloat((p * 0.3).toFixed(2))
  if (lc.includes('drizzle'))                               return parseFloat((p * 0.15).toFixed(2))
  return parseFloat((p * 0.8).toFixed(2))
}

// ── Forecast spray window ─────────────────────────────────────────────────────

function computeForecastSprayWindow(windMph, pop, highF, shortForecast) {
  const lc      = (shortForecast ?? '').toLowerCase()
  const hasRain = lc.includes('rain') || lc.includes('shower') || lc.includes('storm') || lc.includes('thunder')
  if (windMph > 10 || highF > 95 || pop > 60 || hasRain) return 'poor'
  if (windMph > 7  || pop > 25  || highF > 88)           return 'caution'
  return 'ideal'
}

// ── Forecast disease pressure (single-day base) ───────────────────────────────
// Caller applies consecutive-wet-day escalation in a second pass.

function baseForecastDisease(rainfall, lowF, pop) {
  if (rainfall > 0.5)                          return 'high'
  if (rainfall > 0.2)                          return 'medium'
  if (pop > 50 && lowF != null && lowF >= 60)  return 'medium'
  if (rainfall > 0.05)                         return 'medium'
  return 'low'
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
    feelsLike:       computeFeelsLike(tempF, humidity, windMph),
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

// ── normalizeAmbient ───────────────────────────────────────────────────────────
// Input:  Ambient Weather `lastData` object + provider meta
//         ({ deviceName, observedAt, sourceLabel })
// Output: evaluator-compatible `current` object with source metadata.
//
// Ambient is a personal weather station — it reports real-time
// observations only (no forecast). Field availability varies by station
// hardware: a station without a soil probe has no soiltemp1f, one
// without a pyranometer has no solarradiation, etc. Missing sensors map
// cleanly to null. The derived fields (etRate / diseasePressure /
// sprayWindow) run through the SAME helpers as normalizeObservation so
// the Ambient `current` is interchangeable with the NWS one downstream.

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function normalizeAmbient(lastData, meta = {}) {
  if (!lastData || typeof lastData.tempf !== 'number') return null

  const tempF    = Math.round(lastData.tempf)
  const humidity = numOrNull(lastData.humidity) ?? 0
  const windMph  = Math.round(numOrNull(lastData.windspeedmph) ?? 0)
  const gustMph  = numOrNull(lastData.windgustmph)
  const windDir  = degreesToDir(numOrNull(lastData.winddir))

  // dewPoint: Ambient may key it dewPoint or dewPointf (both °F).
  const dewRaw   = numOrNull(lastData.dewPoint) ?? numOrNull(lastData.dewPointf)
  const dewF     = dewRaw != null ? Math.round(dewRaw) : tempF - 15

  // feelsLike: prefer the station's reported value, otherwise compute.
  const feelsRaw = numOrNull(lastData.feelsLike) ?? numOrNull(lastData.feelsLikef)
  const feelsLike = feelsRaw != null
    ? Math.round(feelsRaw)
    : computeFeelsLike(tempF, humidity, windMph)

  const rain24   = numOrNull(lastData.dailyrainin) ?? 0
  const rainHr   = numOrNull(lastData.hourlyrainin)
  const solar    = numOrNull(lastData.solarradiation)
  const soilTemp = numOrNull(lastData.soiltemp1f)
  const pressure = numOrNull(lastData.baromrelin)

  const etRate    = estimateET(tempF, humidity, windMph)
  const etDeficit = parseFloat((etRate * 0.85).toFixed(2))

  return {
    location:        meta.deviceName ?? 'Course Station',
    currentTemp:     tempF,
    feelsLike,
    humidity:        Math.round(humidity),
    wind:            windMph,
    windGust:        gustMph,
    windDir,
    rainfall24h:     parseFloat(rain24.toFixed(2)),
    rainfallHourly:  rainHr != null ? parseFloat(rainHr.toFixed(2)) : null,
    soilTemp,
    solarRadiation:  solar,
    pressure,
    dewPoint:        dewF,
    etRate,
    etDeficit,
    diseasePressure: computeDiseasePressure(tempF, humidity, dewF),
    sprayWindow:     computeSprayWindow(windMph, humidity, tempF),
    timestamp:       lastData.date ?? meta.observedAt ?? new Date().toISOString(),
    // Source metadata — surfaced as a subtle label in the UI.
    source:          'ambient',
    sourceLabel:     meta.sourceLabel ?? 'Ambient Weather',
    observedAt:      lastData.date ?? meta.observedAt ?? null,
  }
}

// ── normalizeForecast ──────────────────────────────────────────────────────────
// Input: NWS gridpoint forecast response body (parsed JSON)
// Output: evaluator-compatible 7-element `forecast` array

// Most-specific patterns first to prevent substring shadowing.
// e.g. "Mostly Cloudy" must precede bare "Cloudy" or it will never match.
const ICON_MAP = [
  ['Thunderstorm',  'stormy'],
  ['Thunder',       'stormy'],
  ['T-Storm',       'stormy'],
  ['Heavy Rain',    'rainy'],
  ['Rain And',      'rainy'],
  ['Showers And',   'rainy'],
  ['Rain',          'rainy'],
  ['Showers',       'rainy'],
  ['Drizzle',       'rainy'],
  ['Wintry Mix',    'rainy'],
  ['Sleet',         'rainy'],
  ['Fog',           'foggy'],
  ['Haze',          'foggy'],
  ['Smoke',         'foggy'],
  ['Mostly Cloudy', 'cloudy'],
  ['Overcast',      'cloudy'],
  ['Mostly Sunny',  'sunny'],
  ['Mostly Clear',  'sunny'],
  ['Partly Cloudy', 'partlyCloudy'],
  ['Partly Sunny',  'partlyCloudy'],
  ['Breezy',        'windy'],
  ['Windy',         'windy'],
  ['Cloudy',        'cloudy'],
  ['Sunny',         'sunny'],
  ['Clear',         'sunny'],
]

function resolveIcon(shortForecast) {
  if (!shortForecast) return 'partlyCloudy'
  for (const [key, val] of ICON_MAP) {
    if (shortForecast.includes(key)) return val
  }
  // Case-insensitive fallback for non-standard strings
  const lc = shortForecast.toLowerCase()
  if (lc.includes('rain') || lc.includes('shower')) return 'rainy'
  if (lc.includes('storm'))                          return 'stormy'
  if (lc.includes('cloud'))                          return 'cloudy'
  if (lc.includes('fog') || lc.includes('haze'))    return 'foggy'
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
    const sf      = solarFactorFromPoP(pop)

    const rainfall        = estimateRainfallIn(pop, p.shortForecast)
    const etRate          = estimateET(highF, 68, windMph, sf)
    const sprayWindow     = computeForecastSprayWindow(windMph, pop, highF, p.shortForecast)
    const diseasePressure = baseForecastDisease(rainfall, lowF, pop)

    const startDate  = new Date(p.startTime)
    const isActuallyToday = startDate.toDateString() === new Date().toDateString()
    const dayLabel  = (days.length === 0 && isActuallyToday) ? 'Today'
      : startDate.toLocaleDateString('en-US', { weekday: 'short' })
    const dateLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    days.push({ day: dayLabel, date: dateLabel, high: highF, low: lowF, icon: resolveIcon(p.shortForecast), rainfall, etRate, sprayWindow, diseasePressure, _pop: pop })
    i += 2
  }

  // Second pass: escalate disease pressure for consecutive wet periods.
  // Golf industry standard — sustained wet windows compound fungal risk even if
  // individual days read only "medium".
  let wetStreak = 0
  for (const day of days) {
    const isWet    = day.rainfall > 0.1
    wetStreak      = isWet ? wetStreak + 1 : 0
    const warmNight = day.low != null && day.low >= 62

    if (wetStreak >= 3 && day.rainfall > 0.2) {
      day.diseasePressure = 'critical'
    } else if (wetStreak >= 2 && warmNight && day.diseasePressure !== 'critical') {
      day.diseasePressure = 'high'
    } else if (wetStreak >= 2 && day.diseasePressure === 'low') {
      day.diseasePressure = 'medium'
    }
  }

  return days.map(({ _pop, ...rest }) => rest)
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
    feelsLike:       computeFeelsLike(tempF, humidity, windMph),
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
