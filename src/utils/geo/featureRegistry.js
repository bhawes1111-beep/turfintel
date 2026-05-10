/**
 * Layer registry — single source of truth for every map overlay.
 *
 * Each entry describes one renderable layer and its TurfIntel-native styling.
 * Renderers (CourseMap.jsx + MapLayer.jsx) consume this directly. Future
 * MapLibre/Leaflet renderers will translate these style props into their
 * native style specs without touching the data.
 *
 * To add a layer:
 *   1. Add a key here with display + style metadata.
 *   2. Add a matching empty FeatureCollection in src/data/courseGeo.js.
 *   3. Optional: extend imports.js to populate it from external sources.
 */

/**
 * @typedef {'polygon'|'line'|'point'} LayerGeometry
 */

/**
 * @typedef {Object} LayerSpec
 * @property {string}        key           - layer identifier (matches courseGeo key)
 * @property {string}        label         - human-readable label
 * @property {string}        icon          - small unicode glyph for toggles/legend
 * @property {LayerGeometry} geometry      - dominant geometry type (renderer hint)
 * @property {string}        fill          - fill color (CSS color)
 * @property {string}        stroke        - stroke color
 * @property {number}        strokeWidth   - stroke width in SVG user units
 * @property {string}        [strokeDash]  - SVG stroke-dasharray spec
 * @property {number}        opacity       - 0–1
 * @property {number}        [pointRadius] - point geometry radius (SVG units)
 * @property {boolean}       [glow]        - apply soft glow filter
 * @property {number}        [zIndex]      - render order; higher = on top
 */

/** @type {Record<string, LayerSpec>} */
export const LAYERS = {
  // ── Surface polygons (rendered bottom-to-top by zIndex) ──────────────────

  rough: {
    key: 'rough',
    label: 'Rough',
    icon: '░',
    geometry: 'polygon',
    fill:        '#1f3a1f',
    stroke:      '#2a4a2a',
    strokeWidth: 0.5,
    opacity:     0.45,
    zIndex:      10,
  },

  fairways: {
    key: 'fairways',
    label: 'Fairways',
    icon: '▬',
    geometry: 'polygon',
    fill:        '#3a7d3a',     // muted emerald
    stroke:      '#4a9e4a',
    strokeWidth: 0.6,
    opacity:     0.6,
    zIndex:      20,
  },

  tees: {
    key: 'tees',
    label: 'Tees',
    icon: '◢',
    geometry: 'polygon',
    fill:        '#5db85d',
    stroke:      '#7ec27e',
    strokeWidth: 0.7,
    opacity:     0.78,
    zIndex:      30,
  },

  bunkers: {
    key: 'bunkers',
    label: 'Bunkers',
    icon: '◌',
    geometry: 'polygon',
    fill:        '#d4c894',     // subtle sand tone
    stroke:      '#b8a872',
    strokeWidth: 0.7,
    opacity:     0.85,
    zIndex:      40,
  },

  greens: {
    key: 'greens',
    label: 'Greens',
    icon: '◉',
    geometry: 'polygon',
    fill:        '#4ade80',     // brighter green
    stroke:      '#22c55e',
    strokeWidth: 0.9,
    opacity:     0.88,
    glow:        true,
    zIndex:      50,
  },

  // ── Routes / lines ────────────────────────────────────────────────────────

  sprinklerRoutes: {
    key: 'sprinklerRoutes',
    label: 'Sprinkler Routes',
    icon: '⌇',
    geometry: 'line',
    fill:        'none',
    stroke:      '#06b6d4',     // cyan
    strokeWidth: 1.1,
    strokeDash:  '3 2',
    opacity:     0.7,
    zIndex:      60,
  },

  gpsTracks: {
    key: 'gpsTracks',
    label: 'GPS Tracks',
    icon: '⤳',
    geometry: 'line',
    fill:        'none',
    stroke:      '#fbbf24',
    strokeWidth: 1.3,
    opacity:     0.75,
    zIndex:      65,
  },

  sprayCoverage: {
    key: 'sprayCoverage',
    label: 'Spray Coverage',
    icon: '◆',
    geometry: 'polygon',
    fill:        '#a855f7',
    stroke:      '#9333ea',
    strokeWidth: 0.5,
    opacity:     0.32,
    zIndex:      70,
  },

  // ── Points (rendered on top) ──────────────────────────────────────────────

  irrigationHeads: {
    key: 'irrigationHeads',
    label: 'Irrigation',
    icon: '✦',
    geometry: 'point',
    fill:        '#22d3ee',     // cyan / blue-green
    stroke:      '#0e7490',
    strokeWidth: 1,
    pointRadius: 4.5,
    opacity:     0.95,
    glow:        true,
    zIndex:      80,
  },

  equipmentTelemetry: {
    key: 'equipmentTelemetry',
    label: 'Equipment',
    icon: '⬢',
    geometry: 'point',
    fill:        '#f59e0b',
    stroke:      '#b45309',
    strokeWidth: 1,
    pointRadius: 5.5,
    opacity:     0.95,
    glow:        true,
    zIndex:      90,
  },
}

/** Convenience — list of all layer keys. */
export const LAYER_KEYS = Object.keys(LAYERS)

/** Default layer toggle state — every layer visible. */
export const DEFAULT_VISIBILITY = LAYER_KEYS.reduce((acc, k) => {
  acc[k] = true
  return acc
}, {})

/**
 * Order layer keys for rendering (lowest zIndex first → drawn first → underneath).
 */
export function layersInRenderOrder(keys) {
  return [...keys].sort((a, b) => (LAYERS[a]?.zIndex ?? 0) - (LAYERS[b]?.zIndex ?? 0))
}
