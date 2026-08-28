import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import { EmptyState } from '../../components/shared/EmptyState'
import EquipmentOverview  from './tabs/EquipmentOverview'
import EquipmentList      from './tabs/EquipmentList'
import MaintenanceLogs    from './tabs/MaintenanceLogs'
import ServiceSchedule    from './tabs/ServiceSchedule'
import EquipmentIssuesReview from './tabs/EquipmentIssuesReview'
import { useSelectedCourseId } from '../../utils/courses/courseStore'

const LEGACY_TABS = ['Overview', 'Equipment List', 'Maintenance Logs', 'Issues', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']

const PLACEHOLDER_COPY = {
  'Repairs':      { subtitle: 'Active repair tickets and shop work.',                   description: 'Repair tickets and shop work will appear here once recorded.' },
  'Fuel Usage':   { subtitle: 'Fuel consumption and refill history by unit.',           description: 'Fuel logs and consumption history will appear here once tracked.' },
  'Parts Needed': { subtitle: 'Parts pending order or required for upcoming services.', description: 'Parts requests tied to maintenance work will appear here once added.' },
}

const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Status', 'Fleet', 'Maintenance', 'Issues']
const CROSSWINDS_LABEL_REMAP = {
  'Overview':         'Status',
  'Equipment List':   'Fleet',
  'Service Schedule': 'Maintenance',
  'Maintenance Logs': 'Maintenance',
  'Repairs':          'Maintenance',
}

function resolveSeedTab(seedActive, isCrosswinds) {
  const fallback = isCrosswinds ? 'Status' : 'Overview'
  if (!seedActive) return fallback
  if (!isCrosswinds) return LEGACY_TABS.includes(seedActive) ? seedActive : fallback
  const translated = CROSSWINDS_LABEL_REMAP[seedActive] ?? seedActive
  return CROSSWINDS_TABS.includes(translated) ? translated : fallback
}

export default function Equipment() {
  const location     = useLocation()
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  const seedTab         = resolveSeedTab(location.state?.activeTab, isCrosswinds)
  const seedEquipmentId = location.state?.equipmentId ?? null

  const [activeTab, setActiveTab] = useState(seedTab)
  const [maintInitialSearch,     setMaintInitialSearch]     = useState(null)
  const [equipInitialSelectedId, setEquipInitialSelectedId] = useState(seedEquipmentId)

  const equipListLabel = isCrosswinds ? 'Fleet'   : 'Equipment List'
  const maintLabel     = isCrosswinds ? 'Maintenance' : 'Maintenance Logs'

  const handleTabChange = (newTab) => {
    if (newTab !== equipListLabel) setEquipInitialSelectedId(null)
    if (newTab !== maintLabel) setMaintInitialSearch(null)
    setActiveTab(newTab)
  }
  const jumpToMaintenance = (unitName) => {
    setMaintInitialSearch(unitName)
    setActiveTab(maintLabel)
  }
  const jumpToUnit = (unitId) => {
    setEquipInitialSelectedId(unitId)
    setActiveTab(equipListLabel)
  }

  const tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS

  const equipmentListProps = {
    initialSelectedId:   equipInitialSelectedId,
    onJumpToMaintenance: jumpToMaintenance,
  }
  const maintenanceLogsProps = {
    initialSearch: maintInitialSearch,
  }
  const serviceScheduleProps = {
    onJumpToUnit:        jumpToUnit,
    onJumpToMaintenance: jumpToMaintenance,
  }

  return (
    <PageShell
      title="Equipment"
      description="Fleet management, maintenance schedules, repairs, and operational equipment tracking."
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {isCrosswinds ? (
        <>
          {activeTab === 'Status' && <EquipmentOverview />}
          {activeTab === 'Fleet' && <EquipmentList {...equipmentListProps} />}
          {activeTab === 'Maintenance' && (
            <>
              <ServiceSchedule {...serviceScheduleProps} />
              <MaintenanceLogs {...maintenanceLogsProps} />
            </>
          )}
          {activeTab === 'Issues' && <EquipmentIssuesReview />}
        </>
      ) : (
        <>
          {activeTab === 'Overview'          && <EquipmentOverview />}
          {activeTab === 'Equipment List'    && <EquipmentList {...equipmentListProps} />}
          {activeTab === 'Maintenance Logs'  && <MaintenanceLogs {...maintenanceLogsProps} />}
          {activeTab === 'Service Schedule'  && <ServiceSchedule {...serviceScheduleProps} />}
          {activeTab === 'Issues'            && <EquipmentIssuesReview />}
          {PLACEHOLDER_COPY[activeTab] && (
            <WorkspaceSection
              title={activeTab}
              subtitle={PLACEHOLDER_COPY[activeTab].subtitle}
            >
              <EmptyState
                title={`${activeTab} - coming soon.`}
                description={PLACEHOLDER_COPY[activeTab].description}
              />
            </WorkspaceSection>
          )}
        </>
      )}
    </PageShell>
  )
}
