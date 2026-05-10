import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Crew.module.css'

// Crew notes — empty in production until live notes are added.
const PLACEHOLDER_NOTES = []

export default function CrewNotes() {
  return (
    <div className={styles.tabContent}>

      <div className={styles.tabActions}>
        <button className={styles.actionBtn} disabled>
          + Add Note
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Crew Notes</p>
        <div className={styles.notesFeed}>
          {PLACEHOLDER_NOTES.length === 0 ? (
            <EmptyState
              title="No crew notes yet."
              description="Notes posted by the crew will appear here."
            />
          ) : (
            PLACEHOLDER_NOTES.map(note => (
              <div key={note.id} className={styles.noteCard}>
                <div className={styles.noteMeta}>
                  <span>{note.author}</span>
                  <span> · </span>
                  <span>{note.time}</span>
                </div>
                <p className={styles.noteText}>{note.text}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Photo Notes</p>
        <div className={styles.photoUploadArea}>
          <span className={styles.photoUploadText}>
            Photo notes tied to crew entries — coming soon
          </span>
        </div>
      </div>

    </div>
  )
}
