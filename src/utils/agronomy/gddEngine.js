// ── Growing Degree Day engine ──────────────────────────────────────────────────
// Pure functions — no React, no side effects.
// Uses 7-day forecast high/low to compute GDD accumulation against standard
// turf application reapplication windows for fungicide, PGR, and nutrients.
// Base temp: 50°F (standard cool-season turf agronomy baseline).

const DEFAULT_BASE_F = 50

const STATUS_META = {
  early:   { label: 'Early',   color: '#3a8ad4', bg: 'rgba(58,138,212,0.10)',  border: 'rgba(58,138,212,0.28)' },
  optimal: { label: 'Optimal', color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',   border: 'rgba(74,158,74,0.28)'  },
  late:    { label: 'Late',    color: '#d4883a', bg: 'rgba(210,130,40,0.10)',  border: 'rgba(210,130,40,0.28)' },
  expired: { label: 'Expired', color: '#e07070', bg: 'rgba(220,80,80,0.10)',   border: 'rgba(220,80,80,0.28)'  },
}

// Reapplication windows (7-day GDD accumulation thresholds, °F-days)
const WINDOWS = {
  fungicide: { optimalStart: 150, optimalEnd: 250, expired: 350 },
  pgr:       { optimalStart: 100, optimalEnd: 200, expired: 280 },
  nutrient:  { optimalStart: 200, optimalEnd: 350, expired: 500 },
}

function fix1(n) {
  return parseFloat(n.toFixed(1))
}

function dayGDD(day, base) {
  if (day.high == null || day.low == null) return 0
  return Math.max(0, ((day.high + day.low) / 2) - base)
}

function getStatus(accumulated, type) {
  const w = WINDOWS[type]
  if (accumulated >= w.expired)      return 'expired'
  if (accumulated >= w.optimalEnd)   return 'late'
  if (accumulated >= w.optimalStart) return 'optimal'
  return 'early'
}

function daysToOptimal(accumulated, avgDaily, type) {
  const target = WINDOWS[type].optimalStart
  if (accumulated >= target || avgDaily <= 0) return 0
  return Math.ceil((target - accumulated) / avgDaily)
}

export function computeGDDSummary(forecast = [], baseTempF = DEFAULT_BASE_F) {
  const sevenDay    = forecast.slice(0, 7)
  const todayGDD    = fix1(dayGDD(sevenDay[0] ?? {}, baseTempF))
  const sevenDayGDD = fix1(sevenDay.reduce((s, d) => s + dayGDD(d, baseTempF), 0))
  const avgDailyGDD = sevenDay.length > 0 ? fix1(sevenDayGDD / sevenDay.length) : 0

  const makeEntry = type => ({
    status: getStatus(sevenDayGDD, type),
    daysTo: daysToOptimal(sevenDayGDD, avgDailyGDD, type),
  })

  return {
    baseTempF,
    todayGDD,
    sevenDayGDD,
    avgDailyGDD,
    statusMeta: STATUS_META,
    windows:    WINDOWS,
    fungicide:  makeEntry('fungicide'),
    pgr:        makeEntry('pgr'),
    nutrient:   makeEntry('nutrient'),
  }
}
