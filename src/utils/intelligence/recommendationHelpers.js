// ── TurfIntel Shared Intelligence — Per-engine Helpers ────────────────────────

import { stamp, sortRecommendations } from './recommendationFactory.js'

export { sortRecommendations }

export function createWeatherRecommendation(fields) {
  return stamp(fields, 'weather-engine', 'wr')
}

export function createIrrigationRecommendation(fields) {
  return stamp(fields, 'irrigation-engine', 'ir')
}

export function createAgronomyRecommendation(fields) {
  return stamp(fields, 'agronomy-engine', 'ag')
}
