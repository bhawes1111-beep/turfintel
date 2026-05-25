// Phase 7E (1/?) — Spray Intelligence Report Builder Foundation.
//
// Read-only report that rolls up the same awareness primitives the
// Spray Builder shows live:
//   - chemistry-group presence (FRAC/HRAC/IRAC/PGR)
//   - max REI / signal word / restricted-use flag
//   - missing-intel count
//   - rotation: repeated groups across the saved spray window
//   - interval: most-recent matches per product + per group
//
// Reuses the existing pure Phase 7D helpers:
//   - buildSprayIntelligence       (per-spray chemistry summary)
//   - buildSprayRotationAwareness  (repeated groups vs history)
//   - buildSprayIntervalAwareness  (days-since matches)
// Plus the catalog-first 3-tier resolver from Phase 7C.1/6:
//   - resolveSprayProductIntel
//
// Architectural invariants:
//   - PURE: no React, no fetch, no store imports, no mutation
//   - Reads inputs only; output is a fresh TurfReport envelope
//   - Missing data is COUNTED, never guessed
//   - No recommendations / "apply / do not apply / safe / unsafe"
//   - No catalog mutation; no spray save-path changes
//
// This commit produces the report MODEL only. Export, persistence, and
// any PDF/CSV pipeline land in later commits — the registry surface
// just needs the same `build(bundle) → TurfReport` signature every
// other entry already implements.

import {
  REPORT_MODULE, REPORT_TYPE, SECTION_TYPE,
  createReport, createSection,
} from '../reportSchemas.js'
import { resolveSprayProductIntel } from '../../productCatalog/resolveSprayProductIntel.js'
import { buildSprayIntelligence }      from '../../productCatalog/sprayIntelligence.js'
import { buildSprayRotationAwareness } from '../../productCatalog/sprayRotationAwareness.js'
import { buildSprayIntervalAwareness } from '../../productCatalog/sprayIntervalAwareness.js'

const DISCLAIMER = [
  'Read-only spray intelligence summary.',
  'Based on recorded applications and linked catalog or label data.',
  'This report does not recommend treatments.',
  'Missing intelligence means products could not be evaluated from available catalog or label data.',
].join(' ')

// ── Per-spray summarization ─────────────────────────────────────────────────

/**
 * Resolve every product on a saved spray into the row shape the
 * Phase 7D helpers expect (`{ name, inventoryItemId, intel }`). Pure;
 * does not mutate the spray.
 *
 * @param {Object}   spray
 * @param {Object}   context
 * @param {Object[]} context.inventoryProducts
 * @param {Object[]} context.catalogProducts
 * @param {Object}   context.labelsByItemId
 * @returns {Array<{ name, inventoryItemId, intel }>}
 */
export function summarizeSprayRecordForReport(spray, context = {}) {
  const products = Array.isArray(spray?.products) ? spray.products : []
  const { inventoryProducts = [], catalogProducts = [], labelsByItemId = {} } = context
  return products.map(p => ({
    name:            p.name ?? null,
    inventoryItemId: p.inventoryItemId ?? null,
    intel: resolveSprayProductIntel(
      { name: p.name, inventoryItemId: p.inventoryItemId },
      { inventoryProducts, catalogProducts, labelsByItemId },
    ),
  }))
}

// ── Section builders ────────────────────────────────────────────────────────

/**
 * Build the typed report sections from a finalized summary. Exposed so
 * smoke + future renderers can re-emit just the sections without
 * re-running the full aggregation.
 *
 * @param {Object} summary  output of buildSprayIntelligenceReport's
 *                          internal aggregation step.
 * @returns {Object[]}      createSection() entries
 */
