import SeverityBadge from './SeverityBadge'
import { MODULE_LABELS } from '../../utils/intelligence/types'
import styles from './intelligence.module.css'

/**
 * Single advisory card. Renders icon, severity badge, title, optional module
 * pill, context message, and recommended action.
 *
 * @param {Object}  rec          - TurfRecommendation object
 * @param {Object}  tokens       - Severity token map (SEVERITY_TOKENS or IRRIGATION_SEVERITY_TOKENS)
 * @param {boolean} showModule   - Whether to render the module pill (default false)
 */
export default function IntelligenceCard({ rec, tokens, showModule = false }) {
  const meta = tokens[rec.severity] ?? tokens.low
  return (
    <div
      className={styles.icItem}
      style={{
        '--ic-color':  meta.color,
        '--ic-bg':     meta.bg,
        '--ic-border': meta.border,
      }}
    >
      <SeverityBadge icon={rec.icon} severity={rec.severity} tokens={tokens} />

      <div className={styles.icItemBody}>
        <div className={styles.icItemTop}>
          <span className={styles.icTitle}>{rec.title}</span>
          {showModule && rec.module && (
            <span className={styles.icModulePill}>
              {MODULE_LABELS[rec.module] || rec.module}
            </span>
          )}
        </div>
        <p className={styles.icMessage}>{rec.message}</p>
        <p className={styles.icAction}>→ {rec.recommendation}</p>
      </div>
    </div>
  )
}
