import { createContext, useContext, useState } from 'react'

/**
 * Per-course geo descriptor — consumed by the CourseMap renderer and any
 * future GIS subsystem. `geo: null` means the course has no mapping data
 * yet (all map layers will render empty, aerial fallback only).
 *
 * @typedef {Object} CourseGeo
 * @property {{lat:number, lng:number}} center
 * @property {{north:number, south:number, east:number, west:number}} bounds
 * @property {number}      defaultZoom    - reserved for future tile-based renderers
 * @property {string|null} aerialUrl      - optional static aerial PNG (public/...)
 */

// Placeholder course list. Replace with API call when backend is ready.
const COURSES = [
  {
    id: 1,
    name: 'Crosswinds Golf Club',
    geo: {
      // Anchor: 32°07'47.48"N  81°14'06.83"W
      center: { lat: 32.129856, lng: -81.235231 },
      bounds: {
        // ~1.5 km bounding box centered on the anchor — typical 18-hole footprint
        north:  32.13660,
        south:  32.12311,
        east:  -81.22729,
        west:  -81.24317,
      },
      defaultZoom: 16,
      aerialUrl:  '/courses/crosswinds-aerial.png',
    },
  },
  { id: 2, name: 'Demo Course',  geo: null },
  { id: 3, name: 'North Course', geo: null },
  { id: 4, name: 'South Course', geo: null },
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
