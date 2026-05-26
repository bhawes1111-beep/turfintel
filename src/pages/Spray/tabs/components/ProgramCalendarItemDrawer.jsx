import { useMemo } from 'react'
import SideDrawer from '../../../../components/primitives/SideDrawer'
import { resolveProgramItemIntel } from '../../../../utils/sprayPrograms/resolveProgramItemIntel'
import { buildPlanActualComparison } from '../../../../utils/sprayPrograms/planActualComparison'
import { getCatalogProductById } from '../../../../utils/productCatalog/productCatalogStore'
import styles from './ProgramCalendarItemDrawer.module.css'

// Phase 7H (2/?) — Read-only detail drawer for a planned program item
// surfaced from the calendar grid / agenda / unscheduled bucket.
//
// Strict invariants:
//   - no edit / save / delete affordances anywhere
//   - never calls createSpray / recordInventoryUsage /
//     createCalendarEvent / setProgramItemCompletedLink /
//     createSprayProgramItem / updateSprayProgramItem /
//     deleteSprayProgramItem
//   - never mutates product_catalog
//   - reuses Phase 7C.1/6 resolveSprayProductIntel via
//     resolveProgramItemIntel — no parallel intelligence logic
//   - reuses Phase 7F.5 planActualComparison — no parallel
//     comparison logic
//
// Inputs:
//   - item            spray_program_items row (planner-shape)
//   - program         { id, name, status, ... } resolved from store
//   - linkedSpray     spray_records row or null when stale / unlinked
//   - intelContext    { inventoryProducts, catalogProducts,
//                       labelsByItemId } — same shape the planner
//                       passes elsewhere
//   - inventoryItems  inventoryStore items[]
//   - onClose         drawer close handler

const BOUNDARY_COPY = [
  'Calendar details are read-only.',
  'This view does not create completed spray records.',
  'Inventory is not deducted from planned items.',
]

const STATUS_LABEL = {
  planned:   'Planned',
  completed: 'Completed',
  skipped:   'Skipped',
  canceled:  'Canceled',
}

