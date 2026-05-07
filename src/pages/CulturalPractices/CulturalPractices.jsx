import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Aerification', 'Topdressing', 'Verticutting', 'Rolling', 'Schedule']

export default function CulturalPractices() {
  const [activeTab, setActiveTab] = useState('Aerification')

  return (
    <PageShell title="Cultural Practices" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
