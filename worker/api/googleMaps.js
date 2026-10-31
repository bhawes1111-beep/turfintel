import { badRequest, json } from '../lib/json.js'

const STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap'
const FETCH_TIMEOUT_MS = 8000

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function getGoogleSatelliteMap(env, url) {
  const apiKey = env.GOOGLE_MAPS_STATIC_API_KEY
  if (!apiKey) {
    return json({
      configured: false,
      error: 'Google satellite imagery is not configured.',
    }, 503)
  }

  const lat = finiteNumber(url.searchParams.get('lat'))
  const lng = finiteNumber(url.searchParams.get('lng'))
  const zoomValue = finiteNumber(url.searchParams.get('zoom'))
  const zoom = zoomValue === null ? null : Math.round(zoomValue)

  if (lat === null || lat < -85 || lat > 85) return badRequest('Valid latitude required')
  if (lng === null || lng < -180 || lng > 180) return badRequest('Valid longitude required')
  if (zoom === null || zoom < 17 || zoom > 21) return badRequest('Zoom must be between 17 and 21')

  const googleUrl = new URL(STATIC_MAP_URL)
  googleUrl.searchParams.set('center', `${lat.toFixed(6)},${lng.toFixed(6)}`)
  googleUrl.searchParams.set('zoom', String(zoom))
  googleUrl.searchParams.set('size', '640x640')
  googleUrl.searchParams.set('scale', '2')
  googleUrl.searchParams.set('maptype', 'satellite')
  googleUrl.searchParams.set('format', 'png')
  googleUrl.searchParams.set('key', apiKey)

  let response
  try {
    response = await fetch(googleUrl.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return json({ configured: true, error: 'Google satellite imagery request failed.' }, 502)
  }

  if (!response.ok) {
    return json({ configured: true, error: 'Google satellite imagery is unavailable.' }, 502)
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
