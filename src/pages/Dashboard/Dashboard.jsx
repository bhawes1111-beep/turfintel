import { useState, useEffect } from 'react'
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
import { useDashboardPrefs, MAX_COLS_BY_TIER } from '../../utils/dashboard/useDashboardPrefs'
import CustomizePanel from './CustomizePanel'
import { Icon } from '../../components/shared/icons'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { state, dispatch }               = useOperations()
  const alerts                            = state.alerts
  const [weatherAlerts, setWeatherAlerts] = useState(PLACEHOLDER_WEATHER_ALERTS)
  const [panelOpen, setPanelOpen]         = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)
  const {
    prefs,
    tier,
    visible,
    sizeFor,
    setDensity,
    toggleSection,
    setSize,
    resetCurrentLayout,
  } = useDashboardPrefs()

  // Customize mode is tied to panel visibility, but only enables drag handles
  // on non-mobile tiers.
  const customizing = panelOpen && tier !== 'mobile'
  const maxCols     = MAX_COLS_BY_TIER[tier] ?? 3

  // Floating banner: fade out after 6s when customize mode opens.
  useEffect(() => {
    if (!customizing) {
      setBannerVisible(false)
      return
    }
    setBannerVisible(true)
    const t = setTimeout(() => setBannerVisible(false), 6000)
    return () => clearTimeout(t)
  }, [customizing])

  // ESC closes panel + exits customize mode (one-step).
  useEffect(() => {
    if (!panelOpen) return
    const handler = (e) => { if (e.key === 'Escape') setPanelOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [panelOpen])

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

  // Common props passed to every sizeable card.
  const resizeProps = (key) => ({
    customizing,
    cardKey: key,
    onResize: setSize,
    maxCols,
  })

  return (
    <div
      className={styles.page}
      data-density={prefs.density}
      data-customizing={customizing ? 'true' : undefined}
    >

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <button
          className={`${styles.customizeBtn} ${panelOpen ? styles.customizeBtnActive : ''}`}
          onClick={() => setPanelOpen(o => !o)}
          aria-label={panelOpen ? 'Done customizing' : 'Customize dashboard'}
        >
          <Icon name="settings" size={13} />
          {panelOpen ? 'Done' : 'Customize'}
        </button>
      </div>

      {/* Floating customize banner — fades out after ~6s */}
      {customizing && (
        <div className={`${styles.banner} ${!bannerVisible ? styles.bannerHidden : ''}`}>
          Resize cards by dragging edges or corners
        </div>
      )}

      {/* Intelligence row — always visible (primary weather + agronomic data) */}
      <div className={styles.intelligenceRow}>
        <div className={styles.intelligenceWeather}>
          <WeatherSection
            alerts={weatherAlerts}
            onDismissAlert={handleDismissWeatherAlert}
          />
        </div>
        <div className={styles.intelligenceRight}>
          {visible('gdd') && (
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
      {visible('calendar') && (
        <div className={styles.calendarSection}>
          <OperationsCalendar />
        </div>
      )}

      {/* Responsive card grid */}
      <div className={styles.grid}>

        {/* ── Alerts ── */}
        {visible('alerts') && (
          <DashboardCard
            title={`Alerts${activeAlerts.length > 0 ? ` (${activeAlerts.length})` : ''}`}
            size={sizeFor('alerts')}
            {...resizeProps('alerts')}
          >
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
        {visible('quickActions') && (
          <DashboardCard
            title="Quick Actions"
            size={sizeFor('quickActions')}
            {...resizeProps('quickActions')}
          >
            <QuickActions />
          </DashboardCard>
        )}

        {/* ── Operations Command — locked full-width composite ── */}
        {(visible('opsCommand') || visible('schedulingAwareness')) && (
          <div className={styles.opsSection}>
            <span className={styles.opsSectionLabel}>
              Operations Command
              {customizing && <span className={styles.lockedBadge} title="Locked full-width">🔒</span>}
            </span>
            {visible('opsCommand') && (
              <>
                <DashboardCard title="Today's Briefing">
                  <OperationalSummary />
                </DashboardCard>
                <DashboardCard title="Action Required">
                  <ActionQueue />
                </DashboardCard>
              </>
            )}
            {visible('schedulingAwareness') && (
              <DashboardCard
                title="Scheduling Awareness"
                size={sizeFor('schedulingAwareness')}
                {...resizeProps('schedulingAwareness')}
              >
                <SchedulingAwareness />
              </DashboardCard>
            )}
          </div>
        )}

        {/* ── Intelligence ── */}
        {visible('weatherIntelligence') && (
          <DashboardCard
            title="Weather Intelligence"
            size={sizeFor('weatherIntelligence')}
            {...resizeProps('weatherIntelligence')}
          >
            <WeatherIntelligence />
          </DashboardCard>
        )}

        {visible('irrigationIntelligence') && (
          <DashboardCard
            title="Irrigation Intelligence"
            size={sizeFor('irrigationIntelligence')}
            {...resizeProps('irrigationIntelligence')}
          >
            <IrrigationIntelligence />
          </DashboardCard>
        )}

        {visible('equipmentAlerts') && (
          <DashboardCard
            title="Equipment Alerts"
            size={sizeFor('equipmentAlerts')}
            className={styles.placeholderCard}
            {...resizeProps('equipmentAlerts')}
          >
            <p className={styles.empty}>No alerts.</p>
          </DashboardCard>
        )}

        {/* ── Activity ── */}
        {visible('activity') && (
          <DashboardCard
            title="Recent Activity"
            size={sizeFor('activity')}
            {...resizeProps('activity')}
          >
            <RecentActivity />
          </DashboardCard>
        )}

        {/* ── Upcoming / Notes ── */}
        {visible('upcomingApplications') && (
          <DashboardCard
            title="Upcoming Applications"
            size={sizeFor('upcomingApplications')}
            className={styles.placeholderCard}
            {...resizeProps('upcomingApplications')}
          >
            <p className={styles.empty}>No applications scheduled.</p>
          </DashboardCard>
        )}

        {visible('recentNotes') && (
          <DashboardCard
            title="Recent Notes"
            size={sizeFor('recentNotes')}
            className={styles.placeholderCard}
            {...resizeProps('recentNotes')}
          >
            <p className={styles.empty}>No recent activity.</p>
          </DashboardCard>
        )}

      </div>

      {/* Customize panel */}
      {panelOpen && (
        <CustomizePanel
          prefs={prefs}
          tier={tier}
          onClose={() => setPanelOpen(false)}
          setDensity={setDensity}
          toggleSection={toggleSection}
          resetCurrentLayout={resetCurrentLayout}
        />
      )}

    </div>
  )
}
