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
  useSprayProductOptions,
} from './SprayProductPicker'
// Phase S.7b.6 — Shared rate math + unit option sets. Same module
// BuildSpraySheet will eventually consume so commit-time math and
// edit-time math stay aligned.
import {
  RATE_UNIT_OPTS,
  TOTAL_USED_UNIT_OPTS,
  rateToTotalUsed,
  totalUsedToRate,
  formatRateLabel,
  sumAcresFromRecord,
  normalizeRateUnit,
  roundDisplay,
} from '../../../utils/sprays/rateMath'

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

  // Phase S.7b.5 — Live inventory lookup so each draft row can show
  // the actual remaining stock for its picked product. Same hook the
  // picker uses; sharing it means there's only one filtered list in
  // memory.
  const inventoryItems = useSprayProductOptions()
  const inventoryById = useMemo(() => {
    const map = new Map()
    for (const it of inventoryItems) map.set(it.id, it)
    return map
  }, [inventoryItems])

  // Phase S.7b.6 — Acreage anchor for bidirectional rate math.
  // Sums every area's acreage on the saved record. When 0, the
  // editor disables auto-calc and shows a warning.
  const sprayedAcres = useMemo(() => sumAcresFromRecord(record), [record])

  if (!record) return null

  // Phase S.7b.5 — Per-row inventory + validation status.
  // Returns one of:
  //   { kind: 'no-link' }                                  — no inventoryItemId
  //   { kind: 'qty-blank' }                                — link, blank totalUsed
  //   { kind: 'qty-invalid' }                              — link, NaN totalUsed
  //   { kind: 'qty-nonpositive' }                          — link, ≤ 0
  //   { kind: 'ok', qty, unit, available, low, outOfStock } — link, valid
  // Phase S.7b.6 — Reads r.totalUsed (renamed from r.quantityUsed
  // in the editor's draft state). Save handler maps totalUsed →
  // quantityUsed in the payload (worker contract unchanged).
  function rowStatus(r) {
    if (!r?.inventoryItemId) return { kind: 'no-link' }
    const totalUsed = r.totalUsed
    if (totalUsed === '' || totalUsed == null) return { kind: 'qty-blank' }
    const qty = Number(totalUsed)
    if (Number.isNaN(qty)) return { kind: 'qty-invalid' }
    if (qty <= 0) return { kind: 'qty-nonpositive' }
    const inv       = inventoryById.get(r.inventoryItemId)
    const available = inv?.quantity ?? null
    return {
      kind:        'ok',
      qty,
      unit:        r.unit || inv?.unit || '',
      available,
      low:         available != null && available > 0 && available < qty,
      outOfStock:  available != null && available <= 0,
    }
  }

  function startEditingChemicals() {
    setDraftRows(products.map(p => {
      // Phase S.7b.6 — Existing records store rate as a label string
      // ("4 oz / acre") via BuildSpraySheet's formatRateLabel. Parse
      // back to a number + rateUnit so the editor can show editable
      // fields. If the parse fails, keep whatever string was there as
      // a fallback so the data isn't lost.
      let parsedRate    = ''
      let parsedRateUnit = 'oz_per_acre'
      if (p.rate != null && p.rate !== '') {
        const s = String(p.rate).trim()
        const m = s.match(/^([\d.]+)\s*(.*)$/)
        if (m) {
          parsedRate = m[1]
          const tail = m[2].trim().toLowerCase()
          const found = RATE_UNIT_OPTS.find(o => o.label.toLowerCase() === tail)
          if (found) parsedRateUnit = found.value
        } else {
          parsedRate = s
        }
      }
      return {
        id:                       p.id,
        name:                     p.name ?? '',
        type:                     p.type ?? '',
        rate:                     parsedRate,
        rateUnit:                 parsedRateUnit,
        // Total used / quantity used. Renamed for the UI but the
        // payload field name stays quantityUsed (worker contract).
        totalUsed:                p.quantityUsed ?? '',
        unit:                     p.unit ?? '',
        inventoryItemId:          p.inventoryItemId ?? null,
        productCatalogId:         p.productCatalogId ?? null,
        epaNumberSnapshot:        p.epaNumberSnapshot ?? null,
        activeIngredientsSnapshot: p.activeIngredientsSnapshot ?? null,
        productCostSnapshot:      p.productCostSnapshot ?? null,
        productCostUnitSnapshot:  p.productCostUnitSnapshot ?? null,
        totalCostSnapshot:        p.totalCostSnapshot ?? null,
        // Phase S.7b.6 — Tracks which of {totalUsed, rate} the user
        // most recently edited. Null on load (means "no auto-calc
        // happened yet"). Bidirectional math only fires after the
        // user actively edits one field — the seed values are left
        // alone so the editor mirrors the saved record.
        lastEdited:               null,
      }
    }))
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

  // Phase S.7b.6 — Bidirectional math driven by sprayedAcres + the
  // row's lastEdited tracker. Edits to totalUsed → recompute rate.
  // Edits to rate → recompute totalUsed. Either is skipped when
  // sprayedAcres is 0 (no source of truth for the conversion).
  function editTotalUsed(i, value) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, totalUsed: value, lastEdited: 'totalUsed' }
      if (sprayedAcres > 0) {
        const num = Number(value)
        if (value === '' || !Number.isFinite(num) || num <= 0) {
          next.rate = ''
        } else {
          next.rate = String(roundDisplay(
            totalUsedToRate(num, next.rateUnit, sprayedAcres),
            3,
          ))
        }
      }
      return next
    }))
  }

  function editRate(i, value) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, rate: value, lastEdited: 'rate' }
      if (sprayedAcres > 0) {
        const num = Number(value)
        if (value === '' || !Number.isFinite(num) || num <= 0) {
          next.totalUsed = ''
        } else {
          next.totalUsed = String(roundDisplay(
            rateToTotalUsed(num, next.rateUnit, sprayedAcres),
            2,
          ))
        }
      }
      return next
    }))
  }

  // Rate-unit change rebases whichever field was last touched. If the
  // user last edited rate, recompute totalUsed under the new unit.
  // If they last edited totalUsed, recompute rate. If neither has
  // been edited yet (just loaded), leave both values alone.
  function editRateUnit(i, newUnit) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, rateUnit: newUnit }
      if (sprayedAcres > 0) {
        if (r.lastEdited === 'rate' && r.rate !== '' && Number.isFinite(Number(r.rate))) {
          next.totalUsed = String(roundDisplay(
            rateToTotalUsed(Number(r.rate), newUnit, sprayedAcres), 2,
          ))
        } else if (r.lastEdited === 'totalUsed' && r.totalUsed !== '' && Number.isFinite(Number(r.totalUsed))) {
          next.rate = String(roundDisplay(
            totalUsedToRate(Number(r.totalUsed), newUnit, sprayedAcres), 3,
          ))
        }
      }
      return next
    }))
  }
  function addDraftRow() {
    setDraftRows(prev => [...prev, {
      // Phase S.7b.6 — New rows seed empty. quantityUsed is renamed
      // to totalUsed in-editor; payload still sends quantityUsed.
      name: '', type: '',
      rate: '', rateUnit: 'oz_per_acre',
      totalUsed: '', unit: 'oz',
      inventoryItemId: null, productCatalogId: null,
      epaNumberSnapshot: null, activeIngredientsSnapshot: null,
      productCostSnapshot: null, productCostUnitSnapshot: null,
      totalCostSnapshot: null,
      lastEdited: null,
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
    // Phase S.7b.5 — Quantity validation for inventory-linked rows.
    // An inventory-linked row that saves with blank, zero, negative,
    // or non-numeric quantityUsed will silently skip inventory
    // deduction at the worker level. Block save now so the user sees
    // a clean error rather than a "saved" record that left inventory
    // untouched.
    for (const r of draftRows) {
      if (!r.name || !String(r.name).trim()) {
        toast.info?.('Each product row needs a name.')
        return
      }
      if (r.rate !== '' && r.rate != null && Number.isNaN(Number(r.rate))) {
        toast.error?.(`Rate for "${r.name}" must be a number.`)
        return
      }
      if (r.totalUsed !== '' && r.totalUsed != null && Number.isNaN(Number(r.totalUsed))) {
        toast.error?.(`Total used for "${r.name}" must be a number.`)
        return
      }
      // Phase S.7b.6 — Rate unit required when a rate is provided.
      if (r.rate !== '' && r.rate != null && !r.rateUnit) {
        toast.error?.(`Select a rate unit for "${r.name}".`)
        return
      }
      const status = rowStatus(r)
      if (status.kind === 'qty-invalid') {
        toast.error?.(`Total used for "${r.name}" must be a number.`)
        return
      }
      if (status.kind === 'qty-blank') {
        toast.error?.(`Enter total used or rate for "${r.name}" (linked to inventory).`)
        return
      }
      if (status.kind === 'qty-nonpositive') {
        toast.error?.(`Total used for "${r.name}" must be greater than 0.`)
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
          // Phase S.7b.6 — Save the rate as a formatted label string
          // ("4 oz / acre") to match BuildSpraySheet's commit-time
          // shape (formatRateLabel). The worker writes spray_products.rate
          // as text so the read mapper renders the same string everywhere.
          rate:                     r.rate === '' || r.rate == null ? null : formatRateLabel(r.rate, r.rateUnit),
          rateUnit:                 r.rateUnit ?? null,
          // totalUsed → quantityUsed mapping (worker contract unchanged).
          quantityUsed:             r.totalUsed === '' || r.totalUsed == null ? null : Number(r.totalUsed),
          unit:                     r.unit || null,
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
                {/* Phase S.7b.6 — Acreage anchor. Drives bidirectional
                    rate math across every chemical row. Read-only;
                    sourced from the saved record's areas. */}
                <div className={sprayedAcres > 0 ? styles.chemAcresBanner : styles.chemAcresBannerWarn} role="status">
                  {sprayedAcres > 0
                    ? <>Total area sprayed: <strong>{roundDisplay(sprayedAcres, 2)} acres</strong> · enter Total Used OR Rate; the other auto-calculates.</>
                    : <>Area acreage unavailable — rate math cannot auto-calculate. Enter Total Used directly.</>
                  }
                </div>
                {draftRows.length === 0 ? (
                  <p className={styles.emptyMsg}>No product rows in this draft. Add one to continue.</p>
                ) : (
                  <ul className={styles.chemEditList}>
                    {draftRows.map((r, i) => (
                      <li key={i} className={styles.chemEditCard}>
                        {/* ── Top row: product picker + type + remove ── */}
                        <div className={styles.chemTopRow}>
                          <label className={styles.chemTopField}>
                            <span className={styles.chemEditLabel}>Product</span>
                            <SprayProductPicker
                              value={r.inventoryItemId ?? ''}
                              onChange={(inv) => {
                                const patch = mapInventoryItemToProductRow(inv)
                                if (patch) {
                                  // Selecting a new inventory item resets per-row
                                  // snapshots so the S.7b.2 worker re-enriches them.
                                  // Also seed totalUsed unit from inventory unit.
                                  patchDraftRow(i, {
                                    ...patch,
                                    unit: patch.unit || r.unit || 'oz',
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
                          </label>
                          <label className={styles.chemTopFieldNarrow}>
                            <span className={styles.chemEditLabel}>Type</span>
                            <input
                              type="text"
                              value={r.type ?? ''}
                              onChange={e => patchDraftRow(i, { type: e.target.value })}
                              placeholder="Fungicide…"
                              aria-label={`Product ${i + 1} type`}
                            />
                          </label>
                          <button
                            type="button"
                            className={styles.chemRemoveBtn}
                            onClick={() => removeDraftRow(i)}
                            aria-label={`Remove product ${i + 1}`}
                          >
                            Remove
                          </button>
                        </div>

                        {/* ── Calculation row ── */}
                        <div className={styles.chemCalcRow}>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Total used</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.totalUsed ?? ''}
                              onChange={e => editTotalUsed(i, e.target.value)}
                              aria-label={`Product ${i + 1} total used`}
                              placeholder="0.00"
                            />
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Total unit</span>
                            <select
                              value={r.unit ?? 'oz'}
                              onChange={e => patchDraftRow(i, { unit: e.target.value })}
                              aria-label={`Product ${i + 1} total used unit`}
                            >
                              {TOTAL_USED_UNIT_OPTS.map(u => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Rate</span>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={r.rate ?? ''}
                              onChange={e => editRate(i, e.target.value)}
                              aria-label={`Product ${i + 1} rate`}
                              placeholder="0.000"
                            />
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Rate unit</span>
                            <select
                              value={normalizeRateUnit(r.rateUnit)}
                              onChange={e => editRateUnit(i, e.target.value)}
                              aria-label={`Product ${i + 1} rate unit`}
                            >
                              {RATE_UNIT_OPTS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Area sprayed</span>
                            <input
                              type="text"
                              value={sprayedAcres > 0 ? `${roundDisplay(sprayedAcres, 2)} ac` : '—'}
                              readOnly
                              aria-label="Total area sprayed (read-only)"
                              className={styles.chemReadOnly}
                            />
                          </label>
                        </div>

                        {/* ── Status row ── */}
                        <div className={styles.chemStatusRow}>
                          {sprayedAcres === 0 && (
                            <span className={styles.chemStatusHint} role="status">
                              Area acreage unavailable — enter total used directly; rate math is disabled.
                            </span>
                          )}
                          {(() => {
                            const s = rowStatus(r)
                            if (s.kind === 'no-link') {
                              return (
                                <span className={styles.chemNoInventoryWarn} role="status">
                                  Not linked to inventory — record will save but no inventory deduction.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-blank') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Enter total used or rate to calculate inventory deduction.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-invalid') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Total used must be a number.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-nonpositive') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Total used must be greater than 0 to deduct inventory.
                                </span>
                              )
                            }
                            // kind === 'ok'
                            return (
                              <span className={styles.chemStatusLine} role="status">
                                Will deduct {s.qty}{s.unit ? ` ${s.unit}` : ''} from inventory
                                {s.available != null && ` · ${s.available}${s.unit ? ` ${s.unit}` : ''} on hand`}
                                {s.outOfStock && (
                                  <span className={styles.chemStatusSubWarn}>
                                    {' · '}Selected product has 0 on hand.
                                  </span>
                                )}
                                {!s.outOfStock && s.low && (
                                  <span className={styles.chemStatusSubWarn}>
                                    {' · '}Insufficient stock for full deduction.
                                  </span>
                                )}
                              </span>
                            )
                          })()}
                        </div>
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
