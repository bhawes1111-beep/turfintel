import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Calendar', 'Spray Programs', 'Spray Sheet Builder', 'Records']

export default function Spray() {
  const [activeTab, setActiveTab] = useState('Calendar')

  return (
    <PageShell title="Spray" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
