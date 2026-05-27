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
//   button on ready rows only; non-ready rows stay read-only.
// Phase 7L (2/?) — feedback polish: applied rows carry an applied
//   timestamp + before/after cost-basis snapshot. Totals now expose
//   an Applied counter. Boundary copy refreshed per the Phase 7L.2
//   spec. The apply path is unchanged: still the Phase 7J.1 store
//   wrapper setInventoryCostBasis (which talks to PATCH
//   /api/inventory/:id/cost-basis). No new endpoint, no bulk write,
//   no Apply All / Import All / Commit All / Upload.
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
  'Applied rows update inventory cost basis only.',
  'This does not create budget entries.',
  'Inventory is not deducted.',
  'Review one row at a time before applying.',
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
  // Phase 7L (1/?) — single-row apply state.
  // Phase 7L (2/?) — appliedRows is now a Map<rowIndex, {
  //   appliedAt, before, after }> so the UI can render an applied
  //   timestamp + before/after cost-basis snapshot. errorRows maps
  //   rowIndex → message for the most recent failure. submittingIdx
  //   tracks the row currently in-flight (button shows "Saving…"
  //   and is disabled while non-null).
  const [appliedRows,    setAppliedRows]    = useState(() => new Map())
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
    setAppliedRows(new Map())
    setErrorRows(new Map())
    setSubmittingIdx(null)
  }
  function clearPreview() {
    setText('')
    setReview(null)
    setAppliedRows(new Map())
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
    // Phase 7L (2/?) — snapshot the matched inventory row's existing
    // cost-basis fields BEFORE the apply call so the applied summary
    // can render a "Previous" line when there was already a value.
    // The local inventory cache is the source of truth here (no
    // network read) so the snapshot is honest about what the user
    // saw seconds ago.
    const liveRow = (inventoryItems ?? []).find(i => i?.id === row.inventoryItemId) ?? null
    const before = liveRow ? {
      costPerUnit:   liveRow.costPerUnit   ?? null,
      costUnit:      liveRow.costUnit      ?? liveRow.unit ?? null,
      costSource:    liveRow.costSource    ?? null,
      costNotes:     liveRow.costNotes     ?? null,
      costUpdatedAt: liveRow.costUpdatedAt ?? null,
    } : null
    try {
      await setInventoryCostBasis(row.inventoryItemId, {
        costPerUnit: row.costPerUnit,
        costUnit:    row.costUnit,
        costSource:  row.costSource,
        costNotes:   row.costNotes,
        // Phase 7M.1 — audit attribution. Per-row apply from the
        // import review surface lands in the history as
        // 'import-single-row'.
        changeSource: 'import-single-row',
      })
      const after = {
        costPerUnit: row.costPerUnit,
        costUnit:    row.costUnit,
        costSource:  row.costSource,
        costNotes:   row.costNotes,
      }
      const nextApplied = new Map(appliedRows)
      nextApplied.set(row.rowIndex, {
        appliedAt: new Date().toISOString(),
        before,
        after,
      })
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
          <TotalsRow totals={review.totals} appliedCount={appliedRows.size} />
          {review.rows.length === 0 ? (
            <p className={styles.empty}>No rows parsed. Check the header row + comma separation.</p>
          ) : (
            <ul className={styles.rowList} aria-label="Review rows">
              {review.rows.map(r => (
                <ReviewRow
                  key={`${r.rowIndex}-${r.importedName ?? r.inventoryItemId ?? 'x'}`}
                  row={r}
                  appliedEntry={appliedRows.get(r.rowIndex) ?? null}
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
function TotalsRow({ totals, appliedCount = 0 }) {
  if (!totals) return null
  return (
    <div className={styles.totalsRow} aria-label="Review totals">
      <Tile label="Ready"     value={totals.ready     ?? 0} tone="ok" />
      {/* Phase 7L (2/?) — Applied counter. Tone goes ok-green as
          soon as anything lands, muted while still 0. */}
      <Tile label="Applied"   value={appliedCount}
            tone={appliedCount > 0 ? 'ok' : 'muted'} />
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

function ReviewRow({ row, appliedEntry = null, error = null, submitting = false, onApply }) {
  const statusKey = row.status ?? 'invalid'
  const isReady   = statusKey === 'ready'
  const applied   = !!appliedEntry
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
          inline below the button.
          Phase 7L (2/?) — applied rows now also surface an applied
          timestamp + before/after cost-basis summary. */}
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
        <AppliedSummary entry={appliedEntry} />
      )}
    </li>
  )
}

// Phase 7L (2/?) — applied-row summary.
function AppliedSummary({ entry }) {
  if (!entry) return null
  const { appliedAt, before, after } = entry
  const hadPriorCost = before && before.costPerUnit != null
  return (
    <div className={styles.appliedSummary} aria-label="Applied cost basis summary">
      <div className={styles.appliedHeader}>
        <span className={styles.rowAppliedBadge}>
          <span aria-hidden>✓</span> Applied
        </span>
        <span className={styles.appliedTimestamp}>
          {formatAppliedAt(appliedAt)}
        </span>
      </div>
      {hadPriorCost ? (
        <dl className={styles.beforeAfterGrid}>
          <BeforeAfterRow label="Cost"   before={before?.costPerUnit} after={after?.costPerUnit} />
          <BeforeAfterRow label="Unit"   before={before?.costUnit}    after={after?.costUnit} />
          <BeforeAfterRow label="Source" before={before?.costSource}  after={after?.costSource} />
        </dl>
      ) : (
        <dl className={styles.rowKv}>
          <KV label="New cost"   value={after?.costPerUnit != null ? String(after.costPerUnit) : '—'} />
          <KV label="New unit"   value={after?.costUnit   ?? '—'} />
          <KV label="New source" value={after?.costSource ?? '—'} />
        </dl>
      )}
    </div>
  )
}

function BeforeAfterRow({ label, before, after }) {
  const beforeStr = before == null || before === '' ? '—' : String(before)
  const afterStr  = after  == null || after  === '' ? '—' : String(after)
  return (
    <div className={styles.beforeAfterRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.beforeAfterValue}>
        <span className={styles.beforeValue}>{beforeStr}</span>
        <span className={styles.beforeAfterArrow} aria-hidden>→</span>
        <span className={styles.afterValue}>{afterStr}</span>
      </dd>
    </div>
  )
}

function formatAppliedAt(iso) {
  if (!iso) return 'Applied just now'
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return 'Applied just now'
  const ageMs = Date.now() - ts
  if (ageMs >= 0 && ageMs < 60_000) return 'Applied just now'
  try {
    return `Applied ${new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    })}`
  } catch {
    return `Applied ${iso}`
  }
}

function KV({ label, value }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  )
}
