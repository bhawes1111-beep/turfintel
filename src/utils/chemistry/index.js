// Phase 22A/C — Chemistry Intelligence: public barrel.
//
// Aggregates the chemistry utility layer's public surface so callers can
// import everything from '@/utils/chemistry' without reaching into the
// individual modules. Pure re-exports — no side effects.

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
  findDuplicateActiveFamilies,
  aggregateTankCodes,
} from './chemistryStructures.js'

export {
  // History analysis
  normalizeAreaName,
  filterByLookback,
  filterByArea,
  recordCodes,
  recordFamilies,
  countApplicationsByGroup,
  detectRepeatedMOA,
  detectRepeatedFamily,
  daysSinceLastUse,
  indexRecordsById,
} from './sprayHistoryAnalysis.js'

export {
  // Active-ingredient families (Phase 22C)
  AI_FAMILIES,
  lookupActiveFamily,
  familyCodeOf,
} from './aiFamilies.js'

export {
  // Area hierarchy (Phase 22C)
  AREA_FAMILIES,
  areaFamilyOf,
  areaSurfaceTypeOf,
  areasMatch,
} from './areaHierarchy.js'

export {
  // Sequence formatters (Phase 22C)
  buildMOATimeline,
  formatSequence,
  buildMixSequence,
  fmtShortDate,
} from './sequenceFormat.js'

export {
  // Warning model
  SEVERITY,
  SEVERITY_TO_CANONICAL,
  analyzeSprayDraft,
  highestSeverity,
} from './chemistryWarnings.js'
