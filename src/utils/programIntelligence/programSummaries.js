// Phase 23A — Spray Program Intelligence: unified summary model.
//
// One-call entry point that wraps the analytics / sequences / drift
// helpers into a single result object. The Program Intelligence page
// renders directly from this shape.
//
// All inputs are already in memory (records + labelsByItemId); this
// module is pure orchestration. No I/O, no React.

import {
  tallyByGroup,
  tallyByFamily,
  tallyBySurface,
  multiSiteRate,
  diversityScore,
  highPressureGroups,
  longestStreaksByFrac,
} from './programAnalytics.js'
import {
  chronologicalChain,
  surfaceSequences,
  longestStreaks,
  gapsBetween,
} from './programSequences.js'
import { analyzeProgramDrift } from './programDrift.js'

/**
 * Build the unified Program Intelligence summary.
 *
 *   buildProgramSummary(records, labelsByItemId, {
 *     plannedFracCodes,     optional — passed to drift
 *     priorSeasonRecords,   optional — passed to diversity degradation
 *   })
 *
 *   → {
 *       totalApplications,
 *       fracUsage:        [...],   // tally by FRAC
 *       hracUsage:        [...],
 *       iracUsage:        [...],
 *       familyUsage:      [...],   // active-ingredient family tallies
 *       surfaceUsage:     [...],   // application count per surface
 *       multiSite:        { rate, withPartner, totalApplications },
 *       diversity:        { score, distinctCodes, totalApplications },
 *       longestStreaks:   [...],   // (type, code, surface, streak)
 *       longestFracStreaks: [...], // FRAC-only headline streaks
 *       gaps:             [...],
 *       chain:            [...],   // chronological MOA chain
 *       surfaceChains:    [...],
 *       highPressure:     [...],
 *       drift:            [...],   // informational findings (severity-ordered)
 *     }
 *
 * `totalApplications` reflects the input record count — drift / streak
 * sections may sum to less when some records have unresolved labels.
 */
export function buildProgramSummary(records, labelsByItemId, options = {}) {
  const safeRecords = Array.isArray(records) ? records : []
  const groupTally = tallyByGroup(safeRecords, labelsByItemId)
  return {
    totalApplications:  groupTally.totalApplications,
    fracUsage:          groupTally.FRAC,
    hracUsage:          groupTally.HRAC,
    iracUsage:          groupTally.IRAC,
    familyUsage:        tallyByFamily(safeRecords, labelsByItemId),
    surfaceUsage:       tallyBySurface(safeRecords),
    multiSite:          multiSiteRate(safeRecords, labelsByItemId),
    diversity:          diversityScore(safeRecords, labelsByItemId),
    longestFracStreaks: longestStreaksByFrac(safeRecords, labelsByItemId),
    longestStreaks:     longestStreaks(safeRecords, labelsByItemId),
    gaps:               gapsBetween(safeRecords, labelsByItemId),
    chain:              chronologicalChain(safeRecords, labelsByItemId),
    surfaceChains:      surfaceSequences(safeRecords, labelsByItemId),
    highPressure:       highPressureGroups(safeRecords, labelsByItemId),
    drift:              analyzeProgramDrift(safeRecords, labelsByItemId, {
      plannedFracCodes:   options.plannedFracCodes,
      priorSeasonRecords: options.priorSeasonRecords,
    }),
  }
}
