import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import SprayOverview    from './tabs/SprayOverview'
import SprayCalendar    from './tabs/SprayCalendar'
import BuildSpraySheet  from './tabs/BuildSpraySheet'
import SprayRecords     from './tabs/SprayRecords'
import PlannedPrograms  from './tabs/PlannedPrograms'
import MixCalculator    from './tabs/MixCalculator'
import SprayReports     from './tabs/SprayReports'
import workspace from '../../styles/workspace.module.css'

const TABS = ['Overview', 'Spray Calendar', 'New Application', 'Spray Records', 'Planned Programs', 'Mix Calculator', 'Reports']

/**
 * Sprays workspace — canonical TurfIntel workspace pattern (Phase 2.2 pilot).
 * Establishes the header/description/actions/tabs/content rhythm that other
 * workspaces will adopt in subsequent phases.
 */
export default function Spray() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell
      title="Sprays"
      description="Spray applications, programs, and labels."
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <WorkspaceActions>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => setActiveTab('New Application')}
          >
            + New Spray
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab('Reports')}
          >
            Reports
          </button>
        </WorkspaceActions>
      }
    >
      {activeTab === 'Overview'         && <SprayOverview />}
      {activeTab === 'Spray Calendar'   && <SprayCalendar />}
      {activeTab === 'New Application' && <BuildSpraySheet />}
      {activeTab === 'Spray Records'    && <SprayRecords />}
      {activeTab === 'Planned Programs' && <PlannedPrograms />}
      {activeTab === 'Mix Calculator'   && <MixCalculator />}
      {activeTab === 'Reports'          && <SprayReports />}
    </PageShell>
  )
}
