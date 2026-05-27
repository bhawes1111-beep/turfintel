import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventoryData }    from '../../utils/inventory/inventoryStore'
import { useProductCatalog }   from '../../utils/productCatalog/productCatalogStore'
import { useSprayPrograms }    from '../../utils/sprayPrograms/sprayProgramStore'
import { useSpraysData }       from '../../utils/sprays/spraysStore'
import { buildStewardshipAlerts } from '../../utils/dashboard/stewardshipAlerts'
import styles from './StewardshipAlerts.module.css'

// Phase 7N (1/?) — Dashboard Stewardship Alerts card.
//
// Read-only roll-up over the existing stores. Renders a compact list
// of "what needs review" items + a Review link per row. The card
// itself is purely render; the only action is navigation via
// useNavigate, which mirrors patterns already used by Phase 7J.2
// deep-linking from the Cost Basis Review panel.
//
// Strict invariants:
//   - never calls a mutation store function
//   - never references /api/ directly
//   - never imports or invokes any write verb
//   - the only affordance is a "Review" navigation link per row
//   - no fix / apply / commit / save buttons
//
// The actual rollup logic lives in the pure helper
// utils/dashboard/stewardshipAlerts.js; this component only chooses
// what to render and where to send the user.

const SUBTITLE_COPY = 'Setup and planning items that need review.'
const EMPTY_COPY    = 'No stewardship alerts right now.'

const SEVERITY_ICON = {
  attention: '⚠',
  warning:   '•',
  info:      '·',
}

export default function StewardshipAlerts() {
  const navigate                       = useNavigate()
  const { items: inventoryProducts }   = useInventoryData()
  const { products: catalogProducts }  = useProductCatalog()
  const { programs, itemsByProgramId } = useSprayPrograms()
  const { records: sprays }            = useSpraysData()

  const { alerts } = useMemo(
    () => buildStewardshipAlerts({
      inventoryProducts,
      catalogProducts,
      programs,
      itemsByProgramId,
      sprays,
    }),
    [inventoryProducts, catalogProducts, programs, itemsByProgramId, sprays],
  )

  function reviewAlert(alert) {
    if (!alert?.route) return
    navigate(alert.route, alert.routeState ? { state: alert.routeState } : undefined)
  }

  return (
    <section className={styles.card} aria-label="Stewardship Alerts">
      <header className={styles.header}>
        <h3 className={styles.title}>Stewardship Alerts</h3>
        <p className={styles.subtitle}>{SUBTITLE_COPY}</p>
      </header>

      {alerts.length === 0 ? (
        <p className={styles.empty}>{EMPTY_COPY}</p>
      ) : (
        <ul className={styles.list} aria-label="Stewardship alert list">
          {alerts.map(a => (
            <li
              key={a.id}
              className={`${styles.row} ${styles[`row_${a.severity}`] ?? ''}`}
            >
              <div className={styles.rowMain}>
                <div className={styles.rowHeader}>
                  <span
                    className={`${styles.icon} ${styles[`icon_${a.severity}`] ?? ''}`}
                    aria-hidden
                  >
                    {SEVERITY_ICON[a.severity] ?? '·'}
                  </span>
                  <span className={styles.rowTitle}>{a.title}</span>
                  <span className={styles.rowCount}>{a.count}</span>
                </div>
                <p className={styles.rowSummary}>{a.summary}</p>
              </div>
              {a.route && (
                <button
                  type="button"
                  className={styles.reviewBtn}
                  onClick={() => reviewAlert(a)}
                  aria-label={`Review ${a.title}`}
                >
                  Review →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
