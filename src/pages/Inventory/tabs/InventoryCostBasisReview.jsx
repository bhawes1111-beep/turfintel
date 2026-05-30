import { useEffect, useMemo, useRef, useState } from 'react'
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
  buildProgramCostSummaries,
  formatEstimatedCost,
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

// Phase 7W.2 — short status badge per bucket (rendered next to the
// product name for at-a-glance scanning).
const BUCKET_BADGE = {
  missing:     'Missing',
  conversion:  'Conversion',
  packageSize: 'Package size',
  standalone:  'Standalone $',
  name:        'Name reconcile',
  costed:      'Costed',
}

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

// Phase 7W.3 — a draft is "meaningful" once the steward has typed any
// positive value in any of its fields. Empty object / all-null draft
// rows are ignored so a stray useState patch never inflates the
// "filled" count.
function isMeaningfulDraft(d) {
  if (!d || typeof d !== 'object') return false
  // Phase 7X.1 — a Field-Walk reviewed marker (or a free-form note)
  // counts as meaningful even if no other value is set yet, so the
  // draft summary + export pick it up.
  if (d.reviewed === true) return true
  if (typeof d.note === 'string' && d.note.trim() !== '') return true
  for (const k of [
    'packageSize', 'packageSizeUnit', 'purchaseQuantity', 'totalCost',
    'standalonePrice', 'standalonePriceUnit',
  ]) {
    const v = d[k]
    if (v == null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (typeof v === 'number' && !Number.isFinite(v)) continue
    return true
  }
  return false
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
  // Phase 7W.2 — bucket filter (chips). 'all' shows every bucket;
  // a key like 'missing' / 'packageSize' / etc. shows only that bucket.
  const [activeFilter, setActiveFilter] = useState('all')
  // Phase 7W.3 — drafts-only toggle, last-saved indicator, clear-all
  // confirmation. Drafts live in localStorage; nothing here is written
  // to D1 unless the steward explicitly clicks Apply on a row.
  const [draftsOnly, setDraftsOnly] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [showDraftSavedFlash, setShowDraftSavedFlash] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  // Phase 7X.1 — Field Walk Mode: focused per-product entry overlay for
  // chemical-room walkthroughs. The panel mounts at the tab root, holds
  // its own queue cursor + an "include already costed" toggle, and
  // never invokes Apply (this phase is data collection only).
  const [fieldWalkOpen, setFieldWalkOpen] = useState(false)
  const [fieldWalkCursor, setFieldWalkCursor] = useState(0)
  const [fieldWalkIncludeCosted, setFieldWalkIncludeCosted] = useState(false)
  // Phase 7X.2A — Export status surface so a failed/empty/successful
  // download is visible instead of silent. Status shape:
  //   null | { kind: 'ok'|'empty'|'error', message: string, rows?: number }
  const [exportStatus, setExportStatus] = useState(null)
  // Fallback modal carries the CSV string when the browser refuses the
  // download (sandboxed iframes, missing Blob, locked-down Safari, etc.).
  const [exportFallback, setExportFallback] = useState(null)
  const [copyFlash, setCopyFlash] = useState(null)

  // Persist drafts whenever they change (UI-only; never written to D1).
  // The first run (initial load) is silent; subsequent saves drive the
  // "Draft saved locally" indicator.
  const firstSaveRef = useRef(true)
  useEffect(() => {
    saveDrafts(drafts)
    if (firstSaveRef.current) { firstSaveRef.current = false; return }
    setLastSavedAt(new Date())
    setShowDraftSavedFlash(true)
    const t = setTimeout(() => setShowDraftSavedFlash(false), 1800)
    return () => clearTimeout(t)
  }, [drafts])

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

  // Phase 7X.1 — Field Walk queue. Default scope is the four buckets
  // that need Bryan's confirmation; the steward can opt-in to include
  // already-costed rows via the panel's own toggle. Each queue entry
  // carries its bucket key so the focused card can pick the right
  // input fields + warnings.
  const fieldWalkQueue = useMemo(() => {
    const order = fieldWalkIncludeCosted
      ? ['missing', 'conversion', 'packageSize', 'standalone', 'name', 'costed']
      : ['missing', 'conversion', 'packageSize', 'standalone', 'name']
    const out = []
    for (const key of order) {
      for (const inv of buckets[key] ?? []) {
        out.push({ inv, bucketKey: key })
      }
    }
    return out
  }, [buckets, fieldWalkIncludeCosted])

  // Phase 7W.3 — draft summary: counts rows the steward has touched,
  // rows that have a derivable preview from those drafts, and rows that
  // remain blocked (a draft exists but the preview is null). All
  // computed against the current drafts + inventory snapshot.
  const draftSummary = useMemo(() => {
    const filled = Object.keys(drafts ?? {}).filter(id => isMeaningfulDraft(drafts[id]))
    const invById = new Map((inventoryItems ?? []).map(i => [i?.id, i]))
    let previewed = 0
    let blocked   = 0
    for (const id of filled) {
      const inv = invById.get(id)
      if (!inv) { blocked++; continue }
      const d = deriveCostFromDraft(drafts[id], inv)
      if (d) previewed++; else blocked++
    }
    return { filled: filled.length, previewed, blocked }
  }, [drafts, inventoryItems])

  // Phase 7W.2 — workspace-wide estimated program cost for the summary
  // card. Read-only: same helper the Spray Program Cost report uses.
  const estimatedProgramCost = useMemo(() => {
    const summaries = buildProgramCostSummaries(
      programs ?? [],
      itemsByProgramId ?? {},
      { inventoryProducts: inventoryItems ?? [] },
    )
    let total = 0, items = 0
    for (const s of summaries) {
      total += s.estimatedTotal ?? 0
      items += s.estimatedItems ?? 0
    }
    return { total: Math.round(total * 100) / 100, items }
  }, [programs, itemsByProgramId, inventoryItems])

  function setDraft(invId, patch) {
    setDrafts(d => ({ ...d, [invId]: { ...(d[invId] ?? {}), ...patch } }))
  }
  function clearDraft(invId) {
    setDrafts(d => { const c = { ...d }; delete c[invId]; return c })
  }
  // Phase 7X.1 — Field Walk navigation.
  function openFieldWalk() {
    setFieldWalkCursor(0)
    setFieldWalkOpen(true)
  }
  function closeFieldWalk() {
    setFieldWalkOpen(false)
  }
  function fieldWalkPrev() {
    setFieldWalkCursor(c => Math.max(0, c - 1))
  }
  function fieldWalkNext() {
    setFieldWalkCursor(c => {
      const last = Math.max(0, fieldWalkQueue.length - 1)
      return Math.min(last, c + 1)
    })
  }
  function markReviewed(invId) {
    // Phase 7X.1 — reviewed marker is an additive boolean on the per-
    // row draft. Older drafts (no `reviewed` key) keep working; the
    // calc + apply paths ignore the field.
    setDraft(invId, { reviewed: true, reviewedAt: new Date().toISOString() })
  }

  // Phase 7W.3 — clear-all drafts (browser-only). Guarded by an explicit
  // confirmation dialog (see ConfirmClearAllDialog) so an accidental
  // click can't wipe a half-finished worksheet. Touches localStorage
  // only — never the inventory cost basis.
  function clearAllDrafts() {
    setDrafts({})
    setConfirmClearAll(false)
  }

  // Phase 7W.3 — export current drafts to a CSV blob and trigger a
  // browser download. No server write, no API call. The CSV mirrors the
  // local worksheet so the steward can edit it elsewhere or share it.
  // Phase 7X.2A — build the CSV string from current drafts. Pure;
  // returns { csv, rows } so the caller can decide what to do (download
  // or feed into the fallback modal).
  function buildDraftsCsv() {
    const rows = []
    const invById = new Map((inventoryItems ?? []).map(i => [i?.id, i]))
    for (const id of Object.keys(drafts ?? {})) {
      const d = drafts[id]
      if (!isMeaningfulDraft(d)) continue
      const inv = invById.get(id)
      if (!inv) continue
      const bucket = classifyInventoryItem(inv, review, perItemStatuses)
      const derived = deriveCostFromDraft(d, inv)
      rows.push({
        productName:       inv.name ?? '',
        vendor:            inv.vendor ?? '',
        bucket:            BUCKET_BADGE[bucket] ?? bucket,
        packageSize:       d.packageSize ?? '',
        packageSizeUnit:   d.packageSizeUnit ?? '',
        purchaseQuantity:  d.purchaseQuantity ?? '',
        totalCost:         d.totalCost ?? '',
        standalonePrice:   d.standalonePrice ?? '',
        standalonePriceUnit: d.standalonePriceUnit ?? '',
        calculatedCostPerUnit: derived?.costPerUnit ?? '',
        costUnit:          derived?.costUnit ?? '',
        reviewed:          d.reviewed ? 'yes' : '',
        reviewedAt:        d.reviewedAt ?? '',
        notes:             d.note ?? derived?.note ?? '',
      })
    }
    const headers = [
      'productName','vendor','bucket','packageSize','packageSizeUnit',
      'purchaseQuantity','totalCost','standalonePrice','standalonePriceUnit',
      'calculatedCostPerUnit','costUnit','reviewed','reviewedAt','notes',
    ]
    const cell = v => {
      if (v == null) return ''
      const s = String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(',')]
      .concat(rows.map(r => headers.map(h => cell(r[h])).join(',')))
      .join('\n') + '\n'
    return { csv, rows }
  }

  // Phase 7X.2A — hardened export: explicit empty/error feedback,
  // delayed URL.revokeObjectURL so iOS Safari + older Firefox actually
  // commit the download, environment guards before touching Blob/URL,
  // and a fallback modal (textarea + "Copy CSV") when the download path
  // refuses. Never writes to D1; never calls fetch.
  function exportDraftsCsv() {
    setExportStatus(null)
    const { csv, rows } = buildDraftsCsv()
    if (rows.length === 0) {
      setExportStatus({ kind: 'empty', message: 'No drafts to export yet.' })
      setTimeout(() => setExportStatus(null), 2400)
      return
    }
    // Guard before touching browser APIs that might be unavailable.
    const hasBlob = typeof Blob !== 'undefined'
    const hasUrl  = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    const hasDoc  = typeof document !== 'undefined' && document?.body
    if (!hasBlob || !hasUrl || !hasDoc) {
      setExportFallback({ csv, rows: rows.length })
      return
    }
    try {
      const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
      a.href = url
      a.download = `cost-basis-drafts-${stamp}.csv`
      a.style.display = 'none'
      a.rel = 'noopener'
      document.body.appendChild(a)
      // Use a synthetic MouseEvent (not just .click()) so Safari + older
      // mobile browsers fire the download path consistently.
      try {
        a.click()
      } catch {
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      }
      // Delay both the anchor removal AND the URL revoke so the browser
      // finishes wiring the download before the resource is freed.
      // Immediate revoke (the prior bug) silently aborts the download
      // on iOS Safari + older Firefox.
      setTimeout(() => {
        try { a.remove() } catch { /* no-op */ }
        try { URL.revokeObjectURL(url) } catch { /* no-op */ }
      }, 1500)
      setExportStatus({ kind: 'ok', message: 'Drafts exported', rows: rows.length })
      setTimeout(() => setExportStatus(null), 2400)
    } catch (e) {
      // The most common reasons we land here: very sandboxed iframe,
      // privacy-locked browser, or a custom CSP. Open the fallback
      // modal with the CSV text so the steward can still get the data.
      setExportFallback({ csv, rows: rows.length })
      setExportStatus({
        kind: 'error',
        message: `Export failed: ${(e?.message ?? String(e)).slice(0, 80)} — showing CSV inline.`,
      })
      setTimeout(() => setExportStatus(null), 4000)
    }
  }

  async function copyExportText(csv) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv)
        setCopyFlash('Copied CSV to clipboard.')
        setTimeout(() => setCopyFlash(null), 2000)
        return true
      }
    } catch { /* fall through to manual select */ }
    setCopyFlash('Could not copy — select the text and copy manually.')
    setTimeout(() => setCopyFlash(null), 3500)
    return false
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

  // Filter buckets by the active chip (or 'all').
  const visibleBuckets = activeFilter === 'all'
    ? BUCKETS
    : BUCKETS.filter(b => b.key === activeFilter)

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Cost Basis Review"
        subtitle="Review missing product costs, package-size inputs, and products that need manual pricing before they can be included in planned program estimates."
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
          <>
            <SummaryCards
              counts={{
                missing:     buckets.missing.length,
                packageSize: buckets.packageSize.length,
                standalone:  buckets.standalone.length,
                conversion:  buckets.conversion.length,
                costed:      buckets.costed.length,
              }}
              estimated={estimatedProgramCost}
            />
            <DraftControlsStrip
              summary={draftSummary}
              lastSavedAt={lastSavedAt}
              draftsOnly={draftsOnly}
              onToggleDraftsOnly={() => setDraftsOnly(v => !v)}
              onExport={exportDraftsCsv}
              exportStatus={exportStatus}
              exportReadyCount={draftSummary.filled}
              onClearAll={() => setConfirmClearAll(true)}
              onOpenFieldWalk={openFieldWalk}
              fieldWalkQueueSize={fieldWalkQueue.length}
              hasAnyDraft={draftSummary.filled > 0}
              showSavedFlash={showDraftSavedFlash}
            />
            <FilterChips
              counts={buckets}
              active={activeFilter}
              onChange={setActiveFilter}
            />
            <div className={styles.bucketGrid}>
              {visibleBuckets.map(b => (
                <BucketCard
                  key={b.key}
                  bucket={b}
                  items={buckets[b.key]}
                  drafts={drafts}
                  draftsOnly={draftsOnly}
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
          </>
        )}
      </WorkspaceSection>

      {confirmClearAll && (
        <ConfirmClearAllDialog
          count={draftSummary.filled}
          onCancel={() => setConfirmClearAll(false)}
          onConfirm={clearAllDrafts}
        />
      )}

      {exportFallback && (
        <ExportFallbackDialog
          csv={exportFallback.csv}
          rowCount={exportFallback.rows}
          flash={copyFlash}
          onCopy={() => copyExportText(exportFallback.csv)}
          onClose={() => { setExportFallback(null); setCopyFlash(null) }}
        />
      )}

      {fieldWalkOpen && (
        <FieldWalkPanel
          queue={fieldWalkQueue}
          cursor={fieldWalkCursor}
          drafts={drafts}
          setDraft={setDraft}
          clearDraft={clearDraft}
          markReviewed={markReviewed}
          onPrev={fieldWalkPrev}
          onNext={fieldWalkNext}
          onClose={closeFieldWalk}
          includeCosted={fieldWalkIncludeCosted}
          onToggleIncludeCosted={() => {
            // Toggling the scope can shorten the queue. Reset the cursor
            // when it falls past the new end so the panel doesn't render
            // an undefined card.
            setFieldWalkIncludeCosted(v => !v)
            setFieldWalkCursor(0)
          }}
          showSavedFlash={showDraftSavedFlash}
        />
      )}

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
      ⚠ Applying cost basis updates inventory product pricing only.
      It does not deduct inventory or create usage records. Aliases are not
      auto-merged. All writes flow through the existing cost-basis endpoint
      with full audit history.
    </p>
  )
}

