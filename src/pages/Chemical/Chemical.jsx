import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import ChemicalOverview from './tabs/ChemicalOverview'
import ChemicalLabels   from './tabs/ChemicalLabels'

const TABS = ['Overview', 'Spray Records', 'Chemical Labels', 'Mix Calculator', 'Application Rates', 'Weather Conditions', 'Reports']

export default function Chemical() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Chemical" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview'        && <ChemicalOverview />}
      {activeTab === 'Chemical Labels' && <ChemicalLabels />}
      {activeTab !== 'Overview' && activeTab !== 'Chemical Labels' && (
        <p style={{ color: 'var(--color-text-muted)', padding: '24px' }}>{activeTab} — coming soon</p>
      )}
    </PageShell>
  )
}
