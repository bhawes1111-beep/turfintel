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
import {
  useAssignmentsData,
  patchEquipmentReservation,
} from '../../../utils/assignments/assignmentsStore'
import { useCalendarData } from '../../../utils/calendar/calendarStore'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import { useCrewData } from '../../../utils/crew/crewStore'
import { useToast } from '../../../utils/feedback/toastContext'
import StatusBoard from '../../../components/primitives/StatusBoard'
import { EmptyState } from '../../../components/shared/EmptyState'
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
  const toast                                         = useToast()
  const { crewAssignments, equipmentReservations, loading } = useAssignmentsData()
  const { events: calendarEvents }                    = useCalendarData()
  const { equipment }                                 = useEquipmentData()
  const { employees }                                 = useCrewData()

  // ── Phase 10 link / unlink ────────────────────────────────────────────
  async function linkReservation(reservationId, crewAssignmentId) {
    try {
      await patchEquipmentReservation(reservationId, {
        crewAssignmentId: crewAssignmentId || null,
      })
      toast.success(crewAssignmentId ? 'Equipment linked to operator' : 'Equipment unlinked')
    } catch (err) {
      toast.error(`Link failed: ${err.message}`)
    }
  }

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

      {/* ── A. Today's Assignments ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Today's Assignments</h3>
          <span className={styles.sectionMeta}>{fmtDate(TODAY)}</span>
        </header>
        {todaysEvents.filter(e => (assignmentsByEvent.get(e.id) ?? []).length > 0).length === 0 ? (
          <EmptyState
            compact
            title="No crew assigned for today."
            description="Assignments scheduled to today's events will appear here."
          />
        ) : (
          <div className={styles.cardList}>
            {todaysEvents.map(event => {
              const assignments = (assignmentsByEvent.get(event.id) ?? [])
                .filter(a => a.status !== 'cancelled')
              if (assignments.length === 0) return null
              return (
                <article key={event.id} className={styles.eventCard}>
                  <header className={styles.eventCardHeader}>
                    <span className={styles.eventTitle}>{event.title}</span>
                    <span className={styles.eventMeta}>
                      {event.eventType ?? event.category ?? 'event'}
                      {event.location ? ` · ${event.location}` : ''}
                      {fmtTimeRange(event.startTime, event.endTime)
                        ? ` · ${fmtTimeRange(event.startTime, event.endTime)}` : ''}
                    </span>
                  </header>
                  <ul className={styles.assignmentList}>
                    {assignments.map(a => {
                      const emp  = resolveEmployee(a)
                      const role = emp?.role ?? a.role
                      const meta = [emp?.department, emp?.assignedArea].filter(Boolean).join(' · ')
                      return (
                        <li key={a.id} className={styles.assignmentRow} data-status={a.status}>
                          <span className={styles.assignmentName}>
                            {emp?.fullName ?? a.employeeName}
                            {meta && <small className={styles.assignmentMeta}> · {meta}</small>}
                          </span>
                          {role && <span className={styles.assignmentRole}>{role}</span>}
                          <span className={styles.assignmentStatus}>{a.status}</span>
                          {a.notes && <span className={styles.assignmentNotes}>{a.notes}</span>}
                        </li>
                      )
                    })}
                  </ul>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ── B. Equipment Reservations ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Equipment Reservations</h3>
          <span className={styles.sectionMeta}>Today + next {HORIZON} days</span>
        </header>
        {(() => {
          const eventsWithReservations = [...todaysEvents, ...upcomingEvents]
            .filter(e => (reservationsByEvent.get(e.id) ?? []).some(r => r.status !== 'cancelled'))
          if (eventsWithReservations.length === 0) {
            return (
              <EmptyState
                compact
                title="No active equipment reservations."
                description="Reservations created from MaintenanceLogs or future scheduling flows will appear here."
              />
            )
          }
          return (
            <div className={styles.cardList}>
              {eventsWithReservations.map(event => {
                const reservations = (reservationsByEvent.get(event.id) ?? [])
                  .filter(r => r.status !== 'cancelled')
                const eventCrew = (assignmentsByEvent.get(event.id) ?? [])
                  .filter(a => a.status !== 'cancelled')
                return (
                  <article key={event.id} className={styles.eventCard}>
                    <header className={styles.eventCardHeader}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <span className={styles.eventMeta}>
                        {fmtDate(event.startDate ?? event.date)}
                        {event.location ? ` · ${event.location}` : ''}
                      </span>
                    </header>
                    <ul className={styles.assignmentList}>
                      {reservations.map(r => {
                        const eq = equipmentByName.get(r.equipmentName)
                        const isOos = eq?.status === 'out-of-service'
                        return (
                          <li
                            key={r.id}
                            className={styles.assignmentRow}
                            data-status={r.status}
                            data-warn={isOos ? 'true' : undefined}
                          >
                            <button
                              type="button"
                              className={styles.equipmentLink}
                              disabled={!eq}
                              onClick={() => eq && navigate('/equipment', {
                                state: { activeTab: 'Equipment List', equipmentId: eq.id },
                              })}
                              title={eq ? `${eq.name} — ${eq.status}` : r.equipmentName}
                            >
                              {isOos && '🔒 '}
                              {r.equipmentName}
                            </button>
                            <span className={styles.assignmentStatus}>{r.status}</span>

                            {/* Phase 10 — link reservation to a specific crew row */}
                            {eventCrew.length > 0 ? (
                              <select
                                className={styles.operatorLink}
                                value={r.crewAssignmentId ?? ''}
                                onChange={e => linkReservation(r.id, e.target.value)}
                                title="Link to a specific operator on this event"
                              >
                                <option value="">— Operator —</option>
                                {eventCrew.map(a => {
                                  const emp = resolveEmployee(a)
                                  return (
                                    <option key={a.id} value={a.id}>
                                      {emp?.fullName ?? a.employeeName}
                                    </option>
                                  )
                                })}
                              </select>
                            ) : (
                              <span className={styles.operatorHint}>
                                Add crew to assign operator
                              </span>
                            )}

                            {r.notes && <span className={styles.assignmentNotes}>{r.notes}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                )
              })}
            </div>
          )
        })()}
      </section>

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