// Phase 7W.2 — compact summary cards above the bucket grid.
function SummaryCards({ counts, estimated }) {
  const cards = [
    { key: 'missing',     label: 'Missing cost basis',  value: counts.missing,     tone: counts.missing > 0 ? 'warn' : 'muted' },
    { key: 'packageSize', label: 'Package size needed', value: counts.packageSize, tone: counts.packageSize > 0 ? 'caution' : 'muted' },
    { key: 'standalone',  label: 'Standalone price',    value: counts.standalone,  tone: counts.standalone > 0 ? 'caution' : 'muted' },
    { key: 'conversion',  label: 'Conversion needed',   value: counts.conversion,  tone: counts.conversion > 0 ? 'caution' : 'muted' },
    { key: 'costed',      label: 'Already costed',      value: counts.costed,      tone: 'ok' },
    {
      key: 'estimated',
      label: 'Estimated program cost',
      value: estimated?.total > 0
        ? formatEstimatedCost(estimated.total)
        : '—',
      sub:   estimated?.items > 0 ? `${estimated.items} estimated items` : null,
      tone:  estimated?.total > 0 ? 'cost' : 'muted',
    },
  ]
  return (
    <div className={styles.summaryCards}>
      {cards.map(c => (
        <div
          key={c.key}
          className={`${styles.summaryCard} ${styles[`summaryCard_${c.tone}`] ?? ''}`}
        >
          <div className={styles.summaryCardValue}>{c.value ?? '—'}</div>
          <div className={styles.summaryCardLabel}>{c.label}</div>
          {c.sub && <div className={styles.summaryCardSub}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// Phase 7W.2 — sticky chip filter for jumping to a single bucket.
function FilterChips({ counts, active, onChange }) {
  const chips = [
    { key: 'all',         label: 'All',              count: Object.values(counts).reduce((a, b) => a + (b?.length ?? 0), 0) },
    { key: 'missing',     label: 'Missing cost',     count: counts.missing.length },
    { key: 'packageSize', label: 'Package size',     count: counts.packageSize.length },
    { key: 'standalone',  label: 'Standalone price', count: counts.standalone.length },
    { key: 'conversion',  label: 'Conversion',       count: counts.conversion.length },
    { key: 'name',        label: 'Name reconcile',   count: counts.name.length },
    { key: 'costed',      label: 'Already costed',   count: counts.costed.length },
  ]
  return (
    <div className={styles.chipStrip} role="tablist" aria-label="Filter by bucket">
      {chips.map(c => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={active === c.key}
          className={`${styles.chip} ${active === c.key ? styles.chipActive : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
          <span className={styles.chipCount}>{c.count}</span>
        </button>
      ))}
    </div>
  )
}

// Phase 7W.3 — draft controls strip: at-a-glance counts, last-saved
// indicator, drafts-only toggle, export + clear-all actions.
function DraftControlsStrip({
  summary, lastSavedAt, draftsOnly, onToggleDraftsOnly,
  onExport, onClearAll, hasAnyDraft, showSavedFlash,
  onOpenFieldWalk, fieldWalkQueueSize = 0,
  exportStatus = null, exportReadyCount = 0,
}) {
  return (
    <section
      className={styles.draftControls}
      aria-label="Draft controls"
    >
      <div className={styles.draftStats}>
        <span className={styles.draftStat}>
          <strong>{summary.filled}</strong> filled
        </span>
        <span className={styles.draftStat}>
          <strong>{summary.previewed}</strong> with preview
        </span>
        <span className={styles.draftStat}>
          <strong>{summary.blocked}</strong> blocked
        </span>
        {lastSavedAt && (
          <span className={`${styles.draftStat} ${styles.draftStatSaved} ${showSavedFlash ? styles.draftStatSavedFlash : ''}`}>
            Draft saved in this browser
            <span className={styles.draftSavedTime}> · {formatSavedAt(lastSavedAt)}</span>
          </span>
        )}
      </div>
      <div className={styles.draftActions}>
        <label className={styles.draftToggle}>
          <input
            type="checkbox"
            checked={draftsOnly}
            onChange={onToggleDraftsOnly}
            aria-label="Show only rows with drafts"
          />
          <span>Drafts only</span>
        </label>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onOpenFieldWalk}
          disabled={fieldWalkQueueSize === 0}
          title={fieldWalkQueueSize > 0
            ? `Walk through ${fieldWalkQueueSize} products one at a time.`
            : 'No products in the field-walk queue.'}
        >
          Field Walk Mode
        </button>
        <div className={styles.exportGroup}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onExport}
            disabled={!hasAnyDraft}
            title={hasAnyDraft
              ? `Download ${exportReadyCount} draft row${exportReadyCount === 1 ? '' : 's'} as CSV.`
              : 'No drafts to export yet.'}
          >
            Export drafts
          </button>
          {/* Phase 7X.2A — visible readiness count + status banner so a
              silent failure can no longer be mistaken for "nothing
              happened". */}
          <span className={styles.exportReady}>
            {exportReadyCount} draft row{exportReadyCount === 1 ? '' : 's'} ready to export
          </span>
          {exportStatus && (
            <span
              className={`${styles.exportStatus} ${styles[`exportStatus_${exportStatus.kind}`] ?? ''}`}
              role={exportStatus.kind === 'error' ? 'alert' : 'status'}
            >
              {exportStatus.kind === 'ok' && exportStatus.rows != null
                ? `${exportStatus.message} · ${exportStatus.rows} row${exportStatus.rows === 1 ? '' : 's'}`
                : exportStatus.message}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.btnDangerGhost}
          onClick={onClearAll}
          disabled={!hasAnyDraft}
          title={hasAnyDraft ? 'Clear every draft in this browser (asks first).' : 'No drafts to clear.'}
        >
          Clear all drafts
        </button>
      </div>
    </section>
  )
}

function ConfirmClearAllDialog({ count, onCancel, onConfirm }) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.overlayCard}>
        <h3 className={styles.overlayTitle}>Clear all drafts?</h3>
        <p className={styles.overlayText}>
          This clears <strong>{count}</strong> draft row{count !== 1 ? 's' : ''} from this
          browser only. <strong>Inventory cost basis values are not affected.</strong>
          This cannot be undone.
        </p>
        <div className={styles.overlayActions}>
          <button type="button" className={styles.btnDanger} onClick={onConfirm}>Clear all drafts</button>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Phase 7X.2A — fallback when the browser refuses the CSV download.
// Shows the CSV in a textarea + offers a "Copy CSV" button. Never
// writes to the server; nothing here touches inventory or cost basis.
function ExportFallbackDialog({ csv, rowCount, flash, onCopy, onClose }) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={`${styles.overlayCard} ${styles.exportFallbackCard}`}>
        <h3 className={styles.overlayTitle}>Export drafts — inline CSV</h3>
        <p className={styles.overlayText}>
          The browser blocked the download. Copy the {rowCount} row{rowCount === 1 ? '' : 's'} below
          and paste them into a spreadsheet or save them as a <code>.csv</code> file.
          Nothing is sent to the server.
        </p>
        <textarea
          className={styles.exportFallbackTextarea}
          value={csv}
          readOnly
          rows={10}
          onFocus={(e) => e.target.select()}
          aria-label="Drafts CSV text"
        />
        {flash && <p className={styles.exportFallbackFlash}>{flash}</p>}
        <div className={styles.overlayActions}>
          <button type="button" className={styles.btnPrimary} onClick={onCopy}>Copy CSV</button>
          <button type="button" className={styles.btnGhost} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// Phase 7X.1 — Field Walk Mode panel.
//
// Mobile-first focused overlay that presents one product at a time so
// Bryan can walk the chemical room and capture package sizes / standalone
// prices / notes / reviewed markers. INTENTIONALLY DOES NOT include
// Apply — this phase is data collection only. Apply remains the per-row
// click in the main grid.
function FieldWalkPanel({
  queue, cursor, drafts, setDraft, clearDraft, markReviewed,
  onPrev, onNext, onClose, includeCosted, onToggleIncludeCosted,
  showSavedFlash,
}) {
  const safeCursor = Math.min(Math.max(0, cursor), Math.max(0, queue.length - 1))
  const current    = queue[safeCursor] ?? null
  const total      = queue.length
  const atFirst    = safeCursor <= 0
  const atLast     = safeCursor >= total - 1

  return (
    <div className={styles.fieldWalkOverlay} role="dialog" aria-modal="true" aria-label="Field Walk Mode">
      <div className={styles.fieldWalkPanel}>
        <header className={styles.fieldWalkHeader}>
          <div className={styles.fieldWalkHeaderLeft}>
            <h3 className={styles.fieldWalkTitle}>Field Walk Mode</h3>
            <span className={styles.fieldWalkCounter}>
              {total === 0 ? 'Empty queue' : `${safeCursor + 1} of ${total}`}
            </span>
          </div>
          <button type="button" className={styles.fieldWalkClose} onClick={onClose} aria-label="Exit Field Walk Mode">
            ✕
          </button>
        </header>

        <div className={styles.fieldWalkScope}>
          <label className={styles.draftToggle}>
            <input
              type="checkbox"
              checked={includeCosted}
              onChange={onToggleIncludeCosted}
            />
            <span>Include already costed</span>
          </label>
        </div>

        {!current ? (
          <div className={styles.fieldWalkEmpty}>
            <p>No products in the field-walk queue.</p>
            <p className={styles.fieldWalkEmptyHint}>
              Try toggling “Include already costed” above, or exit Field Walk Mode.
            </p>
          </div>
        ) : (
          <FieldWalkCard
            inv={current.inv}
            bucketKey={current.bucketKey}
            draft={drafts[current.inv.id] ?? {}}
            setDraft={(p) => setDraft(current.inv.id, p)}
            clearDraft={() => clearDraft(current.inv.id)}
            markReviewed={() => markReviewed(current.inv.id)}
            showSavedFlash={showSavedFlash}
          />
        )}

        <footer className={styles.fieldWalkBar}>
          <button
            type="button"
            className={styles.fieldWalkNavBtn}
            onClick={onPrev}
            disabled={atFirst}
            aria-label="Previous product"
          >
            ← Previous
          </button>
          <button
            type="button"
            className={styles.fieldWalkSkipBtn}
            onClick={onNext}
            disabled={atLast || total === 0}
          >
            Skip
          </button>
          <button
            type="button"
            className={styles.fieldWalkNavBtnPrimary}
            onClick={onNext}
            disabled={atLast || total === 0}
            aria-label="Next product"
          >
            Next →
          </button>
        </footer>
      </div>
    </div>
  )
}

// Phase 7X.1 — Per-product focused entry card. Shows only the fields
// relevant to the row's bucket; never invokes Apply.
function FieldWalkCard({ inv, bucketKey, draft, setDraft, clearDraft, markReviewed, showSavedFlash }) {
  const existingCost = inv.costPerUnit != null && Number(inv.costPerUnit) > 0
  const derived = useMemo(() => deriveCostFromDraft(draft, inv), [draft, inv])
  const reviewed = draft.reviewed === true
  const showPackage    = bucketKey === 'packageSize' || bucketKey === 'missing' || bucketKey === 'conversion'
  const showStandalone = bucketKey === 'standalone'  || bucketKey === 'packageSize'
  const showNotesOnly  = bucketKey === 'name'

  return (
    <div className={styles.fieldWalkCard}>
      <div className={styles.fieldWalkProduct}>
        <h4 className={styles.fieldWalkProductName}>{inv.name}</h4>
        <div className={styles.fieldWalkProductMeta}>
          <span className={`${styles.statusBadge} ${styles[`statusBadge_${bucketKey}`] ?? ''}`}>
            {BUCKET_BADGE[bucketKey] ?? '—'}
          </span>
          {inv.vendor && <span>vendor: {inv.vendor}</span>}
          {inv.unit && <span>· stock unit: {inv.unit}</span>}
        </div>
      </div>

      <div className={styles.fieldWalkCurrentCost}>
        <span className={styles.fieldWalkCurrentCostLabel}>Current cost basis</span>
        <span className={styles.fieldWalkCurrentCostValue}>
          {existingCost
            ? `$${Number(inv.costPerUnit).toFixed(2)} / ${inv.costUnit ?? inv.unit ?? '—'}`
            : '—'}
        </span>
      </div>

      {DO_NOT_MERGE.has(inv.name) && (
        <p className={`${styles.fieldWalkBanner} ${styles.fieldWalkBanner_warn}`}>
          ⚠ Do NOT merge {inv.name} with its phite counterpart — these are separate products.
        </p>
      )}
      {NAME_RECONCILE_HINTS.has(inv.name) && (
        <p className={styles.fieldWalkBanner}>
          Name reconciliation needed — confirm the program name matches the inventory row name.
        </p>
      )}
      {STANDALONE_HINTS.has(inv.name) && (
        <p className={styles.fieldWalkBanner}>
          Standalone vendor price required before this can be costed.
        </p>
      )}

      {/* Entry fields — only the ones the row actually needs */}
      {showPackage && (
        <div className={styles.fieldWalkFields}>
          <label className={styles.fieldWalkField}>
            <span>Package size</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.packageSize ?? ''}
              onChange={e => setDraft({ packageSize: e.target.value })}
              placeholder="e.g. 2.5"
            />
          </label>
          <label className={styles.fieldWalkField}>
            <span>Package unit</span>
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
          <label className={styles.fieldWalkField}>
            <span>Purchase quantity</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.purchaseQuantity ?? ''}
              onChange={e => setDraft({ purchaseQuantity: e.target.value })}
              placeholder="e.g. 5"
            />
          </label>
          <label className={styles.fieldWalkField}>
            <span>Total cost</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.totalCost ?? ''}
              onChange={e => setDraft({ totalCost: e.target.value })}
              placeholder="e.g. 842.10"
            />
          </label>
        </div>
      )}

      {showStandalone && (
        <div className={styles.fieldWalkFields}>
          <label className={styles.fieldWalkField}>
            <span>Standalone price</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={draft.standalonePrice ?? ''}
              onChange={e => setDraft({ standalonePrice: e.target.value })}
              placeholder="e.g. 92.50"
            />
          </label>
          <label className={styles.fieldWalkField}>
            <span>Standalone unit</span>
            <input
              type="text"
              value={draft.standalonePriceUnit ?? ''}
              onChange={e => setDraft({ standalonePriceUnit: e.target.value })}
              placeholder="gal / lb / bottle"
            />
          </label>
        </div>
      )}

      {/* Name-reconcile rows: the only sensible entry is a free-form note */}
      <label className={styles.fieldWalkField}>
        <span>{showNotesOnly ? 'Reconcile notes' : 'Notes (optional)'}</span>
        <textarea
          rows={2}
          value={draft.note ?? ''}
          onChange={e => setDraft({ note: e.target.value })}
          placeholder={showNotesOnly
            ? 'Confirmed program / inventory name match …'
            : 'Vendor confirmation, label observation, …'}
        />
      </label>

      {derived && (
        <p className={styles.fieldWalkPreview}>
          <strong>Preview:</strong> ${derived.costPerUnit} / {derived.costUnit}
          <span className={styles.fieldWalkPreviewNote}> — {derived.note}</span>
        </p>
      )}

      <div className={styles.fieldWalkRowActions}>
        <button
          type="button"
          className={reviewed ? styles.btnPrimary : styles.btnGhost}
          onClick={markReviewed}
          aria-pressed={reviewed}
        >
          {reviewed ? '✓ Reviewed' : 'Mark reviewed'}
        </button>
        {Object.keys(draft ?? {}).length > 0 && (
          <button type="button" className={styles.btnGhost} onClick={clearDraft}>
            Clear draft
          </button>
        )}
        {showSavedFlash && (
          <span className={styles.fieldWalkSavedFlash}>Draft saved in this browser</span>
        )}
      </div>
    </div>
  )
}

function formatSavedAt(d) {
  if (!d) return ''
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function BucketCard({ bucket, items, drafts, draftsOnly = false, setDraft, clearDraft, onJump, onApply, applying, appliedFlash, errors }) {
  // Phase 7W.3 — when 'Drafts only' is on, the bucket renders only rows
  // the steward has touched (a meaningful draft exists).
  const visibleItems = draftsOnly
    ? items.filter(inv => isMeaningfulDraft(drafts?.[inv.id]))
    : items
  const count = visibleItems.length
  return (
    <section className={`${styles.bucket} ${styles[`bucket_${bucket.tone}`] ?? ''}`}>
      <header className={styles.bucketHeader}>
        <h4 className={styles.bucketTitle}>{bucket.title}</h4>
        <span className={styles.bucketCount}>{count}</span>
      </header>
      {count === 0 ? (
        <p className={styles.bucketEmpty}>
          {draftsOnly && items.length > 0
            ? 'No drafts in this bucket yet.'
            : 'No products in this bucket.'}
        </p>
      ) : (
        <ul className={styles.itemList}>
          {visibleItems.map(inv => (
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
          <div className={styles.itemNameRow}>
            <span className={styles.itemName}>{inv.name}</span>
            <span className={`${styles.statusBadge} ${styles[`statusBadge_${bucket}`] ?? ''}`}>
              {BUCKET_BADGE[bucket] ?? '—'}
            </span>
          </div>
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

      {/* Actions — Phase 7W.2: plain-language labels + apply-blocker reason */}
      <div className={styles.itemActions}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!derived || applying}
          onClick={() => derived && onApply(derived)}
          title={derived
            ? `Apply $${derived.costPerUnit}/${derived.costUnit} as the cost basis.`
            : applyBlockerReason(bucket, inv, derived)}
        >
          {applying ? 'Applying…' : (derived ? 'Apply cost basis' : 'Preview cost')}
        </button>
        {!derived && (
          <span className={styles.blockerReason}>
            {applyBlockerReason(bucket, inv, derived)}
          </span>
        )}
        <button type="button" className={styles.btnGhost} onClick={onJump}>
          Review item
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

// Phase 7W.2 — plain-language reason the Apply button is currently
// disabled. Returns the most specific blocker so a steward knows the
// next step.
function applyBlockerReason(bucket, inv, derived) {
  if (derived) return ''
  if (bucket === 'costed') return 'Already costed.'
  if (NAME_RECONCILE_HINTS.has(inv.name)) return 'Resolve name match first.'
  if (STANDALONE_HINTS.has(inv.name)) return 'Standalone price required.'
  if (bucket === 'standalone') return 'Standalone price required.'
  if (bucket === 'packageSize' || bucket === 'missing' || bucket === 'conversion') {
    return 'Enter package size first.'
  }
  return 'Fill in the inputs above to enable apply.'
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
