import IntelligenceCard from './IntelligenceCard'
import styles from './intelligence.module.css'

/**
 * Renders a list of advisory cards from a recommendations array.
 *
 * @param {Object[]} recommendations - Array of TurfRecommendation objects
 * @param {Object}   tokens          - Severity token map passed through to each card
 * @param {boolean}  showModule      - Whether cards show the module pill (default false)
 * @param {string}   emptyText       - Text to show when recommendations is empty (optional)
 */
export default function RecommendationList({
  recommendations,
  tokens,
  showModule = false,
  emptyText,
}) {
  if (!recommendations || recommendations.length === 0) {
    return emptyText ? <p className={styles.icEmpty}>{emptyText}</p> : null
  }

  return (
    <div className={styles.icList}>
      {recommendations.map(rec => (
        <IntelligenceCard
          key={rec.id}
          rec={rec}
          tokens={tokens}
          showModule={showModule}
        />
      ))}
    </div>
  )
}
