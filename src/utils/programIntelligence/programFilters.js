// Phase 23B — Spray Program Intelligence: client-side filter helpers.
//
// Pure, additive filtering layer on top of Phase 23A. Takes the same
// spray_records + labelsByItemId the Program Intelligence page already
// subscribes to and narrows them by date / surface / pressure before
// the summary is built. A separate post-summary view filter restricts
// chemistry-type display (FRAC vs HRAC vs IRAC) without re-running
// aggregation.
//
// All functions are pure: same inputs → same outputs, no I/O, no React.

import { areaSurfaceTypeOf } from '../chemistry/areaHierarchy.js'
import { recordCodes } from '../chemistry/sprayHistoryAnalysis.js'
import { lookupGroup, RESISTANCE_RISK } from '../chemistry/chemistryMetadata.js'

// ── Date filtering ───────────────────────────────────────────────────────
//
// Presets the page surfaces in its date dropdown. Each one is resolved to
// a `{ start, end }` window (inclusive, ISO YYYY-MM-DD strings) so the
// downstream filter stays a simple range check. The reference date defaults
// to "today" — the page passes it in explicitly to keep the helper testable.
//
// 'currentSeason' uses the northern-hemisphere turf-program convention:
// Apr 1 → Oct 31 of the reference year. Users on a different cycle can
// switch to 'ytd' or 'custom'.

export const DATE_PRESETS = [
  { value: 'currentSeason', label: 'Current season' },
  { value: 'last30',        label: 'Last 30 days' },
  { value: 'last60',        label: 'Last 60 days' },
  { value: 'last90',        label: 'Last 90 days' },
  { value: 'ytd',           label: 'Year to date' },
  { value: 'all',           label: 'All time' },
  { value: 'custom',        label: 'Custom' },
]

function toISODate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(s) {
  if (typeof s !== 'string' || !s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function addDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Resolve a date preset into a { start, end } window. Both bounds are
 * inclusive ISO date strings (YYYY-MM-DD). Returns null for 'all' so
 * callers can short-circuit and skip filtering.
 *
 *   resolveDateRange('last30', { referenceDate: '2026-05-16' })
 *     → { start: '2026-04-16', end: '2026-05-16' }
 *
 *   resolveDateRange('currentSeason', { referenceDate: '2026-05-16' })
 *     → { start: '2026-04-01', end: '2026-10-31' }
 *
 *   resolveDateRange('custom', { customStart: '...', customEnd: '...' })
 */
export function resolveDateRange(preset, { referenceDate, customStart, customEnd } = {}) {
  const ref = parseISODate(referenceDate) ?? new Date()
  switch (preset) {
    case 'all':
      return null
    case 'last30': return { start: toISODate(addDays(ref, -30)), end: toISODate(ref) }
    case 'last60': return { start: toISODate(addDays(ref, -60)), end: toISODate(ref) }
    case 'last90': return { start: toISODate(addDays(ref, -90)), end: toISODate(ref) }
    case 'ytd': {
      const start = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1))
      return { start: toISODate(start), end: toISODate(ref) }
    }
    case 'currentSeason': {
      const year = ref.getUTCFullYear()
      return {
        start: `${year}-04-01`,
        end:   `${year}-10-31`,
      }
    }
    case 'custom': {
      // Custom mode tolerates missing bounds — caller may have only
      // entered one yet. Missing start = "from the dawn of time"; missing
      // end = "to today". Both null = pass-through.
      if (!customStart && !customEnd) return null
      return {
        start: customStart || '0000-01-01',
        end:   customEnd   || toISODate(ref),
      }
    }
    default:
      return null
  }
}

/**
 * Filter a list of spray records to those whose `date` falls inside the
 * window resolved from the preset. Records without a parseable date are
 * dropped (they never silently inflate range-scoped totals).
 */
export function filterRecordsByDateRange(records, preset, options = {}) {
  const range = resolveDateRange(preset, options)
  if (!range) return Array.isArray(records) ? records.slice() : []
  const { start, end } = range
  return (records ?? []).filter(r => {
    if (typeof r?.date !== 'string') return false
    return r.date >= start && r.date <= end
  })
}

// ── Surface filtering ────────────────────────────────────────────────────
//
// 'all' is a pass-through. Any other value matches the surface slug
// produced by Phase 22C's areaSurfaceTypeOf(). 'unspecified' specifically
// keeps records whose area doesn't resolve to a known family — so the
// user can audit those gaps.

export const SURFACE_OPTS = [
  { value: 'all',         label: 'All surfaces' },
  { value: 'greens',      label: 'Greens' },
  { value: 'tees',        label: 'Tees' },
  { value: 'fairways',    label: 'Fairways' },
  { value: 'rough',       label: 'Rough' },
  { value: 'practice',    label: 'Practice' },
  { value: 'unspecified', label: 'Unspecified' },
]

export function filterRecordsBySurface(records, surface) {
  if (!surface || surface === 'all') return Array.isArray(records) ? records.slice() : []
  return (records ?? []).filter(r => {
    const slug = areaSurfaceTypeOf(r?.area) ?? 'unspecified'
    return slug === surface
  })
}

