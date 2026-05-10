import { createContext, useContext } from 'react'
import styles from './Timeline.module.css'

/**
 * Timeline — shared operational event-rail primitive (Phase 3.2).
 *
 * Renders a horizontal axis over a continuous numeric range. The range
 * unit is whatever the consumer wants (hour of day, hour of machine life,
 * day of week as a number, etc.) — Timeline only deals in numbers.
 *
 * Compound API:
 *   <Timeline start={5} end={16} now={11.5} gridlines={11}>
 *     <Timeline.Scale ticks={[5, 7, 9, 11, 13, 15]} format={fmtHour} />
 *     <Timeline.Row label="Alex">
 *       <Timeline.Item start={6} span={2} status="in-progress" title="Mow Greens" />
 *       <Timeline.Item start={9} span={3} status="completed"   title="Roll Fairways" />
 *     </Timeline.Row>
 *     <Timeline.Row label="Sam">{...}</Timeline.Row>
 *   </Timeline>
 *
 * Owned responsibilities:
 *   - Position math (item.start/span and now → percentage on the range)
 *   - Horizontal scroll containment + minimum width
 *   - Row label column + track structure
 *   - Optional vertical gridlines (subtle texture for time-based ranges)
 *   - The "now" indicator line, when in range
 *
 * Consumer-owned (intentionally NOT in this primitive):
 *   - Scheduling, recurrence, drag/drop, editing
 *   - Status / category color of items (apply via className on Item)
 *   - Tick value selection and tick label formatting
 *   - Wrapping collapsible header, "today" date selector, etc.
 *   - Row source data (employees → blocks, equipment → service windows, …)
 */
const TimelineContext = createContext({
  start:      0,
  end:        1,
  span:       1,
  labelWidth: 56,
  now:        null,
  gridlines:  0,
})

export default function Timeline({
  start,
  end,
  now = null,
  labelWidth = 56,
  minWidth   = 480,
  gridlines  = 0,
  ariaLabel,
  className  = '',
  children,
}) {
  const span = Math.max(0.0001, end - start)
  const classes = [styles.timeline, className].filter(Boolean).join(' ')

  return (
    <TimelineContext.Provider value={{ start, end, span, labelWidth, now, gridlines }}>
      <div className={classes} role="group" aria-label={ariaLabel}>
        <div className={styles.body}>
          <div className={styles.inner} style={{ minWidth: `${minWidth}px` }}>
            {children}
          </div>
        </div>
      </div>
    </TimelineContext.Provider>
  )
}

function Scale({ ticks = [], format = String, className = '' }) {
  const { start, span, labelWidth } = useContext(TimelineContext)
  const classes = [styles.scale, className].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
      style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}
    >
      <div className={styles.scaleSpacer} />
      <div className={styles.scaleRow}>
        {ticks.map(t => {
          const pct = ((t - start) / span) * 100
          if (pct < 0 || pct > 100) return null
          return (
            <span key={t} className={styles.tick} style={{ left: `${pct}%` }}>
              {format(t)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, ariaLabel, className = '', children }) {
  const { labelWidth, start, span, now, gridlines } = useContext(TimelineContext)
  const nowInRange = now != null && now >= start && now <= start + span
  const nowPct = nowInRange ? ((now - start) / span) * 100 : null
  const trackStyle = gridlines > 0 ? { '--tl-divisor': gridlines } : undefined
  const classes = [styles.row, className].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
      style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}
      aria-label={ariaLabel}
    >
      <span className={styles.label}>{label}</span>
      <div
        className={styles.track}
        data-gridlines={gridlines > 0 ? 'true' : undefined}
        style={trackStyle}
      >
        {children}
        {nowPct != null && (
          <div
            className={styles.nowLine}
            style={{ left: `${nowPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}

function Item({
  start: itemStart,
  span:  itemSpan,
  status,
  title,
  className = '',
  style     = {},
  onClick,
}) {
  const { start, span } = useContext(TimelineContext)
  if (itemSpan == null || itemSpan <= 0) return null

  let leftPct  = ((itemStart - start) / span) * 100
  let widthPct = (itemSpan / span) * 100

  // Clamp to [0, 100] without losing total span
  if (leftPct < 0) {
    widthPct = Math.max(0, widthPct + leftPct)
    leftPct  = 0
  }
  if (leftPct + widthPct > 100) {
    widthPct = Math.max(0, 100 - leftPct)
  }
  if (widthPct <= 0) return null

  const classes = [styles.item, className].filter(Boolean).join(' ')
  const inlineStyle = { left: `${leftPct}%`, width: `${widthPct}%`, ...style }

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        data-status={status}
        title={title}
        onClick={onClick}
        style={inlineStyle}
      />
    )
  }
  return (
    <div
      className={classes}
      data-status={status}
      title={title}
      style={inlineStyle}
    />
  )
}

Timeline.Scale = Scale
Timeline.Row   = Row
Timeline.Item  = Item
