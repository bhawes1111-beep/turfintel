import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Library', 'Disease Map', 'Photo Uploads', 'Alerts']

export default function Disease() {
  const [activeTab, setActiveTab] = useState('Library')

  return (
    <PageShell title="Disease" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
