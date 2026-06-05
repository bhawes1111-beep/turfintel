/**
 * Settings — TurfIntel control center.
 *
 * Section-at-a-time layout. Switcher style is controlled by the
 * App Preferences > Page Navigation Style preference:
 *   - 'dropdown' (default): wraps in PageShell (existing dropdown UX),
 *     search bar is the first child of PageShell content (above section)
 *   - 'buttons': renders a custom shell so the search bar can sit
 *     BETWEEN the header and the button-row nav (per spec)
 *
 * PageShell still drives button-mode for every other tabbed page in the
 * app — Settings only renders its own button-mode shell to control
 * search placement.
 *
 * Settings search:
 *   - Local query state filters SECTIONS by section title + keywords
 *     (which mirror each section's labels, descriptions, integration
 *     names, status copy).
 *   - In both nav modes the filtered list drives the switcher.
 *   - When the active section drops out of the filtered list, it
 *     auto-switches to the first match.
 *   - When zero sections match, an EmptyState replaces the section
 *     content area; the nav switcher hides.
 *
 * Phase 9B.5 — Crosswinds-only simplified switcher (no search active):
 *   - 6 daily-use canonical sections render as 6 display labels in
 *     the nav strip (with shortened Crosswinds labels via the
 *     LABEL_REMAP), plus a synthetic 'More' tab that hosts the 5
 *     advanced/admin sections in a secondary pill row.
 *   - When the supervisor types a search query, we fall back to the
 *     legacy flat filtered list so every section is reachable —
 *     including the ones hidden under More. That's the escape hatch.
 *   - Internal state continues to carry canonical SECTIONS labels;
 *     only the displayed nav labels are remapped.
 *
 * Sections live in ./sections/ — one small file per section.
 */

import { useEffect, useMemo, useState } from 'react'
import { useCourse } from '../../context/CourseContext'
import { useAppPrefs } from '../../utils/prefs/useAppPrefs'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import { EmptyState } from '../../components/shared/EmptyState'
import PageShell from '../../components/layout/PageShell'

