/**
 * Import adapters — convert third-party formats into TurfIntel GeoJSON
 * FeatureCollections that match the contract in `geo.js` and `featureRegistry.js`.
 *
 * Phase 1 status: STUBS ONLY.
 *
 * When real sample files arrive, fill these in. The renderer never changes —
 * adapters only need to produce valid FeatureCollections keyed by layer.
 *
 * Expected return shape from each adapter:
 *   {
 *     greens?:             FeatureCollection,
 *     fairways?:           FeatureCollection,
 *     tees?:               FeatureCollection,
 *     rough?:              FeatureCollection,
 *     bunkers?:            FeatureCollection,
 *     irrigationHeads?:    FeatureCollection,
 *     sprinklerRoutes?:    FeatureCollection,
 *     gpsTracks?:          FeatureCollection,
 *     sprayCoverage?:      FeatureCollection,
 *     equipmentTelemetry?: FeatureCollection,
 *   }
 */

/**
 * Emlid Reach RS2+ exports survey points/lines as GeoJSON natively.
 * Map their attribute schema → TurfIntel layer keys.
 *
 * @param {object} _json - parsed JSON exported from Emlid ReachView
 * @returns {object}
 */
export function importEmlidReachJSON(_json) {
  throw new Error('importEmlidReachJSON: not implemented (Phase 1 stub)')
}

/**
 * Toro Lynx exports irrigation system data as IRX (XML).
 * Adapter converts heads → irrigationHeads, pipe network → sprinklerRoutes.
 *
 * @param {string} _xmlText - raw XML text from a Lynx IRX export
 * @returns {object}
 */
export function importToroLynxIRX(_xmlText) {
  throw new Error('importToroLynxIRX: not implemented (Phase 1 stub)')
}

/**
 * Generic GeoJSON passthrough — useful for QGIS-authored shapefiles
 * exported as GeoJSON, or hand-edited course outlines.
 *
 * Caller specifies which layer the FeatureCollection populates.
 *
 * @param {object} _json
 * @param {string} _layerKey - matches a key in LAYERS (e.g., 'greens')
 * @returns {object}
 */
export function importQgisGeoJSON(_json, _layerKey) {
  throw new Error('importQgisGeoJSON: not implemented (Phase 1 stub)')
}
