import {
  createReport,
  createSection,
  REPORT_MODULE,
  REPORT_TYPE,
  EXPORT_FORMAT,
  SECTION_TYPE,
} from './reportSchemas.js'
import { HEALTH_TYPE_LABELS, SEVERITY_LABELS } from '../turfHealth/healthTypes.js'

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

const STANDARD_FORMATS = [EXPORT_FORMAT.PRINT, EXPORT_FORMAT.JSON, EXPORT_FORMAT.CSV]

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
    sections.push(createSection({
      title: 'Parts Used',
      type:  SECTION_TYPE.TABLE,
      data: {
        columns: ['Qty', 'Part / Material'],
        rows:    repair.partsUsed.map(p => [p.qty, p.part]),
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

// Same compliance heuristic the Records view uses, duplicated here so
// the report is self-contained and the title-side count stays in sync
// with what the supervisor sees in the filter pane.
function recordNeedsInfoLocal(record) {
  if (!record) return false
  if (record.status !== 'completed') return false
  if (!record.date) return true
  if (!record.applicator || !record.applicator.trim()) return true
  if (!Array.isArray(record.products) || record.products.length === 0) return true
  if (!Array.isArray(record.areas)    || record.areas.length    === 0) return true
  const c = record.conditions
  if (!c) return true
  const hasAnyWeather = c.temp != null || c.humidity != null || c.wind != null
  if (!hasAnyWeather) return true
  if (c.windSpeedMph == null) return true
  if (!c.windDirection)        return true
  return false
}

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
  const needsInfoCount = safeRecords.filter(recordNeedsInfoLocal).length
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

    const needsFlag = recordNeedsInfoLocal(r) ? ' — NEEDS INFO' : ''
    const sectionTitle = `${r.date ?? '(no date)'} · ${productSummary}${needsFlag}`

    const areaList = (r.areas ?? [])
      .map(a => `${a.name ?? '(area)'}${a.acreage != null ? ` (${a.acreage} ac)` : ''}`)
      .join(', ') || (r.area ?? '—')

    const productLines = (r.products ?? []).length > 0
      ? r.products.map(formatProductLine).join('\n')
      : '—'

    const fields = {
      'Date':              r.date              ?? '—',
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
    if (recordNeedsInfoLocal(r)) {
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
        columns: ['Date', 'Type', 'Description', 'Technician', 'Cost'],
        rows: logs.map(l => [
          l.date        ?? '—',
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
