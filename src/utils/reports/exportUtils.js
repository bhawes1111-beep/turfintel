import { buildPrintDocument, reportToJSON } from './reportFormatter'

// ── Internal helper ────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Exports ────────────────────────────────────────────────────────────────────

/**
 * Open a new browser window with the report rendered as printable HTML,
 * then trigger the browser's native print dialog.
 * Uses a separate window so the app's sidebar/nav are never printed.
 * @param {Object} report     - TurfReport
 * @param {Object} [courseInfo] - { name, superintendent } optional branding
 */
export function triggerPrint(report, courseInfo = {}) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    // Popup blocked — fall back to printing the current window
    window.print()
    return
  }
  const html = buildPrintDocument(report, courseInfo)
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  // Small delay lets the browser finish layout before the print dialog opens
  win.setTimeout(() => win.print(), 300)
}

/**
 * Open a polished PDF-ready report view in a new browser window.
 * The user can print or save as PDF from that window without printing the app
 * chrome, sidebar, or modal controls.
 * @param {Object} report       - TurfReport
 * @param {Object} [courseInfo] - { name, superintendent } optional branding
 */
export function viewPDF(report, courseInfo = {}) {
  const win = window.open('', '_blank', 'width=900,height=900')
  if (!win) {
    triggerPrint(report, courseInfo)
    return
  }
  const html = buildPrintDocument(report, courseInfo, { showToolbar: true })
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}

/**
 * Download a TurfReport as a JSON file.
 * thumbnailUrl fields are stripped in reportToJSON — they are ephemeral object URLs.
 * @param {Object} report - TurfReport
 */
export function downloadJSON(report) {
  const content = reportToJSON(report)
  const blob    = new Blob([content], { type: 'application/json' })
  triggerDownload(blob, `${report.id}.json`)
}

/**
 * Download a pre-serialized CSV string.
 * Callers should use reportToCSV(report) to produce the content string.
 * @param {string} content  - CSV string (from reportToCSV)
 * @param {string} filename - e.g. 'rpt-abc123.csv'
 */
export function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

/**
 * PDF export placeholder — not yet implemented.
 * Logs a console warning rather than silently doing nothing.
 * Future: integrate jsPDF, pdf-lib, or a server-side renderer here.
 */
export function exportPDF() {
  console.warn('[TurfIntel] PDF export is not yet implemented.')
}
