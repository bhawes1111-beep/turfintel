import { useMemo, useState } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import {
  buildCostImportReview,
  summarizeCostImportReview,
} from '../../../utils/inventory/costBasisImportMapping'
import { parseSimpleCsv } from '../../../utils/inventory/simpleCsvRows'
import styles from './CostBasisImportReview.module.css'

// Phase 7K (2/?) — Inventory Cost Import Review (read-only preview).
//
// Surface for sanity-checking a future CSV cost-basis import BEFORE
// any apply / write step exists. Pastes CSV-like text into a
// textarea, parses it through the tiny simpleCsvRows helper, runs it
// through the Phase 7K.1 buildCostImportReview mapper, and renders
// the review model. Nothing here uploads, applies, writes, or
// touches the network.
//
// Strict invariants:
//   - PURE render over local state + the live inventory cache
//   - never calls setInventoryCostBasis (no apply path in this
//     commit — review only)
//   - never references /api/, product_catalog mutations, budget,
//     invoice processing, ledger, PDF, OCR, or AI extraction
//   - no Apply / Import / Save / Commit / Upload affordance
//
// CSV parse contract (handled in parseSimpleCsv):
//   - header row required
//   - rows split on \r?\n; cells split on literal ","
//   - whitespace trimmed; empty rows skipped without throwing
//   - quoted commas NOT supported in this commit

const BOUNDARY_COPY = [
  'Review only — no inventory changes are made.',
  'This does not create budget entries.',
  'This does not process invoices.',
  'Only exact inventory ID or exact name matches are reviewed.',
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

  const summary = useMemo(
    () => (review ? summarizeCostImportReview(review) : null),
    [review],
  )

  function previewRows() {
    const rows = parseSimpleCsv(text)
    setReview(buildCostImportReview(rows, inventoryItems ?? []))
  }
  function clearPreview() {
    setText('')
    setReview(null)
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
                <ReviewRow key={`${r.rowIndex}-${r.importedName ?? r.inventoryItemId ?? 'x'}`} row={r} />
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

function ReviewRow({ row }) {
  const statusKey = row.status ?? 'invalid'
  return (
    <li className={`${styles.row} ${styles[`row_${statusKey}`] ?? ''}`}>
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
