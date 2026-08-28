import { useState } from 'react'
import { useToast } from '../../../utils/feedback/toastContext'
import {
  createYearlyGoal,
  createYearlyGoalOption,
  deleteYearlyGoal,
  deleteYearlyGoalOption,
  patchYearlyGoal,
  useYearlyGoalsData,
} from '../../../utils/operations/yearlyGoalsStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from './WeeklyGoals.module.css'

const STATUS_OPTIONS = [
  ['in-progress', 'In Progress'],
  ['done', 'Done'],
  ['not-done', 'Not Done'],
]

const CURRENT_YEAR = new Date().getFullYear()

export default function YearlyGoals() {
  const { goals, goalOptions, loading, error } = useYearlyGoalsData()
  const toast = useToast()
  const [form, setForm] = useState({ year: CURRENT_YEAR, note: '', notes: '', status: 'in-progress' })
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState('')
  const [creating, setCreating] = useState(false)
  const [newOption, setNewOption] = useState('')
  const [savingOption, setSavingOption] = useState(false)

  async function addGoalOption() {
    const label = newOption.trim()
    if (!label) { toast.info?.('Enter a yearly goal to add to the menu.'); return }
    setSavingOption(true)
    try {
      const saved = await createYearlyGoalOption(label)
      setForm(prev => ({ ...prev, note: saved.label }))
      setNewOption('')
      toast.success?.('Yearly goal added to the menu.')
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
      await deleteYearlyGoalOption(option.id)
      setForm(prev => ({ ...prev, note: '' }))
      toast.success?.('Yearly goal removed from the menu.')
    } catch (err) {
      toast.error?.(`Goal menu update failed: ${err.message}`)
    }
  }

  async function addGoal(event) {
    event.preventDefault()
    if (!form.note.trim()) { toast.info?.('Choose the yearly goal or improvement.'); return }
    setCreating(true)
    try {
      await createYearlyGoal({
        ...form,
        year: Number(form.year),
        note: form.note.trim(),
        notes: form.notes.trim(),
      })
      setForm(prev => ({ ...prev, note: '', notes: '', status: 'in-progress' }))
      toast.success?.('Yearly goal added.')
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
    if (!draft?.note?.trim()) { toast.info?.('The goal cannot be blank.'); return }
    setSavingId(id)
    try {
      await patchYearlyGoal(id, {
        year: Number(draft.year), note: draft.note.trim(),
        notes: String(draft.notes ?? '').trim(), status: draft.status,
      })
      toast.success?.('Yearly goal updated.')
    } catch (err) {
      toast.error?.(`Goal update failed: ${err.message}`)
    } finally {
      setSavingId('')
    }
  }

  async function removeGoal(goal) {
    if (!window.confirm('Delete this yearly goal?')) return
    try {
      await deleteYearlyGoal(goal.id)
      toast.success?.('Yearly goal deleted.')
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message}`)
    }
  }

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h2>Yearly Goals / Improvements</h2>
          <p>Track annual course priorities, capital improvements, and long-term progress.</p>
        </div>
      </header>

      <form className={styles.createForm} onSubmit={addGoal}>
        <label>
          <span>Year</span>
          <input type="number" min="2000" max="2200" step="1" value={form.year} onChange={event => setForm(prev => ({ ...prev, year: event.target.value }))} required />
        </label>
        <div className={styles.noteField}>
          <label>
            <span>Goal / improvement</span>
            <select value={form.note} onChange={event => setForm(prev => ({ ...prev, note: event.target.value }))} required>
              <option value="">Choose a yearly goal...</option>
              {goalOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
            </select>
          </label>
          <div className={styles.goalMenuActions}>
            <input value={newOption} onChange={event => setNewOption(event.target.value)} placeholder="Add a yearly goal to this menu" />
            <button type="button" onClick={addGoalOption} disabled={savingOption}>{savingOption ? 'Adding...' : 'Add'}</button>
            <button type="button" className={styles.removeOptionBtn} onClick={removeSelectedOption} disabled={!goalOptions.some(item => item.label === form.note)}>Remove</button>
          </div>
        </div>
        <label className={styles.notesField}>
          <span>Notes</span>
          <textarea rows={2} value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} placeholder="Optional milestones, details, or follow-up" />
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
      {loading && <p className={styles.loading}>Loading yearly goals...</p>}
      {!loading && goals.length === 0 && (
        <EmptyState compact title="No yearly goals yet." description="Add the first annual goal or improvement above." />
      )}
      <div className={styles.list}>
        {goals.map(goal => {
          const draft = drafts[goal.id] || goal
          return (
            <article key={goal.id} className={styles.goalRow} data-status={draft.status}>
              <label className={styles.weekField}>
                <span>Year</span>
                <input type="number" min="2000" max="2200" step="1" aria-label="Goal year" value={draft.year} onChange={event => updateDraft(goal.id, { year: event.target.value })} />
              </label>
              <textarea rows={2} aria-label="Goal or improvement" value={draft.note} onChange={event => updateDraft(goal.id, { note: event.target.value })} />
              <textarea rows={2} aria-label="Goal notes" value={draft.notes ?? ''} onChange={event => updateDraft(goal.id, { notes: event.target.value })} placeholder="Optional notes" />
              <select aria-label="Goal status" value={draft.status} onChange={event => updateDraft(goal.id, { status: event.target.value })}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className={styles.actions}>
                <button type="button" onClick={() => saveGoal(goal.id)} disabled={savingId === goal.id}>{savingId === goal.id ? 'Saving...' : 'Save'}</button>
                <button type="button" className={styles.deleteBtn} onClick={() => removeGoal(goal)}>Delete</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
