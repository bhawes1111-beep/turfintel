// Phase 16 — Ambient Weather provider (server-side).
//
// The Ambient Weather REST API requires two keys (an application key
// and an API key). Both are stored as Cloudflare Worker secrets and
// must NEVER reach the browser — that's the whole reason this endpoint
// exists. The frontend calls /api/weather/ambient/current; the worker
// calls Ambient with the secrets and returns the station's latest
// observation.
//
// Secrets (set via `wrangler secret put`):
//   AMBIENT_WEATHER_APPLICATION_KEY
//   AMBIENT_WEATHER_API_KEY
//
// Response contract:
//   200 { configured: true,  source: 'ambient', sourceLabel, deviceName,
//         observedAt, lastData }   — lastData is Ambient's raw obs object;
//                                    the frontend normalizer maps it.
//   503 { configured: false, error }  — keys not set → frontend falls back to NWS
//   502 { configured: true,  error }  — Ambient API failed → frontend falls back to NWS
//
// This endpoint never throws — every failure path returns a JSON body
// the frontend can branch on, so a missing key or an Ambient outage
// degrades to the existing NWS/KSAV pipeline instead of crashing.

import { json } from '../lib/json.js'

const AMBIENT_DEVICES_URL = 'https://rt.ambientweather.net/v1/devices'
const FETCH_TIMEOUT_MS    = 8000

export async function getAmbientCurrent(env) {
  const appKey = env.AMBIENT_WEATHER_APPLICATION_KEY
  const apiKey = env.AMBIENT_WEATHER_API_KEY

  if (!appKey || !apiKey) {
    // Not a server error — an expected "not wired up yet" state. The
    // frontend treats 503 here as "fall back to NWS, label it NWS".
    console.warn('[TurfIntel Weather] Ambient keys not configured — frontend will fall back to NWS')
    return json({
      configured: false,
      error: 'Ambient Weather keys not set. Run: wrangler secret put '
           + 'AMBIENT_WEATHER_APPLICATION_KEY and AMBIENT_WEATHER_API_KEY',
    }, 503)
  }

  const url = `${AMBIENT_DEVICES_URL}?applicationKey=${encodeURIComponent(appKey)}`
            + `&apiKey=${encodeURIComponent(apiKey)}`

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    console.warn('[TurfIntel Weather] Ambient fetch failed:', err.message)
    return json({ configured: true, error: `Ambient fetch failed: ${err.message}` }, 502)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[TurfIntel Weather] Ambient API non-200:', res.status, text.slice(0, 120))
    return json({ configured: true, error: `Ambient API ${res.status}` }, 502)
  }

  let devices
  try {
    devices = await res.json()
  } catch {
    return json({ configured: true, error: 'Ambient API returned non-JSON' }, 502)
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    return json({ configured: true, error: 'No Ambient devices on this account' }, 502)
  }

  // One course = one station. Take the first device; if a future
  // multi-station setup needs selection, add a ?mac= param here.
  const device   = devices[0]
  const lastData = device?.lastData ?? null
  if (!lastData || typeof lastData.tempf !== 'number') {
    return json({ configured: true, error: 'Ambient device has no usable lastData' }, 502)
  }

  return json({
    configured:  true,
    source:      'ambient',
    sourceLabel: 'Ambient Weather',
    deviceName:  device?.info?.name ?? device?.info?.location ?? null,
    observedAt:  lastData.date ?? null,
    // Raw Ambient observation — the frontend normalizer (normalizeAmbient
    // in weather/normalize.js) maps these fields into the TurfIntel
    // `current` shape, reusing the same ET / disease / spray helpers as
    // the NWS path so the two providers stay consistent.
    lastData,
  })
}
