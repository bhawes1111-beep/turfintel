import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import CulturalPracticesOverview from './tabs/CulturalPracticesOverview'
import Aerification               from './tabs/Aerification'
import Topdressing                from './tabs/Topdressing'
import Verticutting               from './tabs/Verticutting'
import Rolling                    from './tabs/Rolling'
import Mowing                     from './tabs/Mowing'
import PracticeCalendar           from './tabs/PracticeCalendar'
import CPReports                  from './tabs/CPReports'

const TABS = ['Overview', 'Aerification', 'Topdressing', 'Verticutting', 'Rolling', 'Mowing', 'Practice Calendar', 'Reports']

export default function CulturalPractices() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Cultural Practices" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview'          && <CulturalPracticesOverview />}
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
