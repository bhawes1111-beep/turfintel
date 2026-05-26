import { useEffect, useRef, useState } from 'react'
import { setInventoryCostBasis } from '../../../utils/inventory/inventoryStore'
import styles from './CostBasisEditor.module.css'

// Phase 7J (1/?) — Inventory cost-basis stewardship editor.
//
// Mounts inside the existing Inventory item drawer. Read view shows
// the current cost-basis cluster (cost per unit, unit, source, last
// updated, notes). The Edit affordance opens an inline form that
// commits via setInventoryCostBasis (which talks to the narrow
// PATCH /api/inventory/:id/cost-basis endpoint).
//
// Strict invariants (read-only-elsewhere boundary):
//   - never deducts inventory
//   - never creates inventory_usage
//   - never mutates product_catalog
//   - never creates budget / invoice / ledger rows
//   - never uses the Product Catalog as a price source
//   - never auto-flips status
//
// The "Clear cost basis" button calls setInventoryCostBasis with
// costPerUnit=null, which the server interprets as a full clear of
// the cost cluster (cost, unit, source, updated_at, notes).

const COST_SOURCE_OPTIONS = [
  { value: 'manual',   label: 'Manual entry' },
  { value: 'imported', label: 'Imported' },
  { value: 'invoice',  label: 'Invoice' },
  { value: 'unknown',  label: 'Unknown' },
]

const BOUNDARY_COPY = [
  'Cost basis supports planning estimates.',
  'This does not create budget entries.',
  'This does not deduct inventory.',
  'Product Catalog is not used as a price source.',
]

// Phase 7J (2/?) — deep-link context copy. Rendered ONLY when the
// CostBasisEditor was opened from Spray Program Cost Basis Review
// (sourceContext === 'spray-program-cost-basis-review'). Generic
// Inventory usage continues to see no banner at all.
const REVIEW_BANNER_COPY = [
  'Review this inventory cost basis for spray program estimates.',
  'Cost basis supports planning estimates and does not create budget entries.',
]

