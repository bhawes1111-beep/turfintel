import { useMemo, useState } from 'react'
import DashboardCard from '../../components/shared/DashboardCard'
import { AlertList } from '../../components/shared/alerts'
import { PLACEHOLDER_WEATHER_ALERTS } from '../../components/shared/weather'
import MobileQuickActions from '../../components/feedback/MobileQuickActions'
import { useAlertsData, acknowledgeAlert, dismissAlert } from '../../utils/alerts/alertsStore'
import { useDashboardPreferences } from '../../utils/dashboard/dashboardPreferences'
import WeatherSection from './WeatherSection'
import OperationsCalendar from './OperationsCalendar'
import WeatherIntelligence from './WeatherIntelligence'
import IrrigationIntelligence from './IrrigationIntelligence'
import GDDCard from './GDDCard'
import AppEffectivenessCard from './AppEffectivenessCard'
import AgronomicIntelligence from './AgronomicIntelligence'
import IrrigationIntelCard from './IrrigationIntelCard'
import OperationalCommand from './OperationalCommand'
import OvernightChanges from './OvernightChanges'
import CrewReadiness from './CrewReadiness'
import MorePanels from './MorePanels'
import RecentActivity from './RecentActivity'
import QuickActions from './QuickActions'
import OperationalSummary from './OperationalSummary'
import ActionQueue from './ActionQueue'
import SchedulingAwareness from './SchedulingAwareness'
import StewardshipAlerts from './StewardshipAlerts'
import SprayProgramSnapshot from './SprayProgramSnapshot'
import DashboardOperationsStrip from './DashboardOperationsStrip'
import CrosswindsPilotChecklist from './CrosswindsPilotChecklist'
import ApplicationTimingCoverage from './ApplicationTimingCoverage'
import DashboardCustomizer from './DashboardCustomizer'
import NutrientAlertsWidget from './NutrientAlertsWidget'
import {
  EquipmentAlertsCard,
  UpcomingApplicationsCard,
  RecentNotesCard,
} from './SnapshotCards'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { alerts } = useAlertsData()
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)
  const [customizing, setCustomizing] = useState(false)
  const { layout, saveLayout, resetLayout, syncState } = useDashboardPreferences()

  function handleDismissWeatherAlert(id) {
    setWeatherAlerts(previous => previous.filter(alert => alert.id !== id))
  }

  function handleAcknowledge(id) {
    acknowledgeAlert(id).catch(() => {})
  }

  function handleDismiss(id) {
    dismissAlert(id).catch(() => {})
  }

  const activeAlerts = alerts.filter(alert => alert.status !== 'resolved')
  const hiddenModules = useMemo(() => new Set(layout.hidden), [layout.hidden])

  const modules = {
    command: (
      <div className={styles.commandRow} key="command">
        <DashboardCard title="Today's Priorities"><OperationalCommand /></DashboardCard>
        <DashboardCard title="Action Required"><ActionQueue /></DashboardCard>
      </div>
    ),
    nutrientAlerts: (
      <div className={styles.moduleRow} key="nutrientAlerts">
        <DashboardCard title="Nutrient Alerts" full><NutrientAlertsWidget /></DashboardCard>
      </div>
    ),
    applicationTiming: (
      <div className={styles.moduleRow} key="applicationTiming">
        <DashboardCard title="Application Timing & Coverage" full>
          <ApplicationTimingCoverage />
        </DashboardCard>
      </div>
    ),
    operations: (
      <div className={styles.moduleRow} key="operations">
        <DashboardCard title="Operations" full><DashboardOperationsStrip /></DashboardCard>
      </div>
    ),
    readiness: (
      <div className={styles.readinessRow} key="readiness">
        <DashboardCard title="Overnight Changes"><OvernightChanges /></DashboardCard>
        <DashboardCard title="Crew Readiness"><CrewReadiness /></DashboardCard>
      </div>
    ),
    weather: (
      <div className={styles.moduleRow} key="weather">
        <div className={styles.intelligenceWeather}>
          <WeatherSection alerts={weatherAlerts} onDismissAlert={handleDismissWeatherAlert} />
        </div>
      </div>
    ),
    agronomy: (
      <div className={styles.moduleRow} key="agronomy">
        <DashboardCard title="Agronomic Intelligence" full><AgronomicIntelligence /></DashboardCard>
      </div>
    ),
    irrigation: (
      <div className={styles.moduleRow} key="irrigation">
        <DashboardCard title="Irrigation Intelligence" full><IrrigationIntelCard /></DashboardCard>
      </div>
    ),
    gdd: (
      <div className={styles.moduleRow} key="gdd">
        <DashboardCard title="Growing Degree Days" full><GDDCard /></DashboardCard>
      </div>
    ),
    stewardship: (
      <div className={styles.moduleRow} key="stewardship">
        <DashboardCard title="Stewardship Alerts" full><StewardshipAlerts /></DashboardCard>
      </div>
    ),
    calendar: (
      <div className={styles.calendarSection} key="calendar"><OperationsCalendar /></div>
    ),
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <button
          type="button"
          className={styles.customizeButton}
          onClick={() => setCustomizing(value => !value)}
          aria-expanded={customizing}
        >
          Customize
        </button>
      </div>

      {customizing && (
        <DashboardCustomizer
          layout={layout}
          syncState={syncState}
          onChange={saveLayout}
          onReset={resetLayout}
          onClose={() => setCustomizing(false)}
        />
      )}

      <div className={styles.mobileQuickRow}><MobileQuickActions /></div>

      {layout.order.map(id => hiddenModules.has(id) ? null : modules[id])}

      <MorePanels>
        <DashboardCard title={`Alerts${activeAlerts.length > 0 ? ` (${activeAlerts.length})` : ''}`} wide tall>
          <AlertList
            alerts={activeAlerts}
            compact
            groupBy="priority"
            onAcknowledge={handleAcknowledge}
            onDismiss={handleDismiss}
            emptyMessage="All clear - no active alerts."
            emptyIcon="OK"
          />
        </DashboardCard>

        <DashboardCard title="Quick Actions" full><QuickActions /></DashboardCard>
        <DashboardCard title="Today's Briefing"><OperationalSummary /></DashboardCard>
        <DashboardCard title="Scheduling Awareness"><SchedulingAwareness /></DashboardCard>
        <DashboardCard title="Weather Intelligence" wide><WeatherIntelligence /></DashboardCard>
        <DashboardCard title="Irrigation Detail" wide><IrrigationIntelligence /></DashboardCard>
        <DashboardCard title="Application Effectiveness"><AppEffectivenessCard /></DashboardCard>
        <DashboardCard title="Application Program Detail" full><SprayProgramSnapshot /></DashboardCard>
        <DashboardCard title="Equipment Alerts"><EquipmentAlertsCard /></DashboardCard>
        <DashboardCard title="Upcoming Applications" wide><UpcomingApplicationsCard /></DashboardCard>
        <DashboardCard title="Recent Notes"><RecentNotesCard /></DashboardCard>
        <DashboardCard title="Recent Activity" full><RecentActivity /></DashboardCard>
        <DashboardCard title="Crosswinds Pilot Setup" full><CrosswindsPilotChecklist /></DashboardCard>
      </MorePanels>
    </div>
  )
}
