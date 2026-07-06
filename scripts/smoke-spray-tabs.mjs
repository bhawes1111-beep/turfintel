// Phase SPR.2 — Unified Spray tab navigation smoke.
//
//   node scripts/smoke-spray-tabs.mjs
//
// Replaces the pre-SPR.2 tab smoke (which pinned separate LEGACY_TABS
// and CROSSWINDS_TABS constants + course-conditional forks). SPR.2
// unifies to a single SPRAY_TABS + SPRAY_MORE and removes header
// duplication.
//
// Pins:
//   • SPRAY_TABS is a single unified 8-entry list.
//   • SPRAY_MORE is a 3-entry list under the More tab.
//   • CROSSWINDS_TABS / CROSSWINDS_MORE / LEGACY_TABS / CROSSWINDS_COURSE_ID
//     constants are REMOVED (no course-conditional nav).
//   • useSelectedCourseId no longer imported by Spray.jsx (no course fork).
//   • Each tab maps to the correct destination component.
//   • Default landing is 'Today'.
//   • Header action buttons ('+ New Spray', 'Reports') are REMOVED —
//     tab strip is the single navigation primitive.
//   • Legacy activeTab keys map to new destinations via
//     LEGACY_TAB_ALIASES (no blank pane for stale session state).
//   • Only ONE BuildSpraySheet mount site (New Application tab).
//   • Deleted files SprayWorkspace.jsx / PlannedPrograms.jsx are gone.
//   • Compliance / builder / worker / calculation code not touched.

