// ── Irrigation intelligence evaluators ────────────────────────────────────────
// Pure functions — no React, no side effects, no operations layer imports.
// Each evaluator accepts normalized weather data and returns a plain
// recommendation descriptor or null when no advisory is warranted.
// generateIrrigationRecommendations() is the public orchestrator.

import {
  createIrrigationRecommendation,
  sortRecommendations,
} from '../intelligence/recommendationHelpers'

// ── Thresholds ────────────────────────────────────────────────────────────────

const ET_CRITICAL_IN     = 0.25   // Significant moisture stress
const ET_HIGH_IN         = 0.15   // Moderate stress
const ET_MIN_IN          = 0.05   // Below this — no action
const RAIN_SATURATION_IN = 0.50   // Soil likely saturated — hold irrigation
const RAIN_SKIP_IN       = 0.30   // Significant rain coming — skip cycle
const RAIN_CAUTION_IN    = 0.15   // Light rain — reduce cycle
const WEEKLY_DEMAND_IN   = 1.00   // 7-day net ET need warrants planning note
const WEEKLY_SURPLUS_IN  = 0.75   // 7-day rainfall surplus — suspend program
const HEAT_SYRINGE_F     = 85     // Syringe advisory threshold
const HEAT_PEAK_F        = 90     // Mandatory syringe threshold
const MAX_APP_IN         = 0.50   // Per-cycle cap — avoid runoff

// ── Utilities ─────────────────────────────────────────────────────────────────

function roundTo5(n) {
  return Math.round(n / 0.05) * 0.05
}

function fix2(n) {
  return parseFloat(n.toFixed(2))
}

// ── evaluateSaturation ────────────────────────────────────────────────────────
// Recent heavy rainfall — hold all irrigation cycles until surface firms up.
// Checked first so it can short-circuit deficit recommendations.

export function evaluateSaturation(current) {
  if (!current) return null
  const { rainfall24h = 0 } = current

  if (rainfall24h >= RAIN_SATURATION_IN) {
    return {
      type:              'irrigation-hold',
      severity:          'high',
      title:             'Hold Irrigation — Soil Saturated',
      message:           `${rainfall24h.toFixed(2)}" received in the last 24 hours — fields likely saturated.`,
      recommendedAction: 'Skip all irrigation cycles until surface firms up. Check low-lying drainage areas.',
      module:            'irrigation',
      icon:              '🌧',
    }
  }
  return null
}

// ── evaluateDeficitAndApplication ─────────────────────────────────────────────
// Computes net moisture deficit (ET deficit offset by recent rainfall) and
// returns a specific application amount recommendation, or null.

export function evaluateDeficitAndApplication(current, forecast = []) {
  if (!current) return null
  const { etDeficit = 0, rainfall24h = 0 } = current

  // Rainfall already fell — reduces net deficit
  const netDeficit = Math.max(0, etDeficit - rainfall24h)
  if (netDeficit < ET_MIN_IN) return null

  // Imminent rainfall should cover the deficit — rain-skip evaluator handles this
  const imminentRain = (forecast[0]?.rainfall ?? 0) + (forecast[1]?.rainfall ?? 0)
  if (imminentRain >= netDeficit) return null

  const applied = fix2(Math.min(roundTo5(netDeficit), MAX_APP_IN))

  if (netDeficit >= ET_CRITICAL_IN) {
    return {
      type:              'irrigation-deficit',
      severity:          'high',
      title:             `Apply ${applied.toFixed(2)}" Tonight — Moisture Stress`,
      message:           `ET deficit ${etDeficit.toFixed(2)}" with ${rainfall24h.toFixed(2)}" rainfall offset — net need ${netDeficit.toFixed(2)}".`,
      recommendedAction: `Run irrigation tonight. Apply ${applied.toFixed(2)}" to greens and tees. Check soil moisture before starting fairways.`,
      module:            'irrigation',
      icon:              '💧',
      applicationIn:     applied,
    }
  }

  if (netDeficit >= ET_HIGH_IN) {
    return {
      type:              'irrigation-deficit',
      severity:          'medium',
      title:             `Light Irrigation Needed — ${applied.toFixed(2)}"`,
      message:           `Net ET deficit ${netDeficit.toFixed(2)}" — light moisture stress developing.`,
      recommendedAction: `Apply ${applied.toFixed(2)}" tonight. Focus on greens and exposed tees first.`,
      module:            'irrigation',
      icon:              '💧',
      applicationIn:     applied,
    }
  }

  return null
}

