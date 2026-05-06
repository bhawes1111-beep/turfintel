import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Spray Records', 'Chemical Labels', 'Mix Calculator', 'Application Rates', 'Weather Conditions', 'Reports']

export default function Chemical() {
  const [activeTab, setActiveTab] = useState('Spray Records')

  return (
    <PageShell title="Chemical" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
