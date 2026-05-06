// Reusable dashboard card. Supports standard, wide (span 2), and tall variants.
// Future content (charts, tables, weather radar, AI alerts) drops into {children}.
// Size is controlled by CSS variables — adjust in index.css, not here.

import styles from './DashboardCard.module.css'

export default function DashboardCard({
  title,
  children,
  wide = false,
  tall = false,
  className = '',
}) {
  const classes = [
    styles.card,
    wide  ? styles.wide  : '',
    tall  ? styles.tall  : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {title && <p className={styles.cardTitle}>{title}</p>}
      <div className={styles.cardBody}>
        {children}
      </div>
    </div>
  )
}
