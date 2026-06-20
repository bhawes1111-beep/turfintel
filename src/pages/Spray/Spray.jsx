import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
// Phase S.4 — new scheduler-style entry surface. Date-first read-only
// workspace that routes to the existing tabs unchanged.
import SprayWorkspace        from './tabs/SprayWorkspace'
import SprayOverview         from './tabs/SprayOverview'
import SprayCalendar         from './tabs/SprayCalendar'
import BuildSpraySheet       from './tabs/BuildSpraySheet'
import SprayRecords          from './tabs/SprayRecords'
// Phase S.6c — PlannedPrograms is no longer reachable from visible
// Spray navigation (legacy surface superseded by Planned Sprays).
// The component file is intentionally preserved on disk so the
// legacy model remains accessible for any future deep-link / route
// recovery, but it is not imported here.
// import PlannedPrograms       from './tabs/PlannedPrograms'
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

// Legacy tab list — non-Crosswinds courses still use it byte-for-byte
// except for the new Workspace landing tab prepended in Phase S.4.
// Phase S.6b — 'Program Planner' → 'Planned Sprays' for the user-
// facing label. Internal route still mounts SprayProgramPlanner.
// Phase S.6c — Removed 'Planned Programs' (legacy surface — the
// S.5b.2 Planned Sprays is the single planning surface). Renamed
// 'Program Intelligence' → 'Spray Intelligence'. Internal route
// handlers for 'Planned Programs' are preserved for safety but the
// tab is no longer exposed in the visible nav.
// Phase S.6c.1 — Renamed 'Program Calendar' → 'Planned Spray
// Calendar' (truly shows planned spray windows, distinct from the
// completed-applications 'Spray Calendar' earlier in the list).
// Last user-facing 'Program' label in Spray nav is now gone.
const LEGACY_TABS = ['Workspace', 'Overview', 'Spray Calendar', 'New Application', 'Spray Records', 'Planned Sprays', 'Planned Spray Calendar', 'Mix Calculator', 'Reports', 'Spray Intelligence']

// Phase 9B.1 — Crosswinds-only simplified Spray tabs. Six visible
// items + a "More" group whose body renders a secondary pill row
// for the advanced/specialty surfaces. PageShell is unchanged; the
// More group is a synthetic tab that owns its own inner state. All
// 10 legacy components remain mounted under either the primary
// tabs or the More inner row.
//
// Phase S.4 — Workspace prepended as the new default landing tab.
// Build / Records / Calendar / Programs / Calculator / More all
// still mount their existing components unchanged.
// Phase S.6b — 'Programs' → 'Planned Sprays' on the visible
// Crosswinds tab strip. 'Program Planner' inside More → 'Planned
// Sprays' as well. Internal routing key is the same so smoke
// regression couples + workspace navigateTab calls keep working.
// Phase S.6c — Removed 'Planned Programs' from CROSSWINDS_MORE (the
// S.5b.2 Planned Sprays is the single planning surface). Renamed
// 'Program Intelligence' → 'Spray Intelligence'.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Workspace', 'Build Spray', 'Records', 'Calendar', 'Planned Sprays', 'Calculator', 'More']
const CROSSWINDS_MORE = ['Overview', 'Planned Sprays', 'Reports', 'Spray Intelligence']

/**
 * Sprays workspace — canonical TurfIntel workspace pattern (Phase 2.2 pilot).
 * Establishes the header/description/actions/tabs/content rhythm that other
 * workspaces will adopt in subsequent phases.
 */
