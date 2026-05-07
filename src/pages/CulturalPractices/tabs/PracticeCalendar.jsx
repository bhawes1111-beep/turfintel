import { useState } from 'react'
import { CALENDAR_EVENTS, PRACTICE_COLORS } from '../../../data/culturalPractices'
import { CalendarGrid, MonthNavigation } from '../../../components/shared/calendar'

const PRACTICE_LABELS = {
  aerification: 'Aerification',
  topdressing:  'Topdressing',
  verticutting: 'Verticutting',
  rolling:      'Rolling',
  mowing:       'Mowing',
  other:        'Other',
}

// Map cultural practice events → shared calendar event structure.
// Preserve PRACTICE_COLORS per practice type via color override field.
// category shows in agenda card meta; title comes from the existing label field.
const MAPPED_EVENTS = CALENDAR_EVENTS.map(ev => ({
  id:       ev.id,
  title:    ev.label,
  type:     'cultural',
  category: PRACTICE_LABELS[ev.practice] ?? ev.practice,
  date:     ev.date,
  status:   ev.status,
  color:    PRACTICE_COLORS[ev.practice] ?? PRACTICE_COLORS.other,
}))

export default function PracticeCalendar() {
  const [year, setYear]   = useState(2026)
  const [month, setMonth] = useState(4) // May

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Practice-specific type legend — preserved from original */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {Object.entries(PRACTICE_COLORS).map(([key, color]) => (
          <div
            key={key}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {PRACTICE_LABELS[key] ?? key}
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
        events={MAPPED_EVENTS}
        year={year}
        month={month}
        maxEventsPerDay={3}
      />

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
        Faded pills = planned. Solid pills = completed. Calendar integration coming in a future update.
      </p>
    </div>
  )
}
