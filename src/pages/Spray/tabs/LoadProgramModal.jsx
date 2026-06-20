// Phase S.5b.3 — Load Spray Program into Builder.
//
// Closes the loop with S.5b.2: a supervisor can save a finished spray
// sheet as a program, then later reload that program into a fresh
// builder draft to apply on a new date. This modal is the "load"
// side — pure read + populate, never mutates programs or records.
//
// Wiring:
//   • useSprayPrograms() — already loaded by the store boot (S.4 /
//     SprayWorkspace). Modal subscribes and renders the list.
//   • listSprayProgramItems(programId) — lazy-fetch the rows for the
//     selected program (existing — Phase 7F). Cached in the store
//     so a second selection of the same program is instant.
//   • Load action calls a `onLoad(rows, options)` callback supplied
//     by the builder so the modal is decoupled from the builder's
//     internal draft shape.
//
// CRITICAL: this modal never calls createSpray / patchSpray /
// recordInventoryUsage / createAlert / createCalendarEvent / any
// product catalog write. Loading is a pure builder-draft populate.

import { useEffect, useMemo, useState } from 'react'
import {
  useSprayPrograms,
  listSprayProgramItems,
  refreshSprayPrograms,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Spray.module.css'

const STATUS_OPTIONS = ['All', 'active', 'draft', 'archived']

export default function LoadProgramModal({
  draftHasContent,
  onClose,
  onLoad,
}) {
  const { programs, itemsByProgramId } = useSprayPrograms()
  const toast = useToast()

  const [selectedId, setSelectedId]   = useState(null)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [busy, setBusy]               = useState(false)

  // Refresh once on open so the supervisor sees freshly-saved programs.
  useEffect(() => { refreshSprayPrograms() }, [])

  // Esc closes (when not busy).
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Lazy-fetch items for the selected program. Cached in the store —
  // a re-selection of the same program reuses the cache instantly.
  useEffect(() => {
    if (!selectedId) return
    if (itemsByProgramId[selectedId]) return  // already cached
    let cancelled = false
    setLoadingPreview(true)
    listSprayProgramItems(selectedId)
      .catch(() => { /* surface via store error; preview just shows empty */ })
      .finally(() => { if (!cancelled) setLoadingPreview(false) })
    return () => { cancelled = true }
  }, [selectedId, itemsByProgramId])

  // Filtered program list.
  const visiblePrograms = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (programs ?? [])
      .filter(p => statusFilter === 'All' || p.status === statusFilter)
      .filter(p => !q || (p.name ?? '').toLowerCase().includes(q)
                       || (p.notes ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [programs, search, statusFilter])

  const selectedProgram = (programs ?? []).find(p => p.id === selectedId)
  const selectedItems   = (itemsByProgramId[selectedId] ?? [])

  // Derived row count per program for the list view (without forcing
  // a per-program fetch — only the cached programs surface a count).
  function rowCountForProgram(p) {
    return (itemsByProgramId[p.id] ?? []).length
  }

  // Map a program item to a builder row. Builder rows look like:
  //   { id, inventoryItemId, name, type, rate, rateUnit, unit, rei,
  //     productCatalogId }
  // The productCatalogId is preserved so the worker's enrichment can
  // still find EPA / active ingredients at commit time.
  function buildBuilderRow(item, idx) {
    const rateStr = item.rateValue != null && Number.isFinite(item.rateValue)
      ? String(item.rateValue)
      : ''
    return {
      id:              `row-loaded-${idx}-${Date.now().toString(36)}`,
      inventoryItemId: item.inventoryItemId ?? null,
      productCatalogId: item.productCatalogId ?? null,
      name:            item.productName ?? '',
      type:            '',          // builder re-derives from inventory pick
      rate:            rateStr,
      rateUnit:        item.rateUnit ?? 'oz_per_acre',
      unit:            'oz',        // builder re-derives from inventory pick
      rei:             0,
    }
  }

  async function handleLoad(mode) {
    if (!selectedProgram) return
    if (selectedItems.length === 0) {
      toast.info('This program has no product rows to load.')
      return
    }
    setBusy(true)
    try {
      const newRows = selectedItems.map(buildBuilderRow)
      // Take the first item's targetArea as the suggested area + the
      // first item's plannedStartDate as the suggested date. The
      // builder decides whether to apply them (only when its own
      // fields are blank).
      const targetArea       = selectedItems.find(i => i.targetArea)?.targetArea ?? null
      const plannedStartDate = selectedItems.find(i => i.plannedStartDate)?.plannedStartDate ?? null
      // Carrier hint from the first item that has one.
      const carrierItem      = selectedItems.find(i => i.carrierVolumeValue != null)
      const carrierRate      = carrierItem?.carrierVolumeValue != null
                                ? String(carrierItem.carrierVolumeValue)
                                : null
      const carrierUnit      = carrierItem?.carrierVolumeUnit ?? null

      onLoad?.({
        mode,                       // 'replace' | 'append'
        rows:           newRows,
        suggestedArea:  targetArea,
        suggestedDate:  plannedStartDate,
        suggestedCarrierRate: carrierRate,
        suggestedCarrierUnit: carrierUnit,
        programName:    selectedProgram.name,
      })
      toast.success(`Loaded "${selectedProgram.name}" into builder.`)
      onClose()
    } catch (err) {
      toast.error(`Load failed: ${err.message ?? err}`)
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
      aria-label="Load saved spray program"
    >
      <div
        className={styles.modalPanel}
        onClick={e => e.stopPropagation()}
        data-modal="load-program"
      >
        <div
          className={styles.modalAccent}
          style={{ background: '#38bdf8' }}
        />

        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Load Spray Program</h2>
            <p className={styles.modalSubtitle}>
              Reload a saved program into the builder. Programs are templates — loading
              does not create a record, deduct inventory, or fire alerts.
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
          {/* ── Filters ── */}
          <div className={styles.loadProgramFilters}>
            <input
              type="search"
              className={styles.loadProgramSearch}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search programs by name or description…"
              aria-label="Search saved programs"
            />
            <select
              className={styles.loadProgramStatusFilter}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
              ))}
            </select>
          </div>

          {/* ── List + preview layout ── */}
          <div className={styles.loadProgramLayout}>
            <ul className={styles.loadProgramList}>
              {visiblePrograms.length === 0 ? (
                <li className={styles.editEmpty}>No saved programs match the current filters.</li>
              ) : visiblePrograms.map(p => {
                const isSel = p.id === selectedId
                const rowCount = rowCountForProgram(p)
                return (
                  <li
                    key={p.id}
                    className={styles.loadProgramRow}
                    data-selected={isSel ? 'true' : undefined}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <div className={styles.loadProgramRowName}>
                      <strong>{p.name ?? '(unnamed)'}</strong>
                      <span className={styles.loadProgramRowStatus}>{p.status ?? '—'}</span>
                    </div>
                    {p.notes && (
                      <p className={styles.loadProgramRowNotes}>{p.notes}</p>
                    )}
                    <p className={styles.loadProgramRowMeta}>
                      {rowCount > 0 ? `${rowCount} row${rowCount !== 1 ? 's' : ''}` : '— rows'}
                      {p.source && <> · source: {p.source}</>}
                    </p>
                  </li>
                )
              })}
            </ul>

            <aside className={styles.loadProgramPreview} aria-live="polite">
              {!selectedProgram ? (
                <p className={styles.previewEmpty}>Select a program on the left to preview its product rows.</p>
              ) : loadingPreview && selectedItems.length === 0 ? (
                <p className={styles.previewEmpty}>Loading program rows…</p>
              ) : selectedItems.length === 0 ? (
                <p className={styles.previewEmpty}>This program has no product rows.</p>
              ) : (
                <>
                  <h4 className={styles.previewTitle}>{selectedProgram.name}</h4>
                  {selectedProgram.notes && (
                    <p className={styles.previewLabel}>{selectedProgram.notes}</p>
                  )}
                  <ul className={styles.editProductList}>
                    {selectedItems.map(it => (
                      <li key={it.id} className={styles.editProductRow}>
                        <strong>{it.productName ?? '(unnamed)'}</strong>
                        {it.rateValue != null && (
                          <span> · {it.rateValue} {it.rateUnit ?? ''}</span>
                        )}
                        {it.targetArea && (
                          <span> · {it.targetArea}</span>
                        )}
                        {it.plannedStartDate && (
                          <span className={styles.editProductSnapshot}>
                            {it.plannedStartDate}
                          </span>
                        )}
                        {it.productCatalogId && (
                          <span className={styles.editProductSnapshot}>Catalog id</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {draftHasContent && (
                    <p className={styles.loadProgramReplaceWarn}>
                      The current builder draft has products. Choose <strong>Replace</strong> to clear and load, or <strong>Append</strong> to add these rows alongside.
                    </p>
                  )}
                </>
              )}
            </aside>
          </div>
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
          {draftHasContent ? (
            <>
              <button
                type="button"
                className={styles.modalSecondaryBtn}
                onClick={() => handleLoad('append')}
                disabled={busy || !selectedProgram || selectedItems.length === 0}
                title="Add the program's rows to the current draft (keeps existing rows)"
              >
                Append rows
              </button>
              <button
                type="button"
                className={styles.modalPrimaryBtn}
                onClick={() => handleLoad('replace')}
                disabled={busy || !selectedProgram || selectedItems.length === 0}
              >
                {busy ? 'Loading…' : 'Replace draft rows'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.modalPrimaryBtn}
              onClick={() => handleLoad('replace')}
              disabled={busy || !selectedProgram || selectedItems.length === 0}
            >
              {busy ? 'Loading…' : 'Load into builder'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
