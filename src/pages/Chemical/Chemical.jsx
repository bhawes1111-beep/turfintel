import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import ChemicalLabels from './tabs/ChemicalLabels'

const TABS = ['Spray Records', 'Chemical Labels', 'Mix Calculator', 'Application Rates', 'Weather Conditions', 'Reports']

export default function Chemical() {
  const [activeTab, setActiveTab] = useState('Spray Records')

  return (
    <PageShell title="Chemical" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Chemical Labels' && <ChemicalLabels />}
      {activeTab !== 'Chemical Labels' && (
        <p style={{ color: 'var(--color-text-muted)', padding: '24px' }}>{activeTab} — coming soon</p>
      )}
    </PageShell>
  )
}
