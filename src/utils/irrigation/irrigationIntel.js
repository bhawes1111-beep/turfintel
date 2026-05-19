// Phase 28C — Irrigation & Moisture Intelligence.
//
// Pure-function compose layer on top of the existing irrigationEngine.
// Adds three things the engine doesn't do:
//   1. Discrete rainfall classification (trace → runoff-risk).
//   2. Consecutive-deficit tracking from weather_observations history.
//   3. Composite wilt risk (ET + temp + wind + humidity).
//
// It also folds the existing engine's outputs (tonight recommendation,
// rain skip, weekly balance, syringe schedule, saturation hold) into a
// single compact data shape for the new dashboard card. Anything that
// needs source data we don't have (per-surface moisture, irrigation
// runtime, handwatering logs) returns `{ kind: 'unknown', reason }` so
// the UI can show "no moisture data" honestly rather than fabricate.
//
// Pattern matches src/utils/agronomic/agronomicIntelligence.js and
// src/utils/sprayWindow/sprayWindowIntel.js — no React, no fetching,
// no global state. Every output entry carries a `why`.

import {
  computeIrrigationSummary,
  generateIrrigationRecommendations,
  evaluateSaturation,
  evaluateRainSkip,
  evaluateSyringeSchedule,
} from '../weather/irrigationEngine.js'

// ── Thresholds (all in one place for tunability) ──────────────────────────

export const IRRIGATION_THRESHOLDS = {
  // Rainfall classification (inches in the relevant period — usually 24h)
  rain: {
    traceMaxIn:    0.10,   // < 0.10" → trace, ineffective
    lightMaxIn:    0.25,   // 0.10-0.25" → light
    effectiveMaxIn: 0.50,  // 0.25-0.50" → effective
    soakingMaxIn:  1.00,   // 0.50-1.00" → soaking
    // > 1.00" → runoff-risk
  },
  // Daily ET deficit (inches)
  deficit: {
    noActionMaxIn:  0.05,
    moderateMinIn:  0.15,
    highMinIn:      0.25,
  },
  // Consecutive deficit-day streak before "deficit building" fires
  consecutiveDeficitDays:    3,
  // Wilt-risk composite axes
  wilt: {
    etInPerDay:    0.20,   // > 0.20 in/day daily ET
    tempF:         85,     // > 85°F midday
    windMph:       10,     // > 10 mph
    humidityPct:   40,     // < 40% RH
    // Score = count of axes crossing → >=2 elevated, >=3 high
    elevatedMin:   2,
    highMin:       3,
  },
  // Irrigation+rain overlap risk
  overlap: {
    forecastRainMinIn: 0.15,  // > 0.15" rain forecast within 24h
  },
  // Rapid drydown event — daily ET jump on consecutive days
  rapidDrydown: {
    dailyEtJumpIn: 0.10,
    days:          2,
  },
}

// ── 1. Rainfall classification ────────────────────────────────────────────

export const RAIN_CATEGORIES = {
  none:        { rating: 'ideal',   label: 'No measurable rain',  effective: 0 },
  trace:       { rating: 'info',    label: 'Trace (ineffective)', effective: 0 },
  light:       { rating: 'caution', label: 'Light',               effectiveRatio: 0.5 },
  effective:   { rating: 'caution', label: 'Effective',           effectiveRatio: 0.9 },
  soaking:     { rating: 'warn',    label: 'Soaking',             effectiveRatio: 1.0 },
  runoffRisk:  { rating: 'high',    label: 'Runoff risk',         effectiveRatio: 0.7 },
}

