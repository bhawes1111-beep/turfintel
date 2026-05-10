// Reusable dashboard card. Size is driven by a single `size` prop:
//   'default' | 'small' | 'wide' | 'tall' | 'full' | 'wide-tall'
// Legacy boolean props (wide/tall/full) still work for any caller that hasn't migrated.

import styles from './DashboardCard.module.css'

const SIZE_CLASS = {
  'default':    '',
  'small':      'small',
  'wide':       'wide',
  'tall':       'tall',
  'full':       'full',
  'wide-tall':  'wideTall',
}

export default function DashboardCard({
  title,
  children,
  size,
  wide = false,
  tall = false,
  full = false,
  className = '',
}) {
  // If `size` is given, it wins. Otherwise derive from legacy booleans.
  let resolved = size
  if (!resolved) {
    if (wide && tall) resolved = 'wide-tall'
    else if (full)    resolved = 'full'
    else if (wide)    resolved = 'wide'
    else if (tall)    resolved = 'tall'
    else              resolved = 'default'
  }

  const sizeClass = styles[SIZE_CLASS[resolved]] ?? ''

  const classes = [
    styles.card,
    sizeClass,
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
