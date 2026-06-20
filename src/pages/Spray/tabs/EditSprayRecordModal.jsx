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
  const payload = {
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
  // Phase S.7c — Sprayed areas. Sent only when the form's areas
  // collection has been touched (areasTouched flag) so unchanged
  // edits don't trigger the worker's replace-areas pipeline. Worker
  // validates at least one row + name + non-negative acreage; on
  // success it DELETEs existing spray_areas and INSERTs the new set.
  if (formState.areasTouched && Array.isArray(formState.areas)) {
    payload.areas = formState.areas.map(a => ({
      name:    String(a.name ?? '').trim(),
      acreage: a.acreage === '' || a.acreage == null ? null : Number(a.acreage),
    }))
  }
  return payload
}

export default function EditSprayRecordModal({ record, onClose, onSaved }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Seed form from the record. Conditions live in a nested object
  // server-side; flatten for editing convenience and re-nest on save.
  // Phase S.7c — Areas seeded from record.areas. areasTouched starts
  // false; any add/edit/remove flips it so buildPatchPayload includes
  // the areas array on the PATCH.
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
    // Areas: each row { name, acreage }. Always at least one slot so
    // the user has somewhere to type when a record loaded with none.
    areas:             Array.isArray(record.areas) && record.areas.length > 0
      ? record.areas.map(a => ({ name: a.name ?? '', acreage: a.acreage ?? '' }))
      : [{ name: '', acreage: '' }],
    areasTouched:      false,
  }))

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Phase S.7c — Area-row handlers. Any touch flips areasTouched
  // so buildPatchPayload sends the areas array on save.
  function patchArea(i, patch) {
    setForm(prev => ({
      ...prev,
      areasTouched: true,
      areas: prev.areas.map((a, idx) => idx === i ? { ...a, ...patch } : a),
    }))
  }
  function addArea() {
    setForm(prev => ({
      ...prev,
      areasTouched: true,
      areas: [...prev.areas, { name: '', acreage: '' }],
    }))
  }
  function removeArea(i) {
    setForm(prev => ({
      ...prev,
      areasTouched: true,
      areas: prev.areas.filter((_, idx) => idx !== i),
    }))
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
    // Phase S.7c — Area validation (only when user touched the section).
    if (form.areasTouched) {
      if (form.areas.length === 0) {
        toast.error('At least one sprayed area is required.')
        return
      }
      for (const a of form.areas) {
        if (!a.name || !String(a.name).trim()) {
          toast.error('Each area row needs a name.')
          return
        }
        if (a.acreage !== '' && a.acreage != null && Number.isNaN(Number(a.acreage))) {
          toast.error(`Acreage for "${a.name}" must be a number.`)
          return
        }
        if (a.acreage !== '' && a.acreage != null && Number(a.acreage) < 0) {
          toast.error(`Acreage for "${a.name}" cannot be negative.`)
          return
        }
      }
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

          {/* ── Sprayed areas (S.7c) ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Sprayed areas</h3>
            <p className={styles.editHint}>
              Acreage feeds rate math in the chemical editor + compliance reports. Add a row per area.
            </p>
            <ul className={styles.editAreaList}>
              {form.areas.map((a, i) => (
                <li key={i} className={styles.editAreaRow}>
                  <label className={styles.editAreaField}>
                    <span className={styles.editFieldLabel}>Area name</span>
                    <input
                      type="text"
                      value={a.name}
                      onChange={e => patchArea(i, { name: e.target.value })}
                      placeholder="Greens"
                      aria-label={`Area ${i + 1} name`}
                    />
                  </label>
                  <label className={styles.editAreaField}>
                    <span className={styles.editFieldLabel}>Acreage</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={a.acreage ?? ''}
                      onChange={e => patchArea(i, { acreage: e.target.value })}
                      placeholder="0.00"
                      aria-label={`Area ${i + 1} acreage`}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.editAreaRemoveBtn}
                    onClick={() => removeArea(i)}
                    aria-label={`Remove area ${i + 1}`}
                    disabled={form.areas.length <= 1}
                    title={form.areas.length <= 1 ? 'At least one area is required' : 'Remove this area'}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.editAreaAddBtn}
              onClick={addArea}
            >
              + Add area
            </button>
          </section>

          {/* ── Product mix (read-only) ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Product mix (read-only)</h3>
            <p className={styles.editHint}>
              Product mix edits live in the full spray sheet's <strong>Edit chemicals</strong> action to preserve inventory and compliance snapshots.
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
