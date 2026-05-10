import { useState, useMemo, useEffect } from 'react'
import { HOURS_LOG } from '../../../data/crew'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Crew.module.css'

const TODAY = '2026-05-08'

const DEPT_FILTERS = ['All', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory']

const STATUS_FILTERS = [
  { label: 'All',        value: 'All'        },
  { label: 'Clocked In', value: 'clocked-in' },
  { label: 'Completed',  value: 'completed'  },
  { label: 'Absent',     value: 'absent'     },
  { label: 'Late',       value: 'late'       },
]

const STATUS_META = {
  'clocked-in': { label: 'Clocked In', cls: 'chStatusClockedIn' },
  'completed':  { label: 'Completed',  cls: 'chStatusCompleted' },
  'absent':     { label: 'Absent',     cls: 'chStatusAbsent'    },
  'late':       { label: 'Late',       cls: 'chStatusLate'      },
}

const ACCENT = {
  'clocked-in': 'var(--color-accent)',
  'completed':  '#555',
  'absent':     '#c0392b',
  'late':       '#dca032',
}

const SORT_STATUS = { 'clocked-in': 0, late: 1, completed: 2, absent: 3 }

function shiftCost(log) {
  const reg = log.totalHours - log.overtimeHours
  return reg * log.hourlyRate + log.overtimeHours * log.hourlyRate * 1.5
}

export default function CrewHours() {
  const [search,       setSearch]       = useState('')
  const [deptFilter,   setDeptFilter]   = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected,     setSelected]     = useState(null)

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const stats = useMemo(() => {
    const today = HOURS_LOG.filter(l => l.date === TODAY)
    return {
      totalHours:    today.reduce((s, l) => s + l.totalHours, 0),
      overtimeHours: today.reduce((s, l) => s + l.overtimeHours, 0),
      crewPresent:   today.filter(l => l.status !== 'absent').length,
      laborCost:     today.reduce((s, l) => s + shiftCost(l), 0),
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return HOURS_LOG
      .filter(l => {
        if (q &&
          !l.employeeName.toLowerCase().includes(q) &&
          !l.assignedTask.toLowerCase().includes(q) &&
          !l.assignedArea.toLowerCase().includes(q)) return false
        if (deptFilter   !== 'All' && l.department !== deptFilter)   return false
        if (statusFilter !== 'All' && l.status     !== statusFilter) return false
        return true
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date > b.date ? -1 : 1
        return (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9)
      })
  }, [search, deptFilter, statusFilter])

  return (
    <div className={styles.chWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.chStatRow}>
        <div className={styles.chStatCard}>
          <span className={styles.chStatLabel}>Total Hours Today</span>
          <span className={`${styles.chStatValue} ${styles.chStatGreen}`}>
            {stats.totalHours.toFixed(1)}h
          </span>
        </div>
        <div className={styles.chStatCard}>
          <span className={styles.chStatLabel}>Overtime Hours</span>
          <span className={`${styles.chStatValue} ${stats.overtimeHours > 0 ? styles.chStatAmber : ''}`}>
            {stats.overtimeHours.toFixed(1)}h
          </span>
        </div>
        <div className={styles.chStatCard}>
          <span className={styles.chStatLabel}>Crew Present</span>
          <span className={`${styles.chStatValue} ${styles.chStatTeal}`}>
            {stats.crewPresent}
          </span>
        </div>
        <div className={styles.chStatCard}>
          <span className={styles.chStatLabel}>Labor Cost Est.</span>
          <span className={`${styles.chStatValue} ${styles.chStatGreen}`}>
            ${Math.round(stats.laborCost).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.chToolbar}>
        <input
          className={styles.chSearch}
          type="text"
          placeholder="Search employee, task, or area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Department chips ─────────────────────────────────────────────── */}
      <div className={styles.chFilters}>
        {DEPT_FILTERS.map(d => (
          <button
            key={d}
            className={`${styles.chChip} ${deptFilter === d ? styles.chChipActive : ''}`}
            onClick={() => setDeptFilter(d)}
          >{d}</button>
        ))}
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────── */}
      <div className={styles.chFilters}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.chChip} ${statusFilter === value ? styles.chChipActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >{label}</button>
        ))}
      </div>

      <p className={styles.chCount}>
        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* ── Log cards ────────────────────────────────────────────────────── */}
      <div className={styles.chList}>
        {filtered.map(log => {
          const sm = STATUS_META[log.status] || { label: log.status, cls: '' }
          return (
            <button
              key={log.id}
              className={`${styles.chCard} ${styles[`chCard_${log.status.replace('-', '_')}`]}`}
              onClick={() => setSelected(log)}
            >
              <div className={styles.chCardMain}>
                <div className={styles.chCardLeft}>
                  <div className={styles.chCardNameRow}>
                    <span className={styles.chCardName}>{log.employeeName}</span>
                    <span className={styles.chDeptBadge}>{log.department}</span>
                    {log.overtimeHours > 0 && (
                      <span className={styles.chOvertimeBadge}>OT +{log.overtimeHours}h</span>
                    )}
                  </div>
                  <div className={styles.chCardRole}>{log.role}</div>
                  <div className={styles.chCardAssignment}>
                    {log.assignedTask} &mdash; {log.assignedArea}
                  </div>
                  <div className={styles.chCardTime}>
                    {log.date}
                    {log.startTime
                      ? ` · ${log.startTime}${log.endTime ? ` – ${log.endTime}` : ' (in progress)'}`
                      : ''}
                  </div>
                </div>
                <div className={styles.chCardRight}>
                  <span className={styles.chBigHours}>
                    {log.totalHours > 0 ? `${log.totalHours}h` : '—'}
                  </span>
                  <span className={`${styles.chStatusBadge} ${styles[sm.cls]}`}>
                    {sm.label}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          HOURS_LOG.length === 0 ? (
            <EmptyState
              title="No hours logged."
              description="Crew time entries will appear here once they are logged."
            />
          ) : (
            <p className={styles.chEmpty}>No records match the current filters.</p>
          )
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm       = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const regHours = selected.totalHours - selected.overtimeHours
        const regPay   = regHours * selected.hourlyRate
        const otPay    = selected.overtimeHours * selected.hourlyRate * 1.5
        const totalPay = regPay + otPay
        const accent   = ACCENT[selected.status] || 'var(--color-accent)'

        return (
          <div className={styles.chModalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.chModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.chModalAccent} style={{ background: accent }} />
              <div className={styles.chModalBody}>

                <div className={styles.chModalHeader}>
                  <div>
                    <h2 className={styles.chModalTitle}>{selected.employeeName}</h2>
                    <p className={styles.chModalSub}>{selected.role} · {selected.department}</p>
                  </div>
                  <span className={`${styles.chStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Employee Overview */}
                <div className={styles.chModalSection}>
                  <p className={styles.chModalSectionTitle}>Employee Overview</p>
                  <div className={styles.chFieldGrid}>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Employee ID</span>
                      <span className={styles.chFieldValue}>{selected.employeeId}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Department</span>
                      <span className={styles.chFieldValue}>{selected.department}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Role</span>
                      <span className={styles.chFieldValue}>{selected.role}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Hourly Rate</span>
                      <span className={styles.chFieldValue}>${selected.hourlyRate}/hr</span>
                    </div>
                  </div>
                </div>

                {/* Shift Timeline */}
                <div className={styles.chModalSection}>
                  <p className={styles.chModalSectionTitle}>Shift Timeline</p>
                  <div className={styles.chFieldGrid}>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Date</span>
                      <span className={styles.chFieldValue}>{selected.date}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Start Time</span>
                      <span className={styles.chFieldValue}>{selected.startTime || '—'}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>End Time</span>
                      <span className={styles.chFieldValue}>{selected.endTime || 'In progress'}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Total Hours</span>
                      <span className={styles.chFieldValue}>
                        {selected.totalHours > 0 ? `${selected.totalHours}h` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Task Assignment */}
                <div className={styles.chModalSection}>
                  <p className={styles.chModalSectionTitle}>Task Assignment</p>
                  <div className={styles.chFieldGrid}>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Assigned Task</span>
                      <span className={styles.chFieldValue}>{selected.assignedTask}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Assigned Area</span>
                      <span className={styles.chFieldValue}>{selected.assignedArea}</span>
                    </div>
                  </div>
                </div>

                {/* Labor Summary */}
                <div className={styles.chModalSection}>
                  <p className={styles.chModalSectionTitle}>Labor Summary</p>
                  <div className={styles.chFieldGrid}>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Regular Hours</span>
                      <span className={styles.chFieldValue}>{regHours.toFixed(1)}h</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Overtime Hours</span>
                      <span className={styles.chFieldValue}>{selected.overtimeHours.toFixed(1)}h</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>Regular Pay</span>
                      <span className={styles.chFieldValue}>${regPay.toFixed(2)}</span>
                    </div>
                    <div className={styles.chField}>
                      <span className={styles.chFieldLabel}>OT Pay (1.5×)</span>
                      <span className={styles.chFieldValue}>${otPay.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className={styles.chTotalCost}>
                    <span className={styles.chTotalLabel}>Estimated Shift Cost</span>
                    <span className={styles.chTotalValue}>${totalPay.toFixed(2)}</span>
                  </div>
                </div>

                {/* Overtime Breakdown — only if OT > 0 */}
                {selected.overtimeHours > 0 && (
                  <div className={styles.chModalSection}>
                    <p className={styles.chModalSectionTitle}>Overtime Breakdown</p>
                    <div className={styles.chOtBreakdown}>
                      <div className={styles.chOtRow}>
                        <span>Regular: {regHours.toFixed(1)}h × ${selected.hourlyRate.toFixed(2)}/hr</span>
                        <span>${regPay.toFixed(2)}</span>
                      </div>
                      <div className={styles.chOtRow}>
                        <span>Overtime: {selected.overtimeHours.toFixed(1)}h × ${(selected.hourlyRate * 1.5).toFixed(2)}/hr (1.5×)</span>
                        <span>${otPay.toFixed(2)}</span>
                      </div>
                      <div className={`${styles.chOtRow} ${styles.chOtTotal}`}>
                        <span>Total</span>
                        <span>${totalPay.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selected.notes && (
                  <div className={styles.chModalSection}>
                    <p className={styles.chModalSectionTitle}>Notes</p>
                    <p className={styles.chModalNotes}>{selected.notes}</p>
                  </div>
                )}

                <button className={styles.chModalClose} onClick={() => setSelected(null)}>
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
