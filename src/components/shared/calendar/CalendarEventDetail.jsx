import { useEffect } from 'react'
import styles from './Calendar.module.css'
import { resolveEventColor, EVENT_STATUS, MONTH_NAMES } from './calendarTokens'

/**
 * Full-detail modal for a single calendar event.
 * Click the backdrop or press Escape to close.
 *
 * Props:
 *   event   — event object from calendarTokens shape
 *   onClose — () => void
 */
export default function CalendarEventDetail({ event, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const color      = resolveEventColor(event)
  const statusMeta = EVENT_STATUS[event.status]

  const [y, m, d]  = event.date.split('-').map(Number)
  const dateLabel  = `${MONTH_NAMES[m - 1]} ${d}, ${y}`
  const weekday    = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })

  const rows = [
    { label: 'Date',     value: `${weekday}, ${dateLabel}` },
    { label: 'Category', value: event.category },
    { label: 'Status',   value: statusMeta?.label ?? event.status, accent: true },
    event.course   && { label: 'Course',   value: event.course },
    event.severity && { label: 'Severity', value: event.severity },
    event.notes    && { label: 'Notes',    value: event.notes },
  ].filter(Boolean)

  return (
    <div
      className={styles.detailOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
    >
      <div className={styles.detailModal} onClick={e => e.stopPropagation()}>

        {/* Colored top bar matching event type */}
        <div className={styles.detailAccent} style={{ background: color }} />

        {/* Header: category + title + close */}
        <div className={styles.detailHeader}>
          <div className={styles.detailHeadText}>
            <span className={styles.detailCategory}>{event.category}</span>
            <h2 className={styles.detailTitle}>{event.title}</h2>
          </div>
          <button
            className={styles.detailClose}
            onClick={onClose}
            aria-label="Close event detail"
          >
            ✕
          </button>
        </div>

        {/* Detail rows */}
        <div className={styles.detailBody}>
          {rows.map(row => (
            <div key={row.label} className={styles.detailRow}>
              <span className={styles.detailRowLabel}>{row.label}</span>
              <span
                className={styles.detailRowValue}
                style={row.accent ? { color } : undefined}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
