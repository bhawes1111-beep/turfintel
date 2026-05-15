// Phase 22A — Chemistry Intelligence: spray-history analysis.
//
// Pure helpers that read prior spray_records and an inventory-label lookup,
// then answer questions about MOA recurrence:
//
//   - "How many FRAC-11 applications hit Greens in the last 21 days?"
//   - "Are we about to stack a third consecutive QoI on this surface?"
//   - "Which actives were applied recently, and where?"
//
// Designed to work with the record shape returned by /api/sprays (worker/
// api/sprays.js → rowToRecord): each record has `date`, `area`, and a
// `products` array with each product carrying `name` and `inventoryItemId`.
// The label data lives on the inventory_product_labels rows surfaced via
// the labelImportStore — we pass it in as a "labels by inventory item id"
// map so this module stays I/O-free.
//
// No React, no fetch. Inputs in, plain objects out.

import { parseGroupCodes } from './chemistryStructures.js'

// ── Date helpers ──────────────────────────────────────────────────────────
//
// Spray dates are stored as ISO date strings ("2026-05-15") on the worker;
// we re-parse them defensively so a malformed date never throws.

function parseISODate(s) {
  if (!(typeof s === 'string') || !s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Area-name normalization ───────────────────────────────────────────────
//
// Area strings drift over time — "Greens", "greens", "All Greens",
// "Greens + Tees", "G & T". We collapse case and whitespace but keep the
// label otherwise intact. The warning layer compares with `===` after
// normalization, so we don't try to be clever about set membership
// (e.g. "Greens + Tees" is NOT considered the same as "Greens"). That
// keeps the math honest: if the operator drew a different boundary, we
// treat it as a different surface for MOA-rotation purposes.

export function normalizeAreaName(area) {
  if (typeof area !== 'string') return ''
  return area.trim().replace(/\s+/g, ' ').toLowerCase()
}

// ── History filtering ─────────────────────────────────────────────────────

/**
 * Filter spray records to those within `lookbackDays` before `referenceDate`.
 * Records without a parseable date are dropped (we never silently include
 * them in the lookback math).
 *
 *   filterByLookback(records, '2026-05-15', 21)
 *
 * Returns a new array, oldest → newest (so callers can show a timeline).
 */
export function filterByLookback(records, referenceDate, lookbackDays) {
  if (!Array.isArray(records) || records.length === 0) return []
  const ref = parseISODate(referenceDate) ?? new Date()
  const lookback = Number.isFinite(lookbackDays) ? lookbackDays : 21
  const cutoff = new Date(ref.getTime() - lookback * 24 * 60 * 60 * 1000)
  return records
    .map(r => ({ rec: r, d: parseISODate(r.date) }))
    .filter(x => x.d && x.d >= cutoff && x.d <= ref)
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .map(x => x.rec)
}

/**
 * Filter (already-lookback-trimmed) records to those whose area matches the
 * draft area after normalization. When `area` is empty/null, the full
 * input is returned — "no area specified" means "everything counts".
 */
export function filterByArea(records, area) {
  if (!Array.isArray(records)) return []
  const norm = normalizeAreaName(area)
  if (!norm) return records.slice()
  return records.filter(r => normalizeAreaName(r.area) === norm)
}

// ── Label resolution ──────────────────────────────────────────────────────
//
// A spray_record's product carries `inventoryItemId` (worker links via
// spray_products.inventory_item_id). The label data is keyed by inventory
// item id in our `labelsByItemId` lookup. When a record's product has no
// inventoryItemId (legacy/manual entries), we can't resolve a label — we
// don't guess; the product is excluded from MOA counts.

/**
 * Resolve all FRAC/HRAC/IRAC codes used in a single spray record by
 * looking up each product's label. Returns `{ FRAC: Set<code>,
 * HRAC: Set<code>, IRAC: Set<code>, unresolvedCount }` where
 * `unresolvedCount` is the number of products we couldn't match to a label.
 */
export function recordCodes(record, labelsByItemId) {
  const out = { FRAC: new Set(), HRAC: new Set(), IRAC: new Set(), unresolvedCount: 0 }
  if (!record || !Array.isArray(record.products)) return out
  for (const p of record.products) {
    const id = p?.inventoryItemId
    const label = id ? labelsByItemId?.[id] : null
    if (!label) {
      out.unresolvedCount += 1
      continue
    }
    for (const c of parseGroupCodes(label.fracGroup)) out.FRAC.add(c)
    for (const c of parseGroupCodes(label.hracGroup)) out.HRAC.add(c)
    for (const c of parseGroupCodes(label.iracGroup)) out.IRAC.add(c)
  }
  return out
}

// ── Aggregate counts ──────────────────────────────────────────────────────
//
// Roll up an array of records into per-type count maps:
//
//   {
//     FRAC: [{ code, applications, lastDate, records: [{ id, date, area }] }],
//     HRAC: [...],
//     IRAC: [...],
//     unresolvedRecords: <number of records where at least one product had no label match>
//   }
//
// `applications` counts records that include the code at least once, NOT
// products. Two FRAC-11 products in one tank still counts as one
// application for rotation-stewardship purposes.

/**
 * @param {Array<Object>} records — filtered spray records
 * @param {Record<string, Object>} labelsByItemId — inventory-item-id → label
 */
export function countApplicationsByGroup(records, labelsByItemId) {
  /** @type {Record<'FRAC'|'HRAC'|'IRAC', Map<string, {applications: number, lastDate: string|null, records: Array<any>}>>} */
  const buckets = { FRAC: new Map(), HRAC: new Map(), IRAC: new Map() }
  let unresolvedRecords = 0

  for (const rec of records ?? []) {
    const codes = recordCodes(rec, labelsByItemId)
    if (codes.unresolvedCount > 0) unresolvedRecords += 1

    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const code of codes[type]) {
        if (!buckets[type].has(code)) {
          buckets[type].set(code, { applications: 0, lastDate: null, records: [] })
        }
        const slot = buckets[type].get(code)
        slot.applications += 1
        if (!slot.lastDate || (rec.date && rec.date > slot.lastDate)) {
          slot.lastDate = rec.date ?? slot.lastDate
        }
        slot.records.push({ id: rec.id ?? null, date: rec.date ?? null, area: rec.area ?? null })
      }
    }
  }

  const flatten = (map) =>
    Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.applications - a.applications)

  return {
    FRAC: flatten(buckets.FRAC),
    HRAC: flatten(buckets.HRAC),
    IRAC: flatten(buckets.IRAC),
    unresolvedRecords,
  }
}

