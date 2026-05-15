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
  parseActiveIngredients,
  parseGroupCodes,
} from './chemistryStructures.js'
import {
  filterByLookback,
  filterByArea,
  countApplicationsByGroup,
  detectRepeatedMOA,
  daysSinceLastUse,
} from './sprayHistoryAnalysis.js'

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

function buildRepeatedMOAWarning(repeat, meta, daysSince) {
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
    evidence: { type, code, meta, applications, consecutivePrior, lastDate, daysSince },
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

export function analyzeSprayDraft({
  tankProducts,
  sprayHistory,
  labelsByItemId,
  draftArea,
  referenceDate,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
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

  // 2. History — filter to the operative window + area.
  const inWindow = filterByLookback(sprayHistory, referenceDate, lookbackDays)
  const inArea   = filterByArea(inWindow, draftArea)
  const applicationsByGroup = countApplicationsByGroup(inArea, labels)

  // 3. Repeated MOA — only check codes the draft actually plans to apply.
  const planned = []
  for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
    for (const entry of tankCodes[type]) {
      planned.push({ type, code: entry.code })
    }
  }
  const repeatedMOA = detectRepeatedMOA(planned, inArea, labels)

  // ── Compose warnings ───────────────────────────────────────────────────
  const warnings = []

  // (a) Duplicate active ingredients across tank products.
  for (const dup of duplicateActives) {
    warnings.push(buildDuplicateActiveWarning(dup))
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

  // (c) Repeated MOA in the lookback window for this area.
  for (const r of repeatedMOA) {
    if (r.applications === 0) continue
    const meta = lookupGroup(r.type, r.code)
    const days = daysSinceLastUse(r.type, r.code, inArea, labels, referenceDate)
    warnings.push(buildRepeatedMOAWarning(r, meta, days))
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
      applicationsByGroup,
      repeatedMOA,
      resolvedHistoryCount: inArea.length,
      lookbackDays,
      area: draftArea ?? null,
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
