// Phase 23A — Spray Program Intelligence: chronological sequences.
//
// Pure helpers that turn a season's spray_records into chronological
// MOA chains. Built for the Program Intelligence page — surface-scoped
// timelines, longest consecutive streaks of the SAME code, and the
// day-gaps between successive applications of each code.
//
// Reuses Phase 22C's recordCodes() for code resolution and
// areaSurfaceTypeOf() for surface bucketing. No I/O, no React.

import { recordCodes } from '../chemistry/sprayHistoryAnalysis.js'
import { areaSurfaceTypeOf } from '../chemistry/areaHierarchy.js'
import { fmtShortDate } from '../chemistry/sequenceFormat.js'

// ── Chronological MOA chain ──────────────────────────────────────────────
//
// One entry per spray record, oldest → newest:
//   { date, dateLabel, area, surface, codes: { FRAC: [...], HRAC: [...],
//     IRAC: [...] }, productNames: [...] }
//
// `codes` arrays preserve insertion order from the underlying record
// products. `productNames` is the flat list of product names captured
// on the record (not resolved through labels — the names already live
// on spray_products.name).

export function chronologicalChain(records, labelsByItemId) {
  const sorted = (records ?? [])
    .slice()
    .filter(r => r?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return sorted.map(r => {
    const codes = recordCodes(r, labelsByItemId)
    const productNames = Array.isArray(r.products)
      ? r.products.map(p => p?.name).filter(Boolean)
      : []
    return {
      id:           r.id ?? null,
      date:         r.date,
      dateLabel:    fmtShortDate(r.date) ?? r.date,
      area:         r.area ?? null,
      surface:      areaSurfaceTypeOf(r.area) ?? 'unspecified',
      codes: {
        FRAC: Array.from(codes.FRAC),
        HRAC: Array.from(codes.HRAC),
        IRAC: Array.from(codes.IRAC),
      },
      productNames,
    }
  })
}

// ── Per-surface sequences ───────────────────────────────────────────────
//
// Group the chronological chain by surface family. The map is keyed by
// surface slug (e.g. 'greens', 'fairways'); each value is the subset of
// chain entries for that surface in chronological order.
//
// Surfaces with zero entries are not represented. The output is sorted
// by total entry count (descending) so the UI can lead with the busiest
// surfaces.

export function surfaceSequences(records, labelsByItemId) {
  const chain = chronologicalChain(records, labelsByItemId)
  const groups = new Map()
  for (const entry of chain) {
    if (!groups.has(entry.surface)) groups.set(entry.surface, [])
    groups.get(entry.surface).push(entry)
  }
  return Array.from(groups.entries())
    .map(([surface, entries]) => ({ surface, entries }))
    .sort((a, b) => b.entries.length - a.entries.length)
}

// ── Longest streak per (type, code) ─────────────────────────────────────
//
// `programAnalytics.longestStreaksByFrac()` is FRAC-only and per-surface
// max-across-surfaces; this helper is the general form. Returns the
// streak per (type, code, surface) combination so the UI can render
// "FRAC 11 — 4 consecutive on Greens".
//
// Cap small streaks via `minStreak` (default 2) — single applications
// aren't a streak, they're an application.

export function longestStreaks(records, labelsByItemId, { minStreak = 2 } = {}) {
  const sorted = (records ?? [])
    .slice()
    .filter(r => r?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  /** @type {Map<string, Array<{date: string, codes: Record<string, Set<string>>}>>} */
  const bySurface = new Map()
  for (const rec of sorted) {
    const surface = areaSurfaceTypeOf(rec.area) ?? 'unspecified'
    const codes = recordCodes(rec, labelsByItemId)
    if (!bySurface.has(surface)) bySurface.set(surface, [])
    bySurface.get(surface).push({ date: rec.date, codes })
  }

  const results = []
  for (const [surface, list] of bySurface) {
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      const codesSeen = new Set()
      for (const x of list) for (const c of x.codes[type]) codesSeen.add(c)
      for (const code of codesSeen) {
        let cur = 0, max = 0, startedOn = null, endsOn = null, runStart = null
        for (const x of list) {
          if (x.codes[type].has(code)) {
            if (cur === 0) runStart = x.date
            cur += 1
            if (cur > max) { max = cur; startedOn = runStart; endsOn = x.date }
          } else {
            cur = 0
          }
        }
        if (max >= minStreak) {
          results.push({ type, code, surface, streak: max, startedOn, endsOn })
        }
      }
    }
  }
  return results.sort((a, b) => b.streak - a.streak)
}

// ── Gaps between same-code applications ─────────────────────────────────
//
// For each (type, code) that appears 2+ times in the season, compute the
// gaps in days between successive applications. Returns:
//   { type, code, surface, gaps: [d1, d2, ...],
//     minGapDays, maxGapDays, avgGapDays }
//
// Surface-scoped: gaps are computed within a single surface so an
// application of FRAC 11 to Greens then to Fairways isn't reported as
// a 0-day gap.

function dayDiff(a, b) {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.round((db - da) / (1000 * 60 * 60 * 24))
}

export function gapsBetween(records, labelsByItemId) {
  const sorted = (records ?? [])
    .slice()
    .filter(r => r?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  /** @type {Map<string, Map<string, string[]>>} */
  // surface → "type|code" → ordered list of dates
  const bySurface = new Map()
  for (const rec of sorted) {
    const surface = areaSurfaceTypeOf(rec.area) ?? 'unspecified'
    const codes = recordCodes(rec, labelsByItemId)
    if (!bySurface.has(surface)) bySurface.set(surface, new Map())
    const m = bySurface.get(surface)
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const code of codes[type]) {
        const key = `${type}|${code}`
        if (!m.has(key)) m.set(key, [])
        m.get(key).push(rec.date)
      }
    }
  }

  const out = []
  for (const [surface, m] of bySurface) {
    for (const [key, dates] of m) {
      if (dates.length < 2) continue
      const gaps = []
      for (let i = 1; i < dates.length; i++) {
        const g = dayDiff(dates[i - 1], dates[i])
        if (g != null) gaps.push(g)
      }
      if (gaps.length === 0) continue
      const [type, code] = key.split('|')
      const sum = gaps.reduce((s, x) => s + x, 0)
      out.push({
        type,
        code,
        surface,
        gaps,
        minGapDays: Math.min(...gaps),
        maxGapDays: Math.max(...gaps),
        avgGapDays: +(sum / gaps.length).toFixed(1),
      })
    }
  }
  return out.sort((a, b) => a.minGapDays - b.minGapDays)
}
