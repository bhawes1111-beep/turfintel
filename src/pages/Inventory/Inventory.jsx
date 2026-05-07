import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import InventoryProducts     from './tabs/InventoryProducts'
import InventoryChemicals    from './tabs/InventoryChemicals'
import InventoryFertilizer   from './tabs/InventoryFertilizer'
import InventoryParts        from './tabs/InventoryParts'
import InventoryFuel         from './tabs/InventoryFuel'
import InventoryLowStock     from './tabs/InventoryLowStock'
import InventoryPurchaseHistory from './tabs/InventoryPurchaseHistory'

const TABS = ['Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History']

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('Products')

  return (
    <PageShell title="Inventory" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
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
