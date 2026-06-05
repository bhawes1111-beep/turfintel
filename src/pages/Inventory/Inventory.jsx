import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import ChemicalImportWizard from '../../components/inventory/ChemicalImportWizard'
import InventoryOverview        from './tabs/InventoryOverview'
import InventoryProducts        from './tabs/InventoryProducts'
import InventoryChemicals       from './tabs/InventoryChemicals'
import InventoryFertilizer      from './tabs/InventoryFertilizer'
import InventoryParts           from './tabs/InventoryParts'
import InventoryFuel            from './tabs/InventoryFuel'
import InventoryLowStock        from './tabs/InventoryLowStock'
import InventoryPurchaseHistory from './tabs/InventoryPurchaseHistory'
import InventoryCatalog         from './tabs/InventoryCatalog'
import InventoryLinkReview     from './tabs/InventoryLinkReview'
import InventoryCostBasisReview from './tabs/InventoryCostBasisReview'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import workspace from '../../styles/workspace.module.css'
import styles from './Inventory.module.css'

// Phase 7C.1 (4/6) — 'Catalog' is the globally-scoped product-intelligence tab.
// Phase 7C.2 (2/?) — 'Link Review' is the stewardship surface that pairs
// inventory rows with catalog rows. Both are read-only over the catalog;
// only inventory_items.product_catalog_id ever gets written.
// Phase 7W.1 — 'Cost Basis Review' is the grouped stewardship surface that
// shows inventory items by the input each one needs before spray-program
// cost estimates can complete. Uses the existing Phase 7J.1 PATCH endpoint
// for any writes; package size + standalone price are UI-only drafts.
const LEGACY_TABS = ['Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History', 'Catalog', 'Link Review', 'Cost Basis Review']

