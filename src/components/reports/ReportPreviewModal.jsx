import { useEffect, useCallback } from 'react'
import { SECTION_TYPE, REPORT_TYPE } from '../../utils/reports/reportSchemas'
import ReportActions from './ReportActions'
import SprayIntelligencePreview from './SprayIntelligencePreview'
import SprayProgramPreview from './SprayProgramPreview'
import SprayProgramCostPreview from './SprayProgramCostPreview'
import styles from './reports.module.css'

const CUSTOM_PREVIEWS = {
  [REPORT_TYPE.SPRAY_INTELLIGENCE]: SprayIntelligencePreview,
  [REPORT_TYPE.SPRAY_PROGRAM]: SprayProgramPreview,
  [REPORT_TYPE.SPRAY_PROGRAM_COST]: SprayProgramCostPreview,
}

export default function ReportPreviewModal({ report, onClose, courseInfo = {}, rowActions = {} }) {
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
  const attachmentGroups = [
    ['improvement', 'Improvements'],
    ['concern', 'Concerns'],
    ['other', 'Other Attachments'],
  ].map(([key, label]) => ({
    key,
    label,
    items: (report.attachments ?? []).filter(att => (att.category ?? 'other') === key),
  })).filter(group => group.items.length > 0)

  function renderTable(section) {
    const actionsForSection = rowActions?.[section.id] ?? rowActions?.[section.title] ?? []
    const hasRowActions = actionsForSection.length > 0

    return (
      <div className={styles.rpTableWrap}>
        <table className={styles.rpTable}>
          <thead>
            <tr>
              {section.data.columns.flatMap((col, ci) => [
                <th key={col} className={styles.rpTableHead}>{col}</th>,
                hasRowActions && ci === 0 ? (
                  <th key={`${col}-action`} className={`${styles.rpTableHead} ${styles.rpTableActionHead}`}>
                    View
                  </th>
                ) : null,
              ])}
            </tr>
          </thead>
          <tbody>
            {section.data.rows.map((row, ri) => (
              <tr key={ri} className={styles.rpTableRow}>
                {row.flatMap((cell, ci) => [
                  <td
                    key={ci}
                    className={styles.rpTableCell}
                    data-label={section.data.columns[ci]}
                  >
                    {cell ?? '-'}
                  </td>,
                  hasRowActions && ci === 0 ? (
                    <td
                      key={`${ci}-action`}
                      className={`${styles.rpTableCell} ${styles.rpTableActionCell}`}
                      data-label="View"
                    >
                      {actionsForSection[ri] ? (
                        <button
                          type="button"
                          className={styles.rpRowActionBtn}
                          onClick={actionsForSection[ri].onClick}
                          title={actionsForSection[ri].title}
                        >
                          {actionsForSection[ri].label || 'View'}
                        </button>
                      ) : '-'}
                    </td>
                  ) : null,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div
      className={styles.rpOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Report: ${report.title}`}
    >
      <div className={styles.rpPanel}>
        <button
          className={styles.rpClose}
          onClick={onClose}
          aria-label="Close report"
        >
          x
        </button>

        <div className={styles.rpHeader}>
          <h2 className={styles.rpTitle}>{report.title}</h2>
          <p className={styles.rpMeta}>
            {dateStr}
            {' - '}
            {report.module}
            {' - '}
            {report.id}
          </p>
        </div>

        <div className={styles.rpBody}>
          {(() => {
            const CustomPreview = CUSTOM_PREVIEWS[report.type]
            if (CustomPreview) return <CustomPreview report={report} />

            return report.sections.map((section, i) => (
              <div key={i} className={styles.rpSection}>
                <p className={styles.rpSectionTitle}>{section.title}</p>

                {section.type === SECTION_TYPE.FIELDS && (
                  <div className={styles.rpFieldGrid}>
                    {Object.entries(section.data).map(([label, value]) => (
                      <div key={label} className={styles.rpField}>
                        <span className={styles.rpFieldLabel}>{label}</span>
                        <span className={styles.rpFieldValue}>{value ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {section.type === SECTION_TYPE.TABLE && renderTable(section)}

                {section.type === SECTION_TYPE.TEXT && (
                  <p className={styles.rpText}>{section.data}</p>
                )}
              </div>
            ))
          })()}

          {report.attachments?.length > 0 && (
            <div className={styles.rpSection}>
              <p className={styles.rpSectionTitle}>
                Report Photos ({report.attachments.length})
              </p>
              {attachmentGroups.map(group => (
                <div key={group.key} className={styles.rpAttachGroup}>
                  <p className={styles.rpAttachGroupTitle}>{group.label}</p>
                  <div className={styles.rpAttachments}>
                    {group.items.map(att => (
                      <div key={att.id} className={styles.rpAttachItem}>
                        {att.thumbnailUrl ? (
                          <img
                            src={att.thumbnailUrl}
                            alt={att.caption || att.filename}
                            className={styles.rpAttachThumb}
                          />
                        ) : (
                          <span className={styles.rpAttachIcon}>
                            {att.type === 'image' ? 'IMG' : 'DOC'}
                          </span>
                        )}
                        <span className={styles.rpAttachLabel} title={att.caption || att.filename}>
                          {att.caption || att.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ReportActions
          report={report}
          onClose={onClose}
          courseInfo={courseInfo}
        />
      </div>
    </div>
  )
}
