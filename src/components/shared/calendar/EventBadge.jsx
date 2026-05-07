import styles from './Calendar.module.css'
import { EVENT_COLORS } from './calendarTokens'

/**
 * Colored dot + label — used in legend rows and inline references.
 *
 * Props:
 *   type    — keyof EVENT_COLORS (used to resolve color when color is absent)
 *   label   — display text (defaults to type)
 *   color   — optional hex override
 *   size    — dot size in px (default 8)
 */
export default function EventBadge({ type, label, color, size = 8 }) {
  const c = color || EVENT_COLORS[type] || EVENT_COLORS.default
  return (
    <span className={styles.eventBadge}>
      <span
        className={styles.eventBadgeDot}
        style={{ background: c, width: size, height: size }}
      />
      {label ?? type}
    </span>
  )
}
