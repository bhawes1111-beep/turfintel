// CrewAssignments — assignments vertical read-side + Phase 10 linker.
//
// Surfaces persistent crew_assignments + equipment_reservations alongside
// the calendar_events they belong to. Morning-meeting view: today's
// crew, today's equipment, what's unassigned, where pressure is building.
//
// Phase 10 adds an inline linker per equipment reservation so a
// supervisor can tie a specific machine to a specific operator on the
// same event (e.g. GTX 3 → Carlos). The Display Board then renders the
// chip next to that employee instead of at the task level.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssignmentsData } from '../../../utils/assignments/assignmentsStore'
import { useCalendarData } from '../../../utils/calendar/calendarStore'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import { useCrewData } from '../../../utils/crew/crewStore'
import StatusBoard from '../../../components/primitives/StatusBoard'
import { EmptyState } from '../../../components/shared/EmptyState'
import DailyAssignmentBoard from './DailyAssignmentBoard'
import styles from './CrewAssignments.module.css'

const TODAY    = new Date().toISOString().slice(0, 10)
const HORIZON  = 7  // days of look-ahead for "upcoming pressure"

// Event types that imply equipment is required. Used by the conflict
// detector — if a crew is assigned to one of these but no equipment is
// reserved, we flag it as pressure (not a hard error).
const EQUIPMENT_IMPLYING_TYPES = new Set(['spray', 'maintenance', 'irrigation'])

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtTimeRange(start, end) {
  if (!start && !end) return ''
  if (start && !end)  return start
  if (!start && end)  return `– ${end}`
  return `${start} – ${end}`
}

function groupBy(items, key) {
  const map = new Map()
  for (const item of items) {
    const k = item[key] ?? '__unlinked__'
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(item)
  }
  return map
}

// ── Component ────────────────────────────────────────────────────────────

