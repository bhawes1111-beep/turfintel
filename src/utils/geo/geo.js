/**
 * GeoJSON shape definitions and helpers used by the TurfIntel mapping system.
 *
 * The TurfIntel mapping layer is foundational infrastructure — every future
 * subsystem (spray tracking, irrigation, equipment telemetry, mowing patterns,
 * moisture maps, disease pressure, GPS routing) consumes the SAME GeoJSON
 * source. Do not invent parallel data formats.
 *
 * Standards:
 *   - Conforms to RFC 7946 (the GeoJSON spec).
 *   - Coordinates are [longitude, latitude] tuples in WGS-84 decimal degrees.
 *   - All Polygons are CLOSED rings (first coord repeated as last).
 *   - Holes (inner rings) are supported but rarely used for golf features.
 *
 * Per-feature properties contract:
 *   {
 *     id:     string                -- stable unique id within layer
 *     name:   string                -- human-readable label
 *     hole:   number | null         -- hole number 1..18, or null for non-hole features
 *     type:   string                -- finer-grained type within layer
 *                                      (e.g. 'green', 'fringe', 'rotary-head')
 *     status: string                -- 'active' | 'archived' | 'planned' | etc.
 *     ...                           -- additional layer-specific props are allowed
 *   }
 */

/**
 * @typedef {Object} FeatureProperties
 * @property {string}      id
 * @property {string}      name
 * @property {number|null} hole
 * @property {string}      type
 * @property {string}      status
 */

/**
 * @typedef {Object} GeoJsonFeature
 * @property {'Feature'}                                                                          type
 * @property {FeatureProperties}                                                                  properties
 * @property {{type:'Polygon', coordinates:number[][][]}
 *           | {type:'LineString', coordinates:number[][]}
 *           | {type:'Point',      coordinates:number[]}}                                          geometry
 */

/**
 * @typedef {Object} GeoJsonFeatureCollection
 * @property {'FeatureCollection'} type
 * @property {GeoJsonFeature[]}    features
 */

/** Build an empty FeatureCollection. */
export function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] }
}

/** Validate the bare minimum required to render a feature. */
export function isRenderableFeature(f) {
  if (!f || f.type !== 'Feature' || !f.geometry) return false
  const t = f.geometry.type
  return t === 'Polygon' || t === 'LineString' || t === 'Point'
}

/** Default-fill missing properties so renderers can rely on them. */
export function normalizeFeatureProperties(props = {}) {
  return {
    id:     props.id     ?? 'unknown',
    name:   props.name   ?? '',
    hole:   props.hole   ?? null,
    type:   props.type   ?? 'unknown',
    status: props.status ?? 'active',
    ...props,
  }
}