export default function CostBasisEditor({
  item,
  focusIntent   = null,
  sourceContext = null,
  highlight     = false,
}) {
  const [editing,   setEditing]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err,       setErr]       = useState(null)
  const [form,      setForm]      = useState(() => formFromItem(item))
  // Phase 7J (2/?) — brief visual highlight when arriving from
  // Spray Program Cost Basis Review. The highlight class is a
  // background pulse that fades after ~1.5s so the steward can
  // see the editor was the navigation target without a permanent
  // banner outline.
  const [pulse, setPulse] = useState(false)
  const rootRef = useRef(null)

  // Re-sync the form when the user switches drawer rows underneath us
  // (so the cached form state from item A doesn't leak into item B).
  useEffect(() => {
    setForm(formFromItem(item))
    setEditing(false)
    setErr(null)
  }, [item?.id])

  // Deep-link landing: scroll into view + flash the editor when this
  // mount was triggered from the Cost Basis Review flow. The effect
  // ignores generic InventoryProducts use (highlight=false).
  useEffect(() => {
    if (!highlight) return
    setPulse(true)
    const t1 = setTimeout(() => {
      try { rootRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) } catch { /* SSR / jsdom */ }
    }, 50)
    const t2 = setTimeout(() => setPulse(false), 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [highlight, item?.id])

  if (!item) return null

  const fromReview =
    sourceContext === 'spray-program-cost-basis-review' ||
    focusIntent  === 'cost-basis'

  async function submit(e) {
    e?.preventDefault?.()
    setErr(null)
    setSubmitting(true)
    try {
      const costPerUnit = form.costPerUnit === '' ? null : Number(form.costPerUnit)
      if (costPerUnit !== null && (!Number.isFinite(costPerUnit) || costPerUnit <= 0)) {
        throw new Error('Cost per unit must be a positive number, or empty to clear.')
      }
      const costUnit = form.costUnit?.trim() ? form.costUnit.trim() : null
      if (costPerUnit !== null && !costUnit) {
        throw new Error('Unit is required when a cost is set.')
      }
      await setInventoryCostBasis(item.id, {
        costPerUnit,
        costUnit,
        costSource: form.costSource || null,
        costNotes:  form.costNotes?.trim() ? form.costNotes.trim() : null,
      })
      setEditing(false)
    } catch (e2) {
      setErr(e2.message ?? String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  async function clearBasis() {
    setErr(null)
    setSubmitting(true)
    try {
      await setInventoryCostBasis(item.id, {
        costPerUnit: null, costUnit: null, costSource: null, costNotes: null,
      })
      setForm(formFromItem({ ...item, costPerUnit: null, costUnit: null, costSource: null, costNotes: null }))
      setEditing(false)
    } catch (e2) {
      setErr(e2.message ?? String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  const updatedLabel = formatUpdatedAt(item.costUpdatedAt)

  return (
    <section
      ref={rootRef}
      className={`${styles.costBasis} ${pulse ? styles.costBasisPulse : ''}`}
      aria-label="Cost basis stewardship"
      data-focus-intent={focusIntent ?? undefined}
      data-source-context={sourceContext ?? undefined}
    >
      {/* Phase 7J (2/?) — contextual banner from Spray Program Cost
          Basis Review. Renders ONLY when arriving from that flow. */}
      {fromReview && (
        <div className={styles.reviewBanner} role="note">
          {REVIEW_BANNER_COPY.map((line, i) => (
            <p key={i} className={styles.reviewBannerLine}>{line}</p>
          ))}
        </div>
      )}

      <div className={styles.header}>
        <h3 className={styles.title}>Cost basis stewardship</h3>
        {!editing && (
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setEditing(true)}
          >
            {item.costPerUnit != null ? 'Edit cost basis' : 'Add cost basis'}
          </button>
        )}
      </div>

      {!editing && (
        <dl className={styles.kv}>
          <KV label="Cost per unit" value={formatCurrency(item.costPerUnit)} />
          <KV label="Unit"          value={item.costUnit ?? item.unit ?? '—'} />
          <KV label="Source"        value={labelForSource(item.costSource)} />
          <KV label="Last updated"  value={updatedLabel} />
          {item.costNotes && (
            <div className={styles.notesRow}>
              <dt className={styles.kvLabel}>Notes</dt>
              <dd className={styles.kvNotes}>{item.costNotes}</dd>
            </div>
          )}
        </dl>
      )}

      {editing && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cost per unit (leave blank to clear)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className={styles.input}
              value={form.costPerUnit}
              onChange={(e) => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
              disabled={submitting}
              placeholder="0.00"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Unit</span>
            <input
              type="text"
              className={styles.input}
              value={form.costUnit}
              onChange={(e) => setForm(f => ({ ...f, costUnit: e.target.value }))}
              disabled={submitting}
              placeholder={item.unit ?? 'oz / lb / gal / …'}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Source</span>
            <select
              className={styles.input}
              value={form.costSource}
              onChange={(e) => setForm(f => ({ ...f, costSource: e.target.value }))}
              disabled={submitting}
            >
              <option value="">(unspecified)</option>
              {COST_SOURCE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={styles.input}
              rows={2}
              value={form.costNotes}
              onChange={(e) => setForm(f => ({ ...f, costNotes: e.target.value }))}
              disabled={submitting}
              placeholder="Optional context (vendor, PO #, season, …)"
            />
          </label>

          {err && <p className={styles.errorBanner} role="alert">{err}</p>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save cost basis'}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => { setEditing(false); setForm(formFromItem(item)); setErr(null) }}
              disabled={submitting}
            >
              Cancel
            </button>
            {item.costPerUnit != null && (
              <button
                type="button"
                className={styles.btnDangerGhost}
                onClick={clearBasis}
                disabled={submitting}
                title="Clears cost per unit, unit, source, and notes."
              >
                Clear cost basis
              </button>
            )}
          </div>
        </form>
      )}

      <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
    </section>
  )
}

// ── Atoms ──────────────────────────────────────────────────────────────
function KV({ label, value }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value ?? '—'}</dd>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────
function formFromItem(item) {
  if (!item) return { costPerUnit: '', costUnit: '', costSource: '', costNotes: '' }
  return {
    costPerUnit: item.costPerUnit != null ? String(item.costPerUnit) : '',
    costUnit:    item.costUnit ?? item.unit ?? '',
    costSource:  item.costSource ?? '',
    costNotes:   item.costNotes ?? '',
  }
}
function formatCurrency(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: 2, minimumFractionDigits: 2,
    }).format(Number(value))
  } catch {
    return `USD ${Number(value).toFixed(2)}`
  }
}
function labelForSource(s) {
  switch (s) {
    case 'manual':   return 'Manual entry'
    case 'imported': return 'Imported'
    case 'invoice':  return 'Invoice'
    case 'unknown':  return 'Unknown'
    default:         return '—'
  }
}
function formatUpdatedAt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    })
  } catch {
    return String(iso)
  }
}
