// Phase 23A — Spray Program Intelligence: analytics aggregators.
//
// Pure aggregators that turn a season's spray_records into the totals
// the Program Intelligence page surfaces. Reads chemistry context from
// the Phase 22 layer (FRAC/HRAC/IRAC metadata, active-ingredient
// families, surface families) without owning any of that data itself.
//
// All functions take pre-resolved inputs (records + labelsByItemId) so
// the call site can memoize them once and pass them around. No fetching,
// no React, no side effects.

import {
  recordCodes,
  recordFamilies,
} from '../chemistry/sprayHistoryAnalysis.js'
import { lookupActiveFamily, AI_FAMILIES } from '../chemistry/aiFamilies.js'
import { lookupGroup, RESISTANCE_RISK } from '../chemistry/chemistryMetadata.js'
import { areaSurfaceTypeOf } from '../chemistry/areaHierarchy.js'

// ── Group tallies ────────────────────────────────────────────────────────
//
// Count how many APPLICATIONS used each FRAC/HRAC/IRAC code. An
// application that mixes two FRAC 11 products in one tank still counts
// as one application for FRAC 11 (matches the Phase 22 rotation-
// stewardship semantics — what matters is "how often did this MOA hit
// the surface", not "how many product rows did we deduct").
//
// Returns `{ FRAC, HRAC, IRAC, totalApplications }` where each map is
// an array sorted by descending application count.
//
//   tallyByGroup(records, labelsByItemId)
//     → {
//         FRAC: [{ code: '11', applications: 6, meta: {...} }, ...],
//         HRAC: [...], IRAC: [...],
//         totalApplications: 12,
//       }

export function tallyByGroup(records, labelsByItemId) {
  /** @type {Record<'FRAC'|'HRAC'|'IRAC', Map<string, number>>} */
  const buckets = { FRAC: new Map(), HRAC: new Map(), IRAC: new Map() }
  let totalApplications = 0
  for (const rec of records ?? []) {
    totalApplications += 1
    const codes = recordCodes(rec, labelsByItemId)
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const code of codes[type]) {
        buckets[type].set(code, (buckets[type].get(code) ?? 0) + 1)
      }
    }
  }
  const toSorted = (map, type) =>
    Array.from(map.entries())
      .map(([code, applications]) => ({
        code,
        applications,
        meta: lookupGroup(type, code),
      }))
      .sort((a, b) => b.applications - a.applications)
  return {
    FRAC: toSorted(buckets.FRAC, 'FRAC'),
    HRAC: toSorted(buckets.HRAC, 'HRAC'),
    IRAC: toSorted(buckets.IRAC, 'IRAC'),
    totalApplications,
  }
}

// ── Family tallies ───────────────────────────────────────────────────────
//
// Active-ingredient family frequency. Mirrors tallyByGroup() but resolves
// families through the Phase 22C aiFamilies lookup so different molecules
// in the same family (azoxystrobin + pyraclostrobin → QOI) roll up.
//
// Applications that include no recognized actives are not silently dropped;
// they're surfaced via `unresolvedApplications` so the UI can show
// "X apps have no family attribution".