export function classifyRainfall(inches) {
  if (!Number.isFinite(inches) || inches <= 0) {
    return { category: 'none', amount: 0, effectiveIn: 0, why: 'No measurable rainfall' }
  }
  const t = IRRIGATION_THRESHOLDS.rain
  let category
  let effective
  if (inches < t.traceMaxIn) {
    category = 'trace'
    effective = 0
  } else if (inches < t.lightMaxIn) {
    category = 'light'
    effective = inches * 0.5
  } else if (inches < t.effectiveMaxIn) {
    category = 'effective'
    effective = inches * 0.9
  } else if (inches < t.soakingMaxIn) {
    category = 'soaking'
    effective = inches
  } else {
    category = 'runoffRisk'
    effective = inches * 0.7
  }
  const meta = RAIN_CATEGORIES[category]
  return {
    category,
    amount: inches,
    effectiveIn: parseFloat(effective.toFixed(2)),
    why: `${inches.toFixed(2)}" — ${meta.label}${category === 'trace' ? '; does not offset ET demand' : ''}`,
  }
}

// ── 2. Consecutive-deficit tracking ───────────────────────────────────────
//
// Reads weather_observations history (newest first) and counts how many
// consecutive recent days had a net daily deficit (ET > rainfall). Returns
// the streak count + per-day breakdown for the why-string.

function dayKey(iso) {
  // YYYY-MM-DD from an ISO timestamp.
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

function numOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function computeConsecutiveDeficit(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      streakDays: 0,
      kind: 'unknown',
      reason: 'no weather history available',
      why: 'Consecutive-deficit tracking requires captured weather snapshots',
    }
  }
  // Group history by date and sum ET / rainfall for each day. The
  // weather_observations rows are individual snapshots, often multiple
  // per day, so we aggregate first.
  const byDay = new Map()
  for (const h of history) {
    // history rows expose snake_case OR mapped camelCase depending on the
    // store; tolerate both.
    const observedAt = h.observed_at || h.observedAt || h.created_at || h.createdAt
    const day        = dayKey(observedAt)
    if (!day) continue
    const et   = numOrNull(h.et_in            ?? h.etRate            ?? h.etDeficit)
    const rain = numOrNull(h.rainfall_today_in ?? h.rainfall24h)
    if (!byDay.has(day)) byDay.set(day, { day, etMax: 0, rainMax: 0 })
    const bucket = byDay.get(day)
    if (et   != null && et   > bucket.etMax)   bucket.etMax   = et
    if (rain != null && rain > bucket.rainMax) bucket.rainMax = rain
  }
  if (byDay.size === 0) {
    return {
      streakDays: 0,
      kind: 'unknown',
      reason: 'weather history lacks ET/rainfall fields',
      why: 'Consecutive-deficit tracking requires ET + rainfall in snapshots',
    }
  }
  // Order newest-first, walk while netDeficit > noActionMaxIn.
  const days = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))
  const t = IRRIGATION_THRESHOLDS
  let streak = 0
  const breakdown = []
  for (const d of days) {
    const netDeficit = Math.max(0, d.etMax - d.rainMax)
    if (netDeficit > t.deficit.noActionMaxIn) {
      streak += 1
      breakdown.push({ day: d.day, et: d.etMax, rain: d.rainMax, netDeficit })
    } else break
  }
  return {
    streakDays: streak,
    kind:       streak > 0 ? 'known' : 'no-deficit',
    breakdown,
    why: streak >= t.consecutiveDeficitDays
      ? `${streak} consecutive day${streak === 1 ? '' : 's'} of net deficit — deficit building`
      : streak > 0
        ? `${streak} day${streak === 1 ? '' : 's'} of net deficit — within normal range`
        : 'No recent net deficit',
  }
}

// ── 3. Wilt-risk composite ────────────────────────────────────────────────
//
// Each axis crossing its threshold adds 1 to the score. Score is mapped:
//   0-1 → no advisory
//   2   → elevated
//   3+  → high

