import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import {
  useSprayPrograms,
  createSprayProgram,
  updateSprayProgram,
  archiveSprayProgram,
  listSprayProgramItems,
  createSprayProgramItem,
  updateSprayProgramItem,
  deleteSprayProgramItem,
  setProgramItemCompletedLink,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useProductCatalog, getCatalogProductById } from '../../../utils/productCatalog/productCatalogStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { resolveProgramItemIntel } from '../../../utils/sprayPrograms/resolveProgramItemIntel'
import { buildPlanActualComparison } from '../../../utils/sprayPrograms/planActualComparison'
// Phase 7I (1/?) — read-only cost-awareness estimates.
import {
  estimateProgramItemCost,
  buildProgramCostSummary,
  formatEstimatedCost,
} from '../../../utils/sprayPrograms/programCostAwareness'
// Phase 7I (2/?) — cost-basis stewardship review (read-only).
import {
  buildCostBasisReview,
  summarizeCostBasisReview,
} from '../../../utils/sprayPrograms/costBasisReview'
import InventoryPickerModal       from './components/InventoryPickerModal'
import ProductCatalogPickerModal  from './components/ProductCatalogPickerModal'
import CompletedSprayPickerModal  from './components/CompletedSprayPickerModal'
import styles from './SprayProgramPlanner.module.css'

// Phase 7F (2/?) — Manual Spray Program Planner UI.
//
// Master/detail surface over the Phase 7F.1 data model:
//   - left/top: program list with create form (drawer-style inline)
//   - right/bottom: selected-program detail with planned-item list
//     and a compact item form
//
// Read-only intelligence boundary: this tab never writes
// linked_spray_record_id, never deducts inventory, never creates a
// spray_records row, and never touches product_catalog. The optional
// inventoryItemId / productCatalogId fields are typed in by hand for
// now — a picker UX lands in a later commit.

const PROGRAM_TYPES = ['greens', 'tees', 'fairways', 'rough', 'landscape', 'custom']
const PROGRAM_STATUSES = ['draft', 'active', 'archived']
const ITEM_STATUSES    = ['planned', 'completed', 'skipped', 'canceled']
const RATE_UNITS       = ['oz/1000 sq ft', 'oz/acre', 'fl oz/1000 sq ft', 'fl oz/acre', 'gal/acre', 'lb/1000 sq ft', 'lb/acre']
const CARRIER_UNITS    = ['gal/acre', 'gal/1000 sq ft']

const PLANNING_BOUNDARY_COPY = [
  'Planned programs do not deduct inventory.',
  'Planned items do not create completed spray records.',
  'Catalog links are for read-only intelligence.',
]

const EMPTY_PROGRAM_FORM = () => ({
  name: '', programType: 'greens',
  seasonYear: new Date().getFullYear(), notes: '',
})
const EMPTY_ITEM_FORM = () => ({
  targetArea: '', plannedStartDate: '', plannedEndDate: '',
  plannedWindowLabel: '', productName: '',
  inventoryItemId: '', productCatalogId: '',
  rateValue: '', rateUnit: 'oz/1000 sq ft',
  carrierVolumeValue: '', carrierVolumeUnit: 'gal/acre',
  applicationNotes: '', status: 'planned', sortOrder: 0,
})

