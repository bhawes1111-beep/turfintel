/**
 * EmptyState — reusable component for "no data yet" surfaces.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Icon name="tasks" />}     // optional — JSX node, unicode glyph, or null
 *     title="No active tasks"
 *     description="Tasks will appear here once they're scheduled."
 *     actionLabel="Create Task"        // optional
 *     onAction={() => ...}             // optional
 *     compact={false}                  // smaller padding for inside small cards
 *   />
 *
 * Design: dark graphite frame with subtle dashed border, turf-green accents,
 * centered layout. Drops into any container. Use `compact` inside small cards.
 */

import styles from './EmptyState.module.css'

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact   = false,
  className = '',
}) {
  const classes = [
    styles.emptyState,
    compact ? styles.compact : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} role="status" aria-live="polite">
      {icon && (
        <div className={styles.iconWrap} aria-hidden="true">
          <span className={styles.icon}>{icon}</span>
        </div>
      )}
      {title       && <p className={styles.title}>{title}</p>}
      {description && <p className={styles.description}>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
