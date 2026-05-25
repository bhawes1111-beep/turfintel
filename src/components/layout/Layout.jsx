import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CourseSelector from './CourseSelector'
import CommandOverlay from '../command/CommandOverlay'
import MoistureFab from '../moisture/MoistureFab'
import TurfHealthFab from '../turfHealth/TurfHealthFab'
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
      {/* Phase 7B.1 — Both FABs honor route-aware visibility via
          useFabVisibility, so MoistureFab shows on /irrigation/* +
          /dashboard, TurfHealthFab shows on /turf-health/* + /dashboard.
          When both are visible (only on /dashboard) the Turf Health FAB
          stacks above the Moisture FAB. */}
      <MoistureFab />
      <TurfHealthFab />
    </div>
  )
}
