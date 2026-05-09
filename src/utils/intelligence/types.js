// ── TurfIntel Shared Intelligence — Schema & Constants ────────────────────────
//
// Standard recommendation schema used by all TurfIntel intelligence engines.
// All generator functions must return arrays of objects matching this shape.
//
// To add a new intelligence engine:
//   1. Create evaluator functions returning plain objects (see evaluator.js pattern)
//   2. Use createAgronomyRecommendation() / createWeatherRecommendation() etc. to stamp
//   3. Call sortRecommendations() before returning from the generator
//   4. Consume in UI with SEVERITY_TOKENS from severity.js

/**
 * @typedef {Object} TurfRecommendation
 * @property {string}   id              - Unique ID  e.g. 'wr-1715180000000-abc12'
 * @property {string}   source          - Engine that produced it: 'weather-engine' | 'irrigation-engine' | 'agronomy-engine'
 * @property {string}   module          - UI module target: 'spray' | 'irrigation' | 'disease' | 'agronomy' | 'crew'
 * @property {string}   type            - Evaluator-specific type  e.g. 'wind-spray' | 'irrigation-deficit'
 * @property {string}   severity        - 'critical' | 'warning' | 'caution' | 'info' | 'good'
 *                                        Legacy aliases still accepted: 'high' | 'medium' | 'low'
 * @property {string}   title           - Short heading for the advisory card
 * @property {string}   message         - Full context sentence(s)
 * @property {string}   recommendation  - Recommended action for the superintendent (canonical field)
 * @property {string}   recommendedAction - Alias for recommendation (backward-compat with existing evaluators)
 * @property {string}   icon            - Emoji icon for the advisory card
 * @property {string}   timestamp       - ISO 8601 string — when the recommendation was generated
 * @property {Object}   sourceData      - Raw weather/data inputs snapshot (optional, for debugging)
 * @property {string[]} tags            - Filter/grouping tags (optional)
 * @property {Object[]} actions         - Reserved for future interactive actions (optional)
 */

// ── Module identifiers ─────────────────────────────────────────────────────────

export const MODULES = {
  SPRAY:      'spray',
  IRRIGATION: 'irrigation',
  DISEASE:    'disease',
  AGRONOMY:   'agronomy',
  CREW:       'crew',
}

// Display labels — single source of truth for module name → UI label
export const MODULE_LABELS = {
  spray:      'Spray',
  irrigation: 'Irrigation',
  disease:    'Disease',
  agronomy:   'Agronomy',
  crew:       'Crew',
}

// ── Severity level registry ────────────────────────────────────────────────────
// Ordered highest → lowest priority

export const SEVERITY_LEVELS = ['critical', 'warning', 'caution', 'info', 'good']
