import { reportToCSV } from '../../utils/reports/reportFormatter'
import { triggerPrint, viewPDF, downloadJSON, downloadCSV } from '../../utils/reports/exportUtils'
import { EXPORT_FORMAT } from '../../utils/reports/reportSchemas'
import styles from './reports.module.css'

/**
 * Export action strip for a TurfReport.
 * Reads report.exportFormats to conditionally render each action button.
 * PDF opens a polished print-ready view for browser Save as PDF.
 *
 * @param {Object}   report   - TurfReport (from reportBuilder)
 * @param {Function} [onClose]
 * @param {Object}   [courseInfo] - { name, superintendent } passed to print
 */
export default function ReportActions({ report, onClose, courseInfo = {} }) {
  if (!report) return null

  const formats = report.exportFormats ?? []

  function handlePrint() {
    triggerPrint(report, courseInfo)
  }

  function handleViewPDF() {
    viewPDF(report, courseInfo)
  }

  function handleJSON() {
    downloadJSON(report)
  }

  function handleCSV() {
    const csv = reportToCSV(report)
    downloadCSV(csv, `${report.id}.csv`)
  }

  return (
    <div className={styles.rpActions}>
      {formats.includes(EXPORT_FORMAT.PRINT) && (
        <button
          className={`${styles.rpActionBtn} ${styles.rpActionBtnPrimary}`}
          onClick={handlePrint}
        >
          Print
        </button>
      )}
      {(formats.includes(EXPORT_FORMAT.PDF) || formats.includes(EXPORT_FORMAT.PRINT)) && (
        <button
          className={`${styles.rpActionBtn} ${styles.rpActionBtnPrimary}`}
          onClick={handleViewPDF}
        >
          View PDF
        </button>
      )}
      {formats.includes(EXPORT_FORMAT.JSON) && (
        <button className={styles.rpActionBtn} onClick={handleJSON}>
          Download JSON
        </button>
      )}
      {formats.includes(EXPORT_FORMAT.CSV) && (
        <button className={styles.rpActionBtn} onClick={handleCSV}>
          Download CSV
        </button>
      )}
      {onClose && (
        <button
          className={`${styles.rpActionBtn} ${styles.rpActionBtnGhost}`}
          onClick={onClose}
        >
          Close
        </button>
      )}
    </div>
  )
}
