import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Overview', 'Expenses', 'Labor Costs', 'Chemical Costs', 'Equipment Costs', 'Monthly Reports', 'Yearly Summary']

export default function Budget() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Budget" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
