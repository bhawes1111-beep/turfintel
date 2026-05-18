// Phase 28A — Agronomic Intelligence Foundation.
//
// Pure functions that turn the data already in TurfIntel (spray records,
// inventory items, saved labels, weather forecast) into decision-support
// views for the dashboard.
//
// Five computed views:
//
//   1. activeREI            — REI windows still in effect at `now`
//   2. reapplicationWindows — products applied in the last 60 days with
//                             a known reapplication interval
//   3. rainfastWarnings     — recent applications whose rainfast window
//                             overlaps forecasted rain
//   4. groupRotation        — FRAC/HRAC/IRAC repeats (reuses Phase 22
//                             chemistryWarnings semantics)
//   5. nutrientTotals       — N/P/K applied this calendar week from
//                             fertilizer sprays with known analysis + area
//
// Rules (enforced throughout):
//   - Never invent values. When the inputs don't support a conclusion,
//     emit a `{ kind: 'unknown', reason }` entry instead of guessing.
//   - Every entry carries a `why` string the UI can show beside it.
//   - Pure: no React, no fetching, no global state. Same shape as
//     analyzeSprayDraft() in chemistryWarnings.js.

import { lookupGroup, RESISTANCE_RISK } from '../chemistry/chemistryMetadata.js'
import { recordCodes } from '../chemistry/sprayHistoryAnalysis.js'

// ── Time helpers ──────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000
const DAY_MS  = 24 * HOUR_MS

/**
 * Parse "12 hours" / "0 days" / "4 hrs" / "2 d" into a number of hours, or
 * null when the string can't be interpreted. Matches the format the label
 * extractor produces ("N hours" / "N days").
 */
export function parseIntervalHours(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const m = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b|days?|d\b)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  return m[2].toLowerCase().startsWith('d') ? n * 24 : n
}

/**
 * Combine a spray's `date` (YYYY-MM-DD) and `endTime` (HH:MM) into an
 * epoch ms. Returns null if either is missing. `endTime` is used so REI
 * is measured from the LAST product touchdown, matching label intent.
 */
