/**
 * TurfIntel sidebar — modern expandable navigation.
 *
 * Architecture:
 *   - NAV_TREE drives the entire sidebar. Each node is either:
 *       { id, label, icon, to }                  ← link (leaf)
 *       { id, label, icon, children: [...] }    ← group (recursive)
 *   - Recursive renderer (NavGroup / NavLeaf) supports any depth.
 *   - State (sidebar collapsed + per-group expanded) persists to localStorage
 *     via the existing persistence layer.
 *   - Active route propagation: a group is highlighted when ANY descendant
 *     link's `to` prefix matches the current pathname.
 *   - Custom CSS tooltips appear on hover when sidebar is collapsed.
 *   - Mobile drawer + dark backdrop overlay.
 *
 * No new dependencies. CSS Modules + inline SVG only.
 */

import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from '../shared/icons'
import { loadSync, save } from '../../utils/persistence/persistence'
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
  operations: (
    <SVG>
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <circle cx="7" cy="14" r="0.7" fill="currentColor"/>
      <line x1="11" y1="14" x2="17" y2="14"/>
      <circle cx="7" cy="17" r="0.7" fill="currentColor"/>
      <line x1="11" y1="17" x2="17" y2="17"/>
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
  agronomy: (
    <SVG>
      <path d="M12 22V13"/>
      <path d="M12 13c-3.5 0-6-2.5-6-6 3.5 0 6 2.5 6 6Z"/>
      <path d="M12 13c3.5 0 6-2.5 6-6-3.5 0-6 2.5-6 6Z"/>
      <path d="M12 13c0-3 2-5 5-5"/>
      <path d="M12 13c0-3-2-5-5-5"/>
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
  weather: (
    <SVG>
      <path d="M17.5 17a4.5 4.5 0 1 0 0-9h-1A7 7 0 1 0 4 14"/>
      <line x1="8"  y1="20" x2="8"  y2="22"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="16" y1="20" x2="16" y2="22"/>
    </SVG>
  ),
  map: (
    <SVG>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/>
      <line x1="15" y1="6" x2="15" y2="21"/>
    </SVG>
  ),
  activity: (
    <SVG>
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 15"/>
    </SVG>
  ),
  reports: (
    <SVG>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </SVG>
  ),
  administration: (
    <SVG>
      <circle cx="9" cy="8" r="3.5"/>
      <path d="M3 21v-0.5a6 6 0 0 1 12 0V21"/>
      <circle cx="18" cy="6" r="2"/>
      <path d="M14.5 21a4 4 0 0 1 7 0"/>
    </SVG>
  ),
  settings: (
    <SVG>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </SVG>
  ),
}

/* ── Navigation tree ──────────────────────────────────────────────────────
   FLAT workspace-first structure (Phase 1 of the workspace migration).
   Each entry opens its own operational workspace. Sub-navigation lives
   inside each workspace via PageShell's button-mode pill/segmented control.
   No more dropdown groups in the sidebar.

   Routes intentionally point at existing modules during Phase 1:
     - Operations → /crew     (OperationsBoard component)
     - Agronomy   → /disease  (will become an Agronomy workspace shell)
     - Weather    → /weather  (lightweight placeholder until Phase 5)
     - Reports    → /reports  (lightweight placeholder until Phase 6)

   Other routes (/activity, /plant-nutrition, /cultural-practices,
   /chemical, /course-map, /budget) stay reachable via direct URL —
   they just don't appear in the sidebar anymore.                          */

const NAV_TREE = [
  { id: 'dashboard',  label: 'Dashboard',           icon: 'dashboard',  to: '/dashboard'  },
  { id: 'operations', label: 'Operations',          icon: 'operations', to: '/crew'       },
  { id: 'employees',  label: 'Employee Management', icon: 'crew',       to: '/employees'  },
  { id: 'agronomy',   label: 'Agronomy',            icon: 'agronomy',   to: '/disease'    },
  { id: 'sprays',     label: 'Sprays',     icon: 'spray',      to: '/spray'      },
  { id: 'irrigation', label: 'Irrigation', icon: 'irrigation', to: '/irrigation' },
  { id: 'equipment',  label: 'Equipment',  icon: 'equipment',  to: '/equipment'  },
  { id: 'inventory',  label: 'Inventory',  icon: 'inventory',  to: '/inventory'  },
  { id: 'weather',    label: 'Weather',    icon: 'weather',    to: '/weather'    },
  { id: 'reports',    label: 'Reports',    icon: 'reports',    to: '/reports'    },
  { id: 'settings',   label: 'Settings',   icon: 'settings',   to: '/settings'   },
]

/* ── Persistence ──────────────────────────────────────────────────────── */

const PREFS_KEY = 'turfintel-sidebar-prefs'

// First-load default for grouped sections: closed.
// Newly-added groups also fall back to closed when a returning user has
// saved state but no entry for the new group.
function defaultExpanded() {
  const acc = {}
  for (const node of NAV_TREE) {
    if (node.children) acc[node.id] = false
  }
  return acc
}

function loadInitialPrefs() {
  const saved = loadSync(PREFS_KEY)
  // First-time users get a collapsed icon-only sidebar with all groups closed.
  // Returning users keep their saved state — saved expanded entries override
  // defaults; brand-new groups they haven't interacted with default to closed.
  if (!saved) return { collapsed: true, expanded: defaultExpanded() }
  return {
    collapsed: !!saved.collapsed,
    expanded: { ...defaultExpanded(), ...(saved.expanded || {}) },
  }
}

/* ── Active route propagation ─────────────────────────────────────────── */

function nodeContainsActive(node, pathname) {
  if (node.to && (pathname === node.to || pathname.startsWith(node.to + '/'))) return true
  if (node.children) return node.children.some(c => nodeContainsActive(c, pathname))
  return false
}

/* ── Recursive renderers ──────────────────────────────────────────────── */

function NavLeaf({ node, depth, collapsed, onClose }) {
  return (
    <li className={styles.navItem} style={{ '--nav-depth': depth }}>
      <NavLink
        to={node.to}
        onClick={onClose}
        end={node.to === '/dashboard'}
        className={({ isActive }) =>
          [
            styles.link,
            isActive ? styles.active : '',
            depth > 0 ? styles.linkChild : '',
          ].filter(Boolean).join(' ')
        }
      >
        <span className={styles.iconWrap}>
          <span className={styles.navIcon}>
            {ICONS[node.icon] || ICONS.dashboard}
          </span>
        </span>
        <span className={styles.label}>{node.label}</span>
        {collapsed && depth === 0 && <span className={styles.tooltip}>{node.label}</span>}
      </NavLink>
    </li>
  )
}

function NavGroup({
  node,
  depth,
  collapsed,
  expanded,
  onGroupClick,
  pathname,
  onClose,
}) {
  const isOpen     = !!expanded[node.id]
  const hasActive  = nodeContainsActive(node, pathname)

  return (
    <li className={styles.navItem} style={{ '--nav-depth': depth }}>
      <button
        type="button"
        className={[
          styles.groupHeader,
          hasActive ? styles.groupActive : '',
          depth > 0 ? styles.linkChild : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onGroupClick(node.id)}
        aria-expanded={isOpen}
      >
        <span className={styles.iconWrap}>
          <span className={styles.navIcon}>
            {ICONS[node.icon] || ICONS.dashboard}
          </span>
        </span>
        <span className={styles.label}>{node.label}</span>
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden="true">
          ▶
        </span>
        {collapsed && depth === 0 && <span className={styles.tooltip}>{node.label}</span>}
      </button>

      <ul className={`${styles.subList} ${isOpen ? styles.subListOpen : ''}`}>
        {node.children.map(child =>
          child.children
            ? (
              <NavGroup
                key={child.id}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                expanded={expanded}
                onGroupClick={onGroupClick}
                pathname={pathname}
                onClose={onClose}
              />
            )
            : (
              <NavLeaf
                key={child.id}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onClose={onClose}
              />
            )
        )}
      </ul>
    </li>
  )
}

/* ── Sidebar shell ────────────────────────────────────────────────────── */

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation()
  const [prefs, setPrefs] = useState(loadInitialPrefs)

  useEffect(() => {
    save(PREFS_KEY, prefs)
  }, [prefs])

  function toggleCollapsed() {
    setPrefs(p => ({ ...p, collapsed: !p.collapsed }))
  }

  // Click on group header:
  //   - If collapsed: expand the sidebar AND open this group
  //   - Otherwise: toggle this group
  function handleGroupClick(id) {
    setPrefs(p => {
      if (p.collapsed) {
        return {
          collapsed: false,
          expanded:  { ...p.expanded, [id]: true },
        }
      }
      return {
        ...p,
        expanded: { ...p.expanded, [id]: !p.expanded[id] },
      }
    })
  }

  const sidebarClasses = [
    styles.sidebar,
    prefs.collapsed ? styles.collapsed  : '',
    isOpen          ? styles.mobileOpen : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      {isOpen && (
        <div
          className={styles.mobileBackdrop}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <nav className={sidebarClasses} aria-label="Primary navigation">

        {/* Brand / logo header */}
        <div className={styles.brand}>
          <button
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            aria-label={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={prefs.collapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
          </button>

          <img
            src="/logo-full.png"
            alt="TurfIntel Pro"
            className={styles.imgLogo}
            draggable="false"
          />

          <img
            src="/logo-mark.png"
            alt="TP"
            className={styles.imgMark}
            draggable="false"
          />
        </div>

        {/* Recursive navigation */}
        <ul className={styles.nav}>
          {NAV_TREE.map(node =>
            node.children
              ? (
                <NavGroup
                  key={node.id}
                  node={node}
                  depth={0}
                  collapsed={prefs.collapsed}
                  expanded={prefs.expanded}
                  onGroupClick={handleGroupClick}
                  pathname={location.pathname}
                  onClose={onClose}
                />
              )
              : (
                <NavLeaf
                  key={node.id}
                  node={node}
                  depth={0}
                  collapsed={prefs.collapsed}
                  onClose={onClose}
                />
              )
          )}
        </ul>
      </nav>
    </>
  )
}
