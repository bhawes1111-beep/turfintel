/**
 * Settings — TurfIntel control center.
 *
 * Section-at-a-time layout. Switcher style is controlled by the
 * App Preferences > Page Navigation Style preference (Phase 1):
 *   - 'dropdown'  → wraps in PageShell (existing dropdown UX)
 *   - 'buttons'   → custom shell with a pill-row across the top
 *
 * Sections live in ./sections/ — one small file per section to keep
 * this file focused on layout + nav switching only.
 */

import { useState } from 'react'
import { useCourse } from '../../context/CourseContext'
import { useAppPrefs } from '../../utils/prefs/useAppPrefs'
import PageShell from '../../components/layout/PageShell'

import ProfileSection         from './sections/ProfileSection'
import CourseSection          from './sections/CourseSection'
import AppPreferencesSection  from './sections/AppPreferencesSection'
import WeatherDataSection     from './sections/WeatherDataSection'
import TeamSection            from './sections/TeamSection'
import DataManagementSection  from './sections/DataManagementSection'
import IntegrationsSection    from './sections/IntegrationsSection'
import SystemInfoSection      from './sections/SystemInfoSection'

import styles from './Settings.module.css'

const SECTIONS = [
  { key: 'profile',      label: 'Profile',              component: ProfileSection         },
  { key: 'course',       label: 'Course',               component: CourseSection          },
  { key: 'app',          label: 'App Preferences',      component: AppPreferencesSection  },
  { key: 'weather',      label: 'Weather & Data',       component: WeatherDataSection     },
  { key: 'team',         label: 'Team & Permissions',   component: TeamSection            },
  { key: 'data',         label: 'Data Management',      component: DataManagementSection  },
  { key: 'integrations', label: 'Integrations',         component: IntegrationsSection    },
  { key: 'system',       label: 'System Info',          component: SystemInfoSection      },
]

const SECTION_LABELS = SECTIONS.map(s => s.label)

export default function Settings() {
  const { activeCourse } = useCourse()
  const { prefs } = useAppPrefs()
  const [activeLabel, setActiveLabel] = useState(SECTIONS[0].label)

  const active   = SECTIONS.find(s => s.label === activeLabel) ?? SECTIONS[0]
  const Section  = active.component

  // ── Button navigation mode ─────────────────────────────────────────────
  if (prefs.pageNavStyle === 'buttons') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
          {activeCourse && (
            <span className={styles.courseBadge}>{activeCourse.name}</span>
          )}
        </div>

        <div className={styles.buttonNav} role="tablist" aria-label="Settings sections">
          {SECTIONS.map(sec => (
            <button
              key={sec.key}
              type="button"
              role="tab"
              aria-selected={active.key === sec.key}
              className={`${styles.navBtn} ${active.key === sec.key ? styles.navBtnActive : ''}`}
              onClick={() => setActiveLabel(sec.label)}
            >
              {sec.label}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          <Section />
        </div>
      </div>
    )
  }

  // ── Dropdown navigation mode (default — uses existing PageShell) ───────
  return (
    <PageShell
      title="Settings"
      tabs={SECTION_LABELS}
      activeTab={activeLabel}
      onTabChange={setActiveLabel}
    >
      <Section />
    </PageShell>
  )
}
