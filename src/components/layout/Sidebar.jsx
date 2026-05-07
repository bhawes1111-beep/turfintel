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
        collapsed   ? styles.collapsed   : '',
        isOpen      ? styles.mobileOpen  : '',
      ].join(' ')}
    >
      {/* Brand header */}
      <div className={styles.brand}>
        <span className={styles.brandName}>TurfIntel</span>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
        </button>
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
                <Icon name={item.icon} size={18} />
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
              <Icon name="settings" size={18} />
            </span>
            <span className={styles.label}>Settings</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
