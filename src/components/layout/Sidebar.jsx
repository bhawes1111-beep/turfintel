import { NavLink } from 'react-router-dom'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'D' },
  { to: '/crew', label: 'Crew', icon: 'C' },
  { to: '/chemical', label: 'Chemical', icon: 'Ch' },
  { to: '/budget', label: 'Budget', icon: 'B' },
  { to: '/inventory', label: 'Inventory', icon: 'In' },
  { to: '/equipment', label: 'Equipment', icon: 'Eq' },
]

export default function Sidebar({ isOpen, onClose }) {
  return (
    <nav className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.brand}>
        <span className={styles.brandName}>TurfIntel</span>
      </div>

      <ul className={styles.nav}>
        {NAV_ITEMS.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <ul className={styles.navBottom}>
        <li>
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.icon}>S</span>
            <span className={styles.label}>Settings</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
