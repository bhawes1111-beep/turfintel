import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WaterBalanceOverview from './tabs/WaterBalanceOverview'
import MoistureOverview from './tabs/MoistureOverview'
import IrrigationDashboard from './tabs/IrrigationDashboard'
import Repairs             from './tabs/Repairs'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import styles from './Irrigation.module.css'

const LEGACY_TABS = ['Overview', 'Moisture', 'Dashboard', 'Repairs', 'Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']

// Phase 9B.4 — Crosswinds-only simplified Irrigation tabs. Five
// visible items + a "More" group whose body renders a secondary
// pill row for the placeholder/coming-soon surfaces. PageShell is
// unchanged. The "Today" / "Water Balance" / "Moisture" / "Repairs"
// labels map to the existing 4 implemented tab components; the
// remaining 5 legacy tabs (Head Map / Wet / Dry Reports / Pump
// Station / Zones / Reports) stay placeholders under More.
//
// Non-Crosswinds courses keep the legacy 9-tab layout byte-for-byte.
// No DB, no worker, no route changes; Weather.jsx is untouched.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Today', 'Water Balance', 'Moisture', 'Repairs', 'More']
const CROSSWINDS_MORE = ['Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']
const CROSSWINDS_LABEL_REMAP = {
  'Overview':  'Water Balance',
  'Dashboard': 'Today',
}

export default function Irrigation() {
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  // Phase 9B.4 — Crosswinds lands on Today (tonight's irrigation
  // cycles); every other course keeps the legacy Overview default.
  const [activeTab, setActiveTab] = useState(() =>
    isCrosswinds ? 'Today' : 'Overview'
  )
  const [moreTab,   setMoreTab]   = useState('Head Map')

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  return (
    <PageShell title="Irrigation" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {isCrosswinds ? (
        <>
          {activeTab === 'Today'         && <IrrigationDashboard />}
          {activeTab === 'Water Balance' && <WaterBalanceOverview />}
          {activeTab === 'Moisture'      && <MoistureOverview />}
          {activeTab === 'Repairs'       && <Repairs />}
          {activeTab === 'More' && (
            <div className={styles.moreInner}>
              <div className={styles.moreNav} role="tablist" aria-label="Additional irrigation surfaces">
                {CROSSWINDS_MORE.map(t => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={moreTab === t}
                    data-active={moreTab === t ? 'true' : undefined}
                    className={styles.moreNavBtn}
                    onClick={() => setMoreTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
                {moreTab} — coming soon
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {activeTab === 'Overview'  && <WaterBalanceOverview />}
          {activeTab === 'Moisture'  && <MoistureOverview />}
          {activeTab === 'Dashboard' && <IrrigationDashboard />}
          {activeTab === 'Repairs'   && <Repairs />}
          {activeTab !== 'Overview' && activeTab !== 'Moisture' && activeTab !== 'Dashboard' && activeTab !== 'Repairs' && (
            <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
              {activeTab} — coming soon
            </p>
          )}
        </>
      )}
    </PageShell>
  )
}
