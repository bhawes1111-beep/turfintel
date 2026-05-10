import { PLANNED_PROGRAMS } from '../../../data/spray'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Spray.module.css'

const STATUS_CLASS = {
  active:    styles.statusActive,
  completed: styles.statusCompleted,
}

export default function PlannedPrograms() {
  if (PLANNED_PROGRAMS.length === 0) {
    return (
      <div className={styles.tabContent}>
        <EmptyState
          title="No spray programs planned."
          description="Recurring spray programs and seasonal schedules will appear here once defined."
        />
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.programList}>
        {PLANNED_PROGRAMS.map(p => (
          <div key={p.id} className={styles.programCard}>
            <div className={styles.programHeader}>
              <span className={styles.programName}>{p.name}</span>
              <span className={`${styles.programStatusBadge} ${STATUS_CLASS[p.status] ?? ''}`}>
                {p.status}
              </span>
            </div>

            <div className={styles.programMeta}>
              <div className={styles.programMetaItem}>
                <span className={styles.programMetaLabel}>Target Pest</span>
                <span className={styles.programMetaValue}>{p.targetPest}</span>
              </div>
              <div className={styles.programMetaItem}>
                <span className={styles.programMetaLabel}>Frequency</span>
                <span className={styles.programMetaValue}>{p.frequency}</span>
              </div>
              <div className={styles.programMetaItem}>
                <span className={styles.programMetaLabel}>Areas</span>
                <span className={styles.programMetaValue}>{p.areas}</span>
              </div>
              <div className={styles.programMetaItem}>
                <span className={styles.programMetaLabel}>Next Application</span>
                <span className={styles.programMetaValue}>{p.nextApp}</span>
              </div>
            </div>

            <div className={styles.programProducts}>
              {p.products.map(prod => (
                <span key={prod} className={styles.programProductPill}>{prod}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
