// Phase 9 — Display Board redesign.
//
// Crew-facing operations board styled like a real superintendent's
// 5:30 AM briefing wall. Three columns + bottom date strip:
//
//   ┌─SIDEBAR──┬─TASK CARDS GRID──────┬─NOTES COLUMN─┐
//   │ brand    │ Cards wrap into      │ Daily        │
//   │ course   │ 2–3 columns; each    │ briefings    │
//   │ date     │ card shows title,    │ + photos     │
//   │ clock    │ equipment chips,     │ + sprays     │
//   │ weather  │ assigned crew rows.  │              │
//   │ equip    │                      │              │
//   └──────────┴──────────────────────┴──────────────┘
//   │ Sun  Mon  Tue  Wed  Thu  Fri  Sat              │
//   └────────────────────────────────────────────────┘
//
// Read-only. Sourced from existing persistent verticals:
//   calendar_events, crew_assignments, equipment_reservations,
//   spray_records, operations_daily_notes, operational_attachments,
//   crew_employees (name only — no payRate / private fields).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCalendarData,    refreshCalendarData }    from '../../utils/calendar/calendarStore'
import { useSpraysData,      refreshSpraysData }      from '../../utils/sprays/spraysStore'
import { useAssignmentsData, refreshAssignmentsData, patchCrewAssignment } from '../../utils/assignments/assignmentsStore'
import { useAlertsData,      refreshAlertsData }      from '../../utils/alerts/alertsStore'
import { useCrewData,        refreshCrewData }        from '../../utils/crew/crewStore'
// Phase E.4 — Kiosk schedule awareness. Two stores + a shared merge
// helper let the kiosk hide assignment bars for operators marked off /
// sick / vacation for selectedDate. Both stores hit anonymous-readable
// endpoints (no payRate, no emergency contact, no other private
// employee fields surface here); the kiosk never gains any new
// authoritative surface, just narrows what it shows.
import { useEmployeeSchedulesData, refreshEmployeeSchedulesData } from '../../utils/schedules/schedulesStore'
import { useScheduleOverridesData, refreshScheduleOverridesData } from '../../utils/schedules/scheduleOverridesStore'
import { isEmployeeAssignableForDate, hasAnyScheduleData, getScheduleStatusForEmployee } from '../../utils/schedules/dailyScheduleMerge'
import { useWeather }         from '../../utils/weather/useWeather'
import { useSelectedCourse, useSelectedCourseId } from '../../utils/courses/courseStore'
import { useOperationsNotesData, refreshOperationsNotesData } from '../../utils/operations/notesStore'
import { useAttachmentsForParent } from '../../utils/attachments/attachmentsStore'
import { useToast } from '../../utils/feedback/toastContext'
import { deleteTaskCascade, buildDeleteConfirmMessage } from '../../utils/tasks/deleteTaskCascade'
import { routingChipsFromTags } from '../../utils/routing/routingTags'
import { weatherImpacts } from '../../utils/weather/weatherImpacts'
// Moisture observations are crew-relevant FIELD FACTS (location + wilt/dry-spot/
// handwater flags) — no private fields. The course condition log (which holds
// private superintendent notes) is intentionally NOT imported here.
import { useMoistureData, refreshMoisture } from '../../utils/moisture/moistureStore'
import OperationalIntelligencePanel from '../../components/shared/OperationalIntelligencePanel'
import styles from './DisplayBoard.module.css'

// Phase 33 — crew progress vocabulary. Schema-free: rides the existing
// crew_assignments.status column (default 'assigned'). 'cancelled' is
// reserved for the clear/unassign flow and isn't a progress state here.
const PROGRESS_STATUSES = [
  { key: 'assigned',  label: 'Assigned',  short: '○' },
  { key: 'completed', label: 'Complete',  short: '✓' },
  { key: 'delayed',   label: 'Delayed',   short: '◷' },
  { key: 'blocked',   label: 'Blocked',   short: '⚠' },
]
const PROGRESS_SHORT = Object.fromEntries(PROGRESS_STATUSES.map(s => [s.key, s.short]))
const PROGRESS_LABEL = Object.fromEntries(PROGRESS_STATUSES.map(s => [s.key, s.label]))

// The board is meant to live on a TV all morning — re-pull the
// operational verticals every few minutes so a task added at 6 AM
// shows up without anyone touching the screen.
const BOARD_REFRESH_MS = 3 * 60 * 1000

// Phase 9C.4a — kiosk (boardMode) refresh interval. /display-board/board
// is the unauthenticated kiosk view, so a faster cadence keeps the TV
// in sync without anyone touching it. Normal /display-board keeps the
// existing 3-minute cadence above; /display-board/print is gated to
// null below so it never re-pulls after the initial mount.
const KIOSK_REFRESH_MS = 60 * 1000

// Phase E.10 — Mobile swipe date navigation thresholds.
//   • SWIPE_MIN_DISTANCE: a horizontal touch must travel at least this
//     many CSS pixels to count as a swipe (filters tiny accidental
//     scrolls / taps).
//   • SWIPE_VERTICAL_TOLERANCE_RATIO: horizontal distance must exceed
//     vertical distance by this factor — otherwise the gesture is a
//     vertical scroll attempt and we let it pass through unmodified.
const SWIPE_MIN_DISTANCE              = 60
const SWIPE_VERTICAL_TOLERANCE_RATIO  = 1.25

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PRIORITY_ORDER = { high: 0, medium: 1, routine: 2, low: 3 }

// Phase DAB.10b — Ordinal labels for an operator's ordered jobs on
// the kiosk. Rendered ONLY when the operator has more than one job
// today (single-job operators keep the existing label-free look).
// Index 4+ falls through to "Job N" via the inline fallback.
const BOARD_ORDINAL_LABELS = ['1st Job', '2nd Job', '3rd Job', '4th Job']
const NOTE_PRIORITY_ORDER = {
  urgent: 0, safety: 1, weather: 2, important: 3, routine: 4,
}

const EVENT_TYPE_LABEL = {
  spray:       'Spray',
  crew:        'Crew',
  maintenance: 'Maintenance',
  agronomy:    'Agronomy',
  irrigation:  'Irrigation',
}

const PRIORITY_LABEL = {
  high: 'HIGH', medium: 'MED', routine: 'ROUTINE', low: 'LOW',
}