export default function SprayProgramPlanner() {
  const { programs, itemsByProgramId, loading, error } = useSprayPrograms()
  // Phase 7F (3/?) — picker + intel inputs. Lazy-load only what's
  // needed; the catalog store is already lazy-fetched on first
  // subscribe, and inventory/labels load on workspace mount.
  const { items: inventoryItems }   = useInventoryData()
  const { products: catalogProducts } = useProductCatalog()
  const { labels: importedLabels }  = useImportedLabels()
  // Phase 7F (4/?) — completed-spray records for plan-vs-actual linking.
  const { records: sprayRecords }    = useSpraysData()
  // Quick lookup so the linked-summary card on an item resolves
  // without a second pass.
  const sprayRecordsById = useMemo(() => {
    const out = {}
    for (const r of sprayRecords ?? []) if (r?.id) out[r.id] = r
    return out
  }, [sprayRecords])
  const labelsByItemId = useMemo(() => {
    const out = {}
    for (const lbl of importedLabels ?? []) {
      if (lbl?.inventoryItemId) out[lbl.inventoryItemId] = lbl
    }
    return out
  }, [importedLabels])
  const intelContext = useMemo(() => ({
    inventoryProducts: inventoryItems ?? [],
    catalogProducts:   catalogProducts ?? [],
    labelsByItemId,
  }), [inventoryItems, catalogProducts, labelsByItemId])

  // ── Program-level state ──────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(null)
  const [creatingProgram, setCreatingProgram] = useState(false)
  const [programForm, setProgramForm] = useState(EMPTY_PROGRAM_FORM)
  const [editingProgram, setEditingProgram] = useState(false)
  const [programErr, setProgramErr] = useState(null)
  const [programSubmitting, setProgramSubmitting] = useState(false)

  // ── Item-level state ─────────────────────────────────────────────────
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM)
  const [editingItemId, setEditingItemId] = useState(null)   // null|'new'|<id>
  const [itemErr, setItemErr] = useState(null)
  const [itemSubmitting, setItemSubmitting] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  // Phase 7F (3/?) — picker visibility. Only one picker open at a time.
  const [pickerOpen, setPickerOpen] = useState(null)  // null | 'inventory' | 'catalog'
  // Phase 7F (4/?) — completed-spray picker is scoped to the item being
  // linked, so we track the active item id alongside the modal state.
  const [completedLinkItem, setCompletedLinkItem] = useState(null) // null | program item row
  const [completedLinkErr,  setCompletedLinkErr]  = useState(null)

  const selected = programs.find(p => p.id === selectedId) ?? null
  const items    = selectedId ? (itemsByProgramId[selectedId] ?? []) : []

  // Phase 7I (1/?) — read-only cost-awareness summary for the selected
  // program. Recomputed only when the items list or inventory changes.
  const costSummary = useMemo(
    () => (selected ? buildProgramCostSummary(selected, items, intelContext) : null),
    [selected, items, intelContext],
  )
  // Phase 7I (2/?) — cost-basis stewardship review over ALL programs in
  // the workspace. Recomputed when the program list or inventory shifts.
  const navigate = useNavigate()
  const costBasisReview = useMemo(
    () => buildCostBasisReview(programs ?? [], itemsByProgramId ?? {}, inventoryItems ?? []),
    [programs, itemsByProgramId, inventoryItems],
  )
  const costBasisSummary = useMemo(
    () => summarizeCostBasisReview(costBasisReview),
    [costBasisReview],
  )
  function openInventoryItem(inventoryItemId) {
    if (!inventoryItemId) return
    // Phase 7J (2/?) — carry deep-link intent so the inventory tab
    // can auto-open the drawer AND focus the cost-basis editor with
    // a contextual banner. The Phase 7C.2 (catalog-link) state shape
    // stays untouched; we just add two opt-in keys.
    navigate('/inventory', {
      state: {
        activeTab: 'Products',
        productId: inventoryItemId,
        focus:     'cost-basis',
        source:    'spray-program-cost-basis-review',
      },
    })
  }

  // Auto-load items for the selected program (lazy per-program cache
  // in the store).
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setItemsLoading(true)
    listSprayProgramItems(selectedId)
      .catch(() => { /* surfaced via store error */ })
      .finally(() => { if (!cancelled) setItemsLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  // Whenever the user picks a different program, drop any half-edited
  // item form so we don't carry stale state across details.
  useEffect(() => {
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM())
    setItemErr(null)
    setEditingProgram(false)
    setProgramErr(null)
  }, [selectedId])

  // ── Program handlers ─────────────────────────────────────────────────
  async function submitNewProgram(e) {
    e.preventDefault()
    if (!programForm.name.trim()) return
    setProgramSubmitting(true)
    setProgramErr(null)
    try {
      const saved = await createSprayProgram({
        name:        programForm.name.trim(),
        programType: programForm.programType,
        seasonYear:  Number.parseInt(programForm.seasonYear, 10) || null,
        notes:       programForm.notes.trim() || null,
        status:      'draft',
        source:      'manual',
      })
      setProgramForm(EMPTY_PROGRAM_FORM())
      setCreatingProgram(false)
      setSelectedId(saved?.id ?? null)
    } catch (err) {
      setProgramErr(err.message || 'Could not create program')
    } finally {
      setProgramSubmitting(false)
    }
  }

  function startEditProgram() {
    if (!selected) return
    setProgramForm({
      name:        selected.name ?? '',
      programType: selected.programType ?? 'greens',
      seasonYear:  selected.seasonYear ?? new Date().getFullYear(),
      notes:       selected.notes ?? '',
      status:      selected.status ?? 'draft',
    })
    setEditingProgram(true)
    setProgramErr(null)
  }

  async function submitEditProgram(e) {
    e.preventDefault()
    if (!selected) return
    if (!programForm.name.trim()) return
    setProgramSubmitting(true)
    setProgramErr(null)
    try {
      await updateSprayProgram(selected.id, {
        name:        programForm.name.trim(),
        programType: programForm.programType,
        seasonYear:  Number.parseInt(programForm.seasonYear, 10) || null,
        notes:       programForm.notes.trim() || null,
        status:      programForm.status ?? selected.status,
      })
      setEditingProgram(false)
    } catch (err) {
      setProgramErr(err.message || 'Could not update program')
    } finally {
      setProgramSubmitting(false)
    }
  }

  async function handleArchive() {
    if (!selected) return
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Archive "${selected.name}"? Planned sprays can be reactivated later.`)
      : true
    if (!ok) return
    try {
      await archiveSprayProgram(selected.id)
      setSelectedId(null)
    } catch (err) {
      setProgramErr(err.message || 'Could not archive program')
    }
  }

  // ── Item handlers ────────────────────────────────────────────────────
  function startNewItem() {
    setItemForm({ ...EMPTY_ITEM_FORM(), sortOrder: items.length })
    setEditingItemId('new')
    setItemErr(null)
  }

  function startEditItem(item) {
    setItemForm({
      targetArea:         item.targetArea         ?? '',
      plannedStartDate:   item.plannedStartDate   ?? '',
      plannedEndDate:     item.plannedEndDate     ?? '',
      plannedWindowLabel: item.plannedWindowLabel ?? '',
      productName:        item.productName        ?? '',
      inventoryItemId:    item.inventoryItemId    ?? '',
      productCatalogId:   item.productCatalogId   ?? '',
      rateValue:          item.rateValue          ?? '',
      rateUnit:           item.rateUnit           ?? 'oz/1000 sq ft',
      carrierVolumeValue: item.carrierVolumeValue ?? '',
      carrierVolumeUnit:  item.carrierVolumeUnit  ?? 'gal/acre',
      applicationNotes:   item.applicationNotes   ?? '',
      status:             item.status             ?? 'planned',
      sortOrder:          item.sortOrder          ?? 0,
    })
    setEditingItemId(item.id)
    setItemErr(null)
  }

  function cancelItemEdit() {
    setEditingItemId(null)
    setItemForm(EMPTY_ITEM_FORM())
    setItemErr(null)
  }

  function buildItemPayload() {
    const rv = parseFloat(itemForm.rateValue)
    const cv = parseFloat(itemForm.carrierVolumeValue)
    const so = parseInt(itemForm.sortOrder, 10)
    return {
      targetArea:         itemForm.targetArea.trim()         || null,
      plannedStartDate:   itemForm.plannedStartDate          || null,
      plannedEndDate:     itemForm.plannedEndDate            || null,
      plannedWindowLabel: itemForm.plannedWindowLabel.trim() || null,
      productName:        itemForm.productName.trim()        || null,
      inventoryItemId:    itemForm.inventoryItemId.trim()    || null,
      productCatalogId:   itemForm.productCatalogId.trim()   || null,
      rateValue:          Number.isFinite(rv) ? rv : null,
      rateUnit:           itemForm.rateUnit                  || null,
      carrierVolumeValue: Number.isFinite(cv) ? cv : null,
      carrierVolumeUnit:  itemForm.carrierVolumeUnit         || null,
      applicationNotes:   itemForm.applicationNotes.trim()   || null,
      status:             itemForm.status                    || 'planned',
      sortOrder:          Number.isFinite(so) ? so : 0,
    }
  }

  async function submitItem(e) {
    e.preventDefault()
    if (!selectedId) return
    setItemSubmitting(true)
    setItemErr(null)
    try {
      const payload = buildItemPayload()
      if (editingItemId === 'new') {
        await createSprayProgramItem(selectedId, payload)
      } else {
        await updateSprayProgramItem(editingItemId, payload)
      }
      cancelItemEdit()
    } catch (err) {
      setItemErr(err.message || 'Could not save item')
    } finally {
      setItemSubmitting(false)
    }
  }

  async function removeItem(item) {
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Remove "${item.productName ?? 'this item'}"?`)
      : true
    if (!ok) return
    try {
      await deleteSprayProgramItem(item.id)
    } catch (err) {
      setItemErr(err.message || 'Could not delete item')
    }
  }

  // ── Phase 7F (4/?) — completed-record link handlers ────────────────
  function openCompletedLinkPicker(item) {
    setCompletedLinkErr(null)
    setCompletedLinkItem(item)
  }
  function closeCompletedLinkPicker() {
    setCompletedLinkItem(null)
  }
  async function commitCompletedLink(sprayRecord) {
    if (!completedLinkItem) return
    try {
      await setProgramItemCompletedLink(completedLinkItem.id, sprayRecord.id)
      setCompletedLinkItem(null)
    } catch (err) {
      setCompletedLinkErr(err.message || 'Could not link spray record')
    }
  }
  async function clearCompletedLink(item) {
    const ok = typeof window !== 'undefined'
      ? window.confirm('Remove the link to this completed spray record? Completed records remain unchanged.')
      : true
    if (!ok) return
    try {
      await setProgramItemCompletedLink(item.id, null)
    } catch (err) {
      setItemErr(err.message || 'Could not clear link')
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Planned Sprays"
        subtitle="Plan upcoming sprays. Planned sprays hold intent only — they do not deduct inventory or create spray records."
      >
        <PlanningBoundaryNote />

        {error && (
          <EmptyState
            title="Could not load planned sprays."
            description={error}
          />
        )}

        {!error && loading && programs.length === 0 && (
          <EmptyState compact title="Loading planned sprays…" />
        )}

        {!error && !loading && programs.length === 0 && !creatingProgram && (
          <EmptyState
            title="No planned sprays yet."
            description="Create a planned spray to lay out future applications."
          >
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setCreatingProgram(true)}
            >
              + Create planned spray
            </button>
          </EmptyState>
        )}

        {!error && (programs.length > 0 || creatingProgram) && (
          <div className={styles.layout}>
            {/* ── Master: planned-spray list ───────────────────────── */}
            <div className={styles.master}>
              <div className={styles.toolbarRow}>
                <span className={styles.countLabel}>
                  {programs.length} planned spray{programs.length !== 1 ? 's' : ''}
                </span>
                {!creatingProgram && (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      setProgramForm(EMPTY_PROGRAM_FORM())
                      setCreatingProgram(true)
                      setProgramErr(null)
                    }}
                  >
                    + New
                  </button>
                )}
              </div>

              {creatingProgram && (
                <ProgramForm
                  title="New planned spray"
                  form={programForm}
                  setForm={setProgramForm}
                  onSubmit={submitNewProgram}
                  onCancel={() => { setCreatingProgram(false); setProgramErr(null) }}
                  submitting={programSubmitting}
                  submitErr={programErr}
                  showStatus={false}
                />
              )}

              <ul className={styles.programList}>
                {programs.map(p => {
                  const itemCount = (itemsByProgramId[p.id] ?? []).length
                  const isSel = p.id === selectedId
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`${styles.programCard} ${isSel ? styles.programCardSel : ''} ${p._pending ? styles.pending : ''}`}
                        onClick={() => setSelectedId(p.id)}
                        aria-current={isSel ? 'true' : undefined}
                      >
                        <div className={styles.programMain}>
                          <span className={styles.programName}>{p.name}</span>
                          <span className={styles.programMeta}>
                            {p.programType && <span className={styles.programType}>{p.programType}</span>}
                            {p.seasonYear && <span> · {p.seasonYear}</span>}
                            <span className={styles[`programStatus_${p.status}`] ?? ''}> · {p.status}</span>
                            {p.source && <span> · {p.source}</span>}
                          </span>
                          <div className={styles.programSub}>
                            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                            {p.updatedAt && (
                              <span className={styles.programDate}>
                                · updated {p.updatedAt.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* ── Detail: items + edit ─────────────────────────────── */}
            <div className={styles.detail}>
              {!selected ? (
                <EmptyState
                  compact
                  title="Select a planned spray"
                  description="Choose a program from the list to view planned items."
                />
              ) : editingProgram ? (
                <ProgramForm
                  title={`Edit "${selected.name}"`}
                  form={programForm}
                  setForm={setProgramForm}
                  onSubmit={submitEditProgram}
                  onCancel={() => { setEditingProgram(false); setProgramErr(null) }}
                  submitting={programSubmitting}
                  submitErr={programErr}
                  showStatus
                />
              ) : (
                <>
                  <div className={styles.detailHeader}>
                    <div>
                      <h3 className={styles.detailTitle}>{selected.name}</h3>
                      <p className={styles.detailMeta}>
                        {selected.programType ?? '—'} ·{' '}
                        {selected.seasonYear ?? '—'} ·{' '}
                        <span className={styles[`programStatus_${selected.status}`] ?? ''}>
                          {selected.status}
                        </span>
                        {selected.archivedAt && (
                          <span> · archived {selected.archivedAt.slice(0, 10)}</span>
                        )}
                      </p>
                      {selected.notes && (
                        <p className={styles.detailNotes}>{selected.notes}</p>
                      )}
                      {/* Phase 7I (1/?) — read-only cost-awareness summary. */}
                      <ProgramCostHeader summary={costSummary} />
                      {/* Phase 7I (2/?) — read-only cost-basis stewardship review. */}
                      <CostBasisReviewPanel
                        review={costBasisReview}
                        summary={costBasisSummary}
                        onOpenInventoryItem={openInventoryItem}
                      />
                    </div>
                    <div className={styles.detailActions}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={startEditProgram}
                      >
                        Edit program
                      </button>
                      {selected.status !== 'archived' && (
                        <button
                          type="button"
                          className={styles.btnDanger}
                          onClick={handleArchive}
                          title="Planned sprays can be reactivated later."
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.itemsSection}>
                    <div className={styles.toolbarRow}>
                      <span className={styles.sectionLabel}>Planned items</span>
                      {editingItemId == null && (
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          onClick={startNewItem}
                        >
                          + Add item
                        </button>
                      )}
                    </div>

                    {editingItemId != null && (
                      <ItemForm
                        title={editingItemId === 'new' ? 'New planned item' : 'Edit planned item'}
                        form={itemForm}
                        setForm={setItemForm}
                        onSubmit={submitItem}
                        onCancel={cancelItemEdit}
                        submitting={itemSubmitting}
                        submitErr={itemErr}
                        inventoryItems={inventoryItems}
                        catalogProducts={catalogProducts}
                        onOpenPicker={(kind) => setPickerOpen(kind)}
                      />
                    )}

                    {itemsLoading && items.length === 0 && (
                      <p className={styles.dimNote}>Loading items…</p>
                    )}

                    {!itemsLoading && items.length === 0 && editingItemId == null && (
                      <EmptyState
                        compact
                        title="No planned items yet."
                        description="Add the first product or application window."
                      />
                    )}

                    {items.length > 0 && (
                      <ul className={styles.itemList}>
                        {items.map(item => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            intelContext={intelContext}
                            linkedSpray={item.linkedSprayRecordId
                              ? sprayRecordsById[item.linkedSprayRecordId] ?? null
                              : null}
                            onEdit={() => startEditItem(item)}
                            onRemove={() => removeItem(item)}
                            onLinkCompleted={() => openCompletedLinkPicker(item)}
                            onClearCompleted={() => clearCompletedLink(item)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </WorkspaceSection>

      {/* Phase 7F (3/?) — picker modals. Open over the planner; close
          on cancel or selection. Selection populates the item form
          directly — no D1 writes, no inventory deduction. */}
      {pickerOpen === 'inventory' && (
        <InventoryPickerModal
          onCancel={() => setPickerOpen(null)}
          onSelect={(invItem) => {
            setItemForm(form => ({
              ...form,
              inventoryItemId: invItem.id,
              // If productName is empty, fill it from the chosen inv row.
              productName: form.productName?.trim() ? form.productName : (invItem.name ?? ''),
            }))
            setPickerOpen(null)
          }}
        />
      )}
      {pickerOpen === 'catalog' && (
        <ProductCatalogPickerModal
          onCancel={() => setPickerOpen(null)}
          onSelect={(catalogProduct) => {
            setItemForm(form => ({
              ...form,
              productCatalogId: catalogProduct.id,
              productName: form.productName?.trim()
                ? form.productName
                : (catalogProduct.productName ?? ''),
            }))
            setPickerOpen(null)
          }}
        />
      )}
      {completedLinkItem && (
        <CompletedSprayPickerModal
          onCancel={closeCompletedLinkPicker}
          onSelect={commitCompletedLink}
        />
      )}
      {completedLinkErr && (
        <p className={styles.errorBanner} role="alert">{completedLinkErr}</p>
      )}
    </div>
  )
}

// Phase 7F (3/?) — one item row, with intel chips resolved from the
// catalog-first 3-tier resolver. Pure render; chips are derived, not
// persisted.
function ItemRow({ item, intelContext, linkedSpray, onEdit, onRemove, onLinkCompleted, onClearCompleted }) {
  const intel = useMemo(
    () => resolveProgramItemIntel(item, intelContext),
    [item, intelContext],
  )
  const hasIntel = intel && intel.source && intel.source !== 'none'

  return (
    <li className={`${styles.itemCard} ${item._pending ? styles.pending : ''}`}>
      <div className={styles.itemMain}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemProduct}>
            {item.productName ?? '(no product)'}
          </span>
          <span className={styles[`itemStatus_${item.status}`] ?? styles.itemStatus}>
            {item.status}
          </span>
        </div>
        <div className={styles.itemMeta}>
          {item.targetArea && <span>📍 {item.targetArea}</span>}
          {item.plannedWindowLabel && <span>🗓 {item.plannedWindowLabel}</span>}
          {(item.plannedStartDate || item.plannedEndDate) && (
            <span>
              {item.plannedStartDate ?? '?'}
              {item.plannedEndDate ? ` → ${item.plannedEndDate}` : ''}
            </span>
          )}
        </div>
        {(item.rateValue != null || item.carrierVolumeValue != null) && (
          <div className={styles.itemMeta}>
            {item.rateValue != null && (
              <span>Rate: {item.rateValue} {item.rateUnit ?? ''}</span>
            )}
            {item.carrierVolumeValue != null && (
              <span>Carrier: {item.carrierVolumeValue} {item.carrierVolumeUnit ?? ''}</span>
            )}
          </div>
        )}

        {/* Compact link chips for the raw FK references the planner stored. */}
        {(item.inventoryItemId || item.productCatalogId) && (
          <div className={styles.itemLinks}>
            {item.inventoryItemId && (
              <span className={styles.linkChip} title="Linked inventory item">
                📦 inv {item.inventoryItemId.slice(0, 12)}
              </span>
            )}
            {item.productCatalogId && (
              <span className={styles.linkChip} title="Linked catalog product (read-only)">
                📋 catalog {item.productCatalogId.slice(0, 12)}
              </span>
            )}
          </div>
        )}

        {/* Read-only intel chips resolved from catalog/label/legacy. */}
        {hasIntel && <ItemIntelChips intel={intel} />}
        {!hasIntel && (item.productCatalogId || item.inventoryItemId) && (
          <p className={styles.intelEmpty}>No linked intelligence available.</p>
        )}

        {/* Phase 7I (1/?) — read-only cost-awareness chip. */}
        <ItemCostChip item={item} intelContext={intelContext} />

        {item.applicationNotes && (
          <p className={styles.itemNotes}>{item.applicationNotes}</p>
        )}

        {/* Phase 7F (4/?) — plan-vs-actual: linked completed spray. */}
        <CompletedLinkSummary
          item={item}
          linkedSpray={linkedSpray}
          onClear={onClearCompleted}
        />
      </div>
      <div className={styles.itemActions}>
        <button type="button" className={styles.btnGhost} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={styles.btnGhost} onClick={onLinkCompleted}>
          {item.linkedSprayRecordId ? 'Change completed spray' : 'Link completed spray'}
        </button>
        <button type="button" className={styles.btnDangerGhost} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  )
}

// Phase 7F (4/?) — Linked completed-spray summary on a planned item.
// Three states:
//   1. No linkedSprayRecordId       → nothing.
//   2. Linked + record in cache     → green summary card + Clear button.
//   3. Linked + cache miss          → yellow stale-id warning + Clear button.
function CompletedLinkSummary({ item, linkedSpray, onClear }) {
  const fk = item?.linkedSprayRecordId ?? null
  if (!fk) return null

  if (linkedSpray) {
    const productCount = Array.isArray(linkedSpray.products) ? linkedSpray.products.length : 0
    return (
      <div className={styles.completedLink}>
        <div className={styles.completedLinkMain}>
          <span className={styles.completedLinkBadge}>Linked completed record</span>
          <div className={styles.completedLinkTitle}>
            {linkedSpray.applicationName ?? '(unnamed spray)'}
          </div>
          <div className={styles.completedLinkSub}>
            {[linkedSpray.date, linkedSpray.area].filter(Boolean).join(' · ')}
            {productCount > 0 && ` · ${productCount} product${productCount !== 1 ? 's' : ''}`}
          </div>
          <p className={styles.completedLinkBoundary}>
            Linking connects this planned item to an existing completed spray record. This does not create a spray record. This does not deduct inventory. Completed records remain unchanged.
          </p>
          <PlanVsActualBlock item={item} linkedSpray={linkedSpray} />
        </div>
        <button
          type="button"
          className={styles.btnDangerGhost}
          onClick={onClear}
        >Clear completed link</button>
      </div>
    )
  }

  return (
    <div className={styles.completedLinkStale}>
      <div className={styles.completedLinkMain}>
        <span className={styles.completedLinkBadge}>Linked completed record</span>
        <div className={styles.completedLinkSub}>
          Linked spray record not currently cached. The link does not create or modify a spray record.
        </div>
        <div className={styles.completedLinkFk}>id: {fk}</div>
      </div>
      <button
        type="button"
        className={styles.btnDangerGhost}
        onClick={onClear}
      >Clear completed link</button>
    </div>
  )
}

function ItemIntelChips({ intel }) {
  const groupChips = []
  if (intel.fracGroup) groupChips.push(['FRAC', intel.fracGroup, styles.intelChipFrac])
  if (intel.hracGroup) groupChips.push(['HRAC', intel.hracGroup, styles.intelChipHrac])
  if (intel.iracGroup) groupChips.push(['IRAC', intel.iracGroup, styles.intelChipIrac])
  if (intel.pgrClass)  groupChips.push(['PGR',  intel.pgrClass,  styles.intelChipPgr])

  const showSignal = intel.signalWord
    && /^(warning|danger)$/i.test(String(intel.signalWord).trim())

  if (groupChips.length === 0 && intel.reiHours == null && !intel.restrictedUse && !showSignal) {
    return null
  }

  return (
    <div className={styles.intelChipRow}>
      {intel.source === 'catalog' && (
        <span className={styles.intelChipLinked} title="Read-only catalog intelligence">
          📋 Catalog
        </span>
      )}
      {groupChips.map(([label, value, cls]) => (
        <span key={label} className={`${styles.intelChip} ${cls}`}>
          <span className={styles.intelChipLabel}>{label}</span>
          {value}
        </span>
      ))}
      {intel.reiHours != null && (
        <span className={`${styles.intelChip} ${styles.intelChipRei}`}>
          <span className={styles.intelChipLabel}>REI</span>
          {intel.reiHours}h
        </span>
      )}
      {intel.restrictedUse && (
        <span className={`${styles.intelChip} ${styles.intelChipRup}`}>RUP</span>
      )}
      {showSignal && (
        <span className={`${styles.intelChip} ${styles.intelChipSignal}`}>
          {intel.signalWord}
        </span>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function PlanningBoundaryNote() {
  return (
    <p className={styles.boundaryNote}>
      {PLANNING_BOUNDARY_COPY.join(' ')}
    </p>
  )
}

function ProgramForm({ title, form, setForm, onSubmit, onCancel, submitting, submitErr, showStatus }) {
  return (
    <form className={styles.createForm} onSubmit={onSubmit}>
      <h4 className={styles.createTitle}>{title}</h4>
      <p className={styles.createHint}>
        Programs hold intent only. No inventory will be deducted and no spray records will be created.
      </p>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Planned spray name <span aria-hidden className={styles.req}>*</span>
          <input
            type="text"
            className={styles.formInput}
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
            placeholder="e.g. 2026 Greens Fungicide Program"
          />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Program type
          <select
            className={styles.formInput}
            value={form.programType}
            onChange={e => setForm({ ...form, programType: e.target.value })}
          >
            {PROGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className={styles.formLabel}>
          Season year
          <input
            type="number"
            className={styles.formInput}
            value={form.seasonYear}
            onChange={e => setForm({ ...form, seasonYear: e.target.value })}
          />
        </label>
        {showStatus && (
          <label className={styles.formLabel}>
            Status
            <select
              className={styles.formInput}
              value={form.status ?? 'draft'}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              {PROGRAM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Notes
          <textarea
            className={`${styles.formInput} ${styles.formTextarea}`}
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
        </label>
      </div>
      {submitErr && <p className={styles.errorBanner}>{submitErr}</p>}
      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={submitting || !form.name.trim()}
        >
          {submitting ? 'Saving…' : 'Save program'}
        </button>
      </div>
    </form>
  )
}

function ItemForm({
  title, form, setForm, onSubmit, onCancel, submitting, submitErr,
  inventoryItems = [],
  catalogProducts = [],
  onOpenPicker,
}) {
  function set(field, value) { setForm({ ...form, [field]: value }) }
  // Resolve currently-linked summaries from the in-memory caches.
  const linkedInv = form.inventoryItemId
    ? inventoryItems.find(i => i.id === form.inventoryItemId)
    : null
  const linkedCat = form.productCatalogId
    ? catalogProducts.find(c => c.id === form.productCatalogId)
    : null

  function clearInventory() {
    setForm({ ...form, inventoryItemId: '' })
  }
  function clearCatalog() {
    setForm({ ...form, productCatalogId: '' })
  }
  return (
    <form className={styles.createForm} onSubmit={onSubmit}>
      <h4 className={styles.createTitle}>{title}</h4>
      <p className={styles.createHint}>
        Planned items do not create spray records and do not deduct inventory. Optional links are typed by id for now (picker UX lands later).
      </p>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Product name
          <input
            type="text"
            className={styles.formInput}
            value={form.productName}
            onChange={e => set('productName', e.target.value)}
            placeholder="e.g. Heritage 50WG"
          />
        </label>
        <label className={styles.formLabel}>
          Target area
          <input
            type="text"
            className={styles.formInput}
            value={form.targetArea}
            onChange={e => set('targetArea', e.target.value)}
            placeholder="e.g. Greens"
          />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Planned start
          <input
            type="date"
            className={styles.formInput}
            value={form.plannedStartDate}
            onChange={e => set('plannedStartDate', e.target.value)}
          />
        </label>
        <label className={styles.formLabel}>
          Planned end
          <input
            type="date"
            className={styles.formInput}
            value={form.plannedEndDate}
            onChange={e => set('plannedEndDate', e.target.value)}
          />
        </label>
        <label className={styles.formLabel}>
          Window label
          <input
            type="text"
            className={styles.formInput}
            value={form.plannedWindowLabel}
            onChange={e => set('plannedWindowLabel', e.target.value)}
            placeholder="e.g. Pre-emergent 1st app"
          />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Rate
          <input
            type="number"
            step="0.01"
            className={styles.formInput}
            value={form.rateValue}
            onChange={e => set('rateValue', e.target.value)}
          />
        </label>
        <label className={styles.formLabel}>
          Rate unit
          <select
            className={styles.formInput}
            value={form.rateUnit}
            onChange={e => set('rateUnit', e.target.value)}
          >
            {RATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className={styles.formLabel}>
          Carrier
          <input
            type="number"
            step="0.1"
            className={styles.formInput}
            value={form.carrierVolumeValue}
            onChange={e => set('carrierVolumeValue', e.target.value)}
          />
        </label>
        <label className={styles.formLabel}>
          Carrier unit
          <select
            className={styles.formInput}
            value={form.carrierVolumeUnit}
            onChange={e => set('carrierVolumeUnit', e.target.value)}
          >
            {CARRIER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      {/* Phase 7F (3/?) — picker-driven optional links. Both fields are
          stewardship-only: selecting does not deduct inventory and does
          not mutate the catalog. */}
      <div className={styles.linkPickers}>
        <PickerSlot
          label="Inventory link"
          hint="Inventory links are for planning only and do not deduct stock."
          onPick={() => onOpenPicker?.('inventory')}
          onClear={form.inventoryItemId ? clearInventory : null}
          selected={linkedInv
            ? {
                title: linkedInv.name,
                sub:   [linkedInv.category || linkedInv.kind, linkedInv.location].filter(Boolean).join(' · '),
                meta:  linkedInv.quantity != null
                  ? `${linkedInv.quantity} ${linkedInv.unit ?? ''}`.trim()
                  : null,
              }
            : null}
          rawId={form.inventoryItemId}
        />
        <PickerSlot
          label="Catalog link"
          hint="Catalog links provide read-only intelligence."
          onPick={() => onOpenPicker?.('catalog')}
          onClear={form.productCatalogId ? clearCatalog : null}
          selected={linkedCat
            ? {
                title: linkedCat.productName,
                sub:   [linkedCat.category, linkedCat.brandOwner].filter(Boolean).join(' · '),
                meta: [
                  linkedCat.fracGroup && `FRAC ${linkedCat.fracGroup}`,
                  linkedCat.hracGroup && `HRAC ${linkedCat.hracGroup}`,
                  linkedCat.iracGroup && `IRAC ${linkedCat.iracGroup}`,
                  linkedCat.pgrClass  && `PGR ${linkedCat.pgrClass}`,
                ].filter(Boolean).join(' · '),
              }
            : null}
          rawId={form.productCatalogId}
        />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Status
          <select
            className={styles.formInput}
            value={form.status}
            onChange={e => set('status', e.target.value)}
          >
            {ITEM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className={styles.formLabel}>
          Sort order
          <input
            type="number"
            className={styles.formInput}
            value={form.sortOrder}
            onChange={e => set('sortOrder', e.target.value)}
          />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Notes
          <textarea
            className={`${styles.formInput} ${styles.formTextarea}`}
            value={form.applicationNotes}
            onChange={e => set('applicationNotes', e.target.value)}
            rows={2}
          />
        </label>
      </div>
      {submitErr && <p className={styles.errorBanner}>{submitErr}</p>}
      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Save item'}
        </button>
      </div>
    </form>
  )
}

// Phase 7F (3/?) — link-picker slot shared by the item form.
function PickerSlot({ label, hint, onPick, onClear, selected, rawId }) {
  return (
    <div className={styles.pickerSlot}>
      <div className={styles.pickerHeader}>
        <span className={styles.pickerLabel}>{label}</span>
        <div className={styles.pickerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onPick}>
            {selected ? "Change" : "Select"}
          </button>
          {onClear && (
            <button type="button" className={styles.btnGhost} onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </div>
      <p className={styles.pickerHint}>{hint}</p>
      {selected ? (
        <div className={styles.pickerCard}>
          <div className={styles.pickerCardTitle}>{selected.title}</div>
          {selected.sub && <div className={styles.pickerCardSub}>{selected.sub}</div>}
          {selected.meta && <div className={styles.pickerCardMeta}>{selected.meta}</div>}
        </div>
      ) : rawId ? (
        <div className={styles.pickerCardStale}>
          <strong>Linked id:</strong> {rawId} <span>(not currently cached)</span>
        </div>
      ) : (
        <div className={styles.pickerCardEmpty}>No link selected.</div>
      )}
    </div>
  )
}

// Phase 7F (5/?) — Plan vs Actual comparison chips. Pure-render block
// that surfaces the helper's neutral-language summary inline on a
// linked planned item card. The helper itself never writes; this
// component just reads its output.
function PlanVsActualBlock({ item, linkedSpray }) {
  const result = useMemo(
    () => buildPlanActualComparison(item, linkedSpray),
    [item, linkedSpray],
  )
  if (!result?.linked) return null
  if (!Array.isArray(result.summary) || result.summary.length === 0) return null

  return (
    <div className={styles.planActualBlock}>
      <div className={styles.planActualHeader}>Plan vs Actual</div>
      <ul className={styles.planActualList}>
        {result.summary.map((n, i) => (
          <li key={`${n.label}-${i}`} className={styles.planActualItem}>
            <span className={styles.planActualChipLabel}>{n.label}</span>
            <span className={styles.planActualChipValue}>{n.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Phase 7I (1/?) — read-only cost-awareness summary for the selected
// program. Renders a compact chip row + an estimate-boundary note.
// No writes, no fetches, no inventory deduction; the helper computes
// against the planner-provided context only.
const COST_BOUNDARY_COPY = [
  'Cost awareness is an estimate.',
  'Planning estimates do not create budget entries.',
  'Inventory is not deducted from planned items.',
  'Missing cost basis means no inventory cost is available.',
]
function ProgramCostHeader({ summary }) {
  if (!summary) return null
  const {
    estimatedTotal, currency, estimatedItems,
    missingCostBasis, missingQuantity, notComparableUnits,
  } = summary
  return (
    <div className={styles.costHeader}>
      <div className={styles.costHeaderChips}>
        <span className={`${styles.costChip} ${styles.costChipEstimate}`}>
          <span className={styles.costChipLabel}>Est. cost</span>
          {formatEstimatedCost(estimatedTotal, currency)}
        </span>
        <span className={styles.costChip}>
          <span className={styles.costChipLabel}>Items estimated</span>{estimatedItems}
        </span>
        {missingCostBasis > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Missing cost basis</span>{missingCostBasis}
          </span>
        )}
        {missingQuantity > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Missing quantity</span>{missingQuantity}
          </span>
        )}
        {notComparableUnits > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Unit mismatch</span>{notComparableUnits}
          </span>
        )}
      </div>
      <p className={styles.costBoundaryNote}>{COST_BOUNDARY_COPY.join(' ')}</p>
    </div>
  )
}

// Phase 7I (1/?) — per-item cost chip. Renders an estimated value when
// available, otherwise a clear "missing cost basis / quantity / unit"
// note. Always read-only.
function ItemCostChip({ item, intelContext }) {
  const result = useMemo(
    () => estimateProgramItemCost(item, intelContext ?? {}),
    [item, intelContext],
  )
  if (!result) return null
  if (result.status === 'estimated') {
    return (
      <div className={styles.itemCostRow}>
        <span className={`${styles.costChip} ${styles.costChipEstimate}`}>
          <span className={styles.costChipLabel}>Est. cost</span>
          {formatEstimatedCost(result.estimatedCost, result.currency)}
        </span>
        <span className={styles.itemCostNote}>{result.message}</span>
      </div>
    )
  }
  return (
    <div className={styles.itemCostRow}>
      <span className={`${styles.costChip} ${styles.costChipWarn}`}>
        <span className={styles.costChipLabel}>Cost</span>
        {labelForStatus(result.status)}
      </span>
      <span className={styles.itemCostNote}>{result.message}</span>
    </div>
  )
}
function labelForStatus(status) {
  switch (status) {
    case 'missing-cost-basis':  return 'Missing cost basis'
    case 'missing-quantity':    return 'Missing quantity'
    case 'not-comparable-unit': return 'Unit mismatch'
    default:                    return 'Not available'
  }
}

// Phase 7I (2/?) — Cost-basis stewardship review panel. Compact summary
// + per-inventory issue list. Read-only: the only action exposed is
// "Open inventory item", which navigates to the existing inventory
// editor (which we do not touch in this commit).
const COST_BASIS_BOUNDARY_COPY = [
  'Cost basis review helps explain missing estimates.',
  'This does not create budget entries.',
  'Inventory is not deducted from planned items.',
  'Product Catalog is not used as a price source.',
]
const COST_BASIS_STATUS_LABEL = {
  'ready':                    'Ready',
  'missing-inventory-link':   'No inventory linked',
  'missing-inventory-item':   'Inventory item not found',
  'missing-cost-per-unit':    'Missing cost per unit',
  'missing-unit':             'Missing unit',
  'invalid-cost':             'Invalid cost value',
  'unused-in-programs':       'Unused in programs',
}
function CostBasisReviewPanel({ review, summary, onOpenInventoryItem }) {
  if (!review || !summary) return null
  const t = review.totals
  return (
    <section className={styles.costBasisPanel} aria-label="Cost basis review">
      <div className={styles.costBasisHeader}>
        <span className={styles.costBasisTitle}>Cost basis review</span>
        <span
          className={`${styles.costBasisStatusChip} ${summary.isClean ? styles.costBasisStatusOk : styles.costBasisStatusWarn}`}
        >
          {summary.message}
        </span>
      </div>

      <div className={styles.costBasisCounters}>
        <span className={`${styles.costChip} ${styles.costChipEstimate}`}>
          <span className={styles.costChipLabel}>Ready</span>{t.ready}
        </span>
        {t.missingCostBasis > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Missing cost basis</span>{t.missingCostBasis}
          </span>
        )}
        {t.missingUnit > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Missing unit</span>{t.missingUnit}
          </span>
        )}
        {t.invalidCost > 0 && (
          <span className={`${styles.costChip} ${styles.costChipWarn}`}>
            <span className={styles.costChipLabel}>Invalid cost</span>{t.invalidCost}
          </span>
        )}
        <span className={styles.costChip}>
          <span className={styles.costChipLabel}>Affected planned items</span>{t.affectedPlannedItems}
        </span>
      </div>

      {review.inventoryIssues.length > 0 && (
        <ul className={styles.costBasisList}>
          {review.inventoryIssues.map(issue => (
            <li key={issue.inventoryItemId} className={styles.costBasisIssue}>
              <div className={styles.costBasisIssueMain}>
                <div className={styles.costBasisIssueTitle}>
                  {issue.inventoryName ?? '(unnamed inventory item)'}
                </div>
                <div className={styles.costBasisIssueSub}>
                  {COST_BASIS_STATUS_LABEL[issue.status] ?? issue.status}
                </div>
                {issue.affectedProgramItems.length > 0 && (
                  <ul className={styles.costBasisAffected}>
                    {issue.affectedProgramItems.map(a => (
                      <li key={`${a.programId}-${a.itemId}`} className={styles.costBasisAffectedRow}>
                        <span className={styles.costBasisAffectedProgram}>
                          {a.programName ?? '(unnamed program)'}
                        </span>
                        <span className={styles.costBasisAffectedItem}>
                          {a.productName ?? '(unnamed item)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {issue.inventoryItemId && (
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => onOpenInventoryItem?.(issue.inventoryItemId)}
                  title="Open this inventory item in the Inventory workspace."
                >
                  Open inventory item
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.costBoundaryNote}>{COST_BASIS_BOUNDARY_COPY.join(' ')}</p>
    </section>
  )
}
