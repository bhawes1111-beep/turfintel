import styles from './Calendar.module.css'
import { resolveEventColor, EVENT_STATUS } from './calendarTokens'

const SEVERITY_CLASS = {
  high:   styles.severityHigh,
  medium: styles.severityMedium,
  low:    styles.severityLow,
}

// Phase 28B — small color-coded dot rendered when a calendar event carries
// a spray-window rating (green/yellow/red). Used in the compact pill view.
const WINDOW_DOT_COLOR = {
  green:  '#7bc97c',
  yellow: '#e8c14a',
  red:    '#e26464',
}

/**
 * Renders one calendar event in two modes:
 *
 *   compact = true  → colored pill, used inside grid cells
 *   compact = false → full card with accent bar, used in agenda view
 *
 * Props:
 *   event    — { id, title, type, category, date, status, course, severity, color }
 *   compact  — bool (default false)
 *   onClick  — (event) => void  optional
 */
export default function CalendarEvent({ event, compact = false, onClick }) {
  const color      = resolveEventColor(event)
  const statusMeta = EVENT_STATUS[event.status]

  function handleClick() { onClick?.(event) }
  function handleKey(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }

  const interactProps = onClick
    ? { role: 'button', tabIndex: 0, onClick: handleClick, onKeyDown: handleKey }
    : {}

  if (compact) {
    const pillCls = [
      styles.eventPill,
      event.status === 'planned'   ? styles.pillPlanned   : '',
      event.status === 'cancelled' ? styles.pillCancelled : '',
    ].filter(Boolean).join(' ')

    // Phase 28B — compose the title= so hovering shows the spray-window
    // reasoning beside the event name.
    const titleParts = [event.title]
    if (event.status) titleParts[0] += ` (${event.status})`
    if (event.windowRating && event.windowReasons?.length) {
      titleParts.push(`Spray window: ${event.windowReasons.map(r => r.why).join(' · ')}`)
    }

    return (
      <div
        className={pillCls}
        style={{ background: color }}
        title={titleParts.join('\n')}
        {...interactProps}
      >
        {event.windowRating && WINDOW_DOT_COLOR[event.windowRating] && (
          <span
            className={styles.windowDot}
            style={{ background: WINDOW_DOT_COLOR[event.windowRating] }}
            aria-hidden="true"
          />
        )}
        {event.title}
      </div>
    )
  }

  const cardCls = [
    styles.eventCard,
    event.status === 'planned'   ? styles.cardPlanned   : '',
    event.status === 'cancelled' ? styles.cardCancelled : '',
  ].filter(Boolean).join(' ')

  const metaParts = [event.category, event.course].filter(Boolean)

  return (
    <div className={cardCls} {...interactProps}>
      <div className={styles.eventCardAccent} style={{ background: color }} />
      <div className={styles.eventCardBody}>
        <div className={styles.eventCardTitle}>{event.title}</div>
        {metaParts.length > 0 && (
          <div className={styles.eventCardMeta}>{metaParts.join(' · ')}</div>
        )}
      </div>
      <div className={styles.eventCardRight}>
        {statusMeta && (
          <span className={styles.eventCardStatus}>{statusMeta.label}</span>
        )}
        {event.severity && SEVERITY_CLASS[event.severity] && (
          <span className={`${styles.eventCardSeverity} ${SEVERITY_CLASS[event.severity]}`}>
            {event.severity}
          </span>
        )}
      </div>
    </div>
  )
}
