import { useMemo } from 'react'
import SideDrawer from '../../../../components/primitives/SideDrawer/SideDrawer'
import styles from './ProgramCalendarApplicationDrawer.module.css'

// Phase 7R.4 — Read-only drawer for one grouped calendar event:
// program × date × target_area × application_type. The event's
// `items` array is the underlying spray_program_items collapsed
// into a single calendar chip; drilling into a product row opens
// the per-item drawer (ProgramCalendarItemDrawer).
//
// Strict invariants — same architecture rules as Phase 7H drawer:
//   - no edit / save / delete affordances anywhere
//   - never calls createSpray / recordInventoryUsage /
//     createCalendarEvent / setProgramItemCompletedLink /
//     createSprayProgramItem / updateSprayProgramItem /
//     deleteSprayProgramItem
//   - underlying spray_program_items are not mutated
//   - this is a read-side presentation only — no DB writes anywhere

const BOUNDARY_COPY = [
  'Application details are read-only.',
  'Grouping is a calendar presentation only — each product remains a separate planned item.',
  'Inventory is not deducted from planned items.',
]

const STATUS_LABEL = {
  planned:   'Planned',
  completed: 'Completed',
  skipped:   'Skipped',
  canceled:  'Canceled',
}

function deriveEventStatus(event) {
  const sb = event?.statusBreakdown
  if (!sb) return 'planned'
  const total = (sb.planned ?? 0) + (sb.completed ?? 0) + (sb.skipped ?? 0) + (sb.canceled ?? 0)
  if (total === 0) return 'planned'
  if (sb.completed === total) return 'completed'
  if (sb.canceled  === total) return 'canceled'
  if (sb.planned   > 0) return 'planned'
  if (sb.skipped   > 0) return 'skipped'
  return 'planned'
}

function formatDateLabel(start, end) {
  if (!start) return null
  if (!end || end === start) {
    const d = new Date(`${start}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return start
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  }
  return `${start} → ${end}`
}

function formatRate(item) {
  if (item?.rateValue == null) return null
  const unit = item.rateUnit ?? ''
  return `${item.rateValue}${unit ? ' ' + unit : ''}`
}

function formatCarrier(item) {
  if (item?.carrierVolumeValue == null) return null
  const unit = item.carrierVolumeUnit ?? ''
  return `${item.carrierVolumeValue}${unit ? ' ' + unit : ''}`
}

export default function ProgramCalendarApplicationDrawer({
  event,
  program,
  onSelectItem,
  onClose,
}) {
  const open = !!event

  const rolledStatus = useMemo(() => deriveEventStatus(event), [event])
  const dateLabel    = useMemo(
    () => event ? formatDateLabel(event.plannedStartDate, event.plannedEndDate) : null,
    [event],
  )

  if (!event) {
    return (
      <SideDrawer open={open} onClose={onClose} ariaLabel="Application details">
        <SideDrawer.Header title="Application" onClose={onClose} />
        <SideDrawer.Body />
      </SideDrawer>
    )
  }

  const typeSuffix = event.applicationType !== 'spray' ? ` ${event.typeLabel}` : ''
  const title    = `${event.title}${typeSuffix} Application`
  const subtitle = [
    event.programName,
    dateLabel,
  ].filter(Boolean).join(' · ')

  return (
    <SideDrawer open={open} onClose={onClose} ariaLabel={title}>
      <SideDrawer.Header
        title={title}
        subtitle={subtitle || null}
        status={
          <span className={`${styles.statusBadge} ${styles[`status_${rolledStatus}`] ?? ''}`}>
            {STATUS_LABEL[rolledStatus] ?? rolledStatus}
          </span>
        }
        onClose={onClose}
      />
      <SideDrawer.Body>
        <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>

        {/* Section A — Application Summary */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Application Summary</h3>
          <dl className={styles.kv}>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Area</dt>
              <dd className={styles.kvValue}>{event.targetArea ?? '—'}</dd>
            </div>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Program</dt>
              <dd className={styles.kvValue}>{event.programName ?? '—'}</dd>
            </div>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Date</dt>
              <dd className={styles.kvValue}>{dateLabel ?? '—'}</dd>
            </div>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Type</dt>
              <dd className={styles.kvValue}>{event.typeLabel}</dd>
            </div>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Status</dt>
              <dd className={styles.kvValue}>
                {STATUS_LABEL[rolledStatus] ?? rolledStatus}
                {' '}
                <span className={styles.statusBreakdown}>
                  ({event.statusBreakdown.completed} completed
                  {' / '}{event.statusBreakdown.planned} planned
                  {event.statusBreakdown.skipped  > 0 ? ` / ${event.statusBreakdown.skipped} skipped`   : ''}
                  {event.statusBreakdown.canceled > 0 ? ` / ${event.statusBreakdown.canceled} canceled` : ''}
                  )
                </span>
              </dd>
            </div>
            <div className={styles.kvRow}>
              <dt className={styles.kvLabel}>Product count</dt>
              <dd className={styles.kvValue}>{event.productCount}</dd>
            </div>
          </dl>
        </section>

        {/* Section B — Products */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Products in this application</h3>
          {event.items.length === 0
            ? <p className={styles.emptyNote}>No products linked to this application.</p>
            : (
              <table className={styles.productsTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Rate</th>
                    <th>Carrier</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {event.items.map((it) => {
                    const status = it.status ?? 'planned'
                    const rate    = formatRate(it)
                    const carrier = formatCarrier(it)
                    return (
                      <tr key={it.id ?? it.itemId}>
                        <td>
                          <button
                            type="button"
                            className={styles.productLink}
                            onClick={() => onSelectItem?.(it.itemId)}
                            aria-label={`Open product details for ${it.productName ?? it.displayLabel ?? 'item'}`}
                          >
                            {it.productName ?? it.displayLabel ?? '(unnamed product)'}
                          </button>
                          {it.hasCompletedLink && (
                            <span className={styles.linkedDot} title="Linked to a completed spray record" aria-hidden>✓</span>
                          )}
                        </td>
                        <td>{rate ?? '—'}</td>
                        <td>{carrier ?? '—'}</td>
                        <td>
                          <span className={`${styles.productStatus} ${styles[`status_${status}`] ?? ''}`}>
                            {STATUS_LABEL[status] ?? status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </section>

        {/* Section C — Notes */}
        {event.notes.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <ul className={styles.noteList}>
              {event.notes.map((n, i) => (
                <li key={i} className={styles.noteRow}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Section D — Nutrient Summary */}
        {event.nutrientSummary.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Nutrient Summary</h3>
            <ul className={styles.noteList}>
              {event.nutrientSummary.map((n, i) => (
                <li key={i} className={styles.noteRow}>{n}</li>
              ))}
            </ul>
          </section>
        )}
      </SideDrawer.Body>
      <SideDrawer.Footer>
        <button type="button" className={styles.footerBtn} onClick={onClose}>
          Close
        </button>
      </SideDrawer.Footer>
    </SideDrawer>
  )
}
