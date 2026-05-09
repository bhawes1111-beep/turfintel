import styles from './intelligence.module.css'

/**
 * Left column of an advisory card: emoji icon + severity text label.
 *
 * @param {string}  icon     - Emoji from the recommendation object
 * @param {string}  severity - Severity key e.g. 'high' | 'warning' | 'good'
 * @param {Object}  tokens   - Severity token map (SEVERITY_TOKENS or IRRIGATION_SEVERITY_TOKENS)
 */
export default function SeverityBadge({ icon, severity, tokens }) {
  const meta = tokens[severity] ?? tokens.low
  return (
    <div className={styles.icItemLeft}>
      <span className={styles.icIcon}>{icon}</span>
      <span className={styles.icSeverityLabel} style={{ color: meta.color }}>
        {meta.label}
      </span>
    </div>
  )
}
