import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon } from '../shared/icons'
import styles from './Sidebar.module.css'

/* ── Inline SVG icons (24×24 viewBox, stroke-based) ──────────────────────── */

const SVG = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  />
)

const ICONS = {
  dashboard: (
    <SVG>
      <rect x="3" y="3" width="8" height="8" rx="1.5"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </SVG>
  ),
  crew: (
    <SVG>
      <circle cx="9" cy="7" r="3"/>
      <path d="M3 21v-1a6 6 0 0 1 12 0v1"/>
      <circle cx="18.5" cy="6.5" r="2.5"/>
      <path d="M16 20.5a4.5 4.5 0 0 1 5.5 0"/>
    </SVG>
  ),
  chemical: (
    <SVG>
      <path d="M9 3h6"/>
      <path d="M10 3v5.5L6 16.5A3 3 0 0 0 9 21h6a3 3 0 0 0 3-4.5L14 8.5V3"/>
      <line x1="7" y1="15" x2="17" y2="15"/>
    </SVG>
  ),
  spray: (
    <SVG>
      <rect x="4" y="9" width="9" height="10" rx="1.5"/>
      <path d="M8 9V7h2V5h4"/>
      <line x1="15" y1="6.5" x2="18" y2="5"/>
      <line x1="15" y1="9.5" x2="18.5" y2="9.5"/>
      <line x1="15" y1="12.5" x2="18" y2="14"/>
    </SVG>
  ),
  disease: (
    <SVG>
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5.5"/>
      <line x1="12" y1="18.5" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5.5" y2="12"/>
      <line x1="18.5" y1="12" x2="22" y2="12"/>
      <line x1="5.6" y1="5.6" x2="7.8" y2="7.8"/>
      <line x1="16.2" y1="16.2" x2="18.4" y2="18.4"/>
      <line x1="18.4" y1="5.6" x2="16.2" y2="7.8"/>
      <line x1="7.8" y1="16.2" x2="5.6" y2="18.4"/>
    </SVG>
  ),
  'plant-nutrition': (
    <SVG>
      <line x1="12" y1="22" x2="12" y2="9"/>
      <path d="M12 9C8 5 3 7 3 13s5 9 9 8"/>
      <path d="M12 9c4-4 9-2 9 4s-5 9-9 8"/>
    </SVG>
  ),
  'cultural-practices': (
    <SVG>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="15" x2="16" y2="15"/>
    </SVG>
  ),
  budget: (
    <SVG>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </SVG>
  ),
  inventory: (
    <SVG>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="M3.27 6.96 12 12.01l8.73-5.05"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </SVG>
  ),
  equipment: (
    <SVG>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </SVG>
  ),
  irrigation: (
    <SVG>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    </SVG>
  ),
  activity: (
    <SVG>
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 15"/>
    </SVG>
  ),
  settings: (
    <SVG>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </SVG>
  ),
}

const NAV_ITEMS = [
  { to: '/dashboard',          label: 'Dashboard',          icon: 'dashboard'          },
  { to: '/crew',               label: 'Crew',               icon: 'crew'               },
  { to: '/chemical',           label: 'Chemical',           icon: 'chemical'           },
  { to: '/spray',              label: 'Spray',              icon: 'spray'              },
  { to: '/disease',            label: 'Disease',            icon: 'disease'            },
  { to: '/plant-nutrition',    label: 'Plant Nutrition',    icon: 'plant-nutrition'    },
  { to: '/cultural-practices', label: 'Cultural Practices', icon: 'cultural-practices' },
  { to: '/budget',             label: 'Budget',             icon: 'budget'             },
  { to: '/inventory',          label: 'Inventory',          icon: 'inventory'          },
  { to: '/equipment',          label: 'Equipment',          icon: 'equipment'          },
  { to: '/irrigation',         label: 'Irrigation',         icon: 'irrigation'         },
  { to: '/activity',           label: 'Activity',           icon: 'activity'           },
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

        {/* Collapse toggle */}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
        </button>

        {/* Full logo — expanded sidebar */}
        <img
          src="/logo-full.png"
          alt="TurfIntel Pro"
          className={styles.imgLogo}
          draggable="false"
        />

        {/* Compact mark — collapsed sidebar */}
        <img
          src="/logo-mark.png"
          alt="TP"
          className={styles.imgMark}
          draggable="false"
        />

      </div>

      {/* Main navigation — scrollable */}
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
                <span className={styles.navIcon}>
                  {ICONS[item.icon]}
                </span>
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
              <span className={styles.navIcon}>
                {ICONS['settings']}
              </span>
            </span>
            <span className={styles.label}>Settings</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
