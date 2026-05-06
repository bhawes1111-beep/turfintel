import styles from './Dashboard.module.css'

export default function Dashboard() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      <div className={styles.weatherBar}>
        <span className={styles.weatherItem}>&#9728; Weather data coming soon</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Task Overview</h2>
          <p className={styles.cardBody}>No tasks today</p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Crew Status</h2>
          <p className={styles.cardBody}>No crew data</p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Equipment Alerts</h2>
          <p className={styles.cardBody}>No alerts</p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Upcoming Applications</h2>
          <p className={styles.cardBody}>None scheduled</p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Recent Notes</h2>
          <p className={styles.cardBody}>No recent activity</p>
        </div>
      </div>
    </div>
  )
}
