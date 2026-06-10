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
  refreshAssignmentsData,
} from '../../../utils/assignments/assignmentsStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import { useSelectedCourseId } from '../../../utils/courses/courseStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { useEmployeeSchedulesData } from '../../../utils/schedules/schedulesStore'
// Phase 9C.5d — Translation controls. The refresh hooks for the two
// other stores pull fresh title_es / body_es / message_es values into
// client state after a successful sweep, so the DAB notes inputs and
// any active marquee admin view see the new translations immediately.
import { refreshOperationsNotesData } from '../../../utils/operations/notesStore'
import { refreshAlertsData } from '../../../utils/alerts/alertsStore'
import { runTranslationSweep, scheduleTranslationSweep } from '../../../utils/translate/translateClient'
import { useAuth } from '../../../context/AuthContext'
import EquipmentPickerModal from './EquipmentPickerModal'
import TasksManagerModal from './TasksManagerModal'
// Phase 9C.11 — Reusable task library. The dropdown reads its options
// from active task_templates rows instead of (a) per-day calendar_events
// for non-Crosswinds courses, or (b) the legacy hardcoded Crosswinds
// task list. Selecting a template still creates / finds a calendar_event
// for selectedDate via pickOrCreateEventForTask so the downstream
// crew_assignment + kiosk join paths are unchanged.
import { useTaskTemplatesData } from '../../../utils/tasks/taskTemplateStore'
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

// Phase 9C.11 — the legacy Crosswinds hardcoded task list (14 names)
// was retired in favor of the reusable task_templates table. The
// original names were seeded into task_templates by
// worker/migrations/0051_task_templates.sql. Supervisors now edit the
// library from the Tasks tab modal at runtime.

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

// Phase 9C.13 — Task dropdown grouping. Templates are bucketed under
// these labels with `crew` first (the bulk of a morning shift), then
// irrigation / spray / agronomy / maintenance, and `Other` last as the
// catch-all for blank / null / unknown categories. Adding a category
// here is purely UI: TasksManagerModal continues to write whatever
// the supervisor chose into task_templates.category and the dropdown
// gracefully bins unknowns into "Other".
const TASK_CATEGORY_LABELS = {
  crew:        'Crew',
  irrigation:  'Irrigation',
  spray:       'Spray',
  agronomy:    'Agronomy',
  maintenance: 'Maintenance',
  other:       'Other',
}
const TASK_CATEGORY_ORDER = ['crew', 'irrigation', 'spray', 'agronomy', 'maintenance', 'other']

