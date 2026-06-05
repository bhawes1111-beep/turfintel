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
  patchCrewAssignment,
  createEquipmentReservation,
  patchEquipmentReservation,
} from '../../../utils/assignments/assignmentsStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import { useSelectedCourseId } from '../../../utils/courses/courseStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { useEmployeeSchedulesData } from '../../../utils/schedules/schedulesStore'
import EquipmentPickerModal from './EquipmentPickerModal'
import TasksManagerModal from './TasksManagerModal'
import styles from './DailyAssignmentBoard.module.css'

// Phase 8A.3a — Crosswinds-only Notes + Status per assignment row.
// The crew_assignments table already carries `notes` and `status`
// columns; this slice just surfaces them in the UI. Status options
// match the TaskTracker vocabulary the user requested. Legacy
// 'assigned' rows render as 'pending' until a steward chooses a
// new value (no DB rewrite). UI-only; no schema, no worker, no
// DisplayBoard change.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const ASSIGNMENT_STATUS_OPTIONS = ['pending', 'in-progress', 'complete', 'blocked']
const ASSIGNMENT_STATUS_DEFAULT = 'pending'

function normalizeAssignmentStatus(raw) {
  if (raw === 'assigned' || raw == null || raw === '') return ASSIGNMENT_STATUS_DEFAULT
  if (ASSIGNMENT_STATUS_OPTIONS.includes(raw)) return raw
  return ASSIGNMENT_STATUS_DEFAULT
}

// Phase 8A.3c — Crosswinds-only curated task list. The dropdown
// shows these names instead of forcing the supervisor through the
// full 6-field TasksManagerModal. Selecting a name looks up an
// existing crew-type calendar_event for the day or silently creates
// one via the existing dedupe-friendly createCalendarEvent path.
// No new schema; reuses sourceModule + sourceId for idempotency.
const CROSSWINDS_TASK_LIST = [
  'Mow Greens',
  'Roll Greens',
  'Course Setup',
  'Bunkers',
  'Spray',
  'Hand Water',
  'Irrigation',
  'Detail Work',
  'Mow Tees',
  'Mow Fairways',
  'Mow Rough',
  'Cups',
  'Cleanup',
  'Project Work',
]

