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
import MobileQuickActions from '../../components/feedback/MobileQuickActions'
import { useAlertsData, acknowledgeAlert, dismissAlert } from '../../utils/alerts/alertsStore'
import RecentActivity from './RecentActivity'
import QuickActions from './QuickActions'
import OperationalSummary from './OperationalSummary'
import ActionQueue from './ActionQueue'
import SchedulingAwareness from './SchedulingAwareness'
import {
  CrewStatusCard,
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

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Phase 29 — Operational Command top-of-dashboard panel.
          Composes intelligence outputs from Phases 28A/B/C plus calendar,
          crew, equipment, weather into one prioritized command surface.
          Lives above the intelligence row so superintendent gets the
          command-center view before any individual widget. */}
      {/* Phase 32 — Mobile-only quick actions. Sits above Operational
          Command so the most-used field actions are reachable one-handed
          without scrolling. Hidden on desktop (CSS), where the full Quick
          Actions card in the grid serves the same role. */}
      <div className={styles.mobileQuickRow}>
        <MobileQuickActions />
      </div>

      <div className={styles.opsCommandRow}>
        <OperationalCommand />
      </div>

      {/* Intelligence row — unified weather card + agronomy intelligence */}
      <div className={styles.intelligenceRow}>
        <div className={styles.intelligenceWeather}>
          <WeatherSection
            alerts={weatherAlerts}
            onDismissAlert={handleDismissWeatherAlert}
          />
        </div>
        <div className={styles.intelligenceRight}>
          <DashboardCard title="Growing Degree Days">
            <GDDCard />
          </DashboardCard>
          <DashboardCard title="Application Effectiveness">
            <AppEffectivenessCard />
          </DashboardCard>
          {/* Phase 28A — Agronomic Intelligence Foundation. Decision-support
              only: REI, reapplication windows, rainfast vs forecast,
              FRAC/HRAC/IRAC rotation, weekly N-P-K totals. */}
          <DashboardCard title="Agronomic Intelligence">
            <AgronomicIntelligence />
          </DashboardCard>
          {/* Phase 28B — Spray Window Intelligence. Active spray planning:
              current rating, next ideal window, top risk, rain countdown. */}
          <DashboardCard title="Spray Window Intelligence">
            <SprayWindowCard />
          </DashboardCard>
          {/* Phase 28C — Irrigation & Moisture Intelligence (compact).
              Decision-support only: ET/rain class, rolling deficit, tonight
              rec, top irrigation risk, wilt indicator. */}
          <DashboardCard title="Irrigation Intelligence">
            <IrrigationIntelCard />
          </DashboardCard>
        </div>
      </div>

      {/* Operations Calendar — below intelligence row */}
      <div className={styles.calendarSection}>
        <OperationsCalendar />
      </div>

      {/* Responsive card grid */}
      <div className={styles.grid}>

        {/* ── Urgent ── */}
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

        {/* ── Actions ── */}
        <DashboardCard title="Quick Actions" full>
          <QuickActions />
        </DashboardCard>

        {/* ── Operations Command — Briefing + Action Required + Scheduling ── */}
        <div className={styles.opsSection}>
          <span className={styles.opsSectionLabel}>Operations Command</span>
          <DashboardCard title="Today's Briefing">
            <OperationalSummary />
          </DashboardCard>
          <DashboardCard title="Action Required">
            <ActionQueue />
          </DashboardCard>
          <DashboardCard title="Scheduling Awareness">
            <SchedulingAwareness />
          </DashboardCard>
        </div>

        {/* ── Intelligence ── */}
        <DashboardCard title="Weather Intelligence" wide>
          <WeatherIntelligence />
        </DashboardCard>

        {/* Phase 28C renamed: the compact "Irrigation Intelligence" card
            now lives in the intelligence row beside Spray Window/Agronomic.
            This wide card keeps the full advisory list under a clearer
            name so the two surfaces don't share a title. */}
        <DashboardCard title="Irrigation Detail" wide>
          <IrrigationIntelligence />
        </DashboardCard>

        {/* ── Live snapshot cards (audit R2 — were static placeholders) ── */}
        <DashboardCard title="Crew Status">
          <CrewStatusCard />
        </DashboardCard>

        <DashboardCard title="Equipment Alerts">
          <EquipmentAlertsCard />
        </DashboardCard>

        {/* ── Operations ── */}
        <DashboardCard title="Recent Activity" full>
          <RecentActivity />
        </DashboardCard>

        <DashboardCard title="Upcoming Applications" wide>
          <UpcomingApplicationsCard />
        </DashboardCard>

        <DashboardCard title="Recent Notes">
          <RecentNotesCard />
        </DashboardCard>

      </div>

    </div>
  )
}
