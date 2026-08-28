/**
 * CourseConfigurationSection — operational configuration for the active
 * course (Phase 1).
 *
 * Source of truth for acreage values + default rate units that downstream
 * spray workflows (Phase 1b) will pull from. Edits are scoped to the
 * currently selected course (Course Scope section) and persist via the
 * existing patchCourse helper.
 *
 * Form model: dirty local state + explicit Save. No autosave —
 * configuration changes should feel intentional.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  useSelectedCourse,
  useSelectedCourseId,
  patchCourse,
} from '../../../utils/courses/courseStore'
import styles from '../Settings.module.css'

const SQ_FT_PER_ACRE = 43560

const BUILTIN_ACREAGE_FIELDS = [
  { key: 'acresTotal',     label: 'Total Acreage',     hint: 'Whole-property footprint' },
  { key: 'acresGreens',    label: 'Greens',            hint: 'Putting surfaces' },
  { key: 'acresTees',      label: 'Tees',              hint: 'Tee complexes' },
  { key: 'acresFairways',  label: 'Fairways',          hint: 'Mowed primary playing surfaces' },
  { key: 'acresRough',     label: 'Rough',             hint: 'Mowed secondary playing surfaces' },
  { key: 'acresSprayable', label: 'Sprayable Acreage', hint: 'Total area available for chemical applications' },
  { key: 'acresPractice',  label: 'Practice Area',     hint: 'Range, short game, putting green' },
]

const SPRAY_UNIT_OPTIONS = [
  { value: '',                     label: 'Not set' },
  { value: 'oz_per_acre',          label: 'oz / acre' },
  { value: 'oz_per_1000sqft',      label: 'oz / 1,000 sq ft' },
  { value: 'gallons_per_acre',     label: 'gal / acre' },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft' },
]

function makeInitialForm(course) {
  return {
    acresTotal:        course?.acresTotal        ?? '',
    acresGreens:       course?.acresGreens       ?? '',
    acresTees:         course?.acresTees         ?? '',
    acresFairways:     course?.acresFairways     ?? '',
    acresRough:        course?.acresRough        ?? '',
    acresSprayable:    course?.acresSprayable    ?? '',
    acresPractice:     course?.acresPractice     ?? '',
    defaultSprayUnits: course?.defaultSprayUnits ?? '',
    customCourseAreas: Array.isArray(course?.customCourseAreas)
      ? course.customCourseAreas.map(a => ({ name: a.name ?? '', acres: a.acres ?? '' }))
      : [],
  }
}

function toPayload(form) {
  const numOrNull = v => {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    acresTotal:        numOrNull(form.acresTotal),
    acresGreens:       numOrNull(form.acresGreens),
    acresTees:         numOrNull(form.acresTees),
    acresFairways:     numOrNull(form.acresFairways),
    acresRough:        numOrNull(form.acresRough),
    acresSprayable:    numOrNull(form.acresSprayable),
    acresPractice:     numOrNull(form.acresPractice),
    defaultSprayUnits: form.defaultSprayUnits || null,
    customCourseAreas: form.customCourseAreas
      .map(a => ({ name: (a.name ?? '').trim(), acres: numOrNull(a.acres) }))
      .filter(a => a.name !== ''),
  }
}

function squareFeetFromAcres(acres) {
  if (acres === '' || acres == null) return ''
  const value = Number(acres)
  if (!Number.isFinite(value)) return ''
  return Number((value * SQ_FT_PER_ACRE).toFixed(2))
}

function acresFromSquareFeet(squareFeet) {
  if (squareFeet === '' || squareFeet == null) return ''
  const value = Number(squareFeet)
  if (!Number.isFinite(value)) return ''
  return Number((value / SQ_FT_PER_ACRE).toFixed(8))
}

export default function CourseConfigurationSection() {
  const selectedId     = useSelectedCourseId()
  const selectedCourse = useSelectedCourse()

  const [form, setForm]         = useState(() => makeInitialForm(selectedCourse))
  const [status, setStatus]     = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  // Re-seed when the selected course changes (switching scope) or when
  // the upstream course payload arrives after first render.
  useEffect(() => {
    setForm(makeInitialForm(selectedCourse))
    setStatus('idle')
    setErrorMsg('')
  }, [selectedId, selectedCourse?.updatedAt])

  const dirty = useMemo(() => {
    const baseline = makeInitialForm(selectedCourse)
    return JSON.stringify(baseline) !== JSON.stringify(form)
  }, [form, selectedCourse])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setStatus('idle')
  }

  function setBuiltInSquareFeet(key, value) {
    setField(key, acresFromSquareFeet(value))
  }

  function updateCustomArea(index, patch) {
    setForm(prev => ({
      ...prev,
      customCourseAreas: prev.customCourseAreas.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }))
    setStatus('idle')
  }

  function updateCustomAreaSquareFeet(index, value) {
    updateCustomArea(index, { acres: acresFromSquareFeet(value) })
  }

  function addCustomArea() {
    setForm(prev => ({
      ...prev,
      customCourseAreas: [...prev.customCourseAreas, { name: '', acres: '' }],
    }))
    setStatus('idle')
  }

  function removeCustomArea(index) {
    setForm(prev => ({
      ...prev,
      customCourseAreas: prev.customCourseAreas.filter((_, i) => i !== index),
    }))
    setStatus('idle')
  }

  async function handleSave() {
    if (!selectedCourse) return
    setStatus('saving')
    setErrorMsg('')
    try {
      await patchCourse(selectedCourse.id, toPayload(form))
      setStatus('saved')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err?.message ?? String(err))
    }
  }

  if (!selectedCourse) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Course Configuration</p>
        </div>
        <p className={styles.cardDesc}>
          No course selected. Choose an operational course under{' '}
          <strong>Course Scope</strong> first.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* ── Built-in course areas ────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Built-in Course Areas</p>
          <span className={styles.segmentedHint}>{selectedCourse.name}</span>
        </div>
        <p className={styles.cardDesc}>
          Standard golf-course areas in acres and square feet. Enter either
          measurement and the other updates automatically. Leave both blank to
          mark it as not configured.
        </p>

        {BUILTIN_ACREAGE_FIELDS.map(field => (
          <div key={field.key} className={styles.row}>
            <div className={styles.rowStack}>
              <span className={styles.rowLabel}>{field.label}</span>
              <span className={styles.rowDesc}>{field.hint}</span>
            </div>
            <div className={styles.courseAreaMeasurements}>
              <label className={styles.courseAreaMeasurement}>
                <span>Acres</span>
                <input
                  type="number"
                  className={styles.input}
                  value={form[field.key]}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={e => setField(field.key, e.target.value)}
                />
              </label>
              <label className={styles.courseAreaMeasurement}>
                <span>Square feet</span>
                <input
                  type="number"
                  className={styles.input}
                  value={squareFeetFromAcres(form[field.key])}
                  min="0"
                  step="1"
                  placeholder="0"
                  onChange={e => setBuiltInSquareFeet(field.key, e.target.value)}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* ── Defaults ─────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Operational Defaults</p>
        </div>
        <p className={styles.cardDesc}>
          Defaults applied to new spray applications and downstream
          calculators.
        </p>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Default Spray Units</span>
            <span className={styles.rowDesc}>
              Used when creating a new spray application row. Supports both
              chemical and carrier-volume conventions.
            </span>
          </div>
          <select
            className={styles.selectField}
            value={form.defaultSprayUnits ?? ''}
            onChange={e => setField('defaultSprayUnits', e.target.value)}
          >
            {SPRAY_UNIT_OPTIONS.map(opt => (
              <option key={opt.value || 'none'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Custom areas ─────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Custom Course Areas</p>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={addCustomArea}
          >
            + Add Area
          </button>
        </div>
        <p className={styles.cardDesc}>
          Anything outside the built-in categories — nursery, bunker sand,
          landscape beds, native areas, short course, event lawn, future
          expansion zones. Enter acres or square feet; both measurements are
          shown in the Application Builder.
        </p>

        {form.customCourseAreas.length === 0 && (
          <p className={styles.cardDesc} style={{ fontStyle: 'italic' }}>
            No custom areas configured yet.
          </p>
        )}

        {form.customCourseAreas.map((area, index) => (
          <div key={index} className={styles.row}>
            <input
              type="text"
              className={styles.input}
              value={area.name}
              placeholder="Area name (e.g. Nursery)"
              onChange={e => updateCustomArea(index, { name: e.target.value })}
              style={{ flex: 2, minWidth: 0 }}
            />
            <div className={styles.courseAreaMeasurements}>
              <label className={styles.courseAreaMeasurement}>
                <span>Acres</span>
                <input
                  type="number"
                  className={styles.input}
                  value={area.acres}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={e => updateCustomArea(index, { acres: e.target.value })}
                />
              </label>
              <label className={styles.courseAreaMeasurement}>
                <span>Square feet</span>
                <input
                  type="number"
                  className={styles.input}
                  value={squareFeetFromAcres(area.acres)}
                  min="0"
                  step="1"
                  placeholder="0"
                  onChange={e => updateCustomAreaSquareFeet(index, e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => removeCustomArea(index)}
              aria-label={`Remove ${area.name || 'area'}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.row} style={{ paddingTop: 4 }}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>
              {status === 'saving' && 'Saving…'}
              {status === 'saved'  && 'Saved.'}
              {status === 'error'  && 'Save failed.'}
              {status === 'idle'   && (dirty ? 'Unsaved changes' : 'Up to date')}
            </span>
            {status === 'error' && (
              <span className={styles.rowDesc} style={{ color: '#f87171' }}>
                {errorMsg}
              </span>
            )}
            {status !== 'error' && (
              <span className={styles.rowDesc}>
                Changes are stored on the course record and scoped to{' '}
                <code>{selectedCourse.id}</code>.
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={!dirty || status === 'saving'}
            onClick={handleSave}
          >
            {status === 'saving' ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </>
  )
}
