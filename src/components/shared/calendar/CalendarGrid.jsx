import { useState, useMemo } from 'react'
import styles from './Calendar.module.css'
import CalendarEvent from './CalendarEvent'
import { DAY_HEADERS_SHORT, toDateStr, todayStr } from './calendarTokens'

/**
 * Full calendar grid with grid and agenda views.
 *
 * Props:
 *   events           — array of event objects (see calendarTokens for shape)
 *   year             — number  (controlled by parent)
 *   month            — number  0-indexed (controlled by parent)
 *   onEventClick     — (event) => void  optional
 *   defaultView      — 'grid' | 'agenda'  (default: 'grid')
 *   maxEventsPerDay  — number  max pills shown per cell before "+N more" (default: 3)
 *   showViewToggle   — bool  show the Grid/Agenda toggle buttons (default: true)
 */
export default function CalendarGrid({
  events = [],
  year,
  month,
  onEventClick,
  defaultView = 'grid',
  maxEventsPerDay = 3,
  showViewToggle = true,
}) {
  const [view, setView] = useState(defaultView)
  const TODAY = todayStr()

  // Build the array of cells (null = empty pad, number = day of month)
  const { cells, daysInMonth } = useMemo(() => {
    const firstDay   = new Date(year, month, 1)
    const days       = new Date(year, month + 1, 0).getDate()
    const startOffset = (firstDay.getDay() + 6) % 7 // Mon = 0
    const arr = []
    for (let i = 0; i < startOffset; i++) arr.push(null)
    for (let d = 1; d <= days; d++) arr.push(d)
    return { cells: arr, daysInMonth: days }
  }, [year, month])

  // Map day-of-month → events[]  (only for the current year+month)
  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      // Parse date as local to avoid UTC-offset shifting
      const [evYear, evMonth, evDay] = ev.date.split('-').map(Number)
      if (evYear === year && evMonth - 1 === month) {
        if (!map[evDay]) map[evDay] = []
        map[evDay].push(ev)
      }
    })
    return map
  }, [events, year, month])

  // Agenda: only days that have at least one event
  const agendaDays = useMemo(() => {
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      if (eventsByDay[d]?.length) days.push(d)
    }
    return days
  }, [eventsByDay, daysInMonth])

  const isToday  = (day) => toDateStr(year, month, day) === TODAY
  const weekday  = (day) => new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'short' })

  return (
    <div className={styles.calendarRoot}>
      {showViewToggle && (
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'grid' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'agenda' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
        </div>
      )}

      {view === 'grid' ? (
        <div className={styles.calGrid}>
          {DAY_HEADERS_SHORT.map(h => (
            <div key={h} className={styles.calDayHeader}>{h}</div>
          ))}

          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`pad-${idx}`} className={`${styles.calCell} ${styles.calCellEmpty}`} />
            }

            const dayEvents = eventsByDay[day] || []
            const shown     = dayEvents.slice(0, maxEventsPerDay)
            const overflow  = dayEvents.length - shown.length

            return (
              <div
                key={day}
                className={`${styles.calCell} ${isToday(day) ? styles.calCellToday : ''}`}
              >
                <div className={`${styles.dayNum} ${isToday(day) ? styles.dayNumToday : ''}`}>
                  {day}
                </div>

                {shown.map(ev => (
                  <CalendarEvent
                    key={ev.id}
                    event={ev}
                    compact
                    onClick={onEventClick}
                  />
                ))}

                {overflow > 0 && (
                  <div className={styles.overflow}>+{overflow} more</div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={styles.agendaList}>
          {agendaDays.length === 0 ? (
            <div className={styles.emptyState}>No events scheduled this month.</div>
          ) : (
            agendaDays.map(day => (
              <div key={day} className={styles.agendaDay}>
                <div className={`${styles.agendaDayLabel} ${isToday(day) ? styles.agendaDayLabelToday : ''}`}>
                  <span className={styles.agendaDayNum}>{day}</span>
                  <span className={styles.agendaDayName}>{weekday(day)}</span>
                </div>
                <div className={styles.agendaEvents}>
                  {eventsByDay[day].map(ev => (
                    <CalendarEvent
                      key={ev.id}
                      event={ev}
                      compact={false}
                      onClick={onEventClick}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
