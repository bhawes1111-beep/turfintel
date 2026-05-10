/**
 * Equirectangular projection — accurate within ~1 metre over a single
 * golf-course-sized area (≤ 2 km on a side). Zero dependencies.
 *
 * Renderer-agnostic: this module only converts WGS-84 lat/lng <→ planar x/y
 * inside a viewport of arbitrary size. The CourseMap renderer (currently
 * SVG, future Leaflet/MapLibre) consumes the same `bounds` shape.
 *
 * GeoJSON convention is [lng, lat] — note the order — but every helper here
 * accepts an object form { lat, lng } to avoid array-index confusion.
 */

/**
 * @typedef {Object} LatLng
 * @property {number} lat   - WGS-84 latitude  (degrees, +N / -S)
 * @property {number} lng   - WGS-84 longitude (degrees, +E / -W)
 */

/**
 * @typedef {Object} Bounds
 * @property {number} north - max latitude
 * @property {number} south - min latitude
 * @property {number} east  - max longitude
 * @property {number} west  - min longitude
 */

/**
 * Build a stateless projector for the given bounds + viewport.
 *
 * @param {Object}  cfg
 * @param {Bounds}  cfg.bounds      - WGS-84 bounding box of the area to render
 * @param {number}  cfg.viewWidth   - viewport width  in SVG user units
 * @param {number}  cfg.viewHeight  - viewport height in SVG user units
 * @returns {{ project:(p:LatLng)=>{x:number,y:number}, unproject:(p:{x:number,y:number})=>LatLng }}
 */
export function makeProjector({ bounds, viewWidth, viewHeight }) {
  const lngSpan = bounds.east - bounds.west
  const latSpan = bounds.north - bounds.south

  return {
    project: ({ lat, lng }) => ({
      x: ((lng - bounds.west) / lngSpan) * viewWidth,
      // SVG y-axis grows downward; lat grows upward — flip.
      y: ((bounds.north - lat) / latSpan) * viewHeight,
    }),
    unproject: ({ x, y }) => ({
      lng: bounds.west  + (x / viewWidth)  * lngSpan,
      lat: bounds.north - (y / viewHeight) * latSpan,
    }),
  }
}

/**
 * Compute the SVG viewBox dimensions that preserve real-world aspect ratio
 * for the given bounds. Longitude degrees shrink with latitude, so we apply
 * cos(centerLat) when comparing east-west to north-south spans.
 *
 * @param {Bounds} bounds
 * @param {number} [width=1000] - desired viewBox width
 * @returns {{ width:number, height:number, aspect:number }}
 */
export function viewBoxForBounds(bounds, width = 1000) {
  const centerLat   = (bounds.north + bounds.south) / 2
  const lngSpan     = (bounds.east - bounds.west) * Math.cos(centerLat * Math.PI / 180)
  const latSpan     =  bounds.north - bounds.south
  const aspect      = lngSpan / latSpan
  const height      = Math.round(width / aspect)
  return { width, height, aspect }
}

/**
 * GeoJSON helper — convert a [lng, lat] tuple to a {lat, lng} object.
 * Used when projecting GeoJSON geometries.
 */
export function geoJsonCoordToLatLng([lng, lat]) {
  return { lat, lng }
}
