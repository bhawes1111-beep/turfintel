import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WaterBalanceOverview from './tabs/WaterBalanceOverview'
import MoistureOverview from './tabs/MoistureOverview'
import IrrigationDashboard from './tabs/IrrigationDashboard'
import Repairs             from './tabs/Repairs'
import { useSelectedCourseId } from '../../utils/courses/courseStore'

const LEGACY_TABS = ['Overview', 'Moisture', 'Dashboard', 'Repairs', 'Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']

const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Today', 'Water Balance', 'Moisture', 'Repairs']

export default function Irrigation() {
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  const [activeTab, setActiveTab] = useState(() =>
    isCrosswinds ? 'Today' : 'Overview'
  )

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  return (
    <PageShell title="Irrigation" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {isCrosswinds ? (
        <>
          {activeTab === 'Today'         && <IrrigationDashboard />}
          {activeTab === 'Water Balance' && <WaterBalanceOverview />}
          {activeTab === 'Moisture'      && <MoistureOverview />}
          {activeTab === 'Repairs'       && <Repairs />}
        </>
      ) : (
        <>
          {activeTab === 'Overview'  && <WaterBalanceOverview />}
          {activeTab === 'Moisture'  && <MoistureOverview />}
          {activeTab === 'Dashboard' && <IrrigationDashboard />}
          {activeTab === 'Repairs'   && <Repairs />}
          {activeTab !== 'Overview' && activeTab !== 'Moisture' && activeTab !== 'Dashboard' && activeTab !== 'Repairs' && (
            <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
              {activeTab} - coming soon
            </p>
          )}
        </>
      )}
    </PageShell>
  )
}
