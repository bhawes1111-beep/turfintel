// Phase 6A.2 — Crew Readiness card.
//
// Composes today's assignment count with the active-crew total so the
// superintendent can tell at a glance "are we staffed?" without
// opening Operations. Reuses existing stores — no schema, no new state.
//
// Numbers: assigned / unassigned / active. Mirrors the same calc the
// Morning Brief uses in crewSnapshot (kept in sync by reading the
// same stores, not by cloning logic).

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useCalendarData }    from '../../utils/calendar/calendarStore'
import { useCrewData }        from '../../utils/crew/crewStore'
import styles from './SnapshotCards.module.css'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function CrewReadiness() {
  const navigate                          = useNavigate()
  const { crewAssignments = [] }          = useAssignmentsData()
  const { events = [] }                   = useCalendarData()
  const { employees: crew = [] }          = useCrewData()

  const { assigned, unassigned, active, names } = useMemo(() => {
    const today = todayIso()
    const todayEventIds = new Set(
      events.filter(e => (e.startDate ?? e.date) === today).map(e => e.id),
    )
    const live = crewAssignments.filter(
      a => a.status !== 'cancelled' && a.calendarEventId && todayEventIds.has(a.calendarEventId),
    )
    const assignedIds = new Set(live.map(a => a.employeeId || a.employeeName).filter(Boolean))
    const activeCrew  = crew.filter(e => e?.status !== 'inactive')
    const namesList   = [...new Set(live.map(a => a.employeeName).filter(Boolean))].slice(0, 6)
    return {
      assigned:   assignedIds.size,
      unassigned: Math.max(0, activeCrew.length - assignedIds.size),
      active:     activeCrew.length,
      names:      namesList,
    }
  }, [crewAssignments, events, crew])

  if (active === 0) {
    return <p className={styles.empty}>No active crew on file.</p>
  }
  if (assigned === 0) {
    return (
      <button type="button" className={styles.clickable} onClick={() => navigate('/crew')}>
        <span className={`${styles.bigStat} ${styles.warn}`}>0</span>
        <span className={styles.statLabel}>assigned · {unassigned} unassigned of {active} active</span>
      </button>
    )
  }
  return (
    <button type="button" className={styles.clickable} onClick={() => navigate('/crew')}>
      <span className={styles.bigStat}>{assigned}</span>
      <span className={styles.statLabel}>assigned · {unassigned} unassigned of {active} active</span>
      {names.length > 0 && <span className={styles.subList}>{names.join(' · ')}</span>}
    </button>
  )
}
