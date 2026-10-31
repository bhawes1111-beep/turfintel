import { badRequest, json } from '../lib/json.js'

const USGS_IMAGERY_URL = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage'
const FETCH_TIMEOUT_MS = 12000
const IMAGE_SIZE = 640
const TILE_SIZE = 256
const WEB_MERCATOR_HALF_WORLD_METERS = 20037508.342789244

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function webMercatorCenter(lat, lng) {
  const latitudeRadians = lat * Math.PI / 180
  return {
    x: lng * WEB_MERCATOR_HALF_WORLD_METERS / 180,
    y: WEB_MERCATOR_HALF_WORLD_METERS
      * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
      / Math.PI,
  }
}

function imageryBounds(lat, lng, zoom) {
  const center = webMercatorCenter(lat, lng)
  const worldWidth = WEB_MERCATOR_HALF_WORLD_METERS * 2
  const viewportWidth = (worldWidth / (2 ** zoom)) * (IMAGE_SIZE / TILE_SIZE)
  const halfViewport = viewportWidth / 2
  return [
    center.x - halfViewport,
    center.y - halfViewport,
    center.x + halfViewport,
    center.y + halfViewport,
  ]
}

export async function getUsgsAerialMap(url) {
  const lat = finiteNumber(url.searchParams.get('lat'))
  const lng = finiteNumber(url.searchParams.get('lng'))
  const zoomValue = finiteNumber(url.searchParams.get('zoom'))
  const zoom = zoomValue === null ? null : Math.round(zoomValue)

  if (lat === null || lat < -85 || lat > 85) return badRequest('Valid latitude required')
  if (lng === null || lng < -180 || lng > 180) return badRequest('Valid longitude required')
  if (zoom === null || zoom < 17 || zoom > 21) return badRequest('Zoom must be between 17 and 21')

  const usgsUrl = new URL(USGS_IMAGERY_URL)
  usgsUrl.searchParams.set('bbox', imageryBounds(lat, lng, zoom).join(','))
  usgsUrl.searchParams.set('bboxSR', '3857')
  usgsUrl.searchParams.set('imageSR', '3857')
  usgsUrl.searchParams.set('size', `${IMAGE_SIZE},${IMAGE_SIZE}`)
  usgsUrl.searchParams.set('format', 'jpgpng')
  usgsUrl.searchParams.set('interpolation', 'RSP_BilinearInterpolation')
  usgsUrl.searchParams.set('renderingRule', JSON.stringify({ rasterFunction: 'NaturalColor' }))
  usgsUrl.searchParams.set('f', 'image')

  let response
  try {
    response = await fetch(usgsUrl.toString(), {
      headers: { Accept: 'image/png,image/*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return json({ error: 'USGS aerial imagery request failed.' }, 502)
  }

  const contentType = response.headers.get('Content-Type') || ''
  if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
    return json({ error: 'USGS aerial imagery is unavailable.' }, 502)
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'X-TurfIntel-Imagery-Source': 'USDA NAIP via USGS The National Map',
    },
  })
}
