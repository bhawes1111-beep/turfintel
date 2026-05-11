/**
 * CourseScopeSection — operational course scope selector (Phase 5.7).
 *
 * Distinct from the existing "Course" section, which configures the
 * geo descriptor for the course-map subsystem. This section drives the
 * D1 data scope: every persistent vertical (equipment, sprays,
 * crew_assignments, …) is filtered by the selected course id at the
 * Worker.
 *
 * Switching here triggers a refresh on every vertical store via the
 * subscribeCourseChange channel — no page reload required.
 */

import {
  useCoursesData,
  useSelectedCourseId,
  useSelectedCourse,
  setSelectedCourseId,
} from '../../../utils/courses/courseStore'
import styles from '../Settings.module.css'

export default function CourseScopeSection() {
  const { courses, loading } = useCoursesData()
  const selectedId           = useSelectedCourseId()
  const selectedCourse       = useSelectedCourse()

  function handleChange(e) {
    setSelectedCourseId(e.target.value)
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Operational Course Scope</p>
      </div>
      <p className={styles.cardDesc}>
        Determines which course&apos;s operational data appears across the app.
        Switching causes every persistent vertical (equipment, sprays, alerts,
        crew, calendar, …) to refetch with the new scope. Per-course geo
        settings live under <strong>Course</strong>; this control is independent.
      </p>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Active Course</span>
          <span className={styles.rowDesc}>
            {selectedCourse
              ? `${selectedCourse.name}${selectedCourse.location ? ` · ${selectedCourse.location}` : ''}`
              : selectedId}
          </span>
        </div>
        <select
          className={styles.input}
          value={selectedId}
          onChange={handleChange}
          disabled={loading || courses.length === 0}
        >
          {courses.length === 0 && <option value={selectedId}>{selectedId}</option>}
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Course ID</span>
          <span className={styles.rowDesc}>The slug stored on every D1 record.</span>
        </div>
        <code style={{
          padding:     '6px 10px',
          background:  'rgba(255,255,255,0.04)',
          border:      '1px solid rgba(255,255,255,0.08)',
          borderRadius:4,
          fontSize:    12,
        }}>{selectedId}</code>
      </div>
    </div>
  )
}
