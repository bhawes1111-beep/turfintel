import {
  createReport,
  createSection,
  REPORT_MODULE,
  REPORT_TYPE,
  EXPORT_FORMAT,
  SECTION_TYPE,
} from './reportSchemas'

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
