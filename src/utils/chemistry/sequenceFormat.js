// Phase 22C — Chemistry Intelligence: compact sequence formatters.
//
// Pure formatters that turn the raw timeline data attached to a repeated
// MOA warning into UI-ready strings:
//
//   Timeline:
//     [{ date: '2026-05-04', code: '11', productNames: ['Heritage'],
//        area: 'Greens' },
//      { date: '2026-05-11', code: '11', productNames: ['Posterity'],
//        area: 'Greens' },
//      { date: '2026-05-15', code: '11', productNames: [], area: 'Greens',
//        isCurrent: true }]
//
//   Compact:
//     "11 → 11 → Current"
//     "M5 → 11 → 11 → Current"
//
// No React, no I/O. Inputs are plain objects produced by the analyzer.

// ── Date formatting ──────────────────────────────────────────────────────
//
// We avoid Intl APIs to keep the formatter deterministic across runtimes
// and to match the rest of TurfIntel's terse date style ("May 4" vs
// "May 4, 2026").

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmtShortDate(iso) {
  if (typeof iso !== 'string') return null
  // Accept 'YYYY-MM-DD' or full ISO. Parse leniently — empty/null returns null.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const month = parseInt(m[2], 10)
  const day   = parseInt(m[3], 10)
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null
  return `${MONTH_SHORT[month - 1] ?? '???'} ${day}`
}

// ── Timeline builders ───────────────────────────────────────────────────

/**
 * Build a UI-ready timeline for a single repeated-MOA warning.
 *
 *   Inputs:
 *     code              — the group code (e.g. '11')
 *     records           — [{ id, date, area }] from detectRepeatedMOA()
 *     historyByRecordId — { [recordId]: rawSprayRecord } for product lookup
 *     labelsByItemId    — { [inventoryItemId]: label } for code matching
 *     type              — 'FRAC' | 'HRAC' | 'IRAC'
 *     referenceDate     — draft date (used for the trailing "Current" entry)
 *     draftArea         — draft area (used for the trailing "Current" entry)
 *
 *   Output:
 *     [{ date, dateLabel, code, productNames: string[], area, isCurrent? }]
 *     in chronological order (oldest → newest), with a trailing
 *     { isCurrent: true } pseudo-entry representing the planned tank.
 */
export function buildMOATimeline({
  code,
  type,
  records,
  historyByRecordId,
  labelsByItemId,
  referenceDate,
  draftArea,
} = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return [{
      date:      referenceDate ?? null,
      dateLabel: fmtShortDate(referenceDate) ?? 'Current',
      code,
      productNames: [],
      area:      draftArea ?? null,
      isCurrent: true,
    }]
  }
  // Sort oldest → newest so the chain reads naturally left-to-right.
  const sorted = records
    .slice()
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))

  const entries = sorted.map(r => {
    const raw = historyByRecordId?.[r.id] ?? null
    const productNames = []
    if (raw && Array.isArray(raw.products)) {
      for (const p of raw.products) {
        const lbl = p?.inventoryItemId ? labelsByItemId?.[p.inventoryItemId] : null
        if (!lbl) continue
        // Only show products that actually carried THIS code on THAT app
        // — keeps multi-product tanks from over-attributing the chain.
        const fracCodes = String(lbl.fracGroup ?? '').toUpperCase()
        const hracCodes = String(lbl.hracGroup ?? '').toUpperCase()
        const iracCodes = String(lbl.iracGroup ?? '').toUpperCase()
        const codeUpper = String(code).toUpperCase()
        const matches =
          (type === 'FRAC' && fracCodes.split(/[\s,/]+|\bOR\b/).includes(codeUpper)) ||
          (type === 'HRAC' && hracCodes.split(/[\s,/]+|\bOR\b/).includes(codeUpper)) ||
          (type === 'IRAC' && iracCodes.split(/[\s,/]+|\bOR\b/).includes(codeUpper))
        if (matches) productNames.push(p?.name ?? '(unnamed)')
      }
    }
    return {
      date:         r.date ?? null,
      dateLabel:    fmtShortDate(r.date) ?? r.date ?? '—',
      code,
      productNames,
      area:         r.area ?? null,
      isCurrent:    false,
    }
  })

  entries.push({
    date:         referenceDate ?? null,
    dateLabel:    'Current',
    code,
    productNames: [],
    area:         draftArea ?? null,
    isCurrent:    true,
  })
  return entries
}

// ── Compact arrow-chain ─────────────────────────────────────────────────
//
// Turn a timeline into a one-liner: "M5 → 11 → 11 → Current".
//
// The codes shown are pulled from the timeline entries; when an entry has
// a code we emit it, otherwise we fall back to a placeholder so the chain
// length stays accurate. The trailing entry is always 'Current'.

export function formatSequence(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return ''
  const parts = timeline.map(t => t.isCurrent ? 'Current' : (t.code ?? '?'))
  return parts.join(' → ')
}

/**
 * Build a multi-code sequence label across a planned mix.
 * Useful when summarizing "what's the overall MOA chain for this area"
 * rather than per-code timelines.
 *
 *   buildMixSequence([
 *     { date: '2026-05-04', codes: ['M5'] },
 *     { date: '2026-05-11', codes: ['11'] },
 *   ], { plannedCodes: ['11', 'M5'] })
 *   → 'M5 → 11 → 11+M5 (Current)'
 */
export function buildMixSequence(recordsWithCodes, { plannedCodes } = {}) {
  const segs = (recordsWithCodes ?? []).map(r => (r.codes ?? []).join('+') || '?')
  if (Array.isArray(plannedCodes) && plannedCodes.length > 0) {
    segs.push(`${plannedCodes.join('+')} (Current)`)
  } else {
    segs.push('Current')
  }
  return segs.join(' → ')
}

export { fmtShortDate }
