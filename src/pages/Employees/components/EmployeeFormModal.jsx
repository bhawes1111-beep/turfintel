// Phase 4 — New Hire / Edit Employee modal.
//
// One form for both flows. When `employee` is null, it's a new-hire
// create; when an employee is passed, it patches in place.

import { useEffect, useState } from 'react'
import {
  createCrewEmployee,
  patchCrewEmployee,
} from '../../../utils/crew/crewStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Employees.module.css'

const STATUS_OPTS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on-leave', label: 'On Leave' },
]

const DEPT_OPTS = [
  '', 'Grounds', 'Spray', 'Irrigation', 'Equipment', 'Supervisory',
]

// Phase 9C.5c1 — Board translation language options. Stored as ISO 639-1
// codes for forward-compatibility (fr, pt, etc. can be added later
// without a migration).
const BOARD_LANGUAGE_OPTS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
]

function makeInitial(employee) {
  return {
    name:              employee?.name              ?? '',
    role:              employee?.role              ?? '',
    department:        employee?.department        ?? '',
    status:            employee?.status            ?? 'active',
    phone:             employee?.phone             ?? '',
    email:             employee?.email             ?? '',
    assignedArea:      employee?.assignedArea      ?? '',
    hireDate:          employee?.hireDate          ?? '',
    payRate:           employee?.payRate ?? '',
    pesticideLicense:  employee?.pesticideLicense  ?? '',
    emergencyContact:  employee?.emergencyContact  ?? '',
    notes:             employee?.notes             ?? '',
    // Phase 9C.5c1 — translation preferences. The kiosk render gating
    // in 9C.5c4 reads these per-operator to decide whether to surface
    // the Spanish line; for now they are storage-only.
    autoTranslateBoardNotes: Boolean(employee?.autoTranslateBoardNotes),
    boardLanguage:           employee?.boardLanguage ?? 'en',
  }
}

function toPayload(form) {
  const payRate = form.payRate === '' ? null : Number(form.payRate)
  return {
    name:              form.name.trim(),
    role:              form.role.trim()        || null,
    department:        form.department         || null,
    status:            form.status,
    phone:             form.phone.trim()       || null,
    email:             form.email.trim()       || null,
    assignedArea:      form.assignedArea.trim()|| null,
    hireDate:          form.hireDate           || null,
    payRate:           Number.isFinite(payRate) ? payRate : null,
    pesticideLicense:  form.pesticideLicense.trim() || null,
    emergencyContact:  form.emergencyContact.trim() || null,
    notes:             form.notes              || null,
    // Phase 9C.5c1 — translation preferences. Worker normalizes the
    // boolean to 0/1 for SQLite; boardLanguage defaults to 'en'.
    autoTranslateBoardNotes: Boolean(form.autoTranslateBoardNotes),
    boardLanguage:           form.boardLanguage || 'en',
  }
}

export default function EmployeeFormModal({ employee, onClose }) {
  const isEdit = !!employee
  const toast  = useToast()

  const [form, setForm]       = useState(() => makeInitial(employee))
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (isEdit) {
        await patchCrewEmployee(employee.id, toPayload(form))
        toast.success(`Updated ${form.name}`)
      } else {
        await createCrewEmployee(toPayload(form))
        toast.success(`Hired ${form.name}`)
      }
      onClose()
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
      >
        <h2 className={styles.modalTitle}>
          {isEdit ? `Edit · ${employee.name}` : 'New Hire'}
        </h2>

        <div className={styles.privateNotice}>
          Pay rate and emergency contact are <strong>private management data</strong> —
          they live on the employee record but are never surfaced to the Operations Board
          or future Display Board renderers.
        </div>

        <div className={styles.formGrid}>
          <div className={`${styles.formField} ${styles.formFieldWide}`}>
            <label className={styles.formLabel}>Full Name *</label>
            <input
              type="text"
              className={styles.formInput}
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Role</label>
            <input
              type="text"
              className={styles.formInput}
              value={form.role}
              onChange={e => setField('role', e.target.value)}
              placeholder="e.g. Crew Lead, Spray Tech"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Department</label>
            <select
              className={styles.formSelect}
              value={form.department}
              onChange={e => setField('department', e.target.value)}
            >
              {DEPT_OPTS.map(d => (
                <option key={d || 'none'} value={d}>{d || '— Select —'}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Status</label>
            <select
              className={styles.formSelect}
              value={form.status}
              onChange={e => setField('status', e.target.value)}
            >
              {STATUS_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Hire Date</label>
            <input
              type="date"
              className={styles.formInput}
              value={form.hireDate}
              onChange={e => setField('hireDate', e.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Pay Rate ($/hr) <span style={{ color: '#fbbf24' }}>· private</span></label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={styles.formInput}
              value={form.payRate}
              onChange={e => setField('payRate', e.target.value)}
              placeholder="22.50"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Assigned Area</label>
            <input
              type="text"
              className={styles.formInput}
              value={form.assignedArea}
              onChange={e => setField('assignedArea', e.target.value)}
              placeholder="Greens, Spray, Maintenance…"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Phone</label>
            <input
              type="tel"
              className={styles.formInput}
              value={form.phone}
              onChange={e => setField('phone', e.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Email</label>
            <input
              type="email"
              className={styles.formInput}
              value={form.email}
              onChange={e => setField('email', e.target.value)}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Pesticide License #</label>
            <input
              type="text"
              className={styles.formInput}
              value={form.pesticideLicense}
              onChange={e => setField('pesticideLicense', e.target.value)}
              placeholder="GA-123456"
            />
          </div>

          <div className={`${styles.formField} ${styles.formFieldWide}`}>
            <label className={styles.formLabel}>Emergency Contact <span style={{ color: '#fbbf24' }}>· private</span></label>
            <input
              type="text"
              className={styles.formInput}
              value={form.emergencyContact}
              onChange={e => setField('emergencyContact', e.target.value)}
              placeholder="Jane Doe — (555) 123-4567"
            />
          </div>

          <div className={`${styles.formField} ${styles.formFieldWide}`}>
            <label className={styles.formLabel}>Notes</label>
            <textarea
              className={styles.formTextarea}
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Phase 9C.5c1 — Translation preferences. Checkbox on the
              left, language dropdown on the right, helper text spans
              the row below. No translation actually fires yet; this
              just stores the per-employee preference. */}
          <div className={styles.formField}>
            <label className={styles.formCheckLabel}>
              <input
                type="checkbox"
                className={styles.formCheck}
                checked={form.autoTranslateBoardNotes}
                onChange={e => setField('autoTranslateBoardNotes', e.target.checked)}
              />
              <span>Auto-translate board notes</span>
            </label>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Language</label>
            <select
              className={styles.formSelect}
              value={form.boardLanguage}
              onChange={e => setField('boardLanguage', e.target.value)}
              disabled={!form.autoTranslateBoardNotes}
            >
              {BOARD_LANGUAGE_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className={`${styles.formField} ${styles.formFieldWide}`}>
            <div className={styles.translationHint}>
              When enabled, board notes and task notes are automatically
              translated for this employee on the public board.
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: '#f87171', fontSize: 11.5, margin: 0 }}>{error}</p>
        )}

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={busy}
          >
            {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Hire Employee')}
          </button>
        </div>
      </form>
    </div>
  )
}