function slug(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

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

// ── Quick-assign category patterns ────────────────────────────────────
// Heuristic title-matching keeps us schema-free: real-world task names
// like "Mow Greens 1-9", "Rake Bunkers Front", "Hand Water Fairways"
// all fall into these buckets by keyword. Spray is also event-type-aware
// so a "Tribute Total" spray task without the word "spray" still
// matches. 'misc' is the catch-all for tasks none of the above caught.
const QUICK_CATEGORIES = [
  { key: 'greens',   label: 'Greens',   pattern: /\bgreen/i },
  { key: 'tees',     label: 'Tees',     pattern: /\btee/i },
  { key: 'fairways', label: 'Fairways', pattern: /\bfairway|\bfwy\b/i },
  { key: 'setup',    label: 'Setup',    pattern: /setup|cup|flag|pin|hole change/i },
  { key: 'bunkers',  label: 'Bunkers',  pattern: /bunker|sand|rake/i },
  { key: 'detail',   label: 'Detail',   pattern: /detail|trim|edge|weed|blow\b/i },
  { key: 'spray',    label: 'Spray',    pattern: /spray|apply|chem/i },
  { key: 'misc',     label: 'Misc',     pattern: null },
]

function eventMatchesCategory(event, key) {
  if (!key) return true
  const cat = QUICK_CATEGORIES.find(c => c.key === key)
  if (!cat) return true
  if (cat.pattern) {
    if (cat.pattern.test(event.title ?? '')) return true
    if (key === 'spray' && event.eventType === 'spray') return true
    return false
  }
  // 'misc' = doesn't match any specific category
  const matchedAnySpecific = QUICK_CATEGORIES
    .filter(c => c.pattern)
    .some(c =>
      c.pattern.test(event.title ?? '')
      || (c.key === 'spray' && event.eventType === 'spray'),
    )
  return !matchedAnySpecific
}

export default function DailyAssignmentBoard({
  employees,
  events,
  crewAssignments,
  equipmentReservations,
  equipment,
}) {
  const toast = useToast()
  const { schedules: weeklySchedules } = useEmployeeSchedulesData()
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO)
  const [modalEmpId,   setModalEmpId]   = useState(null)
  const [tasksModalOpen, setTasksModalOpen] = useState(false)
  const [busyEmpId,    setBusyEmpId]    = useState(null)
  const [quickFilter,  setQuickFilter]  = useState(null)   // category key | null
  const [bulkBusy,     setBulkBusy]     = useState(null)   // 'copy' | 'clear' | null

  // Phase 8A.3a — Crosswinds gate. The new Notes + Status columns
  // are only rendered when the active course is Crosswinds. Every
  // other course keeps the existing 4-column table unchanged.
  const courseId        = useSelectedCourseId()
  const isCrosswinds    = courseId === CROSSWINDS_COURSE_ID

  // Local draft buffer for the notes input so we save on blur, not
  // on every keystroke. Keyed by assignment id; clears on save.
  const [notesDraft, setNotesDraft] = useState({})

  // ── Day-scoped derivations ────────────────────────────────────────────
  // Dropdown only surfaces tasks the operator could still perform —
  // cancelled / completed events are filtered out so the dropdown stays
  // a real "what's on the board today" picker.
  const dayEvents = useMemo(() => {
    return events
      .filter(e => (e.startDate ?? e.date) === selectedDate)
      .filter(e => e.status !== 'cancelled' && e.status !== 'completed')
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }, [events, selectedDate])

  const dayEventIds = useMemo(
    () => new Set(dayEvents.map(e => e.id)),
    [dayEvents],
  )

  // Scheduled employees (Phase 13):
  //   - If the employee_schedules table has any rows for this course,
  //     the board surfaces employees whose recurring schedule for the
  //     selected day-of-week is status='scheduled'.
  //   - If the table is empty, fall back to every active employee so
  //     morning assignment still works on day one.
  // status='off' / 'vacation' / 'sick' rows are intentionally excluded
  // from the day's roster — those employees aren't working that day.
  const selectedDow = useMemo(() => {
    return new Date(`${selectedDate}T00:00:00`).getDay()
  }, [selectedDate])

  const usingScheduleFallback = weeklySchedules.length === 0

  // Index: scheduleRoleByEmpId for selectedDow. Lets the row render
  // surface a per-day operational role (e.g. "Spray Tech") that
  // overrides the employee's static profile role.
  const scheduleRoleByEmpId = useMemo(() => {
    const m = new Map()
    for (const s of weeklySchedules) {
      if (s.dayOfWeek !== selectedDow) continue
      if (s.status !== 'scheduled') continue
      if (s.role) m.set(s.employeeId, s.role)
    }
    return m
  }, [weeklySchedules, selectedDow])

  const dayEmployees = useMemo(() => {
    if (usingScheduleFallback) {
      return employees
        .filter(e => e.status === 'active' || e.status === 'on-leave')
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    }
    const scheduledIds = new Set(
      weeklySchedules
        .filter(s => s.dayOfWeek === selectedDow && s.status === 'scheduled')
        .map(s => s.employeeId),
    )
    return employees
      .filter(e => scheduledIds.has(e.id))
      .filter(e => e.status !== 'inactive')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees, weeklySchedules, selectedDow, usingScheduleFallback])

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

  // ── Quick-assign filter derivations ───────────────────────────────────
  const categoryCounts = useMemo(() => {
    const m = {}
    for (const c of QUICK_CATEGORIES) {
      m[c.key] = dayEvents.filter(e => eventMatchesCategory(e, c.key)).length
    }
    return m
  }, [dayEvents])

  // dropdownOptionsFor — returns the list of events visible in a single
  // row's dropdown. Honors the current quick filter but always keeps the
  // row's currently-assigned event in the list so the select value
  // doesn't go orphan when the filter excludes it.
  function dropdownOptionsFor(assignment) {
    if (!quickFilter) return dayEvents
    const base = dayEvents.filter(e => eventMatchesCategory(e, quickFilter))
    if (assignment && !base.some(e => e.id === assignment.calendarEventId)) {
      const pinned = dayEvents.find(e => e.id === assignment.calendarEventId)
      if (pinned) return [pinned, ...base]
    }
    return base
  }

  // ── Summary chips ─────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const assignedEmps = new Set()
    const linkedByAssignmentIds = new Set()
    for (const a of crewAssignments) {
      if (a.status === 'cancelled') continue
      if (!dayEventIds.has(a.calendarEventId)) continue
      assignedEmps.add(a.employeeId || a.employeeName)
      linkedByAssignmentIds.add(a.id)
    }
    const linkedEquipment = equipmentReservations.filter(r =>
      r.crewAssignmentId
      && linkedByAssignmentIds.has(r.crewAssignmentId)
      && r.status !== 'cancelled'
      && r.status !== 'released',
    ).length
    const eventsWithCrew = new Set(
      crewAssignments
        .filter(a => a.status !== 'cancelled' && dayEventIds.has(a.calendarEventId))
        .map(a => a.calendarEventId),
    )
    const openTasks = dayEvents.filter(e => !eventsWithCrew.has(e.id)).length

    return {
      assigned:   assignedEmps.size,
      unassigned: Math.max(0, dayEmployees.length - assignedEmps.size),
      linkedEquipment,
      openTasks,
    }
  }, [crewAssignments, equipmentReservations, dayEventIds, dayEvents, dayEmployees])

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
      // Phase 9C.2 — compute how many equipment reservations were linked
      // to the prior assignment BEFORE unlinking, so the toast can tell
      // the supervisor that equipment was actually unlinked (vs cases
      // where there was nothing to unlink).
      const linkedCountPrev = existing
        ? (reservationsByAssignment.get(existing.id) ?? []).length
        : 0
      const oldEventTitle = existing
        ? (events.find(e => e.id === existing.calendarEventId)?.title ?? '')
        : ''
      if (newEventId === '') {
        if (existing) {
          await unlinkReservationsFor(existing.id)
          await deleteCrewAssignment(existing.id)
          if (isCrosswinds) {
            toast.success(linkedCountPrev > 0
              ? `Cleared ${emp.name}'s assignment. Equipment unlinked.`
              : `Cleared ${emp.name}'s assignment.`)
          } else {
            toast.success(`Cleared task for ${emp.name}`)
          }
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
      const newTitle = dayEvents.find(e => e.id === newEventId)?.title ?? 'task'
      if (isCrosswinds && existing && linkedCountPrev > 0) {
        toast.success(`${emp.name} → ${newTitle} · equipment from ${oldEventTitle} unlinked`)
      } else {
        toast.success(`${emp.name} → ${newTitle}`)
      }
    } catch (err) {
      toast.error(`Task update failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  function handleClear(emp) {
    return handleTaskChange(emp, '')
  }

  // Phase 8A.3c — pick an existing crew-type event by date + title (case-
  // insensitive) or silently create one via the existing dedupe-friendly
  // createCalendarEvent path. The stable sourceId (`<date>:<slug>`) means
  // two operators picking the same task on the same day resolve to one
  // event server-side, so DisplayBoard's operator/event joins stay clean.
  async function pickOrCreateEventForTask(taskName, dateIso) {
    const wanted = (taskName ?? '').trim().toLowerCase()
    if (!wanted || !dateIso) return null
    const existing = events.find(e =>
      ((e.startDate ?? e.date) === dateIso) &&
      ((e.title ?? '').trim().toLowerCase() === wanted) &&
      (e.eventType === 'crew')
    )
    if (existing) return existing
    return await createCalendarEvent({
      title:        taskName,
      startDate:    dateIso,
      eventType:    'crew',
      sourceModule: 'assignment-board',
      sourceId:     `${dateIso}:${slug(taskName)}`,
    })
  }

  // Phase 8A.3c — Crosswinds quick-task handler. Empty selection clears
  // via the existing handleClear path. Any non-empty selection picks-or-
  // creates the calendar_event and then hands its id to the existing
  // handleTaskChange flow (which does the crew_assignment write).
  async function handleQuickTaskChange(emp, taskName) {
    if (!taskName) return handleClear(emp)
    setBusyEmpId(emp.id)
    try {
      const event = await pickOrCreateEventForTask(taskName, selectedDate)
      if (!event?.id) {
        toast.error('Task assignment failed: no event id returned')
        return
      }
      await handleTaskChange(emp, event.id)
    } catch (err) {
      toast.error(`Task assignment failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  // Phase 8A.3a — Notes + Status handlers (Crosswinds-gated render).
  // Both write through patchCrewAssignment, which already does
  // optimistic local update + server reconcile + refresh-on-error.
  function handleNotesChange(assignmentId, value) {
    setNotesDraft(prev => ({ ...prev, [assignmentId]: value }))
  }
  async function handleNotesBlur(assignment) {
    if (!assignment) return
    const draft = notesDraft[assignment.id]
    if (draft === undefined) return
    const next = draft.trim()
    const current = (assignment.notes ?? '').trim()
    if (next === current) {
      setNotesDraft(prev => {
        const { [assignment.id]: _, ...rest } = prev
        return rest
      })
      return
    }
    try {
      await patchCrewAssignment(assignment.id, { notes: next })
      setNotesDraft(prev => {
        const { [assignment.id]: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      toast.error(`Notes save failed: ${err.message}`)
    }
  }
  async function handleStatusChange(assignment, nextStatus) {
    if (!assignment) return
    if (!ASSIGNMENT_STATUS_OPTIONS.includes(nextStatus)) return
    if (normalizeAssignmentStatus(assignment.status) === nextStatus) return
    try {
      await patchCrewAssignment(assignment.id, { status: nextStatus })
    } catch (err) {
      toast.error(`Status save failed: ${err.message}`)
    }
  }

  // ── Copy Yesterday ────────────────────────────────────────────────────
  //
  // Walk yesterday's crew_assignments and, for each, try to recreate the
  // same operator → task pairing today. Title-match locates today's
  // event; missing tasks and missing employees skip safely. Equipment
  // linkages are recreated as FRESH reservations on today's event, not
  // duplicated rows. Worker dedupes by (event, equipment_name) — if a
  // reservation already exists on today's event for the same equipment
  // we PATCH it to link to the new operator instead of erroring.
  async function handleCopyYesterday() {
    const yesterdayIso = shiftDate(selectedDate, -1)
    setBulkBusy('copy')
    try {
      const ydEvents = events.filter(e => (e.startDate ?? e.date) === yesterdayIso)
      const ydEventIds = new Set(ydEvents.map(e => e.id))
      const ydAssignments = crewAssignments.filter(a =>
        a.status !== 'cancelled' && ydEventIds.has(a.calendarEventId),
      )

      let copied = 0
      let skipped = 0
      for (const oldA of ydAssignments) {
        const oldEvent = ydEvents.find(e => e.id === oldA.calendarEventId)
        if (!oldEvent) { skipped++; continue }
        const oldTitle = (oldEvent.title ?? '').trim().toLowerCase()
        const todayEvent = dayEvents.find(e =>
          (e.title ?? '').trim().toLowerCase() === oldTitle,
        )
        if (!todayEvent) { skipped++; continue }
        // Verify employee still exists in current roster (and isn't inactive).
        const empStillThere = oldA.employeeId
          ? employees.find(e => e.id === oldA.employeeId && e.status !== 'inactive')
          : employees.find(e => e.name === oldA.employeeName && e.status !== 'inactive')
        if (!empStillThere) { skipped++; continue }

        try {
          const newA = await createCrewAssignment({
            calendarEventId: todayEvent.id,
            employeeId:      oldA.employeeId ?? empStillThere.id,
            employeeName:    oldA.employeeName,
            role:            oldA.role ?? null,
            status:          'assigned',
          })

          // Carry equipment links across — fresh reservations on today's
          // event, linked to today's new assignment id.
          const oldRes = equipmentReservations.filter(r =>
            r.crewAssignmentId === oldA.id
            && r.status !== 'cancelled'
            && r.status !== 'released',
          )
          for (const oldR of oldRes) {
            try {
              const newR = await createEquipmentReservation({
                calendarEventId:  todayEvent.id,
                crewAssignmentId: newA.id,
                equipmentId:      oldR.equipmentId ?? null,
                equipmentName:    oldR.equipmentName,
                status:           'reserved',
              })
              // Worker dedupes by (event, equipment_name) and returns
              // the existing row. If that row doesn't already link to
              // our new operator, PATCH it across.
              if (newR?.id && newR.crewAssignmentId !== newA.id) {
                await patchEquipmentReservation(newR.id, {
                  crewAssignmentId: newA.id,
                })
              }
            } catch {
              // single equipment row failure shouldn't kill the whole
              // copy — log + continue
            }
          }
          copied += 1
        } catch {
          skipped += 1
        }
      }
      toast.success(
        `Copied ${copied} assignment${copied !== 1 ? 's' : ''} from yesterday${
          skipped > 0 ? ` · ${skipped} skipped` : ''
        }`,
      )
    } finally {
      setBulkBusy(null)
    }
  }

  // ── Clear Day ─────────────────────────────────────────────────────────
  async function handleClearDay() {
    if (!confirm(`Clear all assignments for ${prettyDate(selectedDate)}?`)) return
    setBulkBusy('clear')
    try {
      const todayAssignmentRows = crewAssignments.filter(a =>
        a.status !== 'cancelled' && dayEventIds.has(a.calendarEventId),
      )
      let cleared = 0
      for (const a of todayAssignmentRows) {
        try {
          await unlinkReservationsFor(a.id)
          await deleteCrewAssignment(a.id)
          cleared += 1
        } catch {
          // continue past individual failures
        }
      }
      toast.success(
        `Cleared ${cleared} assignment${cleared !== 1 ? 's' : ''} for today`,
      )
    } finally {
      setBulkBusy(null)
    }
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
          <button
            type="button"
            className={styles.tasksBtn}
            data-variant="copy"
            onClick={handleCopyYesterday}
            disabled={bulkBusy !== null}
            title="Carry yesterday's operator → task pairings into today"
          >
            {bulkBusy === 'copy' ? 'Copying…' : 'Copy Yesterday'}
          </button>
          <button
            type="button"
            className={styles.tasksBtn}
            data-variant="clear"
            onClick={handleClearDay}
            disabled={bulkBusy !== null}
            title="Clear every operator assignment for the selected day"
          >
            {bulkBusy === 'clear' ? 'Clearing…' : 'Clear Day'}
          </button>
        </div>
      </header>

      {/* Phase 8A.3b — schedule notice, summary chips, and quick-assign
          category strip are hidden on Crosswinds to declutter the board.
          Other courses keep the full Phase 11/12 surface. */}
      {!isCrosswinds && (usingScheduleFallback ? (
        <div className={styles.scheduleNotice}>
          <strong>Using active employee fallback —</strong> no schedules
          configured. Add weekly shifts in
          <strong> Employee Management &gt; Schedule</strong> to drive
          this board from real scheduled crew.
        </div>
      ) : (
        <div className={styles.scheduleNoticeOk}>
          <strong>Scheduled crew:</strong> {dayEmployees.length} for{' '}
          {prettyDate(selectedDate)}. Edit shifts in
          <strong> Employee Management &gt; Schedule</strong>.
        </div>
      ))}

      {/* Summary chips (Phase 12) — hidden on Crosswinds (Phase 8A.3b). */}
      {!isCrosswinds && (
        <div className={styles.summaryRow}>
          <div className={styles.summaryChip} data-tone="info">
            <span className={styles.summaryChipNum}>{summary.assigned}</span>
            <span className={styles.summaryChipLabel}>Assigned</span>
          </div>
          <div className={styles.summaryChip} data-tone={summary.unassigned > 0 ? 'warn' : 'ok'}>
            <span className={styles.summaryChipNum}>{summary.unassigned}</span>
            <span className={styles.summaryChipLabel}>Unassigned</span>
          </div>
          <div className={styles.summaryChip} data-tone="info">
            <span className={styles.summaryChipNum}>{summary.linkedEquipment}</span>
            <span className={styles.summaryChipLabel}>Equipment Linked</span>
          </div>
          <div className={styles.summaryChip} data-tone={summary.openTasks > 0 ? 'warn' : 'ok'}>
            <span className={styles.summaryChipNum}>{summary.openTasks}</span>
            <span className={styles.summaryChipLabel}>Open Tasks</span>
          </div>
        </div>
      )}

      {/* Quick-assign category strip (Phase 12) — hidden on Crosswinds (Phase 8A.3b). */}
      {!isCrosswinds && (
        <div className={styles.quickStrip} role="tablist">
          {QUICK_CATEGORIES.map(c => {
            const count    = categoryCounts[c.key] ?? 0
            const isActive = quickFilter === c.key
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.quickChip} ${isActive ? styles.quickChipOn : ''}`}
                data-key={c.key}
                disabled={count === 0}
                onClick={() => setQuickFilter(isActive ? null : c.key)}
                title={count > 0
                  ? `Filter dropdowns to ${count} ${c.label} task${count !== 1 ? 's' : ''}`
                  : `No ${c.label} tasks today`}
              >
                {c.label}
                <span className={styles.quickChipCount}>{count}</span>
              </button>
            )
          })}
          {quickFilter && (
            <button
              type="button"
              className={styles.quickChipClear}
              onClick={() => setQuickFilter(null)}
              title="Show all tasks"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

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
        <table className={styles.assignTable} data-crosswinds={isCrosswinds ? 'true' : 'false'}>
          <thead>
            <tr>
              <th>Operator</th>
              <th>Role</th>
              <th>Task</th>
              <th>Equipment</th>
              <th aria-label="Open equipment picker" />
              {isCrosswinds && <th>Notes</th>}
              {isCrosswinds && <th>Status</th>}
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
                    {(() => {
                      const dayRole = scheduleRoleByEmpId.get(emp.id)
                      if (dayRole) {
                        return (
                          <>
                            <span className={styles.dayRolePill}>{dayRole}</span>
                            {emp.role && <span className={styles.cellDept}> · {emp.role}</span>}
                          </>
                        )
                      }
                      return (
                        <>
                          {emp.role || '—'}
                          {emp.department && <span className={styles.cellDept}> · {emp.department}</span>}
                        </>
                      )
                    })()}
                  </td>
                  <td className={styles.taskCell}>
                    {isCrosswinds ? (
                      /* Phase 8A.3c — Crosswinds curated task dropdown.
                         The value resolves back to a list option by
                         case-insensitive title match on the linked
                         event; if no match, falls through to empty so
                         the supervisor can pick a list task explicitly
                         without losing the underlying assignment row. */
                      <select
                        className={styles.taskSelect}
                        value={(() => {
                          if (!assignment) return ''
                          const ev = events.find(e => e.id === assignment.calendarEventId)
                          const t  = (ev?.title ?? '').trim().toLowerCase()
                          return CROSSWINDS_TASK_LIST.find(opt =>
                            opt.toLowerCase() === t,
                          ) ?? ''
                        })()}
                        disabled={busyEmpId === emp.id}
                        onChange={e => handleQuickTaskChange(emp, e.target.value)}
                      >
                        <option value="">— Unassigned —</option>
                        {CROSSWINDS_TASK_LIST.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className={styles.taskSelect}
                        value={assignment?.calendarEventId ?? ''}
                        disabled={busyEmpId === emp.id || dayEvents.length === 0}
                        onChange={e => handleTaskChange(emp, e.target.value)}
                      >
                        <option value="">— Unassigned —</option>
                        {dropdownOptionsFor(assignment).map(ev => (
                          <option key={ev.id} value={ev.id}>{taskOptionLabel(ev)}</option>
                        ))}
                      </select>
                    )}
                    {assignment && (isCrosswinds ? (
                      // Phase 9C.2 — Crosswinds clear button: explicit
                      // "Clear" label + clarifying tooltip so shop-floor
                      // staff know this removes only this employee from
                      // the task (it does not delete the task itself).
                      <button
                        type="button"
                        className={`${styles.clearBtn} ${styles.clearBtnLabeled}`}
                        onClick={() => handleClear(emp)}
                        disabled={busyEmpId === emp.id}
                        title="Clear this employee's assignment. The task itself is not deleted."
                        aria-label={`Clear assignment for ${emp.name}`}
                      >Clear</button>
                    ) : (
                      <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={() => handleClear(emp)}
                        disabled={busyEmpId === emp.id}
                        title="Clear task and unlink equipment"
                        aria-label={`Clear task for ${emp.name}`}
                      >×</button>
                    ))}
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
                  {isCrosswinds && (
                    <td className={styles.notesCell}>
                      {assignment ? (
                        <input
                          type="text"
                          className={styles.notesInput}
                          placeholder="Notes…"
                          value={notesDraft[assignment.id] ?? assignment.notes ?? ''}
                          onChange={e => handleNotesChange(assignment.id, e.target.value)}
                          onBlur={() => handleNotesBlur(assignment)}
                          disabled={busyEmpId === emp.id}
                          aria-label={`Notes for ${emp.name}`}
                        />
                      ) : (
                        <span className={styles.chipsEmpty}>—</span>
                      )}
                    </td>
                  )}
                  {isCrosswinds && (
                    <td className={styles.statusCell}>
                      {assignment ? (
                        <select
                          className={styles.statusSelect}
                          data-status={normalizeAssignmentStatus(assignment.status)}
                          value={normalizeAssignmentStatus(assignment.status)}
                          onChange={e => handleStatusChange(assignment, e.target.value)}
                          disabled={busyEmpId === emp.id}
                          aria-label={`Status for ${emp.name}`}
                        >
                          {ASSIGNMENT_STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={styles.chipsEmpty}>—</span>
                      )}
                    </td>
                  )}
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
