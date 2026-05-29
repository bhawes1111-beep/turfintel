import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import {
  useInventoryData,
  setInventoryCostBasis,
} from '../../../utils/inventory/inventoryStore'
import { useSprayPrograms } from '../../../utils/sprayPrograms/sprayProgramStore'
import { buildCostBasisReview } from '../../../utils/sprayPrograms/costBasisReview'
import {
  estimateProgramItemCost,
  resolveProgramArea,
} from '../../../utils/sprayPrograms/programCostAwareness'
import styles from './InventoryCostBasisReview.module.css'

// Phase 7W.1 — In-app Cost Basis Review.
//
// A single Inventory tab that groups course-scoped inventory items by the
// stewardship state most relevant to spray-program cost estimation:
//
//   1. Already costed              (cost_per_unit on file)
//   2. Cost basis found, conversion needed
//   3. Missing cost basis            (no cost on file at all)
//   4. Package size needed           (priced by case / bag / pack / bottle —
//                                     UI-only draft field; no DB schema)
//   5. Standalone price needed       (priced as part of a vendor bundle —
//                                     UI-only draft field)
//   6. Name reconciliation needed    (program product name does not match
//                                     the inventory row name)
//
// Strict invariants:
//   - never deducts inventory
//   - never creates inventory_usage
//   - never mutates product_catalog
//   - never auto-merges product names / aliases
//   - never auto-applies cost basis without an explicit click
//   - never overwrites a non-null cost basis without confirmation
//   - the only write path is the existing Phase 7J.1 PATCH
//     /api/inventory/:id/cost-basis (via setInventoryCostBasis)
//   - package size + standalone price are UI-only DRAFT fields stored in
//     localStorage; they are not written to D1 (no schema change). When a
//     value is derived from a draft and applied, the math is prepended to
//     cost_notes for an auditable trail.

const STORAGE_KEY = 'turfintel:costBasisReviewDrafts/v1'

// Known DO-NOT-MERGE program names — surfaced as inline warnings.
const DO_NOT_MERGE = new Set(['Ampliphy 18', 'Veriphy 18'])

// Bundled / standalone-required products (vendor bundles where no
// standalone price exists yet). Surfaced as inline guidance.
const STANDALONE_HINTS = new Set([
  'Appear', 'Appear II', 'Ascernity', 'Daconil Action', 'Secure Action',
  'Fosetyl Al', 'Segway',
])

// Products that need a name reconciliation before any cost basis can
// flow through (price is already clean but the inventory row name
// differs). Add others manually when the audit surfaces them.
const NAME_RECONCILE_HINTS = new Set(['Prothioconazole'])

// Status → bucket label (rendering order is the spec's six-bucket order).
const BUCKETS = [
  { key: 'missing',     title: 'Missing cost basis',              tone: 'warn' },
  { key: 'conversion',  title: 'Cost basis found — conversion needed', tone: 'caution' },
  { key: 'packageSize', title: 'Package size needed',             tone: 'caution' },
  { key: 'standalone',  title: 'Standalone price needed',         tone: 'caution' },
  { key: 'name',        title: 'Name reconciliation needed',      tone: 'caution' },
  { key: 'costed',      title: 'Already costed',                  tone: 'ok' },
]

// ── Draft storage (UI-only, localStorage) ──────────────────────────────────
function loadDrafts() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function saveDrafts(drafts) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)) } catch { /* quota / privacy */ }
}

