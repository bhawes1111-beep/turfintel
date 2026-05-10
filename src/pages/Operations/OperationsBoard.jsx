import { useState, useMemo, useEffect } from 'react'
import { useCourse } from '../../context/CourseContext'
import { useToast } from '../../utils/feedback/toastContext'
import { EMPLOYEES, TASKS, HOURS_LOG } from '../../data/crew'
import { EQUIPMENT_LIST } from '../../data/equipment'
import CrewSchedule  from '../Crew/tabs/CrewSchedule'
import CrewEmployees from '../Crew/tabs/CrewEmployees'
import CrewHours     from '../Crew/tabs/CrewHours'
import CrewNotes     from '../Crew/tabs/CrewNotes'
import styles from './OperationsBoard.module.css'

const TODAY = '2026-05-08'

const WEATHER = { temp: 68, wind: '8 mph SW', humidity: 64, frost: false }

const ROUTING_OPTIONS = ['Press & Roll', 'Hammer', 'Normal', 'Modified', 'Event Prep']
const PATTERN_OPTIONS = ['8-2', '6-2', '4-2', '2-2', 'Diagonal', 'Cross']
const DIR_OPTIONS     = ['N/S', 'E/W', 'NE/SW', 'NW/SE']
const FW_PATTERNS     = ['Striped', 'Diagonal', 'Checker', 'Standard']
const TEE_PATTERNS    = ['Diagonal', 'Standard', 'Striped', 'Cross']
const BUNKER_OPTIONS  = ['Raked', 'Skip', 'Deep Rake', 'Edge Only']
const NOTES_TABS      = ['Daily', 'Weather', 'Super', 'Geo', 'Alerts']

const TIMELINE_START = 5
const TIMELINE_END   = 16
const TIMELINE_SPAN  = TIMELINE_END - TIMELINE_START

const INITIAL_NOTES = {
  Daily:   'Morning greens cut in progress. Pre-emergent applied to front nine. Bunker work deferred — James T. absent.',
  Weather: '68°F at 6:00 AM. Wind 8 mph SW. Low humidity (64%). No precipitation. Ideal spray window 6–10 AM.',
  Super:   '',
  Geo:     'Championship Course: Holes 1–18. Member-Guest tournament begins May 11. Priority: presentation quality.',
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
  { id: 'board',     label: 'Operations Board' },
  { id: 'schedule',  label: 'Schedule' },
  { id: 'employees', label: 'Employees' },
  { id: 'hours',     label: 'Hours' },
  { id: 'notes',     label: 'Notes' },
]

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

