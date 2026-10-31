export const SIX_ZONE_COLORS = [
  '#d44c47',
  '#ef8f3c',
  '#d5b84b',
  '#5aa45f',
  '#4387cc',
  '#7c61c9',
]

export const MOISTURE_ZONE_LABELS = ['Very dry', 'Dry', 'Below target', 'Target', 'Wet', 'Very wet']
export const TDR_ZONE_LABELS = ['Very low', 'Low', 'Mid-low', 'Mid-high', 'High', 'Very high']

export const DEFAULT_MOISTURE_DISPLAY_SETTINGS = {
  moisture: {
    points: [18, 21, 23, 25, 28, 32],
    colors: [...SIX_ZONE_COLORS],
  },
  tdr: {
    bulkEc: { points: [.1, .2, .3, .4, .5, .6], colors: [...SIX_ZONE_COLORS] },
    soilTempC: { points: [55, 65, 72, 76, 80, 90], colors: [...SIX_ZONE_COLORS] },
    irTempC: { points: [60, 75, 82, 86, 90, 100], colors: [...SIX_ZONE_COLORS] },
    periodUs: { points: [1800, 2200, 2500, 2650, 2800, 3200], colors: [...SIX_ZONE_COLORS] },
    satelliteTotal: { points: [5, 8, 10, 12, 14, 16], colors: [...SIX_ZONE_COLORS] },
    gpsHdop: {
      points: [1, 1.5, 2, 2.5, 3, 5],
      colors: ['#5aa45f', '#7dbb63', '#a9c85f', '#d5b84b', '#ef8f3c', '#d44c47'],
    },
  },
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function cloneScale(scale) {
  return { points: [...scale.points], colors: [...scale.colors] }
}

function validPoints(candidatePoints, expectedLength) {
  return candidatePoints.length === expectedLength
    && candidatePoints.every(Number.isFinite)
    && candidatePoints.every((point, index) => index === 0 || point > candidatePoints[index - 1])
}

function normalizedColor(color, fallback) {
  return COLOR_PATTERN.test(color) ? color.toLowerCase() : fallback
}

export function normalizeSixPointScale(value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const candidatePoints = Array.isArray(source.points)
    ? source.points.map(Number)
    : []
  if (validPoints(candidatePoints, 6)) {
    return {
      points: candidatePoints,
      colors: Array.from({ length: 6 }, (_, index) => normalizedColor(source.colors?.[index], fallback.colors[index])),
    }
  }
  if (validPoints(candidatePoints, 5)) {
    const oldFallbackColors = [fallback.colors[0], fallback.colors[1], fallback.colors[3], fallback.colors[4], fallback.colors[5]]
    const oldColors = Array.from({ length: 5 }, (_, index) => normalizedColor(source.colors?.[index], oldFallbackColors[index]))
    return {
      points: [
        candidatePoints[0],
        candidatePoints[1],
        (candidatePoints[1] + candidatePoints[2]) / 2,
        candidatePoints[2],
        candidatePoints[3],
        candidatePoints[4],
      ],
      colors: [oldColors[0], oldColors[1], fallback.colors[2], oldColors[2], oldColors[3], oldColors[4]],
    }
  }
  return cloneScale(fallback)
}

function legacyMoistureScale(source) {
  const dryBelow = Number(source?.dryBelow)
  const wetAbove = Number(source?.wetAbove)
  if (!Number.isFinite(dryBelow) || !Number.isFinite(wetAbove) || dryBelow >= wetAbove) return null
  const span = Math.max(1, (wetAbove - dryBelow) / 2)
  return {
    points: [dryBelow - span, dryBelow, (dryBelow + wetAbove) / 2, wetAbove, wetAbove + span],
    colors: [
      SIX_ZONE_COLORS[0],
      COLOR_PATTERN.test(source.dryColor) ? source.dryColor : SIX_ZONE_COLORS[1],
      COLOR_PATTERN.test(source.targetColor) ? source.targetColor : SIX_ZONE_COLORS[3],
      COLOR_PATTERN.test(source.wetColor) ? source.wetColor : SIX_ZONE_COLORS[4],
      SIX_ZONE_COLORS[5],
    ],
  }
}

export function normalizeMoistureDisplaySettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  const legacy = !source.moisture ? legacyMoistureScale(source) : null
  const tdr = {}
  for (const [metricId, fallback] of Object.entries(DEFAULT_MOISTURE_DISPLAY_SETTINGS.tdr)) {
    tdr[metricId] = normalizeSixPointScale(source.tdr?.[metricId], fallback)
  }
  return {
    moisture: normalizeSixPointScale(source.moisture ?? legacy, DEFAULT_MOISTURE_DISPLAY_SETTINGS.moisture),
    tdr,
  }
}

export function colorForSixPointValue(value, scale) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return scale.colors[Math.floor(scale.colors.length / 2)]
  let nearestIndex = 0
  let nearestDistance = Math.abs(numeric - scale.points[0])
  for (let index = 1; index < scale.points.length; index += 1) {
    const distance = Math.abs(numeric - scale.points[index])
    if (distance >= nearestDistance) continue
    nearestDistance = distance
    nearestIndex = index
  }
  return scale.colors[nearestIndex]
}

export function cloneDefaultMoistureDisplaySettings() {
  return {
    moisture: cloneScale(DEFAULT_MOISTURE_DISPLAY_SETTINGS.moisture),
    tdr: Object.fromEntries(Object.entries(DEFAULT_MOISTURE_DISPLAY_SETTINGS.tdr).map(([id, scale]) => [id, cloneScale(scale)])),
  }
}
