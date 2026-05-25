// Phase 7D (3/?) — Spray Application Interval Awareness.
//
// Pure-compute, deterministic answer to:
//   "How recently have these same products or same chemistry groups
//    been applied?"
//
// Two parallel match dimensions:
//   - PRODUCT match: exact normalized-name OR exact inventoryItemId hit
//     against recent history. No fuzzy matching.
//   - GROUP match:   any FRAC/HRAC/IRAC/PGR vocabulary value in today's
//     tank also appearing in a historical spray (resolved via the
//     caller-injected resolver — same closure used by Rotation
//     Awareness). Missing/unresolved history products count as missing
//     intel; they NEVER inflate the match list.
//
// EXPLICITLY NOT IN SCOPE:
//   - "rotate to / safe / unsafe / apply now / do not apply / recommend"
//   - fuzzy product name matching
//   - inferring chemistry from active-ingredient names
//   - weather / disease / soil pressure
//   - blocking save
//
// Awareness only. Stewardship language only. Missing data is COUNTED,
// never guessed.

const NAME_PUNCT = /[^a-z0-9]+/g

function normalizeName(s) {
  if (s == null) return ''
  return String(s).toLowerCase().trim().replace(NAME_PUNCT, '-').replace(/^-+|-+$/g, '')
}

function isValidDateLike(v) {
  if (v == null || v === '') return false
  const t = Date.parse(v)
  return Number.isFinite(t)
}

function splitGroups(v) {
  if (v == null) return []
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Days between two ISO-ish dates, integer floor. Returns null when the
 * date can't be parsed — caller decides whether that's a problem.
 *
 * @param {string|number|Date} date
 * @param {number}             [now=Date.now()]
 * @returns {number|null}
 */
export function calculateDaysSince(date, now = Date.now()) {
  if (date == null) return null
  const t = date instanceof Date ? date.getTime() : Date.parse(date)
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / 86_400_000)
}

/**
 * Extract the comparable shape from the current builder rows. Each
 * entry carries the normalized name + inventoryItemId for exact match
 * and the groups dictionary from the row's intel for group match.
 * Empty rows (no name and no inventoryItemId) are dropped so a fresh
 * placeholder row doesn't inflate match counts.
 *
 * @param {Object[]} rows  enriched Spray Builder rows
 * @returns {Array<{ name, normalizedName, inventoryItemId, groups }>}
 */
export function extractCurrentProducts(rows = []) {
  const out = []
  for (const row of rows ?? []) {
    if (!row) continue
    if (!row.name && !row.inventoryItemId) continue
    const intel = row.intel ?? null
    out.push({
      name:            row.name ?? null,
      normalizedName:  normalizeName(row.name),
      inventoryItemId: row.inventoryItemId ?? null,
      groups: {
        frac: splitGroups(intel?.fracGroup),
        hrac: splitGroups(intel?.hracGroup),
        irac: splitGroups(intel?.iracGroup),
        pgr:  splitGroups(intel?.pgrClass),
      },
    })
  }
  return out
}

// ── History filter (shared shape with rotation helper, on purpose) ─────────

function isUsableHistoricalSpray(spray, now) {
  if (!spray) return false
  if (spray.status === 'deleted' || spray.deletedAt) return false
  if (!isValidDateLike(spray.date)) return false
  const t = Date.parse(spray.date)
  return t <= now
}

// ── Product matches (exact normalized name OR inventoryItemId) ─────────────

/**
 * For each current product, find the MOST RECENT historical spray that
 * applied the same product (by inventoryItemId or normalized name).
 * Multiple current rows that match the same historical row each get
 * their own entry — the planner cares about days-since per product.
 *
 * Newest-first scan with early-exit per product so the loop is at
 * most O(history × current) but typically O(history).
 *
 * @returns {Array<{ productName, inventoryItemId, lastAppliedDate, daysSince, sprayName, sprayId }>}
 */