// ── Repeated MOA detection ────────────────────────────────────────────────
//
// For each code planned in the current tank mix, look at the recent
// history and produce a "repeat" verdict:
//
//   {
//     type, code,
//     applications,           — how many prior apps used this code
//     consecutivePrior,       — count of MOST-RECENT consecutive prior apps
//                               that also used this code (used to flag e.g.
//                               "this would be the 3rd consecutive FRAC-11")
//     lastDate,
//     records: [{ id, date, area }],
//   }
//
// "Consecutive" is computed off the lookback-filtered, date-sorted records
// passed in. If the planned mix includes this code, the prospective
// application would make `consecutivePrior + 1` in a row.

/**
 * @param {Array<{type: 'FRAC'|'HRAC'|'IRAC', code: string}>} planned
 * @param {Array<Object>} records — filtered (area + lookback) records,
 *                                  oldest → newest
 * @param {Record<string, Object>} labelsByItemId
 */
export function detectRepeatedMOA(planned, records, labelsByItemId) {
  if (!Array.isArray(planned) || planned.length === 0) return []
  const sorted = Array.isArray(records) ? records.slice() : []
  const codedRecords = sorted.map(r => ({ rec: r, codes: recordCodes(r, labelsByItemId) }))

  return planned.map(({ type, code }) => {
    let applications = 0
    let lastDate = null
    const matched = []
    // Count over the whole window.
    for (const { rec, codes } of codedRecords) {
      if (codes[type].has(code)) {
        applications += 1
        matched.push({ id: rec.id ?? null, date: rec.date ?? null, area: rec.area ?? null })
        if (!lastDate || (rec.date && rec.date > lastDate)) lastDate = rec.date
      }
    }
    // Consecutive count — walk from the most-recent backwards.
    let consecutivePrior = 0
    for (let i = codedRecords.length - 1; i >= 0; i--) {
      if (codedRecords[i].codes[type].has(code)) consecutivePrior += 1
      else break
    }
    return {
      type,
      code,
      applications,
      consecutivePrior,
      lastDate,
      records: matched,
    }
  })
}

// ── Convenience: days since last use ──────────────────────────────────────

/**
 * For a planned code, how many days since it was last applied (within the
 * available history). Returns null if never seen.
 */
export function daysSinceLastUse(type, code, records, labelsByItemId, referenceDate) {
  if (!Array.isArray(records)) return null
  const ref = parseISODate(referenceDate) ?? new Date()
  for (let i = records.length - 1; i >= 0; i--) {
    const codes = recordCodes(records[i], labelsByItemId)
    if (codes[type].has(code)) {
      const d = parseISODate(records[i].date)
      return d ? daysBetween(d, ref) : null
    }
  }
  return null
}