export function computeWiltRisk(current) {
  if (!current) {
    return {
      kind: 'unknown',
      reason: 'no current weather',
      why: 'Wilt-risk advisory requires current weather',
    }
  }
  const t = IRRIGATION_THRESHOLDS.wilt
  const tempF = numOrNull(current.currentTemp)
  const wind  = numOrNull(current.wind)
  const rh    = numOrNull(current.humidity)
  const et    = numOrNull(current.etRate)

  const crossings = []
  if (et    != null && et    > t.etInPerDay)  crossings.push(`ET ${et.toFixed(2)} in/day > ${t.etInPerDay}`)
  if (tempF != null && tempF > t.tempF)        crossings.push(`Temp ${tempF}°F > ${t.tempF}°F`)
  if (wind  != null && wind  > t.windMph)      crossings.push(`Wind ${wind} mph > ${t.windMph} mph`)
  if (rh    != null && rh    < t.humidityPct)  crossings.push(`RH ${rh}% < ${t.humidityPct}%`)

  const knownAxes = [et, tempF, wind, rh].filter(v => v != null).length
  if (knownAxes === 0) {
    return {
      kind: 'unknown',
      reason: 'no usable axes',
      why: 'No ET / temp / wind / humidity values available',
    }
  }

  let rating
  if (crossings.length >= t.highMin)         rating = 'high'
  else if (crossings.length >= t.elevatedMin) rating = 'elevated'
  else                                        rating = 'none'

  return {
    kind: 'known',
    rating,
    score: crossings.length,
    knownAxes,
    crossings,
    why: rating === 'high'
      ? `Elevated wilt risk — ${crossings.join(' · ')}`
      : rating === 'elevated'
        ? `Possible afternoon wilt — ${crossings.join(' · ')}`
        : 'Wilt-risk axes within normal range',
  }
}

// ── 4. Rapid-drydown detection ────────────────────────────────────────────

export function detectRapidDrydown(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return null
  }
  // Take the last N days from history (aggregated by day, ET max per day),
  // look for consecutive jumps >= dailyEtJumpIn.
  const byDay = new Map()
  for (const h of history) {
    const observedAt = h.observed_at || h.observedAt || h.created_at || h.createdAt
    const day        = dayKey(observedAt)
    if (!day) continue
    const et = numOrNull(h.et_in ?? h.etRate)
    if (et == null) continue
    if (!byDay.has(day)) byDay.set(day, et)
    else if (et > byDay.get(day)) byDay.set(day, et)
  }
  if (byDay.size < 2) return null
  const ordered = [...byDay.entries()].sort(([a],[b]) => a.localeCompare(b))
  const t = IRRIGATION_THRESHOLDS.rapidDrydown
  // Check the most recent (t.days) days for a jump pattern.
  const tail = ordered.slice(-t.days - 1)  // need t.days+1 to compute t.days deltas
  if (tail.length < t.days + 1) return null
  let jumps = 0
  let detail = []
  for (let i = 1; i < tail.length; i++) {
    const delta = tail[i][1] - tail[i-1][1]
    if (delta >= t.dailyEtJumpIn) jumps += 1
    detail.push({ from: tail[i-1][0], to: tail[i][0], delta: parseFloat(delta.toFixed(2)) })
  }
  if (jumps < t.days) return null
  return {
    kind: 'known',
    days: detail,
    why: `ET rose ${detail[detail.length - 1].delta.toFixed(2)}"+ on ${jumps} consecutive day${jumps === 1 ? '' : 's'} — rapid drydown`,
  }
}

// ── 5. Irrigation+rain overlap risk ───────────────────────────────────────
//
// Without irrigation runtime data, we can't detect actual overlap. Instead,
// we flag the FORWARD risk: tonight's recommended application would
// overlap with measurable forecast rain in the next 24h.

export function detectIrrigationRainOverlap(summary, forecast) {
  if (!summary || summary.recApplication <= 0) return null
  if (!Array.isArray(forecast) || forecast.length === 0) return null
  const next24Rain = (forecast[0]?.rainfall ?? 0) + (forecast[1]?.rainfall ?? 0)
  const t = IRRIGATION_THRESHOLDS.overlap
  if (next24Rain < t.forecastRainMinIn) return null
  return {
    kind: 'known',
    forecastRainIn: parseFloat(next24Rain.toFixed(2)),
    why: `Tonight's ${summary.recApplication.toFixed(2)}" recommendation + ${next24Rain.toFixed(2)}" forecast rain — consider reducing or skipping`,
  }
}

