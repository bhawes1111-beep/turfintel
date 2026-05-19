// Phase 28B — Spray Window Intelligence.
//
// Pure functions that score current + forecast weather against spray-
// suitability and against any planned/recent applications' label rainfast
// data. Advisory only — never auto-schedules, never claims weather data
// that isn't in the inputs.
//
// Same pattern as src/utils/agronomic/agronomicIntelligence.js:
//   - inputs are already-fetched data (current weather, forecast,
//     sprays, labels), no fetching here
//   - every output entry carries a `why` string so the UI can show it
//     beside the warning
//   - missing inputs → no claim, never a default-to-fine
//
// Thresholds (turf-management industry typical; explicit so the UI can
// reference them). All numeric thresholds live in one place so they're
// easy to tune.

export const SPRAY_THRESHOLDS = {
  wind: {
    idealMaxMph:   5,
    cautionMaxMph: 10,
    // > cautionMaxMph → poor
  },
  gust: {
    idealMaxMph:   10,
    cautionMaxMph: 15,
  },
  humidity: {
    idealMin: 50,  idealMax: 85,
    cautionLowMin: 40,  cautionLowMax: 50,   // low side caution
    cautionHighMin: 85, cautionHighMax: 90,  // high side caution
    // < cautionLowMin → poor (high evap)
    // > cautionHighMax → poor (slow drying)
  },
  temperatureF: {
    idealMin: 50,  idealMax: 85,
    cautionLowMin: 40,  cautionLowMax: 50,
    cautionHighMin: 85, cautionHighMax: 95,
  },
  // Forecast rain over next 24h (inches).
  rain24h: {
    idealMaxIn:   0.0,
    cautionMaxIn: 0.1,
  },
  // Dew-point spread (tempF - dewF). Lower spread → heavier dew risk.
  dewSpreadF: {
    idealMinF:   8,
    cautionMinF: 4,
    // < 4°F → poor (heavy dew, slow drying, overnight persistence)
  },
}

const RATING_ORDER = { ideal: 0, acceptable: 1, caution: 2, poor: 3 }

function worseRating(a, b) {
  return RATING_ORDER[a] >= RATING_ORDER[b] ? a : b
}

// ── Core current-window evaluation ────────────────────────────────────────
//
// Evaluates each axis against the thresholds. Returns:
//   {
//     rating: 'ideal'|'acceptable'|'caution'|'poor',
//     axes:   { wind, gust, humidity, temperature, dew } — per-axis sub-ratings
//     reasons: [{ axis, rating, value, why }],
//   }
//
// Missing axis inputs (null/undefined) are simply omitted — they don't
// degrade the rating but `axes[X] === 'unknown'` so the UI knows what's
// uninformative.

