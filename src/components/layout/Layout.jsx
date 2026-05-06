import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
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
        <button
          className={styles.menuBtn}
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle menu"
        >
          &#9776;
        </button>
        <Outlet />
      </div>
    </div>
  )
}
