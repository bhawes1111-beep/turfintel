// Phase S.5a.1 — Edit Saved Spray Record modal.
//
// Lets a supervisor correct a saved spray record without D1 console
// access. Wired to the existing worker PATCH /api/sprays/:id endpoint
// via the existing patchSpray() store helper. No new endpoint, no
// migration, no permission changes.
//
// CRITICAL safety invariants:
//   • Product mix rows are read-only in this phase. The PATCH endpoint
//     doesn't accept product mutations (it only writes spray_records
//     columns), so editing product names / rates / quantities here
//     would create silent UI-vs-data drift. Wait for a later phase
//     that adds dedicated product-row endpoints.
//   • Compliance + cost snapshots (EPA #, active ingredients, product
//     cost, total cost) are NEVER sent in the PATCH body. The worker
//     would drop unknown fields anyway, but we belt-and-suspenders
//     by only including the explicit EDITABLE_FIELDS allowlist.
//   • Worker permission gate (`canEditSprays`) is the source of truth.
//     This modal renders for anyone who can reach the Spray tab; an
//     unauthorized user clicking Save gets a 403 from the worker and
//     a toast surfaces the error.

import { useEffect, useState } from 'react'
import { patchSpray, refreshSpraysData } from '../../../utils/sprays/spraysStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Spray.module.css'

// Whitelist of fields the modal sends in the PATCH body. Matches the
// worker's MUTABLE_RECORD_COLS minus the snapshot fields (which the
// worker technically allows for backfill, but we never send from the
// UI to keep historical records immutable from the supervisor's view).
const STATUS_OPTIONS = [
  { value: 'completed',      label: 'Completed' },
  { value: 'in-progress',    label: 'In Progress' },
  { value: 'planned',        label: 'Planned' },
  { value: 'pending-review', label: 'Pending Review' },
]

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

// Pure helper — strips snapshot/derived fields so we never accidentally
// echo back a value that should remain frozen at write time.
function buildPatchPayload(formState) {
  return {
    date:              formState.date              || null,
    startTime:         formState.startTime         || null,
    endTime:           formState.endTime           || null,
    applicator:        formState.applicator        || null,
    applicatorLicense: formState.applicatorLicense?.trim() || null,
    targetPest:        formState.targetPest        || null,
    status:            formState.status            || null,
    notes:             formState.notes             || null,
    conditions: {
      temp:           formState.temp           === '' ? null : Number(formState.temp),
      wind:           formState.wind           || null,
      windSpeedMph:   formState.windSpeedMph   === '' ? null : Number(formState.windSpeedMph),
      windDirection:  formState.windDirection  || null,
      humidity:       formState.humidity       === '' ? null : Number(formState.humidity),
      soilTemp:       formState.soilTemp       === '' ? null : Number(formState.soilTemp),
    },
  }
}