export function evaluateCurrentWindow(current) {
  if (!current || typeof current !== 'object') {
    return { rating: 'unknown', axes: {}, reasons: [{ axis: 'data', rating: 'unknown', value: null, why: 'No current weather available' }] }
  }
  const t = SPRAY_THRESHOLDS
  const axes = {}
  const reasons = []
  let rating = 'ideal'

  // Wind ------------------------------------------------------------------
  const wind = numOrNull(current.wind)
  if (wind == null) {
    axes.wind = 'unknown'
  } else {
    let r = 'ideal'
    if (wind > t.wind.cautionMaxMph)      r = 'poor'
    else if (wind > t.wind.idealMaxMph)   r = 'caution'
    axes.wind = r
    rating = worseRating(rating, r)
    reasons.push({
      axis: 'wind', rating: r, value: wind,
      why: r === 'poor'
        ? `Wind ${wind} mph (> ${t.wind.cautionMaxMph} mph) — elevated drift potential`
        : r === 'caution'
          ? `Wind ${wind} mph (5-10 mph) — drift caution`
          : `Wind ${wind} mph — low drift potential`,
    })
  }

  // Gust ------------------------------------------------------------------
  const gust = numOrNull(current.windGust)
  if (gust == null) {
    axes.gust = 'unknown'
  } else {
    let r = 'ideal'
    if (gust > t.gust.cautionMaxMph)      r = 'poor'
    else if (gust > t.gust.idealMaxMph)   r = 'caution'
    axes.gust = r
    rating = worseRating(rating, r)
    if (r !== 'ideal') {
      reasons.push({
        axis: 'gust', rating: r, value: gust,
        why: r === 'poor'
          ? `Gusts ${gust} mph (> ${t.gust.cautionMaxMph} mph) — high gust variability`
          : `Gusts ${gust} mph (10-15 mph) — variable conditions`,
      })
    }
  }

  // Humidity --------------------------------------------------------------
  const rh = numOrNull(current.humidity)
  if (rh == null) {
    axes.humidity = 'unknown'
  } else {
    let r = 'ideal'
    if (rh < t.humidity.cautionLowMin || rh > t.humidity.cautionHighMax)            r = 'poor'
    else if (rh < t.humidity.idealMin || rh > t.humidity.idealMax)                  r = 'caution'
    axes.humidity = r
    rating = worseRating(rating, r)
    if (r !== 'ideal') {
      reasons.push({
        axis: 'humidity', rating: r, value: rh,
        why: rh < t.humidity.idealMin
          ? `Humidity ${rh}% (< ${t.humidity.idealMin}%) — high evaporation risk`
          : `Humidity ${rh}% (> ${t.humidity.idealMax}%) — slow drying`,
      })
    }
  }

  // Temperature -----------------------------------------------------------
  const tempF = numOrNull(current.currentTemp)
  if (tempF == null) {
    axes.temperature = 'unknown'
  } else {
    let r = 'ideal'
    if (tempF < t.temperatureF.cautionLowMin || tempF > t.temperatureF.cautionHighMax) r = 'poor'
    else if (tempF < t.temperatureF.idealMin || tempF > t.temperatureF.idealMax)       r = 'caution'
    axes.temperature = r
    rating = worseRating(rating, r)
    if (r !== 'ideal') {
      reasons.push({
        axis: 'temperature', rating: r, value: tempF,
        why: tempF > t.temperatureF.idealMax
          ? `Temperature ${tempF}°F (> ${t.temperatureF.idealMax}°F) — heat stress / volatility risk`
          : `Temperature ${tempF}°F (< ${t.temperatureF.idealMin}°F) — slow drying / cold stress`,
      })
    }
  }

  // Dew-point spread (dew risk) -------------------------------------------
  const dew = numOrNull(current.dewPoint)
  if (dew != null && tempF != null) {
    const spread = tempF - dew
    let r = 'ideal'
    if (spread < t.dewSpreadF.cautionMinF)      r = 'poor'
    else if (spread < t.dewSpreadF.idealMinF)   r = 'caution'
    axes.dew = r
    rating = worseRating(rating, r)
    if (r !== 'ideal') {
      reasons.push({
        axis: 'dew', rating: r, value: spread,
        why: r === 'poor'
          ? `Dew spread ${spread}°F (< ${t.dewSpreadF.cautionMinF}°F) — heavy dew likely, overnight moisture`
          : `Dew spread ${spread}°F — moderate dew, slower drying`,
      })
    }
  } else {
    axes.dew = 'unknown'
  }

  // Acceptable = "no individual axis below caution".
  // Rating walks ideal → caution → poor; promote to 'acceptable' when at
  // least one axis is known and the only deviations from ideal are at the
  // caution level on dimensions other than wind (wind is operationally
  // dominant). Simpler: any caution → caution. Pure walk through axes.
  if (rating === 'ideal') {
    // Add a single short positive reason if we have axes; otherwise no
    // reasons[] entries (clean ideal).
    if (Object.values(axes).some(v => v === 'ideal')) {
      reasons.push({ axis: 'overall', rating: 'ideal', value: null, why: 'Current conditions inside spray-friendly range' })
    }
  }

  return { rating, axes, reasons }
}

// ── Forecast windows (per-day) ────────────────────────────────────────────
//
// Returns one rating per forecast day, used by the calendar color coding
// and by the dashboard "next ideal window" pick.

