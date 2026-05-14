/**
 * CourseSection — editable Course Information (Phase 17).
 *
 * Edits the identity fields of the operational course every record is
 * scoped to: name, short name, location, status. Backed by the D1
 * `courses` table via courseStore.patchCourse — the same store the
 * Course Scope selector and Course Configuration (acreage) section
 * read from, so a save here updates the selected-course label
 * everywhere instantly.
 *
 * Explicit Save only — no autosave. Course-map geometry (lat/lng,
 * bounding box, aerial) belongs to a separate frontend subsystem
 * (CourseContext) and is shown read-only at the bottom for reference.
 */

import { useEffect, useMemo, useState } from 'react'
import { useCourse } from '../../../context/CourseContext'
import {
  useSelectedCourse,
  useSelectedCourseId,
  patchCourse,
} from '../../../utils/courses/courseStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Settings.module.css'

const STATUS_OPTS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

function makeForm(course) {
  return {
    name:      course?.name      ?? '',
    shortName: course?.shortName ?? '',
    location:  course?.location  ?? '',
    status:    course?.status    ?? 'active',
  }
}

export default function CourseSection() {
  const selectedId       = useSelectedCourseId()
  const selectedCourse   = useSelectedCourse()
  const { activeCourse } = useCourse()
  const geo              = activeCourse?.geo
  const toast            = useToast()

  const [form, setForm] = useState(() => makeForm(selectedCourse))
  const [busy, setBusy] = useState(false)

  // Re-seed when the selected course changes (scope switch) or when the
  // upstream payload updates (e.g. right after a save).
  useEffect(() => {
    setForm(makeForm(selectedCourse))
  }, [selectedId, selectedCourse?.updatedAt])

  const dirty = useMemo(
    () => JSON.stringify(makeForm(selectedCourse)) !== JSON.stringify(form),
    [form, selectedCourse],
  )

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSave(e) {
    e?.preventDefault?.()
    if (!selectedCourse) {
      toast.error('No course selected.')
      return
    }
    if (!form.name.trim()) {
      toast.info('Course name is required.')
      return
    }
    setBusy(true)
    try {
      await patchCourse(selectedCourse.id, {
        name:      form.name.trim(),
        shortName: form.shortName.trim() || null,
        location:  form.location.trim() || null,
        status:    form.status,
      })
      toast.success('Course information saved.')
    } catch (err) {
      toast.error(`Save failed: ${err?.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  if (!selectedCourse) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Course Information</p>
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
      {/* ── Editable identity ─────────────────────────────────────────── */}
      <form className={styles.card} onSubmit={handleSave}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Course Information</p>
          <span className={styles.segmentedHint}>{selectedCourse.id}</span>
        </div>
        <p className={styles.cardDesc}>
          Identity for the operational course every record is scoped to.
          Saving updates the course label across the app immediately.
        </p>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Course Name</span>
            <span className={styles.rowDesc}>Full facility name</span>
          </div>
          <input
            type="text"
            className={styles.input}
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. Crossroads Golf Club"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Short Name</span>
            <span className={styles.rowDesc}>Compact label used in tight UI (headers, chips)</span>
          </div>
          <input
            type="text"
            className={styles.input}
            value={form.shortName}
            onChange={e => setField('shortName', e.target.value)}
            placeholder="e.g. Crossroads GC"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Location</span>
            <span className={styles.rowDesc}>City, state or region</span>
          </div>
          <input
            type="text"
            className={styles.input}
            value={form.location}
            onChange={e => setField('location', e.target.value)}
            placeholder="e.g. Savannah, GA"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Status</span>
            <span className={styles.rowDesc}>Operational state of this course record</span>
          </div>
          <select
            className={styles.selectField}
            value={form.status}
            onChange={e => setField('status', e.target.value)}
          >
            {STATUS_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>
              {dirty ? 'Unsaved changes' : 'Up to date'}
            </span>
            <span className={styles.rowDesc}>
              Acreage and area config live under <strong>Course Configuration</strong>.
            </span>
          </div>
          <button
            type="submit"
            className={styles.actionBtn}
            disabled={!dirty || busy}
          >
            {busy ? 'Saving…' : 'Save Course Info'}
          </button>
        </div>
      </form>

      {/* ── Read-only map geometry reference ──────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.cardTitle}>Course Map Geometry</p>
        </div>
        <p className={styles.cardDesc}>
          Configured separately for the course-map subsystem. Shown here
          for reference — read-only.
        </p>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Anchor Coordinates</span>
            <span className={styles.rowDesc}>WGS-84 decimal degrees</span>
          </div>
          <span className={styles.rowValue}>
            {geo
              ? `${geo.center.lat.toFixed(6)}, ${geo.center.lng.toFixed(6)}`
              : 'Not configured'}
          </span>
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Bounding Box</span>
            <span className={styles.rowDesc}>N / S / E / W</span>
          </div>
          <span className={styles.rowValue}>
            {geo
              ? `${geo.bounds.north.toFixed(4)} · ${geo.bounds.south.toFixed(4)} · ${geo.bounds.east.toFixed(4)} · ${geo.bounds.west.toFixed(4)}`
              : 'Not configured'}
          </span>
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Default Map Zoom</span>
          </div>
          <span className={styles.rowValue}>{geo?.defaultZoom ?? '—'}</span>
        </div>

        <div className={styles.row}>
          <div className={styles.rowStack}>
            <span className={styles.rowLabel}>Time Zone</span>
          </div>
          <span className={styles.rowValue}>
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
        </div>
      </div>
    </>
  )
}
