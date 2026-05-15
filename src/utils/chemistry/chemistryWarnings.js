// Phase 22A — Chemistry Intelligence: warning model.
//
// Translates the raw analyses produced by chemistryStructures.js and
// sprayHistoryAnalysis.js into a flat array of warning objects the UI
// can render uniformly. Warnings are INFORMATIONAL — Phase 22 explicitly
// does NOT block applications. The spray builder consumes these and
// shows them next to the existing tank summary; the commit pipeline is
// untouched.
//
// Warning shape (stable contract — Spray Builder will key off this):
//   {
//     severity: 'info' | 'warn' | 'high',
//     code:     stable identifier (e.g. 'duplicate-active'),
//     title:    short headline for the UI chip/badge
//     detail:   one-sentence human-readable explanation
//     evidence: structured object carrying the data behind the warning
//   }
//
// Severity vocabulary:
//   info  — Worth surfacing, but no rotation/stewardship concern. E.g. a
//           code on a single tank product where no recent history exists.
//   warn  — Acceptable but the operator should consider whether a rotation
//           partner is in play. E.g. medium-risk MOA repeated within window.
//   high  — Best-practice stewardship would change this mix. E.g. a third
//           consecutive high-risk MOA on the same surface, or duplicate
//           active ingredients in the same tank.
//
// Severities map to the canonical 5-level system in
// src/utils/intelligence/severity.js as:
//   'info' → 'info', 'warn' → 'warning', 'high' → 'critical'.
// The UI layer (Phase 22B) can use SEVERITY_TOKENS via that map if it
// wants existing palette colors.

import { lookupGroup, RESISTANCE_RISK } from './chemistryMetadata.js'
import {
  aggregateTankCodes,
  findDuplicateActives,
  findDuplicateActiveFamilies,
  parseActiveIngredients,
  parseGroupCodes,
} from './chemistryStructures.js'
import {
  filterByLookback,
  filterByArea,
  countApplicationsByGroup,
  detectRepeatedMOA,
  detectRepeatedFamily,
  daysSinceLastUse,
  indexRecordsById,
} from './sprayHistoryAnalysis.js'
import { lookupActiveFamily, AI_FAMILIES } from './aiFamilies.js'
import { buildMOATimeline, formatSequence } from './sequenceFormat.js'

export const SEVERITY = {
  INFO: 'info',
  WARN: 'warn',
  HIGH: 'high',
}

// Severity arithmetic — "the worse of A and B".
const SEV_ORDER = { info: 0, warn: 1, high: 2 }
function worse(a, b) {
  return SEV_ORDER[b] > SEV_ORDER[a] ? b : a
}

// ── Per-warning builders ──────────────────────────────────────────────────

/**
 * Map a resistance-risk level + repeat count into a severity. The exact
 * thresholds are deliberately conservative so the UI doesn't cry wolf:
 *
 *   3+ consecutive prior + high-risk MOA  → high
 *   2+ consecutive prior + high-risk MOA  → warn
 *   2+ consecutive prior + medium-risk    → warn
 *   any single prior in window            → info
 */
function severityForRepeat(riskLevel, consecutivePrior, applications) {
  if (riskLevel === RESISTANCE_RISK.HIGH) {
    if (consecutivePrior >= 3) return SEVERITY.HIGH
    if (consecutivePrior >= 2) return SEVERITY.WARN
    if (applications >= 2)     return SEVERITY.WARN
    if (applications >= 1)     return SEVERITY.INFO
  }
  if (riskLevel === RESISTANCE_RISK.MEDIUM) {
    if (consecutivePrior >= 3) return SEVERITY.WARN
    if (consecutivePrior >= 2) return SEVERITY.WARN
    if (applications >= 2)     return SEVERITY.INFO
    if (applications >= 1)     return SEVERITY.INFO
  }
  // LOW or UNKNOWN — never higher than info on repeat alone.
  if (applications >= 1) return SEVERITY.INFO
  return null
}

function buildDuplicateActiveWarning(dup) {
  const productNames = dup.products.map(p => p.productName).join(' + ')
  return {
    severity: SEVERITY.HIGH,
    code: 'duplicate-active',
    title: `Duplicate active ingredient — ${dup.displayName}`,
    detail: `${dup.displayName} appears in ${dup.products.length} tank products (${productNames}). Doubling the active raises the effective rate and may exceed labeled limits.`,
    evidence: {
      activeKey: dup.activeKey,
      displayName: dup.displayName,
      products: dup.products,
    },
  }
}