// ── Pressure filtering ───────────────────────────────────────────────────
//
// Modes the recordset rather than highlighting bars. 'high-only' keeps
// records where AT LEAST ONE FRAC code resolves to a high-risk MOA in
// chemistryMetadata. Records with no label-resolved FRAC code are
// dropped under 'high-only' — without label data we can't classify them
// as high-pressure honestly.

export const PRESSURE_OPTS = [
  { value: 'all',       label: 'All chemistry' },
  { value: 'high-only', label: 'High-pressure only' },
]

export function filterRecordsByPressure(records, labelsByItemId, mode) {
  if (!mode || mode === 'all') return Array.isArray(records) ? records.slice() : []
  if (mode === 'high-only') {
    return (records ?? []).filter(r => {
      const codes = recordCodes(r, labelsByItemId).FRAC
      for (const c of codes) {
        const meta = lookupGroup('FRAC', c)
        if (meta.recognized && meta.riskLevel === RESISTANCE_RISK.HIGH) return true
      }
      return false
    })
  }
  return Array.isArray(records) ? records.slice() : []
}

// ── Chemistry-type view filter ──────────────────────────────────────────
//
// Post-summary view filter. Doesn't reshape the summary — keeps the
// fracUsage/hracUsage/iracUsage keys present so the page renderer doesn't
// need to know about the filter — but blanks the non-selected arrays
// and restricts streaks/gaps to the chosen classification system.
//
// 'all' returns the summary unchanged.

export const CHEMISTRY_TYPE_OPTS = [
  { value: 'all',  label: 'All chemistry' },
  { value: 'FRAC', label: 'FRAC only' },
  { value: 'HRAC', label: 'HRAC only' },
  { value: 'IRAC', label: 'IRAC only' },
]

export function filterProgramSummary(summary, { chemistryType = 'all' } = {}) {
  if (!summary) return summary
  if (chemistryType === 'all') return summary
  const keep = chemistryType
  const blanks = ['FRAC', 'HRAC', 'IRAC'].filter(t => t !== keep)

  const next = { ...summary }
  for (const blank of blanks) {
    if (blank === 'FRAC') next.fracUsage = []
    if (blank === 'HRAC') next.hracUsage = []
    if (blank === 'IRAC') next.iracUsage = []
  }
  next.longestStreaks    = (summary.longestStreaks ?? []).filter(s => s.type === keep)
  next.gaps              = (summary.gaps ?? []).filter(g => g.type === keep)
  // longestFracStreaks is FRAC-by-definition — clear it when FRAC is hidden.
  if (keep !== 'FRAC') next.longestFracStreaks = []
  // Drift findings are FRAC-keyed today (planned-not-applied,
  // dependency-concentration, high-pressure-group, diversity-degradation).
  // When the user picks HRAC/IRAC, drift findings sourced from FRAC are
  // not relevant to the view — blank them rather than imply they apply.
  if (keep !== 'FRAC') next.drift = []
  // diversity score is FRAC-based; hide it under HRAC/IRAC.
  if (keep !== 'FRAC') {
    next.diversity = {
      score: null,
      distinctCodes: 0,
      totalApplications: summary.diversity?.totalApplications ?? 0,
    }
  }
  // High-pressure list is FRAC-only; hide under HRAC/IRAC.
  if (keep !== 'FRAC') next.highPressure = []
  return next
}

// ── Active-filter description ───────────────────────────────────────────
//
// One-liner summarizing the current filter state for the page header.
// Returns null when no filter is active (so the page can hide the chip).
//
//   describeActiveFilters({ dateRange: 'last60', surface: 'greens',
//                           chemistryType: 'FRAC', pressure: 'all' })
//     → "Showing Greens · Last 60 days · FRAC only"

function presetLabel(value) {
  return DATE_PRESETS.find(p => p.value === value)?.label ?? null
}
function surfaceLabel(value) {
  return SURFACE_OPTS.find(s => s.value === value)?.label ?? null
}
function chemistryLabel(value) {
  return CHEMISTRY_TYPE_OPTS.find(c => c.value === value)?.label ?? null
}
function pressureLabel(value) {
  return PRESSURE_OPTS.find(p => p.value === value)?.label ?? null
}

export function describeActiveFilters({
  dateRange   = 'currentSeason',
  surface     = 'all',
  chemistryType = 'all',
  pressure    = 'all',
  customStart, customEnd,
} = {}) {
  const parts = []
  if (surface !== 'all') parts.push(surfaceLabel(surface))
  if (dateRange === 'custom' && (customStart || customEnd)) {
    parts.push(`${customStart || '…'} → ${customEnd || '…'}`)
  } else if (dateRange && dateRange !== 'all') {
    parts.push(presetLabel(dateRange))
  }
  if (chemistryType !== 'all') parts.push(chemistryLabel(chemistryType))
  if (pressure !== 'all')      parts.push(pressureLabel(pressure))
  return parts.length > 0 ? `Showing ${parts.filter(Boolean).join(' · ')}` : null
}