import ProfileSection             from './sections/ProfileSection'
import CourseSection              from './sections/CourseSection'
import CourseScopeSection         from './sections/CourseScopeSection'
import CourseConfigurationSection from './sections/CourseConfigurationSection'
import AppPreferencesSection      from './sections/AppPreferencesSection'
import WeatherDataSection     from './sections/WeatherDataSection'
import TeamSection            from './sections/TeamSection'
import DataManagementSection  from './sections/DataManagementSection'
import IntegrationsSection    from './sections/IntegrationsSection'
import FeedbackReviewSection  from './sections/FeedbackReviewSection'
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
    label: 'Course Information',
    component: CourseSection,
    keywords: [
      'course', 'course information', 'facility', 'crosswinds', 'crossroads',
      'name', 'short name', 'location', 'status', 'edit course',
      'time zone', 'timezone', 'routing', 'press & roll',
      'weather station', 'coordinates', 'anchor',
      'bounds', 'bounding box', 'map zoom', 'default zoom', 'geometry',
    ],
  },
  {
    key: 'course-scope',
    label: 'Course Scope',
    component: CourseScopeSection,
    keywords: [
      'course scope', 'scope', 'active course', 'operational course',
      'multi-course', 'multi course', 'tenant', 'tenancy',
      'crossroads', 'switch course', 'data scope',
    ],
  },
  {
    key: 'course-configuration',
    label: 'Course Configuration',
    component: CourseConfigurationSection,
    keywords: [
      'course configuration', 'configuration', 'course setup', 'setup',
      'acreage', 'acres', 'total acreage',
      'greens', 'tees', 'fairways', 'rough', 'sprayable', 'practice area',
      'custom areas', 'nursery', 'bunker', 'landscape', 'native',
      'short course', 'event lawn', 'overflow', 'expansion',
      'spray units', 'default spray units', 'units',
      'oz per acre', 'oz per 1000', 'gallons per acre', 'gallons per 1000',
      'operational defaults',
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
    key: 'feedback',
    label: 'Pilot Feedback',
    component: FeedbackReviewSection,
    keywords: [
      'feedback', 'pilot feedback', 'pilot', 'friction',
      'bug', 'workflow', 'confusing', 'mobile', 'display board',
      'review', 'notes', 'log feedback', 'crosswinds',
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

/* ── Phase 9B.5 — Crosswinds-only simplification ──────────────────────── */

const CROSSWINDS_COURSE_ID = 'crossroads-gc'

// Display order for the simplified Crosswinds nav strip. Includes the
// synthetic 'More' tab as the final entry; clicking it surfaces the
// inner pill row defined by CROSSWINDS_MORE.
const CROSSWINDS_TABS_VISIBLE = [
  'Course', 'Course Configuration', 'Team', 'Weather', 'Data', 'System', 'More',
]

// Canonical SECTIONS labels that live under the More group.
const CROSSWINDS_MORE = [
  'Profile', 'App Preferences', 'Integrations', 'Course Scope', 'Feedback Review',
]

// Canonical → display rewrite (Crosswinds only). The internal
// activeLabel state always carries the canonical label so that
// SECTIONS.find(s => s.label === activeLabel) keeps working.
const CROSSWINDS_LABEL_REMAP = {
  'Course Information': 'Course',
  'Team & Permissions': 'Team',
  'Weather & Data':     'Weather',
  'Data Management':    'Data',
  'System Info':        'System',
  'Pilot Feedback':     'Feedback Review',
}

function canonicalToDisplay(canonical) {
  return CROSSWINDS_LABEL_REMAP[canonical] ?? canonical
}

function displayToCanonical(display) {
  for (const [canon, disp] of Object.entries(CROSSWINDS_LABEL_REMAP)) {
    if (disp === display) return canon
  }
  return display
}

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
  const { activeCourse } = useCourse()
  const { prefs }        = useAppPrefs()
  const courseId         = useSelectedCourseId()
  const isCrosswinds     = courseId === CROSSWINDS_COURSE_ID

  const [query, setQuery]             = useState('')
  // Phase 9B.5 — Crosswinds lands on Course Information (canonical;
  // displays as "Course"); other courses keep the legacy Profile
  // default. The initializer only runs on first render so a mid-
  // session course switch will not bounce the supervisor away from
  // whatever section they were on.
  const [activeLabel, setActiveLabel] = useState(() =>
    isCrosswinds ? 'Course Information' : SECTIONS[0].label
  )
  const [moreLabel,   setMoreLabel]   = useState('Profile')

  const normalizedQuery = query.trim().toLowerCase()
  const searching       = normalizedQuery.length > 0

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

  const noResults = visibleSections.length === 0

  // Phase 9B.5 — when Crosswinds AND no search query, the nav strip
  // shows the 6 simplified daily labels + a 'More' tab; the activeLabel
  // (canonical) is translated to the display tab via canonicalToDisplay.
  // When the user starts typing, fall back to the legacy flat filtered
  // list so every match (including More-group sections) is reachable.
  const usingCrosswindsSimplified = isCrosswinds && !searching
  const visibleLabels = usingCrosswindsSimplified
    ? CROSSWINDS_TABS_VISIBLE
    : visibleSections.map(s => s.label)

  // Resolve the display label PageShell / button-row should highlight.
  // If the canonical active label is under More, the strip highlights
  // 'More' (not the hidden child).
  const activeDisplayLabel = usingCrosswindsSimplified
    ? (CROSSWINDS_MORE.includes(activeLabel) ? 'More' : canonicalToDisplay(activeLabel))
    : activeLabel

  // Click handler used by both render modes — translate clicked display
  // label back to canonical, OR handle the 'More' synthetic tab by
  // entering the inner row (seed with the current moreLabel).
  function handleSelectDisplay(displayLabel) {
    if (!usingCrosswindsSimplified) {
      setActiveLabel(displayLabel)
      return
    }
    if (displayLabel === 'More') {
      // Activating More lands on the current moreLabel's canonical section.
      setActiveLabel(moreLabel)
      return
    }
    setActiveLabel(displayToCanonical(displayLabel))
  }

  // Phase 9B.5 — More inner pill row. Rendered only on Crosswinds, only
  // when not searching, and only when the active display tab is 'More'
  // (i.e. the canonical activeLabel is one of CROSSWINDS_MORE). The
  // row sets activeLabel directly to the canonical child label, so the
  // rest of the page renders that section's canonical component without
  // any extra branch.
  const showMoreInnerRow = usingCrosswindsSimplified && activeDisplayLabel === 'More'

  const moreInnerRow = showMoreInnerRow ? (
    <div className={styles.moreNav} role="tablist" aria-label="Additional settings">
      {CROSSWINDS_MORE.map(label => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={activeLabel === label}
          data-active={activeLabel === label ? 'true' : undefined}
          className={styles.moreNavBtn}
          onClick={() => { setMoreLabel(label); setActiveLabel(label) }}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null

  // ── Button navigation mode ──────────────────────────────────────────────
  // Custom shell so the search bar sits between the header and the
  // button-row nav (per spec). PageShell's button-mode is still used by
  // every other tabbed page that doesn't have search.
  if (prefs.pageNavStyle === 'buttons') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
          {activeCourse && (
            <span className={styles.courseBadge}>{activeCourse.name}</span>
          )}
        </div>

        <div className={styles.searchBar}>
          <SearchBar
            query={query}
            onChange={setQuery}
            matchCount={visibleSections.length}
            totalCount={SECTIONS.length}
          />
        </div>

        {!noResults && (
          <div className={styles.buttonNav} role="tablist" aria-label="Settings sections">
            {visibleLabels.map(displayLabel => (
              <button
                key={displayLabel}
                type="button"
                role="tab"
                aria-selected={activeDisplayLabel === displayLabel}
                className={`${styles.navBtn} ${activeDisplayLabel === displayLabel ? styles.navBtnActive : ''}`}
                onClick={() => handleSelectDisplay(displayLabel)}
              >
                {displayLabel}
              </button>
            ))}
          </div>
        )}

        <div className={styles.content}>
          {noResults ? (
            <EmptyState
              title="No settings found."
              description="Try a different search term."
            />
          ) : (
            <div className={showMoreInnerRow ? styles.moreInner : undefined}>
              {moreInnerRow}
              <Section />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Dropdown navigation mode (default) ──────────────────────────────────
  // Search lives inside the PageShell content area, above the section.
  return (
    <PageShell
      title="Settings"
      tabs={visibleLabels}
      activeTab={visibleLabels.includes(activeDisplayLabel) ? activeDisplayLabel : ''}
      onTabChange={handleSelectDisplay}
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
        <div className={showMoreInnerRow ? styles.moreInner : undefined}>
          {moreInnerRow}
          <Section />
        </div>
      )}
    </PageShell>
  )
}
