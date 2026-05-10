/**
 * Settings — TurfIntel control center.
 *
 * Section-at-a-time layout. Always wraps PageShell, which renders the
 * appropriate switcher (dropdown OR button row) based on the
 * App Preferences > Page Navigation Style preference. The same preference
 * now affects every tabbed page in the app (Phase 2).
 *
 * Settings search:
 *   - Local query state filters SECTIONS by section title + keywords
 *     (which mirror each section's labels, descriptions, integration
 *     names, status copy).
 *   - The filtered list passes through PageShell.tabs, so the switcher
 *     in either mode shows only matching sections.
 *   - When the active section drops out of the filtered list, it
 *     auto-switches to the first match.
 *   - When zero sections match, an EmptyState replaces the section
 *     content area.
 *
 * Sections live in ./sections/ — one small file per section.
 */

import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../components/shared/EmptyState'
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

/**
 * Section metadata.
 *   keywords: array of lowercase tokens that mirror what each section
 *             actually renders (labels, descriptions, integration names,
 *             status copy). Hand-curated so search doesn't depend on
 *             scraping DOM at runtime. Add to this list when you add new
 *             rows inside a section.
 */
const SECTIONS = [
  {
    key: 'profile',
    label: 'Profile',
    component: ProfileSection,
    keywords: [
      'profile', 'account', 'user',
      'name', 'role', 'title',
      'email', 'phone',
      'course', 'facility',
    ],
  },
  {
    key: 'course',
    label: 'Course',
    component: CourseSection,
    keywords: [
      'course', 'facility', 'crosswinds',
      'name', 'location', 'time zone', 'timezone',
      'routing', 'press & roll', 'units',
      'weather station', 'coordinates', 'anchor',
      'bounds', 'bounding box',
      'aerial', 'image', 'map zoom', 'default zoom',
    ],
  },
  {
    key: 'app',
    label: 'App Preferences',
    component: AppPreferencesSection,
    keywords: [
      'app preferences', 'preferences',
      'theme', 'dark', 'light', 'mode',
      'sidebar', 'default behavior', 'collapsed', 'expanded',
      'dashboard', 'density',
      'notifications',
      'page navigation', 'page nav', 'navigation style',
      'dropdown', 'menu', 'buttons', 'button navigation',
    ],
  },
  {
    key: 'weather',
    label: 'Weather & Data',
    component: WeatherDataSection,
    keywords: [
      'weather', 'data sources', 'data',
      'station', 'noaa', 'weather.gov', 'ksav', 'savannah',
      'rainfall', 'rain', 'precipitation',
      'et', 'evapotranspiration',
      'soil temperature', 'soil temp',
      'integration', 'live', 'cached',
      'last sync', 'sync',
    ],
  },
  {
    key: 'team',
    label: 'Team & Permissions',
    component: TeamSection,
    keywords: [
      'team', 'permissions',
      'users', 'invite', 'roles', 'access', 'access levels',
      'permission groups', 'superintendent', 'crew lead', 'crew', 'read-only',
    ],
  },
  {
    key: 'data',
    label: 'Data Management',
    component: DataManagementSection,
    keywords: [
      'data management', 'data',
      'import', 'export', 'backup',
      'clear', 'reset', 'wipe',
      'sidebar prefs', 'sidebar preferences',
      'weather cache',
      'kml', 'course imports', 'geo imports',
      'operations state', 'local state',
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    component: IntegrationsSection,
    keywords: [
      'integrations',
      'cloudflare', 'cloudflare workers', 'workers',
      'google earth', 'kml',
      'noaa', 'weather.gov',
      'toro', 'lynx', 'irx', 'irrigation',
      'emlid', 'reach', 'rs2', 'gps',
      'mapping tools', 'qgis', 'geojson',
      'connected', 'stub', 'not configured', 'status',
    ],
  },
  {
    key: 'system',
    label: 'System Info',
    component: SystemInfoSection,
    keywords: [
      'system info', 'system',
      'app', 'version',
      'environment', 'production', 'cloudflare', 'workers',
      'live url', 'url',
      'last sync',
      'storage', 'localstorage', 'local storage',
      'browser',
    ],
  },
]

/* ── Filtering ────────────────────────────────────────────────────────── */

function matchesQuery(section, q) {
  if (!q) return true
  const haystack = [
    section.label.toLowerCase(),
    ...(section.keywords ?? []),
  ].join(' ')
  return haystack.includes(q)
}

/* ── Search bar ───────────────────────────────────────────────────────── */

function SearchBar({ query, onChange, matchCount, totalCount }) {
  return (
    <div className={styles.searchBlock}>
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">⌕</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search settings…"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search settings"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className={styles.searchClearBtn}
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
      {query && (
        <span className={styles.searchCount}>
          {matchCount} of {totalCount} sections
        </span>
      )}
    </div>
  )
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function Settings() {
  const [query, setQuery]             = useState('')
  const [activeLabel, setActiveLabel] = useState(SECTIONS[0].label)

  const normalizedQuery = query.trim().toLowerCase()

  const visibleSections = useMemo(
    () => SECTIONS.filter(s => matchesQuery(s, normalizedQuery)),
    [normalizedQuery]
  )

  // If the current active section drops out of the filtered list,
  // jump to the first visible match.
  useEffect(() => {
    if (visibleSections.length === 0) return
    if (!visibleSections.some(s => s.label === activeLabel)) {
      setActiveLabel(visibleSections[0].label)
    }
  }, [visibleSections, activeLabel])

  const active  = SECTIONS.find(s => s.label === activeLabel) ?? SECTIONS[0]
  const Section = active.component

  const noResults     = visibleSections.length === 0
  const visibleLabels = visibleSections.map(s => s.label)

  // PageShell now renders both nav modes (dropdown / button-row) based on
  // the App Preferences > Page Navigation Style preference. Settings just
  // passes the filtered tabs through and renders search + section content.
  return (
    <PageShell
      title="Settings"
      tabs={visibleLabels}
      activeTab={visibleLabels.includes(activeLabel) ? activeLabel : ''}
      onTabChange={setActiveLabel}
    >
      <SearchBar
        query={query}
        onChange={setQuery}
        matchCount={visibleSections.length}
        totalCount={SECTIONS.length}
      />
      {noResults ? (
        <EmptyState
          title="No settings found."
          description="Try a different search term."
        />
      ) : (
        <Section />
      )}
    </PageShell>
  )
}
