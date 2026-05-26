import { useEffect, useCallback } from 'react'
import { SECTION_TYPE, REPORT_TYPE } from '../../utils/reports/reportSchemas'
import ReportActions from './ReportActions'
import SprayIntelligencePreview from './SprayIntelligencePreview'
import SprayProgramPreview      from './SprayProgramPreview'
import styles from './reports.module.css'

// Phase 7E (2/?) — per-report custom-preview dispatcher. Any report
// whose `type` appears as a key in CUSTOM_PREVIEWS renders via the
// mapped component instead of the generic FIELDS/TABLE/TEXT path.
// Falls through to the existing renderer for every other report so
// adding a custom preview is opt-in per report.
const CUSTOM_PREVIEWS = {
  [REPORT_TYPE.SPRAY_INTELLIGENCE]: SprayIntelligencePreview,
  // Phase 7G (2/?) — Spray Program custom preview.
  [REPORT_TYPE.SPRAY_PROGRAM]:      SprayProgramPreview,
}

/**
 * Lightbox-style modal for previewing a TurfReport.
 * Renders all sections by type (fields / table / text) and an attachment strip.
 * Delegates export actions to ReportActions.
 *
 * @param {Object|null} report      - TurfReport from reportBuilder, or null (hidden)
 * @param {Function}    onClose     - Called on backdrop click, ✕ button, or Escape
 * @param {Object}      [courseInfo] - { name, superintendent } forwarded to print
 */
export default function ReportPreviewModal({ report, onClose, courseInfo = {} }) {
  const handleKeyDown = useCallback(
    e => { if (e.key === 'Escape') onClose?.() },
    [onClose],
  )

  useEffect(() => {
    if (!report) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [report, handleKeyDown])

  if (!report) return null

  const dateStr = new Date(report.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div
      className={styles.rpOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Report: ${report.title}`}
    >
      <div
        className={styles.rpPanel}
        onClick={e => e.stopPropagation()}
      >
        <button
          className={styles.rpClose}
          onClick={onClose}
          aria-label="Close report"
        >
          ✕
        </button>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className={styles.rpHeader}>
          <h2 className={styles.rpTitle}>{report.title}</h2>
          <p className={styles.rpMeta}>
            {dateStr}
            {' · '}
            {report.module}
            {' · '}
            {report.id}
          </p>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className={styles.rpBody}>

          {(() => {
            const CustomPreview = CUSTOM_PREVIEWS[report.type]
            if (CustomPreview) {
              // Custom preview takes over the body region but the modal
              // shell, header, attachments strip, and ReportActions stay
              // exactly the same so export buttons + print continue to
              // work uniformly.
              return <CustomPreview report={report} />
            }
            return report.sections.map((section, i) => (
              <div key={i} className={styles.rpSection}>
                <p className={styles.rpSectionTitle}>{section.title}</p>

                {section.type === SECTION_TYPE.FIELDS && (
                  <div className={styles.rpFieldGrid}>
                    {Object.entries(section.data).map(([label, value]) => (
                      <div key={label} className={styles.rpField}>
                        <span className={styles.rpFieldLabel}>{label}</span>
                        <span className={styles.rpFieldValue}>{value ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {section.type === SECTION_TYPE.TABLE && (
                  <div className={styles.rpTableWrap}>
                    <table className={styles.rpTable}>
                      <thead>
                        <tr>
                          {section.data.columns.map(col => (
                            <th key={col} className={styles.rpTableHead}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.data.rows.map((row, ri) => (
                          <tr key={ri} className={styles.rpTableRow}>
                            {row.map((cell, ci) => (
                              <td key={ci} className={styles.rpTableCell}>
                                {cell ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.type === SECTION_TYPE.TEXT && (
                  <p className={styles.rpText}>{section.data}</p>
                )}
              </div>
            ))
          })()}

          {/* ── Attachments strip ──────────────────────────────────────────── */}
          {report.attachments?.length > 0 && (
            <div className={styles.rpSection}>
              <p className={styles.rpSectionTitle}>
                Attachments ({report.attachments.length})
              </p>
              <div className={styles.rpAttachments}>
                {report.attachments.map(att => (
                  <div key={att.id} className={styles.rpAttachItem}>
                    {att.thumbnailUrl ? (
                      <img
                        src={att.thumbnailUrl}
                        alt={att.filename}
                        className={styles.rpAttachThumb}
                      />
                    ) : (
                      <span className={styles.rpAttachIcon}>
                        {att.type === 'image' ? '🖼' : '📄'}
                      </span>
                    )}
                    <span className={styles.rpAttachLabel} title={att.filename}>
                      {att.filename}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <ReportActions
          report={report}
          onClose={onClose}
          courseInfo={courseInfo}
        />

      </div>
    </div>
  )
}