// Phase 9B.2 — Crosswinds-only simplified Inventory tabs. Five visible
// items + a "More" group whose body renders a secondary pill row for
// the advanced/specialty surfaces. PageShell is unchanged; the More
// group is a synthetic tab that owns its own inner state. All 11
// legacy components remain mounted under either the primary tabs or
// the More inner row. location.state.activeTab deep links continue
// to work via CROSSWINDS_LABEL_REMAP (legacy labels translated to
// the new Crosswinds labels) and the inner-row resolver below.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Products', 'Low Stock', 'Purchases', 'Cost Review', 'More']
const CROSSWINDS_MORE = ['Overview', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Catalog', 'Link Review']
const CROSSWINDS_LABEL_REMAP = {
  'Purchase History':  'Purchases',
  'Cost Basis Review': 'Cost Review',
}

// Phase 9B.2 — given the incoming location.state.activeTab and the
// active course id, resolve which (activeTab, moreTab) the page
// should land on. Falls back to course-aware defaults when no seed
// is present. Pure function — no React, easy to test.
function resolveSeedTabs(seedActive, isCrosswinds) {
  const fallback = isCrosswinds
    ? { activeTab: 'Products', moreTab: 'Overview' }
    : { activeTab: 'Overview', moreTab: 'Overview' }
  if (!seedActive) return fallback
  if (!isCrosswinds) {
    return LEGACY_TABS.includes(seedActive)
      ? { activeTab: seedActive, moreTab: 'Overview' }
      : fallback
  }
  // Crosswinds: translate any legacy label first.
  const translated = CROSSWINDS_LABEL_REMAP[seedActive] ?? seedActive
  if (CROSSWINDS_TABS.includes(translated)) {
    return { activeTab: translated, moreTab: 'Overview' }
  }
  if (CROSSWINDS_MORE.includes(translated)) {
    return { activeTab: 'More', moreTab: translated }
  }
  return fallback
}

/**
 * Inventory workspace — follows the canonical workspace pattern established
 * in Sprays (Phase 2.2). Header description + actions; each tab body wraps
 * its content in WorkspaceSection for consistent rhythm.
 */
export default function Inventory() {
  // Cross-module click-through (Phase 3.4): when navigated to with state,
  // seed the active tab and (for Products) the initially selected product.
  const location     = useLocation()
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  const seed        = resolveSeedTabs(location.state?.activeTab, isCrosswinds)
  const seedProduct = location.state?.productId ?? null
  // Phase 7J (2/?) — deep-link intent from Spray Program Cost Basis
  // Review. When focus === 'cost-basis' the Products tab opens the
  // requested item with the CostBasisEditor highlighted; otherwise
  // direct Inventory usage is unaffected.
  const seedFocus   = location.state?.focus  ?? null
  const seedSource  = location.state?.source ?? null
  const [activeTab, setActiveTab] = useState(seed.activeTab)
  const [moreTab,   setMoreTab]   = useState(seed.moreTab)
  const [wizardOpen, setWizardOpen] = useState(false)
  // Phase 7C.1 (5/6) — when an inventory tab's 📋 Catalog chip is clicked,
  // we (a) switch to the Catalog tab and (b) tell that tab which catalog
  // row to open in its detail drawer. Two-piece local state beats a global
  // modal/portal — the Catalog tab already owns the drawer-rendering code,
  // so we just seed its selection.
  const [catalogSeedId, setCatalogSeedId] = useState(null)
  function openCatalogProduct(productCatalogId) {
    if (!productCatalogId) return
    setCatalogSeedId(productCatalogId)
    if (isCrosswinds) {
      setActiveTab('More')
      setMoreTab('Catalog')
    } else {
      setActiveTab('Catalog')
    }
  }

  // Phase 7Q ManualProductForm → Products handoff used to land on
  // 'Chemicals' after a chemical import. On Crosswinds Chemicals lives
  // under More, so route there instead. Non-Crosswinds unchanged.
  function handleChemicalImported() {
    if (isCrosswinds) {
      setActiveTab('More')
      setMoreTab('Chemicals')
    } else {
      setActiveTab('Chemicals')
    }
  }

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  // Products props are shared between the Crosswinds primary render and
  // the legacy render so the existing deep-link contract (initialSelectedId,
  // initialFocus, initialSource, onOpenCatalog) flows through both paths.
  const productsProps = {
    initialSelectedId: seedProduct,
    initialFocus:      seedFocus,
    initialSource:     seedSource,
    onOpenCatalog:     openCatalogProduct,
  }

  return (
    <PageShell
      title="Inventory"
      description="Products, chemicals, parts, and operational stock management."
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <WorkspaceActions>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => setWizardOpen(true)}
          >
            + Add Chemical from PDF
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab('Low Stock')}
          >
            Low Stock
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab(isCrosswinds ? 'Purchases' : 'Purchase History')}
          >
            Orders
          </button>
        </WorkspaceActions>
      }
    >
      {wizardOpen && (
        <ChemicalImportWizard
          onClose={() => setWizardOpen(false)}
          onSaved={handleChemicalImported}
        />
      )}

      {isCrosswinds ? (
        <>
          {activeTab === 'Products'    && <InventoryProducts {...productsProps} />}
          {activeTab === 'Low Stock'   && <InventoryLowStock />}
          {activeTab === 'Purchases'   && <InventoryPurchaseHistory />}
          {activeTab === 'Cost Review' && <InventoryCostBasisReview />}
          {activeTab === 'More' && (
            <div className={styles.moreInner}>
              <div className={styles.moreNav} role="tablist" aria-label="Advanced inventory surfaces">
                {CROSSWINDS_MORE.map(t => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={moreTab === t}
                    data-active={moreTab === t ? 'true' : undefined}
                    className={styles.moreNavBtn}
                    onClick={() => setMoreTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {moreTab === 'Overview'    && <InventoryOverview />}
              {moreTab === 'Chemicals'   && <InventoryChemicals onOpenCatalog={openCatalogProduct} />}
              {moreTab === 'Fertilizer'  && <InventoryFertilizer onOpenCatalog={openCatalogProduct} />}
              {moreTab === 'Parts'       && <InventoryParts />}
              {moreTab === 'Fuel'        && <InventoryFuel />}
              {moreTab === 'Catalog'     && <InventoryCatalog initialSelectedId={catalogSeedId} onConsumeSeed={() => setCatalogSeedId(null)} />}
              {moreTab === 'Link Review' && <InventoryLinkReview onOpenCatalog={openCatalogProduct} />}
            </div>
          )}
        </>
      ) : (
        <>
          {activeTab === 'Overview'         && <InventoryOverview />}
          {activeTab === 'Products'         && <InventoryProducts {...productsProps} />}
          {activeTab === 'Chemicals'        && <InventoryChemicals onOpenCatalog={openCatalogProduct} />}
          {activeTab === 'Fertilizer'       && <InventoryFertilizer onOpenCatalog={openCatalogProduct} />}
          {activeTab === 'Parts'            && <InventoryParts />}
          {activeTab === 'Fuel'             && <InventoryFuel />}
          {activeTab === 'Low Stock'        && <InventoryLowStock />}
          {activeTab === 'Purchase History' && <InventoryPurchaseHistory />}
          {activeTab === 'Catalog'          && <InventoryCatalog initialSelectedId={catalogSeedId} onConsumeSeed={() => setCatalogSeedId(null)} />}
          {activeTab === 'Link Review'      && <InventoryLinkReview onOpenCatalog={openCatalogProduct} />}
          {activeTab === 'Cost Basis Review' && <InventoryCostBasisReview />}
        </>
      )}
    </PageShell>
  )
}