export default function EditSprayRecordModal({ record, onClose, onSaved }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Seed form from the record. Conditions live in a nested object
  // server-side; flatten for editing convenience and re-nest on save.
  const [form, setForm] = useState(() => ({
    date:              record.date              ?? '',
    startTime:         record.startTime         ?? '',
    endTime:           record.endTime           ?? '',
    applicator:        record.applicator        ?? '',
    applicatorLicense: record.applicatorLicense ?? '',
    targetPest:        record.targetPest        ?? '',
    status:            record.status            ?? 'completed',
    notes:             record.notes             ?? '',
    temp:              record.conditions?.temp          ?? '',
    wind:              record.conditions?.wind          ?? '',
    windSpeedMph:      record.conditions?.windSpeedMph  ?? '',
    windDirection:     record.conditions?.windDirection ?? '',
    humidity:          record.conditions?.humidity      ?? '',
    soilTemp:          record.conditions?.soilTemp      ?? '',
  }))

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    // Basic validation — date is required and must be YYYY-MM-DD.
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      toast.error('Date is required (YYYY-MM-DD).')
      return
    }
    if (form.startTime && !/^\d{2}:\d{2}$/.test(form.startTime)) {
      toast.error('Start time must be HH:MM.')
      return
    }
    if (form.endTime && !/^\d{2}:\d{2}$/.test(form.endTime)) {
      toast.error('End time must be HH:MM.')
      return
    }
    setBusy(true)
    try {
      const payload = buildPatchPayload(form)
      await patchSpray(record.id, payload)
      await refreshSpraysData()
      toast.success(`Updated spray record for ${payload.date}`)
      onSaved?.()
    } catch (err) {
      toast.error(`Update failed: ${err.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.modalOverlay}
      onClick={() => { if (!busy) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit spray record"
    >
      <div
        className={styles.modalPanel}
        onClick={e => e.stopPropagation()}
        data-modal="edit-spray-record"
      >
        <div
          className={styles.modalAccent}
          style={{ background: '#4a9e4a' }}
        />

        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Edit Spray Record</h2>
            <p className={styles.modalSubtitle}>
              {(record.products ?? []).map(p => p.name).join(' + ') || '(no products)'} · {record.date}
            </p>
          </div>
          <button
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* ── Application details ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Application details</h3>
            <div className={styles.editFieldGrid}>
              <label className={styles.editField}>
                <span>Date</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setField('date', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={styles.editField}>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value)}
                  disabled={busy}
                >
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.editField}>
                <span>Start time</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={e => setField('startTime', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={styles.editField}>
                <span>End time</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => setField('endTime', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={styles.editField}>
                <span>Applicator</span>
                <input
                  type="text"
                  value={form.applicator}
                  onChange={e => setField('applicator', e.target.value)}
                  disabled={busy}
                  placeholder="Operator name"
                />
              </label>
              <label className={styles.editField}>
                <span>Applicator license</span>
                <input
                  type="text"
                  value={form.applicatorLicense}
                  onChange={e => setField('applicatorLicense', e.target.value)}
                  disabled={busy}
                  placeholder="Optional"
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Target / pest</span>
                <input
                  type="text"
                  value={form.targetPest}
                  onChange={e => setField('targetPest', e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <p className={styles.editHint}>
              Area / acreage edits will be handled in a later phase to preserve the original area snapshot.
            </p>
          </section>

          {/* ── Weather ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Weather conditions</h3>
            <div className={styles.editFieldGrid}>
              <label className={styles.editField}>
                <span>Temperature (°F)</span>
                <input
                  type="number"
                  value={form.temp}
                  onChange={e => setField('temp', e.target.value)}
                  disabled={busy}
                  step="0.1"
                />
              </label>
              <label className={styles.editField}>
                <span>Humidity (%)</span>
                <input
                  type="number"
                  value={form.humidity}
                  onChange={e => setField('humidity', e.target.value)}
                  disabled={busy}
                  min="0"
                  max="100"
                />
              </label>
              <label className={styles.editField}>
                <span>Wind speed (mph)</span>
                <input
                  type="number"
                  value={form.windSpeedMph}
                  onChange={e => setField('windSpeedMph', e.target.value)}
                  disabled={busy}
                  step="0.1"
                  min="0"
                />
              </label>
              <label className={styles.editField}>
                <span>Wind direction</span>
                <select
                  value={form.windDirection}
                  onChange={e => setField('windDirection', e.target.value)}
                  disabled={busy}
                >
                  <option value="">—</option>
                  {WIND_DIRECTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className={styles.editField}>
                <span>Soil temperature (°F)</span>
                <input
                  type="number"
                  value={form.soilTemp}
                  onChange={e => setField('soilTemp', e.target.value)}
                  disabled={busy}
                  step="0.1"
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Conditions (free text)</span>
                <input
                  type="text"
                  value={form.wind}
                  onChange={e => setField('wind', e.target.value)}
                  disabled={busy}
                  placeholder="e.g. light breeze, partly cloudy"
                />
              </label>
            </div>
          </section>

          {/* ── Notes ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Notes</h3>
            <textarea
              className={styles.editNotes}
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="Observations, deviations, or follow-up notes."
            />
          </section>

          {/* ── Product mix (read-only) ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Product mix (read-only)</h3>
            <p className={styles.editHint}>
              Product mix edits will be handled in a later phase to preserve inventory and compliance snapshots.
            </p>
            {(record.products ?? []).length === 0 ? (
              <p className={styles.editEmpty}>No products on this record.</p>
            ) : (
              <ul className={styles.editProductList}>
                {record.products.map(p => (
                  <li key={p.id} className={styles.editProductRow}>
                    <strong>{p.name}</strong>
                    {p.rate && <span> · {p.rate}</span>}
                    {p.quantityUsed != null && (
                      <span> · {p.quantityUsed} {p.unit || ''}</span>
                    )}
                    {p.epaNumberSnapshot && (
                      <span className={styles.editProductSnapshot}>EPA {p.epaNumberSnapshot}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.modalSecondaryBtn}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.modalPrimaryBtn}
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
