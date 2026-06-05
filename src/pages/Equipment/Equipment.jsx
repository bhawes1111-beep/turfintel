import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import { EmptyState } from '../../components/shared/EmptyState'
import EquipmentOverview  from './tabs/EquipmentOverview'
import EquipmentList      from './tabs/EquipmentList'
import MaintenanceLogs    from './tabs/MaintenanceLogs'
import ServiceSchedule    from './tabs/ServiceSchedule'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import workspace from '../../styles/workspace.module.css'
import styles from './Equipment.module.css'

const LEGACY_TABS = ['Overview', 'Equipment List', 'Maintenance Logs', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']

const PLACEHOLDER_COPY = {
  'Repairs':      { subtitle: 'Active repair tickets and shop work.',                   description: 'Repair tickets and shop work will appear here once recorded.' },
  'Fuel Usage':   { subtitle: 'Fuel consumption and refill history by unit.',           description: 'Fuel logs and consumption history will appear here once tracked.' },
  'Parts Needed': { subtitle: 'Parts pending order or required for upcoming services.', description: 'Parts requests tied to maintenance work will appear here once added.' },
}

// Phase 9B.3 — Crosswinds-only simplified Equipment tabs. Four
// visible items + a "More" group whose body renders a secondary pill
// row for the placeholder/specialty surfaces. PageShell is unchanged.
// The legacy 'Repairs' placeholder is dropped on Crosswinds because
// the Crosswinds 'Repairs' tab now renders MaintenanceLogs (the
// implemented work-record component). All 4 implemented tab
// components remain mounted under either the primary tabs or the
// More inner row. location.state.activeTab deep links continue to
// work via CROSSWINDS_LABEL_REMAP — OperationsBoard's
// `{ activeTab: 'Equipment List', equipmentId }` resolves to the
// Crosswinds 'Fleet' tab with the unit pre-selected.
const CROSSWINDS_COURSE_ID = 'crossroads-gc'
const CROSSWINDS_TABS = ['Status', 'Fleet', 'Service', 'Repairs', 'More']
const CROSSWINDS_MORE = ['Fuel Usage', 'Parts Needed']
const CROSSWINDS_LABEL_REMAP = {
  'Overview':         'Status',
  'Equipment List':   'Fleet',
  'Service Schedule': 'Service',
  'Maintenance Logs': 'Repairs',
}

// Pure resolver — given the incoming location.state.activeTab and the
// active course id, returns the (activeTab, moreTab) the page should
// land on. Falls back to course-aware defaults when no seed exists.
function resolveSeedTabs(seedActive, isCrosswinds) {
  const fallback = isCrosswinds
    ? { activeTab: 'Status',   moreTab: 'Fuel Usage' }
    : { activeTab: 'Overview', moreTab: 'Fuel Usage' }
  if (!seedActive) return fallback
  if (!isCrosswinds) {
    return LEGACY_TABS.includes(seedActive)
      ? { activeTab: seedActive, moreTab: 'Fuel Usage' }
      : fallback
  }
  const translated = CROSSWINDS_LABEL_REMAP[seedActive] ?? seedActive
  if (CROSSWINDS_TABS.includes(translated)) {
    return { activeTab: translated, moreTab: 'Fuel Usage' }
  }
  if (CROSSWINDS_MORE.includes(translated)) {
    return { activeTab: 'More', moreTab: translated }
  }
  return fallback
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
  const location     = useLocation()
  const courseId     = useSelectedCourseId()
  const isCrosswinds = courseId === CROSSWINDS_COURSE_ID

  const seed            = resolveSeedTabs(location.state?.activeTab, isCrosswinds)
  const seedEquipmentId = location.state?.equipmentId ?? null

  const [activeTab, setActiveTab] = useState(seed.activeTab)
  const [moreTab,   setMoreTab]   = useState(seed.moreTab)
  // In-workspace click-through seeds (Phase 3.4 + 4.0):
  //   - EquipmentList → MaintenanceLogs seeds a search filter
  //   - ServiceSchedule → EquipmentList seeds a selected unit
  // Lifting both here keeps the receiving tabs as pure consumers of an
  // optional initial prop, and lets us clear stale seeds when the user
  // manually navigates away from the seeded tab.
  const [maintInitialSearch,      setMaintInitialSearch]      = useState(null)
  const [equipInitialSelectedId,  setEquipInitialSelectedId]  = useState(seedEquipmentId)

  // Phase 9B.3 — Crosswinds-aware label resolution for cleanup logic
  // and in-workspace jumps. On Crosswinds 'Equipment List' becomes
  // 'Fleet', 'Maintenance Logs' becomes 'Repairs'.
  const equipListLabel = isCrosswinds ? 'Fleet'   : 'Equipment List'
  const maintLabel     = isCrosswinds ? 'Repairs' : 'Maintenance Logs'
  const serviceLabel   = isCrosswinds ? 'Service' : 'Service Schedule'

  const handleTabChange = (newTab) => {
    if (newTab !== equipListLabel) setEquipInitialSelectedId(null)
    if (newTab !== maintLabel)     setMaintInitialSearch(null)
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

  // Shared per-component props so both the Crosswinds branch and the
  // legacy branch mount the same children with the same contract.
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
      actions={
        <WorkspaceActions>
          <button
            type="button"
            className={workspace.workspaceActionBtn}
            onClick={() => setActiveTab(maintLabel)}
          >
            {isCrosswinds ? 'Repairs' : 'Maintenance'}
          </button>
          <button
            type="button"
            className={`${workspace.workspaceActionBtn} ${workspace.workspaceActionBtnSecondary}`}
            onClick={() => setActiveTab(serviceLabel)}
          >
            {isCrosswinds ? 'Service' : 'Service Schedule'}
          </button>
        </WorkspaceActions>
      }
    >
      {isCrosswinds ? (
        <>
          {activeTab === 'Status'  && <EquipmentOverview />}
          {activeTab === 'Fleet'   && <EquipmentList {...equipmentListProps} />}
          {activeTab === 'Service' && <ServiceSchedule {...serviceScheduleProps} />}
          {activeTab === 'Repairs' && <MaintenanceLogs {...maintenanceLogsProps} />}
          {activeTab === 'More' && (
            <div className={styles.moreInner}>
              <div className={styles.moreNav} role="tablist" aria-label="Advanced equipment surfaces">
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
              {PLACEHOLDER_COPY[moreTab] && (
                <WorkspaceSection
                  title={moreTab}
                  subtitle={PLACEHOLDER_COPY[moreTab].subtitle}
                >
                  <EmptyState
                    title={`${moreTab} — coming soon.`}
                    description={PLACEHOLDER_COPY[moreTab].description}
                  />
                </WorkspaceSection>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {activeTab === 'Overview'          && <EquipmentOverview />}
          {activeTab === 'Equipment List'    && <EquipmentList {...equipmentListProps} />}
          {activeTab === 'Maintenance Logs'  && <MaintenanceLogs {...maintenanceLogsProps} />}
          {activeTab === 'Service Schedule'  && <ServiceSchedule {...serviceScheduleProps} />}
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
        </>
      )}
    </PageShell>
  )
}
