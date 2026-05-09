// ── Chemical application effectiveness evaluator ──────────────────────────────
// Scores current and near-term conditions for spray quality across 5 factors
// (20 pts each, 100 pt maximum). Pure functions — no React, no side effects.

function scoreWind(mph) {
  if (mph <= 3)  return { pts: 20, note: 'Calm winds — ideal drift control' }
  if (mph <= 7)  return { pts: 16, note: 'Light breeze — acceptable conditions' }
  if (mph <= 10) return { pts: 10, note: 'Moderate wind — marginal drift risk' }
  if (mph <= 15) return { pts:  4, note: 'High wind — significant drift risk' }
  return         { pts:  0, note: 'Excessive wind — unsafe for application' }
}

function scoreHumidity(pct) {
  if (pct >= 40 && pct <= 85) return { pts: 20, note: 'Ideal humidity range for uptake' }
  if (pct < 30)               return { pts:  8, note: 'Very low humidity — rapid evaporation' }
  if (pct < 40)               return { pts: 14, note: 'Low humidity — faster leaf drying' }
  if (pct < 92)               return { pts: 12, note: 'Elevated humidity — slower drying' }
  return                      { pts:  5, note: 'High humidity — leaf wetness risk' }
}

function scoreTemp(f) {
  if (f >= 55 && f < 85) return { pts: 20, note: 'Temperature optimal for uptake and stability' }
  if (f < 45)            return { pts:  6, note: 'Cold — foliar uptake significantly reduced' }
  if (f < 55)            return { pts: 14, note: 'Cool — reduced foliar uptake rate' }
  if (f < 92)            return { pts: 12, note: 'Warm — watch for increased volatility' }
  return                 { pts:  4, note: 'High heat — volatility risk, avoid midday spray' }
}

function scoreRain(inches) {
  if (inches <= 0)    return { pts: 20, note: 'No rain expected — full dry window' }
  if (inches <= 0.1)  return { pts: 15, note: 'Minimal rain forecast — monitor closely' }
  if (inches <= 0.25) return { pts:  7, note: 'Light rain expected — reduced effectiveness' }
  return              { pts:  0, note: 'Significant rain forecast — wash-off risk' }
}

function scoreDewSpread(tempF, dewPointF) {
  const spread = tempF - dewPointF
  if (spread >= 15) return { pts: 20, note: 'Low dew risk — good drying conditions' }
  if (spread >= 10) return { pts: 16, note: 'Moderate dew risk — monitor leaf wetness' }
  if (spread >= 5)  return { pts:  9, note: 'Elevated dew risk — leaf wetness likely' }
  if (spread >= 0)  return { pts:  4, note: 'Near-dew conditions — extended leaf wetness' }
  return            { pts:  0, note: 'Active dew or condensation present' }
}

function toRating(score) {
  if (score >= 85) return { label: 'Excellent', color: '#4ecb4e', bg: 'rgba(74,158,74,0.10)',   border: 'rgba(74,158,74,0.28)'  }
  if (score >= 65) return { label: 'Good',      color: '#82c882', bg: 'rgba(74,158,74,0.07)',   border: 'rgba(74,158,74,0.20)'  }
  if (score >= 40) return { label: 'Marginal',  color: '#d4883a', bg: 'rgba(210,130,40,0.10)',  border: 'rgba(210,130,40,0.28)' }
  return           { label: 'Poor',      color: '#e07070', bg: 'rgba(220,80,80,0.10)',   border: 'rgba(220,80,80,0.28)'  }
}

export function computeApplicationEffectiveness(current, forecast = []) {
  if (!current) return null

  const {
    wind        = 0,
    humidity    = 65,
    currentTemp = 72,
    dewPoint    = 55,
  } = current

  const rain24h = forecast[0]?.rainfall ?? 0

  const windResult = scoreWind(wind)
  const humResult  = scoreHumidity(humidity)
  const tempResult = scoreTemp(currentTemp)
  const rainResult = scoreRain(rain24h)
  const dewResult  = scoreDewSpread(currentTemp, dewPoint)

  const totalPts = windResult.pts + humResult.pts + tempResult.pts + rainResult.pts + dewResult.pts
  const score    = Math.round((totalPts / 100) * 100)
  const rating   = toRating(score)

  const factors = [
    { label: 'Wind',     pts: windResult.pts, max: 20, note: windResult.note },
    { label: 'Humidity', pts: humResult.pts,  max: 20, note: humResult.note  },
    { label: 'Temp',     pts: tempResult.pts, max: 20, note: tempResult.note },
    { label: 'Rain',     pts: rainResult.pts, max: 20, note: rainResult.note },
    { label: 'Dew',      pts: dewResult.pts,  max: 20, note: dewResult.note  },
  ]

  const positives = factors.filter(f => f.pts >= f.max * 0.75).map(f => f.note)
  const negatives = factors.filter(f => f.pts <  f.max * 0.5).map(f => f.note)

  return { score, rating, factors, positives, negatives }
}
