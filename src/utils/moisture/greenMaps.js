const MAP_LOGICAL_SIZE = 640
const MAP_TILE_SIZE = 256

export function mercatorPoint(lat, lng) {
  const boundedLat = Math.max(-85, Math.min(85, Number(lat)))
  const sin = Math.sin(boundedLat * Math.PI / 180)
  return {
    x: (Number(lng) + 180) / 360,
    y: .5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  }
}

function mercatorLatitude(y) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI
}

export function buildGreenProjection(ring) {
  if (!ring?.length) return null
  const first = ring[0]
  const last = ring.at(-1)
  const source = ring.length > 3 && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring
  const points = source.map(point => mercatorPoint(point[1], point[0]))
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const span = Math.max(maxX - minX, maxY - minY, Number.EPSILON)
  // Keep each green at a consistent scale. Fractional zoom avoids wasting
  // imagery resolution when the next whole zoom level would clip the outline.
  const zoom = Math.max(17, Math.min(22.5, Math.log2((MAP_LOGICAL_SIZE * .82) / (MAP_TILE_SIZE * span))))
  const viewScale = (MAP_TILE_SIZE * (2 ** zoom) / MAP_LOGICAL_SIZE) * 100
  const project = (lat, lng) => {
    const point = mercatorPoint(lat, lng)
    return {
      x: 50 + (point.x - centerX) * viewScale,
      y: 50 + (point.y - centerY) * viewScale,
    }
  }
  project.center = {
    lat: mercatorLatitude(centerY),
    lng: centerX * 360 - 180,
  }
  project.zoom = zoom
  return project
}

export function greenAerialFilename(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}.jpg` : ''
}

export const GREEN_AERIAL_VERSION = 'noaa-coastal-ga-2012-v2'

export function greenCourseDetails(name) {
  let match = /^Green\s+(\d+)$/i.exec(name)
  if (match) {
    return { id: 'championship', label: 'Championship Course', number: Number(match[1]), optionLabel: `Green ${Number(match[1])}` }
  }

  match = /^Par\s*3\s+Green\s+(\d+)$/i.exec(name)
  if (match) {
    return { id: 'par3', label: 'Par 3 Course', number: Number(match[1]), optionLabel: `Green ${Number(match[1])}` }
  }

  const practiceOrder = name === 'Practice Green' ? 1 : name === 'Small Practice Green' ? 2 : 99
  if (practiceOrder < 99) {
    return { id: 'practice', label: 'Practice Greens', number: practiceOrder, optionLabel: name }
  }

  return { id: 'other', label: 'Other Areas', number: Number.MAX_SAFE_INTEGER, optionLabel: name }
}

const COURSE_ORDER = new Map([
  ['championship', 0],
  ['par3', 1],
  ['practice', 2],
  ['other', 3],
])

export function compareGreenNames(left, right) {
  const leftDetails = greenCourseDetails(left)
  const rightDetails = greenCourseDetails(right)
  const courseDifference = COURSE_ORDER.get(leftDetails.id) - COURSE_ORDER.get(rightDetails.id)
  if (courseDifference) return courseDifference
  if (leftDetails.number !== rightDetails.number) return leftDetails.number - rightDetails.number
  return String(left).localeCompare(String(right), undefined, { numeric: true })
}

export function groupGreenNames(names) {
  const groups = new Map()
  for (const name of [...new Set(names.filter(Boolean))].sort(compareGreenNames)) {
    const details = greenCourseDetails(name)
    const group = groups.get(details.id) ?? { id: details.id, label: details.label, options: [] }
    group.options.push({ value: name, label: details.optionLabel })
    groups.set(details.id, group)
  }
  return [...groups.values()].sort((left, right) => COURSE_ORDER.get(left.id) - COURSE_ORDER.get(right.id))
}

export const GREEN_MAP_LOGICAL_SIZE = MAP_LOGICAL_SIZE
export const GREEN_MAP_TILE_SIZE = MAP_TILE_SIZE