// ── Derived cost preview from draft inputs ─────────────────────────────────
//
// Mirrors the offline calc-…inputs.mjs math: gal/case → $/gal; lb/bag,
// lb/pack → $/lb. Never crosses volume↔weight. Returns null when inputs
// are incomplete; never returns 0 on missing data.
function deriveCostFromDraft(draft, inventoryItem) {
  if (!draft) return null
  const { packageSize, packageSizeUnit, totalCost, purchaseQuantity, standalonePrice } = draft
  // Standalone-only path: a per-unit price already exists (no package math).
  const standaloneNum = Number(standalonePrice)
  if (Number.isFinite(standaloneNum) && standaloneNum > 0) {
    return {
      costPerUnit: roundCents(standaloneNum),
      costUnit:    draft.standalonePriceUnit || inventoryItem?.unit || null,
      note: `Standalone price: $${standaloneNum}/${draft.standalonePriceUnit ?? 'unit'}`,
    }
  }
  // Package-size derivation. Needs positive packageSize + totalCost + purchaseQuantity.
  const sz   = Number(packageSize)
  const qty  = Number(purchaseQuantity)
  const tot  = Number(totalCost)
  if (!Number.isFinite(sz)   || sz   <= 0) return null
  if (!Number.isFinite(qty)  || qty  <= 0) return null
  if (!Number.isFinite(tot)  || tot  <= 0) return null
  const totalUnits = qty * sz
  if (totalUnits <= 0) return null
  let costUnit = null
  if (packageSizeUnit === 'gal/case')     costUnit = 'gal'
  else if (packageSizeUnit === 'lb/bag')  costUnit = 'lb'
  else if (packageSizeUnit === 'lb/pack') costUnit = 'lb'
  else return null  // bottles / unknown — needs standalone path instead
  return {
    costPerUnit: roundCents(tot / totalUnits),
    costUnit,
    note: `Derived from ${qty} ${packageSizeUnit.split('/')[1]} × ${sz} ${packageSizeUnit} @ $${tot} = $${roundCents(tot / totalUnits)}/${costUnit}`,
  }
}
function roundCents(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// ── Bucket classification for an inventory item ────────────────────────────
//
// Combines:
//   - inventory cost state (cost_per_unit / cost_unit)
//   - whether the item shows up in the workspace cost-basis review's
//     conversion-needed / not-comparable bucket (via the Phase 7U.4
//     estimator status across all programs that reference it)
//   - hard-coded program-side hints (DO-NOT-MERGE / standalone /
//     name-reconcile) keyed by inventory name
function classifyInventoryItem(inv, review, perItemStatuses) {
  // 1. Already costed wins outright.
  if (inv.costPerUnit != null && Number(inv.costPerUnit) > 0) return 'costed'

  // 2. Inline hint: name-reconcile (highest priority among the
  //    not-yet-costed states because no other path unblocks it).
  if (NAME_RECONCILE_HINTS.has(inv.name)) return 'name'

  // 3. Standalone-required hint.
  if (STANDALONE_HINTS.has(inv.name)) return 'standalone'

  // 4. Estimator says "cost basis found — conversion needed" for some
  //    program item against this inventory row.
  if (perItemStatuses?.conversion?.has(inv.id)) return 'conversion'

  // 5. The review surfaces this inventory item as a cost-basis gap.
  const issue = review?.inventoryIssues?.find(i => i.inventoryItemId === inv.id)
  if (issue) {
    // Bottles / cases / bags can never resolve via a single cost basis;
    // route them to package-size bucket so the UI offers the draft fields.
    if (/bottle|case|bag|pack/i.test(inv.unit ?? '') || /bottle|case|bag|pack/i.test(inv.notes ?? '')) {
      return 'packageSize'
    }
    return 'missing'
  }

  // 6. Items not used by any program — leave them as "missing" silently.
  return 'missing'
}

// Cross every program item through the estimator once and bucket the
// inventory items by whether they were ever name-matched into a
// 'cost-basis-found-unit-conversion-needed' result. This avoids
// re-running the estimator per inventory item in the render.
function computePerItemStatuses(programs, itemsByProgramId, inventoryItems) {
  const conversion = new Set()
  for (const p of programs ?? []) {
    if (!p) continue
    const items = itemsByProgramId?.[p.id] ?? []
    for (const it of items) {
      const est = estimateProgramItemCost(it, { inventoryProducts: inventoryItems, program: p })
      if (est.status === 'cost-basis-found-unit-conversion-needed') {
        // resolve which inventory row was matched: by id then by exact name.
        const invItem = it.inventoryItemId
          ? inventoryItems?.find(i => i?.id === it.inventoryItemId)
          : inventoryItems?.find(i => (i?.name ?? '').toLowerCase() === (it?.productName ?? '').toLowerCase())
        if (invItem?.id) conversion.add(invItem.id)
      }
    }
  }
  return { conversion }
}

// ── Tab component ──────────────────────────────────────────────────────────
export default function InventoryCostBasisReview() {
  const navigate = useNavigate()
  const { items: inventoryItems, loading, error } = useInventoryData()
  const { programs, itemsByProgramId } = useSprayPrograms()

  const [drafts, setDrafts] = useState(loadDrafts)
  const [applying, setApplying] = useState({})  // { [invId]: true }
  const [appliedFlash, setAppliedFlash] = useState({}) // { [invId]: 'saved' }
  const [confirmOverwrite, setConfirmOverwrite] = useState(null) // { invItem, derived } or null
  const [errors, setErrors] = useState({})

  // Persist drafts whenever they change (UI-only; never written to D1).
  useEffect(() => { saveDrafts(drafts) }, [drafts])

  const review = useMemo(
    () => buildCostBasisReview(programs ?? [], itemsByProgramId ?? {}, inventoryItems ?? []),
    [programs, itemsByProgramId, inventoryItems],
  )
  const perItemStatuses = useMemo(
    () => computePerItemStatuses(programs, itemsByProgramId, inventoryItems),
    [programs, itemsByProgramId, inventoryItems],
  )

  // Group inventory items into the 6 buckets.
  const buckets = useMemo(() => {
    const out = { missing: [], conversion: [], packageSize: [], standalone: [], name: [], costed: [] }
    for (const inv of inventoryItems ?? []) {
      if (!inv) continue
      // Only consider inventory rows that are actual products (not parts/fuel).
      if (inv.kind === 'part' || inv.kind === 'fuel') continue
      const bucket = classifyInventoryItem(inv, review, perItemStatuses)
      out[bucket]?.push(inv)
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    return out
  }, [inventoryItems, review, perItemStatuses])

  function setDraft(invId, patch) {
    setDrafts(d => ({ ...d, [invId]: { ...(d[invId] ?? {}), ...patch } }))
  }
  function clearDraft(invId) {
    setDrafts(d => { const c = { ...d }; delete c[invId]; return c })
  }

  function jumpToProducts(invId) {
    navigate('/inventory', {
      state: {
        activeTab: 'Products',
        productId: invId,
        focus:    'cost-basis',
        source:   'spray-program-cost-basis-review',
      },
    })
  }

  async function applyDerivedCost(invItem, derived, opts = {}) {
    const id = invItem.id
    setErrors(e => ({ ...e, [id]: null }))
    setApplying(a => ({ ...a, [id]: true }))
    try {
      const existingNonNull = invItem.costPerUnit != null && Number(invItem.costPerUnit) > 0
      if (existingNonNull && !opts.confirmed) {
        setConfirmOverwrite({ invItem, derived })
        return
      }
      // Phase 7M.1 audit attribution: 'manual' (a steward clicked Apply).
      const notes = [
        derived.note,
        invItem.costNotes && invItem.costNotes !== derived.note ? invItem.costNotes : null,
      ].filter(Boolean).join(' — ')
      await setInventoryCostBasis(id, {
        costPerUnit: derived.costPerUnit,
        costUnit:    derived.costUnit,
        costSource:  'imported',
        costNotes:   notes,
        changeSource: 'manual',
      })
      // On success, drop the draft (the value lives in D1 now).
      clearDraft(id)
      setAppliedFlash(f => ({ ...f, [id]: 'saved' }))
      setTimeout(() => setAppliedFlash(f => { const c = { ...f }; delete c[id]; return c }), 2500)
    } catch (e) {
      setErrors(er => ({ ...er, [id]: e?.message ?? String(e) }))
    } finally {
      setApplying(a => ({ ...a, [id]: false }))
    }
  }

  if (error) {
    return (
      <div className={styles.tabContent}>
        <EmptyState title="Could not load inventory." description={error} />
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Cost Basis Review"
        subtitle="Group inventory items by the input each one needs before spray-program cost estimates can complete. Edits are manual; nothing is auto-applied."
      >
        <BoundaryNote />

        {loading && (inventoryItems ?? []).length === 0 && (
          <EmptyState compact title="Loading inventory…" />
        )}

        {!loading && (inventoryItems ?? []).length === 0 && (
          <EmptyState
            title="No inventory items in scope."
            description="No course-scoped inventory products were found."
          />
        )}

        {(inventoryItems ?? []).length > 0 && (
          <div className={styles.bucketGrid}>
            {BUCKETS.map(b => (
              <BucketCard
                key={b.key}
                bucket={b}
                items={buckets[b.key]}
                drafts={drafts}
                setDraft={setDraft}
                clearDraft={clearDraft}
                onJump={jumpToProducts}
                onApply={applyDerivedCost}
                applying={applying}
                appliedFlash={appliedFlash}
                errors={errors}
              />
            ))}
          </div>
        )}
      </WorkspaceSection>

      {confirmOverwrite && (
        <ConfirmOverwriteDialog
          invItem={confirmOverwrite.invItem}
          derived={confirmOverwrite.derived}
          onCancel={() => setConfirmOverwrite(null)}
          onConfirm={async () => {
            const { invItem, derived } = confirmOverwrite
            setConfirmOverwrite(null)
            await applyDerivedCost(invItem, derived, { confirmed: true })
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BoundaryNote() {
  return (
    <p className={styles.boundaryNote}>
      Edits are manual only. Inventory is not deducted. Aliases are not auto-merged.
      The only write is through the existing cost-basis endpoint, with full audit history.
    </p>
  )
}

function BucketCard({ bucket, items, drafts, setDraft, clearDraft, onJump, onApply, applying, appliedFlash, errors }) {
  const count = items.length
  return (
    <section className={`${styles.bucket} ${styles[`bucket_${bucket.tone}`] ?? ''}`}>
      <header className={styles.bucketHeader}>
        <h4 className={styles.bucketTitle}>{bucket.title}</h4>
        <span className={styles.bucketCount}>{count}</span>
      </header>
      {count === 0 ? (
        <p className={styles.bucketEmpty}>No items.</p>
      ) : (
        <ul className={styles.itemList}>
          {items.map(inv => (
            <ItemRow
              key={inv.id}
              bucket={bucket.key}
              inv={inv}
              draft={drafts[inv.id] ?? {}}
              setDraft={(p) => setDraft(inv.id, p)}
              clearDraft={() => clearDraft(inv.id)}
              onJump={() => onJump(inv.id)}
              onApply={(derived) => onApply(inv, derived)}
              applying={!!applying[inv.id]}
              appliedFlash={appliedFlash[inv.id]}
              error={errors[inv.id] ?? null}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemRow({ bucket, inv, draft, setDraft, clearDraft, onJump, onApply, applying, appliedFlash, error }) {
  const allowDraftEdit = bucket === 'packageSize' || bucket === 'missing' || bucket === 'conversion'
  const allowStandalone = bucket === 'standalone' || bucket === 'packageSize'
  const derived = useMemo(() => deriveCostFromDraft(draft, inv), [draft, inv])
  const existingCost = inv.costPerUnit != null && Number(inv.costPerUnit) > 0

  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <div className={styles.itemNameBlock}>
          <span className={styles.itemName}>{inv.name}</span>
          <span className={styles.itemMeta}>
            {inv.vendor ? <span>vendor: {inv.vendor}</span> : null}
            {inv.unit ? <span>· stock unit: {inv.unit}</span> : null}
          </span>
        </div>
        <div className={styles.itemCostBlock}>
          <span className={styles.itemCost}>
            {existingCost
              ? `$${Number(inv.costPerUnit).toFixed(2)} / ${inv.costUnit ?? inv.unit ?? '—'}`
              : 'No cost basis'}
          </span>
          {inv.costSource && <span className={styles.itemCostMeta}>{inv.costSource}</span>}
        </div>
      </div>

      {/* Hints + warnings keyed by product name */}
      {DO_NOT_MERGE.has(inv.name) && (
        <p className={`${styles.itemBanner} ${styles.itemBanner_warn}`}>
          ⚠ Do NOT merge {inv.name} with its phite counterpart — these are separate products.
        </p>
      )}
      {STANDALONE_HINTS.has(inv.name) && (
        <p className={styles.itemBanner}>
          Needs a standalone vendor price before cost basis can be applied.
        </p>
      )}
      {NAME_RECONCILE_HINTS.has(inv.name) && (
        <p className={styles.itemBanner}>
          Name reconciliation needed — confirm the program name matches the inventory row name before costing.
        </p>
      )}

      {/* Draft inputs (UI-only, localStorage) */}
      {allowDraftEdit && (
        <div className={styles.draftRow}>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Purchase quantity</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.purchaseQuantity ?? ''}
              onChange={e => setDraft({ purchaseQuantity: e.target.value })}
              placeholder="e.g. 5"
            />
          </label>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Package size</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.packageSize ?? ''}
              onChange={e => setDraft({ packageSize: e.target.value })}
              placeholder="e.g. 2.5"
            />
          </label>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Package size unit</span>
            <select
              value={draft.packageSizeUnit ?? ''}
              onChange={e => setDraft({ packageSizeUnit: e.target.value })}
            >
              <option value="">(select)</option>
              <option value="gal/case">gal / case</option>
              <option value="lb/bag">lb / bag</option>
              <option value="lb/pack">lb / pack</option>
            </select>
          </label>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Total cost</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.totalCost ?? ''}
              onChange={e => setDraft({ totalCost: e.target.value })}
              placeholder="e.g. 842.10"
            />
          </label>
        </div>
      )}

      {allowStandalone && (
        <div className={styles.draftRow}>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Standalone price</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.standalonePrice ?? ''}
              onChange={e => setDraft({ standalonePrice: e.target.value })}
              placeholder="e.g. 92.50"
            />
          </label>
          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Standalone unit</span>
            <input
              type="text"
              value={draft.standalonePriceUnit ?? ''}
              onChange={e => setDraft({ standalonePriceUnit: e.target.value })}
              placeholder="gal / lb / bottle"
            />
          </label>
        </div>
      )}

      {/* Derived preview (read-only) */}
      {derived && (
        <p className={styles.derivedPreview}>
          <strong>Preview:</strong> ${derived.costPerUnit} / {derived.costUnit}
          <span className={styles.derivedNote}> — {derived.note}</span>
        </p>
      )}

      {error && (
        <p className={styles.errorBanner} role="alert">Apply failed: {error}</p>
      )}
      {appliedFlash === 'saved' && (
        <p className={styles.savedFlash} role="status">Cost basis applied.</p>
      )}

      {/* Actions */}
      <div className={styles.itemActions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!derived || applying || NAME_RECONCILE_HINTS.has(inv.name) || STANDALONE_HINTS.has(inv.name) && !derived}
          onClick={() => derived && onApply(derived)}
          title={derived
            ? `Apply $${derived.costPerUnit}/${derived.costUnit} as the cost basis.`
            : 'Fill in the inputs above to enable apply.'}
        >
          {applying ? 'Applying…' : 'Apply derived cost basis'}
        </button>
        <button type="button" className={styles.btnGhost} onClick={onJump}>
          Open in Products editor
        </button>
        {Object.keys(draft ?? {}).length > 0 && (
          <button type="button" className={styles.btnGhost} onClick={clearDraft}>
            Clear draft
          </button>
        )}
      </div>
    </li>
  )
}

function ConfirmOverwriteDialog({ invItem, derived, onCancel, onConfirm }) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.overlayCard}>
        <h3 className={styles.overlayTitle}>Overwrite existing cost basis?</h3>
        <p className={styles.overlayText}>
          <strong>{invItem.name}</strong> already has a cost basis of
          <strong> ${Number(invItem.costPerUnit).toFixed(2)} / {invItem.costUnit ?? invItem.unit ?? '—'}</strong>.
          Replacing it with <strong>${derived.costPerUnit} / {derived.costUnit}</strong>?
          The previous value will be recorded in the audit history.
        </p>
        <div className={styles.overlayActions}>
          <button type="button" className={styles.btnDanger} onClick={onConfirm}>Replace</button>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
