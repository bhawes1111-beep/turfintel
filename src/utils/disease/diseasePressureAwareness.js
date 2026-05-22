// Disease Pressure Awareness — explainable environmental indicator.
//
// This is AWARENESS, NOT PREDICTION. It does not forecast whether disease
// will occur. It reads the *current* environment (live weather + recent
// moisture flags) against well-known turf-disease-favorable conditions and
// reports which factors are currently elevated, with the reasons spelled
// out. Every level it returns can be traced to a named, plain-English factor.
//
// The temp/humidity/dew-point thresholds mirror computeDiseasePressure in
// weather/normalize.js (the same model the weather page already uses); they
// are duplicated here, not imported, because that helper is module-internal.
// Keeping them side-by-side is intentional: this module owns the *explained*
// version and must stay readable on its own.

const LEVELS = ['low', 'moderate', 'high', 'critical']

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Rank helper so we can take the strongest of several signals.
function strongest(...levels) {
  let best = 'low'
  for (const l of levels) {
    if (LEVELS.indexOf(l) > LEVELS.indexOf(best)) best = l
  }
  return best
}

// ── Weather-driven factor ─────────────────────────────────────────────────
// Warm + humid + low temp/dew-point spread (leaf wetness proxy) is the
// classic foliar-disease-favorable window. Same thresholds as the weather
// page's diseasePressure, but here we also return the *why*.

function weatherFactor(weather) {
  if (!weather) return null
  const tempF     = num(weather.currentTemp)
  const humidity  = num(weather.humidity)
  const dewPointF = num(weather.dewPoint)
  if (tempF == null || humidity == null) return null

  // Spread = temp − dew point. Small spread ⇒ air near saturation ⇒ leaves
  // stay wet longer. If no dew point, fall back to humidity alone.
  const spread        = dewPointF != null ? tempF - dewPointF : null
  const inActiveRange = tempF >= 65 && tempF <= 88

  let level = 'low'
  const reasons = []

  if (spread != null && (spread <= 3 || humidity >= 92)) {
    level = 'critical'
    reasons.push(spread <= 3 ? `near-saturated air (${spread}°F temp/dew spread)` : `very high humidity (${humidity}%)`)
  } else if (humidity >= 85 && spread != null && spread <= 8) {
    level = 'high'
    reasons.push(`humid (${humidity}%) with small temp/dew spread (${spread}°F)`)
  } else if (humidity >= 75 && spread != null && spread <= 12 && inActiveRange) {
    level = 'high'
    reasons.push(`humid (${humidity}%) in the active temperature range (${tempF}°F)`)
  } else if (humidity >= 75 && spread != null && spread <= 12) {
    level = 'moderate'
    reasons.push(`elevated humidity (${humidity}%)`)
  } else if (humidity >= 65 && (spread == null || spread <= 15) && inActiveRange) {
    level = 'moderate'
    reasons.push(`mild humidity (${humidity}%) in the active temperature range (${tempF}°F)`)
  } else if (humidity >= 90) {
    // No dew point available, but humidity alone is high enough to note.
    level = 'moderate'
    reasons.push(`high humidity (${humidity}%)`)
  }

  if (level === 'low') return { key: 'weather', level, label: 'Weather', reasons: ['conditions not currently disease-favorable'] }
  return { key: 'weather', level, label: 'Weather', reasons }
}

// ── Moisture-driven factor ────────────────────────────────────────────────
// Persistent surface wetness / standing-water / wilt-handwater flags from the
// moisture log indicate prolonged leaf or canopy wetness — a real, observed
// (not modeled) contributor to disease favorability. We only elevate when
// recent flags actually exist; absence is reported honestly as "no recent
// wet-surface flags."

const WET_FLAG_PATTERNS = [/wet/i, /standing water/i, /saturat/i, /handwater/i, /wilt/i, /soggy/i]

function moistureFactor(moistureFlags) {
  if (!Array.isArray(moistureFlags) || moistureFlags.length === 0) {
    return { key: 'moisture', level: 'low', label: 'Moisture', reasons: ['no recent wet-surface flags'] }
  }
  const hits = moistureFlags
    .map(f => (typeof f === 'string' ? f : f && f.label) || '')
    .filter(text => WET_FLAG_PATTERNS.some(re => re.test(text)))
  if (hits.length === 0) {
    return { key: 'moisture', level: 'low', label: 'Moisture', reasons: ['no recent wet-surface flags'] }
  }
  // Two-or-more wet flags ⇒ persistent wetness signal.
  const level = hits.length >= 2 ? 'high' : 'moderate'
  return {
    key: 'moisture',
    level,
    label: 'Moisture',
    reasons: [`${hits.length} recent wet-surface flag${hits.length > 1 ? 's' : ''}: ${hits.slice(0, 3).join(', ')}`],
  }
}

// ── Active-observation factor ─────────────────────────────────────────────
// If the crew has already confirmed/suspected disease on the course, that is
// the strongest possible signal — it is observed reality, not environmental
// inference. Counts only non-resolved observations.

const OPEN_STATUSES = new Set(['suspected', 'confirmed', 'treated', 'monitoring'])

function observationFactor(observations) {
  if (!Array.isArray(observations)) return null
  const open = observations.filter(o => o && OPEN_STATUSES.has(o.status))
  if (open.length === 0) return null
  const confirmed = open.filter(o => o.status === 'confirmed').length
  const level = confirmed > 0 ? 'high' : 'moderate'
  const names = [...new Set(open.map(o => o.diseaseName).filter(Boolean))].slice(0, 3)
  return {
    key: 'observations',
    level,
    label: 'Active observations',
    reasons: [
      confirmed > 0
        ? `${confirmed} confirmed, ${open.length} open observation${open.length > 1 ? 's' : ''}${names.length ? ` (${names.join(', ')})` : ''}`
        : `${open.length} open observation${open.length > 1 ? 's' : ''}${names.length ? ` (${names.join(', ')})` : ''}`,
    ],
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * computeDiseasePressureAwareness — explainable current-conditions read.
 *
 * @param {object} input
 * @param {object} [input.weather]   { currentTemp, humidity, dewPoint }
 * @param {Array}  [input.moistureFlags] array of strings or { label }
 * @param {Array}  [input.observations]  disease observations (for the
 *                                        observed-reality factor)
 * @returns {{
 *   level: 'low'|'moderate'|'high'|'critical',
 *   label: string,            // human label e.g. "Moderate awareness"
 *   isPrediction: false,      // hard guarantee: never a prediction
 *   factors: Array<{ key, label, level, reasons: string[] }>,
 *   summary: string,
 * }}
 */
export function computeDiseasePressureAwareness(input = {}) {
  const factors = [
    weatherFactor(input.weather),
    moistureFactor(input.moistureFlags),
    observationFactor(input.observations),
  ].filter(Boolean)

  const level = factors.length
    ? strongest(...factors.map(f => f.level))
    : 'low'

  const labelMap = {
    low:      'Low awareness',
    moderate: 'Moderate awareness',
    high:     'Elevated awareness',
    critical: 'High awareness',
  }

  // Summary names only the factors that are actually elevated, so the read
  // is always traceable. If nothing is elevated, say so plainly.
  const elevated = factors.filter(f => f.level !== 'low')
  const summary = elevated.length === 0
    ? 'No disease-favorable factors currently elevated.'
    : `Elevated: ${elevated.map(f => f.label.toLowerCase()).join(', ')}.`

  return {
    level,
    label: labelMap[level],
    isPrediction: false,
    factors,
    summary,
  }
}
