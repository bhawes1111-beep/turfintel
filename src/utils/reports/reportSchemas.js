export const REPORT_MODULE = {
  IRRIGATION:  'irrigation',
  SPRAY:       'spray',
  EQUIPMENT:   'equipment',
  DISEASE:     'disease',
  OPERATIONS:  'operations',
  AGRONOMY:    'agronomy',
  MOISTURE:    'moisture',
  // Phase 7B.1 — Turf Health vertical (shade, airflow, weak turf, chronic
  // stress). Peer to disease + moisture in the registry; its own column on
  // the Reports hub.
  TURF_HEALTH: 'turf-health',
}

export const REPORT_TYPE = {
  REPAIR_LOG:           'repair-log',
  SPRAY_SUMMARY:        'spray-summary',
  MAINTENANCE_LOG:      'maintenance-log',
  MAINTENANCE_SUMMARY:  'maintenance-summary',
  OPERATIONAL_SUMMARY:  'operational-summary',
  DISEASE_SUMMARY:      'disease-summary',
  MORNING_BRIEF:        'morning-brief',
  NUTRITION_SUMMARY:    'nutrition-summary',
  CULTURAL_HISTORY:     'cultural-history',
  DISEASE_LOG:          'disease-log',
  MOISTURE_TREND:       'moisture-trend',
  TURF_HEALTH_SUMMARY:  'turf-health-summary',
  // Phase 7E — Spray Intelligence (chemistry / rotation / interval awareness).
  SPRAY_INTELLIGENCE:   'spray-intelligence',
  // Phase 7G — Spray Program (planned programs + plan-vs-actual summary).
  SPRAY_PROGRAM:        'spray-program',
}

export const EXPORT_FORMAT = {
  PDF:   'pdf',
  PRINT: 'print',
  CSV:   'csv',
  JSON:  'json',
}

export const SECTION_TYPE = {
  FIELDS: 'fields',
  TABLE:  'table',
  TEXT:   'text',
}

/**
 * Stamp a standardized TurfReport envelope.
 * @param {Object} fields
 * @param {string}   fields.module        - REPORT_MODULE value
 * @param {string}   fields.type          - REPORT_TYPE value
 * @param {string}   fields.title
 * @param {string}   [fields.generatedBy] - defaults to 'system'
 * @param {Object[]} [fields.sections]    - createSection() results
 * @param {Object[]} [fields.attachments] - createAttachmentRef() results
 * @param {Object}   [fields.metadata]    - arbitrary key-value pairs
 * @param {string[]} [fields.exportFormats]
 * @returns {TurfReport}
 */
export function createReport({
  module,
  type,
  title,
  generatedBy   = 'system',
  sections      = [],
  attachments   = [],
  metadata      = {},
  exportFormats = [EXPORT_FORMAT.PRINT, EXPORT_FORMAT.JSON],
}) {
  return {
    id:            `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    module,
    type,
    title,
    createdAt:     new Date().toISOString(),
    generatedBy,
    sections,
    attachments,
    metadata,
    exportFormats,
  }
}

/**
 * Create a typed report section.
 * @param {string} title
 * @param {string} type  - SECTION_TYPE value
 * @param {*}      data  - shape depends on type:
 *   fields → { label: value, ... }
 *   table  → { columns: string[], rows: any[][] }
 *   text   → string
 */
export function createSection({ title, type = SECTION_TYPE.FIELDS, data }) {
  return { title, type, data }
}

/**
 * Create a normalized attachment reference for embedding in a report.
 * thumbnailUrl is session-ephemeral (object URL) — callers must pass it live.
 * @param {Object} fields
 * @param {string}      fields.id
 * @param {string}      fields.filename
 * @param {string}      fields.type        - 'image' | 'document'
 * @param {string|null} [fields.thumbnailUrl]
 * @param {number}      fields.size
 */
export function createAttachmentRef({ id, filename, type, thumbnailUrl = null, size }) {
  return { id, filename, type, thumbnailUrl, size }
}
