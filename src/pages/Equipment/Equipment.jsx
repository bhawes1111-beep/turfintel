import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import { EmptyState } from '../../components/shared/EmptyState'
import EquipmentOverview  from './tabs/EquipmentOverview'
import EquipmentList      from './tabs/EquipmentList'
import MaintenanceLogs    from './tabs/MaintenanceLogs'
import workspace from '../../styles/workspace.module.css'

const TABS = ['Overview', 'Equipment List', 'Maintenance Logs', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']

const PLACEHOLDER_COPY = {
  'Repairs':          { subtitle: 'Active repair tickets and shop work.',                  description: 'Repair tickets and shop work will appear here once recorded.' },
  'Fuel Usage':       { subtitle: 'Fuel consumption and refill history by unit.',          description: 'Fuel logs and consumption history will appear here once tracked.' },
  'Service Schedule': { subtitle: 'Upcoming preventive maintenance across the fleet.',     description: 'Planned services and PM intervals will appear here once scheduled.' },
  'Parts Needed':     { subtitle: 'Parts pending order or required for upcoming services.',description: 'Parts requests tied to maintenance work will appear here once added.' },
}

/**
 * Equipment workspace — Phase 2.4 canonical workspace pattern. Header carries
 * description + operational actions (Maintenance, Service Schedule); each tab
 * body wraps its content in WorkspaceSection for consistent rhythm. Overview
 * stays on ModuleOverview per directive — WorkspaceSection is the long-term
 * direction but is not expanded here.
 */
export default function Equipment() {
  // Cross-module click-through seed (Phase 3.4): when navigated to with state
  // (e.g. from Operations equipment chip), open the requested tab and unit.
  const location = useLocation()
  const seedTab         = TABS.includes(location.state?.activeTab) ? location.state.activeTab : 'Overview'
  const seedEquipmentId = location.state?.equipmentId ?? null

  const [activeTab, setActiveTab] = useState(seedTab)
  // In-workspace click-through (Phase 3.4): EquipmentList → MaintenanceLogs
  // seeds a search filter with the unit name; this state lifts the seed so
  // MaintenanceLogs can read it as an initial value when the tab mounts.
  const [maintInitialSearch, setMaintInitialSearch] = useState(null)
  const jumpToMaintenance = (unitName) => {
    setMaintInitialSearch(unitName)
    setActiveTab('Maintenance Logs')
  }

  return (
    <PageShell
      title="Equipment"
      description="Fleet management, maintenance schedules, repairs, and operational equipment tracking."
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <WorkspaceActions>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => setActiveTab('Maintenance Logs')}
          >
            Maintenance
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab('Service Schedule')}
          >
            Service Schedule
          </button>
        </WorkspaceActions>
      }
    >
      {activeTab === 'Overview'          && <EquipmentOverview />}
      {activeTab === 'Equipment List'    && <EquipmentList initialSelectedId={seedEquipmentId} onJumpToMaintenance={jumpToMaintenance} />}
      {activeTab === 'Maintenance Logs'  && <MaintenanceLogs initialSearch={maintInitialSearch} />}
      {PLACEHOLDER_COPY[activeTab] && (
        <WorkspaceSection
          title={activeTab}
          subtitle={PLACEHOLDER_COPY[activeTab].subtitle}
        >
          <EmptyState
            title={`${activeTab} — coming soon.`}
            description={PLACEHOLDER_COPY[activeTab].description}
          />
        </WorkspaceSection>
      )}
    </PageShell>
  )
}
