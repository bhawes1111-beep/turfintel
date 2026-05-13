// Phase 11 — Daily Assignment Board (employee-first workflow).
//
// Replaces the task-first sections of CrewAssignments. Morning workflow:
//   1. Show the day's employees (scheduled, with active fallback).
//   2. Each row has a task dropdown — pick what the operator is doing.
//   3. The Equipment button opens a modal listing course equipment
//      with derived status; the supervisor links machines to the row.
//
// No new schema. Reuses the Phase 10 crew_assignment_id linkage to
// surface chips next to the operator on the Display Board.

import { useMemo, useState } from 'react'
import {
  createCrewAssignment,
  deleteCrewAssignment,
  patchEquipmentReservation,
} from '../../../utils/assignments/assignmentsStore'
import { useToast } from '../../../utils/feedback/toastContext'
import EquipmentPickerModal from './EquipmentPickerModal'
import TasksManagerModal from './TasksManagerModal'
import styles from './DailyAssignmentBoard.module.css'

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function prettyDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  if (!Number.isFinite(hour)) return t
  const am  = hour < 12
  const h12 = ((hour + 11) % 12) + 1
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`
}

function taskOptionLabel(event) {
  const time = fmtTime(event.startTime)
  const location = event.location ? ` (${event.location})` : ''
  return time
    ? `${time} · ${event.title}${location}`
    : `${event.title}${location}`
}

export default function DailyAssignmentBoard({
  employees,
  events,
  crewAssignments,
  equipmentReservations,
  equipment,
}) {
  const toast = useToast()
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO)
  const [modalEmpId,   setModalEmpId]   = useState(null)
  const [tasksModalOpen, setTasksModalOpen] = useState(false)
  const [busyEmpId,    setBusyEmpId]    = useState(null)

  // ── Day-scoped derivations ────────────────────────────────────────────
  const dayEvents = useMemo(() => {
    return events
      .filter(e => (e.startDate ?? e.date) === selectedDate)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }, [events, selectedDate])

  const dayEventIds = useMemo(
    () => new Set(dayEvents.map(e => e.id)),
    [dayEvents],
  )

  // Scheduled employees → no persistent schedule table yet, so we
  // surface every active employee as the fallback per spec.
  const dayEmployees = useMemo(() => {
    return employees
      .filter(e => e.status === 'active' || e.status === 'on-leave')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees])

  // Index: which crew_assignment row this employee currently holds on
  // selectedDate. We only consider assignments tied to one of today's
  // events (i.e. dayEventIds), so yesterday's leftovers don't show up.
  const assignmentByEmpId = useMemo(() => {
    const m = new Map()
    for (const a of crewAssignments) {
      if (a.status === 'cancelled') continue
      if (!a.calendarEventId || !dayEventIds.has(a.calendarEventId)) continue
      const empKey = a.employeeId || a.employeeName
      if (!m.has(empKey)) m.set(empKey, a)
    }
    return m
  }, [crewAssignments, dayEventIds])

  // Index: reservations linked to a specific crew_assignment, so the
  // row can render per-operator chips inline.
  const reservationsByAssignment = useMemo(() => {
    const m = new Map()
    for (const r of equipmentReservations) {
      if (!r.crewAssignmentId) continue
      if (r.status === 'cancelled' || r.status === 'released') continue
      if (!m.has(r.crewAssignmentId)) m.set(r.crewAssignmentId, [])
      m.get(r.crewAssignmentId).push(r)
    }
    return m
  }, [equipmentReservations])

  // ── Mutations ─────────────────────────────────────────────────────────
  //
  // Clear / switch flow:
  //   1. PATCH every equipment_reservation linked to the OLD assignment
  //      to crewAssignmentId=null. Reservations stay alive at task level
  //      so the Display Board renders them in the task header via the
  //      Phase 10 fallback chain.
  //   2. DELETE the old crew_assignment.
  //   3. (switch only) CREATE the new crew_assignment for the new event.
  // Step 1 prevents stale orphan crew_assignment_ids; equipment data is
  // preserved, never deleted.
  async function unlinkReservationsFor(assignmentId) {
    const linked = (reservationsByAssignment.get(assignmentId) ?? [])
    if (linked.length === 0) return
    await Promise.allSettled(
      linked.map(r => patchEquipmentReservation(r.id, { crewAssignmentId: null }))
    )
  }

  async function handleTaskChange(emp, newEventId) {
    setBusyEmpId(emp.id)
    try {
      const existing = assignmentByEmpId.get(emp.id) ?? assignmentByEmpId.get(emp.name)
      if (newEventId === '') {
        if (existing) {
          await unlinkReservationsFor(existing.id)
          await deleteCrewAssignment(existing.id)
          toast.success(`Cleared task for ${emp.name}`)
        }
        return
      }
      if (existing && existing.calendarEventId === newEventId) return // no-op
      if (existing) {
        // Switch task: unlink reservations first (they belong to the
        // old task), then delete + create. Equipment stays on the old
        // task at the header level for the next operator to claim.
        await unlinkReservationsFor(existing.id)
        await deleteCrewAssignment(existing.id)
      }
      await createCrewAssignment({
        calendarEventId: newEventId,
        employeeId:      emp.id,
        employeeName:    emp.name,
        role:            emp.role ?? null,
        status:          'assigned',
      })
      toast.success(`${emp.name} → ${
        dayEvents.find(e => e.id === newEventId)?.title ?? 'task'
      }`)
    } catch (err) {
      toast.error(`Task update failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  function handleClear(emp) {
    return handleTaskChange(emp, '')
  }

  function openEquipmentModalFor(emp) {
    const assignment = assignmentByEmpId.get(emp.id) ?? assignmentByEmpId.get(emp.name)
    if (!assignment) {
      toast.info('Pick a task first — equipment links to a specific task.')
      return
    }
    setModalEmpId(emp.id)
  }

  const modalEmployee   = dayEmployees.find(e => e.id === modalEmpId) ?? null
  const modalAssignment = modalEmployee
    ? (assignmentByEmpId.get(modalEmployee.id) ?? assignmentByEmpId.get(modalEmployee.name))
    : null
  const modalEvent = modalAssignment
    ? dayEvents.find(ev => ev.id === modalAssignment.calendarEventId)
    : null

  // ── Render ────────────────────────────────────────────────────────────
  const isToday = selectedDate === TODAY_ISO()

  return (
    <section className={styles.section}>

      <header className={styles.sectionHeader}>
        <div className={styles.headerLeft}>
          <h3 className={styles.sectionTitle}>Daily Assignment Board</h3>
          <p className={styles.sectionHint}>
            Employee-first morning workflow · {prettyDate(selectedDate)}
          </p>
        </div>
        <div className={styles.dateNav}>
          <button
            type="button"
            className={styles.dateNavBtn}
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            aria-label="Previous day"
          >‹</button>
          <span className={styles.dateNavText}>{selectedDate}</span>
          <button
            type="button"
            className={styles.dateNavBtn}
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            aria-label="Next day"
          >›</button>
          {!isToday && (
            <button
              type="button"
              className={styles.todayBtn}
              onClick={() => setSelectedDate(TODAY_ISO())}
            >Today</button>
          )}
          <button
            type="button"
            className={styles.tasksBtn}
            onClick={() => setTasksModalOpen(true)}
            title="Add or edit the day's tasks"
          >
            Tasks ({dayEvents.length})
          </button>
        </div>
      </header>

      <div className={styles.scheduleNotice}>
        <strong>Note:</strong> Persistent daily schedules are a future
        phase. The board shows every <em>active</em> employee as a
        fallback so morning assignment works today.
      </div>

      {dayEvents.length === 0 && (
        <p className={styles.empty}>
          No tasks scheduled for {prettyDate(selectedDate)}.
          Add tasks on the Operations Board before assigning crew.
        </p>
      )}

      {dayEmployees.length === 0 ? (
        <p className={styles.empty}>
          No active employees in the roster. Hire someone in
          Employee Management to start assigning.
        </p>
      ) : (
        <table className={styles.assignTable}>
          <thead>
            <tr>
              <th>Operator</th>
              <th>Role</th>
              <th>Task</th>
              <th>Equipment</th>
              <th aria-label="Open equipment picker" />
            </tr>
          </thead>
          <tbody>
            {dayEmployees.map(emp => {
              const assignment = assignmentByEmpId.get(emp.id) ?? assignmentByEmpId.get(emp.name)
              const linkedRes  = assignment ? (reservationsByAssignment.get(assignment.id) ?? []) : []
              const rowState   = !assignment
                                 ? 'unassigned'
                                 : (linkedRes.length > 0 ? 'equipped' : 'assigned')
              const equipLabel = assignment
                ? (linkedRes.length > 0 ? `Equipment (${linkedRes.length})` : 'Equipment')
                : 'Pick task first'
              return (
                <tr
                  key={emp.id}
                  data-busy={busyEmpId === emp.id ? 'true' : undefined}
                  data-state={rowState}
                >
                  <td className={styles.cellName}>{emp.name}</td>
                  <td className={styles.cellRole}>
                    {emp.role || '—'}
                    {emp.department && <span className={styles.cellDept}> · {emp.department}</span>}
                  </td>
                  <td className={styles.taskCell}>
                    <select
                      className={styles.taskSelect}
                      value={assignment?.calendarEventId ?? ''}
                      disabled={busyEmpId === emp.id || dayEvents.length === 0}
                      onChange={e => handleTaskChange(emp, e.target.value)}
                    >
                      <option value="">— Unassigned —</option>
                      {dayEvents.map(ev => (
                        <option key={ev.id} value={ev.id}>{taskOptionLabel(ev)}</option>
                      ))}
                    </select>
                    {assignment && (
                      <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={() => handleClear(emp)}
                        disabled={busyEmpId === emp.id}
                        title="Clear task and unlink equipment"
                        aria-label={`Clear task for ${emp.name}`}
                      >×</button>
                    )}
                  </td>
                  <td>
                    {linkedRes.length > 0 ? (
                      <span className={styles.chipRow}>
                        {linkedRes.map(r => (
                          <span
                            key={r.id}
                            className={styles.chip}
                            data-status={r.status}
                            title={`${r.equipmentName} · ${r.status}`}
                          >
                            {r.equipmentName}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className={styles.chipsEmpty}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.equipBtn}
                      data-state={rowState}
                      disabled={!assignment || busyEmpId === emp.id}
                      onClick={() => openEquipmentModalFor(emp)}
                      title={assignment ? 'Assign / unassign machines' : 'Pick a task first'}
                    >
                      {equipLabel}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {modalEmployee && modalAssignment && (
        <EquipmentPickerModal
          employee={modalEmployee}
          assignment={modalAssignment}
          event={modalEvent}
          equipment={equipment}
          reservations={equipmentReservations}
          dayEventIds={dayEventIds}
          onClose={() => setModalEmpId(null)}
        />
      )}

      {tasksModalOpen && (
        <TasksManagerModal
          selectedDate={selectedDate}
          dayEvents={dayEvents}
          onClose={() => setTasksModalOpen(false)}
        />
      )}

    </section>
  )
}