function isoToday() { return new Date().toISOString().slice(0, 10) }

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

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const am   = hour < 12
  const h12  = ((hour + 11) % 12) + 1
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`
}

function weekOf(iso) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())   // back to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return day.toISOString().slice(0, 10)
  })
}

function noticeTone(priority) {
  switch (priority) {
    case 'urgent':
    case 'safety':    return 'alert'
    case 'weather':   return 'weather'
    case 'important': return 'important'
    default:          return undefined
  }
}

function titleFromBody(body) {
  if (!body) return 'Briefing'
  const first = body.split('\n')[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

// Phase 9C.5b3 — Bilingual marquee text helper. Joins an English
// {title, body} pair with its Spanish {titleEs, bodyEs} counterpart
// using a ` • ES: ` separator for the kiosk alert marquee. Handles
// the three real-world cases:
//   • English + Spanish — `English — body • ES: Spanish — body`
//   • English only      — `English — body`
//   • Spanish only      — `ES: Spanish — body`
//   • both empty        — '' (caller's filter strips the item)
//
// Used by both the liveAlerts arm (passes `body: a.message`) and the
// dayNotes arm (passes `body: n.body`) of the kioskAlerts derivation,
// so alerts and daily notes share a single concatenation contract.
//
// Phase 9C.5c4 — opt-out gate. When includeSpanish is false the helper
// returns the English-only text and never appends `• ES: …`, even when
// a Spanish translation exists. The caller computes this flag from the
// employee translation prefs (kioskAlerts derivation passes
// `boardNeedsSpanish` based on whether any operator on today's board
// has autoTranslateBoardNotes + boardLanguage='es' enabled). Manual
// `titleEs`/`bodyEs` stays in the database either way; it just doesn't
// reach the marquee when no operator on today's board needs it.
function formatBilingualText({ title, body, titleEs, bodyEs, includeSpanish = true }) {
  const en = title ? `${title}${body ? ' — ' + body : ''}` : (body ?? '')
  const enTrim = en.trim()
  if (!includeSpanish) return enTrim
  const es = titleEs ? `${titleEs}${bodyEs ? ' — ' + bodyEs : ''}` : (bodyEs ?? '')
  const esTrim = es.trim()
  if (enTrim && esTrim) return `${enTrim} • ES: ${esTrim}`
  if (esTrim)            return `ES: ${esTrim}`
  return enTrim
}

// Phase 9C.5c4 — Per-employee translation gate. Returns true when this
// employee has BOTH `autoTranslateBoardNotes` enabled AND `boardLanguage`
// set to a non-English locale ('es' for now; future languages can extend
// the second condition). Missing/null employee → false (e.g. fallback
// assignments where employeeId is null and the lookup misses).
//
// Used by:
//   • BoardModeCrewBars  — to gate the Spanish note <p> per operator
//   • kioskAlerts        — to compute `boardNeedsSpanish` (any operator
//                          on today's board needing Spanish triggers
//                          bilingual marquee text)
function employeeNeedsSpanish(employee) {
  return Boolean(employee?.autoTranslateBoardNotes) && employee?.boardLanguage === 'es'
}

// ── Main component ───────────────────────────────────────────────────────

export default function DisplayBoard({ boardMode = false, printMode = false }) {
  const navigate                                    = useNavigate()
  const { events, loading: eventsLoading }          = useCalendarData()
  const { records: sprays }                         = useSpraysData()
  const { crewAssignments, equipmentReservations }  = useAssignmentsData()
  const { alerts }                                  = useAlertsData()
  const { employees }                               = useCrewData()
  // Phase E.4 — Public-safe schedule + override stores. Both endpoints
  // return only schedule grid fields (no payRate, no contact info, no
  // private notes), so the kiosk's no-login contract is preserved.
  const { schedules: weeklySchedules }              = useEmployeeSchedulesData()
  const { overrides: scheduleOverrides }            = useScheduleOverridesData()
  const { current, forecast, sourceLabel: weatherSource } = useWeather()
  const selectedCourse                              = useSelectedCourse()
  // Phase 8B.1a — Crosswinds shop-style Display Board layout shell.
  // Drives `data-shop-layout="true"` on the root, which CSS uses to
  // re-arrange the existing sidebar / taskBoard / notesColumn /
  // dateStrip subtrees into a 4-region grid (left / center / right /
  // bottom). No iteration model change yet — that's Phase 8B.1b.
  const courseId       = useSelectedCourseId()
  const isCrosswinds   = courseId === 'crossroads-gc'
  const { notes: dailyNotes }                       = useOperationsNotesData()
  const { observations: moistureObs }               = useMoistureData()
  const toast                                       = useToast()

  // Phase 9C.3b — task delete handler. Reuses the Phase 9C.3a cascade
  // helper + shared confirm copy. Gated by canDeleteTasks below so the
  // affordance never renders in TV (boardMode) or print mode, where an
  // accidental tap could be catastrophic.
  const canDeleteTasks = !boardMode && !printMode
  async function handleDeleteEvent(event) {
    if (!event?.id) return
    const linkedCrewCount = crewAssignments.filter(a => a.calendarEventId === event.id).length
    const linkedEqCount   = equipmentReservations.filter(r => r.calendarEventId === event.id).length
    if (!confirm(buildDeleteConfirmMessage(event.title ?? '', linkedCrewCount, linkedEqCount))) return
    try {
      await deleteTaskCascade(event.id, { crewAssignments, equipmentReservations })
      toast?.success?.(`"${event.title ?? 'Task'}" deleted`)
    } catch (err) {
      toast?.error?.(`Delete failed: ${err.message}`)
    }
  }

  // Display date — defaults to today, can shift via the date selector.
  const [selectedDate, setSelectedDate] = useState(isoToday)

  // Phase 9C.6 — Kiosk date navigation arrows. Tracks whether the
  // user manually shifted the board date (via ‹ / › on the kiosk).
  // Resets to false on every page load — there's no persistence,
  // so a refresh always lands on today. The midnight-rollover
  // effect below gates on !boardDateTouched so a user-pinned
  // past/future date sticks across 60s polls and across midnight.
  const [boardDateTouched, setBoardDateTouched] = useState(false)

  // Move the board's displayed date by `delta` days and flag the
  // session as user-touched so the midnight rollover stops snapping
  // back to today. Used by the boardMode early-return's date header
  // arrows; reuses the shared shiftDate helper for ISO arithmetic.
  function shiftBoardDate(delta) {
    setBoardDateTouched(true)
    setSelectedDate(prev => shiftDate(prev, delta))
  }

  // Phase E.10 — Mobile swipe date navigation. Tracks the start of
  // each touch in a ref (no re-render) and compares against the
  // endpoint in handleTouchEnd. Only fires shiftBoardDate when:
  //   • horizontal distance >= SWIPE_MIN_DISTANCE
  //   • |dx| > |dy| * SWIPE_VERTICAL_TOLERANCE_RATIO
  // Either condition failing → the gesture is treated as a normal
  // vertical scroll or an accidental tap and propagates unchanged.
  // We don't preventDefault — buttons + the date picker still work,
  // and vertical scrolling on the crew bars stays smooth.
  const touchStartRef = useRef(null)

  function handleBoardTouchStart(e) {
    const t = e.touches?.[0]
    if (!t) return
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleBoardTouchEnd(e) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    if (absDx < SWIPE_MIN_DISTANCE) return                          // too short — likely a tap
    if (absDx < absDy * SWIPE_VERTICAL_TOLERANCE_RATIO) return      // vertical-dominant — let scrolling win
    // dx > 0 → finger moved right → swipe RIGHT → previous day
    // dx < 0 → finger moved left  → swipe LEFT  → next day
    shiftBoardDate(dx > 0 ? -1 : 1)
  }

  // Phase E.10b — Clickable date title opens a native date picker.
  // The button shows the formatted date; a sibling <input type="date">
  // is visually hidden but stays in the DOM so it can receive focus +
  // host the platform date picker. showPicker() is the modern path
  // (Chrome 99+, Safari 16.4+, Firefox 101+); we fall back to focus()
  // then click() for older browsers.
  const dateInputRef = useRef(null)

  function handleDateTitleClick() {
    const el = dateInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      // Some browsers throw if the input isn't focused first; fall
      // through to the alternate paths.
    }
    if (typeof el.focus === 'function') el.focus()
    if (typeof el.click === 'function') el.click()
  }

  function handleDatePickerChange(e) {
    const next = e.target.value
    if (typeof next !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return
    setBoardDateTouched(true)
    setSelectedDate(next)
  }

  // Live clock — tick every second.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-refresh the operational verticals so a board left on a TV
  // stays live without a manual reload. Weather already self-refreshes
  // inside useWeather.
  const [lastSync, setLastSync] = useState(() => new Date())
  // Phase 9C.4a — mode-aware refresh cadence.
  //   printMode  → null  (no auto-refresh; the page prints once)
  //   boardMode  → 60s   (public kiosk needs a fast feed)
  //   normal     → 3min  (legacy behaviour preserved)
  const intervalMs = printMode ? null : (boardMode ? KIOSK_REFRESH_MS : BOARD_REFRESH_MS)
  useEffect(() => {
    if (intervalMs == null) return
    const id = setInterval(() => {
      Promise.allSettled([
        refreshCalendarData(),
        refreshSpraysData(),
        refreshAssignmentsData(),
        refreshAlertsData(),
        refreshCrewData(),
        refreshOperationsNotesData(),
        refreshMoisture(),
        // Phase E.4 — Keep the schedule + override stores fresh so a
        // mid-shift "called out sick" override propagates to the
        // kiosk on the next tick. Both stores are public-safe — they
        // expose only the schedule grid, never private employee
        // profile fields. Auto-refresh interval itself unchanged.
        refreshEmployeeSchedulesData(),
        refreshScheduleOverridesData(),
      ]).then(() => setLastSync(new Date()))
      // Phase 9C.4a — midnight rollover for the public kiosk view.
      // If the kiosk has been up since yesterday, snap selectedDate
      // forward to today so the bars show the current day's work.
      // Only fires in boardMode — normal /display-board users keep
      // whichever date they manually picked.
      //
      // Phase 9C.6 — Additionally gated on !boardDateTouched so a user
      // who has shifted the kiosk date with the new ‹ / › arrows is
      // not yanked back to today on the next 60s tick or at midnight.
      // boardDateTouched is in-memory only; a page reload resets it
      // and the kiosk lands on today again.
      if (boardMode && !boardDateTouched) {
        const todayNow = isoToday()
        if (selectedDate !== todayNow) setSelectedDate(todayNow)
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, boardMode, selectedDate, boardDateTouched])

  // First-paint guard — before the calendar store resolves, every
  // section would otherwise render its empty state ("No tasks…"),
  // making a freshly-opened board look broken.
  const isFirstLoad = eventsLoading && events.length === 0

  // Phase 6B.3 — print-mode auto-trigger. The /display-board/print route
  // mounts this with printMode=true, expecting a one-shot browser print
  // dialog after the data resolves. The ref guards against StrictMode's
  // double-mount in dev and against re-renders re-firing print().
  const printedRef = useRef(false)
  const [printedAt] = useState(() => new Date())
  useEffect(() => {
    if (!printMode) return
    if (printedRef.current) return
    if (isFirstLoad) return
    printedRef.current = true
    // Small delay so layout settles (fonts, chips, page-break-before)
    // before the dialog snapshots the document.
    const id = setTimeout(() => {
      try { window.print() } catch { /* no-op in non-browser hosts */ }
    }, 400)
    return () => clearTimeout(id)
  }, [printMode, isFirstLoad])

  // ── Crew name lookup (ID → name; never reads payRate) ─────────────────
  const employeeNameLookup = useMemo(() => {
    const m = new Map()
    for (const e of employees) m.set(e.id, e.name ?? e.fullName ?? '—')
    return m
  }, [employees])

  // Phase 9C.5c4 — Full employee lookup by id, so operatorCards can
  // read the per-employee translation prefs (autoTranslateBoardNotes,
  // boardLanguage) when deciding whether to surface the Spanish line.
  // Stays public-safe by design: the 9C.5a.5 private-fields gate
  // strips payRate / emergencyContact / etc. from the kiosk's GET, so
  // this Map only ever holds the public columns + the translation
  // prefs added in 9C.5c1.
  const employeeById = useMemo(() => {
    const m = new Map()
    for (const e of employees) m.set(e.id, e)
    return m
  }, [employees])

  // ── Date-scoped derivations ───────────────────────────────────────────
  const dayEvents = useMemo(() => {
    return events
      .filter(e => e.startDate === selectedDate)
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 9
        const pb = PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (a.startTime ?? '').localeCompare(b.startTime ?? '')
      })
  }, [events, selectedDate])

  const dayEventIds = useMemo(
    () => new Set(dayEvents.map(e => e.id)),
    [dayEvents],
  )

  const daySprays = useMemo(() => {
    return sprays
      .filter(s => s.date === selectedDate && s.status !== 'deleted')
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }, [sprays, selectedDate])

  const dayEquipment = useMemo(() => {
    return equipmentReservations
      .filter(r => r.calendarEventId && dayEventIds.has(r.calendarEventId))
      .filter(r => r.status !== 'cancelled' && r.status !== 'released')
  }, [equipmentReservations, dayEventIds])

  const dayCrew = useMemo(() => {
    return crewAssignments
      .filter(a => a.calendarEventId && dayEventIds.has(a.calendarEventId))
      .filter(a => a.status !== 'cancelled')
  }, [crewAssignments, dayEventIds])

  const liveAlerts = useMemo(() => {
    return (alerts ?? [])
      .filter(a => a.status !== 'dismissed' && a.status !== 'acknowledged')
      .slice(0, 6)
  }, [alerts])

  const dayNotes = useMemo(() => {
    return (dailyNotes ?? [])
      .filter(n => n.status === 'active')
      .filter(n => n.noteDate === selectedDate)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const pa = NOTE_PRIORITY_ORDER[a.priority] ?? 9
        const pb = NOTE_PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
  }, [dailyNotes, selectedDate])

  // Per-event lookup for equipment + crew (so the card render is O(N) total).
  const equipByEvent = useMemo(() => {
    const m = new Map()
    for (const r of dayEquipment) {
      if (!m.has(r.calendarEventId)) m.set(r.calendarEventId, [])
      m.get(r.calendarEventId).push(r)
    }
    return m
  }, [dayEquipment])

  const crewByEvent = useMemo(() => {
    const m = new Map()
    for (const a of dayCrew) {
      if (!m.has(a.calendarEventId)) m.set(a.calendarEventId, [])
      m.get(a.calendarEventId).push(a)
    }
    return m
  }, [dayCrew])

  // ── Phase 8B.1b — operator-first card derivation (Crosswinds shop view) ─
  // Re-buckets the existing dayCrew rows by operator instead of by event.
  // Each operator → numbered assignment list, status, notes, and the
  // Phase 10 linked equipment chips for that specific assignment.
  // Orphan rows (no employee key, or pointing to a missing event) are
  // skipped. Unlinked task-level chips are intentionally omitted here
  // to avoid duplication across multiple operators on the same event;
  // they remain visible in the EquipmentStatusPanel in the sidebar.
  const operatorCards = useMemo(() => {
    const eventsById = new Map(dayEvents.map(e => [e.id, e]))
    const byOperator = new Map()
    for (const a of dayCrew) {
      const key = a.employeeId ?? a.employeeName
      if (!key) continue
      const event = eventsById.get(a.calendarEventId)
      if (!event) continue
      if (!byOperator.has(key)) {
        // Phase 9C.5c4 — Resolve the employee row (when known) so we
        // can pin showSpanishNotes ONCE when the operator card is
        // created. Per-employee translation prefs don't change inside
        // a single operatorCards build, so computing here keeps the
        // hot loop below ignorant of the employees array.
        const employee = a.employeeId ? employeeById.get(a.employeeId) : null
        byOperator.set(key, {
          key,
          employeeId:        a.employeeId ?? null,
          employeeName:      a.employeeId
                              ? (employeeNameLookup.get(a.employeeId) ?? a.employeeName)
                              : a.employeeName,
          role:              a.role ?? null,
          // Phase 9C.5c4 — per-operator Spanish gate. False when the
          // employee row is missing (legacy assignments without
          // employeeId, or an employee deleted after assignment).
          showSpanishNotes:  employeeNeedsSpanish(employee),
          assignments:       [],
        })
      }
      const op = byOperator.get(key)
      const allChipsForEvent = equipByEvent.get(event.id) ?? []
      const linkedChips = allChipsForEvent
        .filter(r => r.crewAssignmentId === a.id)
        .map(r => ({ id: r.id, name: r.equipmentName, status: r.status }))
      // Fallback to event.equipment[] payload only when the event has
      // zero reservation rows at all (legacy data path).
      const fallbackChips = (linkedChips.length === 0 && allChipsForEvent.length === 0)
        ? (event.equipment ?? []).map((name, i) => ({
            id: `eq-${event.id}-${i}`, name, status: null,
          }))
        : []
      op.assignments.push({
        id:        a.id,
        // Phase 9C.3b — carry the source calendar_event id so the
        // OperatorCard delete handler can route to deleteTaskCascade
        // by event, not by crew_assignment.
        eventId:   event.id,
        title:     event.title,
        startTime: event.startTime ?? null,
        location:  event.location  ?? null,
        eventType: event.eventType ?? null,
        priority:  event.priority  ?? null,
        status:    a.status ?? 'assigned',
        notes:     a.notes   ?? '',
        // Phase 9C.5b3 — manual Spanish translation surfaced on the
        // kiosk underneath the English note. Empty string when not
        // authored; BoardModeCrewBars gates the render on a non-empty
        // trim so blank Spanish stays invisible.
        notesEs:   a.notesEs ?? '',
        chips:     linkedChips.length > 0 ? linkedChips : fallbackChips,
        // Phase DAB.10b — per-employee-per-day ordinal position
        // (0..N-1). Drives the "1st Job / 2nd Job / 3rd Job" labels
        // + sort order below. Legacy rows have jobOrder=0; ties
        // break by startTime ASC.
        jobOrder:  a.jobOrder ?? 0,
      })
    }
    for (const op of byOperator.values()) {
      // Phase DAB.10b — Primary sort is jobOrder ASC (the supervisor's
      // explicit ordering). startTime ASC then priority break ties.
      // Legacy rows with jobOrder=0 fall through to the existing
      // startTime/priority sort unchanged.
      op.assignments.sort((x, y) => {
        const jx = x.jobOrder ?? 0
        const jy = y.jobOrder ?? 0
        if (jx !== jy) return jx - jy
        const t = (x.startTime ?? '').localeCompare(y.startTime ?? '')
        if (t !== 0) return t
        return (PRIORITY_ORDER[x.priority] ?? 9) - (PRIORITY_ORDER[y.priority] ?? 9)
      })
    }
    // Phase E.9 — Off / sick / vacation employees are no longer hidden
    // from the kiosk. Two changes:
    //
    //   1. Operator cards with an out-status get their assignments
    //      stripped (so the assigned task / equipment / notes don't
    //      bleed into the out card) and a new outStatus tag set.
    //   2. Active employees who are out today but have no assignment
    //      row at all are SEEDED into the card list so the kiosk
    //      surfaces "Joe — Off" even when Joe was never scheduled to a
    //      task today. We use employeeNameLookup (anonymous-safe name
    //      only) so no private field can leak into this code path.
    //
    // Fallback rule preserved: when BOTH schedule stores are empty,
    // there's no "out" data at all so we leave assignment-derived
    // cards intact and add nothing new.
    const scheduleAware = hasAnyScheduleData(weeklySchedules, scheduleOverrides)
    if (scheduleAware) {
      for (const op of byOperator.values()) {
        if (!op.employeeId) continue        // legacy assignment without employeeId — leave alone
        const merged = getScheduleStatusForEmployee(
          op.employeeId, selectedDate, weeklySchedules, scheduleOverrides,
        )
        if (!merged || merged.status === 'scheduled') continue
        op.outStatus = merged.status        // 'off' | 'sick' | 'vacation'
        op.assignments = []                  // do not show prior assignments / notes / chips
      }
      // Seed cards for out-status active employees who don't already
      // have any assignment row today.
      for (const emp of employees ?? []) {
        if (!emp.id || emp.status === 'inactive') continue
        if (byOperator.has(emp.id)) continue
        const merged = getScheduleStatusForEmployee(
          emp.id, selectedDate, weeklySchedules, scheduleOverrides,
        )
        if (!merged || merged.status === 'scheduled') continue
        byOperator.set(emp.id, {
          key:              emp.id,
          employeeId:       emp.id,
          employeeName:     employeeNameLookup.get(emp.id) ?? emp.name,
          role:             null,
          // Phase 9C.5c4 — Spanish gate unused on out cards (no
          // assignment notes to translate) but pin to false so the
          // shape stays uniform with assigned cards.
          showSpanishNotes: false,
          outStatus:        merged.status,
          assignments:      [],
        })
      }
    }

    // Sort: scheduled (with assignments) first, then out cards. Within
    // each bucket, alphabetical by name.
    const cards = [...byOperator.values()].sort((x, y) => {
      const xOut = x.outStatus ? 1 : 0
      const yOut = y.outStatus ? 1 : 0
      if (xOut !== yOut) return xOut - yOut
      return (x.employeeName ?? '').localeCompare(y.employeeName ?? '')
    })
    return cards
  }, [
    dayCrew, dayEvents, equipByEvent, employeeNameLookup, employeeById, employees,
    // Phase E.4 / E.9 — re-bucket when schedules / overrides / selectedDate change
    weeklySchedules, scheduleOverrides, selectedDate,
  ])

  // ── Crew-facing weather impacts (rule-based, from existing weather) ─────
  const impacts = useMemo(
    () => weatherImpacts(current ?? {}, forecast ?? []),
    [current, forecast],
  )

  // ── Course watch areas (crew-relevant moisture flags) ──────────────────
  // Only field facts: location + which flag. No moisture %, no deficit, no
  // private condition-log data. Newest observation per location wins; only
  // recent (≤36h) flagged observations surface so stale reads don't linger.
  const watchAreas = useMemo(() => {
    const nowMs = now.getTime()   // from the live clock state → pure per render
    const seen = new Set()
    const out = []
    for (const o of moistureObs ?? []) {        // store is newest-first
      if (!o?.location || seen.has(o.location)) continue
      seen.add(o.location)
      const ageH = (nowMs - Date.parse(o.observedAt)) / 3_600_000
      if (!Number.isFinite(ageH) || ageH > 36) continue
      const flags = []
      if (o.handwaterRec) flags.push('Handwater')
      if (o.wiltStress)   flags.push('Wilt')
      if (o.drySpot)      flags.push('Dry spot')
      if (flags.length > 0) out.push({ id: o.id, location: o.location, flags })
    }
    return out.slice(0, 8)
  }, [moistureObs, now])

  // ── Render ────────────────────────────────────────────────────────────
  const rootCls =
    boardMode ? `${styles.root} ${styles.rootBoard}`
    : printMode ? `${styles.root} ${styles.rootPrint}`
    : styles.root
  const weekIsos = weekOf(selectedDate)
  const todayIso = isoToday()

  // Phase 8B.1a — pick a high-priority alert (if any) to surface in
  // the bottom banner of the shop layout. Falls back silently to
  // no-banner when none exist. Read only — pulls from liveAlerts,
  // which is already capped/cleaned upstream.
  const topAlert = isCrosswinds
    ? (liveAlerts.find(a => a.priority === 'high') ?? null)
    : null

  // Phase 9C.5a — Public-safe alert stream that feeds the kiosk marquee.
  // Derived above the early-return so the `if (boardMode && !printMode)
  // { return ( ... ) }` block stays a one-liner (matches the existing
  // regression-couple regexes in the display-board smokes).
  //
  // Sources (both already filtered to non-dismissed, crew-visible items
  // by their respective stores / derivations):
  //   • liveAlerts                                — alerts table
  //   • dayNotes restricted to crew-broadcast       — operations_daily_notes
  //     priorities (urgent | safety | weather)
  //
  // Routine + important notes intentionally stay on the admin board.
  // The private superintendent-only condition log fields are never
  // touched here; the privacy smoke continues to assert that this
  // source file does not reference them by name.
  // Phase 9C.5c4 — Board-wide Spanish gate. The kiosk marquee is a
  // single shared surface (not per-operator), so we only surface
  // bilingual marquee text when at least one operator on today's board
  // has translation enabled. Falls to false when no operator needs
  // Spanish, leaving the marquee English-only even if titleEs / bodyEs
  // / messageEs are present in the database.
  const boardNeedsSpanish = operatorCards.some(op => op.showSpanishNotes)

  // Phase 9C.5b3 — both arms now route through formatBilingualText so
  // Spanish (when authored) is appended after a ` • ES: ` marker. Empty
  // Spanish leaves the text English-only; empty English leaves it
  // Spanish-only with an ES: prefix; both blank → text === '' and the
  // final .filter strips the item.
  //
  // Phase 9C.5c4 — includeSpanish: boardNeedsSpanish opts the whole
  // marquee in or out of bilingual text based on today's operator
  // roster. When no operator needs Spanish the helper returns the
  // English-only string and the ` • ES: ` suffix is suppressed.
  const kioskAlerts = [
    ...liveAlerts.map(a => ({
      key:      `alert:${a.id}`,
      text:     formatBilingualText({
        title:          a.title,
        body:           a.message,
        titleEs:        a.titleEs,
        bodyEs:         a.messageEs,
        includeSpanish: boardNeedsSpanish,
      }),
      priority: a.priority,
    })),
    ...dayNotes
      .filter(n => n.priority === 'urgent' || n.priority === 'safety' || n.priority === 'weather')
      .map(n => ({
        key:      `note:${n.id}`,
        text:     formatBilingualText({
          title:          n.title,
          body:           n.body,
          titleEs:        n.titleEs,
          bodyEs:         n.bodyEs,
          includeSpanish: boardNeedsSpanish,
        }),
        priority: n.priority,
      })),
  ].filter(a => (a.text ?? '').trim().length > 0)

  // Phase 9C.4b — Simplified kiosk layout for /display-board/board.
  // No sidebar, no notes column, no weather/intelligence cards, no
  // 7-day strip, no exit link, no delete buttons. Just one wide bar
  // per assigned operator showing name + task(s) + notes. View-only
  // by design (the route stays public per Phase 9C.4a). Guarded
  // against printMode so the print path never reaches this branch.
  //
  // Phase 9C.5a — Date moved from a bottom <footer> to a top <header>,
  // and a red scrolling alert marquee renders immediately below it.
  if (boardMode && !printMode) {
    return (
      <div
        className={`${styles.root} ${styles.rootBoard} ${styles.boardSimple}`}
        data-board-mode="true"
        onTouchStart={handleBoardTouchStart}
        onTouchEnd={handleBoardTouchEnd}
      >
        {/* Phase 9C.6 — Date navigation arrows. ‹ / › shift selectedDate
            by one day in-memory; the date label remains centered.
            Phase E.10b — Date label is now a button that opens a
            native date picker (via the hidden sibling <input>). All
            three controls + the E.10 swipe gesture mutate the same
            selectedDate state, so the kiosk stays no-login + side-
            effect-free. */}
        <header className={styles.boardDateTop}>
          <button
            type="button"
            className={`${styles.boardDateArrow} ${styles.boardDateNav}`}
            onClick={() => shiftBoardDate(-1)}
            aria-label="Previous board date"
            title="Previous day"
          >
            <span className={styles.boardDateNavIcon} aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={`${styles.boardDateLabel} ${styles.boardDateTitleButton}`}
            onClick={handleDateTitleClick}
            aria-label="Choose display date"
            title="Choose display date"
          >
            {prettyDate(selectedDate)}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={handleDatePickerChange}
            className={styles.boardDateNativeInput}
            aria-label="Choose display date"
            tabIndex={-1}
          />
          <button
            type="button"
            className={`${styles.boardDateArrow} ${styles.boardDateNav}`}
            onClick={() => shiftBoardDate(1)}
            aria-label="Next board date"
            title="Next day"
          >
            <span className={styles.boardDateNavIcon} aria-hidden="true">›</span>
          </button>
        </header>
        {/* Phase 9C.10 — Daily Notes strip. Reuses the already-derived
            dayNotes memo (selectedDate-filtered, active-only, pinned-and-
            priority-sorted). Renders null when empty so the kiosk stays
            clean on calm mornings — no wasted TV real-estate. */}
        <BoardModeDailyNotes notes={dayNotes} />
        <BoardModeAlertMarquee alerts={kioskAlerts} />
        <BoardModeCrewBars operatorCards={operatorCards} />
      </div>
    )
  }

  return (
    <div
      className={`${rootCls}${isCrosswinds ? ' ' + styles.dbWrapShop : ''}`}
      data-print-mode={printMode ? 'true' : undefined}
      data-board-mode={boardMode ? 'true' : undefined}
      data-shop-layout={isCrosswinds ? 'true' : undefined}
    >

      <div className={styles.printHeader} aria-hidden="true">
        {selectedCourse?.shortName ?? selectedCourse?.name ?? 'TurfIntel'}
        {' · '}{prettyDate(selectedDate)}
      </div>

      <aside className={`${styles.sidebar}${isCrosswinds ? ' ' + styles.dbLeft : ''}`}>
        <BrandHeader course={selectedCourse} />

        <DateClockPanel
          selectedDate={selectedDate}
          onChange={setSelectedDate}
          now={now}
          todayIso={todayIso}
        />

        <ConditionsPanel current={current} forecast={forecast} sourceLabel={weatherSource} />

        <WeatherImpactsPanel impacts={impacts} />

        <EquipmentStatusPanel
          reservations={dayEquipment}
          eventTitleLookup={Object.fromEntries(dayEvents.map(e => [e.id, e.title]))}
        />

        <div className={styles.syncLine}>
          Synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}auto-refresh 3 min
        </div>

        <ModeToggle boardMode={boardMode} navigate={navigate} />
      </aside>

      <main className={`${styles.taskBoard}${isCrosswinds ? ' ' + styles.dbCenter : ''}`}>
        <header className={styles.taskBoardHeader}>
          <h1 className={styles.taskBoardTitle}>Daily Operations Board</h1>
          <span className={styles.taskBoardSubtitle}>
            {prettyDate(selectedDate)}
            {dayEvents.length > 0 && ` · ${dayEvents.length} task${dayEvents.length !== 1 ? 's' : ''}`}
          </span>
        </header>

        {dayEvents.length === 0 ? (
          <div className={styles.emptyBoard}>
            {isFirstLoad ? (
              <p>Loading operations board…</p>
            ) : (
              <>
                <p>No tasks scheduled for {prettyDate(selectedDate)}.</p>
                <p className={styles.emptyHint}>
                  Tasks added in Operations &gt; Operations Board appear here automatically.
                </p>
              </>
            )}
          </div>
        ) : (isCrosswinds && operatorCards.length > 0) ? (
          /* Phase 8B.1b — Crosswinds operator-first cards.
             Fall back to the legacy TaskCard grid when Crosswinds has
             tasks but no DB-backed crew assignments yet, so the board
             never goes blank. */
          <div className={styles.tasksGrid}>
            {operatorCards.map(op => (
              <OperatorCard
                key={op.key}
                operator={op}
                canDeleteTasks={canDeleteTasks}
                onDeleteEvent={handleDeleteEvent}
              />
            ))}
          </div>
        ) : (
          <div className={styles.tasksGrid}>
            {dayEvents.map(ev => (
              <TaskCard
                key={ev.id}
                event={ev}
                equipment={equipByEvent.get(ev.id) ?? []}
                crew={crewByEvent.get(ev.id) ?? []}
                resolveName={empId => employeeNameLookup.get(empId)}
                canDeleteTasks={canDeleteTasks}
                onDeleteEvent={handleDeleteEvent}
              />
            ))}
          </div>
        )}
      </main>

      <aside className={`${styles.notesColumn}${isCrosswinds ? ' ' + styles.dbRight : ''}`}>
        <OperationalIntelligencePanel />
        <CrewBriefingPanel notes={dayNotes} alerts={liveAlerts} events={dayEvents} />
        <FieldConditionsPanel watchAreas={watchAreas} sprays={daySprays} />
      </aside>

      {/* Phase 6B.3 — print-only Page 2.
          Wide-interpretation notes block: Operational Intelligence,
          Crew Briefing (supervisor notes + alerts), Field Conditions
          (watch areas + sprays). Lives outside the screen grid so the
          existing layout stays untouched; CSS gates visibility to
          [data-print-mode] / @media print. */}
      {printMode && (
        <section className={styles.printPage2} aria-label="Operational details">
          <OperationalIntelligencePanel />
          <CrewBriefingPanel notes={dayNotes} alerts={liveAlerts} events={dayEvents} />
          <FieldConditionsPanel watchAreas={watchAreas} sprays={daySprays} />
        </section>
      )}

      {printMode && (
        <div className={styles.printFooter} aria-hidden="true">
          Printed {printedAt.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
          {' · TurfIntel Display Board'}
        </div>
      )}

      <footer className={`${styles.dateStrip}${isCrosswinds ? ' ' + styles.dbBottom : ''}`}>
        {isCrosswinds && topAlert && (
          <div
            className={styles.dbAlertBanner}
            data-priority="high"
            role="alert"
            aria-live="polite"
          >
            <span className={styles.dbAlertBannerTitle}>{topAlert.title}</span>
            {topAlert.message && (
              <span className={styles.dbAlertBannerMsg}>{topAlert.message}</span>
            )}
          </div>
        )}
        {weekIsos.map((iso, i) => {
          const dnum = Number(iso.slice(8, 10))
          const isSelected = iso === selectedDate
          const isToday    = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              className={
                `${styles.dateCell}`
                + (isSelected ? ` ${styles.dateCellActive}` : '')
                + (isToday    ? ` ${styles.dateCellToday}`  : '')
              }
              onClick={() => setSelectedDate(iso)}
            >
              <span className={styles.dateCellLabel}>{DAY_LABELS[i]}</span>
              <span className={styles.dateCellNum}>{dnum}</span>
            </button>
          )
        })}
      </footer>
    </div>
  )
}

