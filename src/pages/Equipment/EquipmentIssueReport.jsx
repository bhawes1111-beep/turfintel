import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchEquipmentBoardState,
  submitPublicEquipmentIssue,
} from '../../utils/equipment/equipmentIssueStore'
import styles from './EquipmentIssueReport.module.css'

const INITIAL_FORM = {
  equipmentId:   '',
  equipmentName: '',
  category:      '',
  reportedBy:    '',
  description:   '',
}

export default function EquipmentIssueReport() {
  const [equipment, setEquipment] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchEquipmentBoardState()
      .then(data => {
        if (alive) setEquipment(data.equipment ?? [])
      })
      .catch(err => {
        if (alive) setError(`Could not load equipment list. ${err.message}`)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const selectedEquipment = useMemo(
    () => equipment.find(eq => eq.id === form.equipmentId) ?? null,
    [equipment, form.equipmentId],
  )

  function updateField(field, value) {
    if (field === 'equipmentId') {
      const eq = equipment.find(item => item.id === value)
      setForm(prev => ({
        ...prev,
        equipmentId:   value,
        equipmentName: eq ? eq.name : '',
        category:      eq ? eq.category : '',
      }))
      return
    }
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await submitPublicEquipmentIssue({
        ...form,
        issueType:     'Equipment issue',
        priority:      'routine',
        location:      null,
        equipmentName: selectedEquipment?.name ?? form.equipmentName,
        category:      selectedEquipment?.category ?? form.category,
      })
      setMessage('Submitted for supervisor review.')
      setForm(INITIAL_FORM)
    } catch (err) {
      setError(`Could not submit issue. ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Equipment</p>
          <h1>Report an Issue</h1>
          <p>Send equipment problems to the supervisor for review.</p>
        </div>
        <nav className={styles.actions} aria-label="Equipment report links">
          <Link to="/display-board/board">Assignments</Link>
          <Link to="/equipment/board">Mechanic Board</Link>
        </nav>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          <span>Equipment</span>
          <select
            value={form.equipmentId}
            onChange={event => updateField('equipmentId', event.target.value)}
            disabled={loading}
          >
            <option value="">Choose equipment</option>
            {equipment.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.name}</option>
            ))}
          </select>
        </label>

        {!form.equipmentId && (
          <label>
            <span>Equipment name</span>
            <input
              value={form.equipmentName}
              onChange={event => updateField('equipmentName', event.target.value)}
              placeholder="Example: Greens mower 3"
            />
          </label>
        )}

        <label>
          <span>Your name</span>
          <input
            value={form.reportedBy}
            onChange={event => updateField('reportedBy', event.target.value)}
            placeholder="Who reported it"
          />
        </label>

        <label>
          <span>What is wrong?</span>
          <textarea
            value={form.description}
            onChange={event => updateField('description', event.target.value)}
            placeholder="Describe the problem..."
            rows={5}
            required
          />
        </label>

        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" disabled={saving || !(form.equipmentName || selectedEquipment) || !form.description.trim()}>
          {saving ? 'Submitting...' : 'Submit for Review'}
        </button>
      </form>
    </main>
  )
}
