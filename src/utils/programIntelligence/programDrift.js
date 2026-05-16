// Phase 23A — Spray Program Intelligence: drift detection.
//
// Pure helpers that compare actual applications to either a planned
// rotation or a prior-season baseline, and surface INFORMATIONAL
// findings about stewardship drift. Drift findings are never gates and
// never imply automatic action — they're inputs for a human to read.
//
// Output shape matches the Phase 22 warning model so the eventual UI
// can render drift findings alongside per-tank warnings without a
// second component:
//
//   { severity: 'info'|'warn'|'high', code, title, detail, evidence }
//
// Pure functions, no I/O, no React.

import { tallyByGroup, diversityScore, highPressureGroups } from './programAnalytics.js'
import { RESISTANCE_RISK, lookupGroup } from '../chemistry/chemistryMetadata.js'

const SEVERITY = { INFO: 'info', WARN: 'warn', HIGH: 'high' }

// ── Compare to a planned rotation ───────────────────────────────────────
//
// `planned` is an optional list of FRAC codes the program intended to
// rotate through this season — e.g. ['M5', '11', '3', '7']. If the
// caller has no planned baseline, pass [] and we'll skip this check.
//
// Findings:
//   - missing-from-actual    a planned code never appeared in the season
//   - unplanned-in-actual    a code appeared that wasn't in the plan
//
// "Unplanned" is INFO severity by default — it's common and expected
// (in-season disease outbreaks, label changes). Missing planned codes
// are WARN because they signal the rotation didn't execute as designed.

export function compareToPlannedRotation(actualRecords, plannedFracCodes, labelsByItemId) {
  const findings = []
  if (!Array.isArray(plannedFracCodes) || plannedFracCodes.length === 0) {
    return findings
  }
  const tally = tallyByGroup(actualRecords, labelsByItemId)
  const actualCodes = new Set(tally.FRAC.map(e => e.code))
  const plannedSet  = new Set(plannedFracCodes.map(c => String(c).toUpperCase()))

  for (const code of plannedSet) {
    if (!actualCodes.has(code)) {
      const meta = lookupGroup('FRAC', code)
      findings.push({
        severity: SEVERITY.WARN,
        code:     'planned-not-applied',
        title:    `Planned FRAC ${code} never applied`,
        detail:   meta.recognized
          ? `${meta.name} was in the planned rotation but did not appear in any application this season.`
          : `FRAC ${code} was in the planned rotation but did not appear in any application this season.`,
        evidence: { code, meta },
      })
    }
  }
  for (const code of actualCodes) {
    if (!plannedSet.has(code)) {
      const entry = tally.FRAC.find(e => e.code === code)
      const meta = lookupGroup('FRAC', code)
      findings.push({
        severity: SEVERITY.INFO,
        code:     'unplanned-applied',
        title:    `FRAC ${code} applied off-plan`,
        detail:   `Code ${code} was used in ${entry?.applications ?? 0} application(s) but is not in the planned rotation.`,
        evidence: { code, meta, applications: entry?.applications ?? 0 },
      })
    }
  }
  return findings
}

// ── Dependency concentration ────────────────────────────────────────────
//
// Flag when a single FRAC code or family carries a large share of the
// season's applications. Distinct from highPressureGroups() in
// programAnalytics — that one keys off resistance risk. This one is
// risk-agnostic; it surfaces concentration of ANY single code.
//
// Thresholds (informational only):
//   share >= 0.50  →  high
//   share >= 0.35  →  warn
//   share >= 0.25  →  info

