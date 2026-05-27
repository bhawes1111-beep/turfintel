import { useMemo, useState } from 'react'
import {
  useInventoryData,
  setInventoryCostBasis,
} from '../../../utils/inventory/inventoryStore'
import {
  buildCostImportReview,
  summarizeCostImportReview,
} from '../../../utils/inventory/costBasisImportMapping'
import { parseSimpleCsv } from '../../../utils/inventory/simpleCsvRows'
import styles from './CostBasisImportReview.module.css'

// Phase 7K (2/?) — Inventory Cost Import Review (read-only preview).
// Phase 7L (1/?) — single-row apply added. Per-row "Apply cost basis"
// button on ready rows only; non-ready rows stay read-only. The apply
// path is the Phase 7J.1 store wrapper setInventoryCostBasis (which
// talks to PATCH /api/inventory/:id/cost-basis) — no new endpoint,
// no bulk write, no Apply All / Import All / Commit All / Upload.
//
// Strict invariants:
//   - PURE render over local state + the live inventory cache
//   - the ONLY mutation route is setInventoryCostBasis(id, payload)
//     and only for rows whose status === 'ready' (one at a time)
//   - never references /api/ directly, product_catalog mutations,
//     budget, invoice processing, ledger, PDF, OCR, or AI extraction
//   - no Apply All / Import All / Commit All / Upload affordance
//
// CSV parse contract (handled in parseSimpleCsv):
//   - header row required
//   - rows split on \r?\n; cells split on literal ","
//   - whitespace trimmed; empty rows skipped without throwing
//   - quoted commas NOT supported in this commit

const BOUNDARY_COPY = [
  'Apply one reviewed row at a time.',
  'This updates inventory cost basis only.',
  'This does not create budget entries.',
  'Inventory is not deducted.',
]

const SAMPLE_PLACEHOLDER = [
  'item,cost per unit,unit,source,notes',
  'Daconil Action,82.50,gal,imported,2026 quote',
].join('\n')

const STATUS_LABEL = {
  ready:     'Ready',
  unmatched: 'Unmatched',
  ambiguous: 'Ambiguous',
  invalid:   'Invalid',
}

