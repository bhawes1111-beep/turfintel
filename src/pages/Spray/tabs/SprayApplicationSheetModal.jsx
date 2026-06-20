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

import { useMemo, useState } from 'react'
import styles from './SprayApplicationSheetModal.module.css'
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'
// Phase S.7b.2 — Chemical edit mode uses the existing patchSpray()
// helper. The worker's PATCH /api/sprays/:id now accepts a `products`
// payload that triggers replace-and-resnapshot + inventory adjust.
import { patchSpray } from '../../../utils/sprays/spraysStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { useAuth } from '../../../context/AuthContext'
// Phase S.7b.3 — Real product picker. Same shared component
// BuildSpraySheet uses, so added/edited rows carry inventoryItemId
// + productCatalogId out of the gate (S.7b.2 backend can then
// reverse old inventory + deduct new inventory + refresh snapshots).
import SprayProductPicker, {
  mapInventoryItemToProductRow,
} from './SprayProductPicker'

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
  // Phase S.7b.2 — Hooks first, then guard. React requires the hooks
  // order to be stable so the early-null return must follow hook calls.
  const toast = useToast()
  const { can } = useAuth()
  const canEditSprays = can('canEditSprays')
  const [editMode, setEditMode]   = useState(false)
  const [draftRows, setDraftRows] = useState(() => [])
  const [editReason, setEditReason] = useState('')
  const [busy, setBusy] = useState(false)

  const ni = recordNeedsInfo(record)
  const c  = record?.conditions ?? {}
  const products = useMemo(
    () => (Array.isArray(record?.products) ? record.products : []),
    [record?.products],
  )
  const areas    = Array.isArray(record?.areas) ? record.areas : []

  if (!record) return null

  function startEditingChemicals() {
    setDraftRows(products.map(p => ({
      id:                       p.id,
      name:                     p.name ?? '',
      type:                     p.type ?? '',
      rate:                     p.rate ?? '',
      unit:                     p.unit ?? '',
      quantityUsed:             p.quantityUsed ?? '',
      inventoryItemId:          p.inventoryItemId ?? null,
      productCatalogId:         p.productCatalogId ?? null,
      epaNumberSnapshot:        p.epaNumberSnapshot ?? null,
      activeIngredientsSnapshot: p.activeIngredientsSnapshot ?? null,
      productCostSnapshot:      p.productCostSnapshot ?? null,
      productCostUnitSnapshot:  p.productCostUnitSnapshot ?? null,
      totalCostSnapshot:        p.totalCostSnapshot ?? null,
    })))
    setEditReason('')
    setEditMode(true)
  }

  function cancelEditingChemicals() {
    setEditMode(false)
    setDraftRows([])
    setEditReason('')
  }

  function patchDraftRow(i, patch) {
    setDraftRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function addDraftRow() {
    setDraftRows(prev => [...prev, {
      name: '', type: '', rate: '', unit: '', quantityUsed: '',
      inventoryItemId: null, productCatalogId: null,
      epaNumberSnapshot: null, activeIngredientsSnapshot: null,
      productCostSnapshot: null, productCostUnitSnapshot: null,
      totalCostSnapshot: null,
    }])
  }
  function removeDraftRow(i) {
    setDraftRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSaveChemicals() {
    if (draftRows.length === 0) {
      toast.info?.('Completed spray must have at least one product row.')
      return
    }
    for (const r of draftRows) {
      if (!r.name || !String(r.name).trim()) {
        toast.info?.('Each product row needs a name.')
        return
      }
      if (r.quantityUsed !== '' && r.quantityUsed != null && Number.isNaN(Number(r.quantityUsed))) {
        toast.info?.(`Quantity for "${r.name}" is not a number.`)
        return
      }
      if (r.rate !== '' && r.rate != null && Number.isNaN(Number(r.rate))) {
        toast.info?.(`Rate for "${r.name}" is not a number.`)
        return
      }
    }
    if (!editReason.trim()) {
      const proceed = window.confirm(
        'No reason for chemical change provided. Continue without an audit note?',
      )
      if (!proceed) return
    }
    setBusy(true)
    try {
      const payload = {
        products: draftRows.map(r => ({
          id:                       r.id,
          name:                     String(r.name).trim(),
          type:                     r.type || null,
          rate:                     r.rate === '' ? null : Number(r.rate),
          unit:                     r.unit || null,
          quantityUsed:             r.quantityUsed === '' ? null : Number(r.quantityUsed),
          inventoryItemId:          r.inventoryItemId,
          productCatalogId:         r.productCatalogId,
          epaNumberSnapshot:        r.epaNumberSnapshot,
          activeIngredientsSnapshot: r.activeIngredientsSnapshot,
          productCostSnapshot:      r.productCostSnapshot == null ? null : Number(r.productCostSnapshot),
          productCostUnitSnapshot:  r.productCostUnitSnapshot,
          totalCostSnapshot:        r.totalCostSnapshot == null ? null : Number(r.totalCostSnapshot),
        })),
      }
      if (editReason.trim()) payload.editReason = editReason.trim()
      await patchSpray(record.id, payload)
      toast.success?.(`Updated chemicals for spray on ${record.date}`)
      setEditMode(false)
      setDraftRows([])
      setEditReason('')
    } catch (err) {
      toast.error?.(`Update failed: ${err.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !busy) onClose?.()
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
            {canEdit && !editMode && (
              <button type="button" className={styles.btnPrimary} onClick={() => onEdit?.(record)}>
                Edit
              </button>
            )}
            {/* Phase S.7b.2 — Chemical edit mode. Hidden for read-only
                users; disabled while a save is in flight. */}
            {canEdit && canEditSprays && !editMode && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={startEditingChemicals}
                aria-label="Edit chemicals on this spray"
              >
                Edit chemicals
              </button>
            )}
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={busy}
            >
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

          {/* Products — view OR edit mode */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Products / chemicals ({editMode ? draftRows.length : products.length})
            </h3>

            {editMode ? (
              <>
                {/* Phase S.7b.2 — Inline editor. Worker handles
                    inventory reversal+reapply + snapshot resolution +
                    total_cost_snapshot recompute. */}
                <div className={styles.chemEditWarn}>
                  Editing chemicals will reverse the inventory for the previous
                  product mix, apply the new mix, refresh snapshots, and
                  recalculate the record total cost. This change is logged in
                  the record's notes.
                </div>
                {draftRows.length === 0 ? (
                  <p className={styles.emptyMsg}>No product rows in this draft. Add one to continue.</p>
                ) : (
                  <ul className={styles.chemEditList}>
                    {draftRows.map((r, i) => (
                      <li key={i} className={styles.chemEditRow}>
                        <div className={styles.chemEditFieldGrid}>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Product</span>
                            {/* Phase S.7b.3 — Shared inventory-backed
                                picker. Selecting an item sets
                                inventoryItemId + productCatalogId +
                                name + type + unit in one go (via
                                mapInventoryItemToProductRow). Manual
                                rename available via the optional
                                name override below. */}
                            <SprayProductPicker
                              value={r.inventoryItemId ?? ''}
                              onChange={(inv) => {
                                const patch = mapInventoryItemToProductRow(inv)
                                if (patch) {
                                  // Selecting a new inventory item
                                  // resets the per-row snapshots so
                                  // the worker re-enriches them on
                                  // save (S.7b.2 contract).
                                  patchDraftRow(i, {
                                    ...patch,
                                    epaNumberSnapshot:        null,
                                    activeIngredientsSnapshot: null,
                                    productCostSnapshot:      null,
                                    productCostUnitSnapshot:  null,
                                  })
                                } else {
                                  patchDraftRow(i, { inventoryItemId: null, productCatalogId: null })
                                }
                              }}
                              ariaLabel={`Product ${i + 1} selection`}
                            />
                            {!r.inventoryItemId && (
                              <span className={styles.chemNoInventoryWarn} role="status">
                                Not linked to inventory — record will save but no inventory deduction.
                              </span>
                            )}
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Name override</span>
                            <input
                              type="text"
                              value={r.name}
                              onChange={e => patchDraftRow(i, { name: e.target.value })}
                              placeholder="Auto-filled from picker"
                              aria-label={`Product ${i + 1} name`}
                            />
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Type</span>
                            <input
                              type="text"
                              value={r.type ?? ''}
                              onChange={e => patchDraftRow(i, { type: e.target.value })}
                              placeholder="Fungicide…"
                              aria-label={`Product ${i + 1} type`}
                            />
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Rate</span>
                            <input
                              type="number"
                              step="0.01"
                              value={r.rate ?? ''}
                              onChange={e => patchDraftRow(i, { rate: e.target.value })}
                              aria-label={`Product ${i + 1} rate`}
                            />
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Rate unit</span>
                            <input
                              type="text"
                              value={r.unit ?? ''}
                              onChange={e => patchDraftRow(i, { unit: e.target.value })}
                              placeholder="oz/M…"
                              aria-label={`Product ${i + 1} rate unit`}
                            />
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Quantity used</span>
                            <input
                              type="number"
                              step="0.01"
                              value={r.quantityUsed ?? ''}
                              onChange={e => patchDraftRow(i, { quantityUsed: e.target.value })}
                              aria-label={`Product ${i + 1} quantity used`}
                            />
                          </label>
                          <label className={styles.chemEditField}>
                            <span className={styles.chemEditLabel}>Row total cost</span>
                            <input
                              type="number"
                              step="0.01"
                              value={r.totalCostSnapshot ?? ''}
                              onChange={e => patchDraftRow(i, { totalCostSnapshot: e.target.value })}
                              aria-label={`Product ${i + 1} row total cost`}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className={styles.chemRemoveBtn}
                          onClick={() => removeDraftRow(i)}
                          aria-label={`Remove product ${i + 1}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.chemEditAddRow}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={addDraftRow}
                    aria-label="Add another chemical row"
                  >
                    + Add chemical
                  </button>
                </div>

                <label className={styles.chemReasonField}>
                  <span className={styles.chemReasonLabel}>Reason for chemical change</span>
                  <textarea
                    rows={2}
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    placeholder="e.g. corrected rate for Daconil"
                    aria-label="Reason for chemical change"
                  />
                </label>

                <div className={styles.chemEditActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleSaveChemicals}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Save chemicals'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={cancelEditingChemicals}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : products.length === 0 ? (
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