export function tallyByFamily(records, labelsByItemId) {
  const counts = new Map()
  let unresolvedApplications = 0
  let totalApplications = 0
  for (const rec of records ?? []) {
    totalApplications += 1
    const fams = recordFamilies(rec, labelsByItemId, lookupActiveFamily)
    if (fams.families.size === 0) unresolvedApplications += 1
    for (const code of fams.families) {
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
  }
  const families = Array.from(counts.entries())
    .map(([code, applications]) => ({
      code,
      applications,
      family: AI_FAMILIES[code] ?? null,
    }))
    .sort((a, b) => b.applications - a.applications)
  return { families, totalApplications, unresolvedApplications }
}

// ── Surface tallies ──────────────────────────────────────────────────────
//
// Application counts grouped by the surface family (greens/tees/fairways/
// rough/native/practice/...) derived from the record's area. Records
// whose area doesn't resolve to a known family bucket as 'unspecified'
// — they're NOT dropped, just labeled honestly.

export function tallyBySurface(records) {
  const counts = new Map()
  let totalApplications = 0
  for (const rec of records ?? []) {
    totalApplications += 1
    const surface = areaSurfaceTypeOf(rec?.area) ?? 'unspecified'
    counts.set(surface, (counts.get(surface) ?? 0) + 1)
  }
  const surfaces = Array.from(counts.entries())
    .map(([surface, applications]) => ({ surface, applications }))
    .sort((a, b) => b.applications - a.applications)
  return { surfaces, totalApplications }
}

// ── Multi-site partner rate ──────────────────────────────────────────────
//
// What fraction of total applications included AT LEAST ONE multi-site
// contact fungicide? This is the headline metric for resistance-
// stewardship hygiene: programs that rotate aggressively but never
// include a multi-site partner are still single-site-dependent.
//
// Multi-site detection uses FRAC group codes M1/M3/M5/29 (chemistry
// metadata classifies these as low-risk multi-site).

const MULTI_SITE_FRAC_CODES = new Set(['M1', 'M3', 'M5', '29'])

export function multiSiteRate(records, labelsByItemId) {
  let total = 0
  let withPartner = 0
  for (const rec of records ?? []) {
    total += 1
    const codes = recordCodes(rec, labelsByItemId)
    let hit = false
    for (const c of codes.FRAC) {
      if (MULTI_SITE_FRAC_CODES.has(c)) { hit = true; break }
    }
    if (hit) withPartner += 1
  }
  return {
    totalApplications: total,
    withPartner,
    rate: total > 0 ? withPartner / total : 0,
  }
}

// ── Consecutive-use metrics ──────────────────────────────────────────────
//
// For each FRAC code that appears in the season, return the longest
// CONSECUTIVE run of applications including that code on the same
// surface (a "streak"). Surface scope matters — applying FRAC 11 to
// Greens then to Fairways isn't a Greens streak.
//
// Returns sorted by streak length (descending). Single-app codes are
// included with streak=1 so the UI can decide whether to show them.

export function longestStreaksByFrac(records, labelsByItemId) {
  const sorted = (records ?? [])
    .slice()
    .filter(r => r?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  // Group records by surface so we can compute per-surface streaks.
  /** @type {Map<string, Array<{rec: any, codes: Set<string>}>>} */
  const bySurface = new Map()
  for (const rec of sorted) {
    const surface = areaSurfaceTypeOf(rec.area) ?? 'unspecified'
    const codes = recordCodes(rec, labelsByItemId).FRAC
    if (!bySurface.has(surface)) bySurface.set(surface, [])
    bySurface.get(surface).push({ rec, codes })
  }

  /** @type {Map<string, { streak: number, surface: string, endsOn: string|null }>} */
  const best = new Map()
  for (const [surface, list] of bySurface) {
    // For each code seen on this surface, find the longest run of
    // CONSECUTIVE applications that include it.
    const codesOnSurface = new Set()
    for (const x of list) for (const c of x.codes) codesOnSurface.add(c)
    for (const code of codesOnSurface) {
      let cur = 0, max = 0, endsOn = null
      for (const x of list) {
        if (x.codes.has(code)) {
          cur += 1
          if (cur > max) { max = cur; endsOn = x.rec.date }
        } else {
          cur = 0
        }
      }
      const existing = best.get(code)
      if (!existing || max > existing.streak) {
        best.set(code, { streak: max, surface, endsOn })
      }
    }
  }
  return Array.from(best.entries())
    .map(([code, v]) => ({ code, ...v, meta: lookupGroup('FRAC', code) }))
    .sort((a, b) => b.streak - a.streak)
}

// ── Diversity score (Shannon entropy, normalized) ───────────────────────
//
// Quantifies how evenly applications are distributed across distinct FRAC
// codes. 0.0 = single-code monoculture, 1.0 = perfectly even distribution
// across all codes seen.
//
// Formula:  H  = -Σ p_i * ln(p_i)   over each code's share of total apps
//           H' = H / ln(k)          where k = number of distinct codes
//
// When k <= 1 we return 0 explicitly — a single-code program has no
// diversity regardless of how many apps it ran. With no apps at all we
// return null so the UI can render "—" instead of a false zero.

export function diversityScore(records, labelsByItemId) {
  const tally = tallyByGroup(records, labelsByItemId)
  const fracList = tally.FRAC
  const totalCodeApps = fracList.reduce((s, e) => s + e.applications, 0)
  if (totalCodeApps === 0) return { score: null, distinctCodes: 0, totalApplications: tally.totalApplications }
  const k = fracList.length
  if (k <= 1) {
    return { score: 0, distinctCodes: k, totalApplications: tally.totalApplications }
  }
  let H = 0
  for (const entry of fracList) {
    const p = entry.applications / totalCodeApps
    if (p > 0) H += -p * Math.log(p)
  }
  const Hmax = Math.log(k)
  const norm = Hmax > 0 ? H / Hmax : 0
  return {
    score:             +norm.toFixed(3),
    distinctCodes:     k,
    totalApplications: tally.totalApplications,
  }
}

// ── High-pressure-group identification ───────────────────────────────────
//
// Returns FRAC codes that meet two stewardship-relevant criteria:
//   1. classified as high-risk in chemistryMetadata, AND
//   2. account for >= 25% of resolved FRAC applications.
//
// The 25% threshold is conservative — it's a stewardship hint, not a
// blocker. Caller decides how to render it.

const HIGH_PRESSURE_SHARE_THRESHOLD = 0.25

export function highPressureGroups(records, labelsByItemId) {
  const tally = tallyByGroup(records, labelsByItemId)
  const fracList = tally.FRAC
  const totalCodeApps = fracList.reduce((s, e) => s + e.applications, 0)
  if (totalCodeApps === 0) return []
  return fracList
    .filter(e => e.meta?.riskLevel === RESISTANCE_RISK.HIGH)
    .map(e => ({
      code:        e.code,
      applications: e.applications,
      share:        e.applications / totalCodeApps,
      meta:         e.meta,
    }))
    .filter(e => e.share >= HIGH_PRESSURE_SHARE_THRESHOLD)
    .sort((a, b) => b.share - a.share)
}
