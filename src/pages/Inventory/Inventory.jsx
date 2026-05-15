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
import workspace from '../../styles/workspace.module.css'

const TABS = ['Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History']

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
  const [activeTab, setActiveTab] = useState(seedTab)
  const [wizardOpen, setWizardOpen] = useState(false)

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
      {activeTab === 'Products'         && <InventoryProducts initialSelectedId={seedProduct} />}
      {activeTab === 'Chemicals'        && <InventoryChemicals />}
      {activeTab === 'Fertilizer'       && <InventoryFertilizer />}
      {activeTab === 'Parts'            && <InventoryParts />}
      {activeTab === 'Fuel'             && <InventoryFuel />}
      {activeTab === 'Low Stock'        && <InventoryLowStock />}
      {activeTab === 'Purchase History' && <InventoryPurchaseHistory />}
    </PageShell>
  )
}
