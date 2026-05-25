// Phase 7D (2/?) — Spray Rotation Awareness.
//
// Pure-compute, deterministic comparison between the current Spray
// Builder tank and recent saved spray records. Surfaces:
//   - which FRAC/HRAC/IRAC/PGR groups in today's tank ALSO appeared in
//     recent history (repeated groups → awareness, not a verdict)
//   - the recent-exposure list (date + spray name + groups per spray)
//   - count of historical products that couldn't be evaluated (no
//     resolvable catalog/label intel)
//
// EXPLICITLY NOT IN SCOPE:
//   - "rotate to X" or any product recommendation
//   - "safe" / "unsafe" / "apply" / "do not apply"
//   - inferring missing FRAC/HRAC/IRAC/PGR groups from active names
//   - blocking save (this is awareness only)
//   - fetching anything: no store imports, no fetch
//
// Historical spray records come from spraysStore.records — they carry
// products as { name, type, rate, unit, quantityUsed, inventoryItemId }
// with NO stored chemistry. To resolve groups for those rows the
// caller passes options.resolveProductIntel(productLike) — a closure
// over their already-available inventory/catalog/label state. Keeping
// the resolver injected leaves this module pure and easy to unit-test.

const NOT_RECOMMENDATION = true   // eslint-keep — invariant marker only

function isValidDateLike(v) {
  if (v == null || v === '') return false
  const t = Date.parse(v)
  return Number.isFinite(t)
}

