import { useState, useMemo } from 'react'
import { TYPE_COLORS } from '../../../data/spray'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { CalendarGrid, MonthNavigation } from '../../../components/shared/calendar'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Spray.module.css'

// One calendar event per spray record. Title is the joined product names;
// category/color is keyed on the first product's type so the spray-type
// palette renders correctly when a record has a single dominant type.
function recordToCalendarEvent(r) {
  const firstType = r.products[0]?.type
  return {
    id:       r.id,
    title:    r.products.map(p => p.name).join(' + ') || r.applicationName || '(unnamed)',
    type:     'spray',
    category: firstType,
    date:     r.date,
    status:   r.status,
    course:   r.area,
    color:    TYPE_COLORS[firstType]?.text,
  }
}

export default function SprayCalendar() {
  const { records } = useSpraysData()
  const CALENDAR_EVENTS = useMemo(
    () => records.filter(r => r.date).map(recordToCalendarEvent),
    [records],
  )
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
      <WorkspaceSection
        title="Spray Calendar"
        subtitle="Monthly view of completed and planned applications."
      >

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

      </WorkspaceSection>
    </div>
  )
}
