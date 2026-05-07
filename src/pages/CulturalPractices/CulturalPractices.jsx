import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import Aerification from './tabs/Aerification'
import Topdressing from './tabs/Topdressing'
import Verticutting from './tabs/Verticutting'
import Rolling from './tabs/Rolling'
import Mowing from './tabs/Mowing'
import PracticeCalendar from './tabs/PracticeCalendar'
import CPReports from './tabs/CPReports'

const TABS = ['Aerification', 'Topdressing', 'Verticutting', 'Rolling', 'Mowing', 'Practice Calendar', 'Reports']

export default function CulturalPractices() {
  const [activeTab, setActiveTab] = useState('Aerification')

  return (
    <PageShell title="Cultural Practices" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Aerification'      && <Aerification />}
      {activeTab === 'Topdressing'       && <Topdressing />}
      {activeTab === 'Verticutting'      && <Verticutting />}
      {activeTab === 'Rolling'           && <Rolling />}
      {activeTab === 'Mowing'            && <Mowing />}
      {activeTab === 'Practice Calendar' && <PracticeCalendar />}
      {activeTab === 'Reports'           && <CPReports />}
    </PageShell>
  )
}
