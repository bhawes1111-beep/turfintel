import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { csvRows, mapGreen, parseTdrCsv, polygonContains } from '../src/utils/moisture/tdrCsv.js'
import { importMoisture } from '../worker/api/moisture.js'

const greens = JSON.parse(await readFile(new URL('../public/data/crosswinds-greens.geojson', import.meta.url), 'utf8')).features

function inside(name) {
  const green = greens.find(feature => feature.properties.name === name)
  assert.ok(green, `${name} exists`)
  const ring = green.geometry.coordinates[0]
  const lon = ring.reduce((sum, point) => sum + point[0], 0) / ring.length
  const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
  if (polygonContains(ring, lat, lon)) return { lat, lon }
  for (const start of ring) {
    for (const end of ring) {
      const point = { lat: (start[1] + end[1]) / 2, lon: (start[0] + end[0]) / 2 }
      if (polygonContains(ring, point.lat, point.lon)) return point
    }
  }
  throw new Error(`Could not find an interior point in ${name}`)
}

test('CSV parsing handles quoted commas, escaped quotes, and Windows line endings', () => {
  assert.deepEqual(csvRows('"VWC, note",VWC%\r\n"dry ""hump""",19.3'), [
    ['VWC, note', 'VWC%'],
    ['dry "hump"', '19.3'],
  ])
})

test('Crosswinds polygons distinguish identical green numbers by course', () => {
  for (const name of ['Green 1', 'Par 3 Green 1', 'Practice Green']) {
    const point = inside(name)
    assert.equal(mapGreen(greens, point.lat, point.lon).name, name)
    assert.equal(mapGreen(greens, point.lat, point.lon).status, 'inside')
  }
})

test('Spectrum combined timestamp CSV maps GPS and metadata', () => {
  const point = inside('Par 3 Green 1')
  const csv = [
    'Meter: 19522',
    'Time,VWC%,Period,EC,Temp_Soil,Temp_Soil(F),Temp_IR,Temp_IR(F),Latitude,Longitude,Satellites,Fix,Rod Length,Soil Type,VWC Mode,HDoP',
    `10/31/2026 09:42:12,19.3,1.0,0.05,21,69.8,,,${point.lat},${point.lon},14,1,T,S,V,0.77`,
  ].join('\r\n')
  const parsed = parseTdrCsv(csv, '19522.csv', greens)
  assert.equal(parsed.rows[0].record.green, 'Par 3 Green 1')
  assert.equal(parsed.rows[0].record.vwc, 19.3)
  assert.equal(parsed.rows[0].record.date, '2026-10-31')
  assert.equal(parsed.rows[0].record.hdop, 0.77)
})

test('separate date and time columns work and no-fix readings require review', () => {
  const point = inside('Green 1')
  const csv = [
    'Date,Time,VWC%,Latitude,Longitude,Fix',
    `10/31/2026,09:42:12,27.1,${point.lat},${point.lon},1`,
    `10/31/2026,09:43:12,28.1,${point.lat},${point.lon},0`,
  ].join('\n')
  const parsed = parseTdrCsv(csv, '19522.csv', greens)
  assert.equal(parsed.rows[0].record.green, 'Green 1')
  assert.equal(parsed.rows[1].issue, 'No GPS fix')
  assert.equal(parsed.rows[1].record.green, '')
})

test('multiple CSV reading dates remain distinct', () => {
  const point = inside('Green 1')
  const csv = [
    'Date,Time,VWC%,Latitude,Longitude,Fix',
    `10/30/2026,09:42:12,27.1,${point.lat},${point.lon},1`,
    `10/31/2026,09:43:12,28.1,${point.lat},${point.lon},1`,
  ].join('\n')
  const parsed = parseTdrCsv(csv, '19522.csv', greens)
  assert.deepEqual(parsed.rows.map(row => row.record.date), ['2026-10-30', '2026-10-31'])
})

test('points outside mapped greens are not forced into a green', () => {
  const parsed = parseTdrCsv(
    'Time,VWC%,Latitude,Longitude\n10/31/2026 12:05:00,25.0,32.0000,-81.0000',
    '19522.csv',
    greens,
  )
  assert.equal(parsed.rows[0].status, 'outside')
  assert.equal(parsed.rows[0].record.green, '')
})

test('GPS-less readings preserve VWC without a fake map point', () => {
  const csv = 'Time,VWC%,Latitude,Longitude,Fix\n10/31/2026 09:42:12,23.1,0,0,0'
  const parsed = parseTdrCsv(csv, '35019522.CSV', greens)
  assert.equal(parsed.rows[0].issue, 'Missing/invalid GPS')
  assert.equal(parsed.rows[0].record.vwc, 23.1)
  assert.equal(parsed.rows[0].record.lat, null)
  assert.equal(parsed.rows[0].record.lng, null)
})

test('unknown CSV formats stop without guessed column mappings', () => {
  assert.throws(
    () => parseTdrCsv('Date,Moisture\n10/31/2026,20', '19522.csv', greens),
    /Could not find/,
  )
})

test('reviewed imports are course scoped and duplicate safe', async () => {
  let statements = []
  const env = {
    DB: {
      prepare(sql) {
        return { bind: (...args) => ({ sql, args }) }
      },
      async batch(next) {
        statements = next
        return next.map((statement, index) => ({
          success: true,
          meta: { changes: index === 0 ? 1 : 0 },
          statement,
        }))
      },
    },
  }
  const request = new Request('https://turfintel.test/api/moisture/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: 'course-test',
      observedBy: 'Manager',
      readings: [
        {
          clientId: 'tdr-usb:one',
          observedAt: '2026-10-31T13:00:00.000Z',
          location: 'Green 1',
          moisturePct: 19.2,
          lat: 32.1,
          lng: -81.2,
        },
        {
          clientId: 'tdr-usb:two',
          observedAt: '2026-10-31T13:01:00.000Z',
          location: 'Green 1',
          moisturePct: 20.1,
          lat: 32.1001,
          lng: -81.2001,
        },
      ],
    }),
  })

  const response = await importMoisture(env, request)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { received: 2, inserted: 1, skipped: 1 })
  assert.equal(statements.length, 2)
  assert.ok(statements.every(statement => /INSERT OR IGNORE/.test(statement.sql)))
  assert.ok(statements.every(statement => statement.args[1] === 'course-test'))
  assert.deepEqual(statements.map(statement => statement.args[8]), ['tdr-usb:one', 'tdr-usb:two'])
})

test('imports reject unassigned readings before writing', async () => {
  let batchCalled = false
  const env = {
    DB: {
      prepare() { throw new Error('prepare should not be called') },
      async batch() { batchCalled = true; return [] },
    },
  }
  const request = new Request('https://turfintel.test/api/moisture/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      readings: [{
        clientId: 'tdr-usb:unassigned',
        observedAt: '2026-10-31T13:00:00.000Z',
        location: '',
        moisturePct: 19.2,
      }],
    }),
  })

  const response = await importMoisture(env, request)
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /location is required/)
  assert.equal(batchCalled, false)
})
