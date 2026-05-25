// Phase 7D (1/?) — Spray Intelligence foundation.
//
// Pure-compute, read-only summary derived from each row's existing
// `row.intel` produced by resolveSprayProductIntel (Phase 7C.1/6).
// No fetch, no React, no store imports, no mutation. The caller passes
// enrichedRows; we return a deterministic shape suitable for rendering
// awareness chips in a sidebar panel.
//
// EXPLICITLY NOT IN SCOPE for this commit:
//   - rotation recommendations or "apply / do not apply" guidance
//   - weather, disease, application-interval logic
//   - fuzzy chemistry inference (e.g. inferring FRAC from active name)
//   - any recommendation language at all
//
// Missing data displays as missing/omitted — never guessed. Unknown
// REI does NOT default to 0; it's counted in missingIntelCount instead.
//
// Signal-word ordering (highest first): Danger > Warning > Caution >
// None/Unknown.

const SIGNAL_RANK = { danger: 3, warning: 2, caution: 1 }

function normalizeSignal(s) {
  if (s == null) return null
  const norm = String(s).trim().toLowerCase()
  return norm in SIGNAL_RANK ? norm : null
}

function rowHasIntel(row) {
  if (!row?.intel) return false
  // 'none' is the resolver's explicit "nothing matched" sentinel.
  return row.intel.source && row.intel.source !== 'none'
}

// FRAC/HRAC/IRAC are sometimes comma-separated strings on the
// inventory_product_labels tier (e.g. "3, 11"). Split on commas so each
// distinct vocabulary value lands as its own chip, then dedupe + sort.
function collectGroups(rows, field) {
  const set = new Set()
  for (const row of rows ?? []) {
    const v = row?.intel?.[field]
    if (v == null) continue
    const parts = String(v).split(',').map(s => s.trim()).filter(Boolean)
    for (const p of parts) set.add(p)
  }
  return [...set].sort((a, b) => {
    // Numeric-aware sort so "3" comes before "11", and "11" before "M5".
    const an = parseInt(a, 10), bn = parseInt(b, 10)
    const aIsNum = Number.isFinite(an) && /^\d/.test(a)
    const bIsNum = Number.isFinite(bn) && /^\d/.test(b)
    if (aIsNum && bIsNum) return an - bn
    if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
    return a.localeCompare(b)
  })
}

/**
 * Distinct chemistry-group vocabularies present across the tank.
 *
 * @param {Object[]} rows  enriched Spray Builder rows
 * @returns {{ frac: string[], hrac: string[], irac: string[], pgr: string[] }}
 */
export function summarizeChemistryGroups(rows = []) {
  return {
    frac: collectGroups(rows, 'fracGroup'),
    hrac: collectGroups(rows, 'hracGroup'),
    irac: collectGroups(rows, 'iracGroup'),
    pgr:  collectGroups(rows, 'pgrClass'),
  }
}

/**
 * Highest REI hours across rows that report one. Rows with missing REI
 * are skipped — NEVER defaulted to 0.
 *
 * @param {Object[]} rows
 * @returns {number|null}  hours, or null if no row has REI data
 */
export function calculateMaxRei(rows = []) {
  let max = null
  for (const row of rows ?? []) {
    const v = row?.intel?.reiHours
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    if (max === null || v > max) max = v
  }
  return max
}

/**
 * Whether any row carries an explicit restricted-use flag. The resolver
 * surfaces this only when the catalog row supplies it; missing data
 * counts as "not asserted" (returns false), NOT as restricted.
 *
 * @param {Object[]} rows
 * @returns {boolean}
 */
export function detectRestrictedUse(rows = []) {
  for (const row of rows ?? []) {
    if (row?.intel?.restrictedUse === true) return true
  }
  return false
}

/**
 * Highest signal word across rows, by Danger > Warning > Caution > null.
 * Missing/unknown signal words are skipped, never promoted to a guess.
 *
 * @param {Object[]} rows
 * @returns {string|null}  'Danger' | 'Warning' | 'Caution' | null
 */
