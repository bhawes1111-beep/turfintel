// Phase 11b — Tasks Manager modal.
//
// Compact add/edit/delete surface for the calendar_events that drive
// the Daily Assignment Board's task dropdown. Lets a supervisor manage
// a day's task list without flipping tabs to the Operations Board task
// editor. Both views write to the same persistent calendar_events
// table — they're just two doors into the same data.

import { useEffect, useState } from 'react'
import {
  createCalendarEvent,
  patchCalendarEvent,
} from '../../../utils/calendar/calendarStore'
import { useAssignmentsData } from '../../../utils/assignments/assignmentsStore'
import { deleteTaskCascade, buildDeleteConfirmMessage } from '../../../utils/tasks/deleteTaskCascade'
import { useToast } from '../../../utils/feedback/toastContext'
import { useSelectedCourse } from '../../../utils/courses/courseStore'
import styles from './DailyAssignmentBoard.module.css'

const EVENT_TYPE_OPTS = [
  { value: '',            label: '— Type —' },
  { value: 'crew',        label: 'Crew' },
  { value: 'spray',       label: 'Spray' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'agronomy',    label: 'Agronomy' },
  { value: 'irrigation',  label: 'Irrigation' },
]

const PRIORITY_OPTS = [
  { value: 'routine', label: 'Routine' },
  { value: 'medium',  label: 'Medium' },
  { value: 'high',    label: 'High' },
  { value: 'low',     label: 'Low' },
]

