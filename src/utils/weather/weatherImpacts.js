// Crew-facing weather impacts for the Display Board.
//
// Translates the live `current` conditions (+ today's forecast) into a short
// list of operational impact chips a crew can act on at a glance — frost
// delay, high wind, heat, heavy rain. Pure + explainable: rule-based on real
// weather fields, conservative thresholds, no fake precision. Returns [] when
// nothing notable, so the board shows an honest "clear" state.

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * weatherImpacts(current, forecast)
 *   current  — normalized current weather ({ currentTemp, wind, ... })
 *   forecast — normalized forecast days (forecast[0] = today)
 *
 * Returns [{ key, label, detail, severity }] — severity: warn | alert | info.
 */
export function weatherImpacts(current = {}, forecast = []) {
  const out = []
  const temp = num(current.currentTemp)
  const wind = num(current.wind)
  const today = forecast?.[0] ?? null
  const low  = today ? num(today.low) : null
  const rain = today ? num(today.rainfall) : null

  // Frost delay — current temp at/below freezing-ish, or forecast low ≤36°F.
  if ((temp != null && temp <= 36) || (low != null && low <= 36)) {
    const t = temp != null && temp <= 36 ? temp : low
    out.push({
      key: 'frost',
      label: 'Frost delay potential',
      detail: t != null ? `${Math.round(t)}°F` : null,
      severity: 'alert',
    })
  }

  // High wind — spray/mowing/blowing impact.
  if (wind != null && wind >= 15) {
    out.push({ key: 'wind', label: 'High wind', detail: `${Math.round(wind)} mph`, severity: 'warn' })
  }

  // Heat — crew hydration / turf stress.
  if (temp != null && temp >= 85) {
    out.push({ key: 'heat', label: 'Heat — hydrate', detail: `${Math.round(temp)}°F`, severity: 'warn' })
  }

  // Heavy rain today — bunkers / cart / mowing impact.
  if (rain != null && rain >= 0.5) {
    out.push({ key: 'rain', label: 'Heavy rain expected', detail: `${rain.toFixed(2)}"`, severity: 'warn' })
  }

  return out
}
