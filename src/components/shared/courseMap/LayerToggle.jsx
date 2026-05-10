/**
 * LayerToggle — list of toggle rows, one per layer, with a tiny icon glyph.
 * Reads layer metadata from the registry; pure UI, no data knowledge.
 */

import { LAYERS, LAYER_KEYS } from '../../../utils/geo/featureRegistry'
import styles from './CourseMap.module.css'

export default function LayerToggle({ visibility, onToggle }) {
  return (
    <div className={styles.toggleList} role="group" aria-label="Map layers">
      <div className={styles.toggleHeader}>Layers</div>
      {LAYER_KEYS.map(key => {
        const spec = LAYERS[key]
        const isOn = visibility[key] !== false
        return (
          <button
            key={key}
            type="button"
            className={`${styles.toggleRow} ${isOn ? styles.toggleRowOn : ''}`}
            onClick={() => onToggle(key)}
            aria-pressed={isOn}
          >
            <span className={styles.toggleIcon} style={{ color: spec.fill }}>
              {spec.icon}
            </span>
            <span className={styles.toggleLabel}>{spec.label}</span>
            <span className={`${styles.toggleDot} ${isOn ? styles.toggleDotOn : ''}`} />
          </button>
        )
      })}
    </div>
  )
}
