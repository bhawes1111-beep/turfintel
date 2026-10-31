const MAX_FILE_CHARS = 16_000_000
const MAX_ROWS = 60_000
const NEARBY_GREEN_METERS = 12

export function csvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some(value => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('CSV contains an unfinished quoted field.')
  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  return rows
}

const canon = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = {
  stamp: ['datetime', 'dateandtime', 'timestamp', 'time', 'readingtime'],
  date: ['date', 'readingdate'],
  time: ['clock', 'timeofday', 'readingclock'],
  vwc: ['vwc', 'vwcpercent', 'vwcpercentage', 'moisture', 'moisturepercent', 'soilmoisture'],
  lat: ['latitude', 'lat', 'gpslatitude'],
  lon: ['longitude', 'lon', 'long', 'gpslongitude'],
  ec: ['ec', 'electricalconductivity', 'ecmscm'],
  temp: ['tempsoil', 'soiltemp', 'soiltemperature', 'tempsoilc'],
  satellites: ['satellites', 'sats', 'satellitecount'],
  fix: ['fix', 'gpsfix', 'gnssfix', 'fixstatus'],
  hdop: ['hdop', 'horizontalprecision'],
  rod: ['rodlength', 'rods', 'rodlenght'],
}

function columns(row) {
  const normalized = row.map(canon)
  const result = {}
  for (const [name, names] of Object.entries(aliases)) {
    const index = normalized.findIndex(value => names.includes(value))
    if (index !== -1) result[name] = index
  }
  return result
}

function pick(row, positions, name) {
  return positions[name] === undefined ? '' : String(row[positions[name]] ?? '').trim()
}

