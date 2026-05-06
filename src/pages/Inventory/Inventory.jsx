import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History']

export default function Inventory() {
  const [activeTab, setActiveTab] = useState('Products')

  return (
    <PageShell title="Inventory" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
