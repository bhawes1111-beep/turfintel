import { createContext, useContext, useState } from 'react'

// Placeholder course list. Replace with API call when backend is ready.
const COURSES = [
  { id: 1, name: 'Crossroads'   },
  { id: 2, name: 'Demo Course'  },
  { id: 3, name: 'North Course' },
  { id: 4, name: 'South Course' },
]

const CourseContext = createContext(null)

export function CourseProvider({ children }) {
  const [activeCourse, setActiveCourse] = useState(COURSES[0])

  return (
    <CourseContext.Provider value={{ activeCourse, setActiveCourse, courses: COURSES }}>
      {children}
    </CourseContext.Provider>
  )
}

export function useCourse() {
  const ctx = useContext(CourseContext)
  if (!ctx) throw new Error('useCourse must be used within a CourseProvider')
  return ctx
}
