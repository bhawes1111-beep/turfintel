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
 * The geometry below is HAND-AUTHORED PLACEHOLDER content sized to render
 * visibly inside the Crosswinds bounding box. Replace via:
 *   - Emlid Reach RS2+ JSON imports (utils/geo/imports.js)
 *   - Toro Lynx IRX irrigation imports
 *   - Hand-edited GeoJSON dropped here
 *
 * Future TurfIntel subsystems (spray tracking, irrigation telemetry,
 * mowing patterns, moisture maps, disease pressure, GPS routing) consume
 * the SAME shape — do not invent parallel formats.
 */

import { emptyFeatureCollection } from '../utils/geo/geo'

// ── Crosswinds Golf Club — placeholder hole 1 area near anchor ──────────────

const CROSSWINDS = {

  // 1 sample green — small octagon ~25m wide
  greens: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'green-1', name: 'Green 1', hole: 1, type: 'green', status: 'active',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-81.23510, 32.13070],
            [-81.23495, 32.13075],
            [-81.23485, 32.13070],
            [-81.23485, 32.13060],
            [-81.23495, 32.13050],
            [-81.23510, 32.13055],
            [-81.23515, 32.13062],
            [-81.23510, 32.13070],
          ]],
        },
      },
    ],
  },

  // 1 sample fairway — ~150m east-west corridor leading to the green
  fairways: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'fairway-1', name: 'Fairway 1', hole: 1, type: 'fairway', status: 'active',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-81.23720, 32.13030],
            [-81.23485, 32.13045],
            [-81.23485, 32.13075],
            [-81.23720, 32.13060],
            [-81.23720, 32.13030],
          ]],
        },
      },
    ],
  },

  // Empty for Phase 1 — populate via imports later
  tees:  emptyFeatureCollection(),
  rough: emptyFeatureCollection(),

  // 2 sample bunkers — kidney-ish polygons flanking the green
  bunkers: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'bunker-1a', name: 'Greenside Bunker L', hole: 1, type: 'greenside', status: 'active',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-81.23522, 32.13068],
            [-81.23516, 32.13072],
            [-81.23510, 32.13070],
            [-81.23510, 32.13064],
            [-81.23516, 32.13062],
            [-81.23522, 32.13066],
            [-81.23522, 32.13068],
          ]],
        },
      },
      {
        type: 'Feature',
        properties: {
          id: 'bunker-1b', name: 'Greenside Bunker R', hole: 1, type: 'greenside', status: 'active',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-81.23485, 32.13062],
            [-81.23478, 32.13066],
            [-81.23472, 32.13062],
            [-81.23478, 32.13056],
            [-81.23485, 32.13056],
            [-81.23485, 32.13062],
          ]],
        },
      },
    ],
  },

  // 3 irrigation heads ringing the green
  irrigationHeads: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'irr-1', name: 'Head 1-A', hole: 1, type: 'rotary-head', status: 'active',
        },
        geometry: { type: 'Point', coordinates: [-81.23500, 32.13075] },
      },
      {
        type: 'Feature',
        properties: {
          id: 'irr-2', name: 'Head 1-B', hole: 1, type: 'rotary-head', status: 'active',
        },
        geometry: { type: 'Point', coordinates: [-81.23478, 32.13062] },
      },
      {
        type: 'Feature',
        properties: {
          id: 'irr-3', name: 'Head 1-C', hole: 1, type: 'rotary-head', status: 'active',
        },
        geometry: { type: 'Point', coordinates: [-81.23500, 32.13050] },
      },
    ],
  },

  // 1 sprinkler routing line connecting the 3 heads
  sprinklerRoutes: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'pipe-1', name: 'Green 1 lateral', hole: 1, type: 'lateral', status: 'active',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-81.23500, 32.13075],
            [-81.23478, 32.13062],
            [-81.23500, 32.13050],
          ],
        },
      },
    ],
  },

  // Reserved for future subsystems — stay empty for Phase 1
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