function buildSameTankSameCodeWarning(type, code, products, meta) {
  const productNames = products.map(p => p.productName).join(' + ')
  const recognized = meta.recognized
  const riskLevel = meta.riskLevel
  // Multiple products sharing a code is mostly an FYI unless the MOA is
  // high-risk, where it compresses the rotation window inside a single
  // application.
  const severity = riskLevel === RESISTANCE_RISK.HIGH ? SEVERITY.WARN : SEVERITY.INFO
  return {
    severity,
    code: 'same-tank-shared-moa',
    title: recognized
      ? `${type} ${code} appears in ${products.length} tank products`
      : `${type} ${code} appears in ${products.length} tank products (uncategorized code)`,
    detail: recognized
      ? `${productNames} share ${type} ${code} — ${meta.name}. Stacking same-MOA products in one tank can shorten the resistance-management window even when each product is below its individual cap.`
      : `${productNames} share ${type} ${code}. This code isn't in the chemistry metadata yet — verify the label.`,
    evidence: { type, code, products, meta },
  }
}

function buildRepeatedMOAWarning(repeat, meta, daysSince, sequence) {
  const { type, code, applications, consecutivePrior, lastDate } = repeat
  const recognized = meta.recognized
  const riskLevel = meta.riskLevel
  const sev = severityForRepeat(riskLevel, consecutivePrior, applications) ?? SEVERITY.INFO

  const headline =
    consecutivePrior >= 2
      ? `${type} ${code} would be ${consecutivePrior + 1} in a row`
      : `${type} ${code} recently applied`

  let detail
  if (recognized) {
    detail = `${meta.name} (${riskLevel}-risk MOA). ${applications} prior application${applications === 1 ? '' : 's'} in the lookback window${consecutivePrior >= 2 ? `, including the ${consecutivePrior} most-recent consecutively.` : '.'}${daysSince != null ? ` Last use ${daysSince} day${daysSince === 1 ? '' : 's'} ago.` : ''}`
  } else {
    detail = `Code ${code} isn't in the chemistry metadata yet, so resistance risk is unknown. ${applications} prior application${applications === 1 ? '' : 's'} found in the lookback window.${daysSince != null ? ` Last use ${daysSince} day${daysSince === 1 ? '' : 's'} ago.` : ''}`
  }

  return {
    severity: sev,
    code: 'repeated-moa',
    title: headline,
    detail,
    evidence: {
      type, code, meta, applications, consecutivePrior, lastDate, daysSince,
      // Phase 22C — chronological chain of prior applications that hit
      // this MOA, capped with a synthetic { isCurrent: true } entry for
      // the planned tank. UI renders this as a compact timeline.
      sequence:      sequence ?? null,
      sequenceLabel: sequence ? formatSequence(sequence) : null,
    },
  }
}

// ── Family-level repeated-MOA warning (Phase 22C) ───────────────────────
//
// Same severity ladder as buildRepeatedMOAWarning, but keyed off the
// active-ingredient family (QoI / DMI / SDHI / ...). Risk level is read
// off the family's representative FRAC group when available — that
// keeps the severity math consistent: a QoI-family repeat is high-risk
// because FRAC 11 is high-risk.

function familyRiskLevel(familyCode) {
  const fam = AI_FAMILIES[familyCode]
  if (!fam) return RESISTANCE_RISK.UNKNOWN
  if (fam.fracGroup) {
    const m = lookupGroup('FRAC', fam.fracGroup)
    if (m.recognized) return m.riskLevel
  }
  if (fam.hracGroup) {
    const m = lookupGroup('HRAC', fam.hracGroup)
    if (m.recognized) return m.riskLevel
  }
  if (fam.iracGroup) {
    const m = lookupGroup('IRAC', fam.iracGroup)
    if (m.recognized) return m.riskLevel
  }
  return RESISTANCE_RISK.UNKNOWN
}

function buildRepeatedFamilyWarning(repeat) {
  const { familyCode, applications, consecutivePrior, lastDate } = repeat
  const fam = AI_FAMILIES[familyCode]
  const riskLevel = familyRiskLevel(familyCode)
  const sev = severityForRepeat(riskLevel, consecutivePrior, applications) ?? SEVERITY.INFO

  const familyLabel = fam?.name ?? familyCode
  const headline =
    consecutivePrior >= 2
      ? `${familyLabel} would be ${consecutivePrior + 1} in a row`
      : `${familyLabel} family recently applied`

  const detail = `${applications} prior application${applications === 1 ? '' : 's'} in the lookback window included a ${familyLabel} active${consecutivePrior >= 2 ? `, ${consecutivePrior} consecutively.` : '.'}${fam?.notes ? ` ${fam.notes}` : ''}`

  return {
    severity: sev,
    code: 'repeated-family',
    title: headline,
    detail,
    evidence: { familyCode, riskLevel, applications, consecutivePrior, lastDate, family: fam ?? null },
  }
}

