export const FIVE_ZONE_COLORS = [
  '#d44c47',
  '#ef8f3c',
  '#5aa45f',
  '#4387cc',
  '#7c61c9',
]

export const MOISTURE_ZONE_LABELS = ['Very dry', 'Dry', 'Target', 'Wet', 'Very wet']
export const TDR_ZONE_LABELS = ['Very low', 'Low', 'Middle', 'High', 'Very high']

export const DEFAULT_MOISTURE_DISPLAY_SETTINGS = {
  moisture: {
    points: [18, 22, 25, 28, 32],
    colors: [...FIVE_ZONE_COLORS],
  },
  tdr: {
    bulkEc: { points: [.1, .2, .3, .4, .6], colors: [...FIVE_ZONE_COLORS] },
    soilTempC: { points: [55, 65, 72, 80, 90], colors: [...FIVE_ZONE_COLORS] },
    irTempC: { points: [60, 75, 82, 90, 100], colors: [...FIVE_ZONE_COLORS] },
    periodUs: { points: [1800, 2200, 2500, 2800, 3200], colors: [...FIVE_ZONE_COLORS] },
    satelliteTotal: { points: [5, 8, 10, 12, 16], colors: [...FIVE_ZONE_COLORS] },
    gpsHdop: {
      points: [1, 2, 2.5, 3, 5],
      colors: ['#5aa45f', '#7dbb63', '#d5b84b', '#ef8f3c', '#d44c47'],
    },
  },
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function cloneScale(scale) {
  return { points: [...scale.points], colors: [...scale.colors] }
}

export function normalizeFivePointScale(value, fallback) {
  const source = value && typeof value === 'object' ? value : {}
  const candidatePoints = Array.isArray(source.points)
    ? source.points.map(Number)
    : []
  const validPoints = candidatePoints.length === 5
    && candidatePoints.every(Number.isFinite)
    && candidatePoints.every((point, index) => index === 0 || point > candidatePoints[index - 1])
  const points = validPoints ? candidatePoints : [...fallback.points]
  const colors = Array.from({ length: 5 }, (_, index) => {
    const color = source.colors?.[index]
    return COLOR_PATTERN.test(color) ? color.toLowerCase() : fallback.colors[index]
  })
  return { points, colors }
}

function legacyMoistureScale(source) {
  const dryBelow = Number(source?.dryBelow)
  const wetAbove = Number(source?.wetAbove)
  if (!Number.isFinite(dryBelow) || !Number.isFinite(wetAbove) || dryBelow >= wetAbove) return null
  const span = Math.max(1, (wetAbove - dryBelow) / 2)
  return {
    points: [dryBelow - span, dryBelow, (dryBelow + wetAbove) / 2, wetAbove, wetAbove + span],
    colors: [
      FIVE_ZONE_COLORS[0],
      COLOR_PATTERN.test(source.dryColor) ? source.dryColor : FIVE_ZONE_COLORS[1],
      COLOR_PATTERN.test(source.targetColor) ? source.targetColor : FIVE_ZONE_COLORS[2],
      COLOR_PATTERN.test(source.wetColor) ? source.wetColor : FIVE_ZONE_COLORS[3],
      FIVE_ZONE_COLORS[4],
    ],
  }
}

export function normalizeMoistureDisplaySettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  const legacy = !source.moisture ? legacyMoistureScale(source) : null
  const tdr = {}
  for (const [metricId, fallback] of Object.entries(DEFAULT_MOISTURE_DISPLAY_SETTINGS.tdr)) {
    tdr[metricId] = normalizeFivePointScale(source.tdr?.[metricId], fallback)
  }
  return {
    moisture: normalizeFivePointScale(source.moisture ?? legacy, DEFAULT_MOISTURE_DISPLAY_SETTINGS.moisture),
    tdr,
  }
}

export function colorForFivePointValue(value, scale) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return scale.colors[2]
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
