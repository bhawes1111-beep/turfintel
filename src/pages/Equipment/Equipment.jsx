import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import EquipmentOverview from './tabs/EquipmentOverview'

const TABS = ['Overview', 'Equipment List', 'Maintenance Logs', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']

export default function Equipment() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Equipment" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview' && <EquipmentOverview />}
      {activeTab !== 'Overview' && (
        <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
      )}
    </PageShell>
  )
}
