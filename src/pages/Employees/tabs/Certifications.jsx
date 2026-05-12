// Phase 4 — Certifications tab.
//
// Placeholder-ready: surfaces existing per-employee certifications + the
// pesticide license field added in migration 0019. A future phase will
// add an editable credentials manager with expiry dates and renewal
// reminders.

import { useMemo } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import styles from '../Employees.module.css'

export default function Certifications() {
  const { employees, loading } = useCrewData()

  const certified = useMemo(() => {
    return employees
      .filter(e => e.status === 'active')
      .filter(e => (e.certifications ?? []).length > 0 || e.pesticideLicense)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees])

  if (loading) return <p className={styles.empty}>Loading certifications…</p>

  return (
    <div>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Pesticide Licenses</h3>
          <span className={styles.sectionHint}>State applicator licenses on file</span>
        </div>
        {certified.filter(e => e.pesticideLicense).length === 0 ? (
          <p className={styles.empty}>No pesticide licenses recorded yet.</p>
        ) : (
          certified
            .filter(e => e.pesticideLicense)
            .map(emp => (
              <div key={emp.id} className={styles.roleRow}>
                <div>
                  <div className={styles.roleName}>{emp.name}</div>
                  <div className={styles.roleCount}>{emp.role ?? '—'}</div>
                </div>
                <span className={styles.roleCount}>{emp.pesticideLicense}</span>
              </div>
            ))
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Certifications</h3>
          <span className={styles.sectionHint}>Active staff credentials</span>
        </div>
        {certified.filter(e => (e.certifications ?? []).length > 0).length === 0 ? (
          <p className={styles.empty}>No certifications recorded yet.</p>
        ) : (
          certified
            .filter(e => (e.certifications ?? []).length > 0)
            .map(emp => (
              <div key={emp.id} className={styles.roleRow}>
                <div>
                  <div className={styles.roleName}>{emp.name}</div>
                  <div className={styles.roleCount}>{emp.role ?? '—'}</div>
                </div>
                <span className={styles.roleCount}>
                  {emp.certifications.join(' · ')}
                </span>
              </div>
            ))
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Coming Soon</h3>
        </div>
        <p className={styles.empty}>
          Expiry tracking · renewal reminders · per-state license registries · upload of license documents.
        </p>
      </div>
    </div>
  )
}
