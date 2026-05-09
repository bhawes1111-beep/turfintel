import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CourseSelector from './CourseSelector'
import CommandOverlay from '../command/CommandOverlay'
import { Icon } from '../shared/icons'
import styles from './Layout.module.css'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <div
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={styles.main}>

        {/* Top bar: hamburger (mobile only) + course selector */}
        <div className={styles.topBar}>
          <button
            className={styles.menuBtn}
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Open navigation menu"
          >
            <Icon name={sidebarOpen ? 'close' : 'menu'} size={18} />
          </button>
          <CourseSelector />
        </div>

        {/* Page content */}
        <div className={styles.outlet}>
          <Outlet />
        </div>

      </div>

      <CommandOverlay />
    </div>
  )
}
