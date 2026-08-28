import { useMemo, useState } from 'react'
import { useToast } from '../../../utils/feedback/toastContext'
import {
  createWeeklyGoal,
  createWeeklyGoalOption,
  deleteWeeklyGoal,
  deleteWeeklyGoalOption,
  patchWeeklyGoal,
  useWeeklyGoalsData,
} from '../../../utils/operations/weeklyGoalsStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from './WeeklyGoals.module.css'

const STATUS_OPTIONS = [
  ['in-progress', 'In Progress'],
  ['done', 'Done'],
  ['not-done', 'Not Done'],
]

function mondayKey(value = new Date()) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date.toISOString().slice(0, 10)
}

function fridayKey(value) {
  const monday = mondayKey(value)
  if (!monday) return ''
  const date = new Date(`${monday}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 4)
  return date.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function weekLabel(value) {
  const monday = mondayKey(value)
  return monday ? `Week of ${formatDate(monday)} - ${formatDate(fridayKey(monday))}` : ''
}

function shiftWeek(value, amount) {
  const monday = mondayKey(value)
  if (!monday) return mondayKey()
  const date = new Date(`${monday}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount * 7)
  return date.toISOString().slice(0, 10)
}

export default function WeeklyGoals() {
  const { goals, goalOptions, loading, error } = useWeeklyGoalsData()
  const toast = useToast()
  const [selectedWeek, setSelectedWeek] = useState(mondayKey())
  const [form, setForm] = useState({ date: mondayKey(), note: '', notes: '', status: 'in-progress' })
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState('')
  const [creating, setCreating] = useState(false)
  const [newOption, setNewOption] = useState('')
  const [savingOption, setSavingOption] = useState(false)
  const visibleGoals = useMemo(
    () => goals.filter(goal => mondayKey(goal.date) === selectedWeek),
    [goals, selectedWeek],
  )

  function showWeek(value) {
    const week = mondayKey(value)
    if (!week) return
    setSelectedWeek(week)
    setForm(prev => ({ ...prev, date: week }))
  }

  async function addGoalOption() {
    const label = newOption.trim()
    if (!label) { toast.info?.('Enter a weekly goal to add to the menu.'); return }
    setSavingOption(true)
    try {
      const saved = await createWeeklyGoalOption(label)
      setForm(prev => ({ ...prev, note: saved.label }))
      setNewOption('')
      toast.success?.('Weekly goal added to the menu.')
    } catch (err) {
      toast.error?.(`Goal menu update failed: ${err.message}`)
    } finally {
      setSavingOption(false)
    }
  }

  async function removeSelectedOption() {
    const option = goalOptions.find(item => item.label === form.note)
    if (!option) return
    try {
      await deleteWeeklyGoalOption(option.id)
      setForm(prev => ({ ...prev, note: '' }))
      toast.success?.('Weekly goal removed from the menu.')
    } catch (err) {
      toast.error?.(`Goal menu update failed: ${err.message}`)
    }
  }

  async function addGoal(event) {
    event.preventDefault()
    if (!form.note.trim()) { toast.info?.('Enter the goal or improvement note.'); return }
    setCreating(true)
    try {
      await createWeeklyGoal({
        ...form,
        date: mondayKey(form.date),
        note: form.note.trim(),
        notes: form.notes.trim(),
      })
      setForm(prev => ({ ...prev, note: '', notes: '', status: 'in-progress' }))
      toast.success?.('Weekly goal added.')
    } catch (err) {
      toast.error?.(`Goal save failed: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  function updateDraft(id, patch) {
    const source = goals.find(goal => goal.id === id) ?? {}
    setDrafts(prev => ({ ...prev, [id]: { ...source, ...prev[id], ...patch } }))
  }

  async function saveGoal(id) {
    const draft = drafts[id]
    if (!draft?.note?.trim()) { toast.info?.('The goal note cannot be blank.'); return }
    setSavingId(id)
    try {
      await patchWeeklyGoal(id, {
        date: mondayKey(draft.date),
        note: draft.note.trim(),
        notes: String(draft.notes ?? '').trim(),
        status: draft.status,
      })
      toast.success?.('Weekly goal updated.')
    } catch (err) {
      toast.error?.(`Goal update failed: ${err.message}`)
    } finally {
      setSavingId('')
    }
  }

  async function removeGoal(goal) {
    if (!window.confirm('Delete this weekly goal?')) return
    try {
      await deleteWeeklyGoal(goal.id)
      toast.success?.('Weekly goal deleted.')
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message}`)
    }
  }

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h2>Weekly Goals / Improvements</h2>
          <p>Track course priorities, improvements, and follow-through by workweek.</p>
        </div>
      </header>

      <nav className={styles.weekNavigator} aria-label="Weekly goals navigation">
        <button type="button" onClick={() => showWeek(shiftWeek(selectedWeek, -1))} aria-label="Previous week" title="Previous week">&lt;</button>
        <label>
          <span>Showing week</span>
          <input type="date" value={selectedWeek} onChange={event => showWeek(event.target.value)} />
        </label>
        <strong>{weekLabel(selectedWeek)}</strong>
        <button type="button" className={styles.currentWeekBtn} onClick={() => showWeek(mondayKey())}>Current Week</button>
        <button type="button" onClick={() => showWeek(shiftWeek(selectedWeek, 1))} aria-label="Next week" title="Next week">&gt;</button>
      </nav>

      <form className={styles.createForm} onSubmit={addGoal}>
        <label>
          <span>Week</span>
          <input type="date" value={form.date} onChange={event => showWeek(event.target.value)} required />
          <small className={styles.weekRange}>{weekLabel(form.date)}</small>
        </label>
        <div className={styles.noteField}>
          <label>
          <span>Goal / improvement</span>
            <select value={form.note} onChange={event => setForm(prev => ({ ...prev, note: event.target.value }))} required>
              <option value="">Choose a weekly goal...</option>
              {goalOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
            </select>
          </label>
          <div className={styles.goalMenuActions}>
            <input value={newOption} onChange={event => setNewOption(event.target.value)} placeholder="Add a goal to this menu" />
            <button type="button" onClick={addGoalOption} disabled={savingOption}>{savingOption ? 'Adding...' : 'Add'}</button>
            <button type="button" className={styles.removeOptionBtn} onClick={removeSelectedOption} disabled={!goalOptions.some(item => item.label === form.note)}>Remove</button>
          </div>
        </div>
        <label className={styles.notesField}>
          <span>Notes</span>
          <textarea rows={2} value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} placeholder="Optional details, progress, or follow-up" />
        </label>
        <label>
          <span>Status</span>
          <select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={creating}>{creating ? 'Adding...' : 'Add Goal'}</button>
      </form>

      {error && <p className={styles.error}>Goals could not load. {error}</p>}
      {loading && <p className={styles.loading}>Loading weekly goals...</p>}
      {!loading && visibleGoals.length === 0 && (
        <EmptyState compact title={`No goals for ${weekLabel(selectedWeek)}.`} description="Add a goal above or select another week." />
      )}
      <div className={styles.list}>
        {visibleGoals.map(goal => {
          const draft = drafts[goal.id] || goal
          return (
            <article key={goal.id} className={styles.goalRow} data-status={draft.status}>
              <label className={styles.weekField}>
                <input type="date" aria-label="Goal week" value={mondayKey(draft.date)} onChange={event => updateDraft(goal.id, { date: mondayKey(event.target.value) })} />
                <small className={styles.weekRange}>{weekLabel(draft.date)}</small>
              </label>
              <textarea rows={2} aria-label="Goal or improvement" value={draft.note} onChange={event => updateDraft(goal.id, { note: event.target.value })} />
              <textarea rows={2} aria-label="Goal notes" value={draft.notes ?? ''} onChange={event => updateDraft(goal.id, { notes: event.target.value })} placeholder="Optional notes" />
              <select aria-label="Goal status" value={draft.status} onChange={event => updateDraft(goal.id, { status: event.target.value })}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className={styles.actions}>
                <button type="button" onClick={() => saveGoal(goal.id)} disabled={savingId === goal.id}>
                  {savingId === goal.id ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className={styles.deleteBtn} onClick={() => removeGoal(goal)}>Delete</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
