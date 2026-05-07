import { useState } from 'react'
import { SPRAY_EVENTS, TYPE_COLORS } from '../../../data/spray'
import { CalendarGrid, MonthNavigation } from '../../../components/shared/calendar'
import styles from '../Spray.module.css'

// Map spray events → shared calendar event structure.
// Color is pulled from TYPE_COLORS so spray-specific palette is preserved.
// category + course appear in agenda card meta rows.
const CALENDAR_EVENTS = SPRAY_EVENTS.map(e => ({
  id:       e.id,
  title:    e.product,
  type:     'spray',
  category: e.type,
  date:     e.date,
  status:   e.status,
  course:   e.area,
  color:    TYPE_COLORS[e.type]?.text,
}))

export default function SprayCalendar() {
  const [year, setYear]   = useState(2026)
  const [month, setMonth] = useState(4) // May = 4

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className={styles.tabContent}>

      {/* Spray-specific type legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {Object.entries(TYPE_COLORS).map(([type, colors]) => (
          <div
            key={type}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-muted)' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.text, flexShrink: 0 }} />
            {type}
          </div>
        ))}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
          color: 'var(--color-text-muted)', marginLeft: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--color-border)', background: 'var(--color-card)', opacity: 0.65,
          }} />
          Planned (faded)
        </div>
      </div>

      <MonthNavigation year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />

      <CalendarGrid
        events={CALENDAR_EVENTS}
        year={year}
        month={month}
        maxEventsPerDay={4}
      />

    </div>
  )
}