// ── evaluateRainSkip ──────────────────────────────────────────────────────────
// Scan next 48h for rainfall that offsets irrigation need.

export function evaluateRainSkip(forecast = []) {
  const d0      = forecast[0]?.rainfall ?? 0
  const d1      = forecast[1]?.rainfall ?? 0
  const d0Label = forecast[0]?.day ?? 'Today'
  const d1Label = forecast[1]?.day ?? 'Tomorrow'
  const combined = d0 + d1

  if (d0 >= RAIN_SKIP_IN) {
    return {
      type:              'irrigation-rain-skip',
      severity:          'medium',
      title:             `Skip Tonight's Cycle — Rain Forecast`,
      message:           `${d0.toFixed(2)}" expected ${d0Label === 'Today' ? 'today' : d0Label.toLowerCase()} — forecast rainfall should satisfy irrigation demand.`,
      recommendedAction: "Hold tonight's cycle. Re-evaluate after rainfall clears and ET tracking resumes.",
      module:            'irrigation',
      icon:              '☔',
    }
  }

  if (combined >= RAIN_SKIP_IN) {
    return {
      type:              'irrigation-rain-skip',
      severity:          'low',
      title:             `Reduce Irrigation — Rain Expected ${d1Label}`,
      message:           `${d0.toFixed(2)}" today + ${d1.toFixed(2)}" ${d1Label.toLowerCase()} = ${combined.toFixed(2)}" combined — approaching full ET offset.`,
      recommendedAction: 'Consider skipping or reducing the next cycle. Monitor actual rainfall totals before committing.',
      module:            'irrigation',
      icon:              '🌦',
    }
  }

  if (d0 >= RAIN_CAUTION_IN) {
    return {
      type:              'irrigation-rain-skip',
      severity:          'low',
      title:             'Light Rain Expected — Adjust Cycle Times',
      message:           `${d0.toFixed(2)}" forecast ${d0Label === 'Today' ? 'today' : d0Label.toLowerCase()} may partially offset ET demand.`,
      recommendedAction: 'Reduce tonight\'s cycle run times by 30–40% if rain falls as forecast.',
      module:            'irrigation',
      icon:              '🌦',
    }
  }

  return null
}

// ── evaluateWeeklyBalance ─────────────────────────────────────────────────────
// 7-day ET vs rainfall balance — flags sustained demand or rainfall surplus.

export function evaluateWeeklyBalance(forecast = []) {
  if (!forecast.length) return null

  const totalET   = forecast.reduce((s, d) => s + (d.etRate ?? 0), 0)
  const totalRain = forecast.reduce((s, d) => s + (d.rainfall ?? 0), 0)
  const netNeed   = fix2(Math.max(0, totalET - totalRain))
  const surplus   = fix2(Math.max(0, totalRain - totalET))

  if (netNeed >= WEEKLY_DEMAND_IN) {
    return {
      type:              'irrigation-weekly',
      severity:          'medium',
      title:             `${netNeed.toFixed(2)}" Net Demand This Week`,
      message:           `7-day forecast: ${fix2(totalET).toFixed(2)}" ET demand vs ${fix2(totalRain).toFixed(2)}" expected rainfall — ${netNeed.toFixed(2)}" net irrigation needed.`,
      recommendedAction: 'Plan irrigation program to cover projected deficit. Prioritize greens, tees, and fairway high-spots.',
      module:            'irrigation',
      icon:              '📊',
    }
  }

  if (surplus >= WEEKLY_SURPLUS_IN) {
    return {
      type:              'irrigation-weekly',
      severity:          'low',
      title:             `Rainfall Surplus — ${surplus.toFixed(2)}" Excess Forecast`,
      message:           `7-day forecast: ${fix2(totalRain).toFixed(2)}" rain vs ${fix2(totalET).toFixed(2)}" ET — ${surplus.toFixed(2)}" rainfall surplus expected.`,
      recommendedAction: 'Suspend irrigation program through the week. Monitor drainage and watch for elevated disease pressure as moisture accumulates.',
      module:            'irrigation',
      icon:              '📊',
    }
  }

  return null
}