// ── 6. Moisture / runtime / handwatering — honest unknowns ────────────────
//
// These will become real when the data is in the system; the API surface
// is here so callers can branch on `kind === 'unknown'` rather than
// needing to know about the missing data sources.

export function moistureTrend(/* readings */) {
  // No moisture readings exist in the data model yet. Return a stable
  // unknown shape so the UI can render "no moisture data".
  return {
    kind: 'unknown',
    reason: 'no moisture data source connected',
    why: 'Moisture trend tracking requires soil-moisture readings (not yet captured by TurfIntel)',
  }
}

export function irrigationRuntimeOverlap(/* runtime */) {
  return {
    kind: 'unknown',
    reason: 'no irrigation runtime data source',
    why: 'Irrigation runtime detection requires controller integration (not yet wired)',
  }
}

// ── Top-level compose ─────────────────────────────────────────────────────

/**
 * One-shot compute for the new compact dashboard card.
 *
 * @param {Object} input
 * @param {Object} input.current   — normalized current weather (or null)
 * @param {Array}  input.forecast  — normalized forecast days
 * @param {Array}  [input.history] — weather_observations rows (oldest or newest order; we sort)
 * @param {number} [input.now]     — clock override (tests)
 */
export function computeIrrigationIntel({ current, forecast, history, now }) {
  const clock = now ?? Date.now()
  const safeForecast = Array.isArray(forecast) ? forecast : []

  // Existing engine — reuse its summary + recommendations rather than
  // duplicate the math.
  const summary         = computeIrrigationSummary(current, safeForecast)
  const recommendations = generateIrrigationRecommendations(current, safeForecast)
  const saturation      = evaluateSaturation(current)
  const rainSkip        = evaluateRainSkip(safeForecast)
  const syringe         = evaluateSyringeSchedule(current, safeForecast)

  // New layers
  const rainfall24hClass = classifyRainfall(numOrNull(current?.rainfall24h) ?? 0)
  const wilt             = computeWiltRisk(current)
  const consecutive      = computeConsecutiveDeficit(history ?? [])
  const drydown          = detectRapidDrydown(history ?? [])
  const overlap          = detectIrrigationRainOverlap(summary, safeForecast)
  const moisture         = moistureTrend()
  const runtime          = irrigationRuntimeOverlap()

  // Pick the top irrigation risk for the compact card row.
  const candidates = []
  if (saturation)            candidates.push({ source: 'saturation', rating: 'high',     why: saturation.message })
  if (overlap)               candidates.push({ source: 'overlap',    rating: 'caution',  why: overlap.why })
  if (consecutive?.kind === 'known' && consecutive.streakDays >= IRRIGATION_THRESHOLDS.consecutiveDeficitDays) {
    candidates.push({ source: 'deficit', rating: 'caution', why: consecutive.why })
  }
  if (drydown)               candidates.push({ source: 'drydown',    rating: 'caution',  why: drydown.why })
  if (wilt?.rating === 'high')      candidates.push({ source: 'wilt', rating: 'high',    why: wilt.why })
  else if (wilt?.rating === 'elevated') candidates.push({ source: 'wilt', rating: 'caution', why: wilt.why })
  const ratingOrder = { high: 0, caution: 1, info: 2 }
  candidates.sort((a, b) => (ratingOrder[a.rating] ?? 9) - (ratingOrder[b.rating] ?? 9))
  const topRisk = candidates[0] ?? null

  return {
    summary,
    rainfall24hClass,
    wilt,
    consecutive,
    drydown,
    overlap,
    saturation,
    rainSkip,
    syringe,
    moisture,
    runtime,
    topRisk,
    recommendations,
  }
}