export function findRecentProductMatches(currentProducts, historicalSprays, options = {}) {
  const opts = options ?? {}
  const lookbackDays = Number.isFinite(opts.lookbackDays)
    ? Math.max(0, opts.lookbackDays) : 45
  const now    = typeof opts.now === 'number' ? opts.now : Date.now()
  const cutoff = now - lookbackDays * 86_400_000

  // Pre-filter & sort history newest first.
  const valid = []
  for (const spray of historicalSprays ?? []) {
    if (!isUsableHistoricalSpray(spray, now)) continue
    const t = Date.parse(spray.date)
    if (t < cutoff) continue
    valid.push({ spray, t })
  }
  valid.sort((a, b) => b.t - a.t)

  const matches = []
  for (const cur of currentProducts ?? []) {
    let hit = null
    for (const { spray } of valid) {
      const products = Array.isArray(spray.products) ? spray.products : []
      for (const p of products) {
        const sameInv = cur.inventoryItemId
          && p.inventoryItemId
          && p.inventoryItemId === cur.inventoryItemId
        const sameName = cur.normalizedName
          && cur.normalizedName === normalizeName(p.name)
        if (sameInv || sameName) {
          hit = { spray, p }
          break
        }
      }
      if (hit) break
    }
    if (!hit) continue
    matches.push({
      productName:     cur.name,
      inventoryItemId: cur.inventoryItemId,
      lastAppliedDate: hit.spray.date,
      daysSince:       calculateDaysSince(hit.spray.date, now),
      sprayName:       hit.spray.applicationName ?? null,
      sprayId:         hit.spray.id ?? null,
    })
  }
  return matches
}

// ── Group matches (FRAC/HRAC/IRAC/PGR via injected resolver) ───────────────

const GROUP_FIELD = { frac: 'fracGroup', hrac: 'hracGroup', irac: 'iracGroup', pgr: 'pgrClass' }
const GROUP_LABEL = { frac: 'FRAC',      hrac: 'HRAC',      irac: 'IRAC',      pgr:  'PGR'      }

/**
 * For each current group value, find the most recent historical spray
 * whose products contain that value. Uses the injected resolver to
 * derive groups for historical products; rows the resolver can't
 * resolve are counted in missingIntelCount.
 *
 * Per-vocabulary scan independently so finding a FRAC match doesn't
 * short-circuit the HRAC search.
 *
 * @returns {{ matches: Array, missingIntelCount: number }}
 */
export function findRecentGroupMatches(currentGroups, historicalSprays, options = {}) {
  const opts = options ?? {}
  const lookbackDays = Number.isFinite(opts.lookbackDays)
    ? Math.max(0, opts.lookbackDays) : 45
  const now      = typeof opts.now === 'number' ? opts.now : Date.now()
  const cutoff   = now - lookbackDays * 86_400_000
  const resolve  = opts.resolveProductIntel

  // Pre-filter + newest-first.
  const valid = []
  for (const spray of historicalSprays ?? []) {
    if (!isUsableHistoricalSpray(spray, now)) continue
    const t = Date.parse(spray.date)
    if (t < cutoff) continue
    valid.push({ spray, t })
  }
  valid.sort((a, b) => b.t - a.t)

  // Resolve each historical spray's groups once (memoized by spray id
  // to keep per-vocabulary scans cheap). Also tally missing intel.
  const groupsBySprayId = new Map()
  let missingIntelCount = 0
  for (const { spray } of valid) {
    const products = Array.isArray(spray.products) ? spray.products : []
    const acc = { frac: new Set(), hrac: new Set(), irac: new Set(), pgr: new Set() }
    for (const p of products) {
      let intel
      try { intel = typeof resolve === 'function' ? resolve(p) : null }
      catch { intel = null }
      if (!intel || intel.source === 'none') { missingIntelCount++; continue }
      for (const g of splitGroups(intel.fracGroup)) acc.frac.add(g)
      for (const g of splitGroups(intel.hracGroup)) acc.hrac.add(g)
      for (const g of splitGroups(intel.iracGroup)) acc.irac.add(g)
      for (const g of splitGroups(intel.pgrClass )) acc.pgr.add(g)
    }
    groupsBySprayId.set(spray.id, acc)
  }

  // Per vocabulary × per current group: scan newest-first for a hit.
  const matches = []
  for (const vocab of ['frac', 'hrac', 'irac', 'pgr']) {
    const current = (currentGroups?.[vocab]) ?? []
    for (const g of current) {
      let hit = null
      for (const { spray } of valid) {
        if (groupsBySprayId.get(spray.id)?.[vocab]?.has(g)) {
          hit = spray
          break
        }
      }
      if (!hit) continue
      matches.push({
        groupType:       GROUP_LABEL[vocab],
        group:           g,
        lastAppliedDate: hit.date,
        daysSince:       calculateDaysSince(hit.date, now),
        sprayName:       hit.applicationName ?? null,
        sprayId:         hit.id ?? null,
      })
    }
  }
  return { matches, missingIntelCount }
}