/* ── Sidebar pieces ─────────────────────────────────────────────────── */

function BrandHeader({ course }) {
  return (
    <div className={styles.brand}>
      <span className={styles.brandMark}>TurfIntel</span>
      <span className={styles.brandCourse}>
        {course?.shortName ?? course?.name ?? '—'}
      </span>
    </div>
  )
}

function DateClockPanel({ selectedDate, onChange, now, todayIso }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return (
    <div className={styles.dateClockPanel}>
      <div className={styles.dateRow}>
        <button
          type="button"
          className={styles.dateNav}
          onClick={() => onChange(shiftDate(selectedDate, -1))}
          aria-label="Previous day"
        >‹</button>
        <span className={styles.dateText}>{selectedDate}</span>
        <button
          type="button"
          className={styles.dateNav}
          onClick={() => onChange(shiftDate(selectedDate, 1))}
          aria-label="Next day"
        >›</button>
      </div>
      {selectedDate !== todayIso && (
        <button
          type="button"
          className={styles.todayBtn}
          onClick={() => onChange(todayIso)}
        >
          Jump to today
        </button>
      )}
      <div className={styles.clock}>
        <span className={styles.clockH}>{hh}</span>
        <span className={styles.clockSep}>:</span>
        <span className={styles.clockM}>{mm}</span>
        <span className={styles.clockS}>:{ss}</span>
      </div>
    </div>
  )
}

