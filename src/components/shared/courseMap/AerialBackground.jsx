/**
 * AerialBackground — pluggable base layer that sits beneath the SVG overlays.
 *
 * Phase 1 behavior:
 *   - If course.geo.aerialUrl is set AND the image loads → render <img>
 *   - Otherwise → render the dark TurfIntel placeholder gradient
 *
 * Future phases will swap in a tile provider (Esri / Mapbox / MapLibre)
 * without changing the SVG overlay code.
 */

import { useState } from 'react'
import styles from './CourseMap.module.css'

export default function AerialBackground({ course }) {
  const url = course?.geo?.aerialUrl ?? null
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <div className={styles.aerialPlaceholder} aria-hidden="true">
        <div className={styles.aerialPlaceholderGrid} />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      className={styles.aerialImg}
      onError={() => setFailed(true)}
      draggable={false}
    />
  )
}