export default function CrewAssignments() {
  const navigate                                      = useNavigate()
  const { crewAssignments, equipmentReservations, loading } = useAssignmentsData()
  const { events: calendarEvents }                    = useCalendarData()
  const { equipment }                                 = useEquipmentData()
  const { employees }                                 = useCrewData()

  const horizonEnd = useMemo(() => addDays(TODAY, HORIZON), [])

  // ── Index calendar events by id for fast join. ──────────────────────────
  const eventsById = useMemo(() => {
    const map = new Map()
    calendarEvents.forEach(e => map.set(e.id, e))
    return map
  }, [calendarEvents])

  const equipmentByName = useMemo(() => {
    const map = new Map()
    equipment.forEach(e => map.set(e.name, e))
    return map
  }, [equipment])

  // ── Employee join (Phase 5.6c) ─────────────────────────────────────────
  // Prefer assignment.employeeId; fall back to assignment.employeeName.
  // Legacy rows written before Phase 5.6b carry employeeId=null and are
  // resolved by name only. The Worker mapper returns both id+employeeId
  // and name+fullName aliases, so the maps key on either side.
  const employeesById = useMemo(() => {
    const map = new Map()
    employees.forEach(e => map.set(e.id, e))
    return map
  }, [employees])

  const employeesByName = useMemo(() => {
    const map = new Map()
    employees.forEach(e => map.set(e.name, e))
    return map
  }, [employees])

  function resolveEmployee(assignment) {
    return (assignment.employeeId && employeesById.get(assignment.employeeId))
        || employeesByName.get(assignment.employeeName)
        || null
  }

  // ── Bucket events by date relative to TODAY. ────────────────────────────
  const { todaysEvents, upcomingEvents } = useMemo(() => {
    const today    = []
    const upcoming = []
    for (const e of calendarEvents) {
      const d = e.startDate ?? e.date
      if (!d) continue
      if (d === TODAY)                      today.push(e)
      else if (d > TODAY && d <= horizonEnd) upcoming.push(e)
    }
    // Stable date+title ordering.
    const sortFn = (a, b) => (a.startDate ?? a.date).localeCompare(b.startDate ?? b.date)
                          || (a.title ?? '').localeCompare(b.title ?? '')
    return { todaysEvents: today.sort(sortFn), upcomingEvents: upcoming.sort(sortFn) }
  }, [calendarEvents, horizonEnd])

  // ── Group assignments + reservations by calendar_event_id. ──────────────
  const assignmentsByEvent  = useMemo(() => groupBy(crewAssignments, 'calendarEventId'), [crewAssignments])
  const reservationsByEvent = useMemo(() => groupBy(equipmentReservations, 'calendarEventId'), [equipmentReservations])

  // ── Summary stats. ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const todayIds = new Set(todaysEvents.map(e => e.id))
    const todayAssignmentCount = crewAssignments.filter(a =>
      a.calendarEventId && todayIds.has(a.calendarEventId) && a.status !== 'cancelled',
    ).length
    const todayReservationCount = equipmentReservations.filter(r =>
      r.calendarEventId && todayIds.has(r.calendarEventId) && r.status !== 'cancelled',
    ).length
    const upcomingIds = new Set(upcomingEvents.map(e => e.id))
    const upcomingReservationCount = equipmentReservations.filter(r =>
      r.calendarEventId && upcomingIds.has(r.calendarEventId) && r.status !== 'cancelled',
    ).length
    const upcomingAssignmentCount = crewAssignments.filter(a =>
      a.calendarEventId && upcomingIds.has(a.calendarEventId) && a.status !== 'cancelled',
    ).length
    return {
      todayAssignments:    todayAssignmentCount,
      todayReservations:   todayReservationCount,
      upcomingAssignments: upcomingAssignmentCount,
      upcomingReservations:upcomingReservationCount,
    }
  }, [todaysEvents, upcomingEvents, crewAssignments, equipmentReservations])

  // ── Section C: unassigned operational events. ──────────────────────────
  // Today's events that have no crew assignment, or that imply equipment
  // but have no reservation. Pulls from today + look-ahead horizon so the
  // morning meeting can spot tomorrow's gaps too.
  const unassignedItems = useMemo(() => {
    const out = []
    const candidates = [...todaysEvents, ...upcomingEvents]
    for (const e of candidates) {
      const hasCrew      = (assignmentsByEvent.get(e.id) ?? []).some(a => a.status !== 'cancelled')
      const hasEquipment = (reservationsByEvent.get(e.id) ?? []).some(r => r.status !== 'cancelled')
      const needsEquipment = EQUIPMENT_IMPLYING_TYPES.has(e.eventType ?? e.category)
      const gaps = []
      if (!hasCrew)                       gaps.push('no crew')
      if (needsEquipment && !hasEquipment) gaps.push('no equipment')
      if (gaps.length > 0) out.push({ event: e, gaps })
    }
    return out
  }, [todaysEvents, upcomingEvents, assignmentsByEvent, reservationsByEvent])

  // ── Section D: pressure signals. ────────────────────────────────────────
  // 1. Same equipment reserved by two events on the same date.
  // 2. Reservation links to a calendar event that no longer exists.
  // 3. Equipment reserved is out-of-service in the equipment vertical.
  const pressureSignals = useMemo(() => {
    const signals = []

    // (1) Equipment double-booking — group active reservations by
    //     (equipment_name, event_date) and flag any group of 2+.
    const dateByEvent = new Map(calendarEvents.map(e => [e.id, e.startDate ?? e.date]))
    const buckets = new Map()
    for (const r of equipmentReservations) {
      if (r.status === 'cancelled' || r.status === 'released') continue
      const d = dateByEvent.get(r.calendarEventId)
      if (!d || d < TODAY || d > horizonEnd) continue
      const key = `${r.equipmentName}::${d}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(r)
    }
    for (const [key, reservations] of buckets.entries()) {
      if (reservations.length < 2) continue
      const [equipmentName, date] = key.split('::')
      signals.push({
        id:       `dbl-${key}`,
        severity: 'critical',
        icon:     '⚠️',
        text:     `${equipmentName} double-booked on ${fmtDate(date)} (${reservations.length} reservations)`,
        eventIds: reservations.map(r => r.calendarEventId).filter(Boolean),
      })
    }

    // (2) Orphaned reservations — point to an event id that no longer
    //     exists. Surfaces stale data from before/after schema migrations.
    for (const r of equipmentReservations) {
      if (r.status === 'cancelled') continue
      if (r.calendarEventId && !eventsById.has(r.calendarEventId)) {
        signals.push({
          id:       `orphan-res-${r.id}`,
          severity: 'warning',
          icon:     '🔗',
          text:     `${r.equipmentName} reserved against missing event ${r.calendarEventId}`,
          eventIds: [],
        })
      }
    }
    for (const a of crewAssignments) {
      if (a.status === 'cancelled') continue
      if (a.calendarEventId && !eventsById.has(a.calendarEventId)) {
        signals.push({
          id:       `orphan-crew-${a.id}`,
          severity: 'warning',
          icon:     '🔗',
          text:     `${a.employeeName} assigned against missing event ${a.calendarEventId}`,
          eventIds: [],
        })
      }
    }

    // (3) Reserved equipment that is currently out-of-service in the
    //     equipment vertical. Read-only — operator's call to swap rigs.
    const seenOos = new Set()
    for (const r of equipmentReservations) {
      if (r.status === 'cancelled' || r.status === 'released') continue
      const eq = equipmentByName.get(r.equipmentName)
      if (eq?.status === 'out-of-service' && !seenOos.has(r.equipmentName)) {
        seenOos.add(r.equipmentName)
        signals.push({
          id:       `oos-${r.equipmentName}`,
          severity: 'warning',
          icon:     '🔒',
          text:     `${r.equipmentName} is out-of-service but has active reservations`,
          eventIds: [],
        })
      }
    }

    return signals.sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 }
      return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)
    })
  }, [calendarEvents, equipmentReservations, crewAssignments, eventsById, equipmentByName, horizonEnd])

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.tabContent}>
        <EmptyState compact title="Loading assignments…" description="" />
      </div>
    )
  }

  const hasAnyData =
    crewAssignments.length > 0 ||
    equipmentReservations.length > 0

  return (
    <div className={styles.tabContent}>

      {/* Summary stats */}
      <StatusBoard columns={4}>
        <StatusBoard.Tile
          value={stats.todayAssignments}
          label="Crew Assigned Today"
          tone={stats.todayAssignments > 0 ? 'ok' : 'neutral'}
        />
        <StatusBoard.Tile
          value={stats.todayReservations}
          label="Equipment Reserved Today"
          tone={stats.todayReservations > 0 ? 'ok' : 'neutral'}
        />
        <StatusBoard.Tile
          value={stats.upcomingAssignments}
          label={`Upcoming Crew (${HORIZON}d)`}
          tone="info"
        />
        <StatusBoard.Tile
          value={pressureSignals.length}
          label="Pressure Signals"
          tone={pressureSignals.length > 0 ? 'warn' : 'ok'}
        />
      </StatusBoard>

      {!hasAnyData && (
        <EmptyState
          title="No crew or equipment data yet."
          description="Assignments and reservations created from MaintenanceLogs and other workflows will appear here for morning planning."
        />
      )}

      {/* ── Phase 11 — Daily Assignment Board (employee-first) ── */}
      <DailyAssignmentBoard
        employees={employees}
        events={calendarEvents}
        crewAssignments={crewAssignments}
        equipmentReservations={equipmentReservations}
        equipment={equipment}
      />


      {/* ── C. Unassigned Operational Events ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Unassigned Events</h3>
          <span className={styles.sectionMeta}>Needs crew or equipment</span>
        </header>
        {unassignedItems.length === 0 ? (
          <EmptyState
            compact
            title="Every near-term event has crew + equipment coverage."
            description="Events without assignments or required equipment will surface here."
          />
        ) : (
          <ul className={styles.gapList}>
            {unassignedItems.map(({ event, gaps }) => (
              <li key={event.id} className={styles.gapRow}>
                <span className={styles.gapDate}>{fmtDate(event.startDate ?? event.date)}</span>
                <span className={styles.gapTitle}>{event.title}</span>
                <span className={styles.gapType}>{event.eventType ?? event.category}</span>
                <span className={styles.gapBadges}>
                  {gaps.map(g => (
                    <span key={g} className={styles.gapBadge} data-gap={g.replace(' ', '-')}>{g}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── D. Pressure Signals ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Pressure Signals</h3>
          <span className={styles.sectionMeta}>Conflicts &amp; drift</span>
        </header>
        {pressureSignals.length === 0 ? (
          <EmptyState
            compact
            title="No conflicts detected."
            description="Double-bookings and orphaned records will appear here as they arise."
          />
        ) : (
          <ul className={styles.signalList}>
            {pressureSignals.map(s => (
              <li key={s.id} className={styles.signalRow} data-severity={s.severity}>
                <span className={styles.signalIcon}>{s.icon}</span>
                <span className={styles.signalText}>{s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}
