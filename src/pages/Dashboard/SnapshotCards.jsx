// Audit R2 — replace the 4 static dashboard placeholder cards with live,
// course-scoped data. Each card reads an existing store (no new fetches,
// no schema change) and degrades to an honest empty state.
//
//   CrewStatusCard        → today's crew assignments
//   EquipmentAlertsCard   → overdue / critical-open service items
//   UpcomingApplicationsCard → planned spray applications
//   RecentNotesCard       → active daily briefing notes

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useCalendarData } from '../../utils/calendar/calendarStore'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useOperationsNotesData } from '../../utils/operations/notesStore'
import styles from './SnapshotCards.module.css'

const todayIso = () => new Date().toISOString().slice(0, 10)

// ── Crew Status ─────────────────────────────────────────────────────────────
// Counts crew assigned to today's calendar events (assignments link to
// events via calendarEventId, not a date field).
export function CrewStatusCard() {
  const navigate = useNavigate()
  const { crewAssignments = [] } = useAssignmentsData()
  const { events = [] }          = useCalendarData()

  const { assigned, names } = useMemo(() => {
    const today = todayIso()
    const todayEventIds = new Set(
      events.filter(e => (e.startDate ?? e.date) === today).map(e => e.id),
    )
    const live = crewAssignments.filter(
      a => a.status !== 'cancelled' && a.calendarEventId && todayEventIds.has(a.calendarEventId),
    )
    const uniq = new Set(live.map(a => a.employeeId || a.employeeName).filter(Boolean))
    const names = [...new Set(live.map(a => a.employeeName).filter(Boolean))].slice(0, 6)
    return { assigned: uniq.size, names }
  }, [crewAssignments, events])

  if (assigned === 0) {
    return <p className={styles.empty}>No crew assigned today yet.</p>
  }
  return (
    <button type="button" className={styles.clickable} onClick={() => navigate('/crew')}>
      <span className={styles.bigStat}>{assigned}</span>
      <span className={styles.statLabel}>assigned today</span>
      {names.length > 0 && <span className={styles.subList}>{names.join(' · ')}</span>}
    </button>
  )
}

// ── Equipment Alerts ─────────────────────────────────────────────────────────
// Overdue service items, or open + critical-priority ones.
export function EquipmentAlertsCard() {
  const navigate = useNavigate()
  const { serviceLog = [] } = useEquipmentData()

  const flagged = useMemo(
    () => serviceLog.filter(
      l => l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical'),
    ),
    [serviceLog],
  )

  if (flagged.length === 0) {
    return <p className={styles.empty}>All equipment service up to date.</p>
  }
  return (
    <button type="button" className={styles.clickable} onClick={() => navigate('/equipment')}>
      <span className={`${styles.bigStat} ${styles.warn}`}>{flagged.length}</span>
      <span className={styles.statLabel}>need{flagged.length === 1 ? 's' : ''} attention</span>
      <span className={styles.subList}>
        {flagged.slice(0, 3).map(l => l.title || l.equipmentName || 'service item').join(' · ')}
      </span>
    </button>
  )
}

// ── Upcoming Applications ──────────────────────────────────────────────────
// Planned (non-completed, non-cancelled) sprays, soonest first.
export function UpcomingApplicationsCard() {
  const navigate = useNavigate()
  const { records: sprays = [] } = useSpraysData()

  const planned = useMemo(() => {
    const today = todayIso()
    return sprays
      .filter(s => s.status === 'planned' && (s.date ?? '') >= today)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .slice(0, 4)
  }, [sprays])

  if (planned.length === 0) {
    return <p className={styles.empty}>No applications scheduled.</p>
  }
  return (
    <ul className={styles.list}>
      {planned.map(s => (
        <li key={s.id} className={styles.row}>
          <button type="button" className={styles.rowBtn} onClick={() => navigate('/spray')}>
            <span className={styles.rowName}>
              {s.applicationName || s.products?.[0]?.name || s.area || 'Spray'}
            </span>
            <span className={styles.rowMeta}>{s.date}{s.area ? ` · ${s.area}` : ''}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Recent Notes ─────────────────────────────────────────────────────────────
// Active daily briefing notes (pinned first), newest first.
export function RecentNotesCard() {
  const navigate = useNavigate()
  const { notes = [] } = useOperationsNotesData()

  const recent = useMemo(
    () => (notes ?? [])
      .filter(n => n.status === 'active')
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
      .slice(0, 3),
    [notes],
  )

  if (recent.length === 0) {
    return <p className={styles.empty}>No briefing notes posted.</p>
  }
  return (
    <ul className={styles.list}>
      {recent.map(n => (
        <li key={n.id} className={styles.row}>
          <button type="button" className={styles.rowBtn} onClick={() => navigate('/crew')}>
            <span className={styles.rowName}>
              {n.pinned && '📌 '}{n.title || (n.body ?? '').split('\n')[0].slice(0, 50)}
            </span>
            {n.priority && n.priority !== 'routine' && (
              <span className={styles.rowTag} data-priority={n.priority}>{n.priority}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
