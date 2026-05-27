import { useEffect, useRef, useState } from 'react'
import {
  setInventoryCostBasis,
  listInventoryCostBasisAudit,
} from '../../../utils/inventory/inventoryStore'
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
  // Phase 7M (1/?) — collapsible cost-basis history panel. Audit rows
  // are fetched lazily the first time the user opens the panel for
  // an item (and re-fetched when an apply lands underneath an open
  // panel so the new row appears without a manual refresh).
  const [historyOpen,    setHistoryOpen]    = useState(false)
  const [historyRows,    setHistoryRows]    = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyErr,     setHistoryErr]     = useState(null)
  // Phase 7M (2/?) — when the server reports a successful
  // cost-basis UPDATE but a failed audit INSERT (the response body
  // carries _costBasisAuditError), we surface a non-blocking
  // warning so the steward knows the trail is incomplete. The
  // banner clears on the next save attempt.
  const [auditWarning, setAuditWarning] = useState(null)
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
    // Phase 7M.1 — history is per-item; reset the cached rows when
    // the inventory id changes so the panel never shows stale rows
    // from a previous drawer.
    setHistoryOpen(false)
    setHistoryRows([])
    setHistoryErr(null)
    // Phase 7M.2 — audit-warning is also per-item; clear it when
    // switching drawers.
    setAuditWarning(null)
  }, [item?.id])

  async function refreshHistory() {
    if (!item?.id) return
    setHistoryLoading(true)
    setHistoryErr(null)
    try {
      const rows = await listInventoryCostBasisAudit(item.id)
      setHistoryRows(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setHistoryErr(e?.message ?? String(e))
    } finally {
      setHistoryLoading(false)
    }
  }
  // When the panel transitions closed → open AND we haven't fetched
  // yet, lazily pull the trail.
  useEffect(() => {
    if (historyOpen && historyRows.length === 0 && !historyLoading && !historyErr) {
      refreshHistory()
    }
    // refreshHistory is stable for our purposes (only touches local
    // state + item.id). The eslint deps lint would also flag item?.id
    // here but the closure above already handles the cross-item reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, item?.id])

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
    setAuditWarning(null)
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
      const saved = await setInventoryCostBasis(item.id, {
        costPerUnit,
        costUnit,
        costSource: form.costSource || null,
        costNotes:  form.costNotes?.trim() ? form.costNotes.trim() : null,
        // Phase 7M.1 — audit attribution. Manual edits land in the
        // history with change_source = 'manual'.
        changeSource: 'manual',
      })
      // Phase 7M.2 — surface the optional audit-failure marker. The
      // cost-basis itself was written; the history row just was not.
      if (saved?._costBasisAuditError) {
        setAuditWarning(saved._costBasisAuditError)
      }
      setEditing(false)
      // Phase 7M.1 — refresh the history if the panel is open so the
      // new row appears without a manual re-fetch.
      if (historyOpen) refreshHistory()
    } catch (e2) {
      setErr(e2.message ?? String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  async function clearBasis() {
    setErr(null)
    setAuditWarning(null)
    setSubmitting(true)
    try {
      const saved = await setInventoryCostBasis(item.id, {
        costPerUnit: null, costUnit: null, costSource: null, costNotes: null,
        // Phase 7M.1 — clearing the cost basis still attributes the
        // change to 'manual'. The audit row's new_* columns will all
        // be null, marking the clear explicitly.
        changeSource: 'manual',
      })
      if (saved?._costBasisAuditError) {
        setAuditWarning(saved._costBasisAuditError)
      }
      setForm(formFromItem({ ...item, costPerUnit: null, costUnit: null, costSource: null, costNotes: null }))
      setEditing(false)
      if (historyOpen) refreshHistory()
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

      {/* Phase 7M (2/?) — audit-warning banner. Renders when the
          inventory UPDATE succeeded but the audit INSERT did not, so
          the steward knows the trail is incomplete. Non-blocking;
          clears on the next save attempt or when switching drawers. */}
      {auditWarning && (
        <div className={styles.auditWarning} role="alert">
          <strong>Cost basis was updated, but audit history could not be recorded.</strong>
          <span className={styles.auditWarningDetail}> {auditWarning}</span>
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

      {/* Phase 7M (1/?) — collapsible cost-basis history. Read-only
          over the per-item audit trail. */}
      <CostBasisHistoryPanel
        open={historyOpen}
        loading={historyLoading}
        error={historyErr}
        rows={historyRows}
        onToggle={() => setHistoryOpen(o => !o)}
        onRefresh={refreshHistory}
      />
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

// ── Phase 7M (1/?) — Cost basis history panel ──────────────────────────
// Phase 7M (2/?) — polish: clearer copy in loading / error / empty
// states; the Refresh button stays available even after an error so
// the steward can retry; a small newest-first hint banner sits above
// the row list.

const CHANGE_SOURCE_LABEL = {
  'manual':            'Manual edit',
  'import-single-row': 'Imported row',
  'unknown':           'Unknown source',
}

function CostBasisHistoryPanel({ open, loading, error, rows, onToggle, onRefresh }) {
  const hasRows = !loading && !error && rows.length > 0
  return (
    <div className={styles.history}>
      <button
        type="button"
        className={styles.historyToggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="cost-basis-history-body"
      >
        <span className={styles.historyToggleLabel}>Cost basis history</span>
        <span className={styles.historyToggleChevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div id="cost-basis-history-body" className={styles.historyBody}>
          {loading && (
            <p className={styles.historyEmpty}>Loading history…</p>
          )}
          {error && (
            <p className={styles.errorBanner} role="alert">
              Unable to load cost basis history.
              <span className={styles.historyErrorDetail}> {error}</span>
            </p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className={styles.historyEmpty}>
              No cost basis changes recorded yet.
            </p>
          )}
          {hasRows && (
            <p className={styles.historyHint}>Newest first.</p>
          )}
          {hasRows && (
            <ul className={styles.historyList}>
              {rows.map(r => (
                <li key={r.id} className={styles.historyRow}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTimestamp}>
                      {formatUpdatedAt(r.changedAt)}
                    </span>
                    <span className={styles.historySourceChip}>
                      {CHANGE_SOURCE_LABEL[r.changeSource] ?? r.changeSource ?? 'Unknown source'}
                    </span>
                  </div>
                  <dl className={styles.historyKv}>
                    <KV label="Previous cost"   value={formatCostPair(r.previousCostPerUnit, r.previousCostUnit)} />
                    <KV label="New cost"        value={formatCostPair(r.newCostPerUnit,      r.newCostUnit)} />
                    <KV label="Previous source" value={labelForSource(r.previousCostSource)} />
                    <KV label="New source"      value={labelForSource(r.newCostSource)} />
                    {r.previousCostNotes && <KV label="Previous notes" value={r.previousCostNotes} />}
                    {r.newCostNotes && <KV label="New notes" value={r.newCostNotes} />}
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.historyActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh history'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCostPair(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const cur = formatCurrency(value)
  return unit ? `${cur} / ${unit}` : cur
}
