import { useState } from 'react'
import styles from '../Crew.module.css'

const PLACEHOLDER_TASKS = [
  { id: 1, title: 'Mow Fairways — Front 9',  area: 'Holes 1–9',   status: 'pending' },
  { id: 2, title: 'Edge Cart Paths',          area: 'All',         status: 'pending' },
  { id: 3, title: 'Bunker Raking',            area: 'Holes 4,7,12', status: 'pending' },
  { id: 4, title: 'Green Mowing',             area: 'All 18',      status: 'pending' },
]

export default function CrewTasks({ crew }) {
  const [displayBoard, setDisplayBoard] = useState(false)

  // Future logic: off employees excluded from assignment dropdowns.
  // status === 'off' employees are intentionally filtered here so the
  // dropdown is already wired correctly when real save logic is added.
  const assignable = crew.filter(e => e.status !== 'off')

  return (
    <div className={styles.tabContent}>

      {/* Actions bar */}
      <div className={styles.tabActions}>
        <button
          className={`${styles.actionBtn} ${displayBoard ? styles.actionBtnActive : ''}`}
          onClick={() => setDisplayBoard(b => !b)}
        >
          {displayBoard ? 'Exit Display Board' : '⊞ Display Board Mode'}
        </button>
      </div>

      {/* Display board placeholder */}
      {displayBoard && (
        <div className={styles.displayBoard}>
          <p className={styles.displayBoardTitle}>Display Board Mode</p>
          <p className={styles.displayBoardNote}>
            Large-screen crew task board coming soon. Will show assigned tasks,
            employee status, and progress in real time.
          </p>
        </div>
      )}

      {/* Two-column: task board + assignment panel */}
      <div className={styles.twoCol}>

        {/* Daily task board */}
        <div className={styles.colSection}>
          <p className={styles.sectionLabel}>Daily Task Board</p>
          <div className={styles.taskList}>
            {PLACEHOLDER_TASKS.map(task => (
              <div key={task.id} className={styles.taskCard}>
                <div className={styles.taskHeader}>
                  <span className={styles.taskTitle}>{task.title}</span>
                  <span className={styles.taskBadge}>{task.status}</span>
                </div>
                <span className={styles.taskMeta}>Area: {task.area}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Employee assignment */}
        <div className={styles.colSection}>
          <p className={styles.sectionLabel}>Employee Assignment</p>
          <div className={styles.assignPanel}>
            {PLACEHOLDER_TASKS.map(task => (
              <div key={task.id} className={styles.assignRow}>
                <span className={styles.assignLabel}>{task.title}</span>
                <select className={styles.assignSelect} defaultValue="">
                  <option value="" disabled>Assign employee…</option>
                  {assignable.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.status === 'later' ? ` — from ${e.time}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <p className={styles.assignNote}>
              Employees marked off are excluded from this list. Employees
              arriving later show their available start time.
            </p>
          </div>
        </div>
      </div>

      {/* Task notes */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Task Notes</p>
        <div className={styles.placeholder}>
          Task notes and field updates will appear here.
        </div>
      </div>

      {/* Photo notes */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Photo Notes</p>
        <div className={styles.photoUploadArea}>
          <span className={styles.photoUploadText}>
            Photo uploads tied to tasks and notes — coming soon
          </span>
        </div>
      </div>

    </div>
  )
}
