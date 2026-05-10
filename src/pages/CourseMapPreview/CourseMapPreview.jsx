/**
 * Standalone preview page for the foundational CourseMap renderer.
 * Not wired into any production workflow yet — this exists solely to validate
 * the renderer architecture before wiring it into Disease, Spray, Irrigation, etc.
 *
 * Route: /course-map
 */

import { CourseMap } from '../../components/shared/courseMap'
import { useCourse } from '../../context/CourseContext'
import styles from './CourseMapPreview.module.css'

export default function CourseMapPreview() {
  const { activeCourse } = useCourse()
  const geo = activeCourse?.geo

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Course Map Preview</h1>
          <p className={styles.subtitle}>
            Foundational GeoJSON renderer — standalone validation surface.
          </p>
        </div>
        {geo && (
          <div className={styles.coords}>
            <div className={styles.coordsLabel}>Anchor</div>
            <div className={styles.coordsVal}>
              {geo.center.lat.toFixed(6)}, {geo.center.lng.toFixed(6)}
            </div>
          </div>
        )}
      </div>

      <div className={styles.mapBox}>
        <CourseMap courseId={activeCourse?.id} showImportPanel />
      </div>

      <div className={styles.notes}>
        <strong>Phase 1 scope:</strong> SVG renderer, equirectangular projection,
        per-layer toggles, optional aerial PNG fallback. Sample geometry is
        hand-authored placeholder content for hole 1 only.
        Pan / zoom, drawing, tile providers, and live imports are deferred to later phases.
      </div>
    </div>
  )
}