export function dependencyConcentration(records, labelsByItemId) {
  const tally = tallyByGroup(records, labelsByItemId)
  const total = tally.FRAC.reduce((s, e) => s + e.applications, 0)
  if (total === 0) return []
  const findings = []
  for (const entry of tally.FRAC) {
    const share = entry.applications / total
    let severity = null
    if (share >= 0.50) severity = SEVERITY.HIGH
    else if (share >= 0.35) severity = SEVERITY.WARN
    else if (share >= 0.25) severity = SEVERITY.INFO
    if (!severity) continue
    findings.push({
      severity,
      code:    'dependency-concentration',
      title:   `FRAC ${entry.code} carries ${Math.round(share * 100)}% of applications`,
      detail:  entry.meta?.recognized
        ? `${entry.meta.name} accounts for ${entry.applications} of ${total} FRAC-coded applications. Reduce reliance with rotation partners.`
        : `${entry.applications} of ${total} FRAC-coded applications used code ${entry.code}.`,
      evidence: { code: entry.code, applications: entry.applications, total, share, meta: entry.meta },
    })
  }
  return findings.sort((a, b) => b.evidence.share - a.evidence.share)
}

// ── Diversity degradation ───────────────────────────────────────────────
//
// Compare the current season's FRAC diversity score to a prior-season
// baseline. Returns null when either input is missing or empty so the
// caller can render "no comparison available" honestly.
//
// Drop thresholds (informational only):
//   delta <= -0.20  →  warn   ("significant degradation")
//   delta <= -0.10  →  info   ("minor degradation")
//   otherwise null

export function diversityDegradation(currentRecords, priorRecords, labelsByItemId) {
  const current = diversityScore(currentRecords, labelsByItemId)
  const prior   = diversityScore(priorRecords, labelsByItemId)
  if (current.score == null || prior.score == null) return null
  const delta = +(current.score - prior.score).toFixed(3)
  let severity = null
  if (delta <= -0.20) severity = SEVERITY.WARN
  else if (delta <= -0.10) severity = SEVERITY.INFO
  if (!severity) return { severity: null, delta, current, prior }
  return {
    severity,
    code:     'diversity-degradation',
    title:    `Diversity score dropped ${Math.abs(delta).toFixed(2)} vs prior season`,
    detail:   `FRAC diversity moved from ${prior.score.toFixed(2)} (k=${prior.distinctCodes}) to ${current.score.toFixed(2)} (k=${current.distinctCodes}).`,
    evidence: { delta, current, prior },
  }
}

// ── Compose all drift findings ──────────────────────────────────────────
//
// One-call entry point for the page. `options.plannedFracCodes` and
// `options.priorSeasonRecords` are both optional — when missing, the
// corresponding sub-analysis is skipped.

export function analyzeProgramDrift(records, labelsByItemId, options = {}) {
  const findings = []
  const planned = options.plannedFracCodes ?? null
  if (Array.isArray(planned) && planned.length > 0) {
    findings.push(...compareToPlannedRotation(records, planned, labelsByItemId))
  }
  findings.push(...dependencyConcentration(records, labelsByItemId))
  if (Array.isArray(options.priorSeasonRecords)) {
    const dd = diversityDegradation(records, options.priorSeasonRecords, labelsByItemId)
    if (dd && dd.severity) findings.push(dd)
  }
  // High-pressure groups → informational drift signal too (separate from
  // the analytics roll-up so all drift items render in one list).
  for (const hp of highPressureGroups(records, labelsByItemId)) {
    findings.push({
      severity: hp.share >= 0.40 ? SEVERITY.WARN : SEVERITY.INFO,
      code:     'high-pressure-group',
      title:    `High-pressure ${hp.meta.recognized ? hp.meta.name : `FRAC ${hp.code}`} at ${Math.round(hp.share * 100)}%`,
      detail:   `Single-site MOA classified as high-risk in chemistry metadata. Stewardship guidance: limit consecutive applications and pair with a multi-site partner.`,
      evidence: { code: hp.code, applications: hp.applications, share: hp.share, meta: hp.meta },
    })
  }
  // Stable sort: highest severity first.
  const SEV_ORDER = { high: 2, warn: 1, info: 0 }
  findings.sort((a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1))
  return findings
}

export { SEVERITY }
export const RISK = RESISTANCE_RISK