export default function OperationsBoard() {
  const { activeCourse } = useCourse()
  const toast = useToast()

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
  const [deleteConfirm,  setDeleteConfirm]  = useState(null) // { id, title } | null

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

  // ── Escape closes delete modal ────────────────────────────────────────────
  useEffect(() => {
    if (!deleteConfirm) return
    const handler = e => { if (e.key === 'Escape') setDeleteConfirm(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteConfirm])

  // ── Right panel ───────────────────────────────────────────────────────────
  const [notesTab, setNotesTab] = useState('Daily')
  const [notes,    setNotes]    = useState(INITIAL_NOTES)
  const [mowOps,   setMowOps]   = useState({
    greensPattern:   '8-2',
    greensDirection: 'N/S',
    doubleCut:       false,
    rollGreens:      true,
    fairwayPattern:  'Striped',
    teePattern:      'Diagonal',
    bunkersStatus:   'Raked',
  })

  // ── Derived data ──────────────────────────────────────────────────────────

  const eqByCategory = useMemo(() => {
    const map = {}
    EQUIPMENT_LIST.forEach(eq => { if (!map[eq.category]) map[eq.category] = eq })
    return map
  }, [])

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

  const effectiveTasks = useMemo(() =>
    TASKS
      .filter(t => !deletedTaskIds.has(t.id))
      .map(t => ({
        ...t,
        status:     taskOverrides[t.id]?.status ?? t.status,
        assignedTo: taskAssignments[t.id]       ?? t.assignedTo,
      })),
  [taskOverrides, taskAssignments, deletedTaskIds])

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
          const left  = Math.max(0, ((cursor - TIMELINE_START) / TIMELINE_SPAN) * 100)
          const width = Math.min(100 - left, (task.estimatedHours / TIMELINE_SPAN) * 100)
          const block = { taskId: task.id, title: task.title, status: task.status, left, width }
          cursor += task.estimatedHours
          return block
        })
        return { emp, firstName: emp.fullName.split(' ')[0], blocks }
      }),
  [effectiveTasks, todayLog])

  const mowNote = useMemo(() => {
    const parts = [`Greens: Pattern ${mowOps.greensPattern} — ${mowOps.greensDirection}`]
    if (mowOps.doubleCut)  parts.push('Double Cut')
    if (mowOps.rollGreens) parts.push('Roll')
    parts.push(`Fairways: ${mowOps.fairwayPattern}`)
    parts.push(`Tees: ${mowOps.teePattern}`)
    parts.push(`Bunkers: ${mowOps.bunkersStatus}`)
    return parts.join(' · ')
  }, [mowOps])

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

  function setMow(key, val) {
    setMowOps(prev => ({ ...prev, [key]: val }))
  }

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
    const original = TASKS.find(t => t.id === taskId)?.status ?? 'open'
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
    const firstName = empById[empId]?.fullName.split(' ')[0] ?? empId
    setTaskAssignments(p => ({ ...p, [taskId]: [...current, empId] }))
    toast.success(`${firstName} assigned`)
  }

  function unassignEmployee(taskId, empId) {
    const task    = effectiveTasks.find(t => t.id === taskId)
    const current = task?.assignedTo ?? []
    const firstName = empById[empId]?.fullName.split(' ')[0] ?? empId
    setTaskAssignments(p => ({ ...p, [taskId]: current.filter(id => id !== empId) }))
    toast.info(`${firstName} removed`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.obPage}>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className={styles.obTabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.obTab} ${activeTab === t.id ? styles.obTabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className={styles.obTabSpacer} />
        <span className={styles.obClock}>{timeStr}</span>
        <span className={styles.obCourseLabel}>{activeCourse?.name}</span>
      </div>

      {/* ── Secondary tabs ───────────────────────────────────────────────── */}
      {activeTab !== 'board' && (
        <div className={styles.obSecondary}>
          {activeTab === 'schedule'  && <CrewSchedule />}
          {activeTab === 'employees' && <CrewEmployees />}
          {activeTab === 'hours'     && <CrewHours />}
          {activeTab === 'notes'     && <CrewNotes />}
        </div>
      )}

      {/* ── Primary Operations Board ─────────────────────────────────────── */}
      {activeTab === 'board' && (
        <div className={styles.obBoard}>

          {/* Header */}
          <div className={styles.obHeader}>

            {/* Left: routing */}
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
            </div>

            {/* Center: date selector */}
            <div className={styles.obHeaderCenter}>
              <div className={styles.obDatePicker}>
                <button
                  className={styles.obDateChevron}
                  onClick={() => shiftDate(-1)}
                  aria-label="Previous day"
                >‹</button>

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

                <button
                  className={styles.obDateChevron}
                  onClick={() => shiftDate(1)}
                  aria-label="Next day"
                >›</button>
              </div>
            </div>

            {/* Right: stats + buttons */}
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
              <button className={styles.obQuickBtn}>+ Task</button>
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

              {/* Sticky center header: title + density toggle */}
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
                    <span
                      className={styles.obTimelineChevron}
                      data-open={timelineOpen ? 'true' : 'false'}
                    >▾</span>
                  </button>

                  {timelineOpen && (
                    <div className={styles.obTimelineBody}>
                      <div className={styles.obTimelineInner}>

                        {/* Hour scale */}
                        <div className={styles.obTimelineScale}>
                          <div />
                          <div className={styles.obTimelineScaleRow}>
                            {[5, 7, 9, 11, 13, 15].map(h => {
                              const label = h < 12 ? `${h}A` : h === 12 ? 'N' : `${h - 12}P`
                              const pct   = ((h - TIMELINE_START) / TIMELINE_SPAN) * 100
                              return (
                                <span
                                  key={h}
                                  className={styles.obTimelineHourTick}
                                  style={{ left: `${pct}%` }}
                                >
                                  {label}
                                </span>
                              )
                            })}
                          </div>
                        </div>

                        {/* Employee rows */}
                        {timelineRows.map(({ emp, firstName, blocks }) => (
                          <div key={emp.employeeId} className={styles.obTimelineRow}>
                            <span className={styles.obTimelineLabel}>{firstName}</span>
                            <div className={styles.obTimelineTrack}>
                              {blocks.map(block => (
                                <div
                                  key={block.taskId}
                                  className={styles.obTimelineBlock}
                                  data-status={block.status}
                                  style={{
                                    left:  `${block.left}%`,
                                    width: `${Math.max(block.width, 1.5)}%`,
                                  }}
                                  title={block.title}
                                />
                              ))}
                              <div
                                className={styles.obTimelineNow}
                                style={{ left: `${nowPercent}%` }}
                              />
                            </div>
                          </div>
                        ))}

                      </div>
                    </div>
                  )}
                </div>

                {/* Task groups */}
                <div className={styles.obTaskList}>
                  {groupedTasks.map(group => group.tasks.length === 0 ? null : (
                    <div key={group.key} className={styles.obGroup}>

                      {/* Sticky group header */}
                      <button
                        className={styles.obGroupHeader}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <span className={styles.obSectionLabel}>{group.label}</span>
                        <span className={styles.obSectionCount}>({group.tasks.length})</span>
                        <span
                          className={styles.obSectionChevron}
                          data-collapsed={collapsedGroups.has(group.key)}
                        >▾</span>
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
                            const assignedEmps = (task.assignedTo || [])
                              .map(id => empById[id]).filter(Boolean)

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
                                {/* Drop hint — always in DOM, shown via CSS when data-dropover */}
                                <div className={styles.obDropHint}>Drop to assign</div>

                                {/* Title row */}
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

                                {/* Area */}
                                <div className={styles.obTaskArea}>{task.assignedArea}</div>

                                {/* Crew */}
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

                                {/* Progress */}
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

                                {/* Equipment chips */}
                                {task.equipment.length > 0 && (
                                  <div className={styles.obEqRow}>
                                    {task.equipment.map(name => {
                                      const eq = eqByCategory[name]
                                      return (
                                        <span
                                          key={name}
                                          className={styles.obEqChip}
                                          data-eqstatus={eq?.status ?? 'unknown'}
                                          title={eq ? `${eq.name} — ${eq.status}` : name}
                                        >
                                          {eq?.status === 'out-of-service'    && '🔒 '}
                                          {eq?.status === 'needs-maintenance' && '⚠ '}
                                          {name}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Notes (expandable) */}
                                {task.notes && (
                                  <div className={styles.obNoteWrap}>
                                    <div className={`${styles.obTaskNote} ${!isNoteExpanded && hasLongNote ? styles.obNoteClamp : ''}`}>
                                      {task.notes}
                                    </div>
                                    {hasLongNote && density !== 'expanded' && (
                                      <button
                                        className={styles.obNoteToggle}
                                        onClick={() => toggleNote(task.id)}
                                      >
                                        {isNoteExpanded ? '▲ less' : '▾ more'}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Quick actions */}
                                <div className={styles.obCardActionsWrap}>
                                  {/* Desktop: hover-reveal */}
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
                                    <button
                                      className={styles.obAction}
                                      onClick={() => handleAction(task.id, 'delay')}
                                    >
                                      ↷ Delay
                                    </button>
                                    <button
                                      className={styles.obAction}
                                      onClick={() => handleAction(task.id, 'reassign')}
                                    >
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

                                  {/* Mobile: overflow ⋮ */}
                                  <div className={styles.obOverflowWrap}>
                                    <button
                                      className={styles.obOverflowBtn}
                                      aria-label="More actions"
                                      onClick={e => {
                                        e.stopPropagation()
                                        setOpenMenuId(openMenuId === task.id ? null : task.id)
                                      }}
                                    >⋮</button>
                                    {openMenuId === task.id && (
                                      <div className={styles.obOverflowMenu}>
                                        <button
                                          className={styles.obOverflowItem}
                                          onClick={() => { handleAction(task.id, 'complete'); setOpenMenuId(null) }}
                                        >
                                          {isCompleted ? '↩ Undo Complete' : '✓ Complete'}
                                        </button>
                                        <button
                                          className={styles.obOverflowItem}
                                          onClick={() => { handleAction(task.id, 'hold'); setOpenMenuId(null) }}
                                        >
                                          ⛅ Weather Hold
                                        </button>
                                        <button
                                          className={styles.obOverflowItem}
                                          onClick={() => { handleAction(task.id, 'delay'); setOpenMenuId(null) }}
                                        >
                                          ↷ Delay
                                        </button>
                                        <button
                                          className={styles.obOverflowItem}
                                          onClick={() => { handleAction(task.id, 'reassign'); setOpenMenuId(null) }}
                                        >
                                          ↗ Reassign
                                        </button>
                                        <button
                                          className={`${styles.obOverflowItem} ${styles.obOverflowItemDanger}`}
                                          onClick={() => { confirmDelete(task); setOpenMenuId(null) }}
                                        >
                                          🗑 Delete Task
                                        </button>
                                        {task.notes && (
                                          <button
                                            className={styles.obOverflowItem}
                                            onClick={() => { toggleNote(task.id); setOpenMenuId(null) }}
                                          >
                                            {expandedNoteIds.has(task.id) ? '▲ Hide Notes' : '▾ Show Notes'}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Delete row — always visible, bottom of card */}
                                <div className={styles.obDeleteRow}>
                                  <button
                                    className={styles.obDeleteBtn}
                                    onClick={() => confirmDelete(task)}
                                  >
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

              <div className={styles.obPanelSec}>
                <div className={styles.obPanelSecHeader}>Turf Operations</div>

                <div className={styles.obPanelGroup}>
                  <div className={styles.obGroupLabel}>Greens</div>
                  <div className={styles.obCtrlRow}>
                    <label className={styles.obCtrlLabel}>Pattern</label>
                    <select className={styles.obCtrlSelect}
                      value={mowOps.greensPattern}
                      onChange={e => setMow('greensPattern', e.target.value)}
                    >
                      {PATTERN_OPTIONS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className={styles.obCtrlRow}>
                    <label className={styles.obCtrlLabel}>Direction</label>
                    <select className={styles.obCtrlSelect}
                      value={mowOps.greensDirection}
                      onChange={e => setMow('greensDirection', e.target.value)}
                    >
                      {DIR_OPTIONS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className={styles.obToggleRow}>
                    <button className={styles.obToggle} data-on={mowOps.doubleCut}
                      onClick={() => setMow('doubleCut', !mowOps.doubleCut)}>Double Cut</button>
                    <button className={styles.obToggle} data-on={mowOps.rollGreens}
                      onClick={() => setMow('rollGreens', !mowOps.rollGreens)}>Roll Greens</button>
                  </div>
                </div>

                <div className={styles.obPanelGroup}>
                  <div className={styles.obGroupLabel}>Fairways</div>
                  <div className={styles.obCtrlRow}>
                    <label className={styles.obCtrlLabel}>Pattern</label>
                    <select className={styles.obCtrlSelect}
                      value={mowOps.fairwayPattern}
                      onChange={e => setMow('fairwayPattern', e.target.value)}
                    >
                      {FW_PATTERNS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.obPanelGroup}>
                  <div className={styles.obGroupLabel}>Tees &amp; Bunkers</div>
                  <div className={styles.obCtrlRow}>
                    <label className={styles.obCtrlLabel}>Tee Pattern</label>
                    <select className={styles.obCtrlSelect}
                      value={mowOps.teePattern}
                      onChange={e => setMow('teePattern', e.target.value)}
                    >
                      {TEE_PATTERNS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className={styles.obCtrlRow}>
                    <label className={styles.obCtrlLabel}>Bunkers</label>
                    <select className={styles.obCtrlSelect}
                      value={mowOps.bunkersStatus}
                      onChange={e => setMow('bunkersStatus', e.target.value)}
                    >
                      {BUNKER_OPTIONS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.obMowNote}>
                  <div className={styles.obMowNoteLabel}>Auto-note</div>
                  <div className={styles.obMowNoteText}>{mowNote}</div>
                </div>
              </div>

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
          {panelOpen && (
            <div className={styles.obOverlay} onClick={() => setPanelOpen(false)} />
          )}

          {/* Overflow menu backdrop */}
          {openMenuId && (
            <div className={styles.obMenuBackdrop} onClick={() => setOpenMenuId(null)} />
          )}

          {/* ── Delete confirmation modal ─────────────────────────────── */}
          {deleteConfirm && (
            <>
              <div
                className={styles.obModalBackdrop}
                onClick={() => setDeleteConfirm(null)}
              />
              <div className={styles.obModal} role="dialog" aria-modal="true">
                <div className={styles.obModalTitle}>Delete Task</div>
                <p className={styles.obModalMsg}>
                  Are you sure you want to delete <strong>"{deleteConfirm.title}"</strong>?
                  This action cannot be undone.
                </p>
                <div className={styles.obModalActions}>
                  <button
                    className={styles.obModalCancel}
                    onClick={() => setDeleteConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.obModalDelete}
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  )
}