export function buildSprayReportSections(summary) {
  const sections = []

  sections.push(createSection({
    title: 'Overview',
    type:  SECTION_TYPE.FIELDS,
    data: {
      'Sprays reviewed':       summary.totals.spraysReviewed,
      'Products reviewed':     summary.totals.productsReviewed,
      'Products with intel':   summary.totals.productsWithIntel,
      'Missing intel count':   summary.totals.missingIntelCount,
      'Restricted-use count':  summary.totals.restrictedUseCount,
      'Repeated group count':  summary.totals.repeatedGroupCount,
      'Interval match count':  summary.totals.intervalMatchCount,
      'Date range':            summary.dateRange ?? '—',
      'Disclaimer':            DISCLAIMER,
    },
  }))

  // Chemistry Awareness — aggregated group presence across all
  // reviewed sprays. We sort numeric-first within each vocabulary.
  sections.push(createSection({
    title: 'Chemistry Awareness',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Vocabulary', 'Groups present'],
      rows: [
        ['FRAC', summary.chemistry.groups.frac.join(', ') || '—'],
        ['HRAC', summary.chemistry.groups.hrac.join(', ') || '—'],
        ['IRAC', summary.chemistry.groups.irac.join(', ') || '—'],
        ['PGR',  summary.chemistry.groups.pgr.join(', ')  || '—'],
        ['Max REI (hours)',
          summary.chemistry.maxReiHours != null ? summary.chemistry.maxReiHours : '—'],
        ['Highest signal word',
          summary.chemistry.highestSignalWord ?? '—'],
        ['Restricted-use present',
          summary.chemistry.restrictedUse ? 'Yes' : 'No'],
      ],
    },
  }))

  // Rotation Awareness — repeated groups by vocabulary.
  sections.push(createSection({
    title: 'Rotation Awareness',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Vocabulary', 'Repeated groups'],
      rows: [
        ['FRAC', summary.rotation.repeatedGroups.frac.join(', ') || '—'],
        ['HRAC', summary.rotation.repeatedGroups.hrac.join(', ') || '—'],
        ['IRAC', summary.rotation.repeatedGroups.irac.join(', ') || '—'],
        ['PGR',  summary.rotation.repeatedGroups.pgr.join(', ')  || '—'],
        ['Lookback (days)',          summary.rotation.lookbackDays],
        ['Sprays in window',         summary.rotation.recentExposure.length],
        ['Missing historical intel', summary.rotation.missingHistoricalIntelCount],
      ],
    },
  }))

  // Interval Awareness — recent matches per product and per group.
  const intervalRows = []
  for (const m of summary.interval.productMatches) {
    intervalRows.push([
      'Product',
      m.productName,
      m.daysSince === 0 ? 'today' : `${m.daysSince} day${m.daysSince !== 1 ? 's' : ''} ago`,
      m.lastAppliedDate,
      m.sprayName ?? '—',
    ])
  }
  for (const m of summary.interval.groupMatches) {
    intervalRows.push([
      'Group',
      `${m.groupType} ${m.group}`,
      m.daysSince === 0 ? 'today' : `${m.daysSince} day${m.daysSince !== 1 ? 's' : ''} ago`,
      m.lastAppliedDate,
      m.sprayName ?? '—',
    ])
  }
  if (intervalRows.length === 0) {
    intervalRows.push(['—', `No matches in the last ${summary.interval.lookbackDays} day${summary.interval.lookbackDays !== 1 ? 's' : ''}.`, '—', '—', '—'])
  }
  sections.push(createSection({
    title: 'Interval Awareness',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Kind', 'Match', 'Last seen', 'Date', 'Spray'],
      rows:    intervalRows,
    },
  }))

  // Missing Intelligence — explicit table so the steward sees which
  // sprays carry blind spots. Sourced from per-spray rollups; we
  // surface only sprays that actually have missing-intel rows.
  const missingRows = summary.perSpray
    .filter(s => s.missingIntelCount > 0)
    .map(s => [
      s.date ?? '—',
      s.applicationName ?? '—',
      s.missingIntelCount,
      s.productCount,
    ])
  sections.push(createSection({
    title: 'Missing Intelligence',
    type:  SECTION_TYPE.TABLE,
    data: {
      columns: ['Date', 'Spray', 'Missing intel', 'Products on spray'],
      rows:    missingRows.length > 0 ? missingRows : [['—', 'No missing-intel sprays in range.', 0, 0]],
    },
  }))

  return sections
}

// ── Top-level builder ──────────────────────────────────────────────────────

