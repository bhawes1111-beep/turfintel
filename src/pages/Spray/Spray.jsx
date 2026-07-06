import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
// Phase SPR.2 — Course-specific tab forks (LEGACY_TABS / CROSSWINDS_TABS +
// header + New Spray / Reports buttons) removed. One tab strip for every
// course; the tab strip is the single navigation primitive.
import SprayCalendarWorkspace from './tabs/SprayCalendarWorkspace'
import SprayOverview          from './tabs/SprayOverview'
import SprayCalendar          from './tabs/SprayCalendar'
import BuildSpraySheet        from './tabs/BuildSpraySheet'
import SprayRecords           from './tabs/SprayRecords'
import MixCalculator          from './tabs/MixCalculator'
import SprayReports           from './tabs/SprayReports'
import ProgramIntelligence    from './tabs/ProgramIntelligence'
import SprayProgramPlanner    from './tabs/SprayProgramPlanner'
import SprayProgramCalendar   from './tabs/SprayProgramCalendar'
import styles from './Spray.module.css'

// Phase SPR.2 — Unified Spray tab strip. Every course sees the same
// labels in the same order. Planning owns SprayProgramPlanner
// (templates / master-detail). The planned-item calendar
// (SprayProgramCalendar) is exposed via the More menu as
// "Planning Calendar" so the collision with "Planned Sprays" is gone.
export const SPRAY_TABS = [
  'Today',
  'New Application',
  'Records',
  'Planning',
  'Calendar',
  'Calculator',
  'Reports',
  'More',
]
export const SPRAY_MORE = [
  'Overview',
  'Planning Calendar',
  'Season Insights',
]

// Phase SPR.2 — Compatibility mapping for stale activeTab keys from the
// pre-SPR.2 nav. If a user's session/router carried an old key, we map
// to the closest new destination instead of showing a blank pane.
// Unknown keys fall back to 'Today' via the default in resolveInitialTab.
const LEGACY_TAB_ALIASES = {
  // Old default landing.
  'Workspace':               'Today',
  // Crosswinds builder / legacy builder both point at 'New Application'.
  'Build Spray':             'New Application',
  // Legacy Records label.
  'Spray Records':           'Records',
  // Legacy calendar labels (both mapped to the completed-record calendar).
  'Spray Calendar':          'Calendar',
  // The old 'Planned Sprays' label collided — it meant Planner in some
  // courses and Program Calendar in others. Map both to Planning (the
  // Planner), which was the more common destination.
  'Planned Sprays':          'Planning',
  // Legacy explicit Program Calendar tab.
  'Planned Spray Calendar':  'More',        // reveals Planning Calendar in More
  // Legacy Mix Calculator label.
  'Mix Calculator':          'Calculator',
  // Legacy Spray Intelligence label → new Season Insights inside More.
  'Spray Intelligence':      'More',
}

function resolveInitialTab(candidate) {
  if (!candidate) return 'Today'
  if (SPRAY_TABS.includes(candidate)) return candidate
  if (LEGACY_TAB_ALIASES[candidate]) return LEGACY_TAB_ALIASES[candidate]
  return 'Today'
}

/**
 * Sprays workspace — canonical TurfIntel workspace pattern.
 * SPR.2 — one tab strip across courses, no header action duplication,
 * no course-specific fork. Compliance / builder / inventory / records
 * / reports code untouched.
 */
export default function Spray() {
  const [activeTab, setActiveTab] = useState(() => resolveInitialTab('Today'))
  const [moreTab,  setMoreTab]    = useState('Overview')

  // Phase SPR.2 — CTA on Today that jumps to New Application (replaces
  // the previously embedded second BuildSpraySheet instance so the
  // builder mounts in exactly one place at a time).
  function goToNewApplication() {
    setActiveTab('New Application')
  }

  return (
    <PageShell
      title="Sprays"
      description="Spray applications, planned sprays, and labels."
      tabs={SPRAY_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'Today'           && (
        <SprayCalendarWorkspace onStartNewSpray={goToNewApplication} />
      )}
      {activeTab === 'New Application' && <BuildSpraySheet />}
      {activeTab === 'Records'         && <SprayRecords />}
      {activeTab === 'Planning'        && <SprayProgramPlanner />}
      {activeTab === 'Calendar'        && <SprayCalendar />}
      {activeTab === 'Calculator'      && <MixCalculator />}
      {activeTab === 'Reports'         && <SprayReports />}
      {activeTab === 'More' && (
        <div className={styles.moreInner}>
          <div className={styles.moreNav} role="tablist" aria-label="Advanced spray surfaces">
            {SPRAY_MORE.map(t => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={moreTab === t}
                data-active={moreTab === t ? 'true' : undefined}
                className={styles.moreNavBtn}
                onClick={() => setMoreTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {moreTab === 'Overview'          && <SprayOverview />}
          {moreTab === 'Planning Calendar' && <SprayProgramCalendar />}
          {moreTab === 'Season Insights'   && <ProgramIntelligence />}
        </div>
      )}
    </PageShell>
  )
}
