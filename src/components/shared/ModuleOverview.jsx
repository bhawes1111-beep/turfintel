import styles from './ModuleOverview.module.css'

/** Grid wrapper for all module overview tabs */
export function ModuleOverview({ children }) {
  return <div className={styles.grid}>{children}</div>
}

/** Single-column metric tile */
export function StatCard({ label, value, sub, color }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue} style={color ? { color } : undefined}>
        {value}
      </div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  )
}

/**
 * Two-column info panel.
 * Pass either `rows` (array of { label, value }) or `children` for custom content.
 */
export function InfoCard({ title, rows, children }) {
  return (
    <div className={styles.infoCard}>
      {title && <div className={styles.infoTitle}>{title}</div>}
      {rows ? (
        <div className={styles.infoRows}>
          {rows.map((row, i) => (
            <div key={i} className={styles.infoRow}>
              <span className={styles.infoRowLabel}>{row.label}</span>
              {typeof row.value === 'string'
                ? <span className={styles.infoRowValue}>{row.value}</span>
                : row.value
              }
            </div>
          ))}
        </div>
      ) : children}
    </div>
  )
}

const VARIANT_CLASS = {
  green:  styles.badgeGreen,
  yellow: styles.badgeYellow,
  red:    styles.badgeRed,
  blue:   styles.badgeBlue,
  gray:   styles.badgeGray,
}

/** Colored status badge */
export function Badge({ children, variant = 'green' }) {
  return (
    <span className={`${styles.badge} ${VARIANT_CLASS[variant] ?? styles.badgeGray}`}>
      {children}
    </span>
  )
}
