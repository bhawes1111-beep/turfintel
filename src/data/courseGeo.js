/**
 * Per-course GeoJSON FeatureCollections — keyed by course id.
 *
 * Anchor:
 *   Crosswinds Golf Club — 32°07'47.48"N  81°14'06.83"W
 *                       → 32.129856, -81.235231
 *
 * All coordinates are [longitude, latitude] in WGS-84 decimal degrees per
 * the GeoJSON RFC 7946 spec.
 *
 * Layers start empty in production. Populate via:
 *   - KML imports (Google Earth / GPS placemarks → utils/geo/imports.js)
 *   - Emlid Reach RS2+ JSON imports (future)
 *   - Toro Lynx IRX irrigation imports (future)
 *   - Hand-edited GeoJSON dropped here
 *
 * Future TurfIntel subsystems (spray tracking, irrigation telemetry,
 * mowing patterns, moisture maps, disease pressure, GPS routing) consume
 * the SAME shape — do not invent parallel formats.
 */

import { emptyFeatureCollection } from '../utils/geo/geo'

// ── Crosswinds Golf Club ──────────────────────────────────────────────────

const CROSSWINDS = {
  greens:             emptyFeatureCollection(),
  fairways:           emptyFeatureCollection(),
  tees:               emptyFeatureCollection(),
  rough:              emptyFeatureCollection(),
  bunkers:            emptyFeatureCollection(),
  irrigationHeads:    emptyFeatureCollection(),
  sprinklerRoutes:    emptyFeatureCollection(),
  gpsTracks:          emptyFeatureCollection(),
  sprayCoverage:      emptyFeatureCollection(),
  equipmentTelemetry: emptyFeatureCollection(),
}

/**
 * Lookup table — courseId → layered GeoJSON.
 *
 * Courses without geometry yet return all-empty collections.
 */
export const COURSE_GEO = {
  1: CROSSWINDS,
}

/** Always-safe accessor — returns empty collections if course has no geometry. */
export function getCourseGeo(courseId) {
  return COURSE_GEO[courseId] ?? {
    greens:             emptyFeatureCollection(),
    fairways:           emptyFeatureCollection(),
    tees:               emptyFeatureCollection(),
    rough:              emptyFeatureCollection(),
    bunkers:            emptyFeatureCollection(),
    irrigationHeads:    emptyFeatureCollection(),
    sprinklerRoutes:    emptyFeatureCollection(),
    gpsTracks:          emptyFeatureCollection(),
    sprayCoverage:      emptyFeatureCollection(),
    equipmentTelemetry: emptyFeatureCollection(),
  }
}
