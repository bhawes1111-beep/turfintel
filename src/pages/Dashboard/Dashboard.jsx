import { useState } from 'react'
import DashboardCard from '../../components/shared/DashboardCard'
import { AlertList } from '../../components/shared/alerts'
import {
  WeatherCard, ETCard, ForecastStrip, WeatherAlertBanner,
  PLACEHOLDER_WEATHER_ALERTS,
} from '../../components/shared/weather'
import { DASHBOARD_ALERTS } from '../../data/dashboardAlerts'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const [alerts, setAlerts] = useState(DASHBOARD_ALERTS)
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)

  function handleDismissWeatherAlert(id) {
    setWeatherAlerts(prev => prev.filter(a => a.id !== id))
  }

  function handleAcknowledge(id) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' } : a))
  }

  function handleDismiss(id) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const activeAlerts = alerts.filter(a => a.status !== 'resolved')

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Weather command-center — always visible above the scrollable grid */}
      <div className={styles.weatherSection}>
        {weatherAlerts.length > 0 && (
          <div className={styles.weatherBanners}>
            {weatherAlerts.map(alert => (
              <WeatherAlertBanner
                key={alert.id}
                message={alert.message}
                severity={alert.severity}
                onDismiss={() => handleDismissWeatherAlert(alert.id)}
              />
            ))}
          </div>
        )}
        <div className={styles.weatherCardsRow}>
          <WeatherCard />
          <ETCard />
        </div>
        <ForecastStrip />
      </div>

      {/* Responsive card grid */}
      <div className={styles.grid}>

        {/* Alerts widget — wide + tall, grouped by priority */}
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

        {/* Standard cards */}
        <DashboardCard title="Crew Status">
          <p className={styles.empty}>No crew data.</p>
        </DashboardCard>

        <DashboardCard title="Equipment Alerts">
          <p className={styles.empty}>No alerts.</p>
        </DashboardCard>

        {/* Wide card — needs horizontal space for dates/schedule */}
        <DashboardCard title="Upcoming Applications" wide>
          <p className={styles.empty}>No applications scheduled.</p>
        </DashboardCard>

        {/* Standard */}
        <DashboardCard title="Recent Notes">
          <p className={styles.empty}>No recent activity.</p>
        </DashboardCard>

      </div>
    </div>
  )
}
