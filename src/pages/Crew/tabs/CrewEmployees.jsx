import { useState, useMemo, useEffect } from 'react'
import { EMPLOYEES } from '../../../data/crew'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Crew.module.css'

const DEPT_FILTERS = ['All', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory']

const STATUS_FILTERS = [
  { label: 'All',      value: 'All'      },
  { label: 'Active',   value: 'active'   },
  { label: 'Absent',   value: 'absent'   },
  { label: 'Vacation', value: 'vacation' },
  { label: 'Seasonal', value: 'seasonal' },
]

const STATUS_META = {
  active:   { label: 'Active',   cls: 'ceStatus_active'   },
  vacation: { label: 'Vacation', cls: 'ceStatus_vacation' },
  absent:   { label: 'Absent',   cls: 'ceStatus_absent'   },
  seasonal: { label: 'Seasonal', cls: 'ceStatus_seasonal' },
}

const ACCENT = {
  active:   'var(--color-accent)',
  vacation: '#2eb8b8',
  absent:   '#c0392b',
  seasonal: '#dca032',
}

const SORT_STATUS = { active: 0, vacation: 1, seasonal: 2, absent: 3 }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${MONTHS[+m - 1]} ${+d}, ${y}`
}

function yearsService(hireDate) {
  const ms = new Date('2026-05-08') - new Date(hireDate)
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
}

function isSupervisor(emp) {
  return emp.role.includes('Lead') || emp.department === 'Supervisory'
}

export default function CrewEmployees() {
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
    const activeCount     = EMPLOYEES.filter(e => e.status === 'active').length
    const supervisorCount = EMPLOYEES.filter(e => isSupervisor(e)).length
    const certifiedCount  = EMPLOYEES.filter(e => e.certifications.length > 0).length
    const avgRate         = EMPLOYEES.reduce((s, e) => s + e.hourlyRate, 0) / EMPLOYEES.length
    return { activeCount, supervisorCount, certifiedCount, avgRate }
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return EMPLOYEES
      .filter(e => {
        if (q &&
          !e.fullName.toLowerCase().includes(q) &&
          !e.role.toLowerCase().includes(q) &&
          !e.assignedArea.toLowerCase().includes(q)) return false
        if (deptFilter   !== 'All' && e.department !== deptFilter)   return false
        if (statusFilter !== 'All' && e.status     !== statusFilter) return false
        return true
      })
      .sort((a, b) => {
        const sd = (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9)
        return sd !== 0 ? sd : a.fullName.localeCompare(b.fullName)
      })
  }, [search, deptFilter, statusFilter])

  return (
    <div className={styles.ceWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.ceStatRow}>
        <div className={styles.ceStatCard}>
          <span className={styles.ceStatLabel}>Active Employees</span>
          <span className={`${styles.ceStatValue} ${styles.ceStatGreen}`}>
            {stats.activeCount}
          </span>
        </div>
        <div className={styles.ceStatCard}>
          <span className={styles.ceStatLabel}>Supervisors</span>
          <span className={`${styles.ceStatValue} ${styles.ceStatTeal}`}>
            {stats.supervisorCount}
          </span>
        </div>
        <div className={styles.ceStatCard}>
          <span className={styles.ceStatLabel}>Certified Staff</span>
          <span className={`${styles.ceStatValue} ${styles.ceStatGreen}`}>
            {stats.certifiedCount}
          </span>
        </div>
        <div className={styles.ceStatCard}>
          <span className={styles.ceStatLabel}>Avg Hourly Rate</span>
          <span className={`${styles.ceStatValue} ${styles.ceStatGreen}`}>
            ${stats.avgRate.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.ceToolbar}>
        <input
          className={styles.ceSearch}
          type="text"
          placeholder="Search name, role, or area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Department chips ─────────────────────────────────────────────── */}
      <div className={styles.ceFilters}>
        {DEPT_FILTERS.map(d => (
          <button
            key={d}
            className={`${styles.ceChip} ${deptFilter === d ? styles.ceChipActive : ''}`}
            onClick={() => setDeptFilter(d)}
          >{d}</button>
        ))}
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────── */}
      <div className={styles.ceFilters}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.ceChip} ${statusFilter === value ? styles.ceChipActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >{label}</button>
        ))}
      </div>

      <p className={styles.ceCount}>
        {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* ── Employee grid ─────────────────────────────────────────────────── */}
      <div className={styles.ceGrid}>
        {filtered.map(emp => {
          const sm = STATUS_META[emp.status] || { label: emp.status, cls: '' }
          return (
            <button
              key={emp.employeeId}
              className={styles.ceCard}
              onClick={() => setSelected(emp)}
            >
              <div className={styles.ceCardTop}>
                <div className={`${styles.ceAvatar} ${styles[`ceAvatar_${emp.status}`]}`}>
                  {initials(emp.fullName)}
                </div>
                <span className={`${styles.ceStatusBadge} ${styles[sm.cls]}`}>
                  {sm.label}
                </span>
              </div>

              <span className={styles.ceCardName}>{emp.fullName}</span>

              <div className={styles.ceCardBadges}>
                <span className={styles.ceRoleBadge}>{emp.role}</span>
                {isSupervisor(emp) && (
                  <span className={styles.ceSupervisorBadge}>Lead</span>
                )}
              </div>

              <span className={styles.ceCardDept}>{emp.department}</span>
              <span className={styles.ceCardArea}>{emp.assignedArea}</span>

              <div className={styles.ceCardFooter}>
                <span className={styles.ceCardRate}>${emp.hourlyRate}/hr</span>
                {emp.certifications.length > 0 && (
                  <span className={styles.ceCertBadge}>
                    {emp.certifications.length} cert{emp.certifications.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          EMPLOYEES.length === 0 ? (
            <EmptyState
              title="No employees added yet."
              description="Crew members will appear here once they are added."
            />
          ) : (
            <p className={styles.ceEmpty}>No employees match the current filters.</p>
          )
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm     = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const accent = ACCENT[selected.status] || 'var(--color-accent)'
        const yrs    = yearsService(selected.hireDate)

        return (
          <div className={styles.ceModalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.ceModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.ceModalAccent} style={{ background: accent }} />
              <div className={styles.ceModalBody}>

                {/* Header with avatar */}
                <div className={styles.ceModalAvatarWrap}>
                  <div className={`${styles.ceModalAvatar} ${styles[`ceAvatar_${selected.status}`]}`}>
                    {initials(selected.fullName)}
                  </div>
                  <div className={styles.ceModalHeaderText}>
                    <h2 className={styles.ceModalTitle}>{selected.fullName}</h2>
                    <p className={styles.ceModalSub}>
                      {selected.role} · {selected.department}
                      {isSupervisor(selected) && (
                        <span className={styles.ceModalLeadBadge}> Lead</span>
                      )}
                    </p>
                  </div>
                  <span className={`${styles.ceStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Employee Overview */}
                <div className={styles.ceModalSection}>
                  <p className={styles.ceModalSectionTitle}>Employee Overview</p>
                  <div className={styles.ceFieldGrid}>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Employee ID</span>
                      <span className={styles.ceFieldValue}>{selected.employeeId}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Department</span>
                      <span className={styles.ceFieldValue}>{selected.department}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Hire Date</span>
                      <span className={styles.ceFieldValue}>{fmtDate(selected.hireDate)}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Years of Service</span>
                      <span className={styles.ceFieldValue}>{yrs} yr{yrs !== 1 ? 's' : ''}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Supervisor</span>
                      <span className={styles.ceFieldValue}>{selected.supervisor}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Status</span>
                      <span className={styles.ceFieldValue} style={{ textTransform: 'capitalize' }}>
                        {selected.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className={styles.ceModalSection}>
                  <p className={styles.ceModalSectionTitle}>Contact Information</p>
                  <div className={styles.ceFieldGrid}>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Phone</span>
                      <span className={styles.ceFieldValue}>{selected.phone}</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Email</span>
                      <span className={styles.ceFieldValue}>{selected.email}</span>
                    </div>
                  </div>
                </div>

                {/* Employment Details */}
                <div className={styles.ceModalSection}>
                  <p className={styles.ceModalSectionTitle}>Employment Details</p>
                  <div className={styles.ceFieldGrid}>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Hourly Rate</span>
                      <span className={styles.ceFieldValue}>${selected.hourlyRate}/hr</span>
                    </div>
                    <div className={styles.ceField}>
                      <span className={styles.ceFieldLabel}>Assigned Area</span>
                      <span className={styles.ceFieldValue}>{selected.assignedArea}</span>
                    </div>
                  </div>
                </div>

                {/* Certifications & Training */}
                <div className={styles.ceModalSection}>
                  <p className={styles.ceModalSectionTitle}>Certifications &amp; Training</p>
                  {selected.certifications.length > 0 ? (
                    <div className={styles.ceCertList}>
                      {selected.certifications.map(cert => (
                        <span key={cert} className={styles.ceCertTag}>{cert}</span>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.ceNoCerts}>No certifications on file.</p>
                  )}
                </div>

                {/* Languages */}
                <div className={styles.ceModalSection}>
                  <p className={styles.ceModalSectionTitle}>Languages</p>
                  <div className={styles.ceLangList}>
                    {selected.languages.map(lang => (
                      <span key={lang} className={styles.ceLangTag}>{lang}</span>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div className={styles.ceModalSection}>
                    <p className={styles.ceModalSectionTitle}>Notes</p>
                    <p className={styles.ceModalNotes}>{selected.notes}</p>
                  </div>
                )}

                <button className={styles.ceModalClose} onClick={() => setSelected(null)}>
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
