import { useState } from 'react'
import DashboardCard from '../../components/shared/DashboardCard'
import { AlertList } from '../../components/shared/alerts'
import { PLACEHOLDER_WEATHER_ALERTS } from '../../components/shared/weather'
import WeatherSection from './WeatherSection'
import OperationsCalendar from './OperationsCalendar'
import { useOperations } from '../../utils/operations/OperationsContext'
import { acknowledgeAlert, dismissAlert } from '../../utils/operations/actions'
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

      {/* Weather section — redesigned */}
      <div className={styles.weatherSection}>
        <WeatherSection
          alerts={weatherAlerts}
          onDismissAlert={handleDismissWeatherAlert}
        />
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

        <DashboardCard title="Crew Status">
          <p className={styles.empty}>No crew data.</p>
        </DashboardCard>

        <DashboardCard title="Equipment Alerts">
          <p className={styles.empty}>No alerts.</p>
        </DashboardCard>

        <DashboardCard title="Upcoming Applications" wide>
          <p className={styles.empty}>No applications scheduled.</p>
        </DashboardCard>

        <DashboardCard title="Recent Notes">
          <p className={styles.empty}>No recent activity.</p>
        </DashboardCard>

        <DashboardCard full>
          <OperationsCalendar />
        </DashboardCard>

      </div>

    </div>
  )
}