// ── evaluateSyringeSchedule ───────────────────────────────────────────────────
// Midday syringe recommendations during active or forecast heat stress windows.

export function evaluateSyringeSchedule(current, forecast = []) {
  if (!current) return null
  const { currentTemp = 0 } = current

  if (currentTemp >= HEAT_PEAK_F) {
    return {
      type:              'irrigation-syringe',
      severity:          'high',
      title:             'Active Heat Stress — Syringe Every 60 Min',
      message:           `Current temp ${currentTemp}°F — significant turf heat stress. Syringe cycles keep leaf temp below wilting threshold.`,
      recommendedAction: 'Syringe greens and exposed tees every 60 minutes from 11AM–3PM. Monitor for wilt flag indicators.',
      module:            'irrigation',
      icon:              '🌡',
    }
  }

  const hotDays = forecast.slice(0, 3).filter(d => (d.high ?? 0) >= HEAT_PEAK_F)

  if (currentTemp >= HEAT_SYRINGE_F) {
    return {
      type:              'irrigation-syringe',
      severity:          'medium',
      title:             'Heat Stress Syringe Advisory',
      message:           `Current temp ${currentTemp}°F — elevated heat stress. Greens at risk of wilt without midday syringe.`,
      recommendedAction: 'Syringe greens every 90 minutes between 11AM–3PM. Prioritize exposed tees and south-facing slopes.',
      module:            'irrigation',
      icon:              '🌡',
    }
  }

  if (hotDays.length > 0) {
    const hotDay = hotDays[0]
    return {
      type:              'irrigation-syringe',
      severity:          'medium',
      title:             `Pre-position Syringe Resources — Heat ${hotDay.day}`,
      message:           `High of ${hotDay.high}°F forecast ${hotDay.day} — prepare syringe equipment and staffing in advance.`,
      recommendedAction: 'Stage syringe hoses on greens and tees the morning before. Alert crew to 90-minute syringe schedule.',
      module:            'irrigation',
      icon:              '🌡',
    }
  }

  return null
}

// ── generateIrrigationRecommendations ────────────────────────────────────────
// Runs all evaluators, filters nulls, stamps IDs, sorts by severity.

export function generateIrrigationRecommendations(current, forecast = []) {
  const raw = [
    evaluateSaturation(current),
    evaluateDeficitAndApplication(current, forecast),
    evaluateRainSkip(forecast),
    evaluateSyringeSchedule(current, forecast),
    evaluateWeeklyBalance(forecast),
  ]
  return sortRecommendations(raw.filter(Boolean).map(createIrrigationRecommendation))
}

// ── computeIrrigationSummary ──────────────────────────────────────────────────
// Summary stats for the card header row.

export function computeIrrigationSummary(current, forecast = []) {
  const etToday    = fix2(current?.etRate     ?? 0)
  const rainfall24h = fix2(current?.rainfall24h ?? 0)
  const etDeficit  = current?.etDeficit ?? 0
  const totalET    = fix2(forecast.reduce((s, d) => s + (d.etRate    ?? 0), 0))
  const totalRain  = fix2(forecast.reduce((s, d) => s + (d.rainfall  ?? 0), 0))
  const weeklyNet  = fix2(Math.max(0, totalET - totalRain))

  const netDeficit    = fix2(Math.max(0, etDeficit - rainfall24h))
  const imminentRain  = (forecast[0]?.rainfall ?? 0) + (forecast[1]?.rainfall ?? 0)
  const skip          = netDeficit < ET_MIN_IN || imminentRain >= netDeficit
  const recApplication = skip ? 0 : fix2(Math.min(roundTo5(netDeficit), MAX_APP_IN))

  return {
    etToday,
    weeklyNetNeed:   weeklyNet,
    rainOffset:      rainfall24h,
    netDeficit,
    recApplication,
  }
}