function buildDuplicateActiveFamilyWarning(dup) {
  const productList = dup.products.map(p => `${p.productName} (${p.activeName})`).join(' + ')
  return {
    severity: SEVERITY.WARN,
    code: 'duplicate-active-family',
    title: `${dup.displayName} stacked in tank`,
    detail: `${productList} share the ${dup.displayName} family. Multiple same-family actives in one application compress the rotation window even when each molecule is distinct.`,
    evidence: { familyCode: dup.familyCode, displayName: dup.displayName, products: dup.products },
  }
}

// ── Public entry: build all warnings for a draft tank mix ────────────────
//
// Input shape:
//   {
//     tankProducts: [{ id, name, label }]                — products in the
//        draft (label may be null if the inventory item has no label row)
//     sprayHistory: [...spray_records]                   — raw records from
//        useSpraysData() (full course-scoped history)
//     labelsByItemId: { [inventoryItemId]: labelRow }    — lookup table for
//        history products; built by the UI layer from useImportedLabels()
//     draftArea: string                                  — area being treated
//     referenceDate: 'YYYY-MM-DD'                        — draft.date
//     lookbackDays: number                               — default 21
//   }
//
// Output:
//   {
//     warnings: [...warning objects],
//     summary: {
//       tankCodes:       { FRAC: [...], HRAC: [...], IRAC: [...] },
//       duplicateActives: [...],
//       applicationsByGroup: { FRAC: [...], HRAC: [...], IRAC: [...], unresolvedRecords },
//       repeatedMOA:     [...],
//       resolvedHistoryCount, lookbackDays, area,
//     },
//   }

const DEFAULT_LOOKBACK_DAYS = 21

/**
 * @param {Object} opts
 * @param {Array<{id: string, name: string, label: Object|null}>} opts.tankProducts
 * @param {Array<Object>} opts.sprayHistory
 * @param {Record<string, Object>} opts.labelsByItemId
 * @param {string} opts.draftArea
 * @param {string} opts.referenceDate            'YYYY-MM-DD'
 * @param {number} [opts.lookbackDays]           default 21
 * @param {'exact'|'family'} [opts.areaMatchMode] Phase 22C — default 'exact'
 * @param {string|null} [opts.areaType]          Phase 22C — surface-type
 *                                                slug (greens/tees/...);
 *                                                informational only
 */
