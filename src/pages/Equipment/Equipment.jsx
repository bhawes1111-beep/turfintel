import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Equipment List', 'Maintenance Logs', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']

export default function Equipment() {
  const [activeTab, setActiveTab] = useState('Equipment List')

  return (
    <PageShell title="Equipment" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
