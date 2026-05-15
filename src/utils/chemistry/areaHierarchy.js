// Phase 22C — Chemistry Intelligence: area hierarchy normalization.
//
// Optional helpers for grouping operationally-distinct areas that share
// a turfgrass surface family. The Spray Builder currently matches
// history by EXACT area name (Phase 22B contract) — that's safe and
// auditable. This module adds family-aware matching as an OPT-IN mode
// so a future caller can ask:
//
//   "Has any GREENS-family surface seen FRAC 11 in the last 21 days?"
//   even when the prior application was logged to 'Greens A' or
//   'Practice Greens' instead of just 'Greens'.
//
// The default Phase 22B behavior (exact match) is preserved everywhere.
// Nothing in this module auto-merges areas globally — callers must
// explicitly opt in by passing { areaMatchMode: 'family' }.
//
// Pure functions, no side effects.

import { normalizeAreaName } from './sprayHistoryAnalysis.js'

// ── Surface families ─────────────────────────────────────────────────────
// Family codes line up with the surfaceType vocabulary the Spray Builder
// already uses informally on the area picker: greens, tees, fairways,
// rough, native, practice. Practice has its own family — practice greens
// are operationally distinct from tournament greens for IPM purposes.

export const AREA_FAMILIES = {
  GREENS:   { code: 'GREENS',   label: 'Greens' },
  TEES:     { code: 'TEES',     label: 'Tees' },
  FAIRWAYS: { code: 'FAIRWAYS', label: 'Fairways' },
  ROUGH:    { code: 'ROUGH',    label: 'Rough' },
  PRACTICE: { code: 'PRACTICE', label: 'Practice area' },
  NATIVE:   { code: 'NATIVE',   label: 'Native areas' },
  APPROACH: { code: 'APPROACH', label: 'Approaches' },
  COLLAR:   { code: 'COLLAR',   label: 'Collars' },
  BUNKER:   { code: 'BUNKER',   label: 'Bunker surrounds' },
}

// ── Keyword → family mapping ────────────────────────────────────────────
// Match the most-specific keyword first ("practice greens" → PRACTICE,
// not GREENS) by ordering the rules by descending specificity. Each
// rule is checked as a substring against the normalized area string.

const FAMILY_RULES = [
  // Practice areas (must precede the generic 'greens' / 'tees' checks)
  { keyword: 'practice green', family: 'PRACTICE' },
  { keyword: 'practice tee',   family: 'PRACTICE' },
  { keyword: 'practice',       family: 'PRACTICE' },
  { keyword: 'short game',     family: 'PRACTICE' },
  { keyword: 'putting green',  family: 'GREENS' },
  // Greens family
  { keyword: 'green',          family: 'GREENS' },
  // Approaches + collars are distinct from greens themselves
  { keyword: 'approach',       family: 'APPROACH' },
  { keyword: 'collar',         family: 'COLLAR' },
  // Tees
  { keyword: 'tee',            family: 'TEES' },
  // Fairways
  { keyword: 'fairway',        family: 'FAIRWAYS' },
  // Rough / native
  { keyword: 'rough',          family: 'ROUGH' },
  { keyword: 'native',         family: 'NATIVE' },
  { keyword: 'no-mow',         family: 'NATIVE' },
  { keyword: 'no mow',         family: 'NATIVE' },
  // Bunker surrounds
  { keyword: 'bunker',         family: 'BUNKER' },
]

/**
 * Resolve an area string to a surface-family code (e.g. 'GREENS').
 * Returns null when no family rule matches — callers should fall back
 * to exact-match comparison.
 *
 *   areaFamilyOf('Greens A')          → 'GREENS'
 *   areaFamilyOf('Practice Greens')   → 'PRACTICE'
 *   areaFamilyOf('Fairway #7')        → 'FAIRWAYS'
 *   areaFamilyOf('Cart path')         → null
 */
export function areaFamilyOf(area) {
  const norm = normalizeAreaName(area)
  if (!norm) return null
  for (const rule of FAMILY_RULES) {
    if (norm.includes(rule.keyword)) return rule.family
  }
  return null
}

/**
 * Resolve an area string into a surface-type slug compatible with the
 * Spray Builder's informal vocabulary. Returns one of:
 *   'greens' | 'tees' | 'fairways' | 'rough' | 'native' | 'practice' |
 *   'approach' | 'collar' | 'bunker' | null
 *
 * Used by BuildSpraySheet to derive areaType from the chosen area
 * label without requiring a schema change.
 */
export function areaSurfaceTypeOf(area) {
  const fam = areaFamilyOf(area)
  if (!fam) return null
  return fam.toLowerCase()
}

/**
 * Compare two area strings under a given match mode.
 *
 *   areasMatch('Greens', 'Greens', 'exact')          → true
 *   areasMatch('Greens A', 'Greens B', 'exact')      → false
 *   areasMatch('Greens A', 'Greens B', 'family')     → true (both GREENS)
 *   areasMatch('Greens', 'Practice Greens', 'family')→ false
 *
 * When areaMatchMode is 'family' but either side resolves to no family
 * (e.g. a custom area not covered by the keyword rules), we fall back
 * to exact match for that comparison — never silently merge unknowns.
 */
export function areasMatch(a, b, areaMatchMode = 'exact') {
  if (areaMatchMode === 'family') {
    const fa = areaFamilyOf(a)
    const fb = areaFamilyOf(b)
    if (fa && fb) return fa === fb
  }
  return normalizeAreaName(a) === normalizeAreaName(b)
}
