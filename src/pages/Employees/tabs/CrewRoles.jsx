// Phase 4 — Crew Roles tab.
//
// Distinct roles across active employees with member counts. Read-only;
// roles are inferred from employee data — no separate roles table yet.

import { useMemo } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import styles from '../Employees.module.css'

export default function CrewRoles() {
  const { employees, loading } = useCrewData()

  const roles = useMemo(() => {
    const map = new Map()
    for (const emp of employees) {
      if (emp.status !== 'active') continue
      const role = emp.role ?? '— Unassigned —'
      map.set(role, (map.get(role) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [employees])

  if (loading) return <p className={styles.empty}>Loading roles…</p>

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Crew Roles</h3>
        <span className={styles.sectionHint}>Active employees only</span>
      </div>
      {roles.length === 0 ? (
        <p className={styles.empty}>No active employees with roles yet.</p>
      ) : (
        roles.map(r => (
          <div key={r.name} className={styles.roleRow}>
            <span className={styles.roleName}>{r.name}</span>
            <span className={styles.roleCount}>
              {r.count} member{r.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
