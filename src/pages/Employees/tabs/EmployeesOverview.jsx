// Phase 4 — Employee Management: Overview tab.
//
// Stat row + recent hires. Avg pay rate is shown here (this is the
// management workspace) but is NEVER surfaced on the Operations Board
// or future Display Board.

import { useMemo } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import styles from '../Employees.module.css'

function distinctCount(list, key) {
  const set = new Set()
  for (const x of list) {
    const v = x?.[key]
    if (v) set.add(v)
  }
  return set.size
}

export default function EmployeesOverview() {
  const { employees, loading } = useCrewData()

  const stats = useMemo(() => {
    const active   = employees.filter(e => e.status === 'active')
    const inactive = employees.filter(e => e.status === 'inactive')
    const onLeave  = employees.filter(e => e.status === 'on-leave')
    const withRate = employees.filter(e => typeof e.payRate === 'number')
    const avgRate  = withRate.length > 0
      ? withRate.reduce((s, e) => s + e.payRate, 0) / withRate.length
      : null
    const distinctRoles = distinctCount(active, 'role')
    const certified     = active.filter(e => (e.certifications ?? []).length > 0).length
    return {
      total:    employees.length,
      active:   active.length,
      inactive: inactive.length,
      onLeave:  onLeave.length,
      avgRate,
      distinctRoles,
      certified,
    }
  }, [employees])

  const recentHires = useMemo(() => {
    return employees
      .filter(e => e.hireDate)
      .slice()
      .sort((a, b) => (b.hireDate ?? '').localeCompare(a.hireDate ?? ''))
      .slice(0, 5)
  }, [employees])

  if (loading) return <p className={styles.empty}>Loading employees…</p>

  return (
    <div>
      <div className={styles.statRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active</span>
          <span className={styles.statValue}>{stats.active}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Inactive</span>
          <span className={`${styles.statValue} ${styles.statValueMuted}`}>{stats.inactive}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Crew Roles</span>
          <span className={styles.statValue}>{stats.distinctRoles}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Avg Pay Rate</span>
          <span className={styles.statValue}>
            {stats.avgRate != null ? `$${stats.avgRate.toFixed(2)}` : '—'}
          </span>
          <span className={styles.statPrivate}>Private · management only</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Recent Hires</h3>
          <span className={styles.sectionHint}>Last 5 by hire date</span>
        </div>
        {recentHires.length === 0 ? (
          <p className={styles.empty}>No hire dates recorded yet. Add hire dates via the New Hire form or by editing an employee.</p>
        ) : (
          recentHires.map(emp => (
            <div key={emp.id} className={styles.roleRow}>
              <div>
                <div className={styles.roleName}>{emp.name}</div>
                <div className={styles.roleCount}>{emp.role ?? '—'} · {emp.department ?? '—'}</div>
              </div>
              <span className={styles.roleCount}>{emp.hireDate}</span>
            </div>
          ))
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Workforce Snapshot</h3>
        </div>
        <div className={styles.roleRow}>
          <div className={styles.roleName}>Total roster</div>
          <span className={styles.roleCount}>{stats.total}</span>
        </div>
        <div className={styles.roleRow}>
          <div className={styles.roleName}>On leave</div>
          <span className={styles.roleCount}>{stats.onLeave}</span>
        </div>
        <div className={styles.roleRow}>
          <div className={styles.roleName}>Active employees with certifications</div>
          <span className={styles.roleCount}>{stats.certified}</span>
        </div>
      </div>
    </div>
  )
}
