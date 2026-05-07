import styles from './Weather.module.css'

const COND_CLASS = {
  favorable: styles.condFavorable,
  caution:   styles.condCaution,
  danger:    styles.condDanger,
  ideal:     styles.condIdeal,
}

const SEVERITY_ICONS = {
  favorable: '✓',
  caution:   '⚠',
  danger:    '⚠',
  ideal:     'ℹ',
}

/**
 * Inline dismissible weather alert banner.
 *
 * Props:
 *   message  — string
 *   severity — 'favorable' | 'caution' | 'danger' | 'ideal'  (default 'caution')
 *   onDismiss — () => void  optional; omit to hide dismiss button
 */
export default function WeatherAlertBanner({ message, severity = 'caution', onDismiss }) {
  const condCls = COND_CLASS[severity] ?? styles.condCaution

  return (
    <div className={`${styles.alertBanner} ${condCls}`}>
      <div className={styles.alertBannerContent}>
        <span className={styles.alertBannerIcon}>{SEVERITY_ICONS[severity]}</span>
        <span className={styles.alertBannerMessage}>{message}</span>
      </div>
      {onDismiss && (
        <button
          className={styles.alertBannerDismiss}
          onClick={onDismiss}
          aria-label="Dismiss weather alert"
        >
          ✕
        </button>
      )}
    </div>
  )
}