// Split label-tier comma strings ("3, 11") into atomic group values.
function splitGroups(v) {
  if (v == null) return []
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

function dedupeSort(values) {
  const set = new Set()
  for (const v of values) set.add(v)
  return [...set].sort((a, b) => {
    const an = parseInt(a, 10), bn = parseInt(b, 10)
    const aIsNum = Number.isFinite(an) && /^\d/.test(a)
    const bIsNum = Number.isFinite(bn) && /^\d/.test(b)
    if (aIsNum && bIsNum) return an - bn
    if (aIsNum !== bIsNum) return aIsNum ? -1 : 1
    return a.localeCompare(b)
  })
}

function emptyGroups() {
  return { frac: [], hrac: [], irac: [], pgr: [] }
}

function addIntelToGroups(intel, acc) {
  if (!intel || intel.source === 'none') return false   // not resolved
  for (const g of splitGroups(intel.fracGroup)) acc.frac.push(g)
  for (const g of splitGroups(intel.hracGroup)) acc.hrac.push(g)
  for (const g of splitGroups(intel.iracGroup)) acc.irac.push(g)
  for (const g of splitGroups(intel.pgrClass )) acc.pgr.push(g)
  return true
}

// ── Extractors ────────────────────────────────────────────────────────────

/**
 * Distinct groups present in the current builder rows. Uses each row's
 * existing `row.intel` (from resolveSprayProductIntel). De-duplicates,
 * splits comma-separated label-tier values, numeric-aware sort.
 *
 * @param {Object[]} rows  enriched Spray Builder rows
 * @returns {{ frac: string[], hrac: string[], irac: string[], pgr: string[] }}
 */
export function extractGroupsFromRows(rows = []) {
  const acc = emptyGroups()
  for (const row of rows ?? []) {
    if (!row) continue
    addIntelToGroups(row.intel, acc)
  }
  return {
    frac: dedupeSort(acc.frac),
    hrac: dedupeSort(acc.hrac),
    irac: dedupeSort(acc.irac),
    pgr:  dedupeSort(acc.pgr),
  }
}

/**
 * Resolve a historical spray record's groups via the caller-supplied
 * resolveProductIntel closure. Returns the dedupe-sorted groups plus
 * how many of the record's products couldn't be evaluated.
 *
 * The function NEVER throws on a missing resolver or a non-array
 * products list — it just yields empty groups + a missingCount equal
 * to product list length (or 0).
 *
 * @param {Object}   spray
 * @param {Function} resolveProductIntel  (productLike) => intel|null
 * @returns {{ groups, missingIntelCount: number }}
 */
export function extractGroupsFromHistoricalSpray(spray, resolveProductIntel) {
  const acc = emptyGroups()
  const products = Array.isArray(spray?.products) ? spray.products : []
  let missingIntelCount = 0
  if (typeof resolveProductIntel !== 'function') {
    return {
      groups: emptyGroups(),
      missingIntelCount: products.length,
    }
  }
  for (const p of products) {
    let intel
    try { intel = resolveProductIntel(p) }
    catch { intel = null }
    const resolved = intel && addIntelToGroups(intel, acc)
    if (!resolved) missingIntelCount++
  }
  return {
    groups: {
      frac: dedupeSort(acc.frac),
      hrac: dedupeSort(acc.hrac),
      irac: dedupeSort(acc.irac),
      pgr:  dedupeSort(acc.pgr),
    },
    missingIntelCount,
  }
}

/**
 * Given today's groups and a list of historical sprays-with-groups,
 * compute which of today's groups ALSO appeared in any historical
 * spray. Each vocab is computed independently; values are dedupe-sorted.
 *
 * @param {Object} currentGroups
 * @param {Array<{ groups: Object }>} historicalEntries
 * @returns {{ frac: string[], hrac: string[], irac: string[], pgr: string[] }}
 */
export function findRepeatedGroups(currentGroups, historicalEntries) {
  const seen = { frac: new Set(), hrac: new Set(), irac: new Set(), pgr: new Set() }
  for (const e of historicalEntries ?? []) {
    if (!e?.groups) continue
    for (const v of e.groups.frac ?? []) seen.frac.add(v)
    for (const v of e.groups.hrac ?? []) seen.hrac.add(v)
    for (const v of e.groups.irac ?? []) seen.irac.add(v)
    for (const v of e.groups.pgr  ?? []) seen.pgr.add(v)
  }
  const repeat = vocab => (currentGroups?.[vocab] ?? []).filter(v => seen[vocab].has(v))
  return {
    frac: dedupeSort(repeat('frac')),
    hrac: dedupeSort(repeat('hrac')),
    irac: dedupeSort(repeat('irac')),
    pgr:  dedupeSort(repeat('pgr')),
  }
}

/**
 * Reduce the historical sprays list into a compact exposure summary
 * (sorted newest-first), respecting lookbackDays + maxHistoryItems.
 * Sprays with invalid/missing dates are dropped from the dated window
 * (not destructive — they simply don't appear in the list) so a future
 * spray with a malformed date can never break the panel.
 *
 * @param {Object[]} historicalSprays  spraysStore.records
 * @param {Object}   options
 * @param {number}   [options.lookbackDays=30]
 * @param {number}   [options.maxHistoryItems=10]
 * @param {Function} [options.resolveProductIntel]
 * @param {number}   [options.now]  epoch ms; defaults to Date.now()
 * @returns {{
 *   entries: Array<{ id, date, sprayName, groups, missingIntelCount }>,
 *   missingHistoricalIntelCount: number
 * }}
 */
export function summarizeRecentGroupExposure(historicalSprays = [], options = {}) {
  const lookbackDays    = Number.isFinite(options.lookbackDays)
    ? Math.max(0, options.lookbackDays) : 30
  const maxHistoryItems = Number.isFinite(options.maxHistoryItems)
    ? Math.max(1, options.maxHistoryItems) : 10
  const now             = typeof options.now === 'number' ? options.now : Date.now()
  const cutoff          = now - lookbackDays * 86_400_000
  const resolve         = options.resolveProductIntel

  const dated = []
  for (const spray of historicalSprays ?? []) {
    if (!spray) continue
    // Skip soft-deleted / non-saved records so awareness reflects what
    // actually happened.
    if (spray.status === 'deleted' || spray.deletedAt) continue
    if (!isValidDateLike(spray.date)) continue
    const t = Date.parse(spray.date)
    if (t > now) continue                        // future record, ignore
    if (t < cutoff) continue                     // outside window
    dated.push({ spray, t })
  }

  // Newest first; stable.
  dated.sort((a, b) => b.t - a.t)
  const trimmed = dated.slice(0, maxHistoryItems)

  let missingHistoricalIntelCount = 0
  const entries = trimmed.map(({ spray }) => {
    const { groups, missingIntelCount } =
      extractGroupsFromHistoricalSpray(spray, resolve)
    missingHistoricalIntelCount += missingIntelCount
    return {
      id:        spray.id,
      date:      spray.date,
      sprayName: spray.applicationName ?? null,
      groups,
      missingIntelCount,
    }
  })

  return { entries, missingHistoricalIntelCount }
}

// ── Notices ────────────────────────────────────────────────────────────────
//
// Stewardship language only — never "rotate to X", never "safe/unsafe",
// never "apply / do not apply". Three notice types map to UI tones:
//   info     : neutral exposure summary
//   caution  : a repeated group is present (planner should be AWARE)
//   warning  : missing intelligence on historical products

function buildRotationNotices(summary) {
  const out = []
  const r = summary.repeatedGroups
  if (r.frac.length > 0) out.push({ type: 'caution', label: 'Repeated FRAC group', value: `FRAC ${r.frac.join(', ')} appears in recent spray history` })
  if (r.hrac.length > 0) out.push({ type: 'caution', label: 'Repeated HRAC group', value: `HRAC ${r.hrac.join(', ')} appears in recent spray history` })
  if (r.irac.length > 0) out.push({ type: 'caution', label: 'Repeated IRAC group', value: `IRAC ${r.irac.join(', ')} appears in recent spray history` })
  if (r.pgr.length  > 0) out.push({ type: 'caution', label: 'Repeated PGR class',  value: `PGR ${r.pgr.join(', ')} appears in recent spray history` })

  const n = summary.recentExposure.length
  out.push({
    type: 'info',
    label: 'Recent chemistry history',
    value: n === 0
      ? `No saved sprays in the last ${summary.lookbackDays} day${summary.lookbackDays !== 1 ? 's' : ''}`
      : `${n} prior spray${n !== 1 ? 's' : ''} reviewed`,
  })

  if (summary.missingHistoricalIntelCount > 0) {
    out.push({
      type: 'warning',
      label: 'Missing historical intelligence',
      value: `${summary.missingHistoricalIntelCount} historical product${summary.missingHistoricalIntelCount !== 1 ? 's' : ''} could not be evaluated`,
    })
  }
  return out
}

/**
 * Build the Rotation Awareness summary.
 *
 * @param {Object[]} currentRows        enriched Spray Builder rows
 * @param {Object[]} historicalSprays   spraysStore.records
 * @param {Object}   options
 * @param {number}   [options.lookbackDays=30]
 * @param {number}   [options.maxHistoryItems=10]
 * @param {Function} [options.resolveProductIntel]
 * @param {number}   [options.now]
 * @returns {Object}
 */
export function buildSprayRotationAwareness(currentRows = [], historicalSprays = [], options = {}) {
  const lookbackDays    = Number.isFinite(options.lookbackDays)
    ? Math.max(0, options.lookbackDays) : 30

  const currentGroups   = extractGroupsFromRows(currentRows)
  const exposure        = summarizeRecentGroupExposure(historicalSprays, {
    ...options,
    lookbackDays,
  })
  const repeatedGroups  = findRepeatedGroups(currentGroups, exposure.entries)

  const summary = {
    lookbackDays,
    currentGroups,
    repeatedGroups,
    recentExposure: exposure.entries,
    missingHistoricalIntelCount: exposure.missingHistoricalIntelCount,
  }
  return { ...summary, notices: buildRotationNotices(summary) }
}

// Test-only seam.
export const __TEST = {
  isValidDateLike,
  splitGroups,
  dedupeSort,
  addIntelToGroups,
  buildRotationNotices,
  NOT_RECOMMENDATION,
}