function numeric(value) {
  const raw = String(value ?? '').trim().replace(/%$/, '')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function readingDate(value) {
  const raw = String(value || '').trim()
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]*(.*)$/)
  let year
  let month
  let day
  let time

  if (match) {
    year = match[1]
    month = match[2]
    day = match[3]
    time = match[4]
  } else {
    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s*(.*)$/)
    if (!match) return null
    month = match[1]
    day = match[2]
    year = match[3]
    time = match[4]
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`
  }

  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  const test = new Date(numericYear, numericMonth - 1, numericDay)
  if (
    numericYear < 2000 || numericYear > 2100
    || test.getFullYear() !== numericYear
    || test.getMonth() + 1 !== numericMonth
    || test.getDate() !== numericDay
  ) return null

  const clock = String(time || '').trim()
  if (clock && !/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i.test(clock)) return null
  return {
    date: `${String(numericYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`,
    time: clock || '00:00:00',
  }
}

export function polygonContains(ring, lat, lon) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    if (
      (currentPoint[1] > lat) !== (previousPoint[1] > lat)
      && lon < ((previousPoint[0] - currentPoint[0]) * (lat - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]
    ) inside = !inside
  }
  return inside
}

function distanceToRing(ring, lat, lon) {
  const eastScale = 111_320 * Math.cos(lat * Math.PI / 180)
  const northScale = 111_320
  let best = Infinity

  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    const x = (lon - start[0]) * eastScale
    const y = (lat - start[1]) * northScale
    const dx = (end[0] - start[0]) * eastScale
    const dy = (end[1] - start[1]) * northScale
    const ratio = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - ratio * dx, y - ratio * dy))
  }
  return best
}

export function mapGreen(features, lat, lon) {
  let nearest = null
  let distance = Infinity
  for (const feature of features) {
    const ring = feature.geometry?.coordinates?.[0]
    const name = feature.properties?.name
    if (!ring || !name || ring.length < 4) continue
    if (polygonContains(ring, lat, lon)) return { name, status: 'inside', distanceM: 0 }
    const meters = distanceToRing(ring, lat, lon)
    if (meters < distance) {
      nearest = name
      distance = meters
    }
  }
  return {
    name: nearest,
    status: distance <= NEARBY_GREEN_METERS ? 'nearby' : 'outside',
    distanceM: distance,
  }
}

export function parseTdrCsv(text, filename, features) {
  if (String(text).length > MAX_FILE_CHARS) {
    throw new Error('This file exceeds 16 MB. Export a smaller CSV.')
  }
  const rawRows = csvRows(text)
  if (!rawRows.length) throw new Error('The CSV contains no readings.')

  let headerIndex = -1
  let positions = null
  for (let index = 0; index < Math.min(rawRows.length, 25); index += 1) {
    const candidate = columns(rawRows[index])
    if (
      candidate.vwc !== undefined
      && candidate.lat !== undefined
      && candidate.lon !== undefined
      && (candidate.stamp !== undefined || candidate.date !== undefined)
    ) {
      headerIndex = index
      positions = candidate
      break
    }
  }
  if (headerIndex < 0) {
    throw new Error('Could not find the TDR date, VWC, latitude, and longitude columns.')
  }

  const numericParts = String(filename).match(/\d{4,}/g)
  const meterId = numericParts?.at(-1) || String(filename).replace(/\.csv$/i, '').slice(0, 40) || 'unknown'
  const rows = []

  for (let index = headerIndex + 1; index < rawRows.length; index += 1) {
    if (rows.length >= MAX_ROWS) throw new Error('More than 60,000 readings detected. Split this CSV before importing.')
    const data = rawRows[index]
    if (canon(pick(data, positions, 'vwc')) === 'vwc') continue

    const rawTime = pick(data, positions, 'stamp')
    const stamp = readingDate(rawTime)
      || readingDate(`${pick(data, positions, 'date')} ${rawTime || pick(data, positions, 'time')}`)
    const vwc = numeric(pick(data, positions, 'vwc'))
    const lat = numeric(pick(data, positions, 'lat'))
    const lng = numeric(pick(data, positions, 'lon'))
    const fix = pick(data, positions, 'fix')
    const ec = numeric(pick(data, positions, 'ec'))
    const satellites = numeric(pick(data, positions, 'satellites'))
    const hdop = numeric(pick(data, positions, 'hdop'))
    const soilTempC = numeric(pick(data, positions, 'temp'))
    const rod = pick(data, positions, 'rod')
    const gpsValid = lat !== null && lng !== null
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      && !(lat === 0 && lng === 0)
      && !(fix !== '' && Number(fix) === 0)

    let issue = ''
    if (!stamp) issue = 'Invalid date/time'
    else if (vwc === null || vwc < 0 || vwc > 100) issue = 'Invalid moisture value'
    else if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) issue = 'Missing/invalid GPS'
    else if (fix !== '' && Number(fix) === 0) issue = 'No GPS fix'

    const match = issue ? null : mapGreen(features, lat, lng)
    const green = match?.status === 'inside' ? match.name : ''
    const depth = /^(t|turf)$/i.test(rod) ? '1.5 inch' : rod || 'TDR 350'
    const noteParts = [`TDR ${meterId} USB import`]
    if (ec !== null) noteParts.push(`EC ${ec}`)
    if (soilTempC !== null) noteParts.push(`soil ${soilTempC} C`)
    if (satellites !== null) noteParts.push(`${satellites} satellites`)
    if (hdop !== null) noteParts.push(`HDOP ${hdop}`)

    const record = stamp && vwc !== null ? {
      date: stamp.date,
      time: stamp.time,
      green,
      vwc,
      lat: gpsValid ? lat : null,
      lng: gpsValid ? lng : null,
      notes: `${noteParts.join(' · ')} · depth ${depth}`,
      meterId,
      fix,
      satellites,
      hdop,
      ec,
      soilTempC,
      importKey: [meterId, stamp.date, stamp.time, vwc.toFixed(2), lat, lng].join('|'),
    } : null

    rows.push({
      line: index + 1,
      record,
      issue,
      suggestion: match?.name || '',
      status: match?.status || 'invalid',
      distanceM: match?.distanceM ?? null,
    })
  }

  return { rows, meterId, headerLine: headerIndex + 1 }
}

export function localTimestamp(date, time) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] || 0)
  const meridiem = match[4]?.toUpperCase()
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  const value = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}
