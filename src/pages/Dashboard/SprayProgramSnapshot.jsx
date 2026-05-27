import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useSprayPrograms } from '../../utils/sprayPrograms/sprayProgramStore'
import { useSpraysData }    from '../../utils/sprays/spraysStore'
import {
  buildSprayProgramSnapshot,
  formatEstimatedCost,
} from '../../utils/dashboard/sprayProgramSnapshot'
import styles from './SprayProgramSnapshot.module.css'

// Phase 7N (2/?) — Dashboard Spray Program Snapshot card.
//
// Read-only roll-up over the existing spray-program stores. Renders
// counts + a compact upcoming-items list + a "Review →" link to the
// Program Calendar. The card itself never mutates: there are no
// edit / apply / link / save / commit buttons; the only affordance
// is navigation via useNavigate, matching the Phase 7N.1 pattern.
//
// Strict invariants:
//   - never calls a mutation store function
//   - never references /api/ directly
//   - the only affordance is the per-card "Review →" link
//   - no fix / apply / save / edit / link affordances

const SUBTITLE_COPY = 'Upcoming planned applications and completion links.'
const EMPTY_UPCOMING_COPY = 'No upcoming planned items in the next week.'
const BOUNDARY_COPY = [
  'Read-only snapshot from planned spray programs.',
  'Planned items do not create completed spray records.',
  'Inventory is not deducted from planned items.',
]

const STATUS_LABEL = {
  planned:   'Planned',
  completed: 'Completed',
  skipped:   'Skipped',
  canceled:  'Canceled',
}

export default function SprayProgramSnapshot() {
  const navigate                       = useNavigate()
  const { items: inventoryProducts }   = useInventoryData()
  const { programs, itemsByProgramId } = useSprayPrograms()
  const { records: sprays }            = useSpraysData()

  const snapshot = useMemo(
    () => buildSprayProgramSnapshot({
      programs,
      itemsByProgramId,
      sprays,
      inventoryProducts,
    }),
    [programs, itemsByProgramId, sprays, inventoryProducts],
  )

  const t = snapshot.totals
  const upcoming = snapshot.upcoming
  const visible  = upcoming.slice(0, 5)
  const overflow = upcoming.length - visible.length

  function openProgramCalendar() {
    navigate('/spray', { state: { activeTab: 'Program Calendar' } })
  }

  return (
    <section className={styles.card} aria-label="Spray Program Snapshot">
      <header className={styles.header}>
        <h3 className={styles.title}>Spray Program Snapshot</h3>
        <p className={styles.subtitle}>{SUBTITLE_COPY}</p>
      </header>

      <div className={styles.tiles} aria-label="Spray program totals">
        <Tile label="Upcoming"
          value={t.upcomingItems}
          tone={t.upcomingItems > 0 ? 'attention' : 'muted'} />
        <Tile label="Linked completed"
          value={t.linkedCompletedItems} tone="ok" />
        <Tile label="Unlinked planned"
          value={t.unlinkedItems}
          tone={t.unlinkedItems > 0 ? 'info' : 'muted'} />
        <Tile label="Stale links"
          value={t.staleLinks}
          tone={t.staleLinks > 0 ? 'warn' : 'muted'} />
        <Tile label="Est. upcoming cost"
          value={t.estimatedItems > 0
            ? formatEstimatedCost(t.estimatedCost, snapshot.currency)
            : '—'}
          tone="cost"
          emphasis />
        <Tile label="Missing cost"
          value={t.missingCostItems}
          tone={t.missingCostItems > 0 ? 'warn' : 'muted'} />
      </div>

      <div className={styles.upcomingSection}>
        <h4 className={styles.sectionLabel}>Upcoming (next 7 days)</h4>
        {visible.length === 0 ? (
          <p className={styles.empty}>{EMPTY_UPCOMING_COPY}</p>
        ) : (
          <ul className={styles.upcomingList}>
            {visible.map(row => (
              <li key={`${row.programId}-${row.itemId}`} className={styles.upcomingRow}>
                <div className={styles.upcomingMain}>
                  <div className={styles.upcomingTitleRow}>
                    <span className={styles.upcomingProduct}>
                      {row.productName ?? '(no product)'}
                    </span>
                    <span className={`${styles.statusBadge} ${styles[`status_${row.status}`] ?? ''}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    {row.hasCompletedLink && (
                      <span className={styles.linkedChip} title="Linked to a completed spray record">
                        ✓ Linked
                      </span>
                    )}
                  </div>
                  <div className={styles.upcomingMeta}>
                    {row.programName && <span>📋 {row.programName}</span>}
                    {row.targetArea  && <span>📍 {row.targetArea}</span>}
                    {row.rangeLabel  && <span>🗓 {row.rangeLabel}</span>}
                  </div>
                </div>
                {row.estimatedCost != null && (
                  <span className={styles.upcomingCost}>
                    {formatEstimatedCost(row.estimatedCost, snapshot.currency)}
                  </span>
                )}
              </li>
            ))}
            {overflow > 0 && (
              <li className={styles.overflow}>
                +{overflow} more upcoming item{overflow !== 1 ? 's' : ''}.
              </li>
            )}
          </ul>
        )}
      </div>

      {snapshot.notices.length > 0 && (
        <ul className={styles.noticeList}>
          {snapshot.notices.map((n, i) => (
            <li
              key={`${n.type}-${n.label}-${i}`}
              className={`${styles.notice} ${styles[`notice_${n.type}`] ?? ''}`}
            >
              <span className={styles.noticeIcon} aria-hidden>
                {n.type === 'warning' ? '⚠' : '·'}
              </span>
              <span className={styles.noticeText}>
                <strong>{n.label}:</strong> {n.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.reviewBtn}
          onClick={openProgramCalendar}
          aria-label="Review Spray Program Calendar"
        >
          Review →
        </button>
      </div>

      <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
    </section>
  )
}

function Tile({ label, value, tone = 'neutral', emphasis = false }) {
  return (
    <div
      className={`${styles.tile} ${styles[`tile_${tone}`] ?? ''} ${emphasis ? styles.tileEmphasis : ''}`}
    >
      <div className={styles.tileValue}>{value ?? '—'}</div>
      <div className={styles.tileLabel}>{label}</div>
    </div>
  )
}
