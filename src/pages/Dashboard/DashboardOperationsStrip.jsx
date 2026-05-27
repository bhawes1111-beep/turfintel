import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useSprayPrograms } from '../../utils/sprayPrograms/sprayProgramStore'
import { useSpraysData }    from '../../utils/sprays/spraysStore'
import {
  buildOperationsStrip,
  formatEstimatedCost,
} from '../../utils/dashboard/operationsStrip'
import styles from './DashboardOperationsStrip.module.css'

// Phase 7N (3/?) — Dashboard Operations Strip.
//
// Read-only roll-up over the existing spray-program stores. Renders
// five compact tiles (Today / This week / Overdue / Unscheduled /
// Est. week cost) + a notices block + per-tile "Review →" affordances
// that navigate to the existing surfaces. The strip itself never
// mutates: there are no edit / apply / link / save / commit / status
// affordances; only navigation via useNavigate, matching the Phase
// 7N.1 + 7N.2 pattern.
//
// Strict invariants:
//   - never calls a mutation store function
//   - never references /api/ directly
//   - the only affordances are per-tile "Review →" links
//   - no fix / apply / save / edit / link / status / commit labels

const SUBTITLE_COPY = 'Today and this week at a glance.'
const BOUNDARY_COPY = [
  'Read-only operations snapshot.',
  'Planned items do not create completed spray records.',
  'Inventory is not deducted from planned items.',
]

export default function DashboardOperationsStrip() {
  const navigate                       = useNavigate()
  const { items: inventoryProducts }   = useInventoryData()
  const { programs, itemsByProgramId } = useSprayPrograms()
  const { records: sprays }            = useSpraysData()

  const strip = useMemo(
    () => buildOperationsStrip({
      programs,
      itemsByProgramId,
      sprays,
      inventoryProducts,
    }),
    [programs, itemsByProgramId, sprays, inventoryProducts],
  )

  function openCalendar() {
    navigate('/spray', { state: { activeTab: 'Program Calendar' } })
  }
  function openPlanner() {
    navigate('/spray', { state: { activeTab: 'Program Planner' } })
  }

  const t = strip
  const weekEstLabel = t.week.estimatedItems > 0
    ? formatEstimatedCost(t.week.estimatedCost, t.currency)
    : '—'

  return (
    <section className={styles.strip} aria-label="Dashboard Operations Strip">
      <header className={styles.header}>
        <h3 className={styles.title}>Operations</h3>
        <p className={styles.subtitle}>{SUBTITLE_COPY}</p>
      </header>

      <div className={styles.tiles}>
        <Tile
          label="Today"
          value={t.today.plannedItems}
          sub={t.today.linkedCompleted > 0 ? `${t.today.linkedCompleted} linked` : null}
          tone={t.today.plannedItems > 0 ? 'attention' : 'muted'}
          routeLabel="Calendar"
          onReview={openCalendar}
        />
        <Tile
          label="This week"
          value={t.week.plannedItems}
          sub={t.week.linkedCompleted > 0 ? `${t.week.linkedCompleted} linked` : null}
          tone={t.week.plannedItems > 0 ? 'info' : 'muted'}
          routeLabel="Calendar"
          onReview={openCalendar}
        />
        <Tile
          label="Overdue"
          value={t.overdue.count}
          sub={t.overdue.count > 0 ? 'window passed, unlinked' : null}
          tone={t.overdue.count > 0 ? 'warn' : 'muted'}
          routeLabel="Planner"
          onReview={openPlanner}
        />
        <Tile
          label="Unscheduled"
          value={t.unscheduled.count}
          sub={t.unscheduled.count > 0 ? 'no planned window' : null}
          tone={t.unscheduled.count > 0 ? 'info' : 'muted'}
          routeLabel="Calendar"
          onReview={openCalendar}
        />
        <Tile
          label="Est. week cost"
          value={weekEstLabel}
          sub={t.week.estimatedItems > 0
            ? `${t.week.estimatedItems} of ${t.week.plannedItems} estimated`
            : null}
          tone="cost"
          emphasis
          routeLabel="Planner"
          onReview={openPlanner}
        />
      </div>

      {strip.notices.length > 0 && (
        <ul className={styles.noticeList}>
          {strip.notices.map((n, i) => (
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

      <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
    </section>
  )
}

function Tile({ label, value, sub, tone = 'neutral', emphasis = false, routeLabel, onReview }) {
  return (
    <div
      className={`${styles.tile} ${styles[`tile_${tone}`] ?? ''} ${emphasis ? styles.tileEmphasis : ''}`}
    >
      <div className={styles.tileValue}>{value ?? '—'}</div>
      <div className={styles.tileLabel}>{label}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
      {routeLabel && (
        <button
          type="button"
          className={styles.tileBtn}
          onClick={onReview}
          aria-label={`Review ${label} in ${routeLabel}`}
        >
          {routeLabel} →
        </button>
      )}
    </div>
  )
}