export function summarizeSignalWords(rows = []) {
  let best = null   // { norm, label }
  for (const row of rows ?? []) {
    const raw = row?.intel?.signalWord
    const norm = normalizeSignal(raw)
    if (!norm) continue
    if (best === null || SIGNAL_RANK[norm] > SIGNAL_RANK[best.norm]) {
      best = { norm, label: String(raw).trim() }
    }
  }
  return best?.label ?? null
}

/**
 * Count rows with no usable product intelligence — i.e. row.intel is
 * missing or its source === 'none'. These are products the planner
 * cannot reason about from catalog/label data alone.
 *
 * Excludes empty rows (no name) so an unfilled placeholder isn't
 * counted as a "missing intel" warning.
 *
 * @param {Object[]} rows
 * @returns {number}
 */
export function countMissingIntel(rows = []) {
  let n = 0
  for (const row of rows ?? []) {
    if (!row) continue
    if (!row.name && !row.inventoryItemId) continue   // empty placeholder
    if (!rowHasIntel(row)) n++
  }
  return n
}

// ── Notice builder ─────────────────────────────────────────────────────────
//
// Stewardship language only. We label awareness — never prescribe.
//   - info     : neutral information ("X groups present in this tank")
//   - caution  : something the planner should be aware of (RUP, signal)
//   - warning  : missing intelligence; the panel cannot reason about it

function pushIf(notices, cond, notice) {
  if (cond) notices.push(notice)
}

function buildNotices(summary, totalProducts) {
  const out = []
  pushIf(out, summary.groups.frac.length > 0, {
    type: 'info',
    label: 'FRAC groups present',
    value: summary.groups.frac.join(', '),
  })
  pushIf(out, summary.groups.hrac.length > 0, {
    type: 'info',
    label: 'HRAC groups present',
    value: summary.groups.hrac.join(', '),
  })
  pushIf(out, summary.groups.irac.length > 0, {
    type: 'info',
    label: 'IRAC groups present',
    value: summary.groups.irac.join(', '),
  })
  pushIf(out, summary.groups.pgr.length > 0, {
    type: 'info',
    label: 'PGR groups present',
    value: summary.groups.pgr.join(', '),
  })
  pushIf(out, summary.maxReiHours != null, {
    type: 'info',
    label: 'Max REI across tank',
    value: `${summary.maxReiHours} hrs`,
  })
  pushIf(out, summary.highestSignalWord != null, {
    type: 'caution',
    label: 'Highest signal word',
    value: summary.highestSignalWord,
  })
  pushIf(out, summary.restrictedUse, {
    type: 'caution',
    label: 'Restricted-use product present',
    value: 'Review label before application',
  })
  pushIf(out, summary.missingIntelCount > 0, {
    type: 'warning',
    label: 'Missing product intelligence',
    value: `${summary.missingIntelCount} of ${totalProducts} product${totalProducts !== 1 ? 's' : ''}`,
  })
  return out
}

/**
 * Build the full Spray Intelligence summary from enriched rows.
 *
 * Empty rows (no name + no inventoryItemId) are excluded from
 * totalProducts so an unfilled placeholder doesn't inflate the count.
 *
 * @param {Object[]} rows  enriched Spray Builder rows
 * @returns {Object}
 */
export function buildSprayIntelligence(rows = []) {
  const realRows = (rows ?? []).filter(r => r && (r.name || r.inventoryItemId))
  const totalProducts = realRows.length

  const groups            = summarizeChemistryGroups(realRows)
  const maxReiHours       = calculateMaxRei(realRows)
  const restrictedUse     = detectRestrictedUse(realRows)
  const highestSignalWord = summarizeSignalWords(realRows)
  const missingIntelCount = countMissingIntel(realRows)
  const productsWithIntelCount = totalProducts - missingIntelCount

  const summary = {
    groups,
    maxReiHours,
    restrictedUse,
    highestSignalWord,
    missingIntelCount,
    productsWithIntelCount,
    totalProducts,
  }
  return { ...summary, notices: buildNotices(summary, totalProducts) }
}

// Test-only seam. Not part of the public render contract.
export const __TEST = {
  SIGNAL_RANK,
  normalizeSignal,
  rowHasIntel,
  collectGroups,
  buildNotices,
}