export function sprayCompletionMs(record) {
  if (!record?.date) return null
  const time = record.endTime || record.startTime || '00:00'
  const iso  = `${record.date}T${time}:00`
  const ms   = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function fmtHM(ms) {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function fmtDate(ms) {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── 1. Active REI ─────────────────────────────────────────────────────────
//
// For each spray with a known completion time and REI, compute the end-of-
// REI moment. Keep only windows that are still open at `now`. Each entry
// carries the `why`: "spray ended HH:MM, REI = N hours".

export function computeActiveREI(sprays, now) {
  const out = []
  for (const s of sprays ?? []) {
    const reiHours = parseIntervalHours(s.rei)
    if (reiHours == null) continue
    const start = sprayCompletionMs(s)
    if (start == null) continue
    const ends = start + reiHours * HOUR_MS
    if (ends <= now) continue
    out.push({
      sprayId: s.id,
      applicationName: s.applicationName || s.targetPest || 'Spray',
      area: s.area ?? null,
      endsAt: ends,
      hoursRemaining: Math.max(0, (ends - now) / HOUR_MS),
      why: `Application ended ${fmtDate(start)} ${fmtHM(start)} — REI ${s.rei}`,
    })
  }
  out.sort((a, b) => a.endsAt - b.endsAt)
  return out
}

// ── 2. Reapplication windows ──────────────────────────────────────────────
//
// For each spray-product applied in the last `lookbackDays` days, if the
// linked label exposes a `reapplicationDays` value, compute the
// next-eligible date. Otherwise emit `kind: 'unknown'` with the reason —
// the UI shows it as "interval unknown — add to label" rather than
// hiding the product.
//
// NOTE: `reapplicationDays` is not yet populated by the worker (see
// Phase 27A-2 limitations). The plumbing is here so a future extractor
// pass can light this up without touching the dashboard.

export function computeReapplicationWindows({
  sprays,
  labelsByItemId,
  now,
  lookbackDays = 60,
  approachingDays = 3,
}) {
  const cutoff = now - lookbackDays * DAY_MS
  // Latest application per (inventoryItemId, area) so we don't re-warn for
  // every historical spray.
  const latest = new Map()
  for (const s of sprays ?? []) {
    const start = sprayCompletionMs(s)
    if (start == null || start < cutoff) continue
    for (const p of s.products ?? []) {
      if (!p.inventoryItemId) continue
      const key = `${p.inventoryItemId}|${s.area ?? ''}`
      const prev = latest.get(key)
      if (!prev || start > prev.appliedAt) {
        latest.set(key, {
          inventoryItemId: p.inventoryItemId,
          productName: p.name,
          area: s.area ?? null,
          appliedAt: start,
        })
      }
    }
  }

  const out = []
  for (const entry of latest.values()) {
    const label = labelsByItemId?.[entry.inventoryItemId]
    const intervalDays = label?.reapplicationDays
    if (intervalDays == null || !Number.isFinite(intervalDays)) {
      out.push({
        kind: 'unknown',
        productName: entry.productName,
        area: entry.area,
        appliedAt: entry.appliedAt,
        reason: label
          ? 'reapplication interval not extracted from label'
          : 'no saved label for this product',
        why: `Last applied ${fmtDate(entry.appliedAt)} — interval unknown`,
      })
      continue
    }
    const nextEligible = entry.appliedAt + intervalDays * DAY_MS
    const daysUntil    = (nextEligible - now) / DAY_MS
    let state
    if (daysUntil <= -1)                state = 'overdue'
    else if (daysUntil <= 0)            state = 'window-open'
    else if (daysUntil <= approachingDays) state = 'approaching'
    else                                state = 'scheduled'
    out.push({
      kind: 'known',
      state,
      productName: entry.productName,
      area: entry.area,
      appliedAt: entry.appliedAt,
      nextEligibleAt: nextEligible,
      daysUntil,
      why: `Last applied ${fmtDate(entry.appliedAt)} · label interval ${intervalDays} days`,
    })
  }
  // Sort: overdue first, then approaching, then scheduled, then unknowns.
  const order = { overdue: 0, 'window-open': 1, approaching: 2, scheduled: 3 }
  out.sort((a, b) => {
    if (a.kind === 'unknown' && b.kind !== 'unknown') return 1
    if (b.kind === 'unknown' && a.kind !== 'unknown') return -1
    return (order[a.state] ?? 9) - (order[b.state] ?? 9)
  })
  return out
}

// ── 3. Rainfast warnings ──────────────────────────────────────────────────
//
// For each spray in the last 24h, if the linked product's label has a
// rainfast-hours value (parsed from the rainfast clause), check the
// forecast for rain falling within that window. Only warn when BOTH
// the rainfast value AND the forecast rain are present — never warn on
// speculation.

const RAINFAST_HOURS_RE = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b)/i

export function extractRainfastHours(label) {
  // label.notes is where the worker landed the rainfast clause (Phase
  // 27A-2). Look for "N hour(s)" in the rainfast sentence.
  const text = label?.notes
  if (typeof text !== 'string') return null
  if (!/rainfast|water[- ]?in|irrigate after/i.test(text)) return null
  const m = text.match(RAINFAST_HOURS_RE)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

export function computeRainfastWarnings({ sprays, labelsByItemId, forecast, now }) {
  const out = []
  const cutoff = now - 24 * HOUR_MS
  // Build a forecast-by-date map for quick lookup.
  const rainByDate = new Map()
  for (const f of forecast ?? []) {
    if (!f?.date) continue
    rainByDate.set(f.date, f.rainfall ?? 0)
  }

  for (const s of sprays ?? []) {
    const finished = sprayCompletionMs(s)
    if (finished == null || finished < cutoff) continue
    for (const p of s.products ?? []) {
      if (!p.inventoryItemId) continue
      const label = labelsByItemId[p.inventoryItemId]
      const rfHours = extractRainfastHours(label)
      if (rfHours == null) continue
      const rainfastEnds = finished + rfHours * HOUR_MS
      if (rainfastEnds <= now) continue   // already past rainfast window
      // Scan the forecast: any date within the rainfast window with
      // measurable rain (>0.1 in by default).
      const windowDays = Math.ceil((rainfastEnds - now) / DAY_MS) + 1
      const today = new Date(now)
      const offending = []
      for (let i = 0; i <= windowDays; i++) {
        const d = new Date(today.getTime() + i * DAY_MS)
        const iso = d.toISOString().slice(0, 10)
        const rain = rainByDate.get(iso)
        if (typeof rain === 'number' && rain > 0.1) {
          offending.push({ date: iso, rainfall: rain })
        }
      }
      if (offending.length === 0) continue
      out.push({
        sprayId: s.id,
        productName: p.name,
        rainfastHours: rfHours,
        rainfastEndsAt: rainfastEnds,
        forecastRain: offending,
        why: `${p.name} label: rainfast in ${rfHours}h — forecast shows ${offending.map(o => `${o.rainfall.toFixed(2)}" on ${fmtDate(Date.parse(o.date))}`).join(', ')}`,
      })
    }
  }
  return out
}

// ── 4. FRAC / HRAC / IRAC rotation warnings ───────────────────────────────
//
// Reuses Phase 22's analyzeSprayDraft() against the past N days of sprays.
// To surface backward-looking repeats (rather than tank-mix planning), we
// treat the latest spray as the "planned tank" and the prior sprays as
// history. The analyzer's repeated-MOA logic then lights up any ongoing
// run of the same group code on the same area.
//
// We surface only WARN / HIGH entries on the dashboard — INFO entries
// (e.g. "you applied this once") are noise here.

// Dashboard rotation logic — bucket every recent spray by (area, group
// code) and flag any (area, type, code) tuple that received N+ applications
// in the window. We don't reuse analyzeSprayDraft() because that one's
// scoped to a single "planned tank vs. history" decision; the dashboard
// question is broader: anywhere on the course, is a group being repeated?

const ROTATION_REPEAT_THRESHOLD = 2  // 2 = "warn", 3 = "high"

export function computeGroupRotation({ sprays, labelsByItemId, now, lookbackDays = 60 }) {
  const cutoff = now - lookbackDays * DAY_MS
  const recent = (sprays ?? []).filter(s => {
    const ms = sprayCompletionMs(s)
    return ms != null && ms >= cutoff
  })
  if (recent.length === 0) return []

  // Bucket: areaKey → { FRAC|HRAC|IRAC → code → [{date, name, sprayId}] }
  const buckets = new Map()
  for (const s of recent) {
    const areaKey = s.area ?? '__unassigned__'
    if (!buckets.has(areaKey)) buckets.set(areaKey, { FRAC: {}, HRAC: {}, IRAC: {} })
    const a = buckets.get(areaKey)
    const codes = recordCodes(s, labelsByItemId)
    const ms = sprayCompletionMs(s)
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const code of codes[type]) {
        if (!a[type][code]) a[type][code] = []
        a[type][code].push({ sprayId: s.id, date: s.date, appliedAt: ms })
      }
    }
  }

  const warnings = []
  for (const [areaKey, perType] of buckets) {
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const [code, apps] of Object.entries(perType[type])) {
        if (apps.length < ROTATION_REPEAT_THRESHOLD) continue
        const meta = lookupGroup(type, code)
        // Severity scales with count AND with the group's resistance risk.
        let severity = 'warn'
        if (apps.length >= 3) severity = 'high'
        if (meta.riskLevel === RESISTANCE_RISK.LOW && apps.length < 3) {
          // Low-risk multi-site partners don't drive resistance — soften.
          severity = 'info'
        }
        // Drop info — dashboard only surfaces warn / high.
        if (severity === 'info') continue
        warnings.push({
          area:       areaKey === '__unassigned__' ? null : areaKey,
          type,
          code,
          groupName:  meta.name ?? null,
          riskLevel:  meta.riskLevel,
          severity,
          applications: apps.length,
          lastDate:   apps.map(a => a.date).sort().pop(),
          why:        `${type} ${code}${meta.name ? ` (${meta.name})` : ''} applied ${apps.length}× on ${areaKey === '__unassigned__' ? 'unassigned area' : areaKey} in the last ${lookbackDays} days`,
        })
      }
    }
  }
  // Most-severe first, then most-recent.
  const sevOrder = { high: 0, warn: 1 }
  warnings.sort((a, b) => {
    const s = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
    if (s !== 0) return s
    return (b.lastDate ?? '').localeCompare(a.lastDate ?? '')
  })
  return warnings
}

