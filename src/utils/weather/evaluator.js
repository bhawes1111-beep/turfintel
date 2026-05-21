// ── Weather condition evaluator ────────────────────────────────────────────────
//
// Pure functions — no side effects, no React imports, no operations layer.
// Each evaluator takes raw weather data and returns a plain recommendation
// descriptor object, or null when no advisory is warranted.
//
// API-READY: replace PLACEHOLDER_* inputs with live weather feed objects.
// The evaluator signatures and return shapes are stable across data sources.

// ── Thresholds ─────────────────────────────────────────────────────────────────

const WIND_HIGH_MPH      = 10    // EPA/label upper limit for most pesticide applications
const WIND_CAUTION_MPH   = 7     // Elevated drift risk
const HUMIDITY_HIGH_PCT  = 85    // Reduced dry-down and systemic uptake
const FROST_HIGH_F       = 35    // Frost risk
const FROST_CAUTION_F    = 38    // Near-frost — ice formation possible
const HEAT_HIGH_F        = 90    // Heat stress — crew and turf
const HEAT_CAUTION_F     = 86    // Elevated heat concern
const ET_HIGH_IN         = 0.25  // Significant moisture stress
const ET_MEDIUM_IN       = 0.15  // Moderate irrigation demand
const RAIN_HEAVY_IN      = 0.50  // Heavy rain — operations delay
const RAIN_MODERATE_IN   = 0.20  // Moderate rain — spray timing concern

// ── evaluateSprayWindow ────────────────────────────────────────────────────────
// Checks wind speed and humidity for spray application safety.

export function evaluateSprayWindow(current) {
  if (!current) return null
  const { wind = 0, windDir = '', humidity = 0 } = current

  if (wind > WIND_HIGH_MPH) {
    return {
      type:              'wind-spray',
      severity:          'high',
      title:             'Wind Too High for Spraying',
      message:           `Wind at ${wind} mph ${windDir} exceeds the 10 mph maximum on most pesticide labels.`,
      recommendedAction: 'Halt spray operations. Resume when sustained winds drop below 10 mph.',
      module:            'spray',
      icon:              '💨',
    }
  }
  if (wind > WIND_CAUTION_MPH) {
    return {
      type:              'wind-spray',
      severity:          'medium',
      title:             'Marginal Wind Speed for Spraying',
      message:           `Wind at ${wind} mph ${windDir} — elevated off-target drift risk for foliar applications.`,
      recommendedAction: 'Target early AM or evening application window. Avoid coarse droplet-sensitive products.',
      module:            'spray',
      icon:              '💨',
    }
  }
  if (humidity > HUMIDITY_HIGH_PCT) {
    return {
      type:              'spray-humidity',
      severity:          'medium',
      title:             'High Humidity — Spray Efficacy Risk',
      message:           `Relative humidity at ${humidity}% — prolonged leaf wetness may slow dry-down and affect product uptake.`,
      recommendedAction: 'Allow conditions to improve before systemic applications. Contact products are less affected.',
      module:            'spray',
      icon:              '💧',
    }
  }
  return null
}

// ── evaluateDiseasePressure ────────────────────────────────────────────────────
// Evaluates current and forecast fungal disease conditions.

export function evaluateDiseasePressure(current, forecast = []) {
  if (!current) return null
  const { diseasePressure, dewPoint, temp } = current

  if (diseasePressure === 'high' || diseasePressure === 'critical') {
    const isCritical       = diseasePressure === 'critical'
    const elevatedDays     = forecast.filter(
      d => d.diseasePressure === 'high' || d.diseasePressure === 'critical'
    ).length
    const dewGap           = (temp != null && dewPoint != null) ? temp - dewPoint : null

    return {
      type:              'disease-pressure',
      severity:          'high',
      title:             isCritical ? 'Critical Disease Pressure' : 'High Disease Pressure',
      message:           [
        `${isCritical ? 'Critical' : 'High'} fungal disease pressure in current conditions`,
        dewGap != null && dewGap < 8 ? `(dew point ${dewPoint}°F, temp/dew spread only ${dewGap}°F)` : '',
        elevatedDays > 0 ? `— ${elevatedDays} of the next 7 forecast days also show elevated pressure.` : '.',
      ].filter(Boolean).join(' '),
      recommendedAction: isCritical
        ? 'Curative fungicide application warranted. Do not delay.'
        : 'Review fungicide program timing. Preventive or curative applications may be needed.',
      module:            'disease',
      icon:              '🦠',
    }
  }

  // Sustained critical pressure in forecast even if current is moderate
  const criticalForecastDays = forecast.filter(d => d.diseasePressure === 'critical').length
  if (criticalForecastDays >= 2) {
    return {
      type:              'disease-pressure',
      severity:          'medium',
      title:             'Sustained Disease Pressure Forecast',
      message:           `${criticalForecastDays} days of critical disease pressure in the next 7-day forecast.`,
      recommendedAction: 'Pre-position with preventive fungicide before the high-pressure window opens.',
      module:            'disease',
      icon:              '🦠',
    }
  }
  return null
}

// ── evaluateETDemand ───────────────────────────────────────────────────────────
// Evaluates daily evapotranspiration deficit against irrigation thresholds.

