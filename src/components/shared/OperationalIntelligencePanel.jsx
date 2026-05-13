// Phase 15 — Operational Intelligence panel.
//
// Briefing-style advisory card. Surfaces rules-based operational
// recommendations from the existing weather store + saved schedule
// templates. Never auto-applies anything; the supervisor stays in
// control. Drops in anywhere — currently used at the top of the
// Display Board's notes column.

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useWeather } from '../../utils/weather/useWeather'
import { useScheduleTemplatesData } from '../../utils/schedules/templatesStore'
import {
  computeRecommendations,
  computeSprayConditions,
} from '../../utils/recommendations/operationalRecommendations'
import styles from './OperationalIntelligencePanel.module.css'

export default function OperationalIntelligencePanel({ compact = false }) {
  const { current, forecast, loading } = useWeather()
  const { templates }                  = useScheduleTemplatesData()

  const recommendations = useMemo(
    () => computeRecommendations({ current, forecast, templates }),
    [current, forecast, templates],
  )

  const spray = useMemo(
    () => computeSprayConditions(current),
    [current],
  )

  // Surface the panel only when we have something to say. Loading +
  // entirely-default weather → render the empty state so the
  // supervisor knows it's wired and listening.

  const hasRecommendations = recommendations.length > 0

  return (
    <section className={`${styles.panel} ${compact ? styles.panelCompact : ''}`}>
      <header className={styles.header}>
        <h3 className={styles.title}>Operational Intelligence</h3>
        <span className={styles.hint}>
          Suggestions only · supervisor stays in control
        </span>
      </header>

      {/* ── Spray conditions sub-card ───────────────────────────────────── */}
      <div className={styles.spray} data-kind={spray.kind}>
        <div className={styles.sprayHeader}>
          <span className={styles.sprayLabel}>Spray Conditions</span>
          <span className={styles.sprayValue} data-kind={spray.kind}>
            {spray.label}
          </span>
        </div>
        <ul className={styles.sprayReasons}>
          {spray.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {/* ── Recommendations list ────────────────────────────────────────── */}
      {hasRecommendations ? (
        <ul className={styles.recList}>
          {recommendations.map(rec => (
            <li key={rec.id} className={styles.recRow} data-severity={rec.severity}>
              <div className={styles.recHead}>
                <span className={styles.recTitle}>{rec.title}</span>
                <span className={styles.recSeverity}>{rec.severity}</span>
              </div>
              <p className={styles.recDetail}>{rec.detail}</p>
              {rec.hint && <p className={styles.recHint}>{rec.hint}</p>}
              {(rec.templateName || rec.actionHref) && (
                <div className={styles.recActions}>
                  {rec.templateName && (
                    <span className={styles.recTemplate}>
                      Template: <strong>{rec.templateName}</strong>
                    </span>
                  )}
                  {rec.actionHref && (
                    <Link to={rec.actionHref} className={styles.recAction}>
                      {rec.actionLabel ?? 'Open'} →
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {loading
            ? 'Weather loading…'
            : 'Operations are clear — no advisories on the board.'}
        </p>
      )}
    </section>
  )
}
