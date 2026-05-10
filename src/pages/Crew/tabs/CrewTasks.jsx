import { useState, useMemo, useEffect } from 'react'
import { TASKS, EMPLOYEES } from '../../../data/crew'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Crew.module.css'

const TODAY = '2026-05-08'

const DEPT_FILTERS = ['All', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory']

const STATUS_FILTERS = [
  { label: 'All',         value: 'All'         },
  { label: 'Open',        value: 'open'        },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed',   value: 'completed'   },
  { label: 'Blocked',     value: 'blocked'     },
]

const PRIORITY_FILTERS = [
  { label: 'All',     value: 'All'     },
  { label: 'High',    value: 'high'    },
  { label: 'Medium',  value: 'medium'  },
  { label: 'Routine', value: 'routine' },
]

const STATUS_META = {
  'open':        { label: 'Open',        cls: 'ctStatusOpen'       },
  'in-progress': { label: 'In Progress', cls: 'ctStatusInProgress' },
  'completed':   { label: 'Completed',   cls: 'ctStatusCompleted'  },
  'blocked':     { label: 'Blocked',     cls: 'ctStatusBlocked'    },
}

const PRIORITY_ACCENT = {
  high:    '#c0392b',
  medium:  '#dca032',
  routine: '#4a9e4a',
}

const SORT_STATUS   = { 'in-progress': 0, open: 1, blocked: 2, completed: 3 }
const SORT_PRIORITY = { high: 0, medium: 1, routine: 2 }

function pct(task) {
  if (task.estimatedHours === 0) return task.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round((task.completedHours / task.estimatedHours) * 100))
}

