import { useState, useMemo } from 'react'
import styles from '../CulturalPractices.module.css'
import { CALENDAR_EVENTS, PRACTICE_COLORS } from '../../../data/culturalPractices'

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRACTICE_LABELS = {
  aerification: 'Aerification',
  topdressing:  'Topdressing',
  verticutting: 'Verticutting',
  rolling:      'Rolling',
  mowing:       'Mowing',
  other:        'Other',
}

export default function PracticeCalendar() {
  const today = new Date(2026, 4, 7) // May 7, 2026
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const { cells, monthLabel } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startOffset = (firstDay.getDay() + 6) % 7 // Mon-first

    const label = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const cellArr = []
    for (let i = 0; i < startOffset; i++) cellArr.push(null)
    for (let d = 1; d <= daysInMonth; d++) cellArr.push(d)

    return { cells: cellArr, monthLabel: label }
  }, [year, month])

  const eventsByDay = useMemo(() => {
    const map = {}
    CALENDAR_EVENTS.forEach(ev => {
      const d = new Date(ev.date)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(ev)
      }
    })
    return map
  }, [year, month])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarNav}>
        <button className={styles.calNavBtn} onClick={prevMonth}>‹</button>
        <div className={styles.calendarMonthTitle}>{monthLabel}</div>
        <button className={styles.calNavBtn} onClick={nextMonth}>›</button>
      </div>

      <div className={styles.calLegend}>
        {Object.entries(PRACTICE_COLORS).map(([key, color]) => (
          <div key={key} className={styles.calLegendItem}>
            <div className={styles.calLegendDot} style={{ background: color }} />
            {PRACTICE_LABELS[key]}
          </div>
        ))}
        <div className={styles.calLegendItem} style={{ marginLeft: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, border: '1px solid var(--color-border)', background: 'var(--color-card)', opacity: 0.65 }} />
          Planned
        </div>
      </div>

      <div className={styles.calGrid}>
        {DAY_HEADERS.map(h => (
          <div key={h} className={styles.calDayHeader}>{h}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className={`${styles.calCell} ${styles.empty}`} />
          const dayEvents = eventsByDay[day] || []
          return (
            <div
              key={day}
              className={`${styles.calCell} ${isToday(day) ? styles.today : ''}`}
            >
              <div className={`${styles.calDayNum} ${isToday(day) ? styles.today : ''}`}>{day}</div>
              {dayEvents.slice(0, 3).map(ev => (
                <div
                  key={ev.id}
                  className={`${styles.calPill} ${ev.status === 'planned' ? styles.planned : ''}`}
                  style={{ background: PRACTICE_COLORS[ev.practice] || '#888' }}
                  title={ev.label}
                >
                  {ev.label}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div style={{ fontSize: 9, color: 'var(--color-text-muted)', paddingLeft: 2 }}>
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
        Faded pills = planned. Solid pills = completed. Calendar integration coming in a future update.
      </p>
    </div>
  )
}
