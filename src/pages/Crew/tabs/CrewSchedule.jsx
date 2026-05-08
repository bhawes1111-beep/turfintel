import { useState, useMemo, useEffect, Fragment } from 'react'
import { SCHEDULE } from '../../../data/crew'
import styles from '../Crew.module.css'

const TODAY      = '2026-05-08'
const WEEK_DATES = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08']
const WEEK_LABELS = [
  { short: 'Mon', date: '2026-05-04' },
  { short: 'Tue', date: '2026-05-05' },
  { short: 'Wed', date: '2026-05-06' },
  { short: 'Thu', date: '2026-05-07' },
  { short: 'Fri', date: '2026-05-08' },
]

const DEPT_FILTERS  = ['All', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory']
const SHIFT_FILTERS = ['All', 'Opening', 'Standard']

const STATUS_META = {
  active:    { label: 'Active',    cls: 'csStatusActive'    },
  completed: { label: 'Completed', cls: 'csStatusCompleted' },
  absent:    { label: 'Absent',    cls: 'csStatusAbsent'    },
  late:      { label: 'Late',      cls: 'csStatusLate'      },
  off:       { label: 'Off',       cls: 'csStatusOff'       },
}

const ACCENT = {
  active:    'var(--color-accent)',
  completed: '#555',
  absent:    '#c0392b',
  late:      '#dca032',
  off:       '#444',
}

const SORT_STATUS = { active: 0, late: 1, completed: 2, absent: 3, off: 4 }

export default function CrewSchedule() {
  const [view,        setView]        = useState('daily')
  const [search,      setSearch]      = useState('')
  const [deptFilter,  setDeptFilter]  = useState('All')
  const [shiftFilter, setShiftFilter] = useState('All')
  const [selected,    setSelected]    = useState(null)

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // O(1) lookup for weekly grid
  const scheduleMap = useMemo(() => {
    const map = {}
    SCHEDULE.forEach(s => { map[`${s.employeeId}-${s.date}`] = s })
    return map
  }, [])

  // Stat row — today only
  const stats = useMemo(() => {
    const today = SCHEDULE.filter(s => s.date === TODAY)
    return {
      scheduledToday: today.filter(s => s.status !== 'off' && s.status !== 'absent').length,
      offToday:       today.filter(s => s.status === 'off'  || s.status === 'absent').length,
      openingCrew:    today.filter(s => s.shiftType === 'opening').length,
      totalHours:     today
        .filter(s => s.status !== 'off' && s.status !== 'absent')
        .reduce((sum, s) => sum + s.scheduledHours, 0),
    }
  }, [])

  // Daily view: today's records, filtered + sorted
  const dailyFiltered = useMemo(() => {
    const q = search.toLowerCase()
    return SCHEDULE
      .filter(s => s.date === TODAY)
      .filter(s => {
        if (q &&
          !s.employeeName.toLowerCase().includes(q) &&
          !s.assignedTask.toLowerCase().includes(q) &&
          !s.assignedArea.toLowerCase().includes(q)) return false
        if (deptFilter  !== 'All' && s.department !== deptFilter)                return false
        if (shiftFilter !== 'All' && s.shiftType  !== shiftFilter.toLowerCase()) return false
        return true
      })
      .sort((a, b) => (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9))
  }, [search, deptFilter, shiftFilter])

  // Weekly view: unique employees matching search + dept filter
  const weeklyEmployees = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map()
    SCHEDULE.forEach(s => {
      if (map.has(s.employeeId)) return
      if (deptFilter !== 'All' && s.department !== deptFilter) return
      if (q && !s.employeeName.toLowerCase().includes(q)) return
      map.set(s.employeeId, {
        employeeId:   s.employeeId,
        employeeName: s.employeeName,
        department:   s.department,
        role:         s.role,
      })
    })
    return [...map.values()]
  }, [search, deptFilter])

  function weeklyTotal(employeeId) {
    return WEEK_DATES.reduce((sum, date) => {
      const entry = scheduleMap[`${employeeId}-${date}`]
      if (!entry || entry.status === 'off' || entry.status === 'absent') return sum
      return sum + entry.scheduledHours
    }, 0)
  }

  return (
    <div className={styles.csWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.csStatRow}>
        <div className={styles.csStatCard}>
          <span className={styles.csStatLabel}>Scheduled Today</span>
          <span className={`${styles.csStatValue} ${styles.csStatGreen}`}>
            {stats.scheduledToday}
          </span>
        </div>
        <div className={styles.csStatCard}>
          <span className={styles.csStatLabel}>Off Today</span>
          <span className={`${styles.csStatValue} ${stats.offToday > 0 ? styles.csStatAmber : ''}`}>
            {stats.offToday}
          </span>
        </div>
        <div className={styles.csStatCard}>
          <span className={styles.csStatLabel}>Opening Crew</span>
          <span className={`${styles.csStatValue} ${styles.csStatTeal}`}>
            {stats.openingCrew}
          </span>
        </div>
        <div className={styles.csStatCard}>
          <span className={styles.csStatLabel}>Scheduled Hours</span>
          <span className={`${styles.csStatValue} ${styles.csStatGreen}`}>
            {stats.totalHours}h
          </span>
        </div>
      </div>

      {/* ── View toggle ───────────────────────────────────────────────────── */}
      <div className={styles.csViewToggle}>
        <button
          className={`${styles.csViewBtn} ${view === 'daily'  ? styles.csViewBtnActive : ''}`}
          onClick={() => setView('daily')}
        >Daily Schedule</button>
        <button
          className={`${styles.csViewBtn} ${view === 'weekly' ? styles.csViewBtnActive : ''}`}
          onClick={() => setView('weekly')}
        >Weekly View</button>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.csToolbar}>
        <input
          className={styles.csSearch}
          type="text"
          placeholder="Search employee, task, or area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Department chips (both views) ─────────────────────────────────── */}
      <div className={styles.csFilters}>
        {DEPT_FILTERS.map(d => (
          <button
            key={d}
            className={`${styles.csChip} ${deptFilter === d ? styles.csChipActive : ''}`}
            onClick={() => setDeptFilter(d)}
          >{d}</button>
        ))}
      </div>

      {/* ── Shift type chips (daily view only) ───────────────────────────── */}
      {view === 'daily' && (
        <div className={styles.csFilters}>
          {SHIFT_FILTERS.map(s => (
            <button
              key={s}
              className={`${styles.csChip} ${shiftFilter === s ? styles.csChipActive : ''}`}
              onClick={() => setShiftFilter(s)}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── Daily view ────────────────────────────────────────────────────── */}
      {view === 'daily' && (
        <>
          <p className={styles.csCount}>
            {dailyFiltered.length} shift{dailyFiltered.length !== 1 ? 's' : ''} · {TODAY}
          </p>
          <div className={styles.csList}>
            {dailyFiltered.map(sched => {
              const sm = STATUS_META[sched.status] || { label: sched.status, cls: '' }
              return (
                <button
                  key={sched.id}
                  className={`${styles.csCard} ${styles[`csCard_${sched.status}`]}`}
                  onClick={() => setSelected(sched)}
                >
                  <div className={styles.csCardMain}>
                    <div className={styles.csCardLeft}>
                      <div className={styles.csCardNameRow}>
                        <span className={styles.csCardName}>{sched.employeeName}</span>
                        <span className={styles.csDeptBadge}>{sched.department}</span>
                        {sched.shiftType === 'opening' && (
                          <span className={styles.csOpeningBadge}>Opening</span>
                        )}
                      </div>
                      <div className={styles.csCardRole}>{sched.role}</div>
                      <div className={styles.csCardAssignment}>
                        {sched.assignedTask} &mdash; {sched.assignedArea}
                      </div>
                      <div className={styles.csCardTime}>
                        {sched.startTime
                          ? `${sched.startTime}${sched.endTime ? ` – ${sched.endTime}` : ' (in progress)'}`
                          : 'Not started'}
                        {sched.scheduledHours > 0 ? ` · ${sched.scheduledHours}h scheduled` : ''}
                      </div>
                    </div>
                    <div className={styles.csCardRight}>
                      <span className={styles.csBigTime}>
                        {sched.startTime || '—'}
                      </span>
                      <span className={`${styles.csStatusBadge} ${styles[sm.cls]}`}>
                        {sm.label}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
            {dailyFiltered.length === 0 && (
              <p className={styles.csEmpty}>No shifts match the current filters.</p>
            )}
          </div>
        </>
      )}

      {/* ── Weekly view ───────────────────────────────────────────────────── */}
      {view === 'weekly' && (
        <div className={styles.csWeekWrap}>
          <div className={styles.csWeekGrid}>

            {/* Header row */}
            <div className={styles.csWeekNameHeader}>Employee</div>
            {WEEK_LABELS.map(({ short, date }) => (
              <div
                key={date}
                className={`${styles.csDayHeader} ${date === TODAY ? styles.csDayHeaderToday : ''}`}
              >
                <span className={styles.csDayName}>{short}</span>
                <span className={styles.csDayDate}>{date.slice(5)}</span>
              </div>
            ))}
            <div className={styles.csWeekTotalHeader}>Wk</div>

            {/* Employee rows */}
            {weeklyEmployees.map(emp => (
              <Fragment key={emp.employeeId}>
                <div className={styles.csWeekNameCell}>
                  <span className={styles.csWeekEmpName}>{emp.employeeName.split(' ')[0]}</span>
                  <span className={styles.csWeekEmpDept}>{emp.department}</span>
                </div>
                {WEEK_DATES.map(date => {
                  const entry = scheduleMap[`${emp.employeeId}-${date}`]
                  return (
                    <div
                      key={date}
                      className={`${styles.csWeekCell} ${date === TODAY ? styles.csWeekCellToday : ''}`}
                    >
                      {!entry ? (
                        <div className={styles.csShiftEmpty}>—</div>
                      ) : entry.status === 'off' ? (
                        <div className={styles.csShiftOff}>Off</div>
                      ) : (
                        <button
                          className={`${styles.csShiftBlock} ${styles[`csShift_${entry.status}`]}`}
                          onClick={() => setSelected(entry)}
                        >
                          <span className={styles.csShiftTime}>{entry.startTime}</span>
                          <span className={styles.csShiftHours}>{entry.scheduledHours}h</span>
                        </button>
                      )}
                    </div>
                  )
                })}
                <div className={styles.csWeekTotalCell}>
                  {weeklyTotal(emp.employeeId)}h
                </div>
              </Fragment>
            ))}

            {weeklyEmployees.length === 0 && (
              <div className={styles.csWeekEmpty}>No employees match the current filters.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm     = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const accent = ACCENT[selected.status] || 'var(--color-accent)'
        return (
          <div className={styles.csModalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.csModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.csModalAccent} style={{ background: accent }} />
              <div className={styles.csModalBody}>

                <div className={styles.csModalHeader}>
                  <div>
                    <h2 className={styles.csModalTitle}>{selected.employeeName}</h2>
                    <p className={styles.csModalSub}>{selected.role} · {selected.department}</p>
                  </div>
                  <span className={`${styles.csStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Employee Overview */}
                <div className={styles.csModalSection}>
                  <p className={styles.csModalSectionTitle}>Employee Overview</p>
                  <div className={styles.csFieldGrid}>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Employee ID</span>
                      <span className={styles.csFieldValue}>{selected.employeeId}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Department</span>
                      <span className={styles.csFieldValue}>{selected.department}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Role</span>
                      <span className={styles.csFieldValue}>{selected.role}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Shift Type</span>
                      <span className={styles.csFieldValue} style={{ textTransform: 'capitalize' }}>
                        {selected.shiftType}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Shift Information */}
                <div className={styles.csModalSection}>
                  <p className={styles.csModalSectionTitle}>Shift Information</p>
                  <div className={styles.csFieldGrid}>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Date</span>
                      <span className={styles.csFieldValue}>{selected.date}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Start Time</span>
                      <span className={styles.csFieldValue}>{selected.startTime || '—'}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>End Time</span>
                      <span className={styles.csFieldValue}>
                        {selected.endTime || (selected.status === 'active' ? 'In progress' : '—')}
                      </span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Scheduled Hours</span>
                      <span className={styles.csFieldValue}>
                        {selected.scheduledHours > 0 ? `${selected.scheduledHours}h` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Task Assignment */}
                <div className={styles.csModalSection}>
                  <p className={styles.csModalSectionTitle}>Task Assignment</p>
                  <div className={styles.csFieldGrid}>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Assigned Task</span>
                      <span className={styles.csFieldValue}>{selected.assignedTask}</span>
                    </div>
                    <div className={styles.csField}>
                      <span className={styles.csFieldLabel}>Assigned Area</span>
                      <span className={styles.csFieldValue}>{selected.assignedArea}</span>
                    </div>
                  </div>
                </div>

                {/* Schedule Notes */}
                {selected.notes && (
                  <div className={styles.csModalSection}>
                    <p className={styles.csModalSectionTitle}>Schedule Notes</p>
                    <p className={styles.csModalNotes}>{selected.notes}</p>
                  </div>
                )}

                <button className={styles.csModalClose} onClick={() => setSelected(null)}>
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
