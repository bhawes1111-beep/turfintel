// Phase 23C — Spray Program Intelligence: export + report builders.
//
// Pure helpers that turn the page's filtered records + computed summary
// into portable artifacts: a CSV row matrix, an RFC-4180-quoted CSV
// string, and a plain-text superintendent summary. Browser helpers for
// downloading the CSV and copying the summary to the clipboard are kept
// behind environment guards so this module imports cleanly under Node
// (the smoke test exercises the pure builders).
//
// No I/O inside the pure builders. No React, no fetch.

import {
  recordCodes,
  recordFamilies,
} from '../chemistry/sprayHistoryAnalysis.js'
import { lookupActiveFamily, AI_FAMILIES } from '../chemistry/aiFamilies.js'
import { areaSurfaceTypeOf } from '../chemistry/areaHierarchy.js'
import { describeActiveFilters } from './programFilters.js'

// ── CSV ──────────────────────────────────────────────────────────────────

export const CSV_HEADERS = [
  'date',
  'area',
  'surface',
  'products',
  'frac_codes',
  'hrac_codes',
  'irac_codes',
  'ai_families',
]

/**
 * Build the CSV row matrix for a filtered set of spray records.
 *
 *   buildCsvRows({ records, labelsByItemId })
 *     → { headers: [...], rows: [[...], [...], ...] }
 *
 * One row per record, in input order. Multi-valued cells (products, codes,
 * families) are joined with `; ` so the cell stays a single CSV field
 * while preserving readability when opened in Excel/Numbers/Sheets.
 *
 * Records without resolvable labels contribute empty code/family cells
 * — they're never silently dropped (auditors need to see the gap).
 */
export function buildCsvRows({ records, labelsByItemId } = {}) {
  const rows = (records ?? []).map(rec => {
    const codes = recordCodes(rec, labelsByItemId ?? {})
    const fams  = recordFamilies(rec, labelsByItemId ?? {}, lookupActiveFamily)
    const productNames = Array.isArray(rec.products)
      ? rec.products.map(p => p?.name).filter(Boolean)
      : []
    return [
      rec.date ?? '',
      rec.area ?? '',
      areaSurfaceTypeOf(rec?.area) ?? 'unspecified',
      productNames.join('; '),
      Array.from(codes.FRAC).join('; '),
      Array.from(codes.HRAC).join('; '),
      Array.from(codes.IRAC).join('; '),
      Array.from(fams.families).join('; '),
    ]
  })
  return { headers: CSV_HEADERS.slice(), rows }
}

/**
 * RFC-4180 CSV serialization. Quotes a field when it contains comma,
 * quote, CR, or LF. Doubles embedded quotes. CRLF row terminators so
 * Excel on Windows imports cleanly.
 */
export function serializeCsv({ headers, rows } = {}) {
  const all = []
  if (Array.isArray(headers) && headers.length > 0) all.push(headers)
  if (Array.isArray(rows)) for (const r of rows) all.push(r)
  return all.map(row => row.map(csvEscape).join(',')).join('\r\n')
}

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// ── Summary text ────────────────────────────────────────────────────────

/**
 * Plain-text superintendent report. Stable bullet shape; designed to
 * paste cleanly into email / Slack / a meeting agenda. No markdown.
 *
 *   buildSummaryText(summary, filters, { courseName }) → string
 *
 * filters is optional — when present, the header line includes the
 * active-filter description from programFilters.describeActiveFilters().
 */
