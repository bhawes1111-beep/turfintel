import { useState } from 'react'
import { createInventory } from '../../../utils/inventory/inventoryStore'
import styles from './ManualProductForm.module.css'

// Phase 7Q (1/?) — Manual product entry form for the Crosswinds
// pilot. Wraps the existing createInventory store function so Bryan
// can hand-enter chemicals / fertilizers / products without the PDF
// wizard. Cost-basis fields are deliberately collected here too,
// then committed via the Phase 7J.1 narrow cost-basis endpoint AFTER
// the create succeeds — so the audit trail records the change with
// change_source='manual' just like an editor save.
//
// Strict invariants:
//   - never deducts inventory
//   - never creates a spray record
//   - never mutates product_catalog
//   - never creates budget / invoice / ledger rows
//   - never parses PDFs / invoices / AI extraction
//   - the cost-basis fields take the narrow PATCH path; they never
//     ride along with the generic createInventory body (so the
//     audit-trail invariant holds)
//
// The form is mobile-first and emits a stewardship vocabulary
// nothing like "fix automatically" / "recommend".

const KIND_OPTIONS = [
  { value: 'chemical',   label: 'Chemical' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'product',    label: 'Product (other)' },
]

const COST_SOURCE_OPTIONS = [
  { value: 'manual',   label: 'Manual entry' },
  { value: 'imported', label: 'Imported' },
  { value: 'invoice',  label: 'Invoice' },
  { value: 'unknown',  label: 'Unknown' },
]

const PILOT_HELPER_COPY = [
  'Add real Crosswinds products used in the next 30 days first.',
  'Cost basis supports planning estimates.',
  'Catalog links provide read-only agronomic intelligence.',
  'Inventory stock is not deducted from planned spray programs.',
]

const EMPTY_FORM = () => ({
  name: '',
  kind: 'chemical',
  category: '',
  unit: '',
  quantity: '',
  location: '',
  vendor: '',
  notes: '',
  costPerUnit: '',
  costUnit: '',
  costSource: '',
  costNotes: '',
})

