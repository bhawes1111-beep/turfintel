/**
 * CourseMap — top-level mapping component.
 *
 * Composition order (z-axis, bottom → top):
 *   1. AerialBackground          (static aerial PNG or dark placeholder)
 *   2. SVG overlay
 *      a. Each MapLayer in zIndex order (rough → fairways → tees → bunkers
 *         → greens → routes → points)
 *
 * Phase 1: renderer is SVG, no pan/zoom. The `bounds` from CourseContext
 * define the SVG viewBox; consumers size the wrapper via CSS and the SVG
 * scales to fit.
 *
 * Future renderers (Leaflet/MapLibre) consume the exact same:
 *   - GeoJSON FeatureCollections from src/data/courseGeo.js
 *   - LayerSpecs from src/utils/geo/featureRegistry.js
 *   - course.geo.bounds from CourseContext
 *
 * Props:
 *   courseId          number   - course id (looked up in CourseContext)
 *   initialLayers     string[] - layer keys visible on first render (default: all)
 *   onFeatureClick    func     - optional: (feature, layerKey) => void
 *   showToggles       bool     - show layer toggle panel (default: true)
 *   showLegend        bool     - show legend (default: true)
 */

import { useMemo, useState } from 'react'
import { useCourse } from '../../../context/CourseContext'
import { getCourseGeo } from '../../../data/courseGeo'
import { LAYERS, LAYER_KEYS, layersInRenderOrder, DEFAULT_VISIBILITY } from '../../../utils/geo/featureRegistry'
import { makeProjector, viewBoxForBounds } from '../../../utils/geo/projection'
import AerialBackground from './AerialBackground'
import MapLayer from './MapLayer'
import LayerToggle from './LayerToggle'
import MapLegend from './MapLegend'
import styles from './CourseMap.module.css'

export default function CourseMap({
  courseId,
  initialLayers,
  onFeatureClick,
  showToggles = true,
  showLegend  = true,
}) {
  const { courses, activeCourse } = useCourse()

  // Resolve the target course — explicit prop wins; else use active course.
  const course = useMemo(() => {
    if (courseId != null) return courses.find(c => c.id === courseId) ?? null
    return activeCourse
  }, [courseId, courses, activeCourse])

  // Initial visibility — explicit prop list, or default (all on).
  const [visibility, setVisibility] = useState(() => {
    if (Array.isArray(initialLayers)) {
      return LAYER_KEYS.reduce((acc, k) => {
        acc[k] = initialLayers.includes(k)
        return acc
      }, {})
    }
    return { ...DEFAULT_VISIBILITY }
  })

  function toggleLayer(key) {
    setVisibility(v => ({ ...v, [key]: !v[key] }))
  }

  // No course or no geo configured → friendly empty state.
  if (!course?.geo) {
    return (
      <div className={styles.wrap}>
        <div className={styles.frame}>
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>No mapping data</span>
            <span className={styles.emptySub}>
              {course?.name ?? 'This course'} has no geographic anchor configured.
            </span>
          </div>
        </div>
      </div>
    )
  }

  const { bounds } = course.geo
  const { width: vbW, height: vbH } = viewBoxForBounds(bounds, 1000)
  const project = useMemo(
    () => makeProjector({ bounds, viewWidth: vbW, viewHeight: vbH }).project,
    [bounds, vbW, vbH],
  )

  const geo            = getCourseGeo(course.id)
  const orderedLayers  = layersInRenderOrder(LAYER_KEYS)

  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>

        {/* Pluggable aerial base — static PNG fallback or dark placeholder */}
        <AerialBackground course={course} />

        {/* SVG overlay — preserves real-world aspect via viewBox */}
        <svg
          className={styles.svg}
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`${course.name} course map`}
        >
          {orderedLayers.map(key => {
            if (!visibility[key]) return null
            return (
              <MapLayer
                key={key}
                layerKey={key}
                spec={LAYERS[key]}
                featureCollection={geo[key]}
                project={project}
                onFeatureClick={onFeatureClick}
              />
            )
          })}
        </svg>

        {/* Course label badge */}
        <div className={styles.courseBadge}>
          <span className={styles.courseDot} />
          {course.name}
        </div>

        {showLegend && (
          <div className={styles.legendWrap}>
            <MapLegend visibility={visibility} />
          </div>
        )}
      </div>

      {showToggles && (
        <LayerToggle visibility={visibility} onToggle={toggleLayer} />
      )}
    </div>
  )
}
