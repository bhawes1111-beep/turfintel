import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../utils/feedback/toastContext'
import { EMPLOYEES, TASKS, HOURS_LOG } from '../../data/crew'
import CrewSchedule     from '../Crew/tabs/CrewSchedule'
import CrewAssignments  from '../Crew/tabs/CrewAssignments'
import CrewEmployees    from '../Crew/tabs/CrewEmployees'
import CrewHours        from '../Crew/tabs/CrewHours'
import CrewNotes        from '../Crew/tabs/CrewNotes'
import { EmptyState } from '../../components/shared/EmptyState'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import Timeline from '../../components/primitives/Timeline'
import { useWeather } from '../../utils/weather/useWeather'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useCalendarData, createCalendarEvent } from '../../utils/calendar/calendarStore'
import {
  useAssignmentsData,
  createCrewAssignment,
  createEquipmentReservation,
  deleteCrewAssignment,
} from '../../utils/assignments/assignmentsStore'
import workspace from '../../styles/workspace.module.css'
import styles from './OperationsBoard.module.css'

const TODAY = '2026-05-08'

const ROUTING_OPTIONS = ['Press & Roll', 'Hammer', 'Normal', 'Modified', 'Event Prep']
const NOTES_TABS      = ['Daily', 'Weather', 'Super', 'Geo', 'Alerts']

const TIMELINE_START = 5
const TIMELINE_END   = 16
const TIMELINE_SPAN  = TIMELINE_END - TIMELINE_START

const TASK_TITLES = [
  'Mow Greens', 'Roll Greens', 'Blow Fairways', 'Bunker Maintenance',
  'Irrigation Repair', 'Course Setup', 'Spray Greens', 'Hand Water',
  'Divot Repair', 'Cup Changing',
]

const EQ_CHIPS = ['Greens Mower', 'Roller', 'Blower', 'Utility Cart', 'Spray Rig', 'Hand Tools']

const BLANK_TASK = {
  title:          '',
  estimatedHours: '1',
  priority:       'routine',
  status:         'pending',
  notes:          '',
  equipment:      [],
}

const INITIAL_NOTES = {
  Daily:   '',
  Weather: '',
  Super:   '',
  Geo:     '',
  Alerts:  '',
}

const STATUS_LABEL = {
  'in-progress':  'In Progress',
  'open':         'Open',
  'completed':    'Completed',
  'blocked':      'Blocked',
  'weather-hold': 'Weather Hold',
  'pending':      'Pending',
}

const PRIORITY_LABEL = {
  high: 'HIGH', medium: 'MED', routine: 'ROUTINE', low: 'LOW',
}

const TASK_GROUPS = [
  { key: 'active',    label: 'Active Operations',   statuses: ['in-progress', 'blocked', 'weather-hold'] },
  { key: 'open',      label: 'Open Tasks',           statuses: ['open', 'pending'] },
  { key: 'completed', label: 'Completed Operations', statuses: ['completed'] },
]

const DENSITY_OPTIONS = ['Compact', 'Comfortable', 'Expanded']

const TABS = [
  { id: 'board',       label: 'Operations Board' },
  { id: 'schedule',    label: 'Schedule' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'employees',   label: 'Employees' },
  { id: 'hours',       label: 'Hours' },
  { id: 'notes',       label: 'Notes' },
]
const TAB_LABELS  = TABS.map(t => t.label)
const LABEL_TO_ID = Object.fromEntries(TABS.map(t => [t.label, t.id]))
const ID_TO_LABEL = Object.fromEntries(TABS.map(t => [t.id, t.label]))

function parseHour(timeStr) {
  if (!timeStr) return null
  const [time, meridiem] = timeStr.split(' ')
  const [h, m] = time.split(':').map(Number)
  let hour = h
  if (meridiem === 'PM' && h !== 12) hour += 12
  if (meridiem === 'AM' && h === 12) hour = 0
  return hour + m / 60
}

