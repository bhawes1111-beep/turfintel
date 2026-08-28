import {
  createReport,
  createSection,
  REPORT_MODULE,
  REPORT_TYPE,
  EXPORT_FORMAT,
  SECTION_TYPE,
} from './reportSchemas.js'
import { HEALTH_TYPE_LABELS, SEVERITY_LABELS } from '../turfHealth/healthTypes.js'
import { buildPayrollBreakdown } from '../crew/payrollMath.js'
// Phase S.6a — Shared needs-info heuristic for the compliance packet
// per-record flag + summary count. Replaces the local
// recordNeedsInfoLocal helper which duplicated the same logic.
import { recordNeedsInfo } from '../sprays/recordNeedsInfo.js'

// Duplicated here to keep reports/ self-contained — no coupling to Irrigation page
const ISSUE_TYPE_LABELS = {
  'broken-head':      'Broken Head',
  'leaking-valve':    'Leaking Valve',
  'clogged-nozzle':   'Clogged Nozzle',
  'line-break':       'Line Break',
  'controller-fault': 'Controller Fault',
  'stuck-valve':      'Stuck Valve',
  'pop-up-failure':   'Pop-Up Failure',
}

const STANDARD_FORMATS = [EXPORT_FORMAT.PRINT, EXPORT_FORMAT.PDF, EXPORT_FORMAT.JSON, EXPORT_FORMAT.CSV]

// ── Irrigation ─────────────────────────────────────────────────────────────────

/**
 * Build a detailed report for a single irrigation repair record.
 * @param {Object}   repair      - TurfRepair record from irrigation data
 * @param {Object[]} [attachments] - createAttachmentRef() results
 */
export function buildIrrigationRepairReport(repair, attachments = []) {
  const issueLabel = ISSUE_TYPE_LABELS[repair.issueType] ?? repair.issueType

  const sections = [
    createSection({
      title: 'Repair Overview',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Repair ID':      repair.repairId,
        'Issue Type':     issueLabel,
        'Priority':       repair.priority,
        'Status':         repair.status.replace('-', ' '),
        'Date Reported':  repair.dateReported,
        'Date Completed': repair.dateCompleted || (repair.status === 'completed' ? '—' : 'In progress'),
      },
    }),
    createSection({
      title: 'Location',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Area':        repair.area,
        'Hole':        repair.hole != null ? `Hole ${repair.hole}` : '—',
        'Head Number': repair.headNumber ? `#${repair.headNumber}` : '—',
      },
    }),
    createSection({
      title: 'Labor',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Assigned To':  repair.assignedTo || 'Unassigned',
        'Labor Hours':  repair.laborHours > 0 ? `${repair.laborHours}h` : '—',
      },
    }),
  ]

  if (repair.partsUsed?.length > 0) {
    const partsCost = repair.partsUsed.reduce((sum, part) => {
      const cost = Number(part?.cost)
      return sum + (Number.isFinite(cost) ? cost : 0)
    }, 0)
    sections.push(createSection({
      title: 'Parts Used',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Qty', 'Part / Material', 'Cost'],
        rows:    [
          ...repair.partsUsed.map(p => [
            p.qty,
            p.part,
            p.cost != null ? `$${Number(p.cost).toFixed(2)}` : '-',
          ]),
          ['', 'Parts Total', `$${partsCost.toFixed(2)}`],
        ],
      },
    }))
  }

  if (repair.notes) {
    sections.push(createSection({
      title: 'Notes',
      type:  SECTION_TYPE.TEXT,
      data:  repair.notes,
    }))
  }

  return createReport({
    module:        REPORT_MODULE.IRRIGATION,
    type:          REPORT_TYPE.REPAIR_LOG,
    title:         `Irrigation Repair — ${issueLabel}`,
    generatedBy:   'irrigation-module',
    sections,
    attachments,
    metadata: {
      repairId:  repair.repairId,
      area:      repair.area,
      issueType: repair.issueType,
      priority:  repair.priority,
    },
    exportFormats: STANDARD_FORMATS,
  })
}

/**
 * Build a summary report across multiple irrigation repairs.
 * @param {Object[]} repairs - Array of TurfRepair records
 */