function blankDraft(noteDate) {
  return {
    id:          null,
    title:       '',
    startTime:   '',
    eventType:   '',
    location:    '',
    priority:    'routine',
    description: '',
    startDate:   noteDate,
  }
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const am   = hour < 12
  const h12  = ((hour + 11) % 12) + 1
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`
}

export default function TasksManagerModal({ selectedDate, dayEvents, onClose }) {
  const toast          = useToast()
  const selectedCourse = useSelectedCourse()
  // Phase 9C.3a — pull live assignments + reservations so the delete
  // cascade helper can clean up the dependent rows on this task before
  // the calendar_event is removed. Used only by handleDelete.
  const { crewAssignments, equipmentReservations } = useAssignmentsData()

  const [draft, setDraft]     = useState(() => blankDraft(selectedDate))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function setField(k, v) { setDraft(prev => ({ ...prev, [k]: v })) }

  function startNew() {
    setDraft(blankDraft(selectedDate))
    setEditing(true)
  }

  function startEdit(ev) {
    setDraft({
      id:          ev.id,
      title:       ev.title ?? '',
      startTime:   ev.startTime ?? '',
      eventType:   ev.eventType ?? '',
      location:    ev.location ?? '',
      priority:    ev.priority ?? 'routine',
      description: ev.description ?? '',
      startDate:   ev.startDate ?? selectedDate,
    })
    setEditing(true)
  }

  function cancelEdit() {
    setDraft(blankDraft(selectedDate))
    setEditing(false)
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!draft.title.trim()) {
      toast.info('Task title is required.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        title:       draft.title.trim(),
        startDate:   draft.startDate,
        startTime:   draft.startTime || null,
        eventType:   draft.eventType || null,
        location:    draft.location.trim() || null,
        priority:    draft.priority,
        description: draft.description.trim() || null,
      }
      if (draft.id) {
        await patchCalendarEvent(draft.id, payload)
        toast.success('Task updated')
      } else {
        await createCalendarEvent({
          ...payload,
          sourceType: 'manual',
          status:     'scheduled',
          course:     selectedCourse?.shortName ?? selectedCourse?.name ?? null,
        })
        toast.success('Task added')
      }
      cancelEdit()
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(ev) {
    // Phase 9C.3b — copy now comes from the shared
    // buildDeleteConfirmMessage helper so TasksManagerModal,
    // OperationsBoard, and DisplayBoard all speak with the same voice.
    const linkedCrewCount = crewAssignments.filter(a => a.calendarEventId === ev.id).length
    const linkedEqCount   = equipmentReservations.filter(r => r.calendarEventId === ev.id).length
    if (!confirm(buildDeleteConfirmMessage(ev.title, linkedCrewCount, linkedEqCount))) return
    setBusy(true)
    try {
      await deleteTaskCascade(ev.id, { crewAssignments, equipmentReservations })
      toast.success('Task deleted')
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Sort tasks by start time for the supervisor's quick scan.
  const sortedTasks = [...dayEvents].sort((a, b) =>
    (a.startTime ?? '').localeCompare(b.startTime ?? '')
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Manage Tasks</h2>
            <p className={styles.modalSub}>
              {selectedDate} · {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        {!editing && (
          <div className={styles.tasksToolbar}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={startNew}
            >
              + New Task
            </button>
          </div>
        )}

        {editing && (
          <form className={styles.taskForm} onSubmit={handleSave}>
            <div className={styles.taskFormGrid}>
              <label className={styles.taskFormLabelWide}>
                <span>Title *</span>
                <input
                  type="text"
                  className={styles.modalSearchInput}
                  value={draft.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="e.g. Mow Greens, Hand water 18"
                  autoFocus
                />
              </label>

              <label className={styles.taskFormLabel}>
                <span>Date</span>
                <input
                  type="date"
                  className={styles.modalSearchInput}
                  value={draft.startDate}
                  onChange={e => setField('startDate', e.target.value)}
                />
              </label>

              <label className={styles.taskFormLabel}>
                <span>Start time</span>
                <input
                  type="time"
                  className={styles.modalSearchInput}
                  value={draft.startTime}
                  onChange={e => setField('startTime', e.target.value)}
                />
              </label>

              <label className={styles.taskFormLabel}>
                <span>Type</span>
                <select
                  className={styles.modalSearchInput}
                  value={draft.eventType}
                  onChange={e => setField('eventType', e.target.value)}
                >
                  {EVENT_TYPE_OPTS.map(o => (
                    <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.taskFormLabel}>
                <span>Priority</span>
                <select
                  className={styles.modalSearchInput}
                  value={draft.priority}
                  onChange={e => setField('priority', e.target.value)}
                >
                  {PRIORITY_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.taskFormLabelWide}>
                <span>Location</span>
                <input
                  type="text"
                  className={styles.modalSearchInput}
                  value={draft.location}
                  onChange={e => setField('location', e.target.value)}
                  placeholder="e.g. Front 9, Greens 7-12"
                />
              </label>

              <label className={styles.taskFormLabelWide}>
                <span>Notes</span>
                <textarea
                  className={styles.modalSearchInput}
                  rows={2}
                  value={draft.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Crew-visible notes (routing direction, equipment quirks, conditions)…"
                  style={{ resize: 'vertical', minHeight: 50, fontFamily: 'inherit' }}
                />
              </label>
            </div>

            <div className={styles.taskFormActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={busy}
              >
                {busy ? 'Saving…' : (draft.id ? 'Save changes' : 'Add task')}
              </button>
            </div>
          </form>
        )}

        <ul className={styles.equipmentList}>
          {sortedTasks.length === 0 ? (
            <li className={styles.equipmentEmpty}>
              No tasks for {selectedDate} yet. Click <strong>+ New Task</strong> to add one.
            </li>
          ) : sortedTasks.map(ev => (
            <li key={ev.id} className={styles.equipmentRow}>
              <div className={styles.equipmentMain}>
                <span className={styles.equipmentName}>{ev.title}</span>
                <span className={styles.equipmentCategory}>
                  {[
                    ev.startTime && fmtTime(ev.startTime),
                    ev.eventType,
                    ev.location,
                  ].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>

              <div className={styles.equipmentStatusCol}>
                <span
                  className={styles.statusPill}
                  data-status={
                    ev.priority === 'high'   ? 'maintenance'
                  : ev.priority === 'medium' ? 'reserved'
                  : 'available'
                  }
                >
                  {ev.priority ?? 'routine'}
                </span>
              </div>

              <div className={styles.equipmentAction}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => startEdit(ev)}
                  disabled={busy}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => handleDelete(ev)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Done
          </button>
        </footer>

      </div>
    </div>
  )
}
