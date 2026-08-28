import { useState } from 'react'
import { createPortal } from 'react-dom'
import { updateTurfHealthObservation } from '../../utils/turfHealth/turfHealthStore'
import { HEALTH_TYPE_LABELS } from '../../utils/turfHealth/healthTypes'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './TurfHealthEditModal.module.css'

const STATUS_OPTIONS = [
  ['active', 'Active'],
  ['monitoring', 'Monitoring'],
  ['resolved', 'Resolved'],
]

const SEVERITY_OPTIONS = [
  ['low', 'Low'],
  ['moderate', 'Moderate'],
  ['high', 'High'],
]

const AREA_OPTIONS = [
  ['', 'Not specified'],
  ['green', 'Green'],
  ['tee', 'Tee'],
  ['fairway', 'Fairway'],
  ['approach', 'Approach'],
  ['rough', 'Rough'],
  ['bunker', 'Bunker'],
  ['cart-path', 'Cart path'],
  ['other', 'Other'],
]

const ORIENTATION_OPTIONS = [
  ['', 'Not specified'],
  ['north', 'North'],
  ['south', 'South'],
  ['east', 'East'],
  ['west', 'West'],
]

function toLocalDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function TurfHealthEditModal({ observation, onClose }) {
  const toast = useToast()
  const [location, setLocation] = useState(observation.location ?? '')
  const [healthType, setHealthType] = useState(observation.healthType ?? '')
  const [severity, setSeverity] = useState(observation.severity ?? 'moderate')
  const [status, setStatus] = useState(observation.status ?? 'active')
  const [observedAt, setObservedAt] = useState(toLocalDateTime(observation.observedAt))
  const [followUpDate, setFollowUpDate] = useState(observation.followUpDate ?? '')
  const [areaType, setAreaType] = useState(observation.areaType ?? '')
  const [orientation, setOrientation] = useState(observation.orientation ?? '')
  const [surfaceNote, setSurfaceNote] = useState(observation.surfaceNote ?? '')
  const [notes, setNotes] = useState(observation.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(event) {
    event.preventDefault()
    if (!location.trim()) {
      setError('Location is required.')
      return
    }
    if (!healthType) {
      setError('Issue type is required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await updateTurfHealthObservation(observation.id, {
        location: location.trim(),
        healthType,
        severity,
        status,
        observedAt: observedAt ? new Date(observedAt).toISOString() : observation.observedAt,
        followUpDate: followUpDate || null,
        areaType: areaType || null,
        orientation: orientation || null,
        surfaceNote: surfaceNote.trim() || null,
        notes: notes.trim() || null,
      })
      toast?.success?.('Turf health observation updated')
      onClose()
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="turf-health-edit-title">
        <header className={styles.header}>
          <div>
            <h2 id="turf-health-edit-title">Edit Turf Health Observation</h2>
            <p>{observation.location}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">X</button>
        </header>

        <form className={styles.form} onSubmit={handleSave}>
          <div className={styles.body}>
            <div className={styles.grid}>
              <label className={styles.wideField}>
                <span>Location</span>
                <input value={location} onChange={event => setLocation(event.target.value)} />
              </label>

              <label>
                <span>Issue type</span>
                <select value={healthType} onChange={event => setHealthType(event.target.value)}>
                  <option value="">Choose a type</option>
                  {Object.entries(HEALTH_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Severity</span>
                <select value={severity} onChange={event => setSeverity(event.target.value)}>
                  {SEVERITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label>
                <span>Status</span>
                <select value={status} onChange={event => setStatus(event.target.value)}>
                  {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label>
                <span>Observed date and time</span>
                <input type="datetime-local" value={observedAt} onChange={event => setObservedAt(event.target.value)} />
              </label>

              <label>
                <span>Follow-up date</span>
                <input type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} />
              </label>

              <label>
                <span>Course area</span>
                <select value={areaType} onChange={event => setAreaType(event.target.value)}>
                  {AREA_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label>
                <span>Orientation</span>
                <select value={orientation} onChange={event => setOrientation(event.target.value)}>
                  {ORIENTATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label className={styles.wideField}>
                <span>Field note</span>
                <textarea rows="3" value={surfaceNote} onChange={event => setSurfaceNote(event.target.value)} />
              </label>

              <label className={styles.wideField}>
                <span>Management notes</span>
                <textarea rows="4" value={notes} onChange={event => setNotes(event.target.value)} />
              </label>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </div>

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}
