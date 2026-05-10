import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
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
  const [activeTab, setActiveTab] = useState('Overview')

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
      {activeTab === 'Overview'         && <InventoryOverview />}
      {activeTab === 'Products'         && <InventoryProducts />}
      {activeTab === 'Chemicals'        && <InventoryChemicals />}
      {activeTab === 'Fertilizer'       && <InventoryFertilizer />}
      {activeTab === 'Parts'            && <InventoryParts />}
      {activeTab === 'Fuel'             && <InventoryFuel />}
      {activeTab === 'Low Stock'        && <InventoryLowStock />}
      {activeTab === 'Purchase History' && <InventoryPurchaseHistory />}
    </PageShell>
  )
}
