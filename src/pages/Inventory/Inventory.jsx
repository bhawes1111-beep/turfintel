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
import workspace from '../../styles/workspace.module.css'

// Phase 7C.1 (4/6) — 'Catalog' is the globally-scoped product-intelligence tab.
// Phase 7C.2 (2/?) — 'Link Review' is the stewardship surface that pairs
// inventory rows with catalog rows. Both are read-only over the catalog;
// only inventory_items.product_catalog_id ever gets written.
const TABS = ['Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History', 'Catalog', 'Link Review']

/**
 * Inventory workspace — follows the canonical workspace pattern established
 * in Sprays (Phase 2.2). Header description + actions; each tab body wraps
 * its content in WorkspaceSection for consistent rhythm.
 */
export default function Inventory() {
  // Cross-module click-through (Phase 3.4): when navigated to with state,
  // seed the active tab and (for Products) the initially selected product.
  const location = useLocation()
  const seedTab     = TABS.includes(location.state?.activeTab) ? location.state.activeTab : 'Overview'
  const seedProduct = location.state?.productId ?? null
  // Phase 7J (2/?) — deep-link intent from Spray Program Cost Basis
  // Review. When focus === 'cost-basis' the Products tab opens the
  // requested item with the CostBasisEditor highlighted; otherwise
  // direct Inventory usage is unaffected.
  const seedFocus   = location.state?.focus  ?? null
  const seedSource  = location.state?.source ?? null
  const [activeTab, setActiveTab] = useState(seedTab)
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
    setActiveTab('Catalog')
  }

  return (
    <PageShell
      title="Inventory"
      description="Products, chemicals, parts, and operational stock management."
      tabs={TABS}
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
            onClick={() => setActiveTab('Purchase History')}
          >
            Orders
          </button>
        </WorkspaceActions>
      }
    >
      {wizardOpen && (
        <ChemicalImportWizard
          onClose={() => setWizardOpen(false)}
          onSaved={() => setActiveTab('Chemicals')}
        />
      )}

      {activeTab === 'Overview'         && <InventoryOverview />}
      {activeTab === 'Products'         && <InventoryProducts initialSelectedId={seedProduct} initialFocus={seedFocus} initialSource={seedSource} onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Chemicals'        && <InventoryChemicals onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Fertilizer'       && <InventoryFertilizer onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Parts'            && <InventoryParts />}
      {activeTab === 'Fuel'             && <InventoryFuel />}
      {activeTab === 'Low Stock'        && <InventoryLowStock />}
      {activeTab === 'Purchase History' && <InventoryPurchaseHistory />}
      {activeTab === 'Catalog'          && <InventoryCatalog initialSelectedId={catalogSeedId} onConsumeSeed={() => setCatalogSeedId(null)} />}
      {activeTab === 'Link Review'      && <InventoryLinkReview onOpenCatalog={openCatalogProduct} />}
    </PageShell>
  )
}
