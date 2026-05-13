// Phase 14 — Save the current weekly schedule as a reusable template.

import { useEffect, useState } from 'react'
import { createScheduleTemplate } from '../../../utils/schedules/templatesStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './WeeklyScheduleEditor.module.css'

const CATEGORY_OPTS = [
  { value: 'standard',          label: 'Standard' },
  { value: 'tournament',        label: 'Tournament' },
  { value: 'weather',           label: 'Weather' },
  { value: 'spray',             label: 'Spray' },
  { value: 'cultural_practice', label: 'Cultural Practice' },
  { value: 'aerification',      label: 'Aerification' },
]

export default function SaveTemplateModal({ schedules, onClose }) {
  const toast = useToast()
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState('standard')
  const [busy,        setBusy]        = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!name.trim()) {
      toast.info('Template name is required')
      return
    }
    setBusy(true)
    try {
      const rows = schedules.map(s => ({
        employeeId: s.employeeId,
        dayOfWeek:  s.dayOfWeek,
        startTime:  s.startTime,
        endTime:    s.endTime,
        role:       s.role,
        status:     s.status,
      }))
      const saved = await createScheduleTemplate({
        name:        name.trim(),
        description: description.trim() || null,
        category,
        rows,
      })
      toast.success(`Template saved: ${saved.name} · ${saved.rowsInserted ?? rows.length} rows`)
      onClose()
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const rowCount = schedules.length

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog">
      <form
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
      >
        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Save Template</h2>
            <p className={styles.modalSub}>
              Capturing <strong>{rowCount}</strong> row{rowCount !== 1 ? 's' : ''} from
              the current weekly schedule.
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className={styles.modalBody}>
          <label className={styles.modalLabel}>
            <span>Template Name *</span>
            <input
              type="text"
              className={styles.modalInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard Summer Crew"
              autoFocus
            />
          </label>

          <label className={styles.modalLabel}>
            <span>Category</span>
            <select
              className={styles.modalInput}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORY_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.modalLabel}>
            <span>Description (optional)</span>
            <textarea
              className={styles.modalInput}
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this template is for (frost delays, tournament week, etc.)…"
              style={{ resize: 'vertical', minHeight: 50, fontFamily: 'inherit' }}
            />
          </label>

          {rowCount === 0 && (
            <p className={styles.modalWarn}>
              The current schedule is empty — saving will create a template
              with no rows. Add some shifts first if you want a usable
              template.
            </p>
          )}
        </div>

        <footer className={styles.modalFooter}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={busy}
          >Cancel</button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save Template'}
          </button>
        </footer>
      </form>
    </div>
  )
}
