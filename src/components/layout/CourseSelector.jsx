import { useCourse } from '../../context/CourseContext'
import styles from './CourseSelector.module.css'

export default function CourseSelector() {
  const { activeCourse, setActiveCourse, courses } = useCourse()

  function handleChange(e) {
    const course = courses.find(c => c.id === parseInt(e.target.value, 10))
    if (course) setActiveCourse(course)
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>⛳</span>
      <select
        className={styles.select}
        value={activeCourse.id}
        onChange={handleChange}
        aria-label="Select active course"
      >
        {courses.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span className={styles.chevron} aria-hidden="true">▾</span>
    </div>
  )
}
