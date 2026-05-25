import { useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import {
  useSprayPrograms,
  createSprayProgram,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import styles from './SprayProgramPlanner.module.css'

// Phase 7F (1/?) — Spray Program Planner tab shell.
//
// Minimal surface for the new data model:
//   - lists active/draft programs from sprayProgramStore
//   - empty-state "No spray programs yet." + "Create program" CTA
//   - bare-bones create form (name + program type + season year + notes)
//
// Out of scope for this commit:
//   - per-program detail view / item editor
//   - PDF upload, AI extraction, structured import
//   - calendar scheduling, inventory deduction, spray-record linkage
//
// Programs are read-only intelligence-adjacent intent — they do not
// affect inventory or spray records.

const PROGRAM_TYPES = ['greens', 'tees', 'fairways', 'rough', 'landscape', 'custom']

export default function SprayProgramPlanner() {
  const { programs, loading, error } = useSprayPrograms()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', programType: 'greens', seasonYear: new Date().getFullYear(), notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setSubmitErr(null)
    try {
      await createSprayProgram({
        name:        form.name.trim(),
        programType: form.programType,
        seasonYear:  Number.parseInt(form.seasonYear, 10) || null,
        notes:       form.notes.trim() || null,
        status:      'draft',
        source:      'manual',
      })
      setForm({ name: '', programType: 'greens', seasonYear: new Date().getFullYear(), notes: '' })
      setCreating(false)
    } catch (err) {
      setSubmitErr(err.message || 'Could not create program')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Spray Program Planner"
        subtitle="Plan upcoming spray programs. Programs hold intent only — they do not deduct inventory or create spray records."
      >
        {error && (
          <EmptyState
            title="Could not load spray programs."
            description={error}
          />
        )}

        {!error && loading && programs.length === 0 && (
          <EmptyState compact title="Loading programs…" />
        )}

        {!error && !loading && programs.length === 0 && !creating && (
          <EmptyState
            title="No spray programs yet."
            description="A spray program is a reusable plan: products, target areas, and planned windows. Inventory and spray records remain untouched until you log a completed application."
          >
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setCreating(true)}
            >
              + Create program
            </button>
          </EmptyState>
        )}

        {!error && programs.length > 0 && (
          <>
            <div className={styles.toolbarRow}>
              <span className={styles.countLabel}>
                {programs.length} program{programs.length !== 1 ? 's' : ''}
              </span>
              {!creating && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setCreating(true)}
                >
                  + Create program
                </button>
              )}
            </div>
            <ul className={styles.programList}>
              {programs.map(p => (
                <li key={p.id} className={`${styles.programCard} ${p._pending ? styles.pending : ''}`}>
                  <div className={styles.programMain}>
                    <span className={styles.programName}>{p.name}</span>
                    <span className={styles.programMeta}>
                      {p.programType && <span className={styles.programType}>{p.programType}</span>}
                      {p.seasonYear && <span> · {p.seasonYear}</span>}
                      <span className={styles[`programStatus_${p.status}`]}> · {p.status}</span>
                    </span>
                    {p.notes && <p className={styles.programNotes}>{p.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {creating && (
          <form className={styles.createForm} onSubmit={handleSubmit}>
            <h3 className={styles.createTitle}>New spray program</h3>
            <p className={styles.createHint}>
              Programs hold intent only. No inventory will be deducted and no spray records will be created.
            </p>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Program name <span aria-hidden className={styles.req}>*</span>
                <input
                  type="text"
                  className={styles.formInput}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                  placeholder="e.g. 2026 Greens Fungicide Program"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Program type
                <select
                  className={styles.formInput}
                  value={form.programType}
                  onChange={e => setForm({ ...form, programType: e.target.value })}
                >
                  {PROGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className={styles.formLabel}>
                Season year
                <input
                  type="number"
                  className={styles.formInput}
                  value={form.seasonYear}
                  onChange={e => setForm({ ...form, seasonYear: e.target.value })}
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Notes
                <textarea
                  className={`${styles.formInput} ${styles.formTextarea}`}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </label>
            </div>
            {submitErr && <p className={styles.errorBanner}>{submitErr}</p>}
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => { setCreating(false); setSubmitErr(null) }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={submitting || !form.name.trim()}
              >
                {submitting ? 'Creating…' : 'Create program'}
              </button>
            </div>
          </form>
        )}
      </WorkspaceSection>
    </div>
  )
}
