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
import ActionQueue from './ActionQueue'
import SchedulingAwareness from './SchedulingAwareness'
import { useDashboardPrefs } from '../../utils/dashboard/useDashboardPrefs'
import CustomizePanel from './CustomizePanel'
import { Icon } from '../../components/shared/icons'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { state, dispatch }               = useOperations()
  const alerts                            = state.alerts
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)
  const [panelOpen, setPanelOpen]         = useState(false)
  const { prefs, setDensity, toggleSection } = useDashboardPrefs()
  const vis = prefs.visibility

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
    <div className={styles.page} data-density={prefs.density}>

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <button
          className={styles.customizeBtn}
          onClick={() => setPanelOpen(true)}
          aria-label="Customize dashboard"
        >
          <Icon name="settings" size={13} />
          Customize
        </button>
      </div>

      {/* Intelligence row — always visible (primary weather + agronomic data) */}
      <div className={styles.intelligenceRow}>
        <div className={styles.intelligenceWeather}>
          <WeatherSection
            alerts={weatherAlerts}
            onDismissAlert={handleDismissWeatherAlert}
          />
        </div>
        <div className={styles.intelligenceRight}>
          {vis.gdd && (
            <DashboardCard title="Growing Degree Days">
              <GDDCard />
            </DashboardCard>
          )}
          <DashboardCard title="Application Effectiveness">
            <AppEffectivenessCard />
          </DashboardCard>
        </div>
      </div>

      {/* Operations Calendar */}
      {vis.calendar && (
        <div className={styles.calendarSection}>
          <OperationsCalendar />
        </div>
      )}

      {/* Responsive card grid */}
      <div className={styles.grid}>

        {/* ── Alerts ── */}
        {vis.alerts && (
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
        )}

        {/* ── Quick Actions ── */}
        {vis.quickActions && (
          <DashboardCard title="Quick Actions" full>
            <QuickActions />
          </DashboardCard>
        )}

        {/* ── Operations Command — Today's Briefing + Action Required + Scheduling ── */}
        {(vis.opsCommand || vis.schedulingAwareness) && (
          <div className={styles.opsSection}>
            <span className={styles.opsSectionLabel}>Operations Command</span>
            {vis.opsCommand && (
              <>
                <DashboardCard title="Today's Briefing">
                  <OperationalSummary />
                </DashboardCard>
                <DashboardCard title="Action Required">
                  <ActionQueue />
                </DashboardCard>
              </>
            )}
            {vis.schedulingAwareness && (
              <DashboardCard title="Scheduling Awareness">
                <SchedulingAwareness />
              </DashboardCard>
            )}
          </div>
        )}

        {/* ── Intelligence ── */}
        {vis.weatherIntelligence && (
          <DashboardCard title="Weather Intelligence" wide>
            <WeatherIntelligence />
          </DashboardCard>
        )}

        {vis.irrigationIntelligence && (
          <DashboardCard title="Irrigation Intelligence" wide>
            <IrrigationIntelligence />
          </DashboardCard>
        )}

        {/* Equipment Alerts: placed after Irrigation to pair in the 3-col grid */}
        {vis.equipmentAlerts && (
          <DashboardCard title="Equipment Alerts" className={styles.placeholderCard}>
            <p className={styles.empty}>No alerts.</p>
          </DashboardCard>
        )}

        {/* ── Activity ── */}
        {vis.activity && (
          <DashboardCard title="Recent Activity" full>
            <RecentActivity />
          </DashboardCard>
        )}

        {/* ── Upcoming / Notes ── */}
        {vis.upcomingApplications && (
          <DashboardCard title="Upcoming Applications" wide className={styles.placeholderCard}>
            <p className={styles.empty}>No applications scheduled.</p>
          </DashboardCard>
        )}

        {vis.recentNotes && (
          <DashboardCard title="Recent Notes" className={styles.placeholderCard}>
            <p className={styles.empty}>No recent activity.</p>
          </DashboardCard>
        )}

      </div>

      {/* Customize panel */}
      {panelOpen && (
        <CustomizePanel
          prefs={prefs}
          onClose={() => setPanelOpen(false)}
          setDensity={setDensity}
          toggleSection={toggleSection}
        />
      )}

    </div>
  )
}
