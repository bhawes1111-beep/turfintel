import styles from '../Crew.module.css'

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const STATUS_LABEL = {
  available: 'Available',
  later:     'Coming Later',
  off:       'Off Today',
}

const STATUS_CLASS = {
  available: styles.statusAvailable,
  later:     styles.statusLater,
  off:       styles.statusOff,
}

const INITIAL_CLASS = {
  available: styles.initialAvailable,
  later:     styles.initialLater,
  off:       styles.initialOff,
}

export default function CrewEmployees({ crew }) {
  return (
    <div className={styles.tabContent}>

      <div className={styles.tabActions}>
        <button className={styles.actionBtn} disabled>
          + Add Employee
        </button>
      </div>

      <div className={styles.employeeGrid}>
        {crew.map(e => (
          <div key={e.id} className={styles.employeeCard}>
            <div className={`${styles.employeeAvatar} ${INITIAL_CLASS[e.status]}`}>
              {initials(e.name)}
            </div>
            <span className={styles.employeeName}>{e.name}</span>
            <span className={styles.employeeRole}>{e.role}</span>
            <span className={`${styles.statusBadge} ${STATUS_CLASS[e.status]}`}>
              {e.status === 'later'
                ? `Available ${e.time}`
                : STATUS_LABEL[e.status]}
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}
