import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['User Settings', 'Course Settings', 'Employees', 'Permissions', 'Notifications', 'Data Backup', 'App Theme']

export default function Settings() {
  const [activeTab, setActiveTab] = useState('User Settings')

  return (
    <PageShell title="Settings" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