export default function DailyAssignmentBoard({
  employees,
  events,
  crewAssignments,
  equipmentReservations,
  equipment,
}) {
  const toast = useToast()
  const { schedules: weeklySchedules } = useEmployeeSchedulesData()
  // Phase 9C.11 — reusable task library. Backs the DAB dropdown.
  const { templates: taskTemplates } = useTaskTemplatesData()
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO)
  const [modalEmpId,   setModalEmpId]   = useState(null)
  const [tasksModalOpen, setTasksModalOpen] = useState(false)
  const [busyEmpId,    setBusyEmpId]    = useState(null)
  const [bulkBusy,     setBulkBusy]     = useState(null)   // 'copy' | 'clear' | null

  // Phase 8A.3a — Crosswinds gate. The new Notes + Status columns
  // are only rendered when the active course is Crosswinds. Every
  // other course keeps the existing 4-column table unchanged.
  const courseId        = useSelectedCourseId()
  const isCrosswinds    = courseId === CROSSWINDS_COURSE_ID

  // Local draft buffer for the notes input so we save on blur, not
  // on every keystroke. Keyed by assignment id; clears on save.
  const [notesDraft, setNotesDraft] = useState({})

  // Phase 9C.5b2 — Spanish translation draft buffer mirrors the
  // English notesDraft shape and lifecycle. Same save-on-blur,
  // trim-then-no-op-if-equal, clear-on-success semantics.
  const [notesEsDraft, setNotesEsDraft] = useState({})

  // Phase 9C.5d — Translate Now button state. `translating` is the
  // in-flight flag (button disables and shows "Translating…"); the
  // permission gate is recomputed each render via useAuth().can(...).
  // Server-side endpoint already enforces canSystemSettings (9C.5c3b),
  // so this client gate is convenience UX, not the authority.
  const { can } = useAuth()
  const canTranslate = can('canSystemSettings')
  const [translating, setTranslating] = useState(false)

  // Phase 9C.15 — Copy From… modal state. Source date defaults to the
  // previous day; destination is locked to selectedDate so the
  // supervisor can't accidentally rewrite a day they haven't focused.
  // copyOptions follows the spec defaults: tasks + notes on, equipment
  // + overwrite off, skip-existing on (which is also the failure-safe
  // posture if overwrite is somehow toggled without confirmation).
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  // Default source = previous day of selectedDate. Recomputed on each
  // open below in openCopyModal so the supervisor never has to clear
  // a stale date that referenced last week's selectedDate.
  const [copySourceDate, setCopySourceDate] = useState(() => shiftDate(TODAY_ISO(), -1))
  const [copyOptions, setCopyOptions] = useState({
    copyTasks:        true,
    copyNotes:        true,
    copyEquipment:    false,
    skipExisting:     true,
    overwriteExisting: false,
  })

  // Phase 9C.7 — Per-assignment Spanish regeneration. regeneratingId
  // holds the assignment.id whose Spanish translation is currently
  // being refreshed; only one row regenerates at a time so the user
  // can read the toast feedback cleanly. The button is also disabled
  // while the global Translate Now is running.
  const [regeneratingId, setRegeneratingId] = useState(null)

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

  // Phase 9C.11 — Active task templates drive the dropdown options. The
  // archived toggle in the Tasks Library modal is intentionally a
  // server-side fetch flag; here we still defensively filter by
  // status === 'active' so archived templates can never leak into the
  // assignment picker even if the underlying store includes them.
  const activeTaskTemplates = useMemo(() => {
    return (taskTemplates ?? [])
      .filter(t => t.status === 'active')
      .sort((a, b) => {
        const sa = a.sortOrder ?? 0
        const sb = b.sortOrder ?? 0
        if (sa !== sb) return sa - sb
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
  }, [taskTemplates])

  // Phase 9C.13 — Group active templates by category for an <optgroup>
  // dropdown. Categories appear in TASK_CATEGORY_ORDER; blank / unknown
  // categories bucket to "other" so a template with no category never
  // disappears from the picker. Within a bucket the templates inherit
  // the activeTaskTemplates sort (sortOrder ASC then name ASC), so the
  // supervisor's curated ordering in the Task Library carries through.
  // Empty buckets are filtered out so the dropdown only renders groups
  // that actually have visible templates.
  const groupedActiveTaskTemplates = useMemo(() => {
    const buckets = new Map()
    for (const tmpl of activeTaskTemplates) {
      const raw = (tmpl.category ?? '').trim().toLowerCase()
      const key = TASK_CATEGORY_LABELS[raw] ? raw : 'other'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(tmpl)
    }
    return TASK_CATEGORY_ORDER
      .filter(key => buckets.has(key))
      .map(key => ({
        key,
        label:     TASK_CATEGORY_LABELS[key],
        templates: buckets.get(key),
      }))
  }, [activeTaskTemplates])

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

  // Phase 9C.12 — Clears an employee's current assignment for
  // selectedDate, unlinking any equipment reservations first so the
  // equipment remains available at the task header for the next
  // operator to claim. Task selection (the dropdown's non-blank path)
  // goes through handleQuickTaskChange instead, which carries notes +
  // applies template defaults.
  async function handleClear(emp) {
    setBusyEmpId(emp.id)
    try {
      const existing = assignmentByEmpId.get(emp.id) ?? assignmentByEmpId.get(emp.name)
      if (!existing) return
      const linkedCountPrev = (reservationsByAssignment.get(existing.id) ?? []).length
      await unlinkReservationsFor(existing.id)
      await deleteCrewAssignment(existing.id)
      if (isCrosswinds) {
        toast.success(linkedCountPrev > 0
          ? `Cleared ${emp.name}'s assignment. Equipment unlinked.`
          : `Cleared ${emp.name}'s assignment.`)
      } else {
        toast.success(`Cleared task for ${emp.name}`)
      }
    } catch (err) {
      toast.error(`Task update failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  // Phase 9C.12 — Picks an existing crew-type calendar_event for
  // (template, date) or silently creates one. The stable sourceId is
  // keyed off the template id (`task-template:<templateId>:<date>`) so
  // two operators picking the same template on the same day resolve to
  // one event server-side. When creating, the template's default start
  // time / location / notes propagate to the event so a freshly added
  // calendar row carries the supervisor's standing instructions for
  // that task instead of being blank.
  //
  // Accepts a template object now (was: taskName, dateIso, templateId).
  // The ad-hoc fallback shape from 9C.11 is intentionally retired — the
  // only callsite is handleQuickTaskChange and it always has a template.
  async function pickOrCreateEventForTask(template, dateIso) {
    const wanted = (template?.name ?? '').trim().toLowerCase()
    if (!wanted || !dateIso || !template?.id) return null
    const existing = events.find(e =>
      ((e.startDate ?? e.date) === dateIso) &&
      ((e.title ?? '').trim().toLowerCase() === wanted) &&
      (e.eventType === 'crew')
    )
    if (existing) return existing
    return await createCalendarEvent({
      title:        template.name,
      startDate:    dateIso,
      startTime:    template.defaultStartTime || null,
      location:     template.defaultLocation  || null,
      description:  template.defaultNotes     || null,
      eventType:    'crew',
      sourceModule: 'assignment-board',
      sourceId:     `task-template:${template.id}:${dateIso}`,
    })
  }

  // Phase 9C.12 — Quick-task handler with template-default application.
  //
  //   • Empty selection clears via the existing handleClear path.
  //   • New assignment (no existing row): create with notes pre-filled
  //     from template.defaultNotes if non-empty. notesEs is NOT set —
  //     the worker stores notes_es as NULL on POST and the existing
  //     cron sweep / scheduleTranslationSweep flow refills it for
  //     opted-in employees.
  //   • Switching tasks (existing row): PRESERVE the existing row's
  //     notes verbatim. Template defaults are a "first impression"
  //     convenience — the supervisor's customized notes always win.
  //     The legacy delete-then-recreate flow loses notes by definition,
  //     so we now read them off the existing row before deletion and
  //     carry them onto the new row's create payload.
  //
  // Translation sweep fires once at the tail when English notes were
  // actually written (either from a template default or carried over).
  // This is the same scheduleTranslationSweep helper handleNotesBlur
  // already uses, so the debounce window naturally collapses any
  // duplicate triggers if the supervisor changes a few rows quickly.
  async function handleQuickTaskChange(emp, templateId) {
    if (!templateId) return handleClear(emp)
    const template = activeTaskTemplates.find(t => t.id === templateId)
    if (!template) {
      toast.error('Task assignment failed: template not found')
      return
    }
    setBusyEmpId(emp.id)
    try {
      const event = await pickOrCreateEventForTask(template, selectedDate)
      if (!event?.id) {
        toast.error('Task assignment failed: no event id returned')
        return
      }

      const existing       = assignmentByEmpId.get(emp.id) ?? assignmentByEmpId.get(emp.name)
      const linkedCountPrev = existing
        ? (reservationsByAssignment.get(existing.id) ?? []).length
        : 0
      const oldEventTitle = existing
        ? (events.find(e => e.id === existing.calendarEventId)?.title ?? '')
        : ''

      if (existing && existing.calendarEventId === event.id) return // no-op

      // Preserve the existing row's notes verbatim across the
      // delete+recreate boundary; only fall back to the template's
      // default when the row currently has nothing.
      const carriedNotes  = (existing?.notes ?? '').trim()
      const defaultNotes  = (template.defaultNotes ?? '').trim()
      const notesToWrite  = carriedNotes || defaultNotes || null

      if (existing) {
        await unlinkReservationsFor(existing.id)
        await deleteCrewAssignment(existing.id)
      }
      await createCrewAssignment({
        calendarEventId: event.id,
        employeeId:      emp.id,
        employeeName:    emp.name,
        role:            emp.role ?? null,
        status:          'assigned',
        notes:           notesToWrite,
      })

      if (notesToWrite && canTranslate) {
        scheduleTranslationSweep()
      }

      if (isCrosswinds && existing && linkedCountPrev > 0) {
        toast.success(`${emp.name} → ${template.name} · equipment from ${oldEventTitle} unlinked`)
      } else {
        toast.success(`${emp.name} → ${template.name}`)
      }
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
      // Phase 9C.8 — auto-translate the new English note after a brief
      // debounce. Worker NULLs notes_es on PATCH-without-notesEs (9C.5c3
      // English-edit invalidation), so the next sweep refills it
      // automatically. Gated on canTranslate; the worker would 403
      // non-canSystemSettings actors but we don't even fire the
      // request for them.
      if (canTranslate) scheduleTranslationSweep()
    } catch (err) {
      toast.error(`Notes save failed: ${err.message}`)
    }
  }
  // Phase 9C.5b2 — Spanish notes handlers mirror the English ones.
  // patchCrewAssignment(id, { notesEs }) routes through the existing
  // 9C.5b1 CORE_COLUMNS map; no worker change required.
  function handleNotesEsChange(assignmentId, value) {
    setNotesEsDraft(prev => ({ ...prev, [assignmentId]: value }))
  }
  async function handleNotesEsBlur(assignment) {
    if (!assignment) return
    const draft = notesEsDraft[assignment.id]
    if (draft === undefined) return
    const next = draft.trim()
    const current = (assignment.notesEs ?? '').trim()
    if (next === current) {
      setNotesEsDraft(prev => {
        const { [assignment.id]: _, ...rest } = prev
        return rest
      })
      return
    }
    try {
      await patchCrewAssignment(assignment.id, { notesEs: next })
      setNotesEsDraft(prev => {
        const { [assignment.id]: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      toast.error(`Spanish notes save failed: ${err.message}`)
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
  // Phase 9C.16 — Copy Yesterday now delegates to the generalized
  // copyAssignmentsFromDate helper added in 9C.15, fixing two real
  // morning-workflow bugs the legacy implementation carried:
  //
  //   1. The legacy version only carried operators whose task already
  //      existed on the destination day (dayEvents.find by title), so
  //      a freshly-arrived supervisor with an EMPTY destination board
  //      saw "Copied 0 assignments · N skipped" — the most common
  //      morning case silently failed. The shared helper find-or-
  //      creates the destination event via pickOrCreateDestinationEvent
  //      so an empty board works as expected.
  //
  //   2. The legacy version dropped source notes entirely (no `notes:`
  //      on the create payload). The shared helper carries English
  //      notes when the option is on, which matches what supervisors
  //      expect from a "copy" action — and the manual-Spanish-wins
  //      contract is preserved because notesEs is still never copied.
  //
  // The defaults below mirror the shortcut's historical intent: tasks
  // + notes + equipment all carry, existing destination rows are
  // skipped (so today's hand-assignments aren't clobbered). overwrite
  // is left to the Copy From… flow where the supervisor opts in via
  // the modal's radio pair + confirm dialog.
  async function handleCopyYesterday() {
    const yesterdayIso = shiftDate(selectedDate, -1)
    await copyAssignmentsFromDate(yesterdayIso, selectedDate, {
      copyTasks:         true,
      copyNotes:         true,
      copyEquipment:     true,
      skipExisting:      true,
      overwriteExisting: false,
    })
  }

  // ── Copy From… (Phase 9C.15) ────────────────────────────────────────
  // Generalizes the Copy Yesterday workflow to any source date and
  // adds per-row options. Reuses every safety path the in-house
  // Crosswinds workflow has accumulated:
  //   • Skip cancelled source assignments (matches Copy Yesterday).
  //   • Match employees by employeeId first, name as a fallback only.
  //   • Reuse destination calendar_event when one already exists for
  //     (title, eventType, destinationDate); otherwise mint a fresh
  //     one with a derived sourceId so server-side dedupe collapses
  //     duplicate creates from concurrent supervisors.
  //   • Re-key task-template events from
  //     task-template:<id>:<sourceDate> → task-template:<id>:<destDate>
  //     so a copied row reuses the same template event the 9C.12 flow
  //     would have created for a fresh assignment on that day.
  //   • Equipment copy is opt-in and uses the same dedupe-aware POST +
  //     PATCH dance Copy Yesterday already validated.
  //   • Overwrite uses the existing unlinkReservationsFor +
  //     deleteCrewAssignment safety pair, so destination equipment
  //     surfaces back to the task header instead of being orphaned.
  //   • notesEs is NEVER copied across — even if "Copy notes" is on,
  //     only the English notes carry. The worker's race-safe
  //     notes_es=NULL guard (9C.5c3) plus the destination row's blank
  //     Spanish lets the cron sweep refill the right translation.
  function openCopyModal() {
    setCopySourceDate(shiftDate(selectedDate, -1))
    setCopyOptions(prev => ({ ...prev, overwriteExisting: false }))
    setCopyModalOpen(true)
  }

  // Derive a stable destination sourceId. Reusing task-template:<id>
  // keys means a freshly assigned task on destDate (via the dropdown)
  // and a copied row from sourceDate collapse onto the same event.
  function deriveDestinationSourceId(sourceEvent, destDate) {
    const raw = (sourceEvent.sourceId ?? sourceEvent.metadata?.sourceId ?? '').trim()
    const tmplMatch = raw.match(/^task-template:([^:]+):\d{4}-\d{2}-\d{2}$/)
    if (tmplMatch) return `task-template:${tmplMatch[1]}:${destDate}`
    return `copied-task:${sourceEvent.id}:${destDate}`
  }

  // Find (and reuse) or create a destination calendar_event for the
  // (sourceEvent.title, destDate) pair. Mirrors the find-or-create
  // shape from pickOrCreateEventForTask so a copied row + a freshly
  // dropdown-assigned row never spawn duplicate destination events.
  async function pickOrCreateDestinationEvent(sourceEvent, destDate) {
    const wantedTitle = (sourceEvent.title ?? '').trim().toLowerCase()
    if (!wantedTitle) return null
    const reused = events.find(e =>
      ((e.startDate ?? e.date) === destDate) &&
      ((e.title ?? '').trim().toLowerCase() === wantedTitle) &&
      (e.eventType === (sourceEvent.eventType || 'crew')),
    )
    if (reused) return reused
    return await createCalendarEvent({
      title:        sourceEvent.title,
      startDate:    destDate,
      startTime:    sourceEvent.startTime || null,
      location:     sourceEvent.location  || null,
      description:  sourceEvent.description || null,
      eventType:    sourceEvent.eventType || 'crew',
      sourceModule: 'assignment-board',
      sourceId:     deriveDestinationSourceId(sourceEvent, destDate),
    })
  }

  async function copyAssignmentsFromDate(sourceDate, destinationDate, options) {
    if (!sourceDate || !destinationDate) {
      toast.error('Copy failed: source and destination dates are required.')
      return
    }
    if (sourceDate === destinationDate) {
      toast.info('Source and destination are the same day — nothing to copy.')
      return
    }

    const srcEvents = events.filter(e => (e.startDate ?? e.date) === sourceDate)
    const srcEventIds = new Set(srcEvents.map(e => e.id))
    const srcAssignments = crewAssignments.filter(a =>
      a.status !== 'cancelled' && srcEventIds.has(a.calendarEventId),
    )
    if (srcAssignments.length === 0) {
      toast.info(`No assignments on ${sourceDate} to copy.`)
      return
    }

    // Destination assignment lookup — keyed by employeeId (fallback to
    // employeeName for legacy rows without an id) so we can detect
    // existing destination rows without an extra fetch.
    const destEvents = events.filter(e => (e.startDate ?? e.date) === destinationDate)
    const destEventIds = new Set(destEvents.map(e => e.id))
    const destAssignByEmp = new Map()
    for (const a of crewAssignments) {
      if (a.status === 'cancelled') continue
      if (!destEventIds.has(a.calendarEventId)) continue
      const key = a.employeeId || a.employeeName
      if (key) destAssignByEmp.set(key, a)
    }

    // Confirm before any overwrite. Skipping is the safe default, but
    // a deliberate overwrite without a confirm dialog would be too
    // easy to misfire.
    if (options.overwriteExisting && destAssignByEmp.size > 0) {
      if (!confirm(
        `This will replace ${destAssignByEmp.size} existing assignment${destAssignByEmp.size !== 1 ? 's' : ''} on ${destinationDate}. ` +
        `Equipment will be unlinked and reservations released back to the task. ` +
        `Continue?`,
      )) return
    }

    setBulkBusy('copy')
    let copied = 0, skipped = 0, overwritten = 0, failed = 0

    for (const oldA of srcAssignments) {
      const oldEvent = srcEvents.find(e => e.id === oldA.calendarEventId)
      if (!oldEvent) { skipped++; continue }

      // Employee match — by id when possible, name as the safety net.
      const empStillThere = oldA.employeeId
        ? employees.find(e => e.id === oldA.employeeId && e.status !== 'inactive')
        : employees.find(e => e.name === oldA.employeeName && e.status !== 'inactive')
      if (!empStillThere) { skipped++; continue }

      const empKey      = oldA.employeeId || oldA.employeeName
      const destExisting = destAssignByEmp.get(empKey)
      if (destExisting && !options.overwriteExisting) {
        skipped++
        continue
      }

      try {
        const destEvent = await pickOrCreateDestinationEvent(oldEvent, destinationDate)
        if (!destEvent?.id) { failed++; continue }

        if (destExisting && options.overwriteExisting) {
          await unlinkReservationsFor(destExisting.id)
          await deleteCrewAssignment(destExisting.id)
          overwritten++
        }

        const newA = await createCrewAssignment({
          calendarEventId: destEvent.id,
          employeeId:      oldA.employeeId ?? empStillThere.id,
          employeeName:    oldA.employeeName,
          role:            oldA.role ?? null,
          // Copied rows always start as 'assigned' — don't carry
          // 'complete' / 'in-progress' / 'blocked' state across days.
          status:          'assigned',
          // Copy English notes only when the option is on. The Spanish
          // translation field is intentionally omitted — the cron sweep
          // refills it from the new English so the manual-Spanish-wins
          // contract is preserved.
          notes:           options.copyNotes ? (oldA.notes ?? null) : null,
        })

        if (options.copyEquipment) {
          const oldRes = equipmentReservations.filter(r =>
            r.crewAssignmentId === oldA.id
            && r.status !== 'cancelled'
            && r.status !== 'released',
          )
          for (const oldR of oldRes) {
            try {
              const newR = await createEquipmentReservation({
                calendarEventId:  destEvent.id,
                crewAssignmentId: newA.id,
                equipmentId:      oldR.equipmentId ?? null,
                equipmentName:    oldR.equipmentName,
                status:           'reserved',
              })
              if (newR?.id && newR.crewAssignmentId !== newA.id) {
                await patchEquipmentReservation(newR.id, { crewAssignmentId: newA.id })
              }
            } catch {
              // single-row equipment failure shouldn't kill the batch
            }
          }
        }

        copied++
      } catch {
        failed++
      }
    }

    // Single translation sweep after the batch when any English notes
    // were actually copied. The debounce window in
    // scheduleTranslationSweep collapses duplicate triggers if the
    // supervisor copies several days in quick succession.
    if (copied > 0 && options.copyNotes && canTranslate) {
      scheduleTranslationSweep()
    }

    setBulkBusy(null)
    setCopyModalOpen(false)

    const parts = [`Copied ${copied} assignment${copied !== 1 ? 's' : ''} from ${sourceDate} to ${destinationDate}`]
    if (overwritten > 0) parts.push(`${overwritten} overwritten`)
    if (skipped > 0)     parts.push(`${skipped} skipped`)
    if (failed > 0)      parts.push(`${failed} failed`)
    toast.success(parts.join(' · '))
  }

  // ── Translate Now (Phase 9C.5d) ──────────────────────────────────────
  // Fires the same sweep the */30 cron runs, on demand. Refreshes the
  // three crew-visible content stores after success so the new
  // `*_es` values land in client state immediately (no 60s wait).
  // The button is hidden when can('canSystemSettings') is false, AND
  // the server enforces canSystemSettings independently; both layers
  // must hold.
  async function handleTranslateNow() {
    if (translating) return
    setTranslating(true)
    try {
      const { summary } = await runTranslationSweep()
      if (summary?.skipped) {
        if (summary.reason === 'no-employee-needs-translation') {
          toast.info("No employee on today's board needs Spanish translation.")
        } else if (summary.reason === 'provider-none-killswitch') {
          toast.info('Auto-translation is currently disabled.')
        } else {
          toast.info(`Translation skipped: ${summary.reason}`)
        }
        return
      }
      const asnT  = summary?.assignments?.translated ?? 0
      const noteT = summary?.dailyNotes?.translated  ?? 0
      const alrT  = summary?.alerts?.translated      ?? 0
      const total = asnT + noteT + alrT
      if (total === 0) {
        toast.info('All translations are up to date.')
        return
      }
      toast.success(
        `Translation complete: ${asnT} assignments, ${noteT} daily notes, ${alrT} alerts updated.`,
      )
      // Pull the freshly-written *_es values into client state so the
      // DAB Spanish inputs and any open admin views pick up the new
      // translations without a polling round-trip. Best-effort — a
      // failed refresh leaves the next polling cycle to recover.
      await Promise.allSettled([
        refreshAssignmentsData(),
        refreshOperationsNotesData(),
        refreshAlertsData(),
      ])
    } catch (err) {
      if (err?.status === 401) {
        toast.error('Sign in required.')
      } else if (err?.status === 403) {
        toast.error("You don't have permission to run translations.")
      } else {
        toast.error('Translation failed. Try again.')
      }
    } finally {
      setTranslating(false)
    }
  }

  // ── Regenerate Spanish for one assignment (Phase 9C.7) ───────────────
  // Clears the row's notes_es, then fires the same sweep the cron and
  // the global "Translate Now" button use. The race-safe `WHERE
  // notes_es IS NULL` guard in the sweep then lets the worker write
  // a fresh translation for this row. Other blank rows on today's
  // board will translate too — the sweep is intentionally batch-
  // oriented.
  //
  // Safety: if the row already has a non-empty Spanish value (manual
  // or previously auto-generated), confirm before clobbering. Manual
  // authoring via 9C.5b2 still wins for every other path — only an
  // explicit click on this button overwrites it.
  async function handleRegenerateSpanish(assignment) {
    if (!assignment?.id) return
    if (regeneratingId !== null || translating) return
    const englishTrim = (assignment.notes ?? '').trim()
    if (!englishTrim) {
      toast.info('Add an English note before regenerating Spanish.')
      return
    }
    const hasSpanish = Boolean((assignment.notesEs ?? '').trim())
    if (hasSpanish && !window.confirm('Replace this Spanish note with a new auto-translation?')) {
      return
    }
    setRegeneratingId(assignment.id)
    try {
      // Step 1 — clear the cached Spanish so the sweep's `WHERE
      // notes_es IS NULL` guard picks the row up. Bypass the
      // notesEsDraft buffer by going straight to the store.
      await patchCrewAssignment(assignment.id, { notesEs: '' })

      // Step 2 — fire the sweep. This is the same call the global
      // Translate Now button makes; it batches all eligible blank
      // rows for today.
      const { summary } = await runTranslationSweep()

      // Step 3 — refresh assignments so the new notesEs lands in
      // client state without waiting for the next polling tick.
      await refreshAssignmentsData()

      // Optional info toast — when the sweep ran but translated 0
      // rows (provider failure, kill switch flipped between clicks,
      // employee no longer needs Spanish), surface that to the user
      // so they don't keep clicking expecting fresh text.
      if (summary?.assignments?.translated > 0) {
        toast.success('Spanish translation regenerated.')
      } else if (summary?.skipped) {
        // Most likely reason in this flow: the employee toggle was
        // turned off between the click and the call. Re-surface the
        // sweep's reason so the user knows why nothing translated.
        toast.info(summary.reason === 'no-employee-needs-translation'
          ? "No employee on today's board needs Spanish translation."
          : `Translation skipped: ${summary.reason}`)
      } else {
        toast.info('No new Spanish translation was generated.')
      }
    } catch (err) {
      if (err?.status === 401) {
        toast.error('Sign in required.')
      } else if (err?.status === 403) {
        toast.error("You don't have permission to regenerate translations.")
      } else {
        toast.error(`Regenerate failed: ${err?.message ?? 'Try again.'}`)
      }
    } finally {
      setRegeneratingId(null)
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
        `Cleared ${cleared} assignment${cleared !== 1 ? 's' : ''} for ${prettyDate(selectedDate)}`,
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
            title="Open the reusable task library — add / rename / archive templates that show up in this dropdown"
          >
            Tasks ({activeTaskTemplates.length})
          </button>
          {canTranslate && (
            <button
              type="button"
              className={styles.tasksBtn}
              data-variant="translate"
              onClick={handleTranslateNow}
              disabled={translating}
              title="Translate today's notes to Spanish for opted-in crew members"
            >
              {translating ? 'Translating…' : 'Translate Now'}
            </button>
          )}
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
            data-variant="copy-from"
            onClick={openCopyModal}
            disabled={bulkBusy !== null}
            title="Copy assignments from a specific source date into the selected day"
          >
            Copy From…
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

      {/* Phase 9C.11 — Legacy Phase 12 quick-assign category strip
          removed. It filtered the per-row dropdown by event_type /
          title keyword over per-day calendar_events; now that the
          dropdown reads from active task_templates the supervisor
          curates the list directly in the Task Library modal. */}

      {activeTaskTemplates.length === 0 && (
        <p className={styles.empty}>
          No active task templates yet. Click <strong>Tasks</strong> above to add tasks to your library.
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
                    {/* Phase 9C.11 — Unified task-library dropdown.
                        Options come from active task_templates on every
                        course. The value resolves back to a template
                        id by case-insensitive title match on the
                        currently linked event; if no match (e.g. the
                        template was renamed or archived after the
                        assignment was created), the select falls
                        through to empty but the assignment row still
                        displays via the linked event's title. */}
                    <select
                      className={styles.taskSelect}
                      value={(() => {
                        if (!assignment) return ''
                        const ev = events.find(e => e.id === assignment.calendarEventId)
                        const t  = (ev?.title ?? '').trim().toLowerCase()
                        return activeTaskTemplates.find(tmpl =>
                          (tmpl.name ?? '').trim().toLowerCase() === t,
                        )?.id ?? ''
                      })()}
                      disabled={busyEmpId === emp.id || activeTaskTemplates.length === 0}
                      onChange={e => handleQuickTaskChange(emp, e.target.value)}
                    >
                      <option value="">— Unassigned —</option>
                      {groupedActiveTaskTemplates.map(group => (
                        <optgroup key={group.key} label={group.label}>
                          {group.templates.map(tmpl => (
                            <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
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
                        <div className={styles.notesStack}>
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
                          <input
                            type="text"
                            lang="es"
                            className={styles.notesInputEs}
                            placeholder="Spanish notes…"
                            value={notesEsDraft[assignment.id] ?? assignment.notesEs ?? ''}
                            onChange={e => handleNotesEsChange(assignment.id, e.target.value)}
                            onBlur={() => handleNotesEsBlur(assignment)}
                            disabled={busyEmpId === emp.id}
                            aria-label={`Spanish notes for ${emp.name}`}
                          />
                          {/* Phase 9C.7 — Per-row Regenerate Spanish.
                              Visible only to canSystemSettings (same gate
                              as the global Translate Now button). Disabled
                              when this row is in flight OR the global
                              translate sweep is running. The server
                              endpoint enforces canSystemSettings
                              independently — both layers must hold. */}
                          {canTranslate && (
                            <button
                              type="button"
                              className={styles.notesRegenerateBtn}
                              data-variant="regenerate"
                              onClick={() => handleRegenerateSpanish(assignment)}
                              disabled={
                                regeneratingId === assignment.id
                                || translating
                                || regeneratingId !== null
                                || !(assignment.notes ?? '').trim()
                              }
                              title="Clear and regenerate this Spanish note"
                              aria-label={`Regenerate Spanish notes for ${emp.name}`}
                            >
                              {regeneratingId === assignment.id ? 'Regenerating…' : 'Regenerate'}
                            </button>
                          )}
                        </div>
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
          onClose={() => setTasksModalOpen(false)}
        />
      )}

      {copyModalOpen && (
        <CopyAssignmentsModal
          sourceDate={copySourceDate}
          destinationDate={selectedDate}
          options={copyOptions}
          busy={bulkBusy === 'copy'}
          onSourceDateChange={setCopySourceDate}
          onOptionsChange={setCopyOptions}
          onClose={() => setCopyModalOpen(false)}
          onCopy={() => copyAssignmentsFromDate(copySourceDate, selectedDate, copyOptions)}
          // Counts so the modal can show the supervisor what they're
          // about to copy / replace before they confirm.
          sourceCount={crewAssignments.filter(a =>
            a.status !== 'cancelled'
            && events.some(e => e.id === a.calendarEventId && (e.startDate ?? e.date) === copySourceDate)
          ).length}
          destCount={crewAssignments.filter(a =>
            a.status !== 'cancelled'
            && events.some(e => e.id === a.calendarEventId && (e.startDate ?? e.date) === selectedDate)
          ).length}
        />
      )}

    </section>
  )
}

/* ── CopyAssignmentsModal (Phase 9C.15) ─────────────────────────────────
 * Compact modal for the supervisor to pick a source date and the per-
 * row copy options. Layout mirrors TasksManagerModal so the modal
 * chrome (overlay / header / footer / btn styles) all reuse the
 * existing CSS module — no new modal stylesheet needed.
 *
 * View-only by design until Copy is clicked. The actual write batch
 * lives in copyAssignmentsFromDate() on the parent, so the modal is
 * purely a parameter picker.
 */
function CopyAssignmentsModal({
  sourceDate,
  destinationDate,
  options,
  busy,
  sourceCount,
  destCount,
  onSourceDateChange,
  onOptionsChange,
  onClose,
  onCopy,
}) {
  function setOption(k, v) {
    onOptionsChange(prev => ({ ...prev, [k]: v }))
  }

  // The "overwrite existing" + "skip existing" pair is intentionally
  // mutually exclusive at the UX level — flipping one off-rails turns
  // the other on so the supervisor's intent is unambiguous before
  // they hit Copy.
  function setSkipExisting(next) {
    onOptionsChange(prev => ({
      ...prev,
      skipExisting:      next,
      overwriteExisting: next ? false : prev.overwriteExisting,
    }))
  }
  function setOverwriteExisting(next) {
    onOptionsChange(prev => ({
      ...prev,
      overwriteExisting: next,
      skipExisting:      next ? false : prev.skipExisting,
    }))
  }

  const sameDay = sourceDate === destinationDate

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-label="Copy assignments">
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>

        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Copy Assignments</h2>
            <p className={styles.modalSub}>
              Carry operator → task pairings from a chosen date into the selected board day.
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className={styles.copyModalBody}>
          <div className={styles.copyDateRow}>
            <label className={styles.taskFormLabel}>
              <span>Source date</span>
              <input
                type="date"
                className={styles.modalSearchInput}
                value={sourceDate}
                onChange={e => onSourceDateChange(e.target.value)}
                max={destinationDate}
                disabled={busy}
                aria-label="Source date"
              />
            </label>
            <span className={styles.copyArrow} aria-hidden="true">→</span>
            <label className={styles.taskFormLabel}>
              <span>Destination (selected day)</span>
              <input
                type="date"
                className={styles.modalSearchInput}
                value={destinationDate}
                readOnly
                aria-label="Destination date (selected board day, read-only)"
              />
            </label>
          </div>

          <p className={styles.copyCountsLine}>
            {sameDay
              ? <span data-tone="warn">Source and destination are the same day — pick an earlier date.</span>
              : <>
                  <strong>{sourceCount}</strong> assignment{sourceCount !== 1 ? 's' : ''} on source.
                  {destCount > 0 && (
                    <> <strong>{destCount}</strong> already on destination.</>
                  )}
                </>
            }
          </p>

          <fieldset className={styles.copyOptions}>
            <legend>Options</legend>

            <label>
              <input
                type="checkbox"
                checked={options.copyTasks}
                onChange={e => setOption('copyTasks', e.target.checked)}
                disabled={busy}
              />
              <span>Copy task assignments</span>
              <small>The operator → task pairing on each row.</small>
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.copyNotes}
                onChange={e => setOption('copyNotes', e.target.checked)}
                disabled={busy}
              />
              <span>Copy English notes</span>
              <small>Spanish translations are not copied — auto-translate refills them.</small>
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.copyEquipment}
                onChange={e => setOption('copyEquipment', e.target.checked)}
                disabled={busy}
              />
              <span>Copy equipment reservations</span>
              <small>Re-attach the same machines to each operator on the destination day.</small>
            </label>

            <hr />

            <label>
              <input
                type="radio"
                name="copy-conflict"
                checked={!!options.skipExisting}
                onChange={e => setSkipExisting(e.target.checked)}
                disabled={busy}
              />
              <span>Skip employees who already have an assignment (recommended)</span>
            </label>

            <label>
              <input
                type="radio"
                name="copy-conflict"
                checked={!!options.overwriteExisting}
                onChange={e => setOverwriteExisting(e.target.checked)}
                disabled={busy}
              />
              <span data-tone="warn">Overwrite existing destination assignments</span>
              <small>Equipment will be unlinked and released back to the task. A confirm dialog will appear.</small>
            </label>
          </fieldset>
        </div>

        <footer className={styles.modalFooter}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onCopy}
            disabled={busy || sameDay || sourceCount === 0}
            title={
              sameDay     ? 'Source and destination are the same day.'
            : sourceCount === 0 ? 'No assignments to copy from the source date.'
            : 'Copy the selected source-day assignments into the destination day.'}
          >
            {busy ? 'Copying…' : 'Copy'}
          </button>
        </footer>
      </div>
    </div>
  )
}