// ── Notice builder ─────────────────────────────────────────────────────────

/**
 * Stewardship-only notices. Three kinds:
 *   info     : neutral exposure summary (recent product match)
 *   caution  : a recent group exposure is present
 *   warning  : historical intel could not be evaluated
 */
export function summarizeIntervalNotices(summary) {
  const out = []
  for (const m of summary.productMatches ?? []) {
    out.push({
      type:  'info',
      label: 'Recent product match',
      value: m.daysSince === 0
        ? `${m.productName} was last recorded today`
        : `${m.productName} was last recorded ${m.daysSince} day${m.daysSince !== 1 ? 's' : ''} ago`,
    })
  }
  for (const m of summary.groupMatches ?? []) {
    out.push({
      type:  'caution',
      label: `Recent ${m.groupType} exposure`,
      value: m.daysSince === 0
        ? `${m.groupType} ${m.group} appeared today`
        : `${m.groupType} ${m.group} appeared ${m.daysSince} day${m.daysSince !== 1 ? 's' : ''} ago`,
    })
  }
  if ((summary.missingHistoricalIntelCount ?? 0) > 0) {
    const n = summary.missingHistoricalIntelCount
    out.push({
      type:  'warning',
      label: 'Missing historical intelligence',
      value: `${n} historical product${n !== 1 ? 's' : ''} could not be evaluated`,
    })
  }
  return out
}

// ── Top-level builder ──────────────────────────────────────────────────────

/**
 * Build the Application Interval Awareness summary.
 *
 * @param {Object[]} currentRows         enriched Spray Builder rows
 * @param {Object[]} historicalSprays    spraysStore.records
 * @param {Object}   options
 * @param {number}   [options.lookbackDays=45]
 * @param {number}   [options.maxMatches=8]
 * @param {number}   [options.now]
 * @param {Function} [options.resolveProductIntel]
 * @returns {Object}
 */
export function buildSprayIntervalAwareness(currentRows = [], historicalSprays = [], options = {}) {
  // Coalesce explicit-null callers (smoke and defensive consumers) to {}.
  const opts = options ?? {}
  const lookbackDays = Number.isFinite(opts.lookbackDays)
    ? Math.max(0, opts.lookbackDays) : 45
  const maxMatches   = Number.isFinite(opts.maxMatches)
    ? Math.max(1, opts.maxMatches) : 8
  const optsNormalized = { ...opts, lookbackDays }

  const currentProducts = extractCurrentProducts(currentRows)
  const productMatches  = findRecentProductMatches(currentProducts, historicalSprays, optsNormalized)
  // Aggregate today's groups (dedupe) for the group-match scan.
  const cur = { frac: new Set(), hrac: new Set(), irac: new Set(), pgr: new Set() }
  for (const cp of currentProducts) {
    for (const g of cp.groups.frac) cur.frac.add(g)
    for (const g of cp.groups.hrac) cur.hrac.add(g)
    for (const g of cp.groups.irac) cur.irac.add(g)
    for (const g of cp.groups.pgr ) cur.pgr.add(g)
  }
  const currentGroups = {
    frac: [...cur.frac], hrac: [...cur.hrac], irac: [...cur.irac], pgr: [...cur.pgr],
  }
  const groupResult = findRecentGroupMatches(currentGroups, historicalSprays, optsNormalized)

  // Newest-first ordering for both lists (smallest daysSince first;
  // null daysSince sinks to the bottom — defensive only).
  function byDaysSinceAsc(a, b) {
    const ad = a.daysSince ?? Number.POSITIVE_INFINITY
    const bd = b.daysSince ?? Number.POSITIVE_INFINITY
    return ad - bd
  }
  productMatches.sort(byDaysSinceAsc)
  groupResult.matches.sort(byDaysSinceAsc)

  const summary = {
    lookbackDays,
    productMatches: productMatches.slice(0, maxMatches),
    groupMatches:   groupResult.matches.slice(0, maxMatches),
    missingHistoricalIntelCount: groupResult.missingIntelCount,
  }
  return { ...summary, notices: summarizeIntervalNotices(summary) }
}

// Test-only seam — never part of the public render contract.
export const __TEST = {
  normalizeName,
  isValidDateLike,
  splitGroups,
  GROUP_FIELD,
  GROUP_LABEL,
  isUsableHistoricalSpray,
}