export function buildIrrigationRepairSummaryReport(repairs) {
  const open          = repairs.filter(r => r.status !== 'completed')
  const completed     = repairs.filter(r => r.status === 'completed')
  const highPriority  = open.filter(r => r.priority === 'high')
  const partsNeeded   = repairs.filter(r => r.status === 'parts-needed')
  const totalLabor    = repairs.reduce((sum, r) => sum + (r.laborHours ?? 0), 0)

  return createReport({
    module:      REPORT_MODULE.IRRIGATION,
    type:        REPORT_TYPE.REPAIR_LOG,
    title:       'Irrigation Repair Summary',
    generatedBy: 'irrigation-module',
    sections: [
      createSection({
        title: 'Summary',
        type:  SECTION_TYPE.FIELDS,
        data: {
          'Total Repairs':    repairs.length,
          'Open':             open.length,
          'Completed':        completed.length,
          'High Priority':    highPriority.length,
          'Parts Needed':     partsNeeded.length,
          'Total Labor Hrs':  totalLabor > 0 ? `${totalLabor}h` : '0h',
        },
      }),
      createSection({
        title: 'Open Repairs',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['ID', 'Issue', 'Area', 'Priority', 'Status', 'Assigned To'],
          rows: open.map(r => [
            r.repairId,
            ISSUE_TYPE_LABELS[r.issueType] ?? r.issueType,
            r.area,
            r.priority,
            r.status.replace('-', ' '),
            r.assignedTo || 'Unassigned',
          ]),
        },
      }),
      ...(completed.length > 0 ? [createSection({
        title: 'Completed Repairs',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['ID', 'Issue', 'Area', 'Completed', 'Labor Hrs'],
          rows: completed.map(r => [
            r.repairId,
            ISSUE_TYPE_LABELS[r.issueType] ?? r.issueType,
            r.area,
            r.dateCompleted || '—',
            r.laborHours > 0 ? `${r.laborHours}h` : '—',
          ]),
        },
      })] : []),
    ],
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Spray ──────────────────────────────────────────────────────────────────────

/**
 * Build a spray application summary report.
 * @param {Object[]} applications - Spray application records
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.zone]
 * @param {string}   [options.title]
 */
export function buildSpraySummaryReport(applications, options = {}) {
  const { dateRange, zone, title = 'Spray Application Summary' } = options

  const products    = [...new Set(applications.map(a => a.product).filter(Boolean))]
  const applicators = [...new Set(applications.map(a => a.applicator).filter(Boolean))]

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Applications': applications.length,
        'Date Range':         dateRange || '—',
        'Zone / Area':        zone || 'All',
        'Products Used':      products.length > 0 ? products.join(', ') : '—',
        'Applicators':        applicators.length > 0 ? applicators.join(', ') : '—',
      },
    }),
  ]

  if (applications.length > 0) {
    sections.push(createSection({
      title: 'Applications',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Product', 'Rate', 'Area', 'Applicator'],
        rows: applications.map(a => [
          a.date        ?? '—',
          a.product     ?? '—',
          a.rate        ?? '—',
          a.area        ?? '—',
          a.applicator  ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_SUMMARY,
    title,
    generatedBy:   'spray-module',
    sections,
    metadata:      { dateRange: dateRange ?? null, zone: zone ?? null },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Phase S.5c.2 — Spray Compliance Packet ────────────────────────────────────
//
// Multi-record compliance packet for inspections / month-end records.
// Distinct from buildSpraySummaryReport (the short 5-column "what got
// sprayed when?" overview): this packet renders a cover section with
// rollup counts + a dedicated FIELDS section per record so each
// application's full snapshot is in one printable place.
//
// Snapshot integrity: every per-product cell reads ONLY the stored
// snapshot fields on the record — never re-resolves against the
// current product_catalog. EPA #, active ingredients, cost values
// are whatever was frozen at write time (Phase S.3). This keeps the
// PDF audit-stable even if the catalog is corrected later.
//
// Pure: no fetch, no mutation, no store reads. Caller passes in the
// already-filtered record set.

function formatProductLine(p) {
  if (!p) return ''
  const bits = [p.name || '(unnamed)']
  if (p.rate) bits.push(`rate ${p.rate}`)
  if (p.quantityUsed != null) {
    bits.push(`qty ${p.quantityUsed}${p.unit ? ` ${p.unit}` : ''}`)
  }
  // Snapshots — read-only display, never re-resolved.
  if (p.epaNumberSnapshot) bits.push(`EPA ${p.epaNumberSnapshot}`)
  if (p.activeIngredientsSnapshot) bits.push(`AI: ${p.activeIngredientsSnapshot}`)
  if (p.totalCostSnapshot != null) {
    bits.push(`cost $${Number(p.totalCostSnapshot).toFixed(2)}`)
  }
  return bits.join(' · ')
}

function formatWeatherLine(c) {
  if (!c) return '—'
  const bits = []
  if (c.temp != null)         bits.push(`${c.temp}°F`)
  if (c.humidity != null)     bits.push(`${c.humidity}% RH`)
  if (c.windSpeedMph != null) bits.push(`wind ${c.windSpeedMph} mph`)
  if (c.windDirection)        bits.push(`from ${c.windDirection}`)
  if (c.soilTemp != null)     bits.push(`soil ${c.soilTemp}°F`)
  if (c.wind)                 bits.push(`(${c.wind})`)
  return bits.length > 0 ? bits.join(' · ') : '—'
}

// Phase S.6a — recordNeedsInfoLocal removed. Now imported from
// ../sprays/recordNeedsInfo.js as the single source of truth shared
// with SprayWorkspace + SprayRecords.

/**
 * Build a date-range compliance packet PDF.
 * @param {Object[]} records  — pre-filtered spray records (full nested shape from the store)
 * @param {Object}   [options]
 * @param {string}   [options.title='Spray Compliance Packet']
 * @param {string}   [options.dateRange] — e.g. "2026-06-01 → 2026-06-30"
 * @param {string}   [options.courseName]
 * @param {string}   [options.filtersSummary] — e.g. "Applicator: Jose · Status: completed"
 */
export function buildSprayCompliancePacket(records = [], options = {}) {
  const {
    title         = 'Spray Compliance Packet',
    dateRange,
    courseName,
    filtersSummary,
  } = options

  const safeRecords = Array.isArray(records) ? records : []

  const completedCount = safeRecords.filter(r => r.status === 'completed').length
  const needsInfoCount = safeRecords.filter(recordNeedsInfo).length
  const products       = [
    ...new Set(safeRecords.flatMap(r => (r.products ?? []).map(p => p?.name).filter(Boolean))),
  ]
  const applicators    = [
    ...new Set(safeRecords.map(r => r.applicator).filter(a => a && a.trim())),
  ]

  const sections = [
    createSection({
      title: 'Compliance Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Course':           courseName     || '—',
        'Date Range':       dateRange      || '—',
        'Filters Applied':  filtersSummary || 'None',
        'Total Records':    safeRecords.length,
        'Completed':        completedCount,
        'Needs Info':       needsInfoCount,
        'Products Used':    products.length    > 0 ? products.join(', ')    : '—',
        'Applicators':      applicators.length > 0 ? applicators.join(', ') : '—',
        'Generated':        new Date().toISOString(),
      },
    }),
  ]

  // Per-record sections. Each is a FIELDS section with a multi-line
  // value for products / weather / areas so the layout reads cleanly
  // when printed. Title includes the record date + product summary
  // + a "needs info" tag when applicable.
  for (const r of safeRecords) {
    const productSummary = (r.products ?? [])
      .map(p => p?.name)
      .filter(Boolean)
      .join(' + ') || '(no products)'

    const needsFlag = recordNeedsInfo(r) ? ' — NEEDS INFO' : ''
    const sectionTitle = `${r.date ?? '(no date)'} · ${productSummary}${needsFlag}`

    const areaList = (r.areas ?? [])
      .map(a => `${a.name ?? '(area)'}${a.acreage != null ? ` (${a.acreage} ac)` : ''}`)
      .join(', ') || (r.area ?? '—')

    const productLines = (r.products ?? []).length > 0
      ? r.products.map(formatProductLine).join('\n')
      : '—'

    const fields = {
      'Date':              r.date              ?? '—',
      // Phase S.6a — Start / End time added to the per-record block.
      // Captured by builder + edit modal since S.5b.1; previously not
      // surfaced in the audit packet PDF.
      'Start Time':        r.startTime         ?? '—',
      'End Time':          r.endTime           ?? '—',
      'Status':            r.status            ?? '—',
      'Applicator':        r.applicator        ?? '—',
      'License':           r.applicatorLicense ?? '—',
      'Target / Pest':     r.targetPest        ?? '—',
      'Area':              areaList,
      'Products':          productLines,
      'Weather':           formatWeatherLine(r.conditions),
      'Carrier Volume':    r.carrierVolume     ?? '—',
      'Total Volume':      r.totalVolume != null ? `${r.totalVolume} gal` : '—',
      'REI':               r.rei != null ? `${r.rei} hr` : '—',
      'Total Cost':        r.totalCostSnapshot != null
                            ? `$${Number(r.totalCostSnapshot).toFixed(2)}`
                            : '—',
      'Notes':             (r.notes ?? '').trim() || '—',
    }
    if (recordNeedsInfo(r)) {
      fields['Compliance Flag'] = 'Record missing required compliance information.'
    }

    sections.push(createSection({
      title: sectionTitle,
      type:  SECTION_TYPE.FIELDS,
      data:  fields,
    }))
  }

  if (safeRecords.length === 0) {
    sections.push(createSection({
      title: 'No records',
      type:  SECTION_TYPE.TEXT,
      data:  'The filter set produced no records. Adjust the filters and try again.',
    }))
  }

  return createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_SUMMARY,
    title,
    generatedBy:   'spray-module',
    sections,
    metadata:      {
      dateRange:      dateRange ?? null,
      courseName:     courseName ?? null,
      recordCount:    safeRecords.length,
      completedCount,
      needsInfoCount,
    },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Phase S.5c.3 — Spray Product Usage Totals ─────────────────────────────────
//
// Rolls up per-product totals across a record set. Distinct from the
// compliance packet (S.5c.2) which is record-first: this report is
// product-first. For each product+unit pair (we never collapse rows
// that disagree on unit — see grouping note below) we surface:
//   • record count
//   • total quantity
//   • total cost (from per-product totalCostSnapshot)
//   • first / last used date
//   • EPA + active-ingredient snapshots (from the most-recent record
//     that carried them — read-only display, never re-resolved)
//   • per-record contribution detail (date / applicator / area /
//     quantity / cost)
//
// Grouping rule: products are grouped by `(catalogId ?? name) + ' · ' + unit`.
// Two records spraying the same product but reporting in different
// units (e.g. "oz" vs "gal") render as separate rows so an auditor
// never sees a meaningless mixed-unit sum. The cover section's "Total
// Unique Products" still counts distinct catalogId/name (ignoring
// unit) so the supervisor sees the natural product count.
//
// Pure: no fetch, no mutation, no store reads. Caller passes in the
// already-filtered record set.

function productUsageGroupKey(product) {
  // Prefer catalogId so a renamed product still groups consistently.
  // Fall back to name. Always append unit so disagreeing units split.
  const id   = product?.productCatalogId ?? product?.name ?? '(unnamed)'
  const unit = (product?.unit ?? '').trim() || '—'
  return `${id} · ${unit}`
}

export function buildSprayProductUsageReport(records = [], options = {}) {
  const {
    title           = 'Product Usage Totals',
    dateRange,
    courseName,
    filtersSummary,
    includeRecordDetail = true,
  } = options

  const safeRecords = Array.isArray(records) ? records : []

  // Accumulator: groupKey → {name, unit, catalogId, epa, ai, recordIds,
  // qty, cost, firstDate, lastDate, contributions[]}.
  const byGroup = new Map()
  let grandCost = 0
  let hasAnyCost = false

  for (const r of safeRecords) {
    for (const p of (r.products ?? [])) {
      if (!p) continue
      const key = productUsageGroupKey(p)
      let g = byGroup.get(key)
      if (!g) {
        g = {
          key,
          name:          p.name ?? '(unnamed)',
          unit:          (p.unit ?? '').trim() || '—',
          catalogId:     p.productCatalogId ?? null,
          // Snapshots — first occurrence wins. We deliberately do NOT
          // re-resolve from the live catalog; if a later record
          // captured a fresher snapshot, the supervisor sees both via
          // contributions[].
          epa:           p.epaNumberSnapshot         ?? null,
          ai:            p.activeIngredientsSnapshot ?? null,
          recordIds:     new Set(),
          totalQty:      0,
          hasQty:        false,
          totalCost:     0,
          hasCost:       false,
          firstDate:     null,
          lastDate:      null,
          contributions: [],
        }
        byGroup.set(key, g)
      }
      // Backfill snapshots if a later record carries them.
      if (!g.epa && p.epaNumberSnapshot)         g.epa = p.epaNumberSnapshot
      if (!g.ai  && p.activeIngredientsSnapshot) g.ai  = p.activeIngredientsSnapshot

      g.recordIds.add(r.id)

      const qty = Number(p.quantityUsed)
      if (Number.isFinite(qty) && qty > 0) {
        g.totalQty += qty
        g.hasQty    = true
      }

      const cost = Number(p.totalCostSnapshot)
      if (Number.isFinite(cost) && cost >= 0) {
        g.totalCost += cost
        g.hasCost    = true
        grandCost   += cost
        hasAnyCost   = true
      }

      if (r.date) {
        if (!g.firstDate || r.date < g.firstDate) g.firstDate = r.date
        if (!g.lastDate  || r.date > g.lastDate)  g.lastDate  = r.date
      }

      g.contributions.push({
        date:        r.date        ?? null,
        applicator:  r.applicator  ?? null,
        area:        r.area        ?? null,
        quantity:    Number.isFinite(qty)  && qty  > 0  ? qty  : null,
        cost:        Number.isFinite(cost) && cost >= 0 ? cost : null,
      })
    }
  }

  const groups = [...byGroup.values()].sort((a, b) => {
    // Sort by total cost desc when costs exist, else by record count desc.
    if (b.totalCost !== a.totalCost) return b.totalCost - a.totalCost
    return b.recordIds.size - a.recordIds.size
  })

  // "Unique products" ignores unit splits — natural product count.
  const uniqueProductIds = new Set(
    safeRecords.flatMap(r => (r.products ?? []).map(p => p?.productCatalogId ?? p?.name).filter(Boolean)),
  )

  const sections = [
    createSection({
      title: 'Product Usage Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Course':           courseName     || '—',
        'Date Range':       dateRange      || '—',
        'Filters Applied':  filtersSummary || 'None',
        'Total Records':    safeRecords.length,
        'Unique Products':  uniqueProductIds.size,
        'Total Cost':       hasAnyCost ? `$${grandCost.toFixed(2)}` : '—',
        'Generated':        new Date().toISOString(),
      },
    }),
  ]

  if (groups.length > 0) {
    sections.push(createSection({
      title: 'Per-Product Totals',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: [
          'Product', 'Unit', 'Records', 'Total Qty', 'Total Cost', 'Avg / Use', 'First Used', 'Last Used',
        ],
        rows: groups.map(g => {
          const uses    = g.recordIds.size
          const avgCost = g.hasCost && uses > 0 ? g.totalCost / uses : null
          return [
            g.name,
            g.unit,
            uses,
            g.hasQty  ? +g.totalQty.toFixed(3)             : '—',
            g.hasCost ? `$${g.totalCost.toFixed(2)}`       : '—',
            avgCost != null ? `$${avgCost.toFixed(2)}`     : '—',
            g.firstDate ?? '—',
            g.lastDate  ?? '—',
          ]
        }),
      },
    }))
  }

  // Per-product detail — snapshots + optional contributing-record list.
  if (includeRecordDetail) {
    for (const g of groups) {
      const fields = {
        'Product':            g.name,
        'Unit':               g.unit,
        'EPA Number':         g.epa ?? '—',
        'Active Ingredients': g.ai  ?? '—',
        'Records':            g.recordIds.size,
        'Total Quantity':     g.hasQty  ? `${+g.totalQty.toFixed(3)} ${g.unit}` : '—',
        'Total Cost':         g.hasCost ? `$${g.totalCost.toFixed(2)}` : '—',
        'First Used':         g.firstDate ?? '—',
        'Last Used':          g.lastDate  ?? '—',
      }
      sections.push(createSection({
        title: `${g.name} (${g.unit})`,
        type:  SECTION_TYPE.FIELDS,
        data:  fields,
      }))
      // Contributing-record table — separate section so it nests cleanly.
      if (g.contributions.length > 0) {
        sections.push(createSection({
          title: `${g.name} — Contributing Records`,
          type:  SECTION_TYPE.TABLE,
          data: {
            columns: ['Date', 'Applicator', 'Area', `Qty (${g.unit})`, 'Cost'],
            rows: g.contributions
              .slice()
              .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
              .map(c => [
                c.date       ?? '—',
                c.applicator ?? '—',
                c.area       ?? '—',
                c.quantity != null ? +c.quantity.toFixed(3) : '—',
                c.cost     != null ? `$${c.cost.toFixed(2)}` : '—',
              ]),
          },
        }))
      }
    }
  }

  if (groups.length === 0) {
    sections.push(createSection({
      title: 'No product usage',
      type:  SECTION_TYPE.TEXT,
      data:  'The filter set produced no records with product rows. Adjust the filters and try again.',
    }))
  }

  return createReport({
    module:        REPORT_MODULE.SPRAY,
    type:          REPORT_TYPE.SPRAY_SUMMARY,
    title,
    generatedBy:   'spray-module',
    sections,
    metadata: {
      dateRange:        dateRange ?? null,
      courseName:       courseName ?? null,
      recordCount:      safeRecords.length,
      productGroupCount: groups.length,
      uniqueProductCount: uniqueProductIds.size,
      grandCost:        hasAnyCost ? +grandCost.toFixed(2) : null,
    },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Equipment ─────────────────────────────────────────────────────────────────

/**
 * Build a maintenance log report for a piece of equipment.
 * @param {Object|null} equipment - Equipment record (name, type, status, etc.)
 * @param {Object[]}    logs      - Maintenance log entries
 * @param {Object}      [options]
 * @param {string}      [options.dateRange]
 */
export function buildMaintenanceLogReport(equipment, logs, options = {}) {
  const { dateRange } = options
  const equipName     = equipment?.name ?? 'Equipment'

  const sections = []

  if (equipment) {
    sections.push(createSection({
      title: 'Equipment',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Name':         equipment.name   ?? '—',
        'Type':         equipment.type   ?? '—',
        'Model':        equipment.model  ?? '—',
        'Status':       equipment.status ?? '—',
        'Date Range':   dateRange        ?? '—',
      },
    }))
  }

  if (logs.length > 0) {
    sections.push(createSection({
      title: 'Maintenance Records',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Stage', 'Type', 'Description', 'Technician', 'Cost'],
        rows: logs.map(l => [
          l.date        ?? '—',
          l.stage       ?? '—',
          l.type        ?? '—',
          l.description ?? '—',
          l.technician  ?? '—',
          l.cost != null ? `$${l.cost}` : '—',
        ]),
      },
    }))

    const totalCost = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0)
    if (totalCost > 0) {
      sections.push(createSection({
        title: 'Cost Summary',
        type:  SECTION_TYPE.FIELDS,
        data: {
          'Total Records': logs.length,
          'Total Cost':    `$${totalCost.toFixed(2)}`,
        },
      }))
    }
  } else {
    sections.push(createSection({
      title: 'Maintenance Records',
      type:  SECTION_TYPE.TEXT,
      data:  'No maintenance records found for this equipment.',
    }))
  }

  return createReport({
    module:        REPORT_MODULE.EQUIPMENT,
    type:          REPORT_TYPE.MAINTENANCE_LOG,
    title:         `Maintenance Log — ${equipName}`,
    generatedBy:   'equipment-module',
    sections,
    metadata:      { equipmentId: equipment?.id ?? null, dateRange: dateRange ?? null },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Operations ────────────────────────────────────────────────────────────────

/**
 * Build an operational summary report from OperationsContext state slices.
 * @param {Object} operations
 * @param {Object[]} operations.calendarEvents
 * @param {Object[]} operations.alerts
 * @param {Object[]} operations.inventoryUsage
 * @param {Object}   [options]
 * @param {string}   [options.title]
 * @param {string}   [options.dateRange]
 */
export function buildOperationalSummaryReport(operations, options = {}) {
  const { title = 'Operational Summary', dateRange } = options
  const {
    calendarEvents   = [],
    alerts           = [],
    inventoryUsage   = [],
  } = operations

  const activeAlerts    = alerts.filter(a => a.status === 'new' || a.status === 'acknowledged')
  const scheduledEvents = calendarEvents.filter(e => e.status !== 'cancelled')

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Events':            calendarEvents.length,
        'Scheduled':               scheduledEvents.length,
        'Active Alerts':           activeAlerts.length,
        'Inventory Transactions':  inventoryUsage.length,
        'Date Range':              dateRange ?? '—',
      },
    }),
  ]

  if (scheduledEvents.length > 0) {
    sections.push(createSection({
      title: 'Calendar Events',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Title', 'Category', 'Status', 'Assigned'],
        rows: scheduledEvents.slice(0, 25).map(e => [
          e.date                           ?? '—',
          e.title                          ?? '—',
          e.category                       ?? '—',
          e.status                         ?? '—',
          e.assignedStaff?.join(', ')      || '—',
        ]),
      },
    }))
  }

  if (activeAlerts.length > 0) {
    sections.push(createSection({
      title: 'Active Alerts',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Module', 'Priority', 'Title', 'Status'],
        rows: activeAlerts.map(a => [
          a.module   ?? '—',
          a.priority ?? '—',
          a.title    ?? '—',
          a.status   ?? '—',
        ]),
      },
    }))
  }

  if (inventoryUsage.length > 0) {
    sections.push(createSection({
      title: 'Inventory Usage',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Product', 'Qty Used', 'Unit', 'Area', 'Applicator'],
        rows: inventoryUsage.slice(0, 25).map(u => [
          u.date         ?? '—',
          u.productName  ?? '—',
          u.quantityUsed ?? '—',
          u.unit         ?? '—',
          u.area         ?? '—',
          u.applicator   ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.OPERATIONS,
    type:          REPORT_TYPE.OPERATIONAL_SUMMARY,
    title,
    generatedBy:   'operations-module',
    sections,
    metadata:      { dateRange: dateRange ?? null, eventCount: calendarEvents.length, alertCount: alerts.length },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Phase 6C.2: additional pure builders ──────────────────────────────────────

// ── Equipment: maintenance summary across logs ────────────────────────────────

/**
 * Build an aggregate maintenance summary across maintenance_logs records
 * (counts, cost rollup, breakdowns by category and technician).
 * @param {Object[]} logs                - maintenance_logs records
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 */
export function buildMaintenanceSummaryReport(logs = [], options = {}) {
  const { dateRange, title = 'Maintenance Summary' } = options

  const completed = logs.filter(l => l.status === 'completed')
  const pending   = logs.filter(l => l.status !== 'completed')
  const totalCost = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0)

  const byCategory = {}
  for (const l of logs) {
    const k = l.category ?? '—'
    byCategory[k] = (byCategory[k] ?? 0) + 1
  }
  const byTechnician = {}
  for (const l of logs) {
    const t = l.technician ?? 'Unassigned'
    byTechnician[t] = (byTechnician[t] ?? 0) + 1
  }

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Records': logs.length,
        'Completed':     completed.length,
        'Pending':       pending.length,
        'Total Cost':    `$${totalCost.toFixed(2)}`,
        'Date Range':    dateRange ?? '—',
      },
    }),
  ]

  if (Object.keys(byCategory).length > 0) {
    sections.push(createSection({
      title: 'By Category',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Category', 'Records'],
        rows:    Object.entries(byCategory).map(([k, v]) => [k, v]),
      },
    }))
  }

  if (Object.keys(byTechnician).length > 0) {
    sections.push(createSection({
      title: 'By Technician',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Technician', 'Records'],
        rows:    Object.entries(byTechnician).map(([k, v]) => [k, v]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.EQUIPMENT,
    type:          REPORT_TYPE.MAINTENANCE_SUMMARY,
    title,
    generatedBy:   'equipment-module',
    sections,
    metadata:      { dateRange: dateRange ?? null, recordCount: logs.length, totalCost },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Operations: morning brief envelope ────────────────────────────────────────

/**
 * Wrap the structured brief from src/utils/operations/morningBrief.js
 * (`buildMorningBrief()`) into the standard report envelope. Each non-empty
 * brief section becomes a report TEXT section of bulleted lines.
 * @param {Object|null} brief    - output of buildMorningBrief()
 * @param {Object}      [options]
 * @param {string}      [options.title]
 */
export function buildMorningBriefReport(brief, options = {}) {
  const { title } = options
  const safe = brief ?? {}

  const sectionMap = [
    ['Course Status',      safe.courseStatus],
    ['Conditions',         safe.weatherSummary],
    ['Weather Impacts',    safe.weatherImpacts],
    ['Operations',         safe.operationsSummary],
    ['Crew',               safe.crewSummary],
    ['Watch Areas',        safe.watchAreas],
    ['Cultural Practices', safe.culturalPractices],
    ['Disease Watch',      safe.diseaseWatch],
    ['Sprays',             safe.spraySummary],
    ['Equipment',          safe.equipmentSummary],
    ['Priorities',         safe.priorities],
    ['Needs Attention',    safe.attentionItems],
  ]

  const sections = []
  for (const [label, sec] of sectionMap) {
    if (sec && Array.isArray(sec.bullets) && sec.bullets.length > 0) {
      sections.push(createSection({
        title: label,
        type:  SECTION_TYPE.TEXT,
        data:  sec.bullets.map(b => `• ${b}`).join('\n'),
      }))
    }
  }

  if (sections.length === 0) {
    sections.push(createSection({
      title: 'Brief',
      type:  SECTION_TYPE.TEXT,
      data:  'No brief data available.',
    }))
  }

  return createReport({
    module:        REPORT_MODULE.OPERATIONS,
    type:          REPORT_TYPE.MORNING_BRIEF,
    title:         title ?? `Morning Brief — ${safe.generatedAt ?? 'Today'}`,
    generatedBy:   'operations-module',
    sections,
    metadata:      { generatedAt: safe.generatedAt ?? null, courseName: safe.courseName ?? null },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Agronomy: plant nutrition summary ─────────────────────────────────────────

// -- Agronomy: owner progress report ---------------------------------------

function reportDateKey(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value).trim()
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) {
    const [, m, d, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function isInReportRange(dateValue, startDate, endDate) {
  const day = reportDateKey(dateValue)
  if (!day) return !startDate && !endDate
  if (startDate && day < startDate) return false
  if (endDate && day > endDate) return false
  return true
}

function weeklyGoalRange(dateValue) {
  const day = reportDateKey(dateValue)
  if (!day) return null
  const monday = new Date(`${day}T00:00:00Z`)
  const weekday = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1))
  const friday = new Date(monday)
  friday.setUTCDate(friday.getUTCDate() + 4)
  return { start: monday.toISOString().slice(0, 10), end: friday.toISOString().slice(0, 10) }
}

function weeklyGoalOverlapsReport(dateValue, startDate, endDate) {
  const range = weeklyGoalRange(dateValue)
  if (!range) return !startDate && !endDate
  if (startDate && range.end < startDate) return false
  if (endDate && range.start > endDate) return false
  return true
}

function weeklyGoalLabel(dateValue) {
  const range = weeklyGoalRange(dateValue)
  if (!range) return '-'
  const format = value => new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
  return `Week of ${format(range.start)} - ${format(range.end)}`
}

function reportNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function reportMoney(value) {
  const n = reportNumber(value)
  return n == null ? '$0.00' : `$${n.toFixed(2)}`
}

function reportHours(value) {
  const n = reportNumber(value)
  return n == null ? '0 hrs' : `${Number.isInteger(n) ? n : n.toFixed(2)} hrs`
}

function reportText(value, fallback = '-') {
  if (value == null) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

function titleText(value) {
  return reportText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function compactTextList(values, fallback = '-') {
  const clean = values
    .flatMap(v => Array.isArray(v) ? v : [v])
    .map(v => {
      if (v && typeof v === 'object') return v.name ?? v.area ?? v.label ?? ''
      return v ?? ''
    })
    .map(v => String(v).trim())
    .filter(Boolean)
  return clean.length > 0 ? [...new Set(clean)].join(', ') : fallback
}

function productList(products = []) {
  if (!Array.isArray(products) || products.length === 0) return '-'
  return compactTextList(products.map(p => p?.name ?? p?.productName ?? p?.product))
}

function applicationDateValue(record) {
  return record?.date ?? record?.applicationDate ?? record?.createdAt
}

function applicationDateKey(record) {
  return reportDateKey(applicationDateValue(record))
}

function applicationAreaLabel(record) {
  return compactTextList(record?.areas?.length ? record.areas : [record?.area])
}

function applicationAreaAcres(record) {
  if (Array.isArray(record?.areas) && record.areas.length > 0) {
    return record.areas.reduce((sum, area) => sum + (reportNumber(area?.acreage) ?? 0), 0)
  }
  return reportNumber(record?.areaAcres ?? record?.acreage ?? record?.acres) ?? 0
}

function applicationIsGranular(record) {
  const explicitType = String(record?.applicationType ?? record?.application_type ?? '').trim().toLowerCase()
  if (explicitType === 'granular' || explicitType === 'dry') return true
  if (explicitType === 'liquid' || explicitType === 'spray') return false
  if (record?.isLiquidApplication === false) return true
  if (record?.isLiquidApplication === true) return false
  return [record?.applicationName, record?.carrierVolume, record?.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes('granular')
}

function applicationProductType(product) {
  return String(product?.type ?? product?.productType ?? product?.category ?? '').toLowerCase()
}

function applicationProductIsFertilizer(product) {
  const type = applicationProductType(product)
  return type.includes('fertilizer') || type.includes('nutrient')
}

function fertilizerProductsForApplication(record) {
  const products = Array.isArray(record?.products) ? record.products : []
  const fertilizerProducts = products.filter(applicationProductIsFertilizer)
  if (fertilizerProducts.length > 0) return fertilizerProducts
  return applicationIsGranular(record) ? products : []
}

function applicationIsFertilizer(record) {
  return applicationIsGranular(record) || fertilizerProductsForApplication(record).length > 0
}

function applicationIsSpray(record) {
  const products = Array.isArray(record?.products) ? record.products : []
  if (products.some(product => !applicationProductIsFertilizer(product))) return true
  return !applicationIsFertilizer(record)
}

function applicationRecordStatus(record) {
  const raw = String(record?.status ?? 'completed').trim().toLowerCase()
  if (raw === 'complete' || raw === 'done') return 'completed'
  if (raw === 'in progress' || raw === 'in_progress') return 'in-progress'
  if (raw === 'pending review' || raw === 'pending_review') return 'pending-review'
  if (raw === 'pending' || raw === 'assigned') return 'planned'
  return raw || 'completed'
}

function applicationIsCompleted(record) {
  return applicationRecordStatus(record) === 'completed'
}

function applicationHasStatus(status) {
  return record => applicationRecordStatus(record) === status
}

function applicationIsOpen(record) {
  return !applicationIsCompleted(record)
}

function fertilizerReportDate(entry) {
  return entry?.source === 'application'
    ? applicationDateKey(entry.record)
    : reportDateKey(entry?.applicationDate ?? entry?.date ?? entry?.createdAt)
}

function fertilizerReportArea(entry) {
  return entry?.source === 'application'
    ? applicationAreaLabel(entry.record)
    : (entry?.area ?? '-')
}

function fertilizerReportAreaAcres(entry) {
  return entry?.source === 'application'
    ? applicationAreaAcres(entry.record)
    : (reportNumber(entry?.areaAcres) ?? 0)
}

function fertilizerReportProducts(entry) {
  if (entry?.source === 'application') {
    const products = fertilizerProductsForApplication(entry.record)
    return productList(products)
  }
  return entry?.productName ?? '-'
}

function fertilizerReportRate(entry) {
  if (entry?.source === 'application') {
    const products = fertilizerProductsForApplication(entry.record)
    const rates = products
      .map(product => product?.rate)
      .filter(value => value != null && String(value).trim() !== '')
    return compactTextList(rates)
  }
  return [entry?.rate, entry?.unit].filter(v => v != null && String(v).trim() !== '').join(' ') || '-'
}

function fertilizerReportQuantity(entry) {
  if (entry?.source === 'application') {
    const products = fertilizerProductsForApplication(entry.record)
    return compactTextList(products.map(product => {
      const quantity = reportNumber(product?.quantityUsed ?? product?.quantity_used)
      if (quantity == null) return null
      const unit = reportText(product?.unit ?? product?.quantityUnit, '')
      return `${Number(quantity.toFixed(4))}${unit ? ` ${unit}` : ''}`
    }))
  }
  const quantity = reportNumber(entry?.quantityUsed ?? entry?.quantity)
  if (quantity == null) return '-'
  return `${Number(quantity.toFixed(4))} ${reportText(entry?.unit, '')}`.trim()
}

function dryQuantityLb(product) {
  const quantity = reportNumber(product?.quantityUsed ?? product?.quantity_used)
  if (quantity == null) return null
  const unit = String(product?.unit ?? product?.quantityUnit ?? '').trim().toLowerCase()
  if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) return quantity
  if (['oz', 'ounce', 'ounces'].includes(unit)) return quantity / 16
  return null
}

function fertilizerReportProductRate(entry) {
  if (entry?.source !== 'application') return '-'
  const areaK = applicationAreaAcres(entry.record) * 43.56
  if (!(areaK > 0)) return '-'
  return compactTextList(fertilizerProductsForApplication(entry.record).map(product => {
    const pounds = dryQuantityLb(product)
    if (pounds == null) return null
    return `${Number((pounds / areaK).toFixed(4))} lb product / 1,000 sq ft`
  }))
}

function granularProductTotals(records = []) {
  let totalLb = 0
  const other = new Map()

  for (const record of records) {
    for (const product of fertilizerProductsForApplication(record)) {
      const quantity = reportNumber(product?.quantityUsed ?? product?.quantity_used)
      if (quantity == null) continue
      const rawUnit = String(product?.unit ?? product?.quantityUnit ?? '').trim().toLowerCase()
      if (['lb', 'lbs', 'pound', 'pounds'].includes(rawUnit)) {
        totalLb += quantity
      } else if (['oz', 'ounce', 'ounces'].includes(rawUnit)) {
        totalLb += quantity / 16
      } else {
        const unit = rawUnit || 'unit'
        other.set(unit, (other.get(unit) ?? 0) + quantity)
      }
    }
  }

  const parts = []
  if (totalLb > 0) {
    parts.push(`${Number(totalLb.toFixed(4))} lb (${Number((totalLb * 16).toFixed(2))} oz)`)
  }
  for (const [unit, quantity] of other) {
    parts.push(`${Number(quantity.toFixed(4))} ${unit}`)
  }
  return parts.join(', ') || '-'
}

function fertilizerReportNotes(entry) {
  if (entry?.source === 'application') return entry.record?.notes ?? entry.record?.targetPest ?? '-'
  return entry?.notes ?? '-'
}

function sprayRecordCost(record) {
  const recordCost = reportNumber(record?.totalCostSnapshot ?? record?.totalCost)
  if (recordCost != null) return recordCost
  return (record?.products ?? []).reduce((sum, p) => sum + (reportNumber(p?.totalCostSnapshot ?? p?.cost) ?? 0), 0)
}

function eventDateLookup(calendarEvents = []) {
  const map = new Map()
  for (const event of calendarEvents) {
    if (!event?.id) continue
    map.set(event.id, reportDateKey(event.startDate ?? event.date ?? event.createdAt))
  }
  return map
}

function eventByIdLookup(calendarEvents = []) {
  const map = new Map()
  for (const event of calendarEvents) {
    if (event?.id) map.set(event.id, event)
  }
  return map
}

function assignmentDate(assignment, dateByEvent) {
  return dateByEvent.get(assignment?.calendarEventId)
    ?? reportDateKey(assignment?.date ?? assignment?.assignedAt ?? assignment?.createdAt)
}

function assignmentTaskName(assignment, eventsById, taskTemplates = []) {
  const event = eventsById.get(assignment?.calendarEventId)
  if (event?.title) return event.title
  const template = taskTemplates.find(t => (
    t?.id && (t.id === assignment?.taskTemplateId || t.id === assignment?.templateId)
  ))
  return template?.name ?? assignment?.taskName ?? assignment?.title ?? '-'
}

const ASSIGNMENT_REPORT_STATUS_LABELS = {
  planned:       'Planned',
  'in-progress': 'In Progress',
  'weather-delay': 'Weather Delay',
  complete:      'Complete',
}

function assignmentReportStatus(value) {
  if (value === 'assigned' || value === 'pending' || value == null || value === '') return 'planned'
  if (value === 'completed' || value === 'done') return 'complete'
  if (value === 'planned' || value === 'in-progress' || value === 'weather-delay' || value === 'complete') return value
  return 'planned'
}

function assignmentReportStatusLabel(value) {
  return ASSIGNMENT_REPORT_STATUS_LABELS[assignmentReportStatus(value)] ?? 'Planned'
}

function taskReportRows(tasks, eventsById, dateByEvent, taskTemplates) {
  return tasks.slice(0, 50).map(a => {
    const event = eventsById.get(a?.calendarEventId)
    return [
      assignmentDate(a, dateByEvent) ?? '-',
      a?.employeeName ?? '-',
      assignmentTaskName(a, eventsById, taskTemplates),
      a?.area ?? event?.location ?? '-',
      assignmentReportStatusLabel(a?.status),
      a?.notes ?? '-',
    ]
  })
}

function taskReportGroupRows(tasks, eventsById, dateByEvent, taskTemplates) {
  const groups = new Map()
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const name = assignmentTaskName(task, eventsById, taskTemplates)
    const status = assignmentReportStatusLabel(task?.status)
    const key = `${name.toLowerCase()}|${status.toLowerCase()}`
    const event = eventsById.get(task?.calendarEventId)
    const existing = groups.get(key) ?? {
      task: name,
      count: 0,
      employees: new Set(),
      areas: new Set(),
      dates: new Set(),
      status,
    }
    existing.count += 1
    if (task?.employeeName) existing.employees.add(task.employeeName)
    const area = task?.area ?? event?.location
    if (area) existing.areas.add(area)
    const date = assignmentDate(task, dateByEvent)
    if (date) existing.dates.add(date)
    groups.set(key, existing)
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.task.localeCompare(b.task))
    .slice(0, 50)
    .map(group => [
      group.task,
      group.count,
      compactTextList([...group.employees]),
      compactTextList([...group.areas]),
      compactTextList([...group.dates]),
      group.status,
    ])
}

function plannedApplicationWindow(event) {
  const start = reportDateKey(event?.plannedStartDate)
  const end = reportDateKey(event?.plannedEndDate)
  if (start && end) return start === end ? start : `${start} to ${end}`
  return start ?? end ?? event?.plannedWindowLabel ?? '-'
}

function plannedApplicationProducts(event) {
  return compactTextList((event?.items ?? []).map(item => item?.productName))
}

function plannedApplicationIsGranular(event) {
  const type = String(event?.applicationType ?? event?.typeLabel ?? event?.type ?? '').trim().toLowerCase()
  return type === 'granular' || type === 'dry' || type.includes('granular')
}

function applicationStatusRows(events = []) {
  return events.slice(0, 50).map(event => [
    plannedApplicationWindow(event),
    event?.programName ?? '-',
    event?.status ?? 'Planned',
    event?.typeLabel ?? 'Spray',
    event?.targetArea ?? '-',
    plannedApplicationProducts(event),
    event?.productCount ?? 0,
    compactTextList(event?.notes ?? []),
  ])
}

function savedStatusApplicationEvent(record) {
  const products = Array.isArray(record?.products) ? record.products : []
  const date = applicationDateKey(record)
  const status = titleText(applicationRecordStatus(record))
  return {
    source:           'saved-record',
    id:               record?.id,
    programName:      'Saved Plan',
    status,
    typeLabel:        applicationIsGranular(record) ? 'Granular' : 'Liquid',
    targetArea:       applicationAreaLabel(record),
    plannedStartDate: date,
    plannedEndDate:   date,
    plannedWindowLabel: date,
    productCount:     products.length,
    items:            products.map(product => ({
      productName: product?.productName ?? product?.name ?? product?.product,
    })),
    notes: [
      status,
      record?.targetPest,
      record?.notes,
    ].filter(Boolean),
  }
}

function employeeLookup(employees = []) {
  const map = new Map()
  for (const emp of employees) {
    const keys = [emp?.id, emp?.employeeId, emp?.name, emp?.fullName]
    for (const key of keys) {
      if (key != null && String(key).trim() !== '') map.set(String(key).trim().toLowerCase(), emp)
    }
  }
  return map
}

function employeeFromLookup(lookup, ...refs) {
  for (const ref of refs) {
    if (ref == null || String(ref).trim() === '') continue
    const match = lookup.get(String(ref).trim().toLowerCase())
    if (match) return match
  }
  return null
}

function employeeDisplayName(employee, fallback = 'Unassigned') {
  return reportText(employee?.name ?? employee?.fullName ?? fallback, fallback)
}

function addActivityCount(rowsByEmployee, employeeName, taskCount = 0, ticketCount = 0) {
  const key = reportText(employeeName, 'Unassigned')
  const existing = rowsByEmployee.get(key)
  if (!existing) return
  existing.taskCount += taskCount
  existing.ticketCount += ticketCount
  rowsByEmployee.set(key, existing)
}

/**
 * Build an owner-facing agronomy progress report from existing operational
 * data. Sections are selected by the caller so the superintendent can tailor
 * the packet before printing or saving it.
 *
 * @param {Object} data
 * @param {Object[]} [data.crewAssignments]
 * @param {Object[]} [data.calendarEvents]
 * @param {Object[]} [data.taskTemplates]
 * @param {Object[]} [data.sprays]
 * @param {Object[]} [data.programs]
 * @param {Object} [data.itemsByProgramId]
 * @param {Object[]} [data.nutritionApplications]
 * @param {Object[]} [data.maintenanceLogs]
 * @param {Object[]} [data.employees]
 * @param {Object[]} [data.weeklySchedules]
 * @param {Object[]} [data.scheduleOverrides]
 * @param {Object[]} [data.irrigationRepairs]
 * @param {Object[]} [data.weeklyGoals]
 * @param {Object[]} [data.yearlyGoals]
 * @param {Object} options
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {Object} [options.include]
 * @param {string} [options.ownerNotes]
 * @param {Object[]} [options.ownerPhotos]
 * @param {string} [options.courseName]
 */
export function buildAgronomyProgressReport(data = {}, options = {}) {
  const {
    crewAssignments = [],
    calendarEvents = [],
    taskTemplates = [],
    sprays = [],
    nutritionApplications = [],
    maintenanceLogs = [],
    employees = [],
    weeklySchedules = [],
    scheduleOverrides = [],
    irrigationRepairs = [],
    weeklyGoals = [],
    yearlyGoals = [],
  } = data
  const {
    startDate = null,
    endDate = null,
    ownerNotes = '',
    ownerPhotos = [],
    courseName = '',
    include = {},
  } = options

  const selected = {
    tasks:       include.tasks !== false,
    weeklyGoals: include.weeklyGoals !== false,
    yearlyGoals: include.yearlyGoals !== false,
    plannedApplications: include.plannedApplications !== false,
    sprays:      include.sprays !== false,
    fertilizer:  include.fertilizer !== false,
    maintenance: include.maintenance !== false,
    irrigation:  include.irrigation !== false,
    labor:       include.labor !== false,
    hours:       include.hours !== false,
  }

  const rangeLabel = startDate && endDate
    ? `${startDate} to ${endDate}`
    : (startDate ? `${startDate} forward` : (endDate ? `through ${endDate}` : 'All time'))

  const dateByEvent = eventDateLookup(calendarEvents)
  const eventsById = eventByIdLookup(calendarEvents)
  const employeesByKey = employeeLookup(employees)

  const filteredTasks = crewAssignments
    .filter(a => a?.status !== 'cancelled')
    .filter(a => isInReportRange(assignmentDate(a, dateByEvent), startDate, endDate))
    .sort((a, b) => (assignmentDate(b, dateByEvent) ?? '').localeCompare(assignmentDate(a, dateByEvent) ?? ''))

  const filteredApplicationRecords = sprays
    .filter(r => r?.deletedAt == null)
    .filter(r => isInReportRange(applicationDateValue(r), startDate, endDate))
    .sort((a, b) => (applicationDateKey(b) ?? '').localeCompare(applicationDateKey(a) ?? ''))

  const filteredApplications = filteredApplicationRecords.filter(applicationIsCompleted)
  const filteredLiquidApplications = filteredApplications.filter(record => !applicationIsGranular(record))
  const filteredSprays = filteredLiquidApplications
  const plannedApplicationRecords = filteredApplicationRecords
    .filter(applicationHasStatus('planned'))
    .map(savedStatusApplicationEvent)
  const inProgressApplicationRecords = filteredApplicationRecords
    .filter(applicationHasStatus('in-progress'))
    .map(savedStatusApplicationEvent)
  const pendingReviewApplicationRecords = filteredApplicationRecords
    .filter(applicationHasStatus('pending-review'))
    .map(savedStatusApplicationEvent)
  const filteredPlannedApplications = plannedApplicationRecords
    .sort((a, b) => (reportDateKey(a?.plannedStartDate) ?? '').localeCompare(reportDateKey(b?.plannedStartDate) ?? ''))
  const filteredInProgressApplications = inProgressApplicationRecords
    .sort((a, b) => (reportDateKey(a?.plannedStartDate) ?? '').localeCompare(reportDateKey(b?.plannedStartDate) ?? ''))
  const filteredPendingReviewApplications = pendingReviewApplicationRecords
    .sort((a, b) => (reportDateKey(a?.plannedStartDate) ?? '').localeCompare(reportDateKey(b?.plannedStartDate) ?? ''))
  const plannedLiquidApplications = filteredPlannedApplications.filter(event => !plannedApplicationIsGranular(event))
  const plannedGranularApplications = filteredPlannedApplications.filter(plannedApplicationIsGranular)
  const inProgressLiquidApplications = filteredInProgressApplications.filter(event => !plannedApplicationIsGranular(event))
  const inProgressGranularApplications = filteredInProgressApplications.filter(plannedApplicationIsGranular)
  const pendingReviewLiquidApplications = filteredPendingReviewApplications.filter(event => !plannedApplicationIsGranular(event))
  const pendingReviewGranularApplications = filteredPendingReviewApplications.filter(plannedApplicationIsGranular)
  const filteredOpenApplications = [
    ...filteredPlannedApplications,
    ...filteredInProgressApplications,
    ...filteredPendingReviewApplications,
  ]

  const filteredGranularApplications = filteredApplications.filter(applicationIsGranular)
  const filteredFertilizerApplications = filteredGranularApplications.map(record => ({ source: 'application', record }))

  const filteredMaintenance = maintenanceLogs
    .filter(l => isInReportRange(l?.completedDate ?? l?.date ?? l?.createdAt, startDate, endDate))
    .sort((a, b) => (reportDateKey(b?.completedDate ?? b?.date) ?? '').localeCompare(reportDateKey(a?.completedDate ?? a?.date) ?? ''))

  const filteredIrrigationRepairs = irrigationRepairs
    .filter(r => isInReportRange(r?.dateReported ?? r?.dateCompleted ?? r?.createdAt, startDate, endDate))
    .sort((a, b) => (reportDateKey(b?.dateReported ?? b?.dateCompleted) ?? '').localeCompare(reportDateKey(a?.dateReported ?? a?.dateCompleted) ?? ''))

  const filteredWeeklyGoals = weeklyGoals
      .filter(goal => weeklyGoalOverlapsReport(goal?.date ?? goal?.createdAt, startDate, endDate))
    .sort((a, b) => (reportDateKey(b?.date) ?? '').localeCompare(reportDateKey(a?.date) ?? ''))
  const doneWeeklyGoals = filteredWeeklyGoals.filter(goal => goal?.status === 'done')
  const inProgressWeeklyGoals = filteredWeeklyGoals.filter(goal => goal?.status === 'in-progress')
  const notDoneWeeklyGoals = filteredWeeklyGoals.filter(goal => goal?.status === 'not-done')

  const startYear = Number(String(startDate ?? '').slice(0, 4)) || null
  const endYear = Number(String(endDate ?? '').slice(0, 4)) || null
  const filteredYearlyGoals = yearlyGoals
    .filter(goal => {
      const year = Number(goal?.year)
      if (!Number.isInteger(year)) return false
      if (startYear && year < startYear) return false
      if (endYear && year > endYear) return false
      return true
    })
    .sort((a, b) => Number(b?.year ?? 0) - Number(a?.year ?? 0))
  const doneYearlyGoals = filteredYearlyGoals.filter(goal => goal?.status === 'done')
  const inProgressYearlyGoals = filteredYearlyGoals.filter(goal => goal?.status === 'in-progress')
  const notDoneYearlyGoals = filteredYearlyGoals.filter(goal => goal?.status === 'not-done')

  const maintenanceHours = filteredMaintenance.reduce((sum, l) =>
    sum + (reportNumber(l?.laborHours) ?? 0), 0)
  const irrigationRepairHours = filteredIrrigationRepairs.reduce((sum, r) =>
    sum + (reportNumber(r?.laborHours) ?? 0), 0)
  const sprayCost = filteredSprays.reduce((sum, r) => sum + sprayRecordCost(r), 0)
  const maintenanceCost = filteredMaintenance.reduce((sum, l) => sum + (reportNumber(l?.cost) ?? 0), 0)
  const granularArea = filteredFertilizerApplications.reduce((sum, a) => sum + fertilizerReportAreaAcres(a), 0)
  const granularCost = filteredGranularApplications.reduce((sum, r) => sum + sprayRecordCost(r), 0)
  const granularProductUsed = granularProductTotals(filteredGranularApplications)

  const payrollBreakdown = buildPayrollBreakdown({
    employees,
    weeklySchedules,
    scheduleOverrides,
    startDate,
    endDate,
  })
  const laborRowsByEmployee = new Map(payrollBreakdown.rows.map(row => [row.name, {
    name: row.name,
    hours: row.scheduledHours,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    payroll: row.totalPay,
    rate: row.hourlyRate,
    scheduledDays: row.scheduledDays,
    taskCount: 0,
    ticketCount: 0,
  }]))

  for (const task of filteredTasks) {
    const emp = employeeFromLookup(employeesByKey, task?.employeeId, task?.employeeName)
    addActivityCount(laborRowsByEmployee, task?.employeeName ?? employeeDisplayName(emp), 1, 0)
  }
  for (const log of filteredMaintenance) {
    const emp = employeeFromLookup(employeesByKey, log?.technicianEmployeeId, log?.technician)
    addActivityCount(laborRowsByEmployee, log?.technician ?? employeeDisplayName(emp), 0, 1)
  }
  const laborRows = [...laborRowsByEmployee.values()]
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
  const scheduleHours = payrollBreakdown.totals.scheduledHours
  const regularHours = payrollBreakdown.totals.regularHours
  const overtimeHours = payrollBreakdown.totals.overtimeHours
  const payrollTotal = payrollBreakdown.totals.totalPay

  const plannedTasks = filteredTasks.filter(a => assignmentReportStatus(a?.status) === 'planned')
  const inProgressTasks = filteredTasks.filter(a => assignmentReportStatus(a?.status) === 'in-progress')
  const weatherDelayedTasks = filteredTasks.filter(a => assignmentReportStatus(a?.status) === 'weather-delay')
  const completeTasks = filteredTasks.filter(a => assignmentReportStatus(a?.status) === 'complete')
  const ownerSummaryData = {
    'Course':     courseName || '-',
    'Date Range': rangeLabel,
  }
  if (selected.tasks) {
    ownerSummaryData['Task Assignments'] = filteredTasks.length
    ownerSummaryData['Planned Tasks'] = plannedTasks.length
    ownerSummaryData['In Progress Tasks'] = inProgressTasks.length
    ownerSummaryData['Weather Delayed Tasks'] = weatherDelayedTasks.length
    ownerSummaryData['Complete Tasks'] = completeTasks.length
  }
  if (selected.weeklyGoals) {
    ownerSummaryData['Weekly Goals'] = filteredWeeklyGoals.length
    ownerSummaryData['Goals Done'] = doneWeeklyGoals.length
    ownerSummaryData['Goals In Progress'] = inProgressWeeklyGoals.length
    ownerSummaryData['Goals Not Done'] = notDoneWeeklyGoals.length
  }
  if (selected.yearlyGoals) {
    ownerSummaryData['Yearly Goals'] = filteredYearlyGoals.length
    ownerSummaryData['Yearly Goals Done'] = doneYearlyGoals.length
    ownerSummaryData['Yearly Goals In Progress'] = inProgressYearlyGoals.length
    ownerSummaryData['Yearly Goals Not Done'] = notDoneYearlyGoals.length
  }
  if (selected.sprays) {
    ownerSummaryData['Liquid Applications'] = filteredLiquidApplications.length
    ownerSummaryData['Liquid Application Cost'] = reportMoney(sprayCost)
  }
  if (selected.plannedApplications) {
    ownerSummaryData['Planned Applications'] = filteredPlannedApplications.length
    ownerSummaryData['Planned Liquid Applications'] = plannedLiquidApplications.length
    ownerSummaryData['Planned Granular Applications'] = plannedGranularApplications.length
    ownerSummaryData['In Progress Applications'] = filteredInProgressApplications.length
    ownerSummaryData['Pending Review Applications'] = filteredPendingReviewApplications.length
  }
  if (selected.fertilizer) {
    ownerSummaryData['Granular Applications'] = filteredGranularApplications.length
    ownerSummaryData['Granular Application Cost'] = reportMoney(granularCost)
  }
  if (selected.maintenance) {
    ownerSummaryData['Maintenance Tickets'] = filteredMaintenance.length
    ownerSummaryData['Equipment R&M'] = reportMoney(maintenanceCost)
  }
  if (selected.irrigation) ownerSummaryData['Irrigation Repairs'] = filteredIrrigationRepairs.length
  if (selected.hours) {
    ownerSummaryData['Schedule Hours'] = reportHours(scheduleHours)
    ownerSummaryData['Overtime Hours'] = reportHours(overtimeHours)
  }
  if (selected.labor) ownerSummaryData['Estimated Payroll'] = reportMoney(payrollTotal)

  const printSummary = [
    selected.yearlyGoals ? ['Yearly Goals', filteredYearlyGoals.length] : null,
    selected.yearlyGoals ? ['Yearly Goals Done', doneYearlyGoals.length] : null,
    selected.weeklyGoals ? ['Weekly Goals', filteredWeeklyGoals.length] : null,
    selected.weeklyGoals ? ['Goals Done', doneWeeklyGoals.length] : null,
    selected.weeklyGoals ? ['Goals In Progress', inProgressWeeklyGoals.length] : null,
    selected.weeklyGoals ? ['Goals Not Done', notDoneWeeklyGoals.length] : null,
    selected.labor ? ['Payroll', reportMoney(payrollTotal)] : null,
    selected.hours ? ['Schedule Hours', reportHours(scheduleHours)] : null,
    selected.hours ? ['OT Hours', reportHours(overtimeHours)] : null,
    selected.maintenance ? ['Equipment R&M', filteredMaintenance.length] : null,
    selected.irrigation ? ['Irrigation Repairs', filteredIrrigationRepairs.length] : null,
    selected.plannedApplications ? ['Planned Apps', filteredPlannedApplications.length] : null,
    selected.plannedApplications ? ['Planned Liquid', plannedLiquidApplications.length] : null,
    selected.plannedApplications ? ['Planned Granular', plannedGranularApplications.length] : null,
    selected.plannedApplications ? ['In Progress Apps', filteredInProgressApplications.length] : null,
    selected.plannedApplications ? ['Pending Review Apps', filteredPendingReviewApplications.length] : null,
    selected.sprays ? ['Liquid Apps', filteredLiquidApplications.length] : null,
    selected.fertilizer ? ['Granular Apps', filteredGranularApplications.length] : null,
    selected.tasks ? ['Weather Delay', weatherDelayedTasks.length] : null,
    selected.tasks ? ['Tasks', filteredTasks.length] : null,
    selected.tasks ? ['Planned', plannedTasks.length] : null,
    selected.tasks ? ['In Progress', inProgressTasks.length] : null,
    selected.tasks ? ['Complete', completeTasks.length] : null,
  ].filter(Boolean)

  const sections = [
    createSection({
      title: 'Owner Summary',
      type:  SECTION_TYPE.FIELDS,
      data: ownerSummaryData,
    }),
  ]

  if (ownerNotes.trim()) {
    sections.push(createSection({
      title: 'Owner Notes',
      type:  SECTION_TYPE.TEXT,
      data:  ownerNotes.trim(),
    }))
  }

  if (selected.tasks) {
    sections.push(createSection({
      title: 'Tasks',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Tasks':      filteredTasks.length,
        'Planned Tasks':    plannedTasks.length,
        'In Progress Tasks': inProgressTasks.length,
        'Weather Delayed Tasks': weatherDelayedTasks.length,
        'Complete Tasks':   completeTasks.length,
        'Active Library':   taskTemplates.filter(t => t?.status !== 'archived').length,
        'Employees Listed': compactTextList(filteredTasks.map(a => a?.employeeName), '-'),
      },
    }))
    for (const [title, rows] of [
      ['Planned Tasks', plannedTasks],
      ['In Progress Tasks', inProgressTasks],
      ['Weather Delayed Tasks', weatherDelayedTasks],
      ['Complete Tasks', completeTasks],
    ]) {
      if (rows.length === 0) continue
      sections.push(createSection({
        title,
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['Task', 'Times', 'Employees', 'Areas', 'Dates', 'Status'],
          rows: taskReportGroupRows(rows, eventsById, dateByEvent, taskTemplates),
        },
      }))
    }
  }

  if (selected.weeklyGoals) {
    sections.push(createSection({
      title: 'Weekly Goals and Status',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Goals': filteredWeeklyGoals.length,
        'Done': doneWeeklyGoals.length,
        'In Progress': inProgressWeeklyGoals.length,
        'Not Done': notDoneWeeklyGoals.length,
      },
    }))
    if (filteredWeeklyGoals.length > 0) {
      sections.push(createSection({
        title: 'Weekly Goals and Status Log',
        type:  SECTION_TYPE.TABLE,
        data: {
            columns: ['Week', 'Goal / Improvement', 'Notes', 'Status'],
          rows: filteredWeeklyGoals.map(goal => [
              weeklyGoalLabel(goal?.date),
            reportText(goal?.note, '-'),
            reportText(goal?.notes, '-'),
            titleText(goal?.status ?? 'in-progress'),
          ]),
        },
      }))
    }
  }

  if (selected.yearlyGoals) {
    sections.push(createSection({
      title: 'Yearly Goals and Status',
      type: SECTION_TYPE.FIELDS,
      data: {
        'Total Goals': filteredYearlyGoals.length,
        'Done': doneYearlyGoals.length,
        'In Progress': inProgressYearlyGoals.length,
        'Not Done': notDoneYearlyGoals.length,
      },
    }))
    if (filteredYearlyGoals.length > 0) {
      sections.push(createSection({
        title: 'Yearly Goals and Status Log',
        type: SECTION_TYPE.TABLE,
        data: {
          columns: ['Year', 'Goal / Improvement', 'Notes', 'Status'],
          rows: filteredYearlyGoals.map(goal => [
            String(goal?.year ?? '-'),
            reportText(goal?.note, '-'),
            reportText(goal?.notes, '-'),
            titleText(goal?.status ?? 'in-progress'),
          ]),
        },
      }))
    }
  }

  if (selected.plannedApplications) {
    sections.push(createSection({
      title: 'Planned Applications',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Applications': filteredPlannedApplications.length,
        'Liquid':       plannedLiquidApplications.length,
        'Granular':     plannedGranularApplications.length,
        'Programs':     compactTextList(filteredPlannedApplications.map(event => event?.programName)),
        'Areas':        compactTextList(filteredPlannedApplications.map(event => event?.targetArea)),
        'Products':     compactTextList(filteredPlannedApplications.flatMap(event => (event?.items ?? []).map(item => item?.productName))),
      },
    }))
    for (const [title, rows] of [
      ['Planned Liquid Applications', plannedLiquidApplications],
      ['Planned Granular Applications', plannedGranularApplications],
      ['In Progress Liquid Applications', inProgressLiquidApplications],
      ['In Progress Granular Applications', inProgressGranularApplications],
      ['Pending Review Liquid Applications', pendingReviewLiquidApplications],
      ['Pending Review Granular Applications', pendingReviewGranularApplications],
    ]) {
      if (rows.length === 0) continue
      sections.push(createSection({
        title,
        type: SECTION_TYPE.TABLE,
        data: {
          columns: ['Window', 'Source', 'Status', 'Area', 'Products', 'Product Count', 'Notes'],
          rows: applicationStatusRows(rows).map(row => [row[0], row[1], row[2], row[4], row[5], row[6], row[7]]),
        },
      }))
    }
  }

  if (selected.sprays) {
    sections.push(createSection({
      title: 'Liquid Applications',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Applications': filteredLiquidApplications.length,
        'Products':     compactTextList(filteredLiquidApplications.flatMap(r => (r?.products ?? []).map(p => p?.name))),
        'Areas':        compactTextList(filteredLiquidApplications.flatMap(r => r?.areas?.length ? r.areas : [r?.area])),
        'Total Cost':   reportMoney(sprayCost),
      },
    }))
    if (filteredLiquidApplications.length > 0) {
      sections.push(createSection({
        title: 'Liquid Application Log',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['Date', 'Application', 'Products', 'Area', 'Applicator', 'Cost'],
          rows: filteredLiquidApplications.slice(0, 50).map(r => [
            reportDateKey(r?.date ?? r?.applicationDate) ?? '-',
            r?.applicationName ?? r?.targetPest ?? 'Liquid application',
            productList(r?.products),
            compactTextList(r?.areas?.length ? r.areas : [r?.area]),
            r?.applicator ?? '-',
            reportMoney(sprayRecordCost(r)),
          ]),
        },
      }))
    }
  }

  if (selected.fertilizer) {
    sections.push(createSection({
      title: 'Granular Applications',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Applications': filteredGranularApplications.length,
        'Area Acres':   granularArea > 0 ? granularArea.toFixed(2) : '-',
        'Total Product Used': granularProductUsed,
        'Products':     compactTextList(filteredFertilizerApplications.map(fertilizerReportProducts)),
        'Areas':        compactTextList(filteredFertilizerApplications.map(fertilizerReportArea)),
        'Total Cost':   reportMoney(granularCost),
      },
    }))
    if (filteredFertilizerApplications.length > 0) {
      sections.push(createSection({
        title: 'Granular Application Log',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['Date', 'Products', 'Area', 'Acres', 'Nutrient / Label Rate', 'Product Rate', 'Total Product', 'Applicator', 'Cost'],
          rows: filteredFertilizerApplications.slice(0, 50).map(a => [
            fertilizerReportDate(a) ?? '-',
            fertilizerReportProducts(a),
            fertilizerReportArea(a),
            fertilizerReportAreaAcres(a) > 0 ? fertilizerReportAreaAcres(a).toFixed(4) : '-',
            fertilizerReportRate(a),
            fertilizerReportProductRate(a),
            fertilizerReportQuantity(a),
            a?.source === 'application' ? (a.record?.applicator ?? '-') : '-',
            a?.source === 'application' ? reportMoney(sprayRecordCost(a.record)) : '-',
          ]),
        },
      }))
    }
  }

  if (selected.maintenance) {
    sections.push(createSection({
      title: 'Equipment R&M',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Tickets':     filteredMaintenance.length,
        'Labor Hours': reportHours(maintenanceHours),
        'R&M Cost':    reportMoney(maintenanceCost),
        'Resolved':    filteredMaintenance.filter(l => String(l?.ticketStage ?? l?.status ?? '').toLowerCase() === 'resolved' || l?.status === 'completed').length,
      },
    }))
    if (filteredMaintenance.length > 0) {
      sections.push(createSection({
        title: 'Equipment R&M Tickets',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['Date', 'Equipment', 'Service', 'Progress', 'Technician', 'Hours', 'Cost'],
          rows: filteredMaintenance.slice(0, 50).map(l => [
            reportDateKey(l?.completedDate ?? l?.date) ?? '-',
            l?.equipmentName ?? l?.equipmentId ?? '-',
            l?.serviceType ?? '-',
            titleText(l?.ticketStage ?? l?.status ?? '-'),
            l?.technician ?? 'Unassigned',
            reportHours(l?.laborHours),
            reportMoney(l?.cost),
          ]),
        },
      }))
    }
  }

  if (selected.irrigation) {
    const openIrrigationRepairs = filteredIrrigationRepairs.filter(r => r?.status !== 'completed')
    sections.push(createSection({
      title: 'Irrigation Repairs',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Tickets':       filteredIrrigationRepairs.length,
        'Open':          openIrrigationRepairs.length,
        'Completed':     filteredIrrigationRepairs.filter(r => r?.status === 'completed').length,
        'Parts Needed':  filteredIrrigationRepairs.filter(r => r?.status === 'parts-needed').length,
        'High Priority': filteredIrrigationRepairs.filter(r => r?.priority === 'high').length,
        'Repair Hours':  reportHours(irrigationRepairHours),
      },
    }))
    if (filteredIrrigationRepairs.length > 0) {
      sections.push(createSection({
        title: 'Irrigation Repair Tickets',
        type:  SECTION_TYPE.TABLE,
        data: {
          columns: ['Reported', 'Issue', 'Area', 'Status', 'Priority', 'Assigned', 'Hours'],
          rows: filteredIrrigationRepairs.slice(0, 50).map(r => [
            reportDateKey(r?.dateReported ?? r?.createdAt) ?? '-',
            ISSUE_TYPE_LABELS[r?.issueType] ?? titleText(r?.issueType ?? 'Repair'),
            [
              r?.hole != null ? `Hole ${r.hole}` : null,
              r?.area,
              r?.headNumber ? `Head #${r.headNumber}` : null,
            ].filter(Boolean).join(' / ') || '-',
            titleText(r?.status ?? 'open'),
            titleText(r?.priority ?? '-'),
            r?.assignedTo ?? 'Unassigned',
            reportHours(r?.laborHours),
          ]),
        },
      }))
    }
  }

  if (selected.hours) {
    sections.push(createSection({
      title: 'Hours Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Schedule Hours':           reportHours(scheduleHours),
        'Regular Hours':            reportHours(regularHours),
        'Overtime Hours':           reportHours(overtimeHours),
        'Maintenance Ticket Hours': reportHours(maintenanceHours),
        'Irrigation Repair Hours':  reportHours(irrigationRepairHours),
      },
    }))
  }

  if (selected.labor) {
    sections.push(createSection({
      title: 'Labor / Payroll',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Employee', 'Schedule Hours', 'Regular', 'OT', 'Pay Rate', 'Estimated Payroll', 'Scheduled Days', 'Tasks', 'Tickets'],
        rows: laborRows.length > 0
          ? laborRows.map(row => {
            const emp = employeeFromLookup(employeesByKey, row.name)
            return [
              row.name,
              reportHours(row.hours),
              reportHours(row.regularHours),
              reportHours(row.overtimeHours),
               emp?.hidePayRate
                 ? 'Hidden'
                 : (emp?.payRate != null ? `${reportMoney(emp.payRate)} / hr` : (row.rate != null ? `${reportMoney(row.rate)} / hr` : '-')),
              reportMoney(row.payroll),
              row.scheduledDays,
              row.taskCount,
              row.ticketCount,
            ]
          })
          : [['-', '0 hrs', '0 hrs', '0 hrs', '-', '$0.00', 0, 0, 0]],
      },
    }))
  }

  const sectionRank = title => {
    if (title === 'Owner Summary' || title === 'Owner Notes') return 0
    if (title.startsWith('Yearly Goals')) return 1
    if (title.startsWith('Weekly Goals')) return 2
    if (title === 'Hours Summary' || title === 'Labor / Payroll') return 3
    if (title.startsWith('Equipment') || title.startsWith('Irrigation')) return 4
    if (title.includes('Application')) return 5
    if (title === 'Weather Delayed Tasks') return 6
    if (title === 'Tasks' || title.endsWith('Tasks')) return 7
    return 5
  }
  const orderedSections = sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => sectionRank(a.section.title) - sectionRank(b.section.title) || a.index - b.index)
    .map(item => item.section)

  return createReport({
    module:        REPORT_MODULE.AGRONOMY,
    type:          REPORT_TYPE.AGRONOMY_PROGRESS,
    title:         `Agronomy Progress Report - ${rangeLabel}`,
    generatedBy:   'reports-hub',
    sections: orderedSections,
    attachments: Array.isArray(ownerPhotos) ? ownerPhotos : [],
    metadata: {
      dateRange: { startDate, endDate, label: rangeLabel },
      included:  selected,
      printExtras: {
        subtitle: 'Owner progress packet',
        summary: printSummary,
        footerLeft: courseName || 'TurfIntel Pro',
        footerRight: 'Owner agronomy progress report',
      },
      totals: {
        taskCount:        filteredTasks.length,
        weeklyGoalCount:  filteredWeeklyGoals.length,
        weeklyGoalDoneCount: doneWeeklyGoals.length,
        weeklyGoalInProgressCount: inProgressWeeklyGoals.length,
        weeklyGoalNotDoneCount: notDoneWeeklyGoals.length,
        yearlyGoalCount: filteredYearlyGoals.length,
        yearlyGoalDoneCount: doneYearlyGoals.length,
        yearlyGoalInProgressCount: inProgressYearlyGoals.length,
        yearlyGoalNotDoneCount: notDoneYearlyGoals.length,
        plannedTaskCount: plannedTasks.length,
        inProgressTaskCount: inProgressTasks.length,
        completeTaskCount: completeTasks.length,
        plannedApplicationCount: filteredPlannedApplications.length,
        plannedLiquidApplicationCount: plannedLiquidApplications.length,
        plannedGranularApplicationCount: plannedGranularApplications.length,
        inProgressApplicationCount: filteredInProgressApplications.length,
        pendingReviewApplicationCount: filteredPendingReviewApplications.length,
        openApplicationCount: filteredOpenApplications.length,
        sprayCount:       filteredLiquidApplications.length,
        liquidApplicationCount: filteredLiquidApplications.length,
        fertilizerCount:  filteredGranularApplications.length,
        granularApplicationCount: filteredGranularApplications.length,
        maintenanceCount: filteredMaintenance.length,
        irrigationRepairCount: filteredIrrigationRepairs.length,
        scheduleHours,
        regularHours,
        overtimeHours,
        maintenanceHours,
        irrigationRepairHours,
        payrollTotal,
        sprayCost,
        maintenanceCost,
        equipmentRmCost:  maintenanceCost,
      },
    },
    exportFormats: STANDARD_FORMATS,
  })
}