import { readFileSync, readdirSync, existsSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SP = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')

// ── No new migration ─────────────────────────────────────────────
section('Frontend-only — no migration')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration')

// ── SPR.2 unified tab list ───────────────────────────────────────
section('SPR.2 — one unified SPRAY_TABS + SPRAY_MORE')

assert(/export\s+const\s+SPRAY_TABS\s*=\s*\[\s*'Today',\s*'New Application',\s*'Records',\s*'Planning',\s*'Calendar',\s*'Calculator',\s*'Reports',\s*'More',?\s*\]/.test(SP),
  "SPRAY_TABS = ['Today', 'New Application', 'Records', 'Planning', 'Calendar', 'Calculator', 'Reports', 'More']")
assert(/export\s+const\s+SPRAY_MORE\s*=\s*\[\s*'Overview',\s*'Planning Calendar',\s*'Season Insights',?\s*\]/.test(SP),
  "SPRAY_MORE = ['Overview', 'Planning Calendar', 'Season Insights']")

// ── Course-conditional fork REMOVED ──────────────────────────────
section('Course-conditional fork removed')

assert(!/const\s+CROSSWINDS_TABS/.test(SP),
  'CROSSWINDS_TABS constant REMOVED')
assert(!/const\s+CROSSWINDS_MORE/.test(SP),
  'CROSSWINDS_MORE constant REMOVED')
assert(!/const\s+LEGACY_TABS/.test(SP),
  'LEGACY_TABS constant REMOVED')
assert(!/const\s+CROSSWINDS_COURSE_ID/.test(SP),
  'CROSSWINDS_COURSE_ID constant REMOVED (no course-conditional nav)')
assert(!/useSelectedCourseId/.test(SP),
  'Spray.jsx no longer imports useSelectedCourseId (unified nav)')
assert(!/isCrosswinds/.test(SP),
  "Spray.jsx no longer references 'isCrosswinds' anywhere")

// ── Default landing = 'Today' ────────────────────────────────────
section('Default landing = Today (mounts SprayCalendarWorkspace)')

assert(/useState\(\(\) => resolveInitialTab\('Today'\)\)/.test(SP),
  "activeTab default = resolveInitialTab('Today')")
assert(/activeTab === 'Today'\s*&&\s*\(\s*\n\s*<SprayCalendarWorkspace onStartNewSpray=\{goToNewApplication\}\s*\/>/.test(SP),
  "Today tab mounts <SprayCalendarWorkspace onStartNewSpray={goToNewApplication} />")

// ── Every tab mapped to its correct destination ──────────────────
section('Every tab reaches its destination component')

const TAB_TO_COMPONENT = {
  'New Application': 'BuildSpraySheet',
  'Records':         'SprayRecords',
  'Planning':        'SprayProgramPlanner',
  'Calendar':        'SprayCalendar',
  'Calculator':      'MixCalculator',
  'Reports':         'SprayReports',
}
for (const [tab, comp] of Object.entries(TAB_TO_COMPONENT)) {
  const re = new RegExp(`activeTab === '${tab}'\\s*&&\\s*<${comp} \\/>`)
  assert(re.test(SP),
    `'${tab}' tab mounts <${comp} />`)
}

// More group destinations.
const MORE_TO_COMPONENT = {
  'Overview':          'SprayOverview',
  'Planning Calendar': 'SprayProgramCalendar',
  'Season Insights':   'ProgramIntelligence',
}
for (const [more, comp] of Object.entries(MORE_TO_COMPONENT)) {
  const re = new RegExp(`moreTab === '${more}'\\s*&&\\s*<${comp} \\/>`)
  assert(re.test(SP),
    `More → '${more}' mounts <${comp} />`)
}

// ── Header action buttons removed ────────────────────────────────
section('Header action buttons removed (tab strip is the sole nav)')

// The button emitted "+ New Spray" as literal text — negative pin
// only against JSX text (not comment mentions describing the removal).
assert(!/>\s*\+\s*New Spray\s*</.test(SP),
  "'+ New Spray' header button REMOVED (no JSX text)")
assert(!/onClick=\{\(\) => setActiveTab\('Reports'\)\}/.test(SP),
  "'Reports' header button REMOVED (accessed via tab)")
assert(!/<WorkspaceActions>/.test(SP),
  '<WorkspaceActions> wrapper REMOVED (no more redundant header buttons)')
assert(!/import\s+WorkspaceActions/.test(SP),
  'WorkspaceActions no longer imported by Spray.jsx')

// ── Legacy tab-key compatibility ─────────────────────────────────
section('Legacy activeTab-key compatibility (stale session-state safety)')

assert(/const\s+LEGACY_TAB_ALIASES\s*=\s*\{/.test(SP),
  'LEGACY_TAB_ALIASES map declared')
// Sample legacy keys.
const LEGACY_KEYS_EXPECTED = [
  ["'Workspace'",              "'Today'"],
  ["'Build Spray'",             "'New Application'"],
  ["'Spray Records'",           "'Records'"],
  ["'Spray Calendar'",          "'Calendar'"],
  ["'Planned Sprays'",          "'Planning'"],
  ["'Planned Spray Calendar'",  "'More'"],
  ["'Mix Calculator'",          "'Calculator'"],
  ["'Spray Intelligence'",      "'More'"],
]
for (const [oldK, newK] of LEGACY_KEYS_EXPECTED) {
  const re = new RegExp(`${oldK}[^,}]*:\\s*${newK}`)
  assert(re.test(SP),
    `LEGACY_TAB_ALIASES: ${oldK} → ${newK}`)
}

// Resolver.
assert(/function resolveInitialTab\(candidate\) \{/.test(SP),
  'resolveInitialTab(candidate) helper declared')
assert(/if \(!candidate\) return 'Today'/.test(SP),
  "resolveInitialTab: falsy candidate → 'Today'")
assert(/if \(SPRAY_TABS\.includes\(candidate\)\) return candidate/.test(SP),
  'resolveInitialTab: recognized candidate returns as-is')
assert(/if \(LEGACY_TAB_ALIASES\[candidate\]\) return LEGACY_TAB_ALIASES\[candidate\]/.test(SP),
  'resolveInitialTab: legacy alias mapping applied')
assert(/return 'Today'/.test(SP),
  "resolveInitialTab: fallback → 'Today' (unknown key)")

// ── Only ONE BuildSpraySheet mount site ──────────────────────────
section('Only one <BuildSpraySheet /> mount site (New Application only)')

const buildSpraySheetMounts = (SP.match(/<BuildSpraySheet\s*\/>/g) ?? []).length
assert(buildSpraySheetMounts === 1,
  `exactly one <BuildSpraySheet /> in Spray.jsx (found ${buildSpraySheetMounts})`)

// ── Deleted legacy files ─────────────────────────────────────────
section('Legacy dead files deleted')

assert(!existsSync('src/pages/Spray/tabs/SprayWorkspace.jsx'),
  'SprayWorkspace.jsx removed (was dead code — superseded by SprayCalendarWorkspace)')
assert(!existsSync('src/pages/Spray/tabs/SprayWorkspace.module.css'),
  'SprayWorkspace.module.css removed')
assert(!existsSync('src/pages/Spray/tabs/PlannedPrograms.jsx'),
  'PlannedPrograms.jsx removed (was dead code — superseded by SprayProgramPlanner)')

// ── Compliance / builder / worker code not touched ───────────────
section('Cross-vertical guards — no worker/migration/compliance/calc changes')

for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/lib/mutationPermissions.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase SPR.2'),
    `${path} carries no Phase SPR.2 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