/**
 * Build the Spray Intelligence report.
 *
 * @param {Object}   input
 * @param {Object[]} input.sprays              spraysStore.records
 * @param {Object[]} input.inventoryProducts   inventoryStore.items
 * @param {Object[]} input.catalogProducts     productCatalogStore.products
 * @param {Object}   input.labelsByItemId
 * @param {string}   [input.dateRange]
 * @param {Object}   [input.options]
 * @param {number}   [input.options.rotationLookbackDays=30]
 * @param {number}   [input.options.intervalLookbackDays=45]
 * @param {number}   [input.options.maxHistoryItems=10]
 * @param {number}   [input.options.maxIntervalMatches=8]
 * @param {number}   [input.options.now]       epoch ms (for deterministic tests)
 * @returns {Object} TurfReport envelope (see reportSchemas.js → createReport)
 */
export function buildSprayIntelligenceReport(input = {}) {
  const sprays            = Array.isArray(input.sprays)            ? input.sprays            : []
  const inventoryProducts = Array.isArray(input.inventoryProducts) ? input.inventoryProducts : []
  const catalogProducts   = Array.isArray(input.catalogProducts)   ? input.catalogProducts   : []
  const labelsByItemId    = (input.labelsByItemId && typeof input.labelsByItemId === 'object')
    ? input.labelsByItemId : {}
  const dateRange         = input.dateRange ?? null
  const options           = input.options ?? {}

  const rotationLookbackDays = Number.isFinite(options.rotationLookbackDays)
    ? Math.max(0, options.rotationLookbackDays) : 30
  const intervalLookbackDays = Number.isFinite(options.intervalLookbackDays)
    ? Math.max(0, options.intervalLookbackDays) : 45
  const maxHistoryItems = Number.isFinite(options.maxHistoryItems)
    ? Math.max(1, options.maxHistoryItems) : 10
  const maxIntervalMatches = Number.isFinite(options.maxIntervalMatches)
    ? Math.max(1, options.maxIntervalMatches) : 8
  const now = typeof options.now === 'number' ? options.now : Date.now()

  // Shared resolver closure so the helper modules stay free of store
  // coupling (same pattern Spray Builder uses).
  const resolveProductIntel = (productLike) =>
    resolveSprayProductIntel(productLike, {
      inventoryProducts, catalogProducts, labelsByItemId,
    })

  // ── Per-spray rollup ────────────────────────────────────────────────
  // We compute buildSprayIntelligence over EACH saved spray so missing-
  // intel counts attribute to the spray that actually carries them.
  const perSpray = []
  let restrictedUseCount = 0
  for (const spray of sprays) {
    if (!spray) continue
    if (spray.status === 'deleted' || spray.deletedAt) continue
    const rows = summarizeSprayRecordForReport(spray, {
      inventoryProducts, catalogProducts, labelsByItemId,
    })
    const intel = buildSprayIntelligence(rows)
    if (intel.restrictedUse) restrictedUseCount++
    perSpray.push({
      id:               spray.id,
      date:             spray.date,
      applicationName:  spray.applicationName,
      productCount:     intel.totalProducts,
      missingIntelCount: intel.missingIntelCount,
      groups:           intel.groups,
      maxReiHours:      intel.maxReiHours,
      highestSignalWord: intel.highestSignalWord,
      restrictedUse:    intel.restrictedUse,
    })
  }

  // ── Aggregate chemistry across ALL reviewed sprays ──────────────────
  // We feed every reviewed product through buildSprayIntelligence ONCE
  // so the aggregate groups, max REI, and signal word reflect the union
  // (not just the latest spray). Re-uses the same helper rather than
  // re-implementing the merge.
  const allRows = []
  for (const spray of sprays) {
    if (!spray) continue
    if (spray.status === 'deleted' || spray.deletedAt) continue
    const rows = summarizeSprayRecordForReport(spray, {
      inventoryProducts, catalogProducts, labelsByItemId,
    })
    for (const r of rows) allRows.push(r)
  }
  const chemistry = buildSprayIntelligence(allRows)

  // ── Rotation Awareness over the whole window ────────────────────────
  // The "current rows" passed to buildSprayRotationAwareness are the
  // aggregate of every reviewed spray — the report-level analogue of
  // "what chemistry is in play right now?" Past sprays are the same
  // saved records, filtered by the helper's own lookbackDays.
  const rotation = buildSprayRotationAwareness(allRows, sprays, {
    lookbackDays: rotationLookbackDays,
    maxHistoryItems,
    resolveProductIntel,
    now,
  })

  // ── Interval Awareness ──────────────────────────────────────────────
  // Same input + injected resolver.
  const interval = buildSprayIntervalAwareness(allRows, sprays, {
    lookbackDays: intervalLookbackDays,
    maxMatches: maxIntervalMatches,
    resolveProductIntel,
    now,
  })

  const repeatedGroupCount =
      rotation.repeatedGroups.frac.length
    + rotation.repeatedGroups.hrac.length
    + rotation.repeatedGroups.irac.length
    + rotation.repeatedGroups.pgr.length

  const intervalMatchCount =
      interval.productMatches.length
    + interval.groupMatches.length

  const summary = {
    dateRange,
    totals: {
      spraysReviewed:     perSpray.length,
      productsReviewed:   chemistry.totalProducts,
      productsWithIntel:  chemistry.productsWithIntelCount,
      missingIntelCount:  chemistry.missingIntelCount,
      restrictedUseCount,
      repeatedGroupCount,
      intervalMatchCount,
    },
    chemistry,
    rotation,
    interval,
    perSpray,
  }

  // ── Notices — re-emit each helper's notices, prefixed so the source
  // is clear in the report. Same stewardship-only vocabulary; no
  // recommendation phrases.
  const notices = [
    ...(chemistry.notices  ?? []).map(n => ({ ...n, label: `Chemistry · ${n.label}` })),
    ...(rotation.notices   ?? []).map(n => ({ ...n, label: `Rotation · ${n.label}` })),
    ...(interval.notices   ?? []).map(n => ({ ...n, label: `Interval · ${n.label}` })),
  ]

  const sections = buildSprayReportSections(summary)

  // Phase 7E (3/?) — stable export-metadata contract. These keys are
  // versioned so downstream PDF/Excel/external consumers can rely on a
  // predictable shape. Bump exportVersion when fields change semantics.
  const generatedAt = new Date(now).toISOString()
  const metadata = {
    // Identification / versioning.
    exportVersion: 1,
    reportKind:    REPORT_TYPE.SPRAY_INTELLIGENCE,
    generatedBy:   'TurfIntel',
    generatedAt,
    dateRange,

    // Content surfaces.
    totals:        summary.totals,
    lookback:      { rotationDays: rotationLookbackDays, intervalDays: intervalLookbackDays },
    notices,
    disclaimer:    DISCLAIMER,

    // Print-only opt-in extras consumed by reportFormatter.buildPrintDocument.
    // Generic reports won't carry this object so their print output is
    // unchanged. Each field is a plain string / array of plain strings —
    // safe to JSON-serialize, safe to escape into HTML.
    printExtras: {
      subtitle: 'Read-only spray intelligence summary',
      summary: [
        ['Sprays reviewed',      summary.totals.spraysReviewed],
        ['Products reviewed',    summary.totals.productsReviewed],
        ['With intelligence',    summary.totals.productsWithIntel],
        ['Missing intelligence', summary.totals.missingIntelCount],
        ['Restricted-use',       summary.totals.restrictedUseCount],
        ['Repeated groups',      summary.totals.repeatedGroupCount],
        ['Interval matches',     summary.totals.intervalMatchCount],
      ],
      notices,
      disclaimer:  DISCLAIMER,
      // Footer line for printed output — stewardship copy + generated-at.
      footerLeft:  'TurfIntel · Spray Intelligence',
      footerRight: `Generated ${generatedAt}`,
    },
  }

  const envelope = createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_INTELLIGENCE,
    title:         'Spray Intelligence Report',
    sections,
    metadata,
  })

  // Convenient shape exposing both the envelope and the model
  // (intermediate summary) so consumers can render either directly.
  // The registry-side build() returns the envelope only; smoke can
  // pull `.metadata` for direct assertions if desired.
  return envelope
}
