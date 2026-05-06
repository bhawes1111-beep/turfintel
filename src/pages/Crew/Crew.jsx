import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Tasks', 'Hours', 'Schedule', 'Employees', 'Notes']

export default function Crew() {
  const [activeTab, setActiveTab] = useState('Tasks')

  return (
    <PageShell title="Crew" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
