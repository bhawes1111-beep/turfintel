import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import InventoryProducts        from './tabs/InventoryProducts'
import InventoryChemicals       from './tabs/InventoryChemicals'
import InventoryFertilizer      from './tabs/InventoryFertilizer'
import InventoryParts           from './tabs/InventoryParts'
import InventoryIrrigation      from './tabs/InventoryIrrigation'
import InventoryFuel            from './tabs/InventoryFuel'
import InventoryLowStock        from './tabs/InventoryLowStock'
import InventoryPurchaseHistory from './tabs/InventoryPurchaseHistory'
import InventoryCatalog         from './tabs/InventoryCatalog'
import InventoryLinkReview     from './tabs/InventoryLinkReview'
import InventoryCostBasisReview from './tabs/InventoryCostBasisReview'
import InventoryAudit           from './tabs/InventoryAudit'

// Phase 7C.1 (4/6) — 'Catalog' is the globally-scoped product-intelligence tab.
// Phase 7C.2 (2/?) — 'Link Review' is the stewardship surface that pairs
// inventory rows with catalog rows. Both are read-only over the catalog;
// only inventory_items.product_catalog_id ever gets written.
// Phase 7W.1 — 'Cost Basis Review' is the grouped stewardship surface that
// shows inventory items by the input each one needs before spray-program
// cost estimates can complete. Uses the existing Phase 7J.1 PATCH endpoint
// for any writes; package size + standalone price are UI-only drafts.
const INVENTORY_TABS = [
  'Stock',
  'Low Stock',
  'Chemicals',
  'Fertilizer',
  'Parts',
  'Irrigation',
  'Fuel',
  'Purchases',
  'Cost Review',
  'Catalog',
  'Link Review',
  'Audit',
]

const INVENTORY_LABEL_REMAP = {
  'Products':          'Stock',
  'Overview':          'Stock',
  'Purchase History':  'Purchases',
  'Cost Basis Review': 'Cost Review',
  'More':              'Stock',
}

// Resolve incoming legacy deep links to the single flat Inventory nav.
function resolveSeedTabs(seedActive) {
  if (!seedActive) return 'Stock'
  const translated = INVENTORY_LABEL_REMAP[seedActive] ?? seedActive
  return INVENTORY_TABS.includes(translated) ? translated : 'Stock'
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

  const seedTab     = resolveSeedTabs(location.state?.activeTab)
  const seedProduct = location.state?.productId ?? null
  // Phase 7J (2/?) — deep-link intent from Spray Program Cost Basis
  // Review. When focus === 'cost-basis' the Products tab opens the
  // requested item with the CostBasisEditor highlighted; otherwise
  // direct Inventory usage is unaffected.
  const seedFocus   = location.state?.focus  ?? null
  const seedSource  = location.state?.source ?? null
  const [activeTab, setActiveTab] = useState(seedTab)
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
      description="Check stock, watch low items, and review purchases."
      tabs={INVENTORY_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'Stock'     && <InventoryProducts {...productsProps} />}
      {activeTab === 'Low Stock' && <InventoryLowStock />}
      {activeTab === 'Chemicals' && <InventoryChemicals onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Fertilizer' && <InventoryFertilizer onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Parts'     && <InventoryParts />}
      {activeTab === 'Irrigation' && <InventoryIrrigation />}
      {activeTab === 'Fuel'      && <InventoryFuel />}
      {activeTab === 'Purchases' && <InventoryPurchaseHistory />}
      {activeTab === 'Cost Review' && <InventoryCostBasisReview />}
      {activeTab === 'Catalog'     && <InventoryCatalog initialSelectedId={catalogSeedId} onConsumeSeed={() => setCatalogSeedId(null)} />}
      {activeTab === 'Link Review' && <InventoryLinkReview onOpenCatalog={openCatalogProduct} />}
      {activeTab === 'Audit'       && <InventoryAudit />}
    </PageShell>
  )
}