export function evaluateForecastWindows(forecast) {
  if (!Array.isArray(forecast)) return []
  const t = SPRAY_THRESHOLDS
  return forecast.map(day => {
    const rain  = numOrNull(day.rainfall)
    const highF = numOrNull(day.high)
    const lowF  = numOrNull(day.low)
    const pop   = numOrNull(day._pop)
    const reasons = []
    let rating = 'ideal'

    if (rain != null) {
      let r = 'ideal'
      if (rain > t.rain24h.cautionMaxIn)  r = 'poor'
      else if (rain > t.rain24h.idealMaxIn) r = 'caution'
      rating = worseRating(rating, r)
      if (r !== 'ideal') {
        reasons.push({
          axis: 'rain', rating: r,
          why: `${rain.toFixed(2)} in forecast${pop != null ? ` (${pop}% POP)` : ''}`,
        })
      }
    }
    if (highF != null) {
      if (highF > t.temperatureF.cautionHighMax)      rating = worseRating(rating, 'poor')
      else if (highF > t.temperatureF.idealMax)       rating = worseRating(rating, 'caution')
      if (highF > t.temperatureF.idealMax) {
        reasons.push({ axis: 'temperature', rating: highF > t.temperatureF.cautionHighMax ? 'poor' : 'caution',
          why: `High ${highF}°F` })
      }
    }
    if (lowF != null && lowF < t.temperatureF.idealMin) {
      const r = lowF < t.temperatureF.cautionLowMin ? 'poor' : 'caution'
      rating = worseRating(rating, r)
      reasons.push({ axis: 'temperature', rating: r, why: `Low ${lowF}°F` })
    }

    return {
      date: day.date ?? day.day ?? null,
      label: day.day ?? day.date ?? null,
      rating: rating === 'ideal' && reasons.length === 0 ? 'ideal' : rating,
      reasons,
    }
  })
}

// ── Rain risk vs label rainfast (planned/recent spray) ────────────────────
//
// For each provided spray with a linked label that has rainfast hours,
// compare against the forecast rainfall for the relevant day(s). Returns
// the rain-risk warning OR null when there's nothing to warn about.

