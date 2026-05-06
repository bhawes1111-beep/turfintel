import styles from '../Crew.module.css'

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function CrewSchedule({ crew }) {
  const available = crew.filter(e => e.status === 'available')
  const later     = crew.filter(e => e.status === 'later')
  const off       = crew.filter(e => e.status === 'off')

  return (
    <div className={styles.tabContent}>

      {/* Available Now */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>
          Available Now
          <span className={styles.sectionCount}>{available.length}</span>
        </p>
        <div className={styles.scheduleGroup}>
          {available.map(e => (
            <div key={e.id} className={styles.scheduleRow}>
              <div className={`${styles.scheduleInitial} ${styles.initialAvailable}`}>
                {initials(e.name)}
              </div>
              <span className={styles.scheduleName}>{e.name}</span>
              <span className={styles.scheduleRole}>{e.role}</span>
              <span className={`${styles.statusBadge} ${styles.statusAvailable}`}>
                Available Now
              </span>
            </div>
          ))}
          {available.length === 0 && (
            <p className={styles.emptyState}>No employees available now.</p>
          )}
        </div>
      </div>

      {/* Coming In Later */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>
          Coming In Later
          <span className={styles.sectionCount}>{later.length}</span>
        </p>
        <div className={styles.scheduleGroup}>
          {later.map(e => (
            <div key={e.id} className={styles.scheduleRow}>
              <div className={`${styles.scheduleInitial} ${styles.initialLater}`}>
                {initials(e.name)}
              </div>
              <span className={styles.scheduleName}>{e.name}</span>
              <span className={styles.scheduleRole}>{e.role}</span>
              <span className={`${styles.statusBadge} ${styles.statusLater}`}>
                Available {e.time}
              </span>
            </div>
          ))}
          {later.length === 0 && (
            <p className={styles.emptyState}>No employees arriving later.</p>
          )}
        </div>
      </div>

      {/* Off Today */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>
          Off Today
          <span className={styles.sectionCount}>{off.length}</span>
        </p>
        <div className={styles.scheduleGroup}>
          {off.map(e => (
            <div key={e.id} className={styles.scheduleRow}>
              <div className={`${styles.scheduleInitial} ${styles.initialOff}`}>
                {initials(e.name)}
              </div>
              <span className={styles.scheduleName}>{e.name}</span>
              <span className={styles.scheduleRole}>{e.role}</span>
              <span className={`${styles.statusBadge} ${styles.statusOff}`}>
                Off Today
              </span>
            </div>
          ))}
          {off.length === 0 && (
            <p className={styles.emptyState}>No employees off today.</p>
          )}
        </div>
      </div>

    </div>
  )
}
