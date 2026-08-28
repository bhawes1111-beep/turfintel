import { useMemo, useState } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import {
  useEmployeeTrainingData,
  createEmployeeTraining,
  patchEmployeeTraining,
  deleteEmployeeTraining,
} from '../../../utils/crew/employeeTrainingStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Employees.module.css'

const STATUS_OPTIONS = [
  { value: 'planned',     label: 'Planned' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'complete',    label: 'Complete' },
  { value: 'expired',     label: 'Expired' },
  { value: 'waived',      label: 'Waived' },
]

const CATEGORY_OPTIONS = [
  'Safety',
  'Equipment',
  'Spray',
  'Irrigation',
  'Orientation',
  'Compliance',
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function emptyDraft(employeeId = '') {
  return {
    id:            null,
    employeeId,
    trainingName:  '',
    category:      'Safety',
    status:        'planned',
    completedDate: '',
    dueDate:       todayIso(),
    expiresDate:   '',
    trainer:       '',
    notes:         '',
  }
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function recordTone(record) {
  const today = todayIso()
  if (record.status === 'waived') return 'muted'
  if (record.status === 'expired') return 'critical'
  if (record.expiresDate && record.expiresDate < today) return 'critical'
  if (record.status !== 'complete' && record.dueDate && record.dueDate < today) return 'critical'
  if (record.expiresDate && record.expiresDate <= addDays(today, 30)) return 'warn'
  if (record.status === 'complete') return 'ok'
  if (record.status === 'in-progress') return 'info'
  return 'planned'
}

function statusLabel(record) {
  const tone = recordTone(record)
  if (tone === 'critical' && record.expiresDate && record.expiresDate < todayIso()) return 'Expired'
  if (tone === 'critical' && record.dueDate && record.dueDate < todayIso()) return 'Overdue'
  if (tone === 'warn') return 'Expiring Soon'
  return STATUS_OPTIONS.find(option => option.value === record.status)?.label ?? record.status
}

function draftFromRecord(record) {
  return {
    id:            record.id,
    employeeId:    record.employeeId ?? '',
    trainingName:  record.trainingName ?? '',
    category:      record.category ?? 'Safety',
    status:        record.status ?? 'planned',
    completedDate: record.completedDate ?? '',
    dueDate:       record.dueDate ?? '',
    expiresDate:   record.expiresDate ?? '',
    trainer:       record.trainer ?? '',
    notes:         record.notes ?? '',
  }
}

function payloadFromDraft(draft) {
  return {
    employeeId:    draft.employeeId,
    trainingName:  draft.trainingName.trim(),
    category:      draft.category.trim() || null,
    status:        draft.status,
    completedDate: draft.completedDate || null,
    dueDate:       draft.dueDate || null,
    expiresDate:   draft.expiresDate || null,
    trainer:       draft.trainer.trim() || null,
    notes:         draft.notes.trim() || null,
  }
}

export default function EmployeeTraining() {
  const { employees, loading: employeesLoading } = useCrewData()
  const { records, loading, error } = useEmployeeTrainingData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [draft, setDraft] = useState(emptyDraft())
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const activeEmployees = useMemo(() => (
    employees
      .filter(emp => emp.status === 'active')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  ), [employees])

  const employeeById = useMemo(() => {
    const map = new Map()
    for (const emp of employees) map.set(emp.id, emp)
    return map
  }, [employees])

  const enrichedRecords = useMemo(() => records.map(record => {
    const employee = employeeById.get(record.employeeId)
    return {
      ...record,
      employeeName: record.employeeName ?? employee?.name ?? 'Unknown employee',
      employeeRole: record.employeeRole ?? employee?.role ?? '',
    }
  }), [records, employeeById])

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enrichedRecords
      .filter(record => employeeFilter === 'all' || record.employeeId === employeeFilter)
      .filter(record => statusFilter === 'all' || recordTone(record) === statusFilter || record.status === statusFilter)
      .filter(record => {
        if (!q) return true
        return [
          record.employeeName,
          record.employeeRole,
          record.trainingName,
          record.category,
          record.status,
          record.trainer,
          record.notes,
        ].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const toneA = ['critical', 'warn', 'info', 'planned', 'ok', 'muted'].indexOf(recordTone(a))
        const toneB = ['critical', 'warn', 'info', 'planned', 'ok', 'muted'].indexOf(recordTone(b))
        if (toneA !== toneB) return toneA - toneB
        return (a.dueDate || a.expiresDate || '9999').localeCompare(b.dueDate || b.expiresDate || '9999')
      })
  }, [enrichedRecords, employeeFilter, search, statusFilter])

  const counts = useMemo(() => {
    const c = { total: enrichedRecords.length, overdue: 0, expiring: 0, complete: 0 }
    for (const record of enrichedRecords) {
      const tone = recordTone(record)
      if (tone === 'critical') c.overdue += 1
      if (tone === 'warn') c.expiring += 1
      if (record.status === 'complete' && tone !== 'critical') c.complete += 1
    }
    return c
  }, [enrichedRecords])

  function openAdd(employeeId = '') {
    setDraft(emptyDraft(employeeId || activeEmployees[0]?.id || ''))
    setModalOpen(true)
  }

  function openEdit(record) {
    setDraft(draftFromRecord(record))
    setModalOpen(true)
  }

  function closeModal() {
    if (busy) return
    setModalOpen(false)
    setDraft(emptyDraft())
  }

  function setField(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!draft.employeeId) {
      toast.info('Pick an employee')
      return
    }
    if (!draft.trainingName.trim()) {
      toast.info('Training name is required')
      return
    }

    setBusy(true)
    try {
      const payload = payloadFromDraft(draft)
      if (draft.id) {
        await patchEmployeeTraining(draft.id, payload)
        toast.success('Training updated')
      } else {
        await createEmployeeTraining(payload)
        toast.success('Training added')
      }
      setModalOpen(false)
      setDraft(emptyDraft())
    } catch (err) {
      toast.error(`Training save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(record) {
    if (!confirm(`Delete training record "${record.trainingName}"?`)) return
    setBusy(true)
    try {
      await deleteEmployeeTraining(record.id)
      toast.success('Training deleted')
      if (draft.id === record.id) {
        setModalOpen(false)
        setDraft(emptyDraft())
      }
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (employeesLoading || loading) return <p className={styles.empty}>Loading training...</p>

  return (
    <div className={styles.trainingRoot}>
      <div className={styles.trainingHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Training</h3>
          <p className={styles.trainingSub}>Track employee training, renewals, and upcoming due dates.</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => openAdd()}>
          + Add Training
        </button>
      </div>

      <div className={styles.trainingStats}>
        <Stat label="Records" value={counts.total} />
        <Stat label="Overdue / Expired" value={counts.overdue} tone="critical" />
        <Stat label="Expiring Soon" value={counts.expiring} tone="warn" />
        <Stat label="Current" value={counts.complete} tone="ok" />
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search employee, training, category, trainer..."
        />
        <select className={styles.formSelect} value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)}>
          <option value="all">All employees</option>
          {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <select className={styles.formSelect} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All status</option>
          <option value="critical">Overdue / expired</option>
          <option value="warn">Expiring soon</option>
          {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {error && <p className={styles.trainingError}>{error}</p>}

      {visibleRecords.length === 0 ? (
        <div className={styles.section}>
          <p className={styles.empty}>
            No training records yet. Add safety, equipment, spray, or orientation training to start tracking.
          </p>
        </div>
      ) : (
        <div className={styles.trainingList}>
          {visibleRecords.map(record => (
            <article key={record.id} className={styles.trainingCard} data-tone={recordTone(record)}>
              <div className={styles.trainingCardMain}>
                <div>
                  <h4>{record.trainingName}</h4>
                  <p>
                    <strong>{record.employeeName}</strong>
                    {record.employeeRole ? ` - ${record.employeeRole}` : ''}
                  </p>
                  <div className={styles.trainingMeta}>
                    {record.category && <span>{record.category}</span>}
                    <span>Due {formatDate(record.dueDate)}</span>
                    {record.completedDate && <span>Completed {formatDate(record.completedDate)}</span>}
                    {record.expiresDate && <span>Expires {formatDate(record.expiresDate)}</span>}
                    {record.trainer && <span>{record.trainer}</span>}
                  </div>
                </div>
                <span className={styles.trainingStatus} data-tone={recordTone(record)}>{statusLabel(record)}</span>
              </div>
              {record.notes && <p className={styles.trainingNotes}>{record.notes}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => openEdit(record)}>Edit</button>
                <button type="button" className={styles.btnDanger} onClick={() => handleDelete(record)} disabled={busy}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className={styles.modalOverlay} role="presentation">
          <form className={styles.modal} onSubmit={handleSave} onClick={event => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>{draft.id ? 'Edit Training' : 'Add Training'}</h3>

            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Employee</span>
                <select className={styles.formSelect} value={draft.employeeId} onChange={event => setField('employeeId', event.target.value)}>
                  <option value="">Pick employee</option>
                  {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Status</span>
                <select className={styles.formSelect} value={draft.status} onChange={event => setField('status', event.target.value)}>
                  {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className={styles.formFieldWide}>
                <span className={styles.formLabel}>Training name</span>
                <input
                  className={styles.formInput}
                  value={draft.trainingName}
                  onChange={event => setField('trainingName', event.target.value)}
                  placeholder="Equipment safety, spray handling, orientation..."
                  autoFocus
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Category</span>
                <input
                  className={styles.formInput}
                  list="employee-training-categories"
                  value={draft.category}
                  onChange={event => setField('category', event.target.value)}
                />
                <datalist id="employee-training-categories">
                  {CATEGORY_OPTIONS.map(category => <option key={category} value={category} />)}
                </datalist>
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Trainer</span>
                <input className={styles.formInput} value={draft.trainer} onChange={event => setField('trainer', event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Due date</span>
                <input className={styles.formInput} type="date" value={draft.dueDate} onChange={event => setField('dueDate', event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Completed date</span>
                <input className={styles.formInput} type="date" value={draft.completedDate} onChange={event => setField('completedDate', event.target.value)} />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Expires</span>
                <input className={styles.formInput} type="date" value={draft.expiresDate} onChange={event => setField('expiresDate', event.target.value)} />
              </label>
              <label className={styles.formFieldWide}>
                <span className={styles.formLabel}>Notes</span>
                <textarea className={styles.formTextarea} value={draft.notes} onChange={event => setField('notes', event.target.value)} rows={3} />
              </label>
            </div>

            <div className={styles.modalActions}>
              {draft.id && (
                <button type="button" className={styles.btnDanger} onClick={() => handleDelete(draft)} disabled={busy}>
                  Delete
                </button>
              )}
              <button type="button" className={styles.btnSecondary} onClick={closeModal} disabled={busy}>Cancel</button>
              <button type="submit" className={styles.btnPrimary} disabled={busy}>
                {busy ? 'Saving...' : draft.id ? 'Save Training' : 'Add Training'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'default' }) {
  return (
    <div className={styles.trainingStat} data-tone={tone}>
      <span>{value}</span>
      <small>{label}</small>
    </div>
  )
}
