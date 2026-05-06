import styles from '../Crew.module.css'

// Placeholder notes — replace with API feed when backend is ready
const PLACEHOLDER_NOTES = [
  {
    id: 1,
    author: 'Derek L.',
    time: 'Today, 6:42 AM',
    text: 'Greens are running fast this morning — remind crew to double-cut on 7 and 14.',
  },
  {
    id: 2,
    author: 'Carlos M.',
    time: 'Yesterday, 3:15 PM',
    text: 'Fairway mower blade on unit #4 needs inspection before tomorrow\'s shift.',
  },
]

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
          {PLACEHOLDER_NOTES.map(note => (
            <div key={note.id} className={styles.noteCard}>
              <div className={styles.noteMeta}>
                <span>{note.author}</span>
                <span> · </span>
                <span>{note.time}</span>
              </div>
              <p className={styles.noteText}>{note.text}</p>
            </div>
          ))}
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
