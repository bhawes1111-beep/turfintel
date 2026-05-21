import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WaterBalanceOverview from './tabs/WaterBalanceOverview'
import IrrigationDashboard from './tabs/IrrigationDashboard'
import Repairs             from './tabs/Repairs'

const TABS = ['Overview', 'Dashboard', 'Repairs', 'Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']

export default function Irrigation() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Irrigation" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview'  && <WaterBalanceOverview />}
      {activeTab === 'Dashboard' && <IrrigationDashboard />}
      {activeTab === 'Repairs'   && <Repairs />}
      {activeTab !== 'Overview' && activeTab !== 'Dashboard' && activeTab !== 'Repairs' && (
        <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
          {activeTab} — coming soon
        </p>
      )}
    </PageShell>
  )
}
