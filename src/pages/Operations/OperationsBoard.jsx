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

  // ── Live clock ────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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
    TASKS.map(t => ({ ...t, status: taskOverrides[t.id]?.status ?? t.status })),
  [taskOverrides])

  const groupedTasks = useMemo(() =>
    TASK_GROUPS.map(g => ({
      ...g,
      tasks: effectiveTasks.filter(t => g.statuses.includes(t.status)),
    })),
  [effectiveTasks])

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

  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function setMow(key, val) {
    setMowOps(prev => ({ ...prev, [key]: val }))
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
      toast.info('Reassignment coming soon')
    }
  }

  function rosterDot(log) {
    if (!log) return 'dim'
    if (['clocked-in','active'].includes(log.status)) return 'green'
    if (['absent','call-out'].includes(log.status))   return 'red'
    if (log.status === 'late')      return 'yellow'
    if (log.status === 'completed') return 'done'
    return 'dim'
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
            <div className={styles.obHeaderLeft}>
              <span className={styles.obDate}>Friday · May 9, 2026</span>
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

            <div className={styles.obHeaderCenter}>
              <span className={styles.obWeather}>
                {WEATHER.temp}°F &nbsp;·&nbsp; {WEATHER.wind} &nbsp;·&nbsp; {WEATHER.humidity}% RH
              </span>
              <span className={styles.obFrostBadge} data-frost={WEATHER.frost ? 'warn' : 'clear'}>
                {WEATHER.frost ? '⚠ FROST RISK' : '✓ No Frost Risk'}
              </span>
            </div>

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
                  const log = todayLog[emp.employeeId]
                  const dot = rosterDot(log)
                  const initials = emp.fullName.split(' ').map(n => n[0]).join('')
                  return (
                    <div key={emp.employeeId} className={styles.obRosterCard} data-dot={dot}>
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
                              >
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

        </div>
      )}
    </div>
  )
}
