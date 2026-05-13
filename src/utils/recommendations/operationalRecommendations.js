// Phase 15 — Weather-aware operational recommendations.
//
// Pure rules engine. No side effects, no fetches, no AI. Inputs come
// from the existing useWeather() shape + the existing schedule
// templates list. Outputs are plain objects the panel can render.
//
// All thresholds are centralized in THRESHOLDS so they're easy to tune
// later or move into a per-course config.

export const THRESHOLDS = {
  // Frost — caution at 36°F, warning at 30°F or below.
  frostCaution:   36,
  frostWarning:   30,

  // Rain — caution if tomorrow's rainfall >= 0.75", warning >= 1.5".
  rainCaution:    0.75,
  rainWarning:    1.5,
  rainPopHigh:    70,     // % probability used in combination with light rain

  // Spray — wind thresholds in mph.
  windFavorable:   7,     // <= favorable
  windMarginal:    10,    // <= marginal, > unfavorable
  windUnfavorable: 15,    // > critical-unfavorable

  // Spray temp band — outside this range, conditions are marginal regardless.
  sprayTempLow:   50,
  sprayTempHigh:  85,

  // Heat — feels-like thresholds.
  heatCaution:    90,
  heatWarning:    100,
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isFiniteNumber(x) { return typeof x === 'number' && Number.isFinite(x) }

function findTemplateByName(templates, name) {
  if (!Array.isArray(templates)) return null
  const lower = String(name).toLowerCase()
  return templates.find(t => (t.name ?? '').toLowerCase().includes(lower)) ?? null
}

function recommendationFromTemplate(templates, namePart, fallbackHref = '/employees') {
  const tpl = findTemplateByName(templates, namePart)
  if (tpl) {
    return {
      templateName: tpl.name,
      actionLabel:  'Open Schedule',
      actionHref:   fallbackHref,
    }
  }
  return {
    templateName: null,
    actionLabel:  'Open Schedule',
    actionHref:   fallbackHref,
  }
}

// ── Spray conditions (separate output, used as its own card) ─────────────

export function computeSprayConditions(current) {
  if (!current || !isFiniteNumber(current.wind)) {
    return { kind: 'unknown', label: 'Status unknown', reasons: ['No wind data available.'] }
  }

  const wind        = current.wind
  const tempF       = isFiniteNumber(current.currentTemp) ? current.currentTemp : null
  const reasons     = []
  let   kind        = 'favorable'

  if (wind > THRESHOLDS.windUnfavorable) {
    kind = 'unfavorable'
    reasons.push(`Wind ${Math.round(wind)} mph exceeds ${THRESHOLDS.windUnfavorable} mph spray threshold.`)
  } else if (wind > THRESHOLDS.windMarginal) {
    kind = 'unfavorable'
    reasons.push(`Wind ${Math.round(wind)} mph above ${THRESHOLDS.windMarginal} mph — drift risk.`)
  } else if (wind > THRESHOLDS.windFavorable) {
    kind = 'marginal'
    reasons.push(`Wind ${Math.round(wind)} mph — borderline. Monitor gusts.`)
  } else {
    reasons.push(`Wind ${Math.round(wind)} mph — calm.`)
  }

  if (tempF !== null) {
    if (tempF < THRESHOLDS.sprayTempLow) {
      if (kind === 'favorable') kind = 'marginal'
      reasons.push(`Temp ${Math.round(tempF)}°F below ${THRESHOLDS.sprayTempLow}°F — uptake reduced.`)
    } else if (tempF > THRESHOLDS.sprayTempHigh) {
      if (kind === 'favorable') kind = 'marginal'
      reasons.push(`Temp ${Math.round(tempF)}°F above ${THRESHOLDS.sprayTempHigh}°F — volatility risk.`)
    }
  }

  return { kind, label: spLabel(kind), reasons }
}

function spLabel(kind) {
  switch (kind) {
    case 'favorable':   return 'Favorable'
    case 'marginal':    return 'Marginal'
    case 'unfavorable': return 'Unfavorable'
    default:            return 'Status unknown'
  }
}

// ── Generic recommendations chain ────────────────────────────────────────

export function computeRecommendations({ current, forecast, templates }) {
  const out = []

  // ── Frost ──────────────────────────────────────────────────────────────
  const tempNow      = current && isFiniteNumber(current.currentTemp) ? current.currentTemp : null
  const overnightLow = Array.isArray(forecast) && forecast[0] && isFiniteNumber(forecast[0].low)
                       ? forecast[0].low : null

  if ((tempNow !== null && tempNow <= THRESHOLDS.frostWarning)
   || (overnightLow !== null && overnightLow <= THRESHOLDS.frostWarning)) {
    const tpl = recommendationFromTemplate(templates, 'frost delay')
    out.push({
      id:       'frost-warning',
      severity: 'warning',
      title:    'Frost warning',
      detail:
        (tempNow !== null && tempNow <= THRESHOLDS.frostWarning)
          ? `Current temp ${Math.round(tempNow)}°F — hard freeze conditions.`
          : `Forecast low ${Math.round(overnightLow)}°F — hard freeze risk.`,
      hint:     'Hold mowing equipment off greens until frost lifts. Delayed setup recommended.',
      templateName: tpl.templateName,
      actionLabel:  tpl.actionLabel,
      actionHref:   tpl.actionHref,
    })
  } else if ((tempNow !== null && tempNow <= THRESHOLDS.frostCaution)
          || (overnightLow !== null && overnightLow <= THRESHOLDS.frostCaution)) {
    const tpl = recommendationFromTemplate(templates, 'frost delay')
    out.push({
      id:       'frost-caution',
      severity: 'caution',
      title:    'Frost risk',
      detail:
        (tempNow !== null && tempNow <= THRESHOLDS.frostCaution)
          ? `Current temp ${Math.round(tempNow)}°F — frost possible until sunrise.`
          : `Forecast low ${Math.round(overnightLow)}°F — frost possible overnight.`,
      hint:     'Recommend delayed setup crew start. Wait for surface to clear before mowing.',
      templateName: tpl.templateName,
      actionLabel:  tpl.actionLabel,
      actionHref:   tpl.actionHref,
    })
  }

  // ── Rain ──────────────────────────────────────────────────────────────
  const fcDay = Array.isArray(forecast) ? forecast[0] : null
  const rain  = fcDay && isFiniteNumber(fcDay.rainfall) ? fcDay.rainfall : null
  const pop   = fcDay && isFiniteNumber(fcDay._pop)     ? fcDay._pop     : null

  if (rain !== null && rain >= THRESHOLDS.rainWarning) {
    const tpl = recommendationFromTemplate(templates, 'rain cleanup')
    out.push({
      id:       'rain-warning',
      severity: 'warning',
      title:    'Heavy rain forecast',
      detail:   `${rain.toFixed(2)}" expected${pop !== null ? ` · ${pop}% chance` : ''}.`,
      hint:     'Expect washouts and bunker damage. Consider Rain Cleanup Crew template.',
      templateName: tpl.templateName,
      actionLabel:  tpl.actionLabel,
      actionHref:   tpl.actionHref,
    })
  } else if ((rain !== null && rain >= THRESHOLDS.rainCaution)
          || (rain !== null && pop !== null && pop >= THRESHOLDS.rainPopHigh && rain >= 0.25)) {
    const tpl = recommendationFromTemplate(templates, 'rain cleanup')
    out.push({
      id:       'rain-caution',
      severity: 'caution',
      title:    'Rain forecast',
      detail:   `${rain.toFixed(2)}" expected${pop !== null ? ` · ${pop}% chance` : ''}.`,
      hint:     'Plan for cart-path-only and bunker prep. Rain Cleanup Crew template may help.',
      templateName: tpl.templateName,
      actionLabel:  tpl.actionLabel,
      actionHref:   tpl.actionHref,
    })
  }

  // ── Heat ──────────────────────────────────────────────────────────────
  const feels = current && isFiniteNumber(current.feelsLike) ? current.feelsLike : null
  if (feels !== null && feels >= THRESHOLDS.heatWarning) {
    out.push({
      id:       'heat-warning',
      severity: 'warning',
      title:    'Critical heat',
      detail:   `Heat index ${Math.round(feels)}°F.`,
      hint:     'Mandatory water breaks, shift earlier start times, add hand-water support crew.',
      templateName: null,
      actionLabel:  'Open Schedule',
      actionHref:   '/employees',
    })
  } else if (feels !== null && feels >= THRESHOLDS.heatCaution) {
    out.push({
      id:       'heat-caution',
      severity: 'caution',
      title:    'High heat',
      detail:   `Heat index ${Math.round(feels)}°F.`,
      hint:     'Encourage hydration, consider rotating crews off mowing equipment.',
      templateName: null,
      actionLabel:  'Open Schedule',
      actionHref:   '/employees',
    })
  }

  return out
}