export default function Spray() {
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  // Phase 9B.1 — Crosswinds used to land on Build Spray (the daily
  // workhorse); every other course used to land on Overview.
  // Phase S.4 — Both now land on the new Workspace surface. The
  // workspace's quick-action buttons immediately route into the
  // original tabs, so existing flows are at most one click away.
  const [activeTab, setActiveTab] = useState('Workspace')
  const [moreTab,  setMoreTab]    = useState('Overview')

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  return (
    <PageShell
      title="Sprays"
      description="Spray applications, planned sprays, and labels."
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
          {activeTab === 'Workspace'      && <SprayWorkspace onNavigateTab={setActiveTab} />}
          {activeTab === 'Build Spray'    && <BuildSpraySheet />}
          {activeTab === 'Records'        && <SprayRecords />}
          {activeTab === 'Calendar'       && <SprayCalendar />}
          {/* Phase S.6b — 'Programs' tab renamed to 'Planned Sprays'.
              Same component (SprayProgramCalendar — read-only planned
              spray calendar) mounts; only the label changed. */}
          {activeTab === 'Planned Sprays' && <SprayProgramCalendar />}
          {activeTab === 'Calculator'     && <MixCalculator />}
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
              {/* Phase S.6c — 'Planned Programs' removed from CROSSWINDS_MORE
                  (legacy surface superseded by 'Planned Sprays'). Route
                  handler removed since the tab is no longer reachable. */}
              {/* Phase S.6b — 'Program Planner' inner-tab renamed
                  to 'Planned Sprays'. Same SprayProgramPlanner
                  component; only the label changed. */}
              {moreTab === 'Planned Sprays'       && <SprayProgramPlanner />}
              {moreTab === 'Reports'              && <SprayReports />}
              {/* Phase S.6c — 'Program Intelligence' renamed to
                  'Spray Intelligence'. Same ProgramIntelligence
                  component; only the label changed. */}
              {moreTab === 'Spray Intelligence'   && <ProgramIntelligence />}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Phase S.4 — Workspace targets map legacy tab labels.
              "Build Spray" → "New Application"; "Records" → "Spray
              Records"; "Planned Sprays" → "Spray Calendar" (legacy
              view); "Calendar" stays "Spray Calendar"; "Calculator"
              stays "Mix Calculator". A small label-aliasing handler
              below normalizes the workspace's quick-action keys to
              the actual legacy tab labels.
              Phase S.6b — Workspace key 'Programs' renamed to
              'Planned Sprays'; alias updated. */}
          {activeTab === 'Workspace'             && <SprayWorkspace onNavigateTab={t => {
            const ALIASES = {
              'Build Spray':    'New Application',
              'Records':        'Spray Records',
              'Calendar':       'Spray Calendar',
              'Planned Sprays': 'Spray Calendar',
              'Calculator':     'Mix Calculator',
            }
            setActiveTab(ALIASES[t] ?? t)
          }} />}
          {activeTab === 'Overview'              && <SprayOverview />}
          {activeTab === 'Spray Calendar'        && <SprayCalendar />}
          {activeTab === 'New Application'       && <BuildSpraySheet />}
          {activeTab === 'Spray Records'         && <SprayRecords />}
          {/* Phase S.6c — 'Planned Programs' removed from visible
              LEGACY_TABS. Route handler removed since the tab is no
              longer reachable from the nav. */}
          {/* Phase S.6b — LEGACY_TABS visible label renamed
              'Program Planner' → 'Planned Sprays'. SprayProgramPlanner
              component mount unchanged. */}
          {activeTab === 'Planned Sprays'        && <SprayProgramPlanner />}
          {/* Phase S.6c.1 — 'Program Calendar' tab visible label
              renamed to 'Planned Spray Calendar'. Same
              SprayProgramCalendar component mount; only the label
              changed. Last user-facing 'Program' label removed
              from Spray nav. */}
          {activeTab === 'Planned Spray Calendar' && <SprayProgramCalendar />}
          {activeTab === 'Mix Calculator'        && <MixCalculator />}
          {activeTab === 'Reports'               && <SprayReports />}
          {/* Phase S.6c — 'Program Intelligence' renamed to
              'Spray Intelligence'. ProgramIntelligence component
              mount unchanged. */}
          {activeTab === 'Spray Intelligence'    && <ProgramIntelligence />}
        </>
      )}
    </PageShell>
  )
}
