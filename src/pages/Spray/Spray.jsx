import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import SprayOverview         from './tabs/SprayOverview'
import SprayCalendar         from './tabs/SprayCalendar'
import BuildSpraySheet       from './tabs/BuildSpraySheet'
import SprayRecords          from './tabs/SprayRecords'
import PlannedPrograms       from './tabs/PlannedPrograms'
import MixCalculator         from './tabs/MixCalculator'
import SprayReports          from './tabs/SprayReports'
import ProgramIntelligence   from './tabs/ProgramIntelligence'
// Phase 7F (1/?) — Spray Program Planner shell over the new
// spray_programs / spray_program_items data model. Distinct from the
// legacy 'Planned Programs' tab which predates the model.
import SprayProgramPlanner   from './tabs/SprayProgramPlanner'
// Phase 7H (1/?) — read-only Spray Program calendar. Distinct from the
// legacy 'Spray Calendar' (completed applications) — this one
// visualizes planned spray_program_items.
import SprayProgramCalendar  from './tabs/SprayProgramCalendar'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import workspace from '../../styles/workspace.module.css'
import styles from './Spray.module.css'

// Legacy 10-tab list — non-Crosswinds courses still use it byte-for-byte.
const LEGACY_TABS = ['Overview', 'Spray Calendar', 'New Application', 'Spray Records', 'Planned Programs', 'Program Planner', 'Program Calendar', 'Mix Calculator', 'Reports', 'Program Intelligence']

// Phase 9B.1 — Crosswinds-only simplified Spray tabs. Six visible
// items + a "More" group whose body renders a secondary pill row
// for the advanced/specialty surfaces. PageShell is unchanged; the
// More group is a synthetic tab that owns its own inner state. All
// 10 legacy components remain mounted under either the primary
// tabs or the More inner row.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Build Spray', 'Records', 'Calendar', 'Programs', 'Calculator', 'More']
const CROSSWINDS_MORE = ['Overview', 'Planned Programs', 'Program Planner', 'Reports', 'Program Intelligence']

/**
 * Sprays workspace — canonical TurfIntel workspace pattern (Phase 2.2 pilot).
 * Establishes the header/description/actions/tabs/content rhythm that other
 * workspaces will adopt in subsequent phases.
 */
export default function Spray() {
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  // Phase 9B.1 — Crosswinds lands on Build Spray (the daily workhorse);
  // every other course keeps the legacy Overview default.
  const [activeTab, setActiveTab] = useState(() =>
    isCrosswinds ? 'Build Spray' : 'Overview'
  )
  const [moreTab,  setMoreTab]    = useState('Overview')

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  return (
    <PageShell
      title="Sprays"
      description="Spray applications, programs, and labels."
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <WorkspaceActions>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => setActiveTab(isCrosswinds ? 'Build Spray' : 'New Application')}
          >
            + New Spray
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => {
              if (isCrosswinds) {
                setActiveTab('More')
                setMoreTab('Reports')
              } else {
                setActiveTab('Reports')
              }
            }}
          >
            Reports
          </button>
        </WorkspaceActions>
      }
    >
      {isCrosswinds ? (
        <>
          {activeTab === 'Build Spray' && <BuildSpraySheet />}
          {activeTab === 'Records'     && <SprayRecords />}
          {activeTab === 'Calendar'    && <SprayCalendar />}
          {activeTab === 'Programs'    && <SprayProgramCalendar />}
          {activeTab === 'Calculator'  && <MixCalculator />}
          {activeTab === 'More' && (
            <div className={styles.moreInner}>
              <div className={styles.moreNav} role="tablist" aria-label="Advanced spray surfaces">
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
              {moreTab === 'Overview'             && <SprayOverview />}
              {moreTab === 'Planned Programs'     && <PlannedPrograms />}
              {moreTab === 'Program Planner'      && <SprayProgramPlanner />}
              {moreTab === 'Reports'              && <SprayReports />}
              {moreTab === 'Program Intelligence' && <ProgramIntelligence />}
            </div>
          )}
        </>
      ) : (
        <>
          {activeTab === 'Overview'              && <SprayOverview />}
          {activeTab === 'Spray Calendar'        && <SprayCalendar />}
          {activeTab === 'New Application'       && <BuildSpraySheet />}
          {activeTab === 'Spray Records'         && <SprayRecords />}
          {activeTab === 'Planned Programs'      && <PlannedPrograms />}
          {activeTab === 'Program Planner'       && <SprayProgramPlanner />}
          {activeTab === 'Program Calendar'      && <SprayProgramCalendar />}
          {activeTab === 'Mix Calculator'        && <MixCalculator />}
          {activeTab === 'Reports'               && <SprayReports />}
          {activeTab === 'Program Intelligence'  && <ProgramIntelligence />}
        </>
      )}
    </PageShell>
  )
}
