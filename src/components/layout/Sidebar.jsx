import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon } from '../shared/icons'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',          label: 'Dashboard',          icon: 'dashboard'          },
  { to: '/crew',               label: 'Crew',               icon: 'crew'               },
  { to: '/chemical',           label: 'Chemical',           icon: 'chemical'           },
  { to: '/spray',              label: 'Spray',              icon: 'spray'              },
  { to: '/disease',            label: 'Disease',            icon: 'disease'            },
  { to: '/plant-nutrition',    label: 'Plant Nutrition',    icon: 'plantNutrition'     },
  { to: '/cultural-practices', label: 'Cultural Practices', icon: 'culturalPractices'  },
  { to: '/budget',             label: 'Budget',             icon: 'budget'             },
  { to: '/inventory',          label: 'Inventory',          icon: 'inventory'          },
  { to: '/equipment',          label: 'Equipment',          icon: 'equipment'          },
]

export default function Sidebar({ isOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <nav
      className={[
        styles.sidebar,
        collapsed  ? styles.collapsed  : '',
        isOpen     ? styles.mobileOpen : '',
      ].join(' ')}
    >
      {/* Brand / logo header */}
      <div className={styles.brand}>

        {/* Collapse toggle — top-right corner */}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
        </button>

        {/* Full logo — visible when expanded */}
        <div className={styles.logoFull}>
          <div className={styles.logoMark}>
            <span className={styles.logoT}>T</span><span className={styles.logoP}>P</span>
          </div>
          <div className={styles.logoWordmark}>
            <span className={styles.wTurf}>TURF</span><span className={styles.wIntel}>INTEL</span>
          </div>
          <div className={styles.logoPro}>— PRO —</div>
        </div>

        {/* Compact mark — visible when collapsed */}
        <div className={styles.logoCompact}>
          <span className={styles.logoT}>T</span><span className={styles.logoP}>P</span>
        </div>

      </div>

      {/* Main navigation */}
      <ul className={styles.nav}>
        {NAV_ITEMS.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onClose}
              title={item.label}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.iconWrap}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Settings pinned to bottom */}
      <ul className={styles.navBottom}>
        <li>
          <NavLink
            to="/settings"
            onClick={onClose}
            title="Settings"
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.iconWrap}>
              <Icon name="settings" size={20} />
            </span>
            <span className={styles.label}>Settings</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
