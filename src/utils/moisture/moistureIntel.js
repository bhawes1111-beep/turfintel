// Moisture + Handwatering Intelligence — priority + trend logic.
//
// Pure, explainable rules over field observations + the weather/water-balance
// context. No ML, no invented precision: every output traces to observed
// flags + a documented threshold. Where there's no observation for an area,
// it's "no data" — never a guess.
//
// Inputs:
//   observations — moisture rows, newest first:
//     { id, observedAt, location, hole, moisturePct,
//       wiltStress, drySpot, handwaterRec, syringeRec }
//   waterBalance — output of computeWaterBalance() (rolling deficit + trend)
//
// Outputs:
//   { byLocation: [{ location, hole, priority, latest, why }],
//     trend, driest: [...], hasData }

const RECENT_HOURS = 24   // observations within this window drive "current" priority

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function hoursAgo(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return Infinity
  return (Date.now() - ms) / 3_600_000
}

// Priority ranking for sorting (lower = more urgent).
const PRIORITY_RANK = { 'High Priority': 0, Monitor: 1, Recovering: 2, Stable: 3 }

/**
 * Classify one location from its recent observations + weather context.
 *
 * Rules (explainable):
 *   - High Priority: a recent observation flags handwater OR (wilt + dry-spot),
 *     OR a recent wilt/dry-spot flag while the course is in a drying deficit.
 *   - Monitor: a recent single stress flag, OR a drying deficit with no flags.
 *   - Recovering: recent flags but the course is now wetting/surplus (rain came).
 *   - Stable: recent observation, no stress flags, no drying deficit.
 */
function classifyLocation(latest, recentFlagged, weatherTrend, inDeficit) {
  const wilt = latest.wiltStress
  const dry  = latest.drySpot
  const hand = latest.handwaterRec
  const anyFlag = wilt || dry || hand || latest.syringeRec

  if (hand || (wilt && dry)) {
    return { priority: 'High Priority', why: hand ? 'handwater flagged in the field' : 'wilt + dry spot observed' }
  }
  if ((wilt || dry) && inDeficit) {
    return { priority: 'High Priority', why: `${wilt ? 'wilt' : 'dry spot'} observed during a drying deficit` }
  }
  if (anyFlag && weatherTrend === 'wetting') {
    return { priority: 'Recovering', why: 'recent stress flag, but rainfall is replenishing' }
  }
  if (wilt || dry) {
    return { priority: 'Monitor', why: `${wilt ? 'wilt' : 'dry spot'} observed` }
  }
  if (inDeficit && recentFlagged) {
    return { priority: 'Monitor', why: 'drying deficit with prior stress here' }
  }
  if (inDeficit) {
    return { priority: 'Monitor', why: 'course-wide drying deficit' }
  }
  return { priority: 'Stable', why: 'no stress flags, no drying deficit' }
}

export function computeMoistureIntel(observations, waterBalance = null) {
  const obs = Array.isArray(observations) ? observations : []
  if (obs.length === 0) {
    return { hasData: false, byLocation: [], driest: [], trend: 'unknown' }
  }

  const weatherTrend = waterBalance?.trend ?? 'unknown'
  // "In deficit" = a meaningful negative 7-day rolling balance.
  const inDeficit = (waterBalance?.rolling?.d7?.balanceIn ?? 0) <= -0.5

  // Group by location, keeping the newest observation + whether any recent
  // observation here carried a stress flag.
  const groups = new Map()
  for (const o of obs) {
    const loc = o.location
    if (!loc) continue
    if (!groups.has(loc)) groups.set(loc, { latest: o, recentFlagged: false, hole: o.hole })
    const g = groups.get(loc)
    // obs are newest-first, so the first seen per loc is the latest.
    const recent = hoursAgo(o.observedAt) <= RECENT_HOURS * 3
    if (recent && (o.wiltStress || o.drySpot || o.handwaterRec)) g.recentFlagged = true
  }

  const byLocation = []
  for (const [location, g] of groups) {
    const latest = g.latest
    const isRecent = hoursAgo(latest.observedAt) <= RECENT_HOURS
    // Stale-only data → Monitor at most, never High (don't act on old reads).
    const cls = classifyLocation(latest, g.recentFlagged, weatherTrend, inDeficit)
    const priority = !isRecent && cls.priority === 'High Priority' ? 'Monitor' : cls.priority
    byLocation.push({
      location,
      hole:        g.hole ?? latest.hole ?? null,
      priority,
      latest,
      moisturePct: num(latest.moisturePct),
      observedAt:  latest.observedAt,
      stale:       !isRecent,
      why:         !isRecent ? `${cls.why} (last read >${RECENT_HOURS}h ago)` : cls.why,
    })
  }

  byLocation.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    if (pr !== 0) return pr
    return (b.observedAt ?? '').localeCompare(a.observedAt ?? '')
  })

  // Driest = locations with a measured moisture_pct, lowest first.
  const driest = byLocation
    .filter(l => l.moisturePct != null)
    .sort((a, b) => a.moisturePct - b.moisturePct)
    .slice(0, 5)

  // Overall trend: blend observation flags with the weather trend.
  const anyHigh = byLocation.some(l => l.priority === 'High Priority')
  let trend
  if (anyHigh)                          trend = 'localized stress increasing'
  else if (weatherTrend === 'drying')   trend = 'drying'
  else if (weatherTrend === 'wetting')  trend = 'recovering moisture'
  else                                  trend = 'stable moisture'

  return { hasData: true, byLocation, driest, trend }
}

// Weather-derived syringe AWARENESS (not a promise of precision). Reuses the
// same signals as computeWiltRisk: heat, wind, low humidity, drying trend.
// Returns a short list of operational "potential" notes from `current`.
export function syringeAwareness(current, waterBalance = null) {
  const notes = []
  if (!current) return notes
  const temp = num(current.currentTemp)
  const rh   = num(current.humidity)
  const wind = num(current.wind)

  if (temp != null && temp >= 85) notes.push({ key: 'heat', text: 'High afternoon stress potential', detail: `${Math.round(temp)}°F` })
  if (wind != null && wind >= 12)  notes.push({ key: 'wind', text: 'Windy drying conditions', detail: `${Math.round(wind)} mph` })
  if (rh != null && rh <= 35)      notes.push({ key: 'rh',   text: 'Low humidity — elevated canopy stress', detail: `${Math.round(rh)}% RH` })
  if ((waterBalance?.trend) === 'drying') notes.push({ key: 'deficit', text: 'Low overnight recovery (drying deficit)', detail: null })

  return notes
}
