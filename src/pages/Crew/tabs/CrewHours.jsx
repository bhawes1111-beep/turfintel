import styles from '../Crew.module.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Placeholder hours grid — replace rows with API data when backend is ready
const PLACEHOLDER_HOURS = [
  { id: 1, name: 'Carlos M.',  hours: [8, 8, 8, 8, 8, 0],  total: 40 },
  { id: 2, name: 'Juan R.',    hours: [0, 6, 8, 8, 8, 0],  total: 30 },
  { id: 3, name: 'Miguel S.',  hours: [8, 8, 8, 8, 6, 0],  total: 38 },
  { id: 4, name: 'Derek L.',   hours: [0, 0, 0, 0, 0, 0],  total: 0  },
  { id: 5, name: 'James T.',   hours: [8, 8, 8, 0, 8, 0],  total: 32 },
]

export default function CrewHours({ crew }) {
  return (
    <div className={styles.tabContent}>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Weekly Hours Summary</p>
        <div className={styles.tableWrap}>
          <table className={styles.hoursTable}>
            <thead>
              <tr>
                <th>Employee</th>
                {DAYS.map(d => <th key={d}>{d}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_HOURS.map(row => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  {row.hours.map((h, i) => (
                    <td key={i} className={h === 0 ? styles.hoursZero : ''}>
                      {h === 0 ? '—' : `${h}h`}
                    </td>
                  ))}
                  <td className={styles.hoursTotal}>{row.total}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.assignNote}>
          Hours tracking and time clock integration coming soon.
        </p>
      </div>

    </div>
  )
}
