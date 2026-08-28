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
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import { useNutrientSamplesData } from '../../../utils/turfHealth/nutrientSamplesStore'
import {
  CARRIER_RATE_UNITS,
  calculateCarrierGallons,
  formatCarrierSummary,
  parseCarrierRate,
  sumApplicationAcres,
} from '../../../utils/sprays/carrierRate'
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
    applicationName:   formState.applicationName.trim() || null,
    applicationType:   formState.applicationType,
    equipmentId:       formState.equipmentId || null,
    equipmentName:     formState.equipmentName || null,
    tankCapacity:      formState.applicationType === 'granular' || formState.tankCapacity === '' ? null : Number(formState.tankCapacity),
    date:              formState.date              || null,
    startTime:         formState.startTime         || null,
    endTime:           formState.endTime           || null,
    applicator:        formState.applicator        || null,
    nutrientSampleId:  formState.nutrientSampleId  || null,
    applicatorLicense: formState.applicatorLicense?.trim() || null,
    targetPest:        formState.targetPest        || null,
    status:            formState.status            || null,
    deductInventory:   formState.deductInventory,
    notes:             formState.notes             || null,
    course:            formState.course.trim() || null,
    rei:               formState.rei === '' ? null : Number(formState.rei),
    phi:               formState.phi === '' ? null : Number(formState.phi),
    carrierVolume:     formState.applicationType === 'granular'
      ? null
      : formatCarrierSummary(formState.carrierRate, formState.carrierUnit, formState.totalVolume),
    totalVolume:       formState.applicationType === 'granular' || formState.totalVolume === '' ? null : Number(formState.totalVolume),
    irrigationInches:  formState.irrigationInches === '' ? null : Number(formState.irrigationInches),
    irrigationMinutes: formState.irrigationMinutes === '' ? null : Number(formState.irrigationMinutes),
    holes:             formState.holesText.split(',').map(value => value.trim()).filter(Boolean).map(value => {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : value
    }),
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
  const { equipment } = useEquipmentData()
  const { samples: nutrientSamples } = useNutrientSamplesData()
  const [busy, setBusy] = useState(false)

  // Seed form from the record. Conditions live in a nested object
  // server-side; flatten for editing convenience and re-nest on save.
  // Phase S.7c — Areas seeded from record.areas. areasTouched starts
  // false; any add/edit/remove flips it so buildPatchPayload includes
  // the areas array on the PATCH.
  const [form, setForm] = useState(() => {
    const initialAreas = Array.isArray(record.areas) && record.areas.length > 0
      ? record.areas.map(a => ({ name: a.name ?? '', acreage: a.acreage ?? '' }))
      : [{ name: '', acreage: '' }]
    const initialCarrier = parseCarrierRate(
      record.carrierVolume,
      record.totalVolume,
      sumApplicationAcres(initialAreas),
    )

    return ({
    applicationName:   record.applicationName   ?? '',
    applicationType:   record.applicationType   ?? (String(record.applicationName ?? record.carrierVolume ?? '').toLowerCase().includes('granular') ? 'granular' : 'liquid'),
    equipmentId:       record.equipmentId       ?? '',
    equipmentName:     record.equipmentName     ?? '',
    tankCapacity:      record.tankCapacity      ?? '',
    date:              record.date              ?? '',
    startTime:         record.startTime         ?? '',
    endTime:           record.endTime           ?? '',
    applicator:        record.applicator        ?? '',
    nutrientSampleId:  record.nutrientSampleId  ?? '',
    applicatorLicense: record.applicatorLicense ?? '',
    targetPest:        record.targetPest        ?? '',
    status:            record.status            ?? 'completed',
    deductInventory:   record.deductInventory   !== false,
    notes:             record.notes             ?? '',
    course:            record.course            ?? '',
    rei:               record.rei               ?? '',
    phi:               record.phi               ?? '',
    carrierRate:       initialCarrier.rate,
    carrierUnit:       initialCarrier.unit,
    totalVolume:       record.totalVolume       ?? '',
    irrigationInches:  record.irrigationInches  ?? '',
    irrigationMinutes: record.irrigationMinutes ?? '',
    holesText:         Array.isArray(record.holes) ? record.holes.join(', ') : '',
    temp:              record.conditions?.temp          ?? '',
    wind:              record.conditions?.wind          ?? '',
    windSpeedMph:      record.conditions?.windSpeedMph  ?? '',
    windDirection:     record.conditions?.windDirection ?? '',
    humidity:          record.conditions?.humidity      ?? '',
    soilTemp:          record.conditions?.soilTemp      ?? '',
    // Areas: each row { name, acreage }. Always at least one slot so
    // the user has somewhere to type when a record loaded with none.
    areas:             initialAreas,
    areasTouched:      false,
  })})

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function setField(key, value) {
    setForm(prev => {
      if (key === 'carrierRate' || key === 'carrierUnit') {
        const carrierRate = key === 'carrierRate' ? value : prev.carrierRate
        const carrierUnit = key === 'carrierUnit' ? value : prev.carrierUnit
        const total = calculateCarrierGallons(carrierRate, carrierUnit, sumApplicationAcres(prev.areas))
        return {
          ...prev,
          [key]: value,
          totalVolume: total == null ? prev.totalVolume : String(Number(total.toFixed(2))),
        }
      }
      return { ...prev, [key]: value }
    })
  }

  function selectEquipment(id) {
    const unit = equipment.find(item => item.id === id)
    setForm(prev => ({
      ...prev,
      equipmentId: id,
      equipmentName: unit?.name ?? '',
      tankCapacity: unit?.tankCapacityGal ?? unit?.tankCapacity ?? prev.tankCapacity,
    }))
  }

  // Phase S.7c — Area-row handlers. Any touch flips areasTouched
  // so buildPatchPayload sends the areas array on save.
  function patchArea(i, patch) {
    setForm(prev => {
      const areas = prev.areas.map((a, idx) => idx === i ? { ...a, ...patch } : a)
      const total = calculateCarrierGallons(prev.carrierRate, prev.carrierUnit, sumApplicationAcres(areas))
      return {
        ...prev,
        areasTouched: true,
        areas,
        totalVolume: total == null ? prev.totalVolume : String(Number(total.toFixed(2))),
      }
    })
  }
  function addArea() {
    setForm(prev => ({
      ...prev,
      areasTouched: true,
      areas: [...prev.areas, { name: '', acreage: '' }],
    }))
  }
  function removeArea(i) {
    setForm(prev => {
      const areas = prev.areas.filter((_, idx) => idx !== i)
      const total = calculateCarrierGallons(prev.carrierRate, prev.carrierUnit, sumApplicationAcres(areas))
      return {
        ...prev,
        areasTouched: true,
        areas,
        totalVolume: total == null ? prev.totalVolume : String(Number(total.toFixed(2))),
      }
    })
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
    for (const [label, value] of [
      ['Tank capacity', form.tankCapacity], ['REI', form.rei], ['PHI', form.phi],
      ['Carrier rate', form.carrierRate],
      ['Total volume', form.totalVolume], ['Irrigation inches', form.irrigationInches],
      ['Irrigation minutes', form.irrigationMinutes],
    ]) {
      if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        toast.error(`${label} must be zero or greater.`)
        return
      }
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
      role="dialog"
      aria-modal="true"
      aria-label="Edit application record"
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
            <h2 className={styles.modalTitle}>Edit Application Record</h2>
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
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Application name</span>
                <input type="text" value={form.applicationName} onChange={e => setField('applicationName', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>Application type</span>
                <select value={form.applicationType} onChange={e => setField('applicationType', e.target.value)} disabled={busy}>
                  <option value="liquid">Liquid</option>
                  <option value="granular">Granular</option>
                </select>
              </label>
              <label className={styles.editField}>
                <span>Application equipment</span>
                <select value={form.equipmentId} onChange={e => selectEquipment(e.target.value)} disabled={busy}>
                  <option value="">Unassigned</option>
                  {equipment.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label className={styles.editField}>
                <span>Tank capacity (gal)</span>
                <input type="number" min="0" step="0.1" value={form.tankCapacity} onChange={e => setField('tankCapacity', e.target.value)} disabled={busy || form.applicationType === 'granular'} />
              </label>
              <label className={styles.editField}>
                <span>Course label</span>
                <input type="text" value={form.course} onChange={e => setField('course', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>Nutrient sample</span>
                <select value={form.nutrientSampleId} onChange={e => setField('nutrientSampleId', e.target.value)} disabled={busy}>
                  <option value="">Not linked</option>
                  {form.nutrientSampleId && !nutrientSamples.some(sample => sample.id === form.nutrientSampleId) && (
                    <option value={form.nutrientSampleId}>Linked sample (unavailable)</option>
                  )}
                  {nutrientSamples.map(sample => (
                    <option key={sample.id} value={sample.id}>{sample.sampleDate} / {sample.location} / {sample.sampleType}</option>
                  ))}
                </select>
              </label>
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
                <span>Inventory on completion</span>
                <select
                  value={form.deductInventory ? 'deduct' : 'keep'}
                  onChange={e => setField('deductInventory', e.target.value === 'deduct')}
                  disabled={busy}
                >
                  <option value="deduct">Deduct products when completed</option>
                  <option value="keep">Do not deduct inventory</option>
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
              <label className={styles.editField}>
                <span>REI (hours)</span>
                <input type="number" min="0" step="1" value={form.rei} onChange={e => setField('rei', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>PHI (days)</span>
                <input type="number" min="0" step="1" value={form.phi} onChange={e => setField('phi', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>Carrier rate (GPA)</span>
                <input type="number" min="0" step="0.1" value={form.carrierRate} onChange={e => setField('carrierRate', e.target.value)} disabled={busy || form.applicationType === 'granular'} />
              </label>
              <label className={styles.editField}>
                <span>Carrier rate unit</span>
                <select value={form.carrierUnit} onChange={e => setField('carrierUnit', e.target.value)} disabled={busy || form.applicationType === 'granular'}>
                  {CARRIER_RATE_UNITS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.editField}>
                <span>Total volume (gal)</span>
                <input type="number" min="0" step="0.1" value={form.totalVolume} onChange={e => setField('totalVolume', e.target.value)} disabled={busy || form.applicationType === 'granular'} />
              </label>
              <label className={styles.editField}>
                <span>Irrigation (inches)</span>
                <input type="number" min="0" step="0.01" value={form.irrigationInches} onChange={e => setField('irrigationInches', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>Irrigation (minutes)</span>
                <input type="number" min="0" step="1" value={form.irrigationMinutes} onChange={e => setField('irrigationMinutes', e.target.value)} disabled={busy} />
              </label>
              <label className={styles.editField}>
                <span>Holes</span>
                <input type="text" value={form.holesText} onChange={e => setField('holesText', e.target.value)} disabled={busy} placeholder="1, 2, 3" />
              </label>
            </div>
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