export function analyzeSprayDraft({
  tankProducts,
  sprayHistory,
  labelsByItemId,
  draftArea,
  referenceDate,
  lookbackDays    = DEFAULT_LOOKBACK_DAYS,
  areaMatchMode   = 'exact',
  areaType        = null,
} = {}) {
  const products = Array.isArray(tankProducts) ? tankProducts : []
  const labels = labelsByItemId ?? {}

  // 1. Tank-level structural facts.
  const tankCodes = aggregateTankCodes(products)
  // Hydrate each tank product's actives for the duplicate detector.
  const tankForDupes = products.map(p => ({
    id: p.id,
    name: p.name,
    actives: parseActiveIngredients(p.label?.activeIngredients ?? p.activeIngredients ?? null),
  }))
  const duplicateActives = findDuplicateActives(tankForDupes)
  // Phase 22C — family-level duplicate detection. Reuses the same active-
  // hydrated tank shape; family resolution comes from aiFamilies.
  const duplicateFamilies = findDuplicateActiveFamilies(tankForDupes, lookupActiveFamily)

  // 2. History — filter to the operative window + area.
  const inWindow = filterByLookback(sprayHistory, referenceDate, lookbackDays)
  const inArea   = filterByArea(inWindow, draftArea, areaMatchMode)
  const applicationsByGroup = countApplicationsByGroup(inArea, labels)
  const historyByRecordId   = indexRecordsById(inArea)

  // 3. Repeated MOA — only check codes the draft actually plans to apply.
  const planned = []
  for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
    for (const entry of tankCodes[type]) {
      planned.push({ type, code: entry.code })
    }
  }
  const repeatedMOA = detectRepeatedMOA(planned, inArea, labels)

  // 4. Phase 22C — repeated FAMILY analysis. Plan the families implied by
  // the tank's actives so we can flag "QoI applied 2× recently + planned
  // again here" even when the specific molecules differ.
  const plannedFamilies = []
  const seenFamily = new Set()
  for (const tp of tankForDupes) {
    for (const a of tp.actives) {
      const fam = lookupActiveFamily(a.name)
      if (fam?.code && !seenFamily.has(fam.code)) {
        seenFamily.add(fam.code)
        plannedFamilies.push({ familyCode: fam.code })
      }
    }
  }
  const repeatedFamily = detectRepeatedFamily(plannedFamilies, inArea, labels, lookupActiveFamily)

  // ── Compose warnings ───────────────────────────────────────────────────
  const warnings = []

  // (a) Duplicate active ingredients across tank products.
  for (const dup of duplicateActives) {
    warnings.push(buildDuplicateActiveWarning(dup))
  }

  // (a.2) Phase 22C — duplicate active FAMILIES. Suppressed when the same
  // pair is already covered by the per-active duplicate detector (same
  // products, same family) — avoids double-flagging "chlorothalonil x2"
  // as both a duplicate-active AND a duplicate-active-family warning.
  const duplicateActiveProductSets = new Set(
    duplicateActives.map(d => d.products.map(p => p.productId ?? p.productName).sort().join('|')),
  )
  for (const dup of duplicateFamilies) {
    const key = dup.products.map(p => p.productId ?? p.productName).sort().join('|')
    if (!duplicateActiveProductSets.has(key)) {
      warnings.push(buildDuplicateActiveFamilyWarning(dup))
    }
  }

  // (b) Same-tank shared MOA. Only flag when 2+ products share a code.
  for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
    for (const entry of tankCodes[type]) {
      if (entry.products.length >= 2) {
        const meta = lookupGroup(type, entry.code)
        warnings.push(buildSameTankSameCodeWarning(type, entry.code, entry.products, meta))
      }
    }
  }

  // (c) Repeated MOA in the lookback window for this area. Phase 22C —
  // attach the per-warning timeline / compact sequence to evidence.
  for (const r of repeatedMOA) {
    if (r.applications === 0) continue
    const meta = lookupGroup(r.type, r.code)
    const days = daysSinceLastUse(r.type, r.code, inArea, labels, referenceDate)
    const sequence = buildMOATimeline({
      code:              r.code,
      type:              r.type,
      records:           r.records,
      historyByRecordId,
      labelsByItemId:    labels,
      referenceDate,
      draftArea,
    })
    warnings.push(buildRepeatedMOAWarning(r, meta, days, sequence))
  }

  // (d) Phase 22C — repeated FAMILY warnings. Skip when (i) the family
  // has no prior applications in the window, or (ii) every prior app
  // that contributed to the family is already covered by a more-specific
  // repeated-moa warning (same code(s)). The second rule prevents the
  // family warning from duplicating an MOA-code warning that says the
  // same thing.
  const repeatedMoaCodes = new Set(repeatedMOA.filter(r => r.applications > 0).map(r => r.code))
  for (const r of repeatedFamily) {
    if (r.applications === 0) continue
    const fam = AI_FAMILIES[r.familyCode]
    // Suppression: if the family maps directly to a FRAC/HRAC/IRAC code
    // that already produced a repeated-moa warning, the family info is
    // redundant.
    const directGroupCode = fam?.fracGroup ?? fam?.hracGroup ?? fam?.iracGroup ?? null
    if (directGroupCode && repeatedMoaCodes.has(directGroupCode)) continue
    warnings.push(buildRepeatedFamilyWarning(r))
  }

  // Stable sort: highest severity first; then by code so output is stable
  // across re-renders.
  warnings.sort((a, b) => {
    const sev = (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1)
    if (sev !== 0) return sev
    return String(a.code).localeCompare(String(b.code))
  })

  return {
    warnings,
    summary: {
      tankCodes,
      duplicateActives,
      duplicateFamilies,
      applicationsByGroup,
      repeatedMOA,
      repeatedFamily,
      resolvedHistoryCount: inArea.length,
      lookbackDays,
      area:           draftArea ?? null,
      areaType:       areaType ?? null,
      areaMatchMode,
    },
  }
}

// ── Helper: roll up the highest severity present in a set of warnings ────
// Useful for chip/badge tones at the panel header level.

export function highestSeverity(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null
  let s = SEVERITY.INFO
  for (const w of warnings) {
    s = worse(s, w.severity ?? SEVERITY.INFO)
    if (s === SEVERITY.HIGH) return s
  }
  return s
}

// ── Severity-vocabulary bridge ───────────────────────────────────────────
//
// The shared TurfIntel severity system uses 'info' | 'warning' | 'critical'.
// Phase 22 spec uses 'info' | 'warn' | 'high'. The bridge keeps the UI
// flexible — Phase 22B can pick either vocabulary and stay consistent
// with existing intelligence components.

export const SEVERITY_TO_CANONICAL = {
  info: 'info',
  warn: 'warning',
  high: 'critical',
}