export default function ManualProductForm({ onSaved, onCancel }) {
  const [form, setForm]           = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]             = useState(null)

  function update(patch) {
    setForm(f => ({ ...f, ...patch }))
  }

  async function submit(e) {
    e?.preventDefault?.()
    setErr(null)

    // Minimum-valid guard. The server validates too; this is a
    // friendlier check before we round-trip.
    if (!form.name.trim()) {
      setErr('Product name is required.')
      return
    }
    if (!form.kind) {
      setErr('Kind is required.')
      return
    }

    // Cost basis client-side guard (matches the server contract).
    let costPerUnitNum = null
    if (form.costPerUnit !== '') {
      costPerUnitNum = Number(form.costPerUnit)
      if (!Number.isFinite(costPerUnitNum) || costPerUnitNum <= 0) {
        setErr('Cost per unit must be a positive number, or empty to skip.')
        return
      }
      if (!form.costUnit.trim()) {
        setErr('Cost unit is required when cost per unit is set.')
        return
      }
    }

    setSubmitting(true)
    try {
      // 1) Create the inventory row (server resolves the courseId).
      //    The cost cluster is NOT sent here — it rides on the narrow
      //    PATCH below so the Phase 7M.1 audit row gets written.
      const saved = await createInventory({
        kind:     form.kind,
        name:     form.name.trim(),
        category: form.category.trim() || null,
        unit:     form.unit.trim()     || null,
        quantity: form.quantity === '' ? 0 : Number(form.quantity),
        location: form.location.trim() || null,
        vendor:   form.vendor.trim()   || null,
        notes:    form.notes.trim()    || null,
      })

      // 2) Commit cost basis via the narrow PATCH if the steward
      //    provided values. This lazily imports setInventoryCostBasis
      //    so the form has no top-level dependency on the cost path
      //    when cost is skipped.
      if (costPerUnitNum != null) {
        const { setInventoryCostBasis } =
          await import('../../../utils/inventory/inventoryStore')
        await setInventoryCostBasis(saved.id, {
          costPerUnit: costPerUnitNum,
          costUnit:    form.costUnit.trim(),
          costSource:  form.costSource || null,
          costNotes:   form.costNotes.trim() || null,
          changeSource: 'manual',
        })
      }

      setForm(EMPTY_FORM())
      onSaved?.(saved)
    } catch (e2) {
      setErr(e2?.message ?? String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Add inventory product">
      <header className={styles.header}>
        <h3 className={styles.title}>Add product</h3>
        <p className={styles.subtitle}>
          Manual entry for Crosswinds pilot stock. Cost basis is optional but recommended for planning estimates.
        </p>
      </header>

      {/* ── Required + identity ── */}
      <fieldset className={styles.section}>
        <legend className={styles.sectionLegend}>Identity</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Product name <span className={styles.required}>*</span>
          </span>
          <input
            type="text"
            className={styles.input}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={submitting}
            autoFocus
            placeholder="e.g. Daconil Action"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Kind <span className={styles.required}>*</span>
          </span>
          <select
            className={styles.input}
            value={form.kind}
            onChange={(e) => update({ kind: e.target.value })}
            disabled={submitting}
          >
            {KIND_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Category</span>
          <input
            type="text"
            className={styles.input}
            value={form.category}
            onChange={(e) => update({ category: e.target.value })}
            disabled={submitting}
            placeholder="e.g. Fungicide, Pre-emerge"
          />
        </label>
      </fieldset>

      {/* ── Stock ── */}
      <fieldset className={styles.section}>
        <legend className={styles.sectionLegend}>Stock</legend>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Quantity on hand</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={styles.input}
              value={form.quantity}
              onChange={(e) => update({ quantity: e.target.value })}
              disabled={submitting}
              placeholder="0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Unit</span>
            <input
              type="text"
              className={styles.input}
              value={form.unit}
              onChange={(e) => update({ unit: e.target.value })}
              disabled={submitting}
              placeholder="oz / lb / gal / each"
            />
          </label>
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Vendor</span>
            <input
              type="text"
              className={styles.input}
              value={form.vendor}
              onChange={(e) => update({ vendor: e.target.value })}
              disabled={submitting}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Location</span>
            <input
              type="text"
              className={styles.input}
              value={form.location}
              onChange={(e) => update({ location: e.target.value })}
              disabled={submitting}
              placeholder="Maintenance shed"
            />
          </label>
        </div>
      </fieldset>

      {/* ── Optional cost basis ── */}
      <fieldset className={styles.section}>
        <legend className={styles.sectionLegend}>Cost basis (optional)</legend>
        <p className={styles.sectionNote}>
          Saved through the existing cost-basis endpoint. An audit row is recorded with source <code>manual</code>.
        </p>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cost per unit</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={styles.input}
              value={form.costPerUnit}
              onChange={(e) => update({ costPerUnit: e.target.value })}
              disabled={submitting}
              placeholder="0.00"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cost unit</span>
            <input
              type="text"
              className={styles.input}
              value={form.costUnit}
              onChange={(e) => update({ costUnit: e.target.value })}
              disabled={submitting}
              placeholder={form.unit || 'oz / lb / gal / …'}
            />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Cost source</span>
          <select
            className={styles.input}
            value={form.costSource}
            onChange={(e) => update({ costSource: e.target.value })}
            disabled={submitting}
          >
            <option value="">(unspecified — defaults to manual)</option>
            {COST_SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Cost notes</span>
          <textarea
            className={styles.input}
            rows={2}
            value={form.costNotes}
            onChange={(e) => update({ costNotes: e.target.value })}
            disabled={submitting}
            placeholder="Vendor, PO #, season…"
          />
        </label>
      </fieldset>

      {/* ── Free-form notes ── */}
      <fieldset className={styles.section}>
        <legend className={styles.sectionLegend}>Notes</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>General notes</span>
          <textarea
            className={styles.input}
            rows={3}
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
            disabled={submitting}
            placeholder="Handling notes, label cautions, etc."
          />
        </label>
      </fieldset>

      {/* ── Pilot helper copy ── */}
      <ul className={styles.pilotNotes}>
        {PILOT_HELPER_COPY.map((line, i) => (
          <li key={i} className={styles.pilotNote}>{line}</li>
        ))}
      </ul>

      {err && (
        <p className={styles.errorBanner} role="alert">{err}</p>
      )}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Save product'}
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
