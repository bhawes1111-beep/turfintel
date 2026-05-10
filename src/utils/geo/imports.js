/**
 * Import adapters — convert third-party formats into TurfIntel GeoJSON
 * FeatureCollections that match the contract in `geo.js` and `featureRegistry.js`.
 *
 * Implemented:
 *   - importKML — DOMParser-based, plain .kml only (not .kmz / not zipped).
 *
 * Stubs (Phase 3+ when sample files arrive):
 *   - importEmlidReachJSON — Emlid Reach RS2+ export
 *   - importToroLynxIRX    — Toro Lynx irrigation IRX/XML
 *   - importQgisGeoJSON    — QGIS-authored GeoJSON passthrough
 *
 * Every adapter returns a single GeoJSON FeatureCollection that the caller
 * adds into the appropriate layer via the geoStore.
 */

import { emptyFeatureCollection } from './geo'

// ── KML import ─────────────────────────────────────────────────────────────

/**
 * Parse a plain KML document into a GeoJSON FeatureCollection.
 *
 * Geometry support: Point, LineString, Polygon (outer ring only).
 * Property mapping:
 *   - <name>        → properties.name
 *   - <description> → properties.description
 *   - <ExtendedData>/<Data name="x"><value>...</value></Data> → properties.x
 *   - generated id, type='imported', status='active', hole=null
 *
 * NOT supported:
 *   - KMZ (compressed). Export plain .kml from Google Earth (Save Place As → KML).
 *   - MultiGeometry placemarks — uses the first geometry only.
 *   - Polygon inner rings (holes) — outer ring only for Phase 2.
 *   - <Style>, <NetworkLink>, <GroundOverlay> — ignored.
 *
 * @param {string} xmlText   - raw KML file contents
 * @param {string} layerKey  - destination layer (used in generated ids)
 * @returns {{type:'FeatureCollection', features:object[]}}
 */
export function importKML(xmlText, layerKey) {
  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    throw new Error('importKML: expected non-empty XML text')
  }

  const parser = new DOMParser()
  const doc    = parser.parseFromString(xmlText, 'application/xml')

  // DOMParser surfaces parse errors as a <parsererror> element.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('importKML: invalid XML — file does not appear to be valid KML')
  }

  // Walk every <Placemark> regardless of namespace prefix.
  const placemarks = doc.getElementsByTagNameNS('*', 'Placemark')
  if (placemarks.length === 0) {
    throw new Error('importKML: no <Placemark> elements found')
  }

  const features = []
  const importedAt = Date.now()

  for (let i = 0; i < placemarks.length; i++) {
    const feature = placemarkToFeature(placemarks[i], layerKey, importedAt, i)
    if (feature) features.push(feature)
  }

  if (features.length === 0) {
    throw new Error('importKML: no supported geometry found in placemarks')
  }

  return { type: 'FeatureCollection', features }
}

// ── Placemark → Feature ───────────────────────────────────────────────────

function placemarkToFeature(pm, layerKey, importedAt, index) {
  const geometry = extractGeometry(pm)
  if (!geometry) return null

  const name        = textOf(pm, 'name') || `${layerKey}-${index + 1}`
  const description = textOf(pm, 'description')
  const extended    = extractExtendedData(pm)

  return {
    type: 'Feature',
    properties: {
      id:     `imported-${layerKey}-${importedAt}-${index}`,
      name,
      hole:   null,
      type:   'imported',
      status: 'active',
      ...(description ? { description } : {}),
      ...extended,
    },
    geometry,
  }
}

function extractGeometry(pm) {
  // First Point, LineString, or Polygon — in that priority order.
  const point = directDescendant(pm, 'Point')
  if (point) {
    const coords = parseCoordinates(textOf(point, 'coordinates'))
    if (coords.length === 0) return null
    return { type: 'Point', coordinates: coords[0] }
  }

  const line = directDescendant(pm, 'LineString')
  if (line) {
    const coords = parseCoordinates(textOf(line, 'coordinates'))
    if (coords.length < 2) return null
    return { type: 'LineString', coordinates: coords }
  }

  const polygon = directDescendant(pm, 'Polygon')
  if (polygon) {
    const outer  = directDescendant(polygon, 'outerBoundaryIs')
    if (!outer) return null
    const ring   = directDescendant(outer, 'LinearRing')
    if (!ring) return null
    const coords = parseCoordinates(textOf(ring, 'coordinates'))
    if (coords.length < 3) return null
    // Ensure the ring is closed (first === last).
    const closed = coords[0][0] === coords[coords.length - 1][0]
                && coords[0][1] === coords[coords.length - 1][1]
    return {
      type: 'Polygon',
      coordinates: [closed ? coords : [...coords, coords[0]]],
    }
  }

  return null
}

function extractExtendedData(pm) {
  const ext = directDescendant(pm, 'ExtendedData')
  if (!ext) return {}

  const result = {}
  const dataEls = ext.getElementsByTagNameNS('*', 'Data')
  for (let i = 0; i < dataEls.length; i++) {
    const el  = dataEls[i]
    const key = el.getAttribute('name')
    if (!key) continue
    const valueEl = el.getElementsByTagNameNS('*', 'value')[0]
    if (valueEl) result[key] = valueEl.textContent.trim()
  }
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Find the first descendant element with the given local name (any namespace). */
function directDescendant(el, localName) {
  return el.getElementsByTagNameNS('*', localName)[0] || null
}

/** Trimmed text content of the first <localName> descendant; '' if missing. */
function textOf(el, localName) {
  const child = directDescendant(el, localName)
  return child ? child.textContent.trim() : ''
}

/**
 * Parse a KML <coordinates> string.
 * KML format: "lng,lat[,alt]" tuples separated by any whitespace.
 * Returns an array of [lng, lat] tuples (altitude dropped for Phase 2).
 */
function parseCoordinates(text) {
  if (!text) return []
  return text
    .trim()
    .split(/\s+/)
    .map(triplet => {
      const parts = triplet.split(',')
      const lng = Number(parts[0])
      const lat = Number(parts[1])
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
    })
    .filter(Boolean)
}

// ── Stubs ──────────────────────────────────────────────────────────────────

/**
 * Emlid Reach RS2+ exports survey points/lines as GeoJSON natively.
 * @param {object} _json
 * @returns {object}
 */
export function importEmlidReachJSON(_json) {
  throw new Error('importEmlidReachJSON: not implemented (Phase 3 stub)')
}

/**
 * Toro Lynx exports irrigation system data as IRX (XML).
 * @param {string} _xmlText
 * @returns {object}
 */
export function importToroLynxIRX(_xmlText) {
  throw new Error('importToroLynxIRX: not implemented (Phase 3 stub)')
}

/**
 * Generic GeoJSON passthrough.
 * @param {object} _json
 * @param {string} _layerKey
 * @returns {object}
 */
export function importQgisGeoJSON(_json, _layerKey) {
  throw new Error('importQgisGeoJSON: not implemented (Phase 3 stub)')
}

// Empty re-export so consumers can build empty FCs without importing geo.js.
export { emptyFeatureCollection }
