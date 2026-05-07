import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import SprayCalendar    from './tabs/SprayCalendar'
import BuildSpraySheet  from './tabs/BuildSpraySheet'
import SprayRecords     from './tabs/SprayRecords'
import PlannedPrograms  from './tabs/PlannedPrograms'
import MixCalculator    from './tabs/MixCalculator'
import SprayReports     from './tabs/SprayReports'

const TABS = ['Spray Calendar', 'Build Spray Sheet', 'Spray Records', 'Planned Programs', 'Mix Calculator', 'Reports']

export default function Spray() {
  const [activeTab, setActiveTab] = useState('Spray Calendar')

  return (
    <PageShell title="Spray" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Spray Calendar'   && <SprayCalendar />}
      {activeTab === 'Build Spray Sheet' && <BuildSpraySheet />}
      {activeTab === 'Spray Records'    && <SprayRecords />}
      {activeTab === 'Planned Programs' && <PlannedPrograms />}
      {activeTab === 'Mix Calculator'   && <MixCalculator />}
      {activeTab === 'Reports'          && <SprayReports />}
    </PageShell>
  )
}