function formatDate(isoStr) {
  const d       = new Date(isoStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const rest    = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `${weekday} · ${rest}`
}

// ── Persistence mappers (Phase 5.5b) ──────────────────────────────────────
// OperationsBoard tasks → calendar events. Reuses the Phase 5.4a Worker
// dedupe (sourceId + event_type + start_date) so repeat assignment writes
// don't create duplicate events.

const TASK_PRIORITY_TO_EVENT = {
  critical: 'high',
  high:     'high',
  medium:   'medium',
  routine:  'low',
  low:      'low',
}

const TASK_STATUS_TO_EVENT = {
  'in-progress':  'in-progress',
  'completed':    'completed',
  'pending':      'scheduled',
  'open':         'scheduled',
  'blocked':      'scheduled',
  'weather-hold': 'scheduled',
}

export default function OperationsBoard() {
  const toast = useToast()
  const navigate = useNavigate()
  const addTaskRef = useRef(null)
  const { current: weatherCurrent } = useWeather()
  const { equipment, serviceLog }   = useEquipmentData()
  const { events: calendarEvents }  = useCalendarData()
  const { crewAssignments }         = useAssignmentsData()

  // ── Tab / layout ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('board')
  const [routing,   setRouting]   = useState('Press & Roll')
  const [panelOpen, setPanelOpen] = useState(false)

  // ── Board interaction ─────────────────────────────────────────────────────
  const [density,         setDensity]         = useState('comfortable')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [taskOverrides,   setTaskOverrides]   = useState({})
  const [expandedNoteIds, setExpandedNoteIds] = useState(new Set())
  const [openMenuId,      setOpenMenuId]      = useState(null)

  // ── Date selector ─────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState('2026-05-09')

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deletedTaskIds, setDeletedTaskIds] = useState(new Set())
  const [deleteConfirm,  setDeleteConfirm]  = useState(null)

  // ── Task creation ─────────────────────────────────────────────────────────
  const [createdTasks, setCreatedTasks] = useState([])
  const [newTask,      setNewTask]      = useState(BLANK_TASK)

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ── DnD state ─────────────────────────────────────────────────────────────
  const [taskAssignments, setTaskAssignments] = useState({})
  const [draggingEmpId,   setDraggingEmpId]   = useState(null)
  const [dragOverTaskId,  setDragOverTaskId]  = useState(null)
  const [timelineOpen,    setTimelineOpen]    = useState(true)

  // ── Live clock ────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Escape closes modals ──────────────────────────────────────────────────
  useEffect(() => {
    if (!deleteConfirm && !settingsOpen) return
    const handler = e => {
      if (e.key === 'Escape') {
        setDeleteConfirm(null)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteConfirm, settingsOpen])

  // ── Right panel notes ─────────────────────────────────────────────────────
  const [notesTab, setNotesTab] = useState('Daily')
  const [notes,    setNotes]    = useState(INITIAL_NOTES)

  // ── Derived data ──────────────────────────────────────────────────────────

  const eqByCategory = useMemo(() => {
    const map = {}
    equipment.forEach(eq => { if (!map[eq.category]) map[eq.category] = eq })
    return map
  }, [equipment])

  // ── Cross-module signal: Maintenance → Operations ──────────────────────
  // Categories with at least one overdue service log entry — surfaced as a
  // contextual indicator on equipment chips within task cards. Now driven
  // by the live serviceLog from the equipmentStore (Phase 5.0).
  const overdueMaintCategories = useMemo(() => {
    const set = new Set()
    serviceLog.forEach(log => {
      if (log.status === 'overdue') set.add(log.category)
    })
    return set
  }, [serviceLog])

  // ── Cross-module signal: Weather → Operations ──────────────────────────
  // Derive lightweight operational weather warnings from the live weather
  // feed. Heuristics — read-only, never blocking.
  const weatherWarnings = useMemo(() => {
    const out = []
    if (!weatherCurrent) return out
    const { wind, currentTemp, rainfall24h } = weatherCurrent
    if (typeof wind === 'number'        && wind > 15)         out.push({ id: 'wind',  label: 'High wind',  tone: 'warn' })
    if (typeof currentTemp === 'number' && currentTemp <= 36) out.push({ id: 'frost', label: 'Frost risk', tone: 'info' })
    if (typeof rainfall24h === 'number' && rainfall24h >= 0.25) out.push({ id: 'rain',  label: 'Rain delay', tone: 'info' })
    return out
  }, [weatherCurrent])

  const empById = useMemo(() => {
    const map = {}
    EMPLOYEES.forEach(e => { map[e.employeeId] = e })
    return map
  }, [])

  const todayLog = useMemo(() => {
    const map = {}
    HOURS_LOG.filter(h => h.date === TODAY).forEach(h => { map[h.employeeId] = h })
    return map
  }, [])

  const allSourceTasks = useMemo(() => [...TASKS, ...createdTasks], [createdTasks])

  const effectiveTasks = useMemo(() =>
    allSourceTasks
      .filter(t => !deletedTaskIds.has(t.id))
      .map(t => ({
        ...t,
        status:     taskOverrides[t.id]?.status ?? t.status,
        assignedTo: taskAssignments[t.id]       ?? t.assignedTo,
      })),
  [taskOverrides, taskAssignments, deletedTaskIds, allSourceTasks])

  const groupedTasks = useMemo(() =>
    TASK_GROUPS.map(g => ({
      ...g,
      tasks: effectiveTasks.filter(t => g.statuses.includes(t.status)),
    })),
  [effectiveTasks])

  const timelineRows = useMemo(() =>
    EMPLOYEES
      .filter(emp => {
        const log = todayLog[emp.employeeId]
        return !log || !['absent', 'call-out'].includes(log.status)
      })
      .map(emp => {
        const log       = todayLog[emp.employeeId]
        const startHour = parseHour(log?.startTime) ?? TIMELINE_START
        const tasks     = effectiveTasks.filter(t => (t.assignedTo ?? []).includes(emp.employeeId))
        let cursor = startHour
        const blocks = tasks.map(task => {
          const block = {
            taskId: task.id,
            title:  task.title,
            status: task.status,
            startHr: cursor,
            spanHr:  task.estimatedHours,
          }
          cursor += task.estimatedHours
          return block
        })
        return { emp, firstName: emp.fullName.split(' ')[0], blocks }
      }),
  [effectiveTasks, todayLog])

  const stats = useMemo(() => {
    const logs = Object.values(todayLog)
    return {
      active:   logs.filter(h => ['clocked-in','active','completed'].includes(h.status)).length,
      absent:   logs.filter(h => ['absent','call-out'].includes(h.status)).length,
      late:     logs.filter(h => h.status === 'late').length,
      totalHrs: logs.reduce((s, h) => s + (h.totalHours || 0), 0),
    }
  }, [todayLog])

  const doneCount = useMemo(() =>
    effectiveTasks.filter(t => t.status === 'completed').length,
  [effectiveTasks])

  const timeStr    = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const nowHour    = now.getHours() + now.getMinutes() / 60
  const nowPercent = Math.max(0, Math.min(100, ((nowHour - TIMELINE_START) / TIMELINE_SPAN) * 100))

  // ── Handlers ──────────────────────────────────────────────────────────────

  function shiftDate(delta) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleNote(taskId) {
    setExpandedNoteIds(prev => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  function handleAction(taskId, action) {
    const original = allSourceTasks.find(t => t.id === taskId)?.status ?? 'open'
    const current  = taskOverrides[taskId]?.status ?? original
    if (action === 'complete') {
      setTaskOverrides(p => ({ ...p, [taskId]: { status: current === 'completed' ? original : 'completed' } }))
    } else if (action === 'hold') {
      setTaskOverrides(p => ({ ...p, [taskId]: { status: current === 'weather-hold' ? original : 'weather-hold' } }))
    } else if (action === 'delay') {
      toast.info('Delay scheduling coming soon')
    } else if (action === 'reassign') {
      toast.info('Drag an employee from the roster to assign')
    }
  }

  function confirmDelete(task) {
    setDeleteConfirm({ id: task.id, title: task.title })
  }

  function handleDelete() {
    if (!deleteConfirm) return
    const { id, title } = deleteConfirm
    setDeletedTaskIds(prev => new Set([...prev, id]))
    toast.info(`"${title}" deleted`)
    setDeleteConfirm(null)
  }

  function setNewTaskField(key, val) {
    setNewTask(prev => ({ ...prev, [key]: val }))
  }

  function toggleEqChip(chip) {
    setNewTask(prev => ({
      ...prev,
      equipment: prev.equipment.includes(chip)
        ? prev.equipment.filter(e => e !== chip)
        : [...prev.equipment, chip],
    }))
  }

  // ── Persistence helpers (Phase 5.5b) ────────────────────────────────────
  // Each board task maps 1:1 to a calendar event. We use task.id as the
  // sourceId so the Phase 5.4a Worker dedupe (sourceId + event_type +
  // start_date) collapses repeat writes. assignEmployee can therefore
  // call ensureEventForTask() blindly without tracking event ids.
  async function ensureEventForTask(task) {
    return createCalendarEvent({
      title:        task.title,
      date:         selectedDate,
      category:     'crew',
      priority:     TASK_PRIORITY_TO_EVENT[task.priority] ?? 'medium',
      status:       TASK_STATUS_TO_EVENT[task.status] ?? 'scheduled',
      location:     task.assignedArea || '',
      tags:         [],
      notes:        task.notes || '',
      sourceModule: 'operations-board',
      sourceId:     task.id,
    })
  }

  function handleAddTask() {
    if (!newTask.title) {
      toast.info('Select a task to add')
      return
    }
    const task = {
      id:             `ct-${Date.now()}`,
      title:          newTask.title,
      assignedArea:   '',
      priority:       newTask.priority,
      status:         newTask.status,
      estimatedHours: parseFloat(newTask.estimatedHours) || 1,
      completedHours: 0,
      assignedTo:     [],
      equipment:      [...newTask.equipment],
      notes:          newTask.notes,
    }
    setCreatedTasks(prev => [...prev, task])
    toast.success(`"${task.title}" added`)
    setNewTask(BLANK_TASK)

    // Phase 5.5b — persist a calendar event for the task, plus an
    // equipment reservation per selected chip. Fire-and-forget; the
    // local board state has already optimistically updated.
    ensureEventForTask(task)
      .then(evt => {
        if (task.equipment.length === 0) return
        return Promise.all(task.equipment.map(chip => {
          const eq = eqByCategory[chip]
          return createEquipmentReservation({
            calendarEventId: evt.id,
            equipmentId:     eq?.id ?? null,
            equipmentName:   chip,
            notes:           task.notes || null,
          }).catch(() => {})
        }))
      })
      .catch(() => {})
  }

  function rosterDot(log) {
    if (!log) return 'dim'
    if (['clocked-in','active'].includes(log.status)) return 'green'
    if (['absent','call-out'].includes(log.status))   return 'red'
    if (log.status === 'late')      return 'yellow'
    if (log.status === 'completed') return 'done'
    return 'dim'
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function handleEmpDragStart(e, empId) {
    setDraggingEmpId(empId)
    e.dataTransfer.setData('text/plain', empId)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleEmpDragEnd() {
    setDraggingEmpId(null)
    setDragOverTaskId(null)
  }

  function handleTaskDragOver(e, taskId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverTaskId(taskId)
  }

  function handleTaskDragLeave(e, taskId) {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOverTaskId(prev => prev === taskId ? null : prev)
  }

  function handleTaskDrop(e, taskId) {
    e.preventDefault()
    const empId = e.dataTransfer.getData('text/plain')
    if (!empId) return
    setDragOverTaskId(null)
    assignEmployee(taskId, empId)
  }

  function assignEmployee(taskId, empId) {
    const task    = effectiveTasks.find(t => t.id === taskId)
    const current = task?.assignedTo ?? []
    if (current.includes(empId)) return
    const emp       = empById[empId]
    const firstName = emp?.fullName.split(' ')[0] ?? empId
    setTaskAssignments(p => ({ ...p, [taskId]: [...current, empId] }))
    toast.success(`${firstName} assigned`)

    // Phase 5.5b — persist the assignment. Ensures a backing calendar
    // event exists (Worker dedupes on sourceId), then writes a crew row
    // (Worker dedupes on calendar_event_id + employee_name). Failures
    // are silent: the optimistic UX has already landed.
    if (!emp || !task) return
    ensureEventForTask(task)
      .then(evt => createCrewAssignment({
        calendarEventId: evt.id,
        employeeName:    emp.fullName,
        role:            emp.role ?? null,
        status:          'assigned',
        notes:           null,
      }))
      .catch(() => {})
  }

  function unassignEmployee(taskId, empId) {
    const task    = effectiveTasks.find(t => t.id === taskId)
    const current = task?.assignedTo ?? []
    const emp       = empById[empId]
    const firstName = emp?.fullName.split(' ')[0] ?? empId
    setTaskAssignments(p => ({ ...p, [taskId]: current.filter(id => id !== empId) }))
    toast.info(`${firstName} removed`)

    // Phase 5.5b — remove the persistent assignment. Lookup via cached
    // calendar event (sourceId === task.id) and crewAssignments
    // (calendarEventId + employeeName). Best-effort: a cache miss means
    // nothing to remove server-side either.
    if (!emp || !task) return
    const event = calendarEvents.find(e =>
      (e.metadata?.sourceId ?? e.sourceId) === task.id,
    )
    if (!event) return
    const row = crewAssignments.find(a =>
      a.calendarEventId === event.id && a.employeeName === emp.fullName,
    )
    if (row) deleteCrewAssignment(row.id).catch(() => {})
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell
      title="Operations"
      description="Daily crew management, routing, scheduling, assignments, and operational coordination."
      tabs={TAB_LABELS}
      activeTab={ID_TO_LABEL[activeTab]}
      onTabChange={label => setActiveTab(LABEL_TO_ID[label])}
      actions={
        <WorkspaceActions>
          <span className={styles.obClockChip} aria-label="Current time">{timeStr}</span>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => {
              setActiveTab('board')
              setTimeout(() => addTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
            }}
          >
            + Task
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab('schedule')}
          >
            Schedule
          </button>
        </WorkspaceActions>
      }
    >

      {/* ── Crew sub-tabs ────────────────────────────────────────────────── */}
      {activeTab !== 'board' && (
        <div className={styles.obSecondary}>
          {activeTab === 'schedule'    && <CrewSchedule />}
          {activeTab === 'assignments' && <CrewAssignments />}
          {activeTab === 'employees'   && <CrewEmployees />}
          {activeTab === 'hours'       && <CrewHours />}
          {activeTab === 'notes'       && <CrewNotes />}
        </div>
      )}

      {/* ── Primary Operations Board ─────────────────────────────────────── */}
      {activeTab === 'board' && (
        <div className={styles.obBoard}>

          {/* Header */}
          <div className={styles.obHeader}>

            {/* Left: routing + weather signal */}
            <div className={styles.obHeaderLeft}>
              <div className={styles.obRoutingRow}>
                <span className={styles.obRoutingLabel}>Routing</span>
                <select
                  className={styles.obRoutingSelect}
                  value={routing}
                  onChange={e => setRouting(e.target.value)}
                >
                  {ROUTING_OPTIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              {weatherWarnings.length > 0 && (
                <div
                  className={styles.obWeatherSignal}
                  aria-label="Operational weather warnings"
                >
                  {weatherWarnings.map(w => (
                    <button
                      key={w.id}
                      type="button"
                      className={styles.obWeatherChip}
                      data-tone={w.tone}
                      title={`Weather: ${w.label} — open weather notes`}
                      onClick={() => {
                        setNotesTab('Weather')
                        setPanelOpen(true)
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Center: date selector */}
            <div className={styles.obHeaderCenter}>
              <div className={styles.obDatePicker}>
                <button className={styles.obDateChevron} onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button>
                <label className={styles.obDateDisplay}>
                  <span className={styles.obDateIcon}>📅</span>
                  <span className={styles.obDateText}>{formatDate(selectedDate)}</span>
                  <span className={styles.obDateDownChevron}>▾</span>
                  <input
                    type="date"
                    className={styles.obDateInput}
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    aria-label="Select date"
                  />
                </label>
                <button className={styles.obDateChevron} onClick={() => shiftDate(1)} aria-label="Next day">›</button>
              </div>
            </div>

            {/* Right: stats + actions */}
            <div className={styles.obHeaderRight}>
              <div className={styles.obStats}>
                <div className={styles.obStat}>
                  <span className={styles.obStatVal}>{stats.active}</span>
                  <span className={styles.obStatLbl}>Active</span>
                </div>
                <div className={styles.obStat}>
                  <span className={styles.obStatVal}>{doneCount}</span>
                  <span className={styles.obStatLbl}>Done</span>
                </div>
                <div className={styles.obStat} data-late={stats.late > 0 ? 'true' : 'false'}>
                  <span className={styles.obStatVal}>{stats.late}</span>
                  <span className={styles.obStatLbl}>Late</span>
                </div>
                <div className={styles.obStat}>
                  <span className={styles.obStatVal}>{stats.absent}</span>
                  <span className={styles.obStatLbl}>Absent</span>
                </div>
              </div>
              <button
                className={styles.obSettingsBtn}
                onClick={() => setSettingsOpen(true)}
              >
                ⚙ Settings
              </button>
              <button
                className={`${styles.obPanelBtn} ${panelOpen ? styles.obPanelBtnActive : ''}`}
                onClick={() => setPanelOpen(o => !o)}
                title="Toggle Operations Panel"
              >
                Panel
              </button>
            </div>
          </div>

          {/* 3-column layout */}
          <div className={styles.obColumns}>

            {/* Left: Crew Roster ───────────────────────────────────────── */}
            <div className={styles.obColLeft}>
              <div className={styles.obColHeader}>Crew Today</div>
              <div className={styles.obRosterList}>
                {EMPLOYEES.length === 0 && (
                  <EmptyState
                    compact
                    title="No crew added"
                    description="Crew members will appear here once added."
                  />
                )}
                {EMPLOYEES.map(emp => {
                  const log      = todayLog[emp.employeeId]
                  const dot      = rosterDot(log)
                  const isAbsent = dot === 'red'
                  const initials = emp.fullName.split(' ').map(n => n[0]).join('')
                  return (
                    <div
                      key={emp.employeeId}
                      className={styles.obRosterCard}
                      data-dot={dot}
                      draggable={!isAbsent}
                      data-dragging={draggingEmpId === emp.employeeId ? 'true' : undefined}
                      onDragStart={isAbsent ? undefined : e => handleEmpDragStart(e, emp.employeeId)}
                      onDragEnd={isAbsent ? undefined : handleEmpDragEnd}
                    >
                      <div className={styles.obRosterAvatar} data-dot={dot}>{initials}</div>
                      <div className={styles.obRosterInfo}>
                        <span className={styles.obRosterName}>
                          {emp.fullName.split(' ')[0]} {emp.fullName.split(' ')[1]?.[0]}.
                        </span>
                        <span className={styles.obRosterRole}>{emp.role}</span>
                      </div>
                      <div className={styles.obRosterDot} data-dot={dot} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Center: Task Groups ─────────────────────────────────────── */}
            <div className={styles.obColCenter}>

              {/* Sticky center header */}
              <div className={styles.obCenterHeader}>
                <div className={styles.obCenterTitle}>
                  Today's Operations
                  <span className={styles.obTaskCount}>{effectiveTasks.length} tasks</span>
                </div>
                <div className={styles.obDensityToggle}>
                  {DENSITY_OPTIONS.map(d => (
                    <button
                      key={d}
                      className={styles.obDensityBtn}
                      data-active={density === d.toLowerCase()}
                      onClick={() => setDensity(d.toLowerCase())}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable task area */}
              <div className={styles.obCenterScroll} data-density={density}>

                {/* ── Schedule Overview Timeline ── */}
                <div className={styles.obTimeline}>
                  <button
                    className={styles.obTimelineHeader}
                    onClick={() => setTimelineOpen(o => !o)}
                  >
                    <span className={styles.obTimelineTitle}>Schedule Overview</span>
                    <span className={styles.obTimelineSub}>Live assignment timeline</span>
                    <span className={styles.obTimelineChevron} data-open={timelineOpen ? 'true' : 'false'}>▾</span>
                  </button>

                  {timelineOpen && (
                    <Timeline
                      start={TIMELINE_START}
                      end={TIMELINE_END}
                      now={nowHour}
                      gridlines={TIMELINE_SPAN}
                      ariaLabel="Crew assignment timeline"
                    >
                      <Timeline.Scale
                        ticks={[5, 7, 9, 11, 13, 15]}
                        format={h => h < 12 ? `${h}A` : h === 12 ? 'N' : `${h - 12}P`}
                      />
                      {timelineRows.map(({ emp, firstName, blocks }) => (
                        <Timeline.Row key={emp.employeeId} label={firstName} ariaLabel={emp.fullName}>
                          {blocks.map(block => (
                            <Timeline.Item
                              key={block.taskId}
                              start={block.startHr}
                              span={block.spanHr}
                              status={block.status}
                              title={block.title}
                              className={styles.obTimelineBlock}
                            />
                          ))}
                        </Timeline.Row>
                      ))}
                    </Timeline>
                  )}
                </div>

                {/* ── Add Task section ── */}
                <div className={styles.obAddTask} ref={addTaskRef}>
                  <div className={styles.obAddTaskHeader}>
                    <span className={styles.obAddTaskTitle}>Add Task</span>
                    <span className={styles.obAddTaskHint}>Drag crew from roster to assign after creation</span>
                  </div>

                  <div className={styles.obAddTaskForm}>
                    {/* Row 1: core fields */}
                    <div className={styles.obAddTaskRow}>
                      <select
                        className={`${styles.obAddTaskSelect} ${styles.obAddTaskSelectTitle}`}
                        value={newTask.title}
                        onChange={e => setNewTaskField('title', e.target.value)}
                      >
                        <option value="">— Select task —</option>
                        {TASK_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      <div className={styles.obAddTaskHrsWrap}>
                        <input
                          type="number"
                          className={styles.obAddTaskHrs}
                          value={newTask.estimatedHours}
                          min="0.5"
                          step="0.5"
                          onChange={e => setNewTaskField('estimatedHours', e.target.value)}
                          aria-label="Estimated hours"
                          title="Estimated hours"
                        />
                        <span className={styles.obAddTaskHrsLabel}>hrs</span>
                      </div>

                      <select
                        className={styles.obAddTaskSelect}
                        value={newTask.priority}
                        onChange={e => setNewTaskField('priority', e.target.value)}
                      >
                        <option value="low">Low</option>
                        <option value="routine">Routine</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>

                      <select
                        className={styles.obAddTaskSelect}
                        value={newTask.status}
                        onChange={e => setNewTaskField('status', e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="weather-hold">Weather Hold</option>
                        <option value="blocked">Blocked</option>
                      </select>

                      <div className={styles.obAddTaskBtns}>
                        <button className={styles.obAddTaskSubmit} onClick={handleAddTask}>
                          Add Task
                        </button>
                        <button className={styles.obAddTaskClear} onClick={() => setNewTask(BLANK_TASK)}>
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Row 2: equipment chips */}
                    <div className={styles.obAddTaskEqRow}>
                      <span className={styles.obAddTaskEqLabel}>Equipment</span>
                      <div className={styles.obAddTaskEqChips}>
                        {EQ_CHIPS.map(chip => (
                          <button
                            key={chip}
                            className={styles.obAddTaskEqChip}
                            data-active={newTask.equipment.includes(chip) ? 'true' : 'false'}
                            onClick={() => toggleEqChip(chip)}
                            type="button"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 3: notes */}
                    <textarea
                      className={styles.obAddTaskNotes}
                      value={newTask.notes}
                      onChange={e => setNewTaskField('notes', e.target.value)}
                      placeholder="Notes (optional)..."
                      rows={2}
                    />
                  </div>
                </div>

                {/* Task groups */}
                <div className={styles.obTaskList}>
                  {effectiveTasks.length === 0 && (
                    <EmptyState
                      title="No active tasks scheduled."
                      description="Use the Add Task form above or click + Task in the header to create your first operation."
                      actionLabel="+ Add Task"
                      onAction={() => addTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                    />
                  )}
                  {groupedTasks.map(group => group.tasks.length === 0 ? null : (
                    <div key={group.key} className={styles.obGroup}>

                      <button className={styles.obGroupHeader} onClick={() => toggleGroup(group.key)}>
                        <span className={styles.obSectionLabel}>{group.label}</span>
                        <span className={styles.obSectionCount}>({group.tasks.length})</span>
                        <span className={styles.obSectionChevron} data-collapsed={collapsedGroups.has(group.key)}>▾</span>
                      </button>

                      {!collapsedGroups.has(group.key) && (
                        <div className={styles.obGroupTasks}>
                          {group.tasks.map(task => {
                            const isCompleted    = task.status === 'completed'
                            const isWeatherHold  = task.status === 'weather-hold'
                            const hasLongNote    = task.notes && task.notes.length > 80
                            const isNoteExpanded = density === 'expanded' || expandedNoteIds.has(task.id)
                            const progress       = task.estimatedHours > 0
                              ? Math.min(100, Math.round((task.completedHours / task.estimatedHours) * 100))
                              : 0
                            const assignedEmps = (task.assignedTo || []).map(id => empById[id]).filter(Boolean)

                            return (
                              <div
                                key={task.id}
                                className={styles.obTaskCard}
                                data-status={task.status}
                                data-dropover={dragOverTaskId === task.id ? 'true' : undefined}
                                onDragOver={e => handleTaskDragOver(e, task.id)}
                                onDragLeave={e => handleTaskDragLeave(e, task.id)}
                                onDrop={e => handleTaskDrop(e, task.id)}
                              >
                                <div className={styles.obDropHint}>Drop to assign</div>

                                <div className={styles.obTaskTop}>
                                  <div className={styles.obTaskTitleRow}>
                                    <span className={`${styles.obTaskTitle} ${isCompleted ? styles.obTitleDone : ''}`}>
                                      {task.title}
                                    </span>
                                    <span className={styles.obPriBadge} data-priority={task.priority}>
                                      {PRIORITY_LABEL[task.priority] ?? task.priority}
                                    </span>
                                  </div>
                                  <span className={styles.obStatusPill} data-status={task.status}>
                                    {STATUS_LABEL[task.status] ?? task.status}
                                  </span>
                                </div>

                                {task.assignedArea && (
                                  <div className={styles.obTaskArea}>{task.assignedArea}</div>
                                )}

                                {assignedEmps.length > 0 ? (
                                  <div className={styles.obTaskAssigned}>
                                    {assignedEmps.map(emp => (
                                      <span key={emp.employeeId} className={styles.obEmpChip}>
                                        {emp.fullName.split(' ').map(n => n[0]).join('')}
                                        <button
                                          className={styles.obEmpChipRemove}
                                          onClick={e => { e.stopPropagation(); unassignEmployee(task.id, emp.employeeId) }}
                                          aria-label={`Remove ${emp.fullName.split(' ')[0]}`}
                                        >×</button>
                                      </span>
                                    ))}
                                    <span className={styles.obAssignedNames}>
                                      {assignedEmps.map(e => e.fullName.split(' ')[0]).join(', ')}
                                    </span>
                                  </div>
                                ) : (
                                  <div className={styles.obUnassigned}>Unassigned</div>
                                )}

                                {task.estimatedHours > 0 && (
                                  <div className={styles.obProgressRow}>
                                    <div className={styles.obProgressTrack}>
                                      <div
                                        className={styles.obProgressFill}
                                        data-status={task.status}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className={styles.obProgressLabel}>
                                      {task.completedHours}h / {task.estimatedHours}h
                                    </span>
                                  </div>
                                )}

                                {task.equipment.length > 0 && (
                                  <div className={styles.obEqRow}>
                                    {task.equipment.map(name => {
                                      const eq = eqByCategory[name]
                                      const hasOverdueMaint = overdueMaintCategories.has(name)
                                      const isUnavailable = eq?.status === 'out-of-service'
                                      const titleParts = [
                                        eq ? `${eq.name} — ${eq.status}` : name,
                                        hasOverdueMaint && !isUnavailable ? 'overdue maintenance' : null,
                                        eq ? 'click to open in Equipment' : null,
                                      ].filter(Boolean)
                                      const handleClick = (e) => {
                                        e.stopPropagation()
                                        if (!eq) return
                                        navigate('/equipment', {
                                          state: { activeTab: 'Equipment List', equipmentId: eq.id },
                                        })
                                      }
                                      return (
                                        <button
                                          key={name}
                                          type="button"
                                          className={styles.obEqChip}
                                          data-eqstatus={eq?.status ?? 'unknown'}
                                          data-overdue-maint={hasOverdueMaint && !isUnavailable ? 'true' : undefined}
                                          title={titleParts.join(' · ')}
                                          onClick={handleClick}
                                          disabled={!eq}
                                        >
                                          {eq?.status === 'out-of-service'    && '🔒 '}
                                          {eq?.status === 'needs-maintenance' && '⚠ '}
                                          {hasOverdueMaint && eq?.status !== 'out-of-service' && eq?.status !== 'needs-maintenance' && '⏰ '}
                                          {name}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}

                                {task.notes && (
                                  <div className={styles.obNoteWrap}>
                                    <div className={`${styles.obTaskNote} ${!isNoteExpanded && hasLongNote ? styles.obNoteClamp : ''}`}>
                                      {task.notes}
                                    </div>
                                    {hasLongNote && density !== 'expanded' && (
                                      <button className={styles.obNoteToggle} onClick={() => toggleNote(task.id)}>
                                        {isNoteExpanded ? '▲ less' : '▾ more'}
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div className={styles.obCardActionsWrap}>
                                  <div className={styles.obCardActions}>
                                    <button
                                      className={styles.obAction}
                                      data-variant={isCompleted ? 'done' : 'complete'}
                                      onClick={() => handleAction(task.id, 'complete')}
                                    >
                                      {isCompleted ? '↩ Undo' : '✓ Complete'}
                                    </button>
                                    <button
                                      className={styles.obAction}
                                      data-variant={isWeatherHold ? 'active' : 'default'}
                                      onClick={() => handleAction(task.id, 'hold')}
                                    >
                                      ⛅ Hold
                                    </button>
                                    <button className={styles.obAction} onClick={() => handleAction(task.id, 'delay')}>
                                      ↷ Delay
                                    </button>
                                    <button className={styles.obAction} onClick={() => handleAction(task.id, 'reassign')}>
                                      ↗ Reassign
                                    </button>
                                    {task.notes && (
                                      <button
                                        className={styles.obAction}
                                        data-variant={expandedNoteIds.has(task.id) ? 'active' : 'default'}
                                        onClick={() => toggleNote(task.id)}
                                      >
                                        {expandedNoteIds.has(task.id) ? '▲ Notes' : '▾ Notes'}
                                      </button>
                                    )}
                                  </div>

                                  <div className={styles.obOverflowWrap}>
                                    <button
                                      className={styles.obOverflowBtn}
                                      aria-label="More actions"
                                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === task.id ? null : task.id) }}
                                    >⋮</button>
                                    {openMenuId === task.id && (
                                      <div className={styles.obOverflowMenu}>
                                        <button className={styles.obOverflowItem} onClick={() => { handleAction(task.id, 'complete'); setOpenMenuId(null) }}>
                                          {isCompleted ? '↩ Undo Complete' : '✓ Complete'}
                                        </button>
                                        <button className={styles.obOverflowItem} onClick={() => { handleAction(task.id, 'hold'); setOpenMenuId(null) }}>
                                          ⛅ Weather Hold
                                        </button>
                                        <button className={styles.obOverflowItem} onClick={() => { handleAction(task.id, 'delay'); setOpenMenuId(null) }}>
                                          ↷ Delay
                                        </button>
                                        <button className={styles.obOverflowItem} onClick={() => { handleAction(task.id, 'reassign'); setOpenMenuId(null) }}>
                                          ↗ Reassign
                                        </button>
                                        <button
                                          className={`${styles.obOverflowItem} ${styles.obOverflowItemDanger}`}
                                          onClick={() => { confirmDelete(task); setOpenMenuId(null) }}
                                        >
                                          🗑 Delete Task
                                        </button>
                                        {task.notes && (
                                          <button className={styles.obOverflowItem} onClick={() => { toggleNote(task.id); setOpenMenuId(null) }}>
                                            {expandedNoteIds.has(task.id) ? '▲ Hide Notes' : '▾ Show Notes'}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className={styles.obDeleteRow}>
                                  <button className={styles.obDeleteBtn} onClick={() => confirmDelete(task)}>
                                    🗑 Delete Task
                                  </button>
                                </div>

                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Operations Panel ─────────────────────────────────── */}
            <div className={`${styles.obColRight} ${panelOpen ? styles.obColRightOpen : ''}`}>

              {/* Turf Operations — simplified info display */}
              <div className={styles.obPanelSec}>
                <div className={styles.obPanelSecHeader}>Turf Operations</div>

                <div className={styles.obTurfInfo}>

                  <div className={styles.obTurfSection}>
                    <div className={styles.obTurfSectionTitle}>Greens</div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Mowing Direction</span>
                      <span className={styles.obTurfVal}>N/S</span>
                    </div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Cleanup Cut</span>
                      <span className={styles.obTurfVal}>Yes</span>
                    </div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Double Cut</span>
                      <span className={styles.obTurfVal}>No</span>
                    </div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Rolling</span>
                      <span className={styles.obTurfVal}>Light</span>
                    </div>
                  </div>

                  <div className={styles.obTurfSection}>
                    <div className={styles.obTurfSectionTitle}>Fairways</div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Pattern</span>
                      <span className={styles.obTurfVal}>Striped</span>
                    </div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Cleanup Pass</span>
                      <span className={styles.obTurfVal}>Perimeter only</span>
                    </div>
                  </div>

                  <div className={styles.obTurfSection}>
                    <div className={styles.obTurfSectionTitle}>Tees &amp; Bunkers</div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Tee Direction</span>
                      <span className={styles.obTurfVal}>Diagonal</span>
                    </div>
                    <div className={styles.obTurfRow}>
                      <span className={styles.obTurfKey}>Bunkers</span>
                      <span className={styles.obTurfVal}>Raked</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Notes */}
              <div className={styles.obPanelSec}>
                <div className={styles.obPanelSecHeader}>Notes</div>
                <div className={styles.obNotesTabs}>
                  {NOTES_TABS.map(t => (
                    <button
                      key={t}
                      className={`${styles.obNotesTab} ${notesTab === t ? styles.obNotesTabActive : ''}`}
                      onClick={() => setNotesTab(t)}
                    >{t}</button>
                  ))}
                </div>
                <textarea
                  className={styles.obNotesArea}
                  value={notes[notesTab]}
                  onChange={e => setNotes(prev => ({ ...prev, [notesTab]: e.target.value }))}
                  placeholder={`${notesTab} notes...`}
                />
              </div>

            </div>
          </div>

          {/* Panel overlay (tablet/mobile) */}
          {panelOpen && <div className={styles.obOverlay} onClick={() => setPanelOpen(false)} />}

          {/* Overflow menu backdrop */}
          {openMenuId && <div className={styles.obMenuBackdrop} onClick={() => setOpenMenuId(null)} />}

          {/* ── Delete confirmation modal ─────────────────────────────── */}
          {deleteConfirm && (
            <>
              <div className={styles.obModalBackdrop} onClick={() => setDeleteConfirm(null)} />
              <div className={styles.obModal} role="dialog" aria-modal="true">
                <div className={styles.obModalTitle}>Delete Task</div>
                <p className={styles.obModalMsg}>
                  Are you sure you want to delete <strong>"{deleteConfirm.title}"</strong>?
                  This action cannot be undone.
                </p>
                <div className={styles.obModalActions}>
                  <button className={styles.obModalCancel} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                  <button className={styles.obModalDelete} onClick={handleDelete}>Delete</button>
                </div>
              </div>
            </>
          )}

          {/* ── Settings modal ───────────────────────────────────────── */}
          {settingsOpen && (
            <>
              <div className={styles.obModalBackdrop} onClick={() => setSettingsOpen(false)} />
              <div className={styles.obSettingsModal} role="dialog" aria-modal="true">
                <div className={styles.obSettingsHeader}>
                  <span className={styles.obSettingsTitle}>Operations Settings</span>
                  <button className={styles.obSettingsClose} onClick={() => setSettingsOpen(false)} aria-label="Close">✕</button>
                </div>
                <div className={styles.obSettingsBody}>
                  {[
                    { title: 'Density Defaults', desc: 'Set default card density for the board view.' },
                    { title: 'Timeline Options',  desc: 'Configure timeline range and display preferences.' },
                    { title: 'Crew Display',      desc: 'Control how crew roster and assignments are shown.' },
                    { title: 'Turf Operations Defaults', desc: 'Set daily turf operation parameters and defaults.' },
                  ].map(sec => (
                    <div key={sec.title} className={styles.obSettingsSection}>
                      <div className={styles.obSettingsSectionTitle}>{sec.title}</div>
                      <div className={styles.obSettingsSectionDesc}>{sec.desc}</div>
                      <span className={styles.obSettingsComingSoon}>Coming soon</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </PageShell>
  )
}