// ── 5. Nutrient totals (this calendar week) ───────────────────────────────
//
// For each fertilizer spray in the current ISO week (Mon-Sun), parse the
// `analysis` field (`N-P-K` like "46-0-0") and combine with the rate and
// area to produce a lb/ac figure per nutrient. Anything missing (no
// analysis, no rate, no area) gets recorded as an `unknown` line so the
// user sees what's blocking the total.

// Returns the ISO Monday 00:00 of the week containing `now`.
export function startOfWeekMs(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7   // Monday = 0
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

// Parse "18-3-6" → { n: 18, p: 3, k: 6 } | null
export function parseNPK(analysis) {
  if (typeof analysis !== 'string') return null
  const m = analysis.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (!m) return null
  return { n: parseFloat(m[1]), p: parseFloat(m[2]), k: parseFloat(m[3]) }
}

// Convert a product's rate (in its unit) to lb of product per acre. We
// keep this conservative: only `lb/acre`, `oz/acre`, `lb/1000sqft`, and
// `oz/1000sqft` are converted. Other units → null and the spray lands as
// an `unknown` line.
// D1 stores rate/acreage as TEXT so the API can return them as strings.
// Coerce numerics here at the boundary so the rest of the math works
// without per-call .Number() shimming.
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function rateToLbPerAcre(rateRaw, unit) {
  const rate = toNumber(rateRaw)
  if (rate == null) return null
  if (typeof unit !== 'string') return null
  const u = unit.toLowerCase().replace(/\s+/g, '')
  if (u === 'lb/acre' || u === 'lb/a' || u === 'lbs/acre' || u === 'lbs/a') return rate
  if (u === 'oz/acre' || u === 'oz/a')                                     return rate / 16
  if (u === 'lb/1000sqft' || u === 'lb/1ksqft')                            return rate * 43.56
  if (u === 'oz/1000sqft' || u === 'oz/1ksqft')                            return (rate / 16) * 43.56
  return null
}

export function computeNutrientTotals({ sprays, inventoryById, now }) {
  const weekStart = startOfWeekMs(now)
  const lines = []
  let totalN = 0, totalP = 0, totalK = 0
  let countContributing = 0

  for (const s of sprays ?? []) {
    const ms = sprayCompletionMs(s)
    if (ms == null || ms < weekStart || ms > now) continue
    // D1 returns acreage as a string (TEXT column); coerce per-area.
    const acres = s.areas?.reduce((sum, a) => sum + (toNumber(a.acreage) ?? 0), 0) ?? 0
    for (const p of s.products ?? []) {
      const inv = p.inventoryItemId ? inventoryById?.[p.inventoryItemId] : null
      if (!inv || inv.kind !== 'fertilizer') continue
      const npk = parseNPK(inv.analysis)
      if (!npk) {
        lines.push({
          kind: 'unknown',
          productName: p.name,
          reason: 'analysis missing on inventory item',
          why: `${p.name} applied ${fmtDate(ms)} — no N-P-K on file`,
        })
        continue
      }
      const lbPerAcre = rateToLbPerAcre(p.rate, p.unit)
      if (lbPerAcre == null) {
        lines.push({
          kind: 'unknown',
          productName: p.name,
          reason: `unsupported rate unit "${p.unit}"`,
          why: `${p.name}: rate unit "${p.unit}" not convertible to lb/acre`,
        })
        continue
      }
      if (acres <= 0) {
        lines.push({
          kind: 'unknown',
          productName: p.name,
          reason: 'no acreage on spray areas',
          why: `${p.name} applied ${fmtDate(ms)} — acreage missing`,
        })
        continue
      }
      const lbProduct = lbPerAcre * acres
      const nLb = (lbProduct * npk.n) / 100
      const pLb = (lbProduct * npk.p) / 100
      const kLb = (lbProduct * npk.k) / 100
      totalN += nLb; totalP += pLb; totalK += kLb
      countContributing += 1
      lines.push({
        kind: 'known',
        productName: p.name,
        appliedAt: ms,
        analysis: inv.analysis,
        rate: p.rate,
        rateUnit: p.unit,
        acres,
        nLb, pLb, kLb,
        why: `${p.name}: ${p.rate} ${p.unit} × ${acres} ac × ${inv.analysis}`,
      })
    }
  }
  return {
    weekStart,
    totals: {
      // Round to 1 decimal for display; underlying math stays full-precision.
      n: parseFloat(totalN.toFixed(1)),
      p: parseFloat(totalP.toFixed(1)),
      k: parseFloat(totalK.toFixed(1)),
    },
    contributingApplications: countContributing,
    lines,
  }
}

// ── Top-level: compose all five views ─────────────────────────────────────

/**
 * One-shot compute used by the dashboard card. All inputs come from
 * existing stores; nothing fetched here.
 *
 * @param {Object} input
 * @param {Array}  input.sprays           — spray records (course-scoped)
 * @param {Array}  input.labels           — saved inventory_product_labels
 * @param {Array}  input.inventory        — inventory_items rows
 * @param {Object} input.weather          — { forecast: [{date, rainfall}], current }
 * @param {number} [input.now]            — override clock for tests
 * @returns {{
 *   activeREI: Array,
 *   reapplicationWindows: Array,
 *   rainfastWarnings: Array,
 *   groupRotation: Array,
 *   nutrientTotals: Object
 * }}
 */
export function computeAgronomicIntelligence({ sprays, labels, inventory, weather, now }) {
  const clock = now ?? Date.now()
  const labelsByItemId = {}
  for (const l of labels ?? []) {
    if (l?.inventoryItemId) labelsByItemId[l.inventoryItemId] = l
  }
  const inventoryById = {}
  for (const i of inventory ?? []) {
    if (i?.id) inventoryById[i.id] = i
  }

  return {
    activeREI:            computeActiveREI(sprays, clock),
    reapplicationWindows: computeReapplicationWindows({ sprays, labelsByItemId, now: clock }),
    rainfastWarnings:     computeRainfastWarnings({
      sprays,
      labelsByItemId,
      forecast: weather?.forecast,
      now: clock,
    }),
    groupRotation:        computeGroupRotation({ sprays, labelsByItemId, now: clock }),
    nutrientTotals:       computeNutrientTotals({ sprays, inventoryById, now: clock }),
  }
}
