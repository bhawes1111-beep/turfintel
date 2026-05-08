import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import InventoryOverview      from './tabs/InventoryOverview'
import InventoryProducts      from './tabs/InventoryProducts'
import InventoryChemicals     from './tabs/InventoryChemicals'
import InventoryFertilizer    from './tabs/InventoryFertilizer'
import InventoryParts         from './tabs/InventoryParts'
import InventoryFuel          from './tabs/InventoryFuel'
import InventoryLowStock      from './tabs/InventoryLowStock'
import InventoryPurchaseHistory from './tabs/InventoryPurchaseHistory'

const TABS = ['Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History']

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Inventory" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
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