function ConditionsPanel({ current, forecast, sourceLabel }) {
  const temp = current?.currentTemp
  const has  = Number.isFinite(temp)
  const next = forecast?.[0]
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>
        Current Conditions
        {sourceLabel && (
          <span className={styles.sourceTag}>{sourceLabel}</span>
        )}
      </span>
      {has ? (
        <>
          <span className={styles.bigTemp}>{Math.round(temp)}°F</span>
          {current?.wind != null && (
            <span className={styles.sidePanelSub}>
              Wind {current.wind}{current.windDir ? ` ${current.windDir}` : ''}
              {current.windGust != null && ` · gust ${Math.round(current.windGust)}`}
            </span>
          )}
          {current?.humidity != null && (
            <span className={styles.sidePanelSub}>Humidity {current.humidity}%</span>
          )}
          {current?.dewPoint != null && (
            <span className={styles.sidePanelSub}>Dew Point {current.dewPoint}°F</span>
          )}
        </>
      ) : (
        <span className={styles.sidePanelEmpty}>Weather not loaded.</span>
      )}
      {next && (next.label || next.shortForecast) && (
        <div className={styles.forecastRow}>
          <span className={styles.sidePanelSub}>
            Tomorrow: <strong>{next.label ?? next.shortForecast}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

// Crew-facing weather impacts — glanceable chips, hidden when nothing notable.
function WeatherImpactsPanel({ impacts }) {
  if (!impacts || impacts.length === 0) return null
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>Weather Impacts</span>
      <div className={styles.impactRow}>
        {impacts.map(im => (
          <span key={im.key} className={styles.impactChip} data-severity={im.severity}>
            {im.label}{im.detail ? ` · ${im.detail}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function EquipmentStatusPanel({ reservations, eventTitleLookup }) {
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>Equipment Status</span>
      {reservations.length === 0 ? (
        <span className={styles.sidePanelEmpty}>No equipment reserved today.</span>
      ) : (
        <ul className={styles.equipList}>
          {reservations.map(r => (
            <li key={r.id} className={styles.equipRow}>
              <span className={styles.equipChip}>{r.equipmentName}</span>
              <span className={styles.equipMeta}>
                {eventTitleLookup[r.calendarEventId] ?? '—'}
              </span>
              <span className={styles.equipStatus} data-status={r.status}>{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ModeToggle({ boardMode, navigate }) {
  if (boardMode) {
    return (
      <Link to="/display-board" className={styles.modeBtn}>← Exit Board Mode</Link>
    )
  }
  return (
    <button
      type="button"
      className={styles.modeBtn}
      onClick={() => navigate('/display-board/board')}
    >
      Board Mode →
    </button>
  )
}

/* ── Operator card (Phase 8B.1b — Crosswinds shop view) ─────────────────
 * Renders one card per assigned operator with a numbered list of that
 * operator's assignments for the selected day. Each assignment line
 * carries: title + time + location + meta, optional notes, linked
 * equipment chips, and the existing CrewStatusControl picker so the
 * shop can mark progress directly from the TV. Read-only on layout —
 * the only mutating affordance is the status/notes picker, which
 * writes through patchCrewAssignment exactly like TaskCard does. */

function operatorInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function OperatorCard({ operator, canDeleteTasks = false, onDeleteEvent }) {
  const { employeeName, role, assignments } = operator
  return (
    <article className={styles.operatorCard}>
      <header className={styles.operatorCardHeader}>
        <span className={styles.operatorAvatar} aria-hidden="true">
          {operatorInitials(employeeName)}
        </span>
        <div className={styles.operatorNameBlock}>
          <h2 className={styles.operatorName}>{employeeName ?? 'Unassigned'}</h2>
          {role && <span className={styles.operatorRole}>{role}</span>}
        </div>
        <span className={styles.operatorCount}>
          {assignments.length} {assignments.length === 1 ? 'task' : 'tasks'}
        </span>
      </header>

      {assignments.length === 0 ? (
        <p className={styles.operatorEmpty}>No assignments today.</p>
      ) : (
        <ol className={styles.operatorAssignList}>
          {assignments.map((a, idx) => (
            <li
              key={a.id}
              className={styles.operatorAssignRow}
              data-progress={a.status}
              data-priority={a.priority ?? undefined}
            >
              <div className={styles.operatorAssignTop}>
                <span className={styles.operatorAssignNum}>{idx + 1}.</span>
                <span className={styles.operatorAssignTitle}>{a.title}</span>
                <CrewStatusControl
                  assignmentId={a.id}
                  status={a.status}
                  notes={a.notes}
                />
                {canDeleteTasks && a.eventId && (
                  <button
                    type="button"
                    className={styles.assignDeleteBtn}
                    onClick={() => onDeleteEvent?.({ id: a.eventId, title: a.title })}
                    title="Delete task"
                    aria-label="Delete task"
                  >⋮</button>
                )}
              </div>
              {(a.startTime || a.location || a.eventType) && (
                <div className={styles.operatorAssignMeta}>
                  {a.startTime && <span>{fmtTime(a.startTime)}</span>}
                  {a.location  && <span>{a.location}</span>}
                  {a.eventType && (
                    <span>{EVENT_TYPE_LABEL[a.eventType] ?? a.eventType}</span>
                  )}
                </div>
              )}
              {a.notes && (
                <p className={styles.operatorAssignNotes}>{a.notes}</p>
              )}
              {a.chips.length > 0 && (
                <div className={styles.operatorAssignChips}>
                  {a.chips.map(chip => (
                    <span
                      key={chip.id}
                      className={styles.chip}
                      data-status={chip.status}
                      title={chip.status ? `${chip.name} · ${chip.status}` : chip.name}
                    >
                      {chip.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}

/* ── BoardModeDailyNotes (Phase 9C.10 — kiosk daily-notes strip) ────────
 * Compact read-only strip directly under the date header that surfaces
 * the operations team's authored daily notes for selectedDate. Sits
 * above the alert marquee so a supervisor's "frost delay until 7:30"
 * note is the first thing crew read off the TV.
 *
 * Filtering + sort happen upstream in the dayNotes useMemo: archived
 * and deleted statuses are stripped at the source (status === 'active'
 * only), and notes are pinned-first then priority-ordered. This
 * component renders what it's given, no slicing.
 *
 * Spanish (titleEs/bodyEs) renders below the English copy in italic
 * mint with lang="es" so screen readers switch voice profiles. No
 * private-notes field is referenced — the operations_daily_notes shape
 * exposes only title/body/titleEs/bodyEs/priority/pinned/status/
 * noteDate (see worker/api/operationsNotes.js rowToNote).
 *
 * View-only by design (the kiosk route is the one public no-login
 * surface in the app). No buttons / onClick / mutation handlers. */
function BoardModeDailyNotes({ notes }) {
  if (!notes || notes.length === 0) return null
  return (
    <section className={styles.boardDailyNotes} aria-label="Daily notes">
      <div className={styles.boardDailyNotesHeader}>Daily Notes</div>
      <ul className={styles.boardDailyNotesList}>
        {notes.map(n => {
          const titleTrim   = (n.title   ?? '').trim()
          const bodyTrim    = (n.body    ?? '').trim()
          const titleEsTrim = (n.titleEs ?? '').trim()
          const bodyEsTrim  = (n.bodyEs  ?? '').trim()
          const hasSpanish  = titleEsTrim.length > 0 || bodyEsTrim.length > 0
          return (
            <li
              key={n.id}
              className={styles.boardDailyNoteItem}
              data-priority={n.priority}
              data-pinned={n.pinned ? 'true' : undefined}
            >
              {titleTrim && <strong className={styles.boardDailyNoteTitle}>{titleTrim}</strong>}
              {bodyTrim  && <span  className={styles.boardDailyNoteBody}>{bodyTrim}</span>}
              {hasSpanish && (
                <span className={styles.boardDailyNoteSpanish} lang="es">
                  {titleEsTrim && <strong>{titleEsTrim}</strong>}
                  {titleEsTrim && bodyEsTrim ? ' — ' : ''}
                  {bodyEsTrim}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ── BoardModeAlertMarquee (Phase 9C.5a — kiosk alert ticker) ───────────
 * Red horizontal marquee that scrolls a public-safe alert stream across
 * the top of /display-board/board, immediately below the date header.
 * Renders nothing when there are no alerts so the kiosk stays clean on
 * calm mornings.
 *
 * View-only by design. No dismiss / close / edit / delete controls. The
 * track is duplicated (aria-hidden second copy) so the CSS animation
 * loop reads as continuous without a visible cut.
 *
 * Honors prefers-reduced-motion via the CSS module — the marquee track
 * still renders but the keyframe is disabled. Items are joined with a
 * clear separator so accessibility tools and reduced-motion viewers can
 * still read each alert distinctly.
 */
function BoardModeAlertMarquee({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div className={styles.boardAlertMarquee} role="status" aria-live="polite">
      <div className={styles.boardAlertMarqueeTrack}>
        {alerts.map(a => (
          <span key={a.key} className={styles.boardAlertItem} data-priority={a.priority}>
            {a.text}
            <span className={styles.boardAlertSep} aria-hidden="true"> • </span>
          </span>
        ))}
        {/* Duplicate the run for a seamless wrap-around. */}
        {alerts.map(a => (
          <span key={`${a.key}::dup`} className={styles.boardAlertItem} data-priority={a.priority} aria-hidden="true">
            {a.text}
            <span className={styles.boardAlertSep}> • </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── BoardModeCrewBars (Phase 9C.4b — simplified kiosk layout) ──────────
 * Renders one wide bar per assigned operator with their name + each
 * assigned task + per-task notes. Drives the public /display-board/board
 * kiosk view only. No equipment chips, status chips, status pickers,
 * delete buttons, or any other interaction — view-only by design (the
 * kiosk route is the one public no-login surface in the app).
 *
 * Multi-task operators get one stacked mini-row per task. Notes render
 * only when the trimmed string is non-empty. When no operators have
 * assignments today, the empty-state copy is centered. */

function BoardModeCrewBars({ operatorCards }) {
  if (!operatorCards || operatorCards.length === 0) {
    return (
      <div className={styles.boardBars}>
        <p className={styles.boardEmpty}>No assignments for today.</p>
      </div>
    )
  }
  // Phase 9C.4c — Auto-fit density. Pick a bucket based on how many
  // operators and total assignments the board has today, then hand
  // off to CSS attribute selectors so the rest of the responsiveness
  // (text scaling, single-vs-two columns, notes line-clamp) is pure
  // CSS. No ResizeObserver, no DOM measurement, no JS reflow loop.
  //
  //   compact     — 10+ operators OR 16+ total assignments
  //   comfortable — 6+ operators OR 10+ total assignments
  //   spacious    — everything else (preserves the 9C.4b look)
  const operatorCount   = operatorCards.length
  const assignmentCount = operatorCards.reduce(
    (n, op) => n + (op.assignments?.length ?? 0),
    0,
  )
  const density =
    operatorCount >= 10 || assignmentCount >= 16 ? 'compact'
    : operatorCount >= 6 || assignmentCount >= 10 ? 'comfortable'
    : 'spacious'
  // Phase 9C.4d — Smooth per-assignment shrink. Starts at ~2/3 size
  // (0.66) for the first 2 assignments — shop TVs need a tighter base
  // layout so multi-person rosters fit without scrolling — then drops
  // 2.5% per assignment thereafter, floors at 0.45.
  //   0–2 → 0.660  ·  6 → 0.560  ·  10 → 0.460
  //   3   → 0.635  ·  7 → 0.535  ·  11 → 0.450 (floor reached)
  //   4   → 0.610  ·  8 → 0.510  ·  12+ → 0.450 (floor)
  //   5   → 0.585  ·  9 → 0.485
  // The discrete 9C.4c bucket density above still controls categorical
  // decisions (notes line-clamp count, 2-column compact grid); the
  // continuous scale below tightens padding / gap / max-font caps via
  // CSS calc() so growth is smooth instead of step-changes.
  const boardBarScale = Math.max(
    0.45,
    Math.min(0.66, 0.66 - Math.max(0, assignmentCount - 2) * 0.025),
  )
  return (
    <div
      className={styles.boardBars}
      data-density={density}
      style={{
        '--board-operator-count':   operatorCount,
        '--board-assignment-count': assignmentCount,
        '--board-bar-scale':        boardBarScale,
      }}
    >
      {operatorCards.map(op => {
        // Phase E.9 — Out-status cards: render the status word as the
        // "task" line and skip notes / Spanish / chips entirely. The
        // out card is a name + a labeled status pill, nothing more.
        if (op.outStatus) {
          const label =
            op.outStatus === 'vacation' ? 'Vacation'
            : op.outStatus === 'sick'    ? 'Sick'
            : 'Off'
          // Phase E.9b — Out cards stretch full-width like assignment
          // bars so the board's vertical rhythm stays consistent. The
          // name + status badge sit on a single inline header row
          // (.crewCardOutHeader) instead of stacking. Marker classes
          // (.crewCardOut + per-status variant) layer on top of the
          // base .boardPersonBar so suppression rules + the muted
          // color tints continue to apply.
          const outClass =
            op.outStatus === 'vacation' ? styles.crewCardOutVacation
            : op.outStatus === 'sick'    ? styles.crewCardOutSick
            : styles.crewCardOutOff
          return (
            <article
              key={op.key}
              className={`${styles.boardPersonBar} ${styles.crewCardOut} ${outClass}`}
              data-out-status={op.outStatus}
            >
              <div className={styles.crewCardOutHeader}>
                <h2 className={styles.boardPersonName}>{op.employeeName ?? 'Unassigned'}</h2>
                <span
                  className={styles.crewCardOutBadge}
                  data-out-status={op.outStatus}
                >
                  {label}
                </span>
              </div>
            </article>
          )
        }
        return (
          <article key={op.key} className={styles.boardPersonBar}>
            <h2 className={styles.boardPersonName}>{op.employeeName ?? 'Unassigned'}</h2>
            {op.assignments.map((a, idx) => {
              // Phase DAB.10b — Ordinal label rendered ONLY when this
              // operator has multiple jobs today. Single-job operators
              // keep the existing TV/kiosk look (no "1st Job" badge to
              // distract from the task title). When labels appear they
              // follow the post-sort order, so removing a middle job
              // renumbers automatically on the next render.
              const showOrdinal = op.assignments.length > 1
              const jobLabel    = showOrdinal
                ? (BOARD_ORDINAL_LABELS[idx] ?? `Job ${idx + 1}`)
                : null
              const trimmedNotes   = (a.notes   ?? '').trim()
              // Phase 9C.5b3 — Spanish translation renders underneath the
              // English note when authored. Both lines apply the base
              // .boardNotesText class so the 9C.4c/9C.4d/9C.4e density +
              // scale rules continue to drive line-clamp, font-size, and
              // per-assignment shrink automatically. The .boardNotesTextEs
              // override only adds visual differentiation (italic, mint
              // tint) so the bilingual nature is glanceable on a TV.
              //
              // Phase 9C.5c4 — additionally gated on op.showSpanishNotes
              // (computed in operatorCards from the operator's
              // autoTranslateBoardNotes + boardLanguage prefs). Operators
              // who don't want Spanish never see the bilingual line,
              // even if notesEs exists in the database from a previous
              // configuration or a different operator's translation run.
              const trimmedNotesEs = (a.notesEs ?? '').trim()
              return (
                <div key={a.id ?? idx} className={styles.boardTaskBlock}>
                  {jobLabel && (
                    <span className={styles.boardJobOrdinal}>{jobLabel}</span>
                  )}
                  <p className={styles.boardTaskText}>{a.title}</p>
                  {trimmedNotes.length > 0 && (
                    <p className={styles.boardNotesText}>{trimmedNotes}</p>
                  )}
                  {trimmedNotesEs.length > 0 && op.showSpanishNotes && (
                    <p
                      className={`${styles.boardNotesText} ${styles.boardNotesTextEs}`}
                      lang="es"
                    >
                      {trimmedNotesEs}
                    </p>
                  )}
                </div>
              )
            })}
          </article>
        )
      })}
    </div>
  )
}

/* ── Task card ──────────────────────────────────────────────────────── */

function TaskCard({ event, equipment, crew, resolveName, canDeleteTasks = false, onDeleteEvent }) {
  // ── Phase 10 chip resolution ──────────────────────────────────────────
  // Priority order per spec:
  //   1. linked employee equipment       (chip rendered beside the crew row)
  //   2. task-level reservation chips    (unlinked equipment_reservations)
  //   3. event.equipment[] payload       (legacy, no reservations exist)
  //   4. no chips
  //
  // A reservation linked to a crew_assignment we can locate goes under
  // that employee's row. Everything else stays at the task header.
  const crewIds          = new Set(crew.map(a => a.id))
  const linkedByAssign   = new Map()
  const taskLevelChips   = []
  for (const r of equipment) {
    if (r.crewAssignmentId && crewIds.has(r.crewAssignmentId)) {
      if (!linkedByAssign.has(r.crewAssignmentId)) {
        linkedByAssign.set(r.crewAssignmentId, [])
      }
      linkedByAssign.get(r.crewAssignmentId).push({
        id: r.id, name: r.equipmentName, status: r.status,
      })
    } else {
      taskLevelChips.push({
        id: r.id, name: r.equipmentName, status: r.status,
      })
    }
  }

  // Fallback to event.equipment[] payload only when no reservations
  // exist on the event at all.
  const headerChips = taskLevelChips.length > 0
    ? taskLevelChips
    : (equipment.length === 0
        ? (event.equipment ?? []).map((name, i) => ({ id: `eq-${i}`, name, status: null }))
        : [])

  const crewRows = crew.map(a => ({
    id:       a.id,
    name:     a.employeeId ? (resolveName(a.employeeId) ?? a.employeeName) : a.employeeName,
    role:     a.role,
    chips:    linkedByAssign.get(a.id) ?? [],
    status:   a.status ?? 'assigned',
    notes:    a.notes ?? '',
    real:     true,   // backed by a crew_assignment row → status is patchable
  }))
  // Fallback to event.assignedStaff[] only when no crew_assignments rows
  // exist for the event. These fallback rows can't carry linked chips
  // (no row id to match on) and aren't status-patchable.
  const fallbackNames = crewRows.length === 0
    ? (event.assignedStaff ?? []).map((name, i) => ({ id: `fb-${i}`, name, role: null, chips: [], status: 'assigned', notes: '', real: false }))
    : crewRows

  // Phase 34 — routing/mowing visual chips from existing event.tags[].
  const { chips: routingChips, extra: routingExtra } = routingChipsFromTags(event.tags)

  // Phase 6B.1 — card-level progress escalation. Only real (DB-backed) rows
  // contribute; fallback name-only rows have no patchable status.
  const cardProgress =
    crewRows.length === 0 ? null
    : crewRows.some(r => r.status === 'blocked')    ? 'blocked'
    : crewRows.some(r => r.status === 'delayed')    ? 'delayed'
    : crewRows.every(r => r.status === 'completed') ? 'completed'
    : null

  return (
    <article
      className={styles.taskCard}
      data-priority={event.priority}
      data-card-progress={cardProgress ?? undefined}
    >
      <header className={styles.taskCardHeader}>
        <div className={styles.taskTitleBlock}>
          <h2 className={styles.taskTitle}>{event.title}</h2>
          <div className={styles.taskMetaRow}>
            {event.eventType && <span>{EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</span>}
            {event.location && <span>{event.location}</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          {event.startTime && (
            <span className={styles.timePill}>{fmtTime(event.startTime)}</span>
          )}
          <span className={styles.priorityPill} data-priority={event.priority}>
            {PRIORITY_LABEL[event.priority] ?? 'TASK'}
          </span>
          {canDeleteTasks && (
            <button
              type="button"
              className={styles.assignDeleteBtn}
              onClick={() => onDeleteEvent?.(event)}
              title="Delete task"
              aria-label="Delete task"
            >⋮</button>
          )}
        </div>
      </header>

      {routingChips.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Route</span>
          <div className={styles.routingRow}>
            {routingChips.map(c => (
              <span
                key={c.key}
                className={styles.routingChip}
                data-tone={c.tone}
                title={c.label}
              >
                <span className={styles.routingIcon} aria-hidden="true">{c.icon}</span>
                <span className={styles.routingLabel}>{c.label}</span>
              </span>
            ))}
            {routingExtra > 0 && (
              <span className={styles.routingMore}>+{routingExtra}</span>
            )}
          </div>
        </div>
      )}

      {headerChips.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Equip</span>
          <div className={styles.chipRow}>
            {headerChips.map(c => (
              <span
                key={c.id}
                className={styles.chip}
                data-status={c.status}
                title={c.status ? `${c.name} · ${c.status}` : c.name}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.description && (
        <p className={styles.taskDescription}>{event.description}</p>
      )}

      {fallbackNames.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Crew</span>
          <ul className={styles.crewList}>
            {fallbackNames.map(c => (
            <li key={c.id} className={styles.crewRow} data-progress={c.status}>
              <span className={styles.crewName}>{c.name}</span>
              {c.role && <span className={styles.crewRole}>· {c.role}</span>}
              {c.chips.length > 0 && (
                <span className={styles.crewChips}>
                  {c.chips.map(chip => (
                    <span
                      key={chip.id}
                      className={styles.chip}
                      data-status={chip.status}
                      title={chip.status ? `${chip.name} · ${chip.status}` : chip.name}
                    >
                      {chip.name}
                    </span>
                  ))}
                </span>
              )}
              {c.real && (
                <CrewStatusControl
                  assignmentId={c.id}
                  status={c.status}
                  notes={c.notes}
                />
              )}
            </li>
          ))}
          </ul>
        </div>
      )}
    </article>
  )
}

/* ── Crew progress control (Phase 33) ───────────────────────────────────
 *
 * Two-tap status update: tap the chip to open the picker, tap a status to
 * set it (optimistic via patchCrewAssignment). An optional quick note is
 * saved alongside. Schema-free — rides crew_assignments.status + .notes.
 */
function CrewStatusControl({ assignmentId, status, notes }) {
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const [note, setNote]   = useState(notes ?? '')
  const toast = useToast()

  async function applyStatus(next) {
    setBusy(true)
    try {
      await patchCrewAssignment(assignmentId, { status: next })
      toast?.success?.(`Marked ${PROGRESS_LABEL[next] ?? next}`)
      setOpen(false)
    } catch (err) {
      toast?.error?.(`Update failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    const trimmed = note.trim()
    if (trimmed === (notes ?? '').trim()) { setOpen(false); return }
    setBusy(true)
    try {
      await patchCrewAssignment(assignmentId, { notes: trimmed })
      toast?.success?.('Note saved')
      setOpen(false)
    } catch (err) {
      toast?.error?.(`Note failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={styles.progressWrap}>
      <button
        type="button"
        className={styles.progressChip}
        data-progress={status}
        onClick={() => setOpen(o => !o)}
        title={`Status: ${PROGRESS_LABEL[status] ?? status} — tap to change`}
        aria-label={`Crew status ${PROGRESS_LABEL[status] ?? status}`}
      >
        {PROGRESS_SHORT[status] ?? '○'}
      </button>
      {open && (
        <div className={styles.progressPicker} role="menu">
          <div className={styles.progressBtns}>
            {PROGRESS_STATUSES.map(s => (
              <button
                key={s.key}
                type="button"
                className={styles.progressOption}
                data-progress={s.key}
                data-active={s.key === status ? 'true' : undefined}
                disabled={busy}
                onClick={() => applyStatus(s.key)}
              >
                <span aria-hidden="true">{s.short}</span> {s.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className={styles.progressNote}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Quick note (optional)"
            disabled={busy}
          />
        </div>
      )}
    </span>
  )
}

/* ── Notes column pieces ────────────────────────────────────────────── */

// Phase 6B.2 — Crew Briefing consolidates Daily Briefing + Active Alerts.
// Alerts always render in a stable subgroup; subgroup labels only appear
// when both groups have content. Empty state preserves the eventNotes
// fallback via FallbackNotices(alerts=[], events).
function CrewBriefingPanel({ notes, alerts, events }) {
  const hasNotes  = notes.length > 0
  const hasAlerts = alerts.length > 0
  const showSubLabels = hasNotes && hasAlerts

  const hintText = hasNotes && hasAlerts
    ? `${notes.length} note${notes.length !== 1 ? 's' : ''} · ${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`
    : hasNotes  ? `${notes.length} from supervisor`
    : hasAlerts ? `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`
    : 'Safety · routing · conditions'

  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Crew Briefing</h3>
        <span className={styles.notesPanelHint}>{hintText}</span>
      </header>

      {hasNotes && (
        <>
          {showSubLabels && (
            <span className={styles.subPanelLabel}>Supervisor Notes</span>
          )}
          {notes.map(n => (
            <NoticeWithPhotos key={n.id} note={n} tone={noticeTone(n.priority)} />
          ))}
        </>
      )}

      {hasAlerts && (
        <>
          {showSubLabels && (
            <span className={styles.subPanelLabel} data-divider="true">Active Alerts</span>
          )}
          {alerts.map(a => (
            <div
              key={a.id}
              className={styles.noticeRow}
              data-tone={a.priority === 'high' ? 'alert' : undefined}
            >
              <strong className={styles.noticeTitle}>{a.title}</strong>
              {a.message && <p className={styles.noticeBody}>{a.message}</p>}
            </div>
          ))}
        </>
      )}

      {!hasNotes && !hasAlerts && (
        <FallbackNotices alerts={[]} events={events} />
      )}
    </section>
  )
}

function NoticeWithPhotos({ note, tone }) {
  const { attachments } = useAttachmentsForParent('daily_briefing', note.id)
  return (
    <div
      className={styles.noticeRow}
      data-tone={tone}
      data-pinned={note.pinned ? 'true' : undefined}
    >
      <strong className={styles.noticeTitle}>
        {note.pinned && '📌 '}
        {note.title || titleFromBody(note.body)}
      </strong>
      <p className={styles.noticeBody}>{note.body}</p>
      {attachments.length > 0 && (
        <div className={styles.noticePhotos}>
          {attachments.map(att => (
            <a
              key={att.id}
              className={styles.noticePhoto}
              href={att.url}
              target="_blank"
              rel="noreferrer"
              title={att.caption ?? att.fileName ?? 'briefing photo'}
            >
              <img src={att.url} alt={att.caption ?? att.fileName ?? 'briefing photo'} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function FallbackNotices({ alerts, events }) {
  const highAlerts = alerts.filter(a => a.priority === 'high')
  const eventNotes = events
    .filter(e => e.description && e.description.length > 0)
    .slice(0, 4)
  if (highAlerts.length === 0 && eventNotes.length === 0) {
    return (
      <p className={styles.notesEmpty}>
        No briefings yet. Post one in Operations &gt; Daily Briefing.
      </p>
    )
  }
  return (
    <>
      {highAlerts.map(a => (
        <div key={a.id} className={styles.noticeRow} data-tone="alert">
          <strong className={styles.noticeTitle}>{a.title}</strong>
          {a.message && <p className={styles.noticeBody}>{a.message}</p>}
        </div>
      ))}
      {eventNotes.map(e => (
        <div key={e.id} className={styles.noticeRow}>
          <strong className={styles.noticeTitle}>{e.title}</strong>
          <p className={styles.noticeBody}>{e.description}</p>
        </div>
      ))}
    </>
  )
}

// Phase 6B.2 — Field Conditions consolidates Course Watch Areas + Spray
// Operations. Watch areas always render first (turf condition signals),
// sprays second (chemical ops). Severity tiering on watch flags is inherited
// from Phase 6B.1 (data-flag attribute). Panel hidden when both empty.
function FieldConditionsPanel({ watchAreas, sprays }) {
  const hasWatch = watchAreas.length > 0
  const hasSpray = sprays.length > 0
  if (!hasWatch && !hasSpray) return null

  const showSubLabels = hasWatch && hasSpray
  const hintText = hasWatch && hasSpray
    ? `${watchAreas.length} area${watchAreas.length !== 1 ? 's' : ''} · ${sprays.length} spray${sprays.length !== 1 ? 's' : ''}`
    : hasWatch ? `${watchAreas.length} area${watchAreas.length !== 1 ? 's' : ''}`
    : `${sprays.length} application${sprays.length !== 1 ? 's' : ''}`

  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Field Conditions</h3>
        <span className={styles.notesPanelHint}>{hintText}</span>
      </header>

      {hasWatch && (
        <>
          {showSubLabels && (
            <span className={styles.subPanelLabel}>Watch Areas</span>
          )}
          <ul className={styles.watchList}>
            {watchAreas.map(a => (
              <li key={a.id} className={styles.watchRow}>
                <span className={styles.watchLoc}>{a.location}</span>
                <span className={styles.watchFlags}>
                  {a.flags.map(f => (
                    <span
                      key={f}
                      className={styles.watchFlag}
                      data-flag={String(f).toLowerCase().replace(/\s+/g, '-')}
                    >
                      {f}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {hasSpray && (
        <>
          {showSubLabels && (
            <span className={styles.subPanelLabel} data-divider="true">Spray Operations</span>
          )}
          {sprays.map(s => (
            <div
              key={s.id}
              className={styles.sprayRow}
              data-rei={(s.rei ?? 0) > 0 ? 'true' : undefined}
            >
              <div className={styles.sprayHeader}>
                <span className={styles.sprayName}>
                  {s.applicationName ?? s.area ?? 'Spray Application'}
                </span>
                {(s.rei ?? 0) > 0 && (
                  <span className={styles.reiBadge}>REI {s.rei}h</span>
                )}
              </div>
              <div className={styles.taskMetaRow}>
                {s.applicator && <span>{s.applicator}</span>}
                {s.area && <span>· {s.area}</span>}
                {s.acreage != null && <span>· {s.acreage} ac</span>}
              </div>
              {Array.isArray(s.products) && s.products.length > 0 && (
                <p className={styles.sprayProducts}>
                  {s.products.map(p => p.name).filter(Boolean).join(' + ')}
                </p>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