/**
 * Build a nutrition summary across soil/tissue/water reports + recommendations.
 * @param {Object}   data
 * @param {Object[]} [data.soilReports]
 * @param {Object[]} [data.tissueReports]
 * @param {Object[]} [data.waterReports]
 * @param {Object[]} [data.recommendations]
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 */
export function buildNutritionSummaryReport(data = {}, options = {}) {
  const { title = 'Plant Nutrition Summary', dateRange } = options
  const {
    soilReports     = [],
    tissueReports   = [],
    waterReports    = [],
    recommendations = [],
  } = data

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Soil Reports':    soilReports.length,
        'Tissue Reports':  tissueReports.length,
        'Water Reports':   waterReports.length,
        'Recommendations': recommendations.length,
        'Date Range':      dateRange ?? '—',
      },
    }),
  ]

  if (soilReports.length > 0) {
    sections.push(createSection({
      title: 'Soil Reports',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Area', 'Lab', 'pH', 'OM%'],
        rows: soilReports.slice(0, 25).map(r => [
          r.date ?? '—', r.area ?? '—', r.lab ?? '—',
          r.ph   ?? '—', r.om   ?? '—',
        ]),
      },
    }))
  }

  if (tissueReports.length > 0) {
    sections.push(createSection({
      title: 'Tissue Reports',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Area', 'Lab', 'N', 'P', 'K'],
        rows: tissueReports.slice(0, 25).map(r => [
          r.date ?? '—', r.area ?? '—', r.lab ?? '—',
          r.n    ?? '—', r.p    ?? '—', r.k ?? '—',
        ]),
      },
    }))
  }

  if (waterReports.length > 0) {
    sections.push(createSection({
      title: 'Water Reports',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Source', 'Lab', 'pH', 'EC', 'SAR'],
        rows: waterReports.slice(0, 25).map(r => [
          r.date ?? '—', r.source ?? '—', r.lab ?? '—',
          r.ph   ?? '—', r.ec     ?? '—', r.sar ?? '—',
        ]),
      },
    }))
  }

  if (recommendations.length > 0) {
    sections.push(createSection({
      title: 'Recommendations',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Area', 'Priority', 'Summary'],
        rows: recommendations.slice(0, 25).map(r => [
          r.area ?? '—', r.priority ?? '—', r.summary ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.AGRONOMY,
    type:          REPORT_TYPE.NUTRITION_SUMMARY,
    title,
    generatedBy:   'plant-nutrition-module',
    sections,
    metadata: {
      dateRange: dateRange ?? null,
      counts: {
        soil:   soilReports.length,
        tissue: tissueReports.length,
        water:  waterReports.length,
        recs:   recommendations.length,
      },
    },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Operations: cultural practices history ────────────────────────────────────

// Display labels for practice_type values. Mirrors values produced by the
// cultural_practices API (practiceType): 'aerification', 'topdressing',
// 'verticutting', 'rolling', 'sand', 'venting'. Anything outside this set is
// surfaced under "Other Practices" using its raw practiceType value.
const PRACTICE_TYPE_LABELS = {
  aerification: 'Aerification',
  topdressing:  'Topdressing',
  verticutting: 'Verticutting',
  rolling:      'Rolling',
  sand:         'Sand',
  venting:      'Venting',
}

/**
 * Build a cultural practices history report from the flat practice records
 * served by /api/cultural-practices (one row per event, keyed by practiceType).
 * @param {Object[]} practices - cultural_practices records (camelCase API shape)
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 */
export function buildCulturalHistoryReport(practices = [], options = {}) {
  const { title = 'Cultural Practices History', dateRange } = options

  const byType = {}
  for (const p of practices) {
    const k = p?.practiceType ?? 'unspecified'
    if (!byType[k]) byType[k] = []
    byType[k].push(p)
  }

  const total = practices.length

  const summaryFields = {
    'Total Events': total,
    'Date Range':   dateRange ?? '—',
  }
  for (const [k, list] of Object.entries(byType)) {
    const label = PRACTICE_TYPE_LABELS[k] ?? k
    summaryFields[`${label} Events`] = list.length
  }

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data:  summaryFields,
    }),
  ]

  for (const [k, list] of Object.entries(byType)) {
    if (list.length === 0) continue
    sections.push(createSection({
      title: PRACTICE_TYPE_LABELS[k] ?? k,
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Date', 'Area', 'Material', 'Rate', 'Depth', 'Status', 'Recovery'],
        rows: list.slice(0, 25).map(r => [
          r.practiceDate    ?? '—',
          r.targetArea      ?? '—',
          r.materialUsed    ?? '—',
          r.materialRate    ?? '—',
          r.depth           ?? '—',
          r.status          ?? '—',
          r.recoveryStatus  ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.OPERATIONS,
    type:          REPORT_TYPE.CULTURAL_HISTORY,
    title,
    generatedBy:   'cultural-practices-module',
    sections,
    metadata:      { dateRange: dateRange ?? null, totalEvents: total },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Disease: full observation log ─────────────────────────────────────────────

/**
 * Build a full disease observation log report (active + resolved + severity rollup).
 * Reads the camelCase shape produced by /api/disease — see worker/api/disease.js:
 * { observedAt, diseaseName, status, severity, location, hole, affectedArea,
 *   followUpDate, ... }.
 * @param {Object[]} observations
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 */
export function buildDiseaseLogReport(observations = [], options = {}) {
  const { title = 'Disease Log', dateRange } = options
  const active   = observations.filter(o => o.status !== 'resolved')
  const resolved = observations.filter(o => o.status === 'resolved')

  const bySeverity = {}
  for (const o of observations) {
    const k = o.severity ?? 'unspecified'
    bySeverity[k] = (bySeverity[k] ?? 0) + 1
  }

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Observations': observations.length,
        'Active':             active.length,
        'Resolved':           resolved.length,
        'Date Range':         dateRange ?? '—',
      },
    }),
  ]

  if (Object.keys(bySeverity).length > 0) {
    sections.push(createSection({
      title: 'By Severity',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Severity', 'Count'],
        rows:    Object.entries(bySeverity).map(([k, v]) => [k, v]),
      },
    }))
  }

  if (active.length > 0) {
    sections.push(createSection({
      title: 'Active Observations',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Observed', 'Location', 'Disease', 'Severity', 'Status', 'Follow-up'],
        rows: active.slice(0, 25).map(o => [
          o.observedAt   ?? '—',
          o.location     ?? '—',
          o.diseaseName  ?? '—',
          o.severity     ?? '—',
          o.status       ?? '—',
          o.followUpDate ?? '—',
        ]),
      },
    }))
  }

  if (resolved.length > 0) {
    sections.push(createSection({
      title: 'Resolved Observations',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Observed', 'Location', 'Disease', 'Severity'],
        rows: resolved.slice(0, 25).map(o => [
          o.observedAt  ?? '—',
          o.location    ?? '—',
          o.diseaseName ?? '—',
          o.severity    ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.DISEASE,
    type:          REPORT_TYPE.DISEASE_LOG,
    title,
    generatedBy:   'disease-module',
    sections,
    metadata:      { dateRange: dateRange ?? null, observationCount: observations.length },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Moisture: trend over time ─────────────────────────────────────────────────

/**
 * Build a moisture trend report from a series of observations.
 * Reads the camelCase shape produced by /api/moisture — see worker/api/moisture.js:
 * { observedAt, location, hole, moisturePct, surfaceNote, wiltStress, drySpot, ... }.
 * @param {Object[]} observations
 * @param {Object}   [options]
 * @param {string}   [options.location]   - filter by location (matches observation.location)
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 */
export function buildMoistureTrendReport(observations = [], options = {}) {
  const { title = 'Moisture Trend', dateRange, location } = options
  const filtered = location ? observations.filter(o => o.location === location) : observations

  const values = filtered.map(o => Number(o.moisturePct)).filter(v => Number.isFinite(v))
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
  const min = values.length > 0 ? Math.min(...values) : null
  const max = values.length > 0 ? Math.max(...values) : null

  const flagged = filtered.filter(o => o.wiltStress || o.drySpot || o.handwaterRec || o.syringeRec)

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Readings':   filtered.length,
        'Location':   location  ?? 'All',
        'Date Range': dateRange ?? '—',
        'Average %':  avg != null ? avg.toFixed(1) : '—',
        'Minimum %':  min != null ? min.toFixed(1) : '—',
        'Maximum %':  max != null ? max.toFixed(1) : '—',
        'Flagged':    flagged.length,
      },
    }),
  ]

  if (filtered.length > 0) {
    sections.push(createSection({
      title: 'Readings',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Observed', 'Location', 'Hole', 'Moisture %', 'Wilt', 'Dry Spot', 'Handwater', 'Syringe'],
        rows: filtered.slice(0, 50).map(o => [
          o.observedAt  ?? '—',
          o.location    ?? '—',
          o.hole        ?? '—',
          o.moisturePct ?? '—',
          o.wiltStress   ? 'Y' : '—',
          o.drySpot      ? 'Y' : '—',
          o.handwaterRec ? 'Y' : '—',
          o.syringeRec   ? 'Y' : '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.MOISTURE,
    type:          REPORT_TYPE.MOISTURE_TREND,
    title,
    generatedBy:   'moisture-module',
    sections,
    metadata: {
      dateRange:    dateRange ?? null,
      location:     location  ?? null,
      readingCount: filtered.length,
      average:      avg,
    },
    exportFormats: STANDARD_FORMATS,
  })
}

// ── Turf Health: shade / airflow / weak-turf / chronic-stress summary ────

// Severity display ordering for the "By Severity" rollup table.
const TURF_HEALTH_SEVERITY_ORDER = ['high', 'moderate', 'low']

/**
 * Build a Turf Health summary report from the observation rows served by
 * /api/turf-health (see worker/api/turfHealth.js for the camelCase shape).
 *
 * Sections:
 *   1. Summary       — total / active+monitoring / high-severity (open) /
 *                      resolved / dateRange
 *   2. By Severity   — TABLE rollup, ordered high → moderate → low
 *   3. By Type       — TABLE rollup grouped by healthType, human-labeled,
 *                      sorted by count descending
 *   4. Active Issues — TABLE of status=active|monitoring rows, severity-
 *                      sorted then date-desc (matches the workspace)
 *   5. Recent Observations — TABLE of the newest rows (limit applied),
 *                      regardless of status
 *
 * @param {Object[]} observations
 * @param {Object}   [options]
 * @param {string}   [options.dateRange]
 * @param {string}   [options.title]
 * @param {number}   [options.activeLimit]   - default 25
 * @param {number}   [options.recentLimit]   - default 25
 */
export function buildTurfHealthSummaryReport(observations = [], options = {}) {
  const {
    title = 'Turf Health Summary',
    dateRange,
    activeLimit = 25,
    recentLimit = 25,
  } = options

  const active   = observations.filter(o => o.status === 'active' || o.status === 'monitoring')
  const resolved = observations.filter(o => o.status === 'resolved')
  const highOpen = observations.filter(o => o.severity === 'high' && o.status !== 'resolved')

  // Severity rollup over EVERY observation (matches disease report convention).
  const bySeverity = {}
  for (const o of observations) {
    const k = o.severity ?? 'unspecified'
    bySeverity[k] = (bySeverity[k] ?? 0) + 1
  }

  // Type rollup over open observations only — fits the "what's currently
  // wrong with the course" use case. Resolved entries are historical.
  const byType = {}
  for (const o of observations) {
    if (o.status === 'resolved') continue
    if (!o.healthType) continue
    byType[o.healthType] = (byType[o.healthType] ?? 0) + 1
  }
  const typeRows = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [HEALTH_TYPE_LABELS[k] ?? k, v])

  const severityRows = TURF_HEALTH_SEVERITY_ORDER
    .filter(k => bySeverity[k] != null)
    .map(k => [SEVERITY_LABELS[k] ?? k, bySeverity[k]])
  // Surface any unrecognised severities (e.g. "unspecified") at the end so
  // we don't silently drop rows.
  for (const [k, v] of Object.entries(bySeverity)) {
    if (TURF_HEALTH_SEVERITY_ORDER.includes(k)) continue
    severityRows.push([SEVERITY_LABELS[k] ?? k, v])
  }

  const sections = [
    createSection({
      title: 'Summary',
      type:  SECTION_TYPE.FIELDS,
      data: {
        'Total Observations':  observations.length,
        'Active / Monitoring': active.length,
        'High Severity (open)': highOpen.length,
        'Resolved':            resolved.length,
        'Date Range':          dateRange ?? '—',
      },
    }),
  ]

  if (severityRows.length > 0) {
    sections.push(createSection({
      title: 'By Severity',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Severity', 'Count'],
        rows:    severityRows,
      },
    }))
  }

  if (typeRows.length > 0) {
    sections.push(createSection({
      title: 'By Type (open)',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Type', 'Count'],
        rows:    typeRows,
      },
    }))
  }

  if (active.length > 0) {
    // Severity-sorted then newest first — matches the Active Issues tab.
    const activeSorted = [...active].sort((a, b) => {
      const sa = TURF_HEALTH_SEVERITY_ORDER.indexOf(a.severity)
      const sb = TURF_HEALTH_SEVERITY_ORDER.indexOf(b.severity)
      const saa = sa < 0 ? 99 : sa
      const sbb = sb < 0 ? 99 : sb
      if (saa !== sbb) return saa - sbb
      return (b.observedAt ?? '').localeCompare(a.observedAt ?? '')
    })
    sections.push(createSection({
      title: 'Active Issues',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Observed', 'Location', 'Type', 'Severity', 'Status', 'Notes'],
        rows: activeSorted.slice(0, activeLimit).map(o => [
          o.observedAt                                  ?? '—',
          o.location                                    ?? '—',
          HEALTH_TYPE_LABELS[o.healthType] ?? o.healthType ?? '—',
          SEVERITY_LABELS[o.severity]      ?? o.severity   ?? '—',
          o.status                                      ?? '—',
          o.surfaceNote ?? o.notes                      ?? '—',
        ]),
      },
    }))
  }

  if (observations.length > 0) {
    // Newest-first slice — matches the Recent Observations tab.
    const recentSorted = [...observations].sort((a, b) =>
      (b.observedAt ?? '').localeCompare(a.observedAt ?? ''),
    )
    sections.push(createSection({
      title: 'Recent Observations',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Observed', 'Location', 'Type', 'Severity', 'Status'],
        rows: recentSorted.slice(0, recentLimit).map(o => [
          o.observedAt                                  ?? '—',
          o.location                                    ?? '—',
          HEALTH_TYPE_LABELS[o.healthType] ?? o.healthType ?? '—',
          SEVERITY_LABELS[o.severity]      ?? o.severity   ?? '—',
          o.status                                      ?? '—',
        ]),
      },
    }))
  }

  return createReport({
    module:        REPORT_MODULE.TURF_HEALTH,
    type:          REPORT_TYPE.TURF_HEALTH_SUMMARY,
    title,
    generatedBy:   'turf-health-module',
    sections,
    metadata: {
      dateRange:        dateRange ?? null,
      observationCount: observations.length,
      activeCount:      active.length,
      highOpenCount:    highOpen.length,
    },
    exportFormats: STANDARD_FORMATS,
  })
}
