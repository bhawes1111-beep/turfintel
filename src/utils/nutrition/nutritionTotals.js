// Plant Nutrition Intelligence — seasonal totals + derived/standalone merge.
//
// Pure, explainable arithmetic. Two contributing sources, merged:
//   1. DERIVED — fertilizer spray records: nutrients computed live from the
//      product's inventory analysis (N-P-K) × rate × acres. Not stored;
//      the spray stays the source of truth (clear sourceSprayId link).
//   2. STANDALONE — nutrition_applications rows (granular/foliar logged
//      directly), which already carry a stored N/P/K snapshot.
//
// De-dup: a standalone row promoted from a spray carries sourceSprayId, and
// suppresses the live-derived line for that spray (no double-counting).
//
// No fake fertility intelligence — only lbs of N/P/K from real analysis/
// rate/area. Applications missing analysis/rate/acreage become honest
// `unknown` lines, never guessed.

import { parseNPK } from '../agronomic/agronomicIntelligence.js'

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}

// lb of product per acre from a rate + unit. Mirrors the agronomic helper.
export function rateToLbPerAcre(rateRaw, unit) {
  const rate = toNum(rateRaw)
  if (rate == null || typeof unit !== 'string') return null
  const u = unit.toLowerCase().replace(/\s+/g, '')
  if (u === 'lb/acre' || u === 'lb/a' || u === 'lbs/acre' || u === 'lbs/a') return rate
  if (u === 'oz/acre' || u === 'oz/a')                                      return rate / 16
  if (u === 'lb/1000sqft' || u === 'lb/1ksqft')                            return rate * 43.56
  if (u === 'oz/1000sqft' || u === 'oz/1ksqft')                            return (rate / 16) * 43.56
  return null
}

// Compute N/P/K lbs for a single application from analysis + rate + acres.
// Returns { nLb, pLb, kLb, why } or { unknown, reason }.
export function computeNpkLbs({ analysis, rate, unit, acres, productName }) {
  const npk = parseNPK(analysis)
  if (!npk) return { unknown: true, reason: 'no N-P-K analysis on file', productName }
  const lbPerAcre = rateToLbPerAcre(rate, unit)
  if (lbPerAcre == null) return { unknown: true, reason: `unsupported rate unit "${unit}"`, productName }
  const ac = toNum(acres)
  if (ac == null || ac <= 0) return { unknown: true, reason: 'no acreage on file', productName }
  const lbProduct = lbPerAcre * ac
  return {
    nLb: parseFloat(((lbProduct * npk.n) / 100).toFixed(2)),
    pLb: parseFloat(((lbProduct * npk.p) / 100).toFixed(2)),
    kLb: parseFloat(((lbProduct * npk.k) / 100).toFixed(2)),
    why: `${productName}: ${rate} ${unit} × ${ac} ac × ${analysis}`,
  }
}

const monthKey = d => (typeof d === 'string' ? d.slice(0, 7) : null)
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to)

/**
 * Derive nutrition application lines from fertilizer spray records.
 *   sprays        — spray records (with products[].inventoryItemId, areas[])
 *   inventoryById — { [id]: inventory item (analysis, kind) }
 * Returns [{ id, date, area, productName, analysis, source:'spray',
 *            sourceSprayId, nLb, pLb, kLb, why } | { unknown }].
 */
export function deriveSprayNutrition(sprays, inventoryById = {}) {
  const out = []
  for (const s of sprays ?? []) {
    if (s.status === 'deleted' || s.status === 'cancelled') continue
    const date  = typeof s.date === 'string' ? s.date.slice(0, 10) : null
    if (!date) continue
    const acres = (s.areas ?? []).reduce((sum, a) => sum + (toNum(a.acreage) ?? 0), 0)
    const area  = s.area ?? s.areas?.[0]?.name ?? null
    for (const p of s.products ?? []) {
      const inv = p.inventoryItemId ? inventoryById[p.inventoryItemId] : null
      if (!inv || inv.kind !== 'fertilizer') continue   // only fertilizer contributes
      const npk = computeNpkLbs({ analysis: inv.analysis, rate: p.rate, unit: p.unit, acres, productName: p.name })
      const base = { id: `spray-${s.id}-${p.id ?? p.name}`, date, area, productName: p.name, analysis: inv.analysis, source: 'spray', sourceSprayId: s.id }
      out.push(npk.unknown ? { ...base, unknown: true, reason: npk.reason } : { ...base, ...npk })
    }
  }
  return out
}

/**
 * computeNutritionTotals({ standalone, sprays, inventoryById, from, to })
 *   standalone — nutrition_applications rows (already carry n/p/k snapshot)
 *   sprays + inventoryById — for the derived lines
 *   from / to  — ISO date bounds (inclusive) for the season window
 *
 * Returns:
 *   { applications, totals, byArea, byMonth, bySource, unknowns, hasData }
 */
export function computeNutritionTotals({ standalone = [], sprays = [], inventoryById = {}, from = null, to = null } = {}) {
  // Standalone first; collect promoted spray ids so we don't double-count.
  const promoted = new Set()
  const apps = []
  const unknowns = []

  for (const r of standalone) {
    const date = r.applicationDate
    if (!inRange(date, from, to)) continue
    if (r.sourceSprayId) promoted.add(r.sourceSprayId)
    apps.push({
      id: r.id, date, area: r.area, productName: r.productName, analysis: r.analysis,
      source: r.source ?? 'manual', sourceSprayId: r.sourceSprayId ?? null,
      nLb: toNum(r.nLb) ?? 0, pLb: toNum(r.pLb) ?? 0, kLb: toNum(r.kLb) ?? 0,
    })
  }

  for (const line of deriveSprayNutrition(sprays, inventoryById)) {
    if (!inRange(line.date, from, to)) continue
    if (promoted.has(line.sourceSprayId)) continue   // superseded by a standalone entry
    if (line.unknown) { unknowns.push(line); continue }
    apps.push(line)
  }

  // Newest first.
  apps.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const totals = { n: 0, p: 0, k: 0 }
  const byArea = {}, byMonth = {}, bySource = { manual: { n: 0, p: 0, k: 0 }, spray: { n: 0, p: 0, k: 0 } }
  for (const a of apps) {
    totals.n += a.nLb; totals.p += a.pLb; totals.k += a.kLb
    const ar = a.area || 'Unspecified'
    byArea[ar] = byArea[ar] || { n: 0, p: 0, k: 0 }
    byArea[ar].n += a.nLb; byArea[ar].p += a.pLb; byArea[ar].k += a.kLb
    const mk = monthKey(a.date)
    if (mk) { byMonth[mk] = byMonth[mk] || { n: 0, p: 0, k: 0 }; byMonth[mk].n += a.nLb; byMonth[mk].p += a.pLb; byMonth[mk].k += a.kLb }
    const src = bySource[a.source] ? a.source : 'manual'
    bySource[src].n += a.nLb; bySource[src].p += a.pLb; bySource[src].k += a.kLb
  }

  const round = o => ({ n: parseFloat(o.n.toFixed(1)), p: parseFloat(o.p.toFixed(1)), k: parseFloat(o.k.toFixed(1)) })
  return {
    hasData: apps.length > 0,
    applications: apps,
    totals: round(totals),
    byArea:  Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, round(v)])),
    byMonth: Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, round(v)])),
    bySource: { manual: round(bySource.manual), spray: round(bySource.spray) },
    unknowns,
  }
}
