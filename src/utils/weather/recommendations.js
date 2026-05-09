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

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }

function uid() {
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── makeRecommendation ─────────────────────────────────────────────────────────
// Stamps an evaluator result with a unique ID, source, and timestamp.

export function makeRecommendation(fields) {
  return {
    id:        uid(),
    source:    'weather-engine',
    timestamp: new Date().toISOString(),
    ...fields,
  }
}

// ── generateWeatherRecommendations ────────────────────────────────────────────
// Runs all evaluators, filters nulls, stamps IDs, and sorts by severity.
// Returns an array of recommendation objects ready for display or alert dispatch.

export function generateWeatherRecommendations(current, forecast = []) {
  const raw = [
    evaluateSprayWindow(current),
    evaluateDiseasePressure(current, forecast),
    evaluateETDemand(current),
    evaluateFrostRisk(forecast),
    evaluateRainDelay(current, forecast),
    evaluateHeatStress(current, forecast),
  ]

  return raw
    .filter(Boolean)
    .map(makeRecommendation)
    .sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    )
}
