import DashboardCard from '../../components/shared/DashboardCard'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Full-width weather strip — wide format, ready for radar/forecast data */}
      <div className={styles.weatherBar}>
        <span className={styles.weatherItem}>&#9728; Weather — data coming soon</span>
        <span className={styles.weatherSpacer} />
        <span className={styles.weatherItem}>&#127774; High: --°F</span>
        <span className={styles.weatherItem}>&#128167; Humidity: --%</span>
        <span className={styles.weatherItem}>&#127788; Wind: -- mph</span>
      </div>

      {/* Responsive card grid */}
      <div className={styles.grid}>

        {/* Priority card — wide + tall for task summary/AI alerts later */}
        <DashboardCard title="Task Overview" wide tall>
          <p className={styles.empty}>No tasks scheduled for today.</p>
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