export default function ProgramCalendarItemDrawer({
  item,
  program,
  linkedSpray,
  intelContext,
  inventoryItems = [],
  onClose,
}) {
  const open = !!item

  // Read-only derivations only — no setState chains, no fetches.
  const intel = useMemo(
    () => (item ? resolveProgramItemIntel(item, intelContext ?? {}) : null),
    [item, intelContext],
  )
  const comparison = useMemo(
    () => (item && linkedSpray ? buildPlanActualComparison(item, linkedSpray) : null),
    [item, linkedSpray],
  )
  // Inventory-side summary resolution (read-only against the store
  // cache the parent already subscribed to).
  const linkedInventory = useMemo(() => {
    if (!item?.inventoryItemId) return null
    return inventoryItems.find(i => i.id === item.inventoryItemId) ?? null
  }, [item, inventoryItems])
  // Catalog-side summary resolution.
  const linkedCatalog = useMemo(() => {
    const id = item?.productCatalogId
    if (!id) return null
    return getCatalogProductById(id) ?? null
  }, [item])

  if (!open) return null

  const window = formatPlannedWindow(item)
  const hasIntel = intel && intel.source && intel.source !== 'none'

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      ariaLabel="Calendar item details"
    >
      <SideDrawer.Header
        title={item.productName ?? '(no product)'}
        subtitle={[program?.name, item.targetArea].filter(Boolean).join(' · ') || null}
        status={
          <span className={`${styles.statusBadge} ${styles[`status_${item.status}`] ?? ''}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        }
        onClose={onClose}
      />
      <SideDrawer.Body>
        {/* Read-only boundary banner. */}
        <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>

        {/* Planned details */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Planned details</h3>
          <dl className={styles.kv}>
            <KV label="Program"        value={program?.name ?? '—'} />
            <KV label="Target area"    value={item.targetArea ?? '—'} />
            <KV label="Planned window" value={window || '—'} />
            <KV label="Rate"           value={formatRate(item)} />
            <KV label="Carrier"        value={formatCarrier(item)} />
            <KV label="Status"         value={STATUS_LABEL[item.status] ?? item.status} />
          </dl>
          {item.applicationNotes && (
            <p className={styles.notes}>{item.applicationNotes}</p>
          )}
        </section>

        {/* Linked completed spray */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Linked completed record</h3>
          {item.linkedSprayRecordId && linkedSpray && (
            <div className={styles.linkedRecordCard}>
              <div className={styles.linkedRecordTitle}>
                {linkedSpray.applicationName ?? '(unnamed spray)'}
              </div>
              <div className={styles.linkedRecordMeta}>
                {[linkedSpray.date, linkedSpray.area].filter(Boolean).join(' · ')}
                {Array.isArray(linkedSpray.products) && linkedSpray.products.length > 0 &&
                  ` · ${linkedSpray.products.length} product${linkedSpray.products.length !== 1 ? 's' : ''}`}
              </div>
              <p className={styles.linkedRecordBoundary}>
                Completed records remain unchanged.
              </p>
            </div>
          )}
          {item.linkedSprayRecordId && !linkedSpray && (
            <div className={styles.linkedRecordStale}>
              <strong>Linked spray record could not be resolved.</strong>
              <div className={styles.staleFk}>linked id: <span className={styles.fkMono}>{item.linkedSprayRecordId}</span></div>
              <p className={styles.linkedRecordBoundary}>
                The link does not create or modify a spray record.
              </p>
            </div>
          )}
          {!item.linkedSprayRecordId && (
            <p className={styles.empty}>No completed spray linked.</p>
          )}
        </section>

        {/* Plan vs Actual comparison */}
        {comparison?.linked && comparison.summary?.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Plan vs Actual</h3>
            <ul className={styles.comparisonList}>
              {comparison.summary.map((n, i) => (
                <li key={`${n.label}-${i}`} className={styles.comparisonItem}>
                  <span className={styles.comparisonLabel}>{n.label}</span>
                  <span className={`${styles.comparisonValue} ${toneFor(n.value)}`}>
                    {n.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Catalog intelligence */}
        {(hasIntel || linkedCatalog) && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Catalog intelligence</h3>
            {linkedCatalog && (
              <div className={styles.linkSummary}>
                <div className={styles.linkSummaryTitle}>{linkedCatalog.productName}</div>
                <div className={styles.linkSummarySub}>
                  {[linkedCatalog.category, linkedCatalog.brandOwner].filter(Boolean).join(' · ')}
                  {linkedCatalog.epaNumber && ` · EPA ${linkedCatalog.epaNumber}`}
                </div>
              </div>
            )}
            {hasIntel && (
              <IntelChips intel={intel} />
            )}
            <p className={styles.boundaryNote}>
              Catalog intelligence is read-only.
            </p>
          </section>
        )}

        {/* Inventory link summary */}
        {linkedInventory && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Inventory link</h3>
            <div className={styles.linkSummary}>
              <div className={styles.linkSummaryTitle}>{linkedInventory.name}</div>
              <div className={styles.linkSummarySub}>
                {[
                  linkedInventory.category || linkedInventory.kind,
                  linkedInventory.location,
                  linkedInventory.vendor,
                ].filter(Boolean).join(' · ')}
                {linkedInventory.quantity != null && (
                  <> · {linkedInventory.quantity} {linkedInventory.unit ?? ''}</>
                )}
              </div>
            </div>
            <p className={styles.boundaryNote}>
              Inventory links are for planning only and do not deduct stock.
            </p>
          </section>
        )}
      </SideDrawer.Body>
    </SideDrawer>
  )
}

// ── Atoms ────────────────────────────────────────────────────────────────
function KV({ label, value }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  )
}

function IntelChips({ intel }) {
  const chips = []
  if (intel.fracGroup) chips.push(['FRAC', intel.fracGroup, styles.chipFrac])
  if (intel.hracGroup) chips.push(['HRAC', intel.hracGroup, styles.chipHrac])
  if (intel.iracGroup) chips.push(['IRAC', intel.iracGroup, styles.chipIrac])
  if (intel.pgrClass)  chips.push(['PGR',  intel.pgrClass,  styles.chipPgr])

  const showSignal = intel.signalWord
    && /^(warning|danger)$/i.test(String(intel.signalWord).trim())

  if (chips.length === 0 && intel.reiHours == null && !intel.restrictedUse && !showSignal) {
    return null
  }

  return (
    <div className={styles.chipRow}>
      {chips.map(([label, value, cls]) => (
        <span key={label} className={`${styles.chip} ${cls}`}>
          <span className={styles.chipLabel}>{label}</span>{value}
        </span>
      ))}
      {intel.reiHours != null && (
        <span className={`${styles.chip} ${styles.chipRei}`}>
          <span className={styles.chipLabel}>REI</span>{intel.reiHours}h
        </span>
      )}
      {intel.restrictedUse && (
        <span className={`${styles.chip} ${styles.chipRup}`}>RUP</span>
      )}
      {showSignal && (
        <span className={`${styles.chip} ${styles.chipSignal}`}>{intel.signalWord}</span>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────
function formatPlannedWindow(item) {
  if (!item) return ''
  const s = item.plannedStartDate
  const e = item.plannedEndDate
  if (s && e) return s === e ? s : `${s} → ${e}`
  if (s) return s
  if (e) return e
  if (item.plannedWindowLabel) return item.plannedWindowLabel
  return ''
}
function formatRate(item) {
  if (item?.rateValue == null) return '—'
  const unit = item.rateUnit ?? ''
  return `${item.rateValue} ${unit}`.trim()
}
function formatCarrier(item) {
  if (item?.carrierVolumeValue == null) return '—'
  const unit = item.carrierVolumeUnit ?? ''
  return `${item.carrierVolumeValue} ${unit}`.trim()
}
function toneFor(value) {
  if (value == null) return ''
  const s = String(value).toLowerCase()
  if (s.includes('inside planned window'))       return styles.tone_ok
  if (s.includes('appears in completed record')) return styles.tone_ok
  if (s.includes('matches recorded'))            return styles.tone_ok
  if (s.includes('outside planned window'))      return styles.tone_warn
  if (s.includes('different recorded product'))  return styles.tone_warn
  if (s.includes('differs from recorded'))       return styles.tone_warn
  if (s.includes('not compared') || s.includes('no '))
    return styles.tone_muted
  return ''
}