// Walks the label.notes string for "N hour(s)" within a rainfast sentence.
// Mirrors the same helper used by Phase 28A's agronomic compute.
export function extractRainfastHours(label) {
  const text = label?.notes
  if (typeof text !== 'string') return null
  if (!/rainfast|water[- ]?in|irrigate after/i.test(text)) return null
  const m = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * @param {Object} spray  — spray record with `date`, `endTime`, `products[]`
 * @param {Object} labelsByItemId — keyed by inventory_item_id
 * @param {Array}  forecast — [{date, rainfall, _pop, ...}]
 * @param {number} now — epoch ms reference
 */
export function evaluateRainRisk(spray, labelsByItemId, forecast, now) {
  if (!spray) return null
  const products = Array.isArray(spray.products) ? spray.products : []
  const offendingByProduct = []
  for (const p of products) {
    if (!p.inventoryItemId) continue
    const label = labelsByItemId?.[p.inventoryItemId]
    const rfHours = extractRainfastHours(label)
    if (rfHours == null) continue
    const dayMs = 24 * 60 * 60 * 1000
    const sprayStart = sprayCompletionMs(spray) ?? now
    const rainfastEnds = sprayStart + rfHours * dayMs / 24  // hours → ms
    if (rainfastEnds <= now) continue

    // Scan forecast days within the rainfast window.
    const offending = []
    for (const day of forecast ?? []) {
      if (!day?.date) continue
      const dayStart = Date.parse(`${day.date}T00:00:00`)
      if (!Number.isFinite(dayStart)) continue
      // Day overlaps the rainfast window if dayStart < rainfastEnds && dayEnd >= sprayStart.
      const dayEnd = dayStart + dayMs
      if (dayStart >= rainfastEnds) break
      if (dayEnd < sprayStart) continue
      const rain = numOrNull(day.rainfall) ?? 0
      if (rain > SPRAY_THRESHOLDS.rain24h.cautionMaxIn) {
        offending.push({ date: day.date, rainfall: rain, pop: numOrNull(day._pop) })
      }
    }
    if (offending.length === 0) continue
    offendingByProduct.push({
      productName: p.name,
      rainfastHours: rfHours,
      rainfastEndsAt: rainfastEnds,
      forecastRain: offending,
      why: `${p.name}: rainfast = ${rfHours}h; forecast ${offending.map(o => `${o.rainfall.toFixed(2)}" ${o.date}`).join(', ')}`,
    })
  }
  if (offendingByProduct.length === 0) return null
  return { sprayId: spray.id, items: offendingByProduct }
}

// ── Wind advisory ─────────────────────────────────────────────────────────
//
// Surface concise wind context for the dashboard card. Returns:
//   { wind, gust, advisory: 'ideal'|'caution'|'poor'|null, why }
// `advisory === null` means we don't have enough data to advise — UI
// renders nothing rather than guessing.

export function evaluateWindAdvisory(current) {
  if (!current) return null
  const wind = numOrNull(current.wind)
  const gust = numOrNull(current.windGust)
  if (wind == null && gust == null) return null
  const t = SPRAY_THRESHOLDS
  let advisory = 'ideal'
  const notes = []
  if (wind != null) {
    if (wind > t.wind.cautionMaxMph)     { advisory = worseRating(advisory, 'poor');    notes.push('Elevated drift potential') }
    else if (wind > t.wind.idealMaxMph)  { advisory = worseRating(advisory, 'caution'); notes.push('Drift caution') }
  }
  if (gust != null) {
    if (gust > t.gust.cautionMaxMph)     { advisory = worseRating(advisory, 'poor');    notes.push('High gust variability') }
    else if (gust > t.gust.idealMaxMph)  { advisory = worseRating(advisory, 'caution'); notes.push('Variable gusts') }
  }
  return {
    wind,
    gust,
    direction: current.windDir ?? null,
    advisory,
    why: notes.length > 0
      ? notes.join(' · ')
      : 'Wind within calm range',
  }
}

// ── Drying / dew awareness ────────────────────────────────────────────────

export function evaluateDryingDew(current) {
  if (!current) return null
  const tempF = numOrNull(current.currentTemp)
  const dew   = numOrNull(current.dewPoint)
  const rh    = numOrNull(current.humidity)
  if (tempF == null || dew == null) {
    if (rh == null) return null
    // Humidity-only fallback: high RH alone is a slow-drying signal.
    if (rh > 90) {
      return { rating: 'poor',    why: `RH ${rh}% — slow drying, overnight moisture likely` }
    }
    if (rh > 85) {
      return { rating: 'caution', why: `RH ${rh}% — slower drying conditions` }
    }
    return null
  }
  const spread = tempF - dew
  const t = SPRAY_THRESHOLDS
  if (spread < t.dewSpreadF.cautionMinF) {
    return { rating: 'poor',    spread, why: `Dew spread ${spread}°F (< ${t.dewSpreadF.cautionMinF}°F) — heavy dew likely, overnight moisture persistence` }
  }
  if (spread < t.dewSpreadF.idealMinF) {
    return { rating: 'caution', spread, why: `Dew spread ${spread}°F (< ${t.dewSpreadF.idealMinF}°F) — slower drying` }
  }
  return null
}

// ── Calendar window rating ────────────────────────────────────────────────
//
// Map a spray's calendar date to a green/yellow/red rating using forecast.
// 'green' = ideal, 'yellow' = caution, 'red' = poor, null = unknown.
// Sprays in the past return null — they already happened.

export function rateSprayDate(dateStr, forecast, now = Date.now()) {
  if (!dateStr || !Array.isArray(forecast)) return null
  const ms = Date.parse(`${dateStr}T00:00:00`)
  if (!Number.isFinite(ms)) return null
  // Past dates: no advisory.
  if (ms + 24 * 60 * 60 * 1000 < now) return null
  const day = forecast.find(d => d?.date === dateStr)
  if (!day) return null
  const evaluated = evaluateForecastWindows([day])[0]
  if (!evaluated) return null
  switch (evaluated.rating) {
    case 'ideal':      return { color: 'green',  reasons: evaluated.reasons }
    case 'caution':    return { color: 'yellow', reasons: evaluated.reasons }
    case 'poor':       return { color: 'red',    reasons: evaluated.reasons }
    case 'acceptable': return { color: 'green',  reasons: evaluated.reasons }
    default:           return null
  }
}

// ── Top-level compose for the dashboard ───────────────────────────────────

/**
 * Pull together every view the Spray Window dashboard card needs.
 *
 * @param {Object} input
 * @param {Object} input.current     — normalized current weather (or null)
 * @param {Array}  input.forecast    — normalized forecast days
 * @param {Array}  [input.sprays]    — recent + planned spray records
 * @param {Array}  [input.labels]    — saved labels (for rainfast lookup)
 * @param {number} [input.now]       — clock override (tests)
 */
export function computeSprayWindowIntel({ current, forecast, sprays, labels, now }) {
  const clock = now ?? Date.now()
  const labelsByItemId = {}
  for (const l of labels ?? []) {
    if (l?.inventoryItemId) labelsByItemId[l.inventoryItemId] = l
  }
  const safeForecast = Array.isArray(forecast) ? forecast : []

  const currentEval     = evaluateCurrentWindow(current)
  const forecastWindows = evaluateForecastWindows(safeForecast)
  const wind            = evaluateWindAdvisory(current)
  const drying          = evaluateDryingDew(current)

  // Rain risk: for each recent or planned-near-future spray with a label
  // rainfast hours value, scan forecast for overlapping rain.
  const dayMs = 24 * 60 * 60 * 1000
  const recentOrUpcoming = (sprays ?? []).filter(s => {
    const ms = sprayCompletionMs(s)
    if (ms == null) return false
    // Look 24h back and 48h ahead.
    return ms > clock - dayMs && ms < clock + 2 * dayMs
  })
  const rainRisks = []
  for (const s of recentOrUpcoming) {
    const r = evaluateRainRisk(s, labelsByItemId, safeForecast, clock)
    if (r) rainRisks.push(r)
  }

  // Pick the next ideal window from the forecast.
  const nextIdeal = forecastWindows.find(w => w.rating === 'ideal') ?? null

  // Top risk = the most-severe single reason among current, wind, drying,
  // rain risks. Used to render the "top risk" row in the compact card.
  const topRisk = pickTopRisk({ currentEval, wind, drying, rainRisks })

  return {
    current: currentEval,
    forecastWindows,
    nextIdeal,
    wind,
    drying,
    rainRisks,
    topRisk,
  }
}

function pickTopRisk({ currentEval, wind, drying, rainRisks }) {
  const candidates = []
  if (rainRisks?.length) {
    for (const r of rainRisks) {
      for (const item of r.items) {
        candidates.push({ source: 'rain', rating: 'poor', why: item.why })
      }
    }
  }
  if (wind && wind.advisory && wind.advisory !== 'ideal') {
    candidates.push({ source: 'wind', rating: wind.advisory, why: wind.why })
  }
  if (drying && drying.rating) {
    candidates.push({ source: 'drying', rating: drying.rating, why: drying.why })
  }
  if (currentEval?.reasons?.length) {
    for (const r of currentEval.reasons) {
      if (r.rating === 'poor' || r.rating === 'caution') {
        candidates.push({ source: r.axis, rating: r.rating, why: r.why })
      }
    }
  }
  candidates.sort((a, b) => (RATING_ORDER[b.rating] ?? 0) - (RATING_ORDER[a.rating] ?? 0))
  return candidates[0] ?? null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function numOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function sprayCompletionMs(record) {
  if (!record?.date) return null
  const time = record.endTime || record.startTime || '00:00'
  const ms = Date.parse(`${record.date}T${time}:00`)
  return Number.isFinite(ms) ? ms : null
}