export default function CostBasisImportReview() {
  const { items: inventoryItems } = useInventoryData()
  const [text,   setText]   = useState('')
  const [review, setReview] = useState(null)
  // Phase 7L (1/?) — single-row apply state. appliedRows is a Set of
  // rowIndex values that have been successfully written via
  // setInventoryCostBasis; errorRows maps rowIndex → message for the
  // most recent failure; submittingIdx is the row currently in-flight
  // (so its button can show a "Saving…" label and be disabled).
  const [appliedRows,    setAppliedRows]    = useState(() => new Set())
  const [errorRows,      setErrorRows]      = useState(() => new Map())
  const [submittingIdx,  setSubmittingIdx]  = useState(null)

  const summary = useMemo(
    () => (review ? summarizeCostImportReview(review) : null),
    [review],
  )

  function previewRows() {
    const rows = parseSimpleCsv(text)
    setReview(buildCostImportReview(rows, inventoryItems ?? []))
    // A fresh preview voids any prior applied/error markers since the
    // row indices may now point to different content.
    setAppliedRows(new Set())
    setErrorRows(new Map())
    setSubmittingIdx(null)
  }
  function clearPreview() {
    setText('')
    setReview(null)
    setAppliedRows(new Set())
    setErrorRows(new Map())
    setSubmittingIdx(null)
  }

  async function applyRow(row) {
    if (!row || row.status !== 'ready' || !row.inventoryItemId) return
    setSubmittingIdx(row.rowIndex)
    // Clear any stale error for this row before re-attempting.
    if (errorRows.has(row.rowIndex)) {
      const nextErrors = new Map(errorRows)
      nextErrors.delete(row.rowIndex)
      setErrorRows(nextErrors)
    }
    try {
      await setInventoryCostBasis(row.inventoryItemId, {
        costPerUnit: row.costPerUnit,
        costUnit:    row.costUnit,
        costSource:  row.costSource,
        costNotes:   row.costNotes,
      })
      const nextApplied = new Set(appliedRows)
      nextApplied.add(row.rowIndex)
      setAppliedRows(nextApplied)
    } catch (e) {
      const nextErrors = new Map(errorRows)
      nextErrors.set(row.rowIndex, e?.message ?? String(e))
      setErrorRows(nextErrors)
    } finally {
      setSubmittingIdx(null)
    }
  }

  return (
    <section className={styles.panel} aria-label="Cost Import Review">
      <header className={styles.header}>
        <h3 className={styles.title}>Cost Import Review</h3>
        {summary && (
          <span
            className={`${styles.summaryBadge} ${summary.isClean ? styles.summaryBadgeOk : styles.summaryBadgeWarn}`}
          >
            {summary.message}
          </span>
        )}
      </header>

      <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>

      <label className={styles.textareaWrap}>
        <span className={styles.textareaLabel}>
          Paste CSV-like rows (header row required)
        </span>
        <textarea
          className={styles.textarea}
          rows={6}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={SAMPLE_PLACEHOLDER}
          aria-label="CSV rows to review"
        />
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={previewRows}
          disabled={text.trim() === ''}
        >
          Preview rows
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={clearPreview}
          disabled={text === '' && review == null}
        >
          Clear preview
        </button>
      </div>

      {review && (
        <>
          <TotalsRow totals={review.totals} />
          {review.rows.length === 0 ? (
            <p className={styles.empty}>No rows parsed. Check the header row + comma separation.</p>
          ) : (
            <ul className={styles.rowList} aria-label="Review rows">
              {review.rows.map(r => (
                <ReviewRow
                  key={`${r.rowIndex}-${r.importedName ?? r.inventoryItemId ?? 'x'}`}
                  row={r}
                  applied={appliedRows.has(r.rowIndex)}
                  error={errorRows.get(r.rowIndex) ?? null}
                  submitting={submittingIdx === r.rowIndex}
                  onApply={() => applyRow(r)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

// ── Atoms ──────────────────────────────────────────────────────────────
function TotalsRow({ totals }) {
  if (!totals) return null
  return (
    <div className={styles.totalsRow} aria-label="Review totals">
      <Tile label="Ready"     value={totals.ready     ?? 0} tone="ok" />
      <Tile label="Unmatched" value={totals.unmatched ?? 0} tone={(totals.unmatched ?? 0) > 0 ? 'warn' : 'muted'} />
      <Tile label="Ambiguous" value={totals.ambiguous ?? 0} tone={(totals.ambiguous ?? 0) > 0 ? 'warn' : 'muted'} />
      <Tile label="Invalid"   value={totals.invalid   ?? 0} tone={(totals.invalid   ?? 0) > 0 ? 'warn' : 'muted'} />
      <Tile label="Rows"      value={totals.rowsReviewed ?? 0} />
    </div>
  )
}

function Tile({ label, value, tone = 'neutral' }) {
  return (
    <div className={`${styles.tile} ${styles[`tile_${tone}`] ?? ''}`}>
      <div className={styles.tileValue}>{value}</div>
      <div className={styles.tileLabel}>{label}</div>
    </div>
  )
}

function ReviewRow({ row, applied = false, error = null, submitting = false, onApply }) {
  const statusKey = row.status ?? 'invalid'
  const isReady   = statusKey === 'ready'
  return (
    <li className={`${styles.row} ${styles[`row_${statusKey}`] ?? ''} ${applied ? styles.row_applied : ''}`}>
      <div className={styles.rowHeader}>
        <span className={styles.rowIndex}>Row {row.rowIndex + 1}</span>
        <span className={`${styles.rowStatusBadge} ${styles[`rowStatus_${statusKey}`] ?? ''}`}>
          {STATUS_LABEL[statusKey] ?? statusKey}
        </span>
      </div>
      <dl className={styles.rowKv}>
        <KV label="Imported name" value={row.importedName ?? '—'} />
        <KV label="Matched inventory" value={row.inventoryName ?? '—'} />
        <KV label="Cost"   value={row.costPerUnit != null ? String(row.costPerUnit) : '—'} />
        <KV label="Unit"   value={row.costUnit   ?? '—'} />
        <KV label="Source" value={row.costSource ?? '—'} />
        {row.costNotes && <KV label="Notes" value={row.costNotes} />}
      </dl>
      {row.message && (
        <p className={styles.rowMessage}>{row.message}</p>
      )}

      {/* Phase 7L (1/?) — single-row apply. Only ready rows get the
          button; non-ready rows are read-only. Applied rows replace
          the button with a green "Applied" marker. Errors render
          inline below the button. */}
      {isReady && !applied && (
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.btnApplyRow}
            onClick={onApply}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Apply cost basis'}
          </button>
          {error && <p className={styles.rowError} role="alert">{error}</p>}
        </div>
      )}
      {isReady && applied && (
        <p className={styles.rowAppliedBadge}>
          <span aria-hidden>✓</span> Applied
        </p>
      )}
    </li>
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
