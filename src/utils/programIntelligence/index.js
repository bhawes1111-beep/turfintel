// Phase 23A — Spray Program Intelligence: public barrel.
//
// Aggregates the analytics, sequence, drift, and summary helpers so the
// Program Intelligence page can import everything from
// '@/utils/programIntelligence'. Pure re-exports — no side effects.

export {
  tallyByGroup,
  tallyByFamily,
  tallyBySurface,
  multiSiteRate,
  longestStreaksByFrac,
  diversityScore,
  highPressureGroups,
} from './programAnalytics.js'

export {
  chronologicalChain,
  surfaceSequences,
  longestStreaks,
  gapsBetween,
} from './programSequences.js'

export {
  compareToPlannedRotation,
  dependencyConcentration,
  diversityDegradation,
  analyzeProgramDrift,
  SEVERITY,
  RISK,
} from './programDrift.js'

export {
  buildProgramSummary,
} from './programSummaries.js'

export {
  // Filters (Phase 23B)
  DATE_PRESETS,
  SURFACE_OPTS,
  CHEMISTRY_TYPE_OPTS,
  PRESSURE_OPTS,
  resolveDateRange,
  filterRecordsByDateRange,
  filterRecordsBySurface,
  filterRecordsByPressure,
  filterProgramSummary,
  describeActiveFilters,
} from './programFilters.js'
