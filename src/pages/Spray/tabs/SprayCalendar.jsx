import { useState, useMemo } from 'react'
import { SPRAY_EVENTS, TYPE_COLORS } from '../../../data/spray'
import styles from '../Spray.module.css'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function SprayCalendar() {
  const [year, setYear]   = useState(2026)
  const [month, setMonth] = useState(4) // 0-indexed — May = 4

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const { cells, eventsByDay } = useMemo(() => {
    // First day of month: getDay() returns 0=Sun…6=Sat → convert to Mon=0…Sun=6
    const rawFirst  = new Date(year, month, 1).getDay()
    const offset    = (rawFirst + 6) % 7
    const daysTotal = new Date(year, month + 1, 0).getDate()

    const grid = [
      ...Array(offset).fill(null),
      ...Array.from({ length: daysTotal }, (_, i) => i + 1),
    ]

    const byDay = {}
    SPRAY_EVENTS.forEach(e => {
      const [ey, em, ed] = e.date.split('-').map(Number)
      if (ey === year && em - 1 === month) {
        if (!byDay[ed]) byDay[ed] = []
        byDay[ed].push(e)
      }
    })

    return { cells: grid, eventsByDay: byDay }
  }, [year, month])

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDate = today.getDate()

  return (
    <div className={styles.tabContent}>

      {/* Header */}
      <div className={styles.calendarWrap}>
        <div className={styles.calendarHeader}>
          <button className={styles.calendarNavBtn} onClick={prevMonth}>‹ Prev</button>
          <span className={styles.calendarTitle}>{MONTH_NAMES[month]} {year}</span>
          <button className={styles.calendarNavBtn} onClick={nextMonth}>Next ›</button>
        </div>

        {/* Legend */}
        <div className={styles.calendarLegend}>
          {Object.entries(TYPE_COLORS).map(([type, colors]) => (
            <div key={type} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: colors.text }} />
              {type}
            </div>
          ))}
          <div className={styles.legendItem} style={{ marginLeft: 8 }}>
            <span className={styles.legendDot} style={{ background: 'var(--color-accent)', opacity: 1 }} />
            Completed
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: 'var(--color-text-muted)', opacity: 0.4 }} />
            Planned
          </div>
        </div>

        {/* Calendar grid */}
        <div className={styles.calendarScrollWrap}>
          <div className={styles.calendarGrid}>
            {DAY_HEADERS.map(d => (
              <div key={d} className={styles.dayHeader}>{d}</div>
            ))}
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className={`${styles.dayCell} ${styles.dayCellEmpty}`} />
              }
              const isToday = isCurrentMonth && day === todayDate
              const events  = eventsByDay[day] || []
              return (
                <div key={day} className={`${styles.dayCell} ${isToday ? styles.dayToday : ''}`}>
                  <span className={styles.dayNum}>{day}</span>
                  <div className={styles.dayEvents}>
                    {events.map(e => {
                      const colors = TYPE_COLORS[e.type] || {}
                      return (
                        <div
                          key={e.id}
                          className={`${styles.eventPill} ${e.status === 'planned' ? styles.eventPlanned : ''}`}
                          style={{
                            background:   colors.bg,
                            color:        colors.text,
                            borderColor:  colors.border,
                          }}
                          title={`${e.product} — ${e.area}${e.applicator ? ` (${e.applicator})` : ''}`}
                        >
                          {e.product}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