export default function CrewTasks() {
  const [search,         setSearch]         = useState('')
  const [deptFilter,     setDeptFilter]     = useState('All')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [selected,       setSelected]       = useState(null)

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const empMap = useMemo(() => new Map(EMPLOYEES.map(e => [e.employeeId, e])), [])

  const stats = useMemo(() => ({
    open:        TASKS.filter(t => t.status === 'open' || t.status === 'blocked').length,
    inProgress:  TASKS.filter(t => t.status === 'in-progress').length,
    completed:   TASKS.filter(t => t.status === 'completed').length,
    highPriority: TASKS.filter(t => t.priority === 'high').length,
  }), [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return TASKS
      .filter(t => {
        if (q &&
          !t.title.toLowerCase().includes(q) &&
          !t.assignedArea.toLowerCase().includes(q) &&
          !t.department.toLowerCase().includes(q)) return false
        if (deptFilter     !== 'All' && t.department !== deptFilter)     return false
        if (statusFilter   !== 'All' && t.status     !== statusFilter)   return false
        if (priorityFilter !== 'All' && t.priority   !== priorityFilter) return false
        return true
      })
      .sort((a, b) => {
        const ss = (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9)
        if (ss !== 0) return ss
        return (SORT_PRIORITY[a.priority] ?? 9) - (SORT_PRIORITY[b.priority] ?? 9)
      })
  }, [search, deptFilter, statusFilter, priorityFilter])

  return (
    <div className={styles.ctWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.ctStatRow}>
        <div className={styles.ctStatCard}>
          <span className={styles.ctStatLabel}>Open / Blocked</span>
          <span className={`${styles.ctStatValue} ${stats.open > 0 ? styles.ctStatAmber : ''}`}>
            {stats.open}
          </span>
        </div>
        <div className={styles.ctStatCard}>
          <span className={styles.ctStatLabel}>In Progress</span>
          <span className={`${styles.ctStatValue} ${styles.ctStatTeal}`}>
            {stats.inProgress}
          </span>
        </div>
        <div className={styles.ctStatCard}>
          <span className={styles.ctStatLabel}>Completed Today</span>
          <span className={`${styles.ctStatValue} ${styles.ctStatGreen}`}>
            {stats.completed}
          </span>
        </div>
        <div className={styles.ctStatCard}>
          <span className={styles.ctStatLabel}>High Priority</span>
          <span className={`${styles.ctStatValue} ${stats.highPriority > 0 ? styles.ctStatRed : ''}`}>
            {stats.highPriority}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.ctToolbar}>
        <input
          className={styles.ctSearch}
          type="text"
          placeholder="Search task, area, or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Department chips ─────────────────────────────────────────────── */}
      <div className={styles.ctFilters}>
        {DEPT_FILTERS.map(d => (
          <button
            key={d}
            className={`${styles.ctChip} ${deptFilter === d ? styles.ctChipActive : ''}`}
            onClick={() => setDeptFilter(d)}
          >{d}</button>
        ))}
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────── */}
      <div className={styles.ctFilters}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.ctChip} ${statusFilter === value ? styles.ctChipActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >{label}</button>
        ))}
      </div>

      {/* ── Priority chips ───────────────────────────────────────────────── */}
      <div className={styles.ctFilters}>
        {PRIORITY_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.ctChip} ${priorityFilter === value ? styles.ctChipActive : ''}`}
            onClick={() => setPriorityFilter(value)}
          >{label}</button>
        ))}
      </div>

      <p className={styles.ctCount}>
        {filtered.length} task{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* ── Task list ────────────────────────────────────────────────────── */}
      <div className={styles.ctList}>
        {filtered.map(task => {
          const sm      = STATUS_META[task.status] || { label: task.status, cls: '' }
          const accent  = PRIORITY_ACCENT[task.priority] || 'var(--color-accent)'
          const progress = pct(task)
          const dueToday = task.dueDate === TODAY && task.status !== 'completed'
          const visibleEquip = task.equipment.slice(0, 2)
          const extraEquip   = task.equipment.length - 2

          return (
            <button
              key={task.id}
              className={`${styles.ctCard} ${styles[`ctCard_${task.priority}`]} ${task.status === 'completed' ? styles.ctCard_completed : ''}`}
              onClick={() => setSelected(task)}
            >
              <div className={styles.ctCardMain}>
                <div className={styles.ctCardLeft}>
                  <div className={styles.ctCardNameRow}>
                    <span className={styles.ctCardTitle}>{task.title}</span>
                    <span className={styles.ctDeptBadge}>{task.department}</span>
                    {dueToday && (
                      <span className={styles.ctDueTodayBadge}>Due Today</span>
                    )}
                  </div>

                  <div className={styles.ctCardArea}>{task.assignedArea}</div>

                  {/* Assignment chips */}
                  {task.assignedTo.length > 0 ? (
                    <div className={styles.ctAssignChips}>
                      {task.assignedTo.map(id => {
                        const emp = empMap.get(id)
                        return emp ? (
                          <span key={id} className={styles.ctAssignChip}>
                            {emp.fullName.split(' ')[0]} {emp.fullName.split(' ')[1]?.[0]}.
                          </span>
                        ) : null
                      })}
                    </div>
                  ) : (
                    <span className={styles.ctUnassigned}>Unassigned</span>
                  )}

                  {/* Equipment badges */}
                  {task.equipment.length > 0 && (
                    <div className={styles.ctEquipRow}>
                      {visibleEquip.map(eq => (
                        <span key={eq} className={styles.ctEquipBadge}>{eq}</span>
                      ))}
                      {extraEquip > 0 && (
                        <span className={styles.ctEquipMore}>+{extraEquip} more</span>
                      )}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className={styles.ctProgressWrap}>
                    <div className={styles.ctProgressBar}>
                      <div
                        className={styles.ctProgressFill}
                        style={{ width: `${progress}%`, background: accent }}
                      />
                    </div>
                    <span className={styles.ctProgressLabel}>
                      {progress}% · {task.completedHours}h / {task.estimatedHours}h
                    </span>
                  </div>
                </div>

                <div className={styles.ctCardRight}>
                  <span className={`${styles.ctStatusBadge} ${styles[sm.cls]}`}>
                    {sm.label}
                  </span>
                  <span className={styles.ctPriorityLabel} style={{ color: accent }}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          TASKS.length === 0 ? (
            <EmptyState
              title="No active tasks scheduled."
              description="Tasks will appear here once they are created."
            />
          ) : (
            <p className={styles.ctEmpty}>No tasks match the current filters.</p>
          )
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm       = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const accent   = PRIORITY_ACCENT[selected.priority] || 'var(--color-accent)'
        const progress = pct(selected)

        return (
          <div className={styles.ctModalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.ctModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.ctModalAccent} style={{ background: accent }} />
              <div className={styles.ctModalBody}>

                <div className={styles.ctModalHeader}>
                  <div>
                    <h2 className={styles.ctModalTitle}>{selected.title}</h2>
                    <p className={styles.ctModalSub}>{selected.department} · {selected.assignedArea}</p>
                  </div>
                  <span className={`${styles.ctStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Task Overview */}
                <div className={styles.ctModalSection}>
                  <p className={styles.ctModalSectionTitle}>Task Overview</p>
                  <div className={styles.ctFieldGrid}>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Task ID</span>
                      <span className={styles.ctFieldValue}>{selected.id}</span>
                    </div>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Department</span>
                      <span className={styles.ctFieldValue}>{selected.department}</span>
                    </div>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Priority</span>
                      <span className={styles.ctFieldValue} style={{ color: accent, fontWeight: 600, textTransform: 'capitalize' }}>
                        {selected.priority}
                      </span>
                    </div>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Due Date</span>
                      <span className={styles.ctFieldValue}>{selected.dueDate}</span>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className={styles.ctModalSection}>
                  <p className={styles.ctModalSectionTitle}>Progress</p>
                  <div className={styles.ctFieldGrid}>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Estimated Hours</span>
                      <span className={styles.ctFieldValue}>{selected.estimatedHours}h</span>
                    </div>
                    <div className={styles.ctField}>
                      <span className={styles.ctFieldLabel}>Completed Hours</span>
                      <span className={styles.ctFieldValue}>{selected.completedHours}h</span>
                    </div>
                  </div>
                  <div className={styles.ctModalProgressWrap}>
                    <div className={styles.ctProgressBar}>
                      <div
                        className={styles.ctProgressFill}
                        style={{ width: `${progress}%`, background: accent }}
                      />
                    </div>
                    <span className={styles.ctProgressLabel}>{progress}% complete</span>
                  </div>
                </div>

                {/* Assignment */}
                <div className={styles.ctModalSection}>
                  <p className={styles.ctModalSectionTitle}>Assignment</p>
                  {selected.assignedTo.length > 0 ? (
                    <div className={styles.ctModalAssignList}>
                      {selected.assignedTo.map(id => {
                        const emp = empMap.get(id)
                        if (!emp) return null
                        return (
                          <div key={id} className={styles.ctModalAssignRow}>
                            <span className={styles.ctModalAssignName}>{emp.fullName}</span>
                            <span className={styles.ctModalAssignRole}>{emp.role}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className={styles.ctUnassigned}>No employees assigned.</p>
                  )}
                </div>

                {/* Equipment */}
                {selected.equipment.length > 0 && (
                  <div className={styles.ctModalSection}>
                    <p className={styles.ctModalSectionTitle}>Equipment Required</p>
                    <div className={styles.ctEquipRow}>
                      {selected.equipment.map(eq => (
                        <span key={eq} className={styles.ctEquipBadge}>{eq}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selected.notes && (
                  <div className={styles.ctModalSection}>
                    <p className={styles.ctModalSectionTitle}>Notes</p>
                    <p className={styles.ctModalNotes}>{selected.notes}</p>
                  </div>
                )}

                <button className={styles.ctModalClose} onClick={() => setSelected(null)}>
                  Close
                </button>

              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
