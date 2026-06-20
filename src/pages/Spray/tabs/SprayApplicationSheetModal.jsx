// Phase S.7b — Read-only full spray application sheet.
//
// Opens when a completed spray row is clicked from the calendar
// workspace. Shows every field the worker exposes via rowToRecord:
//
//   • Header — area / date / status / applicator / start-end / Needs Info
//   • Application details — license, target pest, carrier/total volume,
//     total cost, notes
//   • Weather — temp, humidity, wind summary, soil temp
//   • Sprayed areas — full list with acreage
//   • Products / chemicals — name, type, rate, unit, quantity, EPA #,
//     active ingredients, REI/PHI, product cost snapshots, total cost
//   • Audit footer — record id, created / updated / deleted timestamps
//
// Actions:
//   • Edit — opens the existing S.5a.1 EditSprayRecordModal for safe
//     application fields (S.7b explicitly defers product editing —
//     see PHASE-S.7b audit note for the inventory-ledger gap).
//   • Close
//
// All chrome is read-only. Permission for the Edit affordance is
// driven by `canEdit` prop from the parent (calendar workspace).

import styles from './SprayApplicationSheetModal.module.css'
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'

function fmt(v, fallback = '—') {
  if (v == null) return fallback
  if (typeof v === 'string' && v.trim() === '') return fallback
  return v
}

function fmtMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `$${Number(v).toFixed(2)}`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString()
  } catch { return iso }
}

export default function SprayApplicationSheetModal({
  record,
  canEdit = false,
  onEdit,
  onClose,
}) {
  if (!record) return null

  const ni = recordNeedsInfo(record)
  const c  = record.conditions ?? {}
  const products = Array.isArray(record.products) ? record.products : []
  const areas    = Array.isArray(record.areas)    ? record.areas    : []

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Spray application sheet"
      onClick={handleBackdrop}
    >
      <div className={styles.modal} data-modal="spray-application-sheet">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 className={styles.headerTitle}>
              {fmt(record.area, 'Spray application')}
            </h2>
            <p className={styles.headerSub}>
              <span>{fmt(record.date)}</span>
              <span> · </span>
              <span className={styles.statusChip} data-status={record.status ?? 'unknown'}>
                {fmt(record.status)}
              </span>
              {record.applicator && (
                <>
                  <span> · </span>
                  <span>{record.applicator}</span>
                </>
              )}
              {(record.startTime || record.endTime) && (
                <>
                  <span> · </span>
                  <span>
                    {fmt(record.startTime)}{record.endTime ? ` → ${record.endTime}` : ''}
                  </span>
                </>
              )}
              {ni && (
                <>
                  <span> · </span>
                  <span className={styles.needsInfoBadge}>Needs info</span>
                </>
              )}
            </p>
          </div>
          <div className={styles.headerActions}>
            {canEdit && (
              <button type="button" className={styles.btnPrimary} onClick={() => onEdit?.(record)}>
                Edit
              </button>
            )}
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* Application details */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Application details</h3>
            <dl className={styles.kvGrid}>
              <KV label="Applicator license" value={fmt(record.applicatorLicense)} />
              <KV label="Target pest"        value={fmt(record.target ?? record.targetPest)} />
              <KV label="Carrier volume"     value={fmt(record.carrierVolume)} />
              <KV label="Total volume"       value={fmt(record.totalVolume)} />
              <KV label="Total cost"         value={fmtMoney(record.totalCostSnapshot)} />
              <KV label="REI"                value={record.rei != null ? `${record.rei} h` : '—'} />
              <KV label="PHI"                value={record.phi != null ? `${record.phi} d` : '—'} />
              <KV label="Holes"              value={fmt(record.holes)} />
            </dl>
            {record.notes && (
              <div className={styles.notesBlock}>
                <div className={styles.notesLabel}>Notes</div>
                <p className={styles.notesText}>{record.notes}</p>
              </div>
            )}
          </section>

          {/* Weather */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Conditions at application</h3>
            <dl className={styles.kvGrid}>
              <KV label="Temperature"   value={c.temp     != null ? `${c.temp}°F`     : '—'} />
              <KV label="Humidity"      value={c.humidity != null ? `${c.humidity}%`  : '—'} />
              <KV label="Wind speed"    value={c.windSpeedMph != null ? `${c.windSpeedMph} mph` : '—'} />
              <KV label="Wind direction" value={fmt(c.windDirection)} />
              <KV label="Wind notes"    value={fmt(c.wind)} />
              <KV label="Soil temp"     value={c.soilTemp != null ? `${c.soilTemp}°F` : '—'} />
            </dl>
          </section>

          {/* Areas */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Sprayed areas ({areas.length})</h3>
            {areas.length === 0 ? (
              <p className={styles.emptyMsg}>No area rows recorded.</p>
            ) : (
              <ul className={styles.areaList}>
                {areas.map(a => (
                  <li key={a.id ?? a.name} className={styles.areaRow}>
                    <span className={styles.areaName}>{fmt(a.name)}</span>
                    {a.acreage != null && (
                      <span className={styles.areaAcres}>{a.acreage} ac</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Products */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Products / chemicals ({products.length})</h3>
            {products.length === 0 ? (
              <p className={styles.emptyMsg}>No product rows recorded.</p>
            ) : (
              <div className={styles.productList}>
                {products.map(p => (
                  <article key={p.id ?? p.name} className={styles.productCard}>
                    <header className={styles.productHeader}>
                      <h4 className={styles.productName}>{fmt(p.name)}</h4>
                      {p.type && <span className={styles.productType}>{p.type}</span>}
                    </header>
                    <dl className={styles.productKvGrid}>
                      <KV label="Rate"     value={p.rate != null ? `${p.rate}` : '—'} />
                      <KV label="Rate unit" value={fmt(p.unit)} />
                      <KV label="Quantity used" value={p.quantityUsed != null ? p.quantityUsed : '—'} />
                      <KV label="EPA #"   value={fmt(p.epaNumberSnapshot)} />
                      <KV label="Active ingredients" value={fmt(p.activeIngredientsSnapshot)} />
                      <KV label="Product cost"
                          value={p.productCostSnapshot != null
                            ? `${fmtMoney(p.productCostSnapshot)}${p.productCostUnitSnapshot ? ` / ${p.productCostUnitSnapshot}` : ''}`
                            : '—'} />
                      <KV label="Total cost" value={fmtMoney(p.totalCostSnapshot)} />
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Audit footer */}
          <section className={styles.audit}>
            <span><strong>Record id:</strong> {record.id}</span>
            <span><strong>Created:</strong> {fmtDateTime(record.createdAt)}</span>
            <span><strong>Updated:</strong> {fmtDateTime(record.updatedAt)}</span>
            {record.deletedAt && (
              <span className={styles.auditDeleted}>
                <strong>Deleted:</strong> {fmtDateTime(record.deletedAt)} by {fmt(record.deletedBy, 'system')}
              </span>
            )}
          </section>

          {/* Phase S.7b note — Product/chemical editing intentionally
              deferred. See PHASE-S.7b audit note: worker updateSpray
              does not currently touch spray_products or inventory_usage,
              so adding a product editor here would silently desync
              compliance snapshots from inventory ledger entries. */}
          <p className={styles.editNote}>
            Editing product rows is not yet supported on a completed spray —
            inventory reversal/reapply requires an inventory ledger update
            that hasn't been wired yet. To correct a chemical mistake today,
            delete the record (inventory restores) and re-commit with the
            corrected mix.
          </p>
        </div>
      </div>
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  )
}
