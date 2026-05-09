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
import { useOperations } from '../../utils/operations/OperationsContext'
import { acknowledgeAlert, dismissAlert } from '../../utils/operations/actions'
import RecentActivity from './RecentActivity'
import QuickActions from './QuickActions'
import OperationalSummary from './OperationalSummary'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { state, dispatch }               = useOperations()
  const alerts                            = state.alerts
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)

  function handleDismissWeatherAlert(id) {
    setWeatherAlerts(prev => prev.filter(a => a.id !== id))
  }

  function handleAcknowledge(id) {
    dispatch(acknowledgeAlert(id))
  }

  function handleDismiss(id) {
    dispatch(dismissAlert(id))
  }

  const activeAlerts = alerts.filter(a => a.status !== 'resolved')

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
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
        </div>
      </div>

      {/* Operations Calendar — below intelligence row */}
      <div className={styles.calendarSection}>
        <OperationsCalendar />
      </div>

      {/* Responsive card grid */}
      <div className={styles.grid}>

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

        <DashboardCard title="Today's Briefing" full>
          <OperationalSummary />
        </DashboardCard>

        <DashboardCard title="Weather Intelligence" wide>
          <WeatherIntelligence />
        </DashboardCard>

        <DashboardCard title="Irrigation Intelligence" wide>
          <IrrigationIntelligence />
        </DashboardCard>

        <DashboardCard title="Crew Status">
          <p className={styles.empty}>No crew data.</p>
        </DashboardCard>

        <DashboardCard title="Equipment Alerts">
          <p className={styles.empty}>No alerts.</p>
        </DashboardCard>

        <DashboardCard title="Recent Activity" full>
          <RecentActivity />
        </DashboardCard>

        <DashboardCard title="Upcoming Applications" wide>
          <p className={styles.empty}>No applications scheduled.</p>
        </DashboardCard>

        <DashboardCard title="Recent Notes">
          <p className={styles.empty}>No recent activity.</p>
        </DashboardCard>

      </div>

    </div>
  )
}