export function evaluateETDemand(current) {
  if (!current) return null
  const { etDeficit = 0, etRate = 0 } = current

  if (etDeficit >= ET_HIGH_IN) {
    return {
      type:              'et-demand',
      severity:          'high',
      title:             'High Evapotranspiration — Moisture Stress',
      message:           `ET deficit at ${etDeficit.toFixed(2)}" — turf is in moisture stress. ET rate today: ${etRate.toFixed(2)} in/day.`,
      recommendedAction: 'Increase irrigation frequency to replace deficit. Syringe greens and tees during peak heat hours.',
      module:            'irrigation',
      icon:              '💧',
    }
  }
  if (etDeficit >= ET_MEDIUM_IN) {
    return {
      type:              'et-demand',
      severity:          'medium',
      title:             'Moderate Irrigation Demand',
      message:           `ET deficit at ${etDeficit.toFixed(2)}" with daily ET rate ${etRate.toFixed(2)} in/day.`,
      recommendedAction: 'Review irrigation schedule and run times. Syringing recommended during afternoon heat.',
      module:            'irrigation',
      icon:              '💧',
    }
  }
  return null
}

// ── evaluateFrostRisk ──────────────────────────────────────────────────────────
// Scans the next 5 forecast days for near-freezing low temperatures.

export function evaluateFrostRisk(forecast = []) {
  const near      = forecast.slice(0, 5)
  const frostDay  = near.find(d => d.low != null && d.low < FROST_HIGH_F)
  const caution   = !frostDay && near.find(d => d.low != null && d.low < FROST_CAUTION_F)

  if (frostDay) {
    return {
      type:              'frost-risk',
      severity:          'high',
      title:             'Frost Risk in Forecast',
      message:           `Low of ${frostDay.low}°F forecast for ${frostDay.day} (${frostDay.date}) — potential freezing conditions.`,
      recommendedAction: 'Suspend all foliar applications. Protect sensitive turf. Store chemical inventory above freezing.',
      module:            'agronomy',
      icon:              '❄',
    }
  }
  if (caution) {
    return {
      type:              'frost-risk',
      severity:          'medium',
      title:             'Near-Frost Temperatures Ahead',
      message:           `Low of ${caution.low}°F forecast for ${caution.day} (${caution.date}) — ice formation possible on turf surfaces.`,
      recommendedAction: 'Monitor overnight temperatures. Delay early-morning spray applications until surfaces clear.',
      module:            'agronomy',
      icon:              '❄',
    }
  }
  return null
}

// ── evaluateRainDelay ──────────────────────────────────────────────────────────
// Checks 24h rainfall and 7-day forecast for rain events that affect operations.

export function evaluateRainDelay(current, forecast = []) {
  if (!current) return null

  // Already rained significantly — possible saturation
  if (current.rainfall24h >= RAIN_HEAVY_IN) {
    return {
      type:              'rain-delay',
      severity:          'high',
      title:             'Rain Delay in Effect',
      message:           `${current.rainfall24h}" recorded in the last 24 hours — fields may be saturated or soft.`,
      recommendedAction: 'Hold spray and heavy equipment operations until turf firms up. Check drainage.',
      module:            'spray',
      icon:              '🌧',
    }
  }

  // Scan full 7-day forecast for rain events
  const heavyIdx    = forecast.findIndex(d => d.rainfall >= RAIN_HEAVY_IN)
  const moderateIdx = forecast.findIndex(d => d.rainfall >= RAIN_MODERATE_IN && d.rainfall < RAIN_HEAVY_IN)

  if (heavyIdx !== -1) {
    const day      = forecast[heavyIdx]
    const imminent = heavyIdx <= 2
    return {
      type:              'rain-delay',
      severity:          imminent ? 'high' : 'medium',
      title:             `Heavy Rain Forecast — ${day.day}`,
      message:           `${day.rainfall}" expected ${day.day} (${day.date}) — planned spray operations may need rescheduling.`,
      recommendedAction: 'Move scheduled applications to before the rain event or at least 24 hrs after. Verify product rain-fast intervals.',
      module:            'spray',
      icon:              '🌧',
    }
  }
  if (moderateIdx !== -1) {
    const day = forecast[moderateIdx]
    return {
      type:              'rain-delay',
      severity:          'medium',
      title:             `Rain Expected — ${day.day}`,
      message:           `${day.rainfall}" expected ${day.day} (${day.date}).`,
      recommendedAction: 'Confirm product rain-fast interval. Allow adequate drying time before rain event.',
      module:            'spray',
      icon:              '🌦',
    }
  }
  return null
}

// ── evaluateHeatStress ─────────────────────────────────────────────────────────
// Checks for heat stress conditions affecting crew safety and turf health.

export function evaluateHeatStress(current, forecast = []) {
  if (!current) return null
  const { currentTemp = 0 } = current

  if (currentTemp >= HEAT_HIGH_F) {
    return {
      type:              'heat-stress',
      severity:          'high',
      title:             'Heat Stress Conditions',
      message:           `Current temperature ${currentTemp}°F — significant heat stress risk for crew and cool-season turf.`,
      recommendedAction: 'Suspend non-essential crew operations 11AM–3PM. Syringe every 90 min. Mandatory water breaks.',
      module:            'crew',
      icon:              '🌡',
    }
  }

  const next3   = forecast.slice(0, 3)
  const hotDay  = next3.find(d => d.high >= HEAT_HIGH_F)
  if (hotDay) {
    return {
      type:              'heat-stress',
      severity:          'medium',
      title:             `Heat Stress Risk — ${hotDay.day}`,
      message:           `High of ${hotDay.high}°F forecast ${hotDay.day} (${hotDay.date}).`,
      recommendedAction: 'Adjust crew schedules to complete intensive work before 9AM. Pre-position syringe resources.',
      module:            'crew',
      icon:              '🌡',
    }
  }
  if (currentTemp >= HEAT_CAUTION_F) {
    return {
      type:              'heat-stress',
      severity:          'medium',
      title:             'Elevated Temperature Alert',
      message:           `Temperature at ${currentTemp}°F — monitor crew hydration and turf stress indicators.`,
      recommendedAction: 'Schedule water breaks every 30 min. Avoid oil-carrier spray applications during peak heat.',
      module:            'crew',
      icon:              '🌡',
    }
  }
  return null
}
