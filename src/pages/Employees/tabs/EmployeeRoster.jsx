// Phase 4 — Active / Inactive roster grid.
//
// Pay rate is rendered here (management workspace). The Operations Board
// imports an alternate consumer that never displays it.

import { useMemo, useState } from 'react'
import { useCrewData, patchCrewEmployee } from '../../../utils/crew/crewStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Employees.module.css'

const DEPT_FILTERS = ['All', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory']

export default function EmployeeRoster({ filter, onEdit }) {
  const { employees, loading } = useCrewData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [dept,   setDept]   = useState('All')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter(e => {
        if (filter === 'active'   && e.status !== 'active'   && e.status !== 'on-leave') return false
        if (filter === 'inactive' && e.status !== 'inactive') return false
        if (dept !== 'All' && e.department !== dept) return false
        if (q) {
          const hay = [e.name, e.role, e.department, e.assignedArea]
            .filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees, filter, search, dept])

  async function setStatus(emp, newStatus) {
    try {
      await patchCrewEmployee(emp.id, { status: newStatus })
      toast.success(`${emp.name} → ${newStatus}`)
    } catch (err) {
      toast.error(`Could not update ${emp.name}: ${err.message}`)
    }
  }

  if (loading) return <p className={styles.empty}>Loading employees…</p>

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder={`Search ${filter} employees…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.chipRow}>
        {DEPT_FILTERS.map(d => (
          <button
            key={d}
            type="button"
            className={`${styles.chip} ${dept === d ? styles.chipActive : ''}`}
            onClick={() => setDept(d)}
          >
            {d}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {filter === 'active'
            ? 'No active employees match the current filters.'
            : 'No inactive employees yet.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {filtered.map(emp => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              onEdit={() => onEdit(emp)}
              onDeactivate={() => setStatus(emp, 'inactive')}
              onReactivate={() => setStatus(emp, 'active')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmployeeCard({ employee, onEdit, onDeactivate, onReactivate }) {
  const statusCls =
    employee.status === 'active'   ? styles.statusActive   :
    employee.status === 'on-leave' ? styles.statusOnLeave  :
                                     styles.statusInactive

  return (
    <div className={styles.card} role="group">
      <div className={styles.cardHeader}>
        <span className={styles.cardName}>{employee.name}</span>
        <span className={`${styles.statusBadge} ${statusCls}`}>{employee.status}</span>
      </div>
      <span className={styles.cardRole}>{employee.role ?? '—'}</span>
      <span className={styles.cardDept}>
        {employee.department ?? '—'}{employee.assignedArea ? ` · ${employee.assignedArea}` : ''}
      </span>
      {employee.hireDate && (
        <span className={styles.cardDept}>Hired {employee.hireDate}</span>
      )}
      <div className={styles.cardFooter}>
        {typeof employee.payRate === 'number'
          ? <span className={styles.payRate}>${employee.payRate.toFixed(2)}/hr<span className={styles.privateTag}>private</span></span>
          : <span className={styles.payRateMissing}>Pay rate not set</span>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={styles.btnSecondary} onClick={onEdit}>Edit</button>
          {employee.status === 'inactive'
            ? <button type="button" className={styles.btnPrimary} onClick={onReactivate}>Reactivate</button>
            : <button type="button" className={styles.btnDanger}  onClick={onDeactivate}>Deactivate</button>}
        </div>
      </div>
    </div>
  )
}
