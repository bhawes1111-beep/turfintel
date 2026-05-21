// Irrigation Intelligence Foundation — water-balance calculations.
//
// Pure, explainable arithmetic over the daily_water_balance rows fetched
// from /api/water-balance (newest-first). No agronomic modeling, no fake
// precision — every output traces directly to summed daily net values.
//
//   net_in (per day) = rainfall_in - et_in   (+ surplus, - deficit)
//   rolling N-day balance = sum of net_in over the trailing N days
//
// A negative rolling balance is a cumulative DEFICIT (turf lost more water
// than rain replaced); positive is a surplus.

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Sum net_in over the most recent `days` daily rows. Rows missing net_in
// (e.g. ET unknown) are skipped and counted so the UI can flag partial data.
function rollingBalance(rows, days) {
  const window = rows.slice(0, days)
  let sum = 0
  let counted = 0
  for (const r of window) {
    const net = num(r.netIn)
    if (net == null) continue
    sum += net
    counted += 1
  }
  return {
    days,
    balanceIn: parseFloat(sum.toFixed(2)),   // negative = deficit
    deficitIn: sum < 0 ? parseFloat((-sum).toFixed(2)) : 0,
    daysCounted: counted,
    partial: counted < window.length,        // some days lacked ET/net
  }
}

/**
 * computeWaterBalance(rows)
 *   rows — daily_water_balance objects (newest first):
 *          { date, etIn, etSource, rainfallIn, netIn }
 *
 * Returns:
 *   { today, rolling: { d3, d7, d14 }, trend, hasData }
 *     today  — most recent day { date, etIn, etSource, rainfallIn, netIn }
 *     rolling — { d3, d7, d14 } each { days, balanceIn, deficitIn, partial }
 *     trend  — 'drying' | 'wetting' | 'steady' | 'unknown' (3-day net sign)
 */
export function computeWaterBalance(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { hasData: false, today: null, rolling: null, trend: 'unknown' }
  }
  const today = rows[0]
  const rolling = {
    d3:  rollingBalance(rows, 3),
    d7:  rollingBalance(rows, 7),
    d14: rollingBalance(rows, 14),
  }

  // Drying trend: the 3-day rolling balance direction.
  let trend = 'unknown'
  const b3 = rolling.d3.balanceIn
  if (rolling.d3.daysCounted > 0) {
    if (b3 <= -0.15)      trend = 'drying'
    else if (b3 >=  0.15) trend = 'wetting'
    else                  trend = 'steady'
  }

  return { hasData: true, today, rolling, trend }
}

// Severity for a rolling deficit, for card coloring (inches of cumulative
// deficit). Thresholds are conservative + explainable, not agronomic dogma.
export function deficitSeverity(deficitIn) {
  if (deficitIn == null || deficitIn <= 0)   return 'good'
  if (deficitIn < 0.5)                        return 'info'
  if (deficitIn < 1.0)                        return 'caution'
  if (deficitIn < 1.75)                       return 'warning'
  return 'critical'
}

// Extract a simple numeric series (newest-last) for a lightweight chart.
//   metric: 'etIn' | 'rainfallIn' | 'netIn'
export function balanceSeries(rows, metric, days = 14) {
  const window = (rows ?? []).slice(0, days).reverse()  // oldest → newest
  return window.map(r => ({
    date:  r.date,
    value: num(r[metric]) ?? 0,
  }))
}
