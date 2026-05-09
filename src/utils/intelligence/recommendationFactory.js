// ── TurfIntel Shared Intelligence — Recommendation Factory ────────────────────

import { sortBySeverity } from './severity.js'

// Generates a unique ID: e.g. 'wr-1715180000000-abc12'
export function uid(prefix = 'rec') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Wraps raw evaluator output in the standard TurfRecommendation envelope.
 * - Normalizes recommendedAction → recommendation while preserving both fields
 * - Sets id, source, and timestamp
 *
 * @param {Object} fields   - Raw evaluator output (must include at minimum: type, severity, title, message)
 * @param {string} source   - Engine identifier e.g. 'weather-engine'
 * @param {string} idPrefix - Short prefix for the generated ID e.g. 'wr'
 * @returns {Object} TurfRecommendation
 */
export function stamp(fields, source, idPrefix) {
  const recommendation = fields.recommendation ?? fields.recommendedAction ?? ''
  return {
    id:        uid(idPrefix),
    source,
    timestamp: new Date().toISOString(),
    ...fields,
    recommendation,
  }
}

export function sortRecommendations(arr) {
  return sortBySeverity(arr)
}
