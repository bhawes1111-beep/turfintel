// ── Weather recommendations ────────────────────────────────────────────────────
//
// Orchestrates all evaluators and returns a sorted, stamped recommendation list.
// Recommendations are ephemeral (not persisted) — they are derived on-demand
// from live or placeholder weather data.
//
// To push a recommendation into the operations alert system, use:
//   dispatch(createAlert({ title, message, module, priority, sourceId: rec.id }))
//
// API-READY: swap PLACEHOLDER_* data for real weather feed objects. Evaluator
// signatures and this function's return shape remain stable.

import {
  evaluateSprayWindow,
  evaluateDiseasePressure,
  evaluateETDemand,
  evaluateFrostRisk,
  evaluateRainDelay,
  evaluateHeatStress,
} from './evaluator'
import {
  createWeatherRecommendation,
  sortRecommendations,
} from '../intelligence/recommendationHelpers'

// ── makeRecommendation ─────────────────────────────────────────────────────────

export function makeRecommendation(fields) {
  return createWeatherRecommendation(fields)
}

// ── generateWeatherRecommendations ────────────────────────────────────────────

export function generateWeatherRecommendations(current, forecast = []) {
  const raw = [
    evaluateSprayWindow(current),
    evaluateDiseasePressure(current, forecast),
    evaluateETDemand(current),
    evaluateFrostRisk(forecast),
    evaluateRainDelay(current, forecast),
    evaluateHeatStress(current, forecast),
  ]

  return sortRecommendations(raw.filter(Boolean).map(makeRecommendation))
}
