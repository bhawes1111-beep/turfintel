// Phase 6A.2 — Dashboard restructure: Morning Command Center.
//
// Goal: the 5:30 AM landing page surfaces priorities + actions first,
// then readiness, then ambient intelligence — with duplicate/secondary
// cards moved into a single collapsible "More dashboard panels" so
// nothing is lost but the morning view is calm.
//
// Hierarchy (top → bottom):
//   1. Mobile Quick Actions (mobile only — unchanged)
//   2. COMMAND ROW    — Today's Priorities + Action Required
//   3. READINESS ROW  — Overnight Changes + Crew Readiness + Spray Windows
//   4. INTELLIGENCE ROW — Weather (single primary) + Agronomic / Irrigation / GDD
//   5. Operations Calendar (unchanged)
//   6. MORE DASHBOARD PANELS (collapsed by default) — every demoted card
//
// All store wiring is preserved; this file is layout only. The Operations
// workspace tabs, Display Board, and every other surface are untouched.

import { useState } from 'react'
import DashboardCard from '../../components/shared/DashboardCard'
import { AlertList } from '../../components/shared/alerts'
import { PLACEHOLDER_WEATHER_ALERTS } from '../../components/shared/weather'
import WeatherSection from './WeatherSection'
import OperationsCalendar from './OperationsCalendar'
import WeatherIntelligence from './WeatherIntelligence'
import IrrigationIntelligence from './IrrigationIntelligence'
import GDDCard from './GDDCard'
import AppEffectivenessCard from './AppEffectivenessCard'
import AgronomicIntelligence from './AgronomicIntelligence'
import SprayWindowCard from './SprayWindowCard'
import IrrigationIntelCard from './IrrigationIntelCard'
import OperationalCommand from './OperationalCommand'
import OvernightChanges from './OvernightChanges'
import CrewReadiness from './CrewReadiness'
import MorePanels from './MorePanels'
import MobileQuickActions from '../../components/feedback/MobileQuickActions'
import { useAlertsData, acknowledgeAlert, dismissAlert } from '../../utils/alerts/alertsStore'
import RecentActivity from './RecentActivity'
import QuickActions from './QuickActions'
import OperationalSummary from './OperationalSummary'
import ActionQueue from './ActionQueue'
import SchedulingAwareness from './SchedulingAwareness'
// Phase 7N (1/?) — read-only dashboard stewardship alerts.
import StewardshipAlerts from './StewardshipAlerts'
import {
  EquipmentAlertsCard,
  UpcomingApplicationsCard,
  RecentNotesCard,
} from './SnapshotCards'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { alerts }                        = useAlertsData()
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)

  function handleDismissWeatherAlert(id) {
    setWeatherAlerts(prev => prev.filter(a => a.id !== id))
  }

  function handleAcknowledge(id) {
    acknowledgeAlert(id).catch(() => {})
  }

  function handleDismiss(id) {
    dismissAlert(id).catch(() => {})
  }

  const activeAlerts = alerts.filter(a => a.status !== 'resolved')

  return (
    <div className={styles.page}>

      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Mobile-only quick actions — unchanged. */}
      <div className={styles.mobileQuickRow}>
        <MobileQuickActions />
      </div>

      {/* ── COMMAND ROW ───────────────────────────────────────────────────
          Highest-priority morning surfaces. OperationalCommand wraps the
          existing priorities engine (Phase 29) — reused intact under a
          clearer dashboard-level title. */}
      <div className={styles.commandRow}>
        <DashboardCard title="Today's Priorities">
          <OperationalCommand />
        </DashboardCard>
        <DashboardCard title="Action Required">
          <ActionQueue />
        </DashboardCard>
      </div>

      {/* Phase 7N (1/?) — Stewardship Alerts. Read-only card that
          surfaces setup/data issues from existing stores (inventory ↔
          catalog links, cost basis review, stale completed links,
          unlinked/unscheduled planned items, upcoming spray windows).
          Each row links to the existing surface that addresses the
          issue; the card itself never mutates. */}
      <div className={styles.commandRow}>
        <DashboardCard title="Stewardship Alerts" wide>
          <StewardshipAlerts />
        </DashboardCard>
      </div>

      {/* ── READINESS ROW ─────────────────────────────────────────────────
          What changed overnight, who's working, and the spray window —
          the three "can we start the day" signals. */}
      <div className={styles.readinessRow}>
        <DashboardCard title="Overnight Changes">
          <OvernightChanges />
        </DashboardCard>
        <DashboardCard title="Crew Readiness">
          <CrewReadiness />
        </DashboardCard>
        <DashboardCard title="Spray Windows">
          <SprayWindowCard />
        </DashboardCard>
      </div>

      {/* ── INTELLIGENCE ROW ──────────────────────────────────────────────
          A single primary weather surface, plus the compact intelligence
          stack. WeatherIntelligence + IrrigationIntelligence (the larger
          duplicate variants) live in "More panels" below. */}
      <div className={styles.intelligenceRow}>
        <div className={styles.intelligenceWeather}>
          <WeatherSection
            alerts={weatherAlerts}
            onDismissAlert={handleDismissWeatherAlert}
          />
        </div>
        <div className={styles.intelligenceRight}>
          <DashboardCard title="Agronomic Intelligence">
            <AgronomicIntelligence />
          </DashboardCard>
          <DashboardCard title="Irrigation Intelligence">
            <IrrigationIntelCard />
          </DashboardCard>
          <DashboardCard title="Growing Degree Days">
            <GDDCard />
          </DashboardCard>
        </div>
      </div>

      {/* Operations Calendar — unchanged position. */}
      <div className={styles.calendarSection}>
        <OperationsCalendar />
      </div>

      {/* ── MORE DASHBOARD PANELS ────────────────────────────────────────
          Collapsed by default. Every previously top-level card lives here:
          full Alerts list, desktop Quick Actions, briefing + scheduling
          duplicates, the second weather/irrigation surfaces, app
          effectiveness, equipment snapshot, recent activity/notes,
          upcoming applications. Nothing deleted; everything reachable. */}
      <MorePanels>
        <DashboardCard title={`Alerts${activeAlerts.length > 0 ? ` (${activeAlerts.length})` : ''}`} wide tall>
          <AlertList
            alerts={activeAlerts}
            compact
            groupBy="priority"
            onAcknowledge={handleAcknowledge}
            onDismiss={handleDismiss}
            emptyMessage="All clear — no active alerts."
            emptyIcon="✓"
          />
        </DashboardCard>

        <DashboardCard title="Quick Actions" full>
          <QuickActions />
        </DashboardCard>

        <DashboardCard title="Today's Briefing">
          <OperationalSummary />
        </DashboardCard>

        <DashboardCard title="Scheduling Awareness">
          <SchedulingAwareness />
        </DashboardCard>

        <DashboardCard title="Weather Intelligence" wide>
          <WeatherIntelligence />
        </DashboardCard>

        <DashboardCard title="Irrigation Detail" wide>
          <IrrigationIntelligence />
        </DashboardCard>

        <DashboardCard title="Application Effectiveness">
          <AppEffectivenessCard />
        </DashboardCard>

        <DashboardCard title="Equipment Alerts">
          <EquipmentAlertsCard />
        </DashboardCard>

        <DashboardCard title="Upcoming Applications" wide>
          <UpcomingApplicationsCard />
        </DashboardCard>

        <DashboardCard title="Recent Notes">
          <RecentNotesCard />
        </DashboardCard>

        <DashboardCard title="Recent Activity" full>
          <RecentActivity />
        </DashboardCard>
      </MorePanels>

    </div>
  )
}
