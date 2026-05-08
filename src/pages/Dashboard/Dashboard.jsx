import { useState } from 'react'
import DashboardCard from '../../components/shared/DashboardCard'
import { AlertList } from '../../components/shared/alerts'
import {
  WeatherCard, ETCard, ForecastStrip, WeatherAlertBanner,
  PLACEHOLDER_WEATHER_ALERTS,
} from '../../components/shared/weather'
import { CalendarGrid, MonthNavigation, EventBadge, CalendarEventDetail, EVENT_COLORS } from '../../components/shared/calendar'
import { DASHBOARD_ALERTS } from '../../data/dashboardAlerts'
import { DASHBOARD_CALENDAR_EVENTS } from '../../data/dashboardCalendarEvents'
import styles from './Dashboard.module.css'

const today = new Date()

const LEGEND_TYPES = [
  'spray', 'cultural', 'crew', 'equipment', 'disease', 'nutrition', 'budget',
]

export default function Dashboard() {
  const [alerts, setAlerts]             = useState(DASHBOARD_ALERTS)
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)
  const [calYear, setCalYear]           = useState(today.getFullYear())
  const [calMonth, setCalMonth]         = useState(today.getMonth())
  const [selectedEvent, setSelectedEvent] = useState(null)

  function handleDismissWeatherAlert(id) {
    setWeatherAlerts(prev => prev.filter(a => a.id !== id))
  }

  function handleAcknowledge(id) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' } : a))
  }

  function handleDismiss(id) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const activeAlerts = alerts.filter(a => a.status !== 'resolved')

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Weather command-center */}
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

        {/* Alerts widget */}
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

        {/* Combined calendar — full width, all modules */}
        <DashboardCard full>
          <MonthNavigation year={calYear} month={calMonth} onPrev={prevMonth} onNext={nextMonth}>
            <div className={styles.calLegend}>
              {LEGEND_TYPES.map(type => (
                <EventBadge key={type} label={type} color={EVENT_COLORS[type]} />
              ))}
            </div>
          </MonthNavigation>
          <CalendarGrid
            events={DASHBOARD_CALENDAR_EVENTS}
            year={calYear}
            month={calMonth}
            defaultView="grid"
            showViewToggle
            maxEventsPerDay={3}
            onEventClick={setSelectedEvent}
          />
        </DashboardCard>

      </div>
      {selectedEvent && (
        <CalendarEventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

    </div>
  )
}
