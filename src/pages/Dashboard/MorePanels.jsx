// Phase 6A.2 — "More dashboard panels" collapsible.
//
// Holds the demoted dashboard cards behind a native <details> so the
// morning view is calm by default but nothing is lost. Cards are
// passed in as children — this component owns layout + collapse only,
// not data.
//
// Native <details> means: no JS state, no a11y wiring needed, full
// keyboard support, browser-remembered open/closed state per session.

import styles from './MorePanels.module.css'

export default function MorePanels({ children }) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        <span className={styles.summaryLabel}>More dashboard panels</span>
        <span className={styles.summaryHint}>
          Alerts · weather detail · irrigation detail · activity · notes · applications
        </span>
        <span className={styles.chev} aria-hidden="true">▾</span>
      </summary>
      <div className={styles.panels}>
        {children}
      </div>
    </details>
  )
}
