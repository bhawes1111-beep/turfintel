// Phase 22A — Chemistry Intelligence: public barrel.
//
// Aggregates the chemistry utility layer's public surface so the upcoming
// Spray Builder integration (Phase 22B) can import everything from
// '@/utils/chemistry' without reaching into individual modules.
//
// Pure re-exports — no side effects, no React, no I/O.

export {
  // Metadata
  RESISTANCE_RISK,
  FRAC_GROUPS,
  HRAC_GROUPS,
  IRAC_GROUPS,
  lookupGroup,
  lookupGroups,
} from './chemistryMetadata.js'

export {
  // Structural parsers
  parseGroupCodes,
  parseActiveIngredients,
  normalizeActiveName,
  findDuplicateActives,
  aggregateTankCodes,
} from './chemistryStructures.js'

export {
  // History analysis
  normalizeAreaName,
  filterByLookback,
  filterByArea,
  recordCodes,
  countApplicationsByGroup,
  detectRepeatedMOA,
  daysSinceLastUse,
} from './sprayHistoryAnalysis.js'

export {
  // Warning model
  SEVERITY,
  SEVERITY_TO_CANONICAL,
  analyzeSprayDraft,
  highestSeverity,
} from './chemistryWarnings.js'
