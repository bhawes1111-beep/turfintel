import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { csvRows, mapGreen, parseTdrCsv, polygonContains } from '../src/utils/moisture/tdrCsv.js'
import { importMoisture } from '../worker/api/moisture.js'
import { getGoogleSatelliteMap } from '../worker/api/googleMaps.js'

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
  assert.equal(parsed.rows[0].record.ec, 0.05)
  assert.equal(parsed.rows[0].record.soilTempC, 21)
  assert.equal(parsed.rows[0].record.periodUs, 1)
  assert.equal(parsed.rows[0].record.satellites, 14)
  assert.equal(parsed.rows[0].record.fix, '1')
  assert.equal(parsed.rows[0].record.rodLength, '1.5 inch')
  assert.equal(parsed.rows[0].record.soilType, 'S')
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
          bulkEc: 0.1,
          soilTempC: 22.3,
          satelliteTotal: 12,
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
  assert.equal(statements.length, 4)
  const inserts = statements.filter(statement => /INSERT OR IGNORE/.test(statement.sql))
  const backfills = statements.filter(statement => /UPDATE moisture_observations/.test(statement.sql))
  assert.equal(inserts.length, 2)
  assert.equal(backfills.length, 2)
  assert.ok(inserts.every(statement => statement.args[1] === 'course-test'))
  assert.deepEqual(inserts.map(statement => statement.args[8]), ['tdr-usb:one', 'tdr-usb:two'])
  assert.equal(inserts[0].args[13], 0.1)
  assert.equal(inserts[0].args[14], 22.3)
  assert.equal(backfills[0].args.at(-2), 'tdr-usb:one')
  assert.equal(backfills[0].args.at(-1), 'course-test')
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

test('Google satellite maps use a private configured proxy and fixed satellite parameters', async () => {
  const requestUrl = new URL('https://turfintel.test/api/maps/satellite?lat=32.129830&lng=-81.233230&zoom=20')
  const unconfigured = await getGoogleSatelliteMap({}, requestUrl)
  assert.equal(unconfigured.status, 503)

  const originalFetch = globalThis.fetch
  let upstreamUrl = ''
  globalThis.fetch = async input => {
    upstreamUrl = String(input)
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    })
  }
  try {
    const response = await getGoogleSatelliteMap({ GOOGLE_MAPS_STATIC_API_KEY: 'test-key' }, requestUrl)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    const upstream = new URL(upstreamUrl)
    assert.equal(upstream.origin, 'https://maps.googleapis.com')
    assert.equal(upstream.searchParams.get('maptype'), 'satellite')
    assert.equal(upstream.searchParams.get('size'), '640x640')
    assert.equal(upstream.searchParams.get('scale'), '2')
    assert.equal(upstream.searchParams.get('key'), 'test-key')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('TDR workspace stores diagnostics and exposes smooth interactive maps', async () => {
  const [migration, api, page, workspace, worker] = await Promise.all([
    readFile(new URL('../worker/migrations/0098_moisture_tdr_fields.sql', import.meta.url), 'utf8'),
    readFile(new URL('../worker/api/moisture.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TurfHealth/TurfHealth.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TurfHealth/MoistureWorkspace.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../worker/index.js', import.meta.url), 'utf8'),
  ])
  for (const column of [
    'bulk_ec', 'soil_temp_c', 'ir_temp_c', 'tdr_period_us', 'satellite_total',
    'gps_hdop', 'gps_fix', 'rod_length', 'soil_type', 'meter_id',
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN ${column}\\b`))
  }
  assert.match(api, /bulkEc:\s+row\.bulk_ec/)
  assert.match(api, /UPDATE moisture_observations SET[\s\S]*bulk_ec = COALESCE/)
  assert.match(page, /'Moisture',\s*'TDR',\s*'Import CSV',\s*'Nutrients'/)
  assert.match(page, /activeTab === 'TDR'[\s\S]*<TdrWorkspace/)
  assert.match(page, /activeTab === 'Import CSV'[\s\S]*<TdrCsvImportWorkspace/)
  assert.match(workspace, /function smoothClosedPath/)
  assert.match(workspace, /<path d=\{outline\} className=\{satellite\.url \? styles\.greenShapeSatellite : styles\.greenShape\}/)
  assert.match(workspace, /role="button"[\s\S]*setSelectedReadingKey/)
  assert.match(workspace, /function ReadingDetails/)
  assert.match(workspace, /id: 'bulkEc'/)
  assert.match(workspace, /id: 'soilTempC'/)
  assert.match(workspace, /Approved rows populate both tabs/)
  assert.match(workspace, /onClick=\{onOpenMoisture\}>Open Moisture/)
  assert.match(workspace, /onClick=\{onOpenTdr\}>Open TDR/)
  assert.match(workspace, /function mercatorPoint/)
  assert.match(workspace, /<image href=\{satellite\.url\}/)
  assert.match(worker, /pathname === '\/api\/maps\/satellite'/)
})
