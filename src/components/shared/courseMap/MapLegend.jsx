/**
 * MapLegend — minimal color-coded reference for currently-visible layers.
 */

import { LAYERS } from '../../../utils/geo/featureRegistry'
import styles from './CourseMap.module.css'

export default function MapLegend({ visibility }) {
  const visibleKeys = Object.keys(visibility).filter(k => visibility[k] !== false)
  if (visibleKeys.length === 0) return null

  return (
    <div className={styles.legend} aria-label="Map legend">
      {visibleKeys.map(key => {
        const spec = LAYERS[key]
        if (!spec) return null
        return (
          <div key={key} className={styles.legendItem}>
            <span
              className={styles.legendSwatch}
              style={{
                background: spec.fill === 'none' ? 'transparent' : spec.fill,
                border:     `1px solid ${spec.stroke}`,
              }}
            />
            <span className={styles.legendLabel}>{spec.label}</span>
          </div>
        )
      })}
    </div>
  )
}
