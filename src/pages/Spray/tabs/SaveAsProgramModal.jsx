// Phase S.5b.2 — Save as Program modal.
//
// Lets the supervisor save the current spray builder draft as a
// reusable Spray Program / template, mirroring the crew scheduler's
// "Save as Shift" flow. Distinct from "Commit Application":
//
//   • Commit Application writes a completed spray_record + deducts
//     inventory + freezes EPA/cost snapshots + fires REI alert +
//     creates a calendar event.
//   • Save as Program writes a spray_programs header + spray_program_items
//     ONLY. No record, no inventory, no alerts, no calendar event,
//     no compliance snapshots. The program can be reviewed later in
//     the Program Planner and applied to actual dates separately.
//
// Wiring:
//   • createSprayProgram (existing — Phase 7F) for the header.
//   • createSprayProgramItem per builder row (existing — Phase 7F).
//   • No new worker endpoint, no migration.

import { useEffect, useMemo, useState } from 'react'
import {
  createSprayProgram,
  createSprayProgramItem,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Spray.module.css'

export default function SaveAsProgramModal({
  draft,
  enrichedRows,
  onClose,
  onSaved,
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // Seed dates from the draft's date so a "save my Friday template"
  // gesture defaults to today, not blank.
  const [form, setForm] = useState({
    name:             '',
    label:            '',
    plannedStartDate: draft?.date ?? '',
    plannedEndDate:   draft?.date ?? '',
    targetArea:       draft?.area  ?? '',
    notes:            '',
  })

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Estimated totals from the existing enrichedRows shape (no
  // recomputation — read-only display).
  const totals = useMemo(() => {
    let totalCost = 0
    let hasCost   = false
    for (const r of enrichedRows ?? []) {
      if (typeof r.cost === 'number') {
        totalCost += r.cost
        hasCost = true
      }
    }
    return {
      rowCount:  enrichedRows?.length ?? 0,
      totalCost: hasCost ? +totalCost.toFixed(2) : null,
    }
  }, [enrichedRows])

  async function handleSave() {
    const name = (form.name ?? '').trim()
    if (!name) {
      // Phase S.6b — "Program" → "Planned spray" in all user-facing copy.
      toast.error('Planned spray name is required.')
      return
    }
    if (!enrichedRows || enrichedRows.length === 0) {
      toast.info('Add at least one product before saving as a planned spray.')
      return
    }
    // Light date validation — both optional, but reject malformed strings.
    for (const dateField of ['plannedStartDate', 'plannedEndDate']) {
      const v = form[dateField]
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        toast.error(`${dateField === 'plannedStartDate' ? 'Start' : 'End'} date must be YYYY-MM-DD.`)
        return
      }
    }

    setBusy(true)
    try {
      // Step 1 — create the program header. `source: 'spray-builder'`
      // tags the origin so Program Planner can later filter / show
      // provenance if it wants. `status: 'draft'` keeps it out of any
      // "active programs" rollup until the supervisor promotes it.
      const program = await createSprayProgram({
        name,
        notes:       form.label?.trim() || null,
        programType: null,
        status:      'draft',
        source:      'spray-builder',
      })

      if (!program?.id) {
        throw new Error('Planned spray creation returned no id')
      }

      // Step 2 — one item per builder row. Map only fields the program
      // item model supports; never echo back EPA / active ingredient /
      // cost snapshots — those are completed-application semantics.
      let createdCount = 0
      for (let i = 0; i < enrichedRows.length; i++) {
        const row = enrichedRows[i]
        // Parse rate as a number when possible; the program model uses
        // (rateValue, rateUnit) as a split pair.
        const rateValueNum = Number(row.rate)
        const rateValue    = Number.isFinite(rateValueNum) ? rateValueNum : null

        await createSprayProgramItem(program.id, {
          targetArea:        form.targetArea?.trim() || draft?.area || null,
          plannedStartDate:  form.plannedStartDate || null,
          plannedEndDate:    form.plannedEndDate   || null,
          productName:       row.name ?? null,
          productCatalogId:  row.intel?.catalogId  ?? null,
          inventoryItemId:   row.inventoryItemId   ?? null,
          rateValue,
          rateUnit:          row.rateUnit ?? null,
          carrierVolumeValue:
            draft?.carrierRate && Number.isFinite(Number(draft.carrierRate))
              ? Number(draft.carrierRate)
              : null,
          carrierVolumeUnit: draft?.carrierUnit ?? null,
          applicationNotes:  form.notes?.trim() || null,
          sortOrder:         i * 10,
          status:            'planned',
        })
        createdCount += 1
      }

      toast.success(`Saved "${name}" as a planned spray (${createdCount} product row${createdCount !== 1 ? 's' : ''}).`)
      onSaved?.({ program, itemCount: createdCount })
    } catch (err) {
      toast.error(`Save planned spray failed: ${err.message ?? err}`)
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
      aria-label="Save spray sheet as planned spray"
    >
      <div
        className={styles.modalPanel}
        onClick={e => e.stopPropagation()}
        data-modal="save-as-program"
      >
        <div
          className={styles.modalAccent}
          style={{ background: '#38bdf8' }}
        />

        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Save as Planned Spray</h2>
            <p className={styles.modalSubtitle}>
              {totals.rowCount} product row{totals.rowCount !== 1 ? 's' : ''}
              {totals.totalCost != null && ` · est. cost $${totals.totalCost.toFixed(2)}`}
              {' · '}
              Reusable template — does not create a spray record or deduct inventory.
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
          {/* ── Planned spray details ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Planned spray details</h3>
            <div className={styles.editFieldGrid}>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Planned spray name</span>
                <input
                  type="text"
                  autoFocus
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  disabled={busy}
                  placeholder='e.g. "Greens — fungicide rotation A"'
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Label / description</span>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setField('label', e.target.value)}
                  disabled={busy}
                  placeholder="Optional short label"
                />
              </label>
              <label className={styles.editField}>
                <span>Planned start date</span>
                <input
                  type="date"
                  value={form.plannedStartDate}
                  onChange={e => setField('plannedStartDate', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={styles.editField}>
                <span>Planned end date</span>
                <input
                  type="date"
                  value={form.plannedEndDate}
                  onChange={e => setField('plannedEndDate', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Target area</span>
                <input
                  type="text"
                  value={form.targetArea}
                  onChange={e => setField('targetArea', e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Greens, Tees + Approaches"
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span>Application notes</span>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  disabled={busy}
                  placeholder="Optional — applied to every product row"
                />
              </label>
            </div>
          </section>

          {/* ── Preview rows (read-only) ── */}
          <section className={styles.modalSection}>
            <h3 className={styles.modalSectionTitle}>Product rows (read-only preview)</h3>
            {(!enrichedRows || enrichedRows.length === 0) ? (
              <p className={styles.editEmpty}>
                No products on the current draft. Add at least one product before saving.
              </p>
            ) : (
              <ul className={styles.editProductList}>
                {enrichedRows.map((r, i) => (
                  <li key={r.id ?? `row-${i}`} className={styles.editProductRow}>
                    <strong>{r.name ?? '(unnamed product)'}</strong>
                    {r.rate && (
                      <span> · {r.rate} {r.rateUnit ?? ''}</span>
                    )}
                    {r.intel?.catalogId && (
                      <span className={styles.editProductSnapshot}>Catalog id</span>
                    )}
                    {typeof r.cost === 'number' && (
                      <span className={styles.editProductSnapshot}>est. ${r.cost.toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.editHint}>
              The current draft is not modified. Saving creates a separate planned spray you can review or load later from the Planned Sprays tab.
            </p>
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
            disabled={busy || !form.name.trim() || !enrichedRows || enrichedRows.length === 0}
          >
            {busy ? 'Saving…' : 'Save as Planned Spray'}
          </button>
        </div>
      </div>
    </div>
  )
}
