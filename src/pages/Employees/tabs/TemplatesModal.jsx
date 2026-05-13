// Phase 14 — Templates list modal. Apply / Delete per template.

import { useEffect, useState } from 'react'
import {
  useScheduleTemplatesData,
  applyScheduleTemplate,
  deleteScheduleTemplate,
} from '../../../utils/schedules/templatesStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './WeeklyScheduleEditor.module.css'

const CATEGORY_LABEL = {
  standard:          'Standard',
  tournament:        'Tournament',
  weather:           'Weather',
  spray:             'Spray',
  cultural_practice: 'Cultural Practice',
  aerification:      'Aerification',
}

export default function TemplatesModal({ onClose }) {
  const toast                       = useToast()
  const { templates, loading, error } = useScheduleTemplatesData()
  const [busyId, setBusyId]         = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleApply(tpl) {
    if (!confirm(`Apply "${tpl.name}" and replace current weekly schedule?`)) return
    setBusyId(tpl.id)
    try {
      const result = await applyScheduleTemplate(tpl.id)
      toast.success(
        `Applied ${result.templateName} — ${result.applied} row${result.applied !== 1 ? 's' : ''} applied`
        + (result.skipped > 0 ? ` · ${result.skipped} skipped` : ''),
      )
      onClose()
    } catch (err) {
      toast.error(`Apply failed: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(tpl) {
    if (!confirm(`Delete template "${tpl.name}" permanently?`)) return
    setBusyId(tpl.id)
    try {
      await deleteScheduleTemplate(tpl.id)
      toast.success(`Deleted ${tpl.name}`)
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Schedule Templates</h2>
            <p className={styles.modalSub}>
              Reusable operational labor structures.
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
          {error && <p className={styles.modalWarn}>Load error: {error}</p>}

          {loading && templates.length === 0 ? (
            <p className={styles.empty}>Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className={styles.empty}>
              No templates yet. Save a snapshot of the current schedule with
              <strong> Save Template </strong> to get started.
            </p>
          ) : (
            <ul className={styles.templateList}>
              {templates.map(tpl => (
                <li key={tpl.id} className={styles.templateRow}>
                  <div className={styles.templateMain}>
                    <span className={styles.templateName}>{tpl.name}</span>
                    {tpl.description && (
                      <span className={styles.templateDesc}>{tpl.description}</span>
                    )}
                    <span className={styles.templateMeta}>
                      {CATEGORY_LABEL[tpl.category] ?? tpl.category}
                      {' · '}
                      {tpl.rowCount ?? 0} row{tpl.rowCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className={styles.templateActions}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={busyId === tpl.id}
                      onClick={() => handleApply(tpl)}
                    >
                      {busyId === tpl.id ? 'Applying…' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={busyId === tpl.id}
                      onClick={() => handleDelete(tpl)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