export function buildSummaryText(summary, filters, { courseName, generatedAt } = {}) {
  if (!summary) return 'Program Intelligence Summary — no data'
  const lines = []
  const scopeChip = describeActiveFilters(filters ?? {})
  // Use the chip's scope phrase ("Current season", "Greens · Last 60 days")
  // as the heading suffix when present; otherwise default to "All data".
  const scopeText = scopeChip
    ? scopeChip.replace(/^Showing\s+/, '')
    : 'All data'
  lines.push(`Program Intelligence Summary — ${scopeText}`)
  if (courseName) lines.push(`Course: ${courseName}`)
  if (generatedAt) lines.push(`Generated: ${generatedAt}`)
  lines.push('')

  lines.push(`Total applications: ${summary.totalApplications ?? 0}`)

  if (summary.diversity?.score != null) {
    lines.push(`FRAC diversity: ${summary.diversity.score.toFixed(2)} (${summary.diversity.distinctCodes} distinct code${summary.diversity.distinctCodes === 1 ? '' : 's'})`)
  } else {
    lines.push('FRAC diversity: —')
  }

  const ms = summary.multiSite
  if (ms && ms.totalApplications > 0) {
    lines.push(`Multi-site rate: ${Math.round((ms.rate ?? 0) * 100)}% (${ms.withPartner} of ${ms.totalApplications})`)
  } else {
    lines.push('Multi-site rate: —')
  }

  if (summary.fracUsage?.length > 0) {
    lines.push('')
    lines.push('Top FRAC usage:')
    for (const e of summary.fracUsage.slice(0, 5)) {
      const tag = e.meta?.recognized ? ` (${e.meta.name})` : ''
      lines.push(`  · FRAC ${e.code}${tag} — ${e.applications} app${e.applications === 1 ? '' : 's'}`)
    }
  }

  if (summary.hracUsage?.length > 0) {
    lines.push('')
    lines.push('Top HRAC usage:')
    for (const e of summary.hracUsage.slice(0, 5)) {
      const tag = e.meta?.recognized ? ` (${e.meta.name})` : ''
      lines.push(`  · HRAC ${e.code}${tag} — ${e.applications} app${e.applications === 1 ? '' : 's'}`)
    }
  }

  if (summary.iracUsage?.length > 0) {
    lines.push('')
    lines.push('Top IRAC usage:')
    for (const e of summary.iracUsage.slice(0, 5)) {
      const tag = e.meta?.recognized ? ` (${e.meta.name})` : ''
      lines.push(`  · IRAC ${e.code}${tag} — ${e.applications} app${e.applications === 1 ? '' : 's'}`)
    }
  }

  if (summary.familyUsage?.families?.length > 0) {
    lines.push('')
    lines.push('Active-ingredient families:')
    for (const f of summary.familyUsage.families.slice(0, 5)) {
      const name = f.family?.name ?? AI_FAMILIES[f.code]?.name ?? f.code
      lines.push(`  · ${name} — ${f.applications} app${f.applications === 1 ? '' : 's'}`)
    }
  }

  const streaks = (summary.longestFracStreaks ?? []).filter(s => s.streak >= 2).slice(0, 5)
  if (streaks.length > 0) {
    lines.push('')
    lines.push('Longest MOA streaks:')
    for (const s of streaks) {
      const tag = s.meta?.recognized ? ` (${s.meta.name})` : ''
      lines.push(`  · FRAC ${s.code}${tag}: ${s.streak} in a row on ${s.surface}`)
    }
  }

  if (summary.highPressure?.length > 0) {
    lines.push('')
    lines.push('High-pressure groups:')
    for (const hp of summary.highPressure) {
      const tag = hp.meta?.recognized ? ` (${hp.meta.name})` : ''
      lines.push(`  · FRAC ${hp.code}${tag} — ${Math.round(hp.share * 100)}% of FRAC-coded apps`)
    }
  }

  if (summary.drift?.length > 0) {
    lines.push('')
    lines.push('Program drift (informational):')
    for (const f of summary.drift) {
      lines.push(`  [${(f.severity ?? '').toUpperCase()}] ${f.title}`)
    }
  }

  // Coverage note — explicit so a printed report makes attribution gaps
  // legible to the reader.
  if (summary.familyUsage?.unresolvedApplications > 0) {
    lines.push('')
    lines.push(`Chemistry coverage note: ${summary.familyUsage.unresolvedApplications} of ${summary.familyUsage.totalApplications} application${summary.familyUsage.totalApplications === 1 ? '' : 's'} have no family attribution. Import labels via Inventory → Add Chemical to improve attribution.`)
  }

  return lines.join('\n')
}

// ── Browser helpers (env-guarded) ───────────────────────────────────────

/**
 * Trigger a download of `text` as a file with the given `filename`.
 * No-op on non-browser environments so this module imports under Node
 * for the smoke test.
 */
export function downloadBlob(filename, mime, text) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([text], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Copy `text` to the clipboard. Returns a Promise<boolean> resolving to
 * true on success. Uses navigator.clipboard when available; falls back
 * to a hidden textarea + execCommand for older browsers.
 */
export async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy path.
    }
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  return ok
}

/** Suggested CSV filename — slug-safe; includes today's date. */
export function defaultCsvFilename({ courseName, generatedAt } = {}) {
  const datePart = (generatedAt ?? new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '')
  const slug = (courseName ?? 'turfintel')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'turfintel'
  return `${slug}-program-intelligence-${datePart}.csv`
}
