// Phase 9B.6 — /crew (OperationsBoard) tab simplification smoke.
//
//   node scripts/smoke-operations-board-tabs.mjs
//
// Source-only checks against src/pages/Operations/OperationsBoard.jsx
// + OperationsBoard.module.css. Crosswinds (courseId 'crossroads-gc')
// gets a simplified 5-tab strip + a synthetic 'More' tab whose body
// renders a secondary pill row for 2 advanced surfaces. Non-Crosswinds
// courses keep the existing 6-tab layout byte-for-byte. PageShell.jsx,
// every tab body component, App.jsx routing, and every store are
// untouched. State stays id-keyed; only display labels are remapped.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const OB  = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')
const CSS = readFileSync('src/pages/Operations/OperationsBoard.module.css', 'utf8')

// ── Crosswinds gate preservation ────────────────────────────────────────
section('Phase 9B.6 — Crosswinds gate wiring')

assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(OB),
  "CROSSWINDS_COURSE_ID = 'crossroads-gc' still exists")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(OB),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy TABS preserved ───────────────────────────────────────────────
section('Legacy TABS object array preserved (all 6)')

assert(/const\s+TABS\s*=\s*\[/.test(OB),
  'legacy TABS constant still defined')
const LEGACY_TABS = [
  ['brief',       'Morning Brief'],
  ['center',      'Daily Operations Center'],
  ['board',       'Operations Board'],
  ['assignments', 'Assignments'],
  ['notes',       'Daily Briefing'],
  ['condition',   'Condition Log'],
]
for (const [id, label] of LEGACY_TABS) {
  assert(new RegExp(`id:\\s*'${id}'[\\s\\S]{0,80}label:\\s*'${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'`).test(OB),
    `legacy { id: '${id}', label: '${label}' } still present`)
}
assert(/const\s+TAB_LABELS\s*=\s*TABS\.map/.test(OB),
  'TAB_LABELS still derived from TABS')
assert(/const\s+LABEL_TO_ID\s*=\s*Object\.fromEntries/.test(OB),
  'LABEL_TO_ID still derived from TABS')
assert(/const\s+ID_TO_LABEL\s*=\s*Object\.fromEntries/.test(OB),
  'ID_TO_LABEL still derived from TABS')

// ── Crosswinds tab arrays ───────────────────────────────────────────────
section('Crosswinds simplified tab arrays (exact)')

assert(/CROSSWINDS_TAB_IDS\s*=\s*\[\s*'assignments'\s*,\s*'board'\s*,\s*'notes'\s*,\s*'condition'\s*,\s*'more'\s*,?\s*\]/.test(OB),
  "CROSSWINDS_TAB_IDS = ['assignments', 'board', 'notes', 'condition', 'more']")
assert(/CROSSWINDS_MORE_IDS\s*=\s*\[\s*'brief'\s*,\s*'center'\s*,?\s*\]/.test(OB),
  "CROSSWINDS_MORE_IDS = ['brief', 'center']")

// ── Label remap ────────────────────────────────────────────────────────
section('CROSSWINDS_LABEL_REMAP — display-label-only')

assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Operations Board'\s*:\s*'Tasks'/.test(OB),
  "remap 'Operations Board' → 'Tasks'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Daily Briefing'\s*:\s*'Briefing'/.test(OB),
  "remap 'Daily Briefing' → 'Briefing'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Condition Log'\s*:\s*'Conditions'/.test(OB),
  "remap 'Condition Log' → 'Conditions'")

// CROSSWINDS_LABEL_BY_ID resolves each canonical id to a display label,
// including the synthetic 'more' pill.
assert(/CROSSWINDS_LABEL_BY_ID\s*=\s*\{[\s\S]{0,800}assignments:\s*ID_TO_LABEL\.assignments/.test(OB),
  'CROSSWINDS_LABEL_BY_ID.assignments mirrors ID_TO_LABEL.assignments')
assert(/CROSSWINDS_LABEL_BY_ID\s*=\s*\{[\s\S]{0,800}more:\s*'More'/.test(OB),
  "CROSSWINDS_LABEL_BY_ID.more = 'More'")

// ── Default tab (Phase 8A.2 regression couple) ─────────────────────────
section("Default activeTab (Phase 8A.2) preserved")

assert(/useState\(\(\)\s*=>\s*\n?\s*courseId === CROSSWINDS_COURSE_ID \? 'assignments' : 'center'/.test(OB),
  "Crosswinds default activeTab = 'assignments'; non-Crosswinds default = 'center'")

// ── moreTab state ──────────────────────────────────────────────────────
section('moreTab state for the More inner row')

assert(/\[moreTab,\s*setMoreTab\]\s*=\s*useState\(['"]brief['"]\)/.test(OB),
  "[moreTab, setMoreTab] state hook seeded with default 'brief'")

// ── PageShell wiring ───────────────────────────────────────────────────
section('PageShell wiring uses course-aware props')

assert(/tabs=\{pageTabs\}/.test(OB),
  'PageShell receives tabs={pageTabs}')
assert(/activeTab=\{activeDisplayLabel\}/.test(OB),
  'PageShell receives activeTab={activeDisplayLabel}')
assert(/onTabChange=\{handleTabClick\}/.test(OB),
  'PageShell receives onTabChange={handleTabClick}')

// pageTabs branches on isCrosswinds.
assert(/const\s+pageTabs\s*=\s*isCrosswinds[\s\S]{0,200}CROSSWINDS_TAB_IDS\.map[\s\S]{0,80}:\s*TAB_LABELS/.test(OB),
  'pageTabs = isCrosswinds ? CROSSWINDS_TAB_IDS.map(...) : TAB_LABELS')

// activeDisplayLabel branches on isCrosswinds and collapses More children to 'More'.
assert(/activeDisplayLabel\s*=\s*isCrosswinds[\s\S]{0,200}CROSSWINDS_MORE_IDS\.includes\(activeTab\)\s*\?\s*'More'\s*:\s*CROSSWINDS_LABEL_BY_ID\[activeTab\][\s\S]{0,80}:\s*ID_TO_LABEL\[activeTab\]/.test(OB),
  'activeDisplayLabel collapses More-group canonicals to "More"')

// ── handleTabClick routing ─────────────────────────────────────────────
section('handleTabClick — course-aware click routing')

assert(/function\s+handleTabClick\(label\)/.test(OB),
  'handleTabClick(label) helper exists')
assert(/!isCrosswinds[\s\S]{0,200}setActiveTab\(LABEL_TO_ID\[label\]\)/.test(OB),
  'non-Crosswinds branch uses legacy LABEL_TO_ID[label] lookup')
assert(/label === 'More'[\s\S]{0,80}setActiveTab\(moreTab\)/.test(OB),
  "'More' click sets activeTab to moreTab (re-enters last More child)")
assert(/Object\.entries\(CROSSWINDS_LABEL_BY_ID\)\.find\(\(\[, l\]\) => l === label\)/.test(OB),
  'Crosswinds non-More click reverse-maps display label → canonical id')

// ── Inner More pill row render ─────────────────────────────────────────
section('Inner More pill row rendering')

assert(/const\s+showMoreInnerRow\s*=\s*isCrosswinds\s*&&\s*CROSSWINDS_MORE_IDS\.includes\(activeTab\)/.test(OB),
  'showMoreInnerRow = isCrosswinds && CROSSWINDS_MORE_IDS.includes(activeTab)')

// Row mounted inside the obSecondary shell (not the obBoard shell).
assert(/<div className=\{styles\.obSecondary\}>[\s\S]{0,800}showMoreInnerRow && \(/.test(OB),
  'inner row mounts inside <div className={styles.obSecondary}>')

assert(/CROSSWINDS_MORE_IDS\.map\(id =>/.test(OB),
  'inner row maps over CROSSWINDS_MORE_IDS')
assert(/onClick=\{\(\)\s*=>\s*\{\s*setMoreTab\(id\);\s*setActiveTab\(id\)\s*\}\}/.test(OB),
  'inner pill click sets both setMoreTab(id) and setActiveTab(id)')
assert(/className=\{styles\.moreNavBtn\}/.test(OB),
  'inner pill uses styles.moreNavBtn')
assert(/className=\{styles\.moreNav\}/.test(OB),
  'inner row container uses styles.moreNav')
assert(/className=\{styles\.moreInner\}/.test(OB),
  'wrapper uses styles.moreInner')

// Inner row pill labels come from canonical ID_TO_LABEL (so Morning
// Brief / Daily Operations Center keep their legacy names under More).
assert(/\{ID_TO_LABEL\[id\]\}/.test(OB),
  'inner pill renders ID_TO_LABEL[id] (canonical legacy label)')

// ── + Task button still targets canonical 'board' ──────────────────────
section('+ Task button (Crosswinds = Tasks tab) target unchanged')

assert(/setActiveTab\('board'\)[\s\S]{0,200}scrollIntoView/.test(OB),
  "'+ Task' header button still calls setActiveTab('board') (which is labeled 'Tasks' on Crosswinds)")

// ── Phase 8A.1 routing options preserved ───────────────────────────────
section('Phase 8A.1 routing options preserved')

assert(/CROSSWINDS_ROUTING_OPTIONS\s*=\s*\[\s*'Front 9 First'\s*,\s*'Back 9 First'\s*\]/.test(OB),
  "CROSSWINDS_ROUTING_OPTIONS = ['Front 9 First', 'Back 9 First']")

// ── Phase 7Y.1/7Y.2 localStorage keys preserved ────────────────────────
section('Phase 7Y.1 + 7Y.2 localStorage keys preserved')

assert(/'turfintel:operations:densityDefault\/v1'/.test(OB),
  "density localStorage key 'turfintel:operations:densityDefault/v1' present")
assert(/'turfintel:operations:timelineDefault\/v1'/.test(OB),
  "timeline localStorage key 'turfintel:operations:timelineDefault/v1' present")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
}

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — PageShell + tab bodies + App untouched')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.6'),
  'PageShell.jsx carries no Phase 9B.6 edits')

// The 5 component files that mount inside the secondary shell + the
// CrewAssignments wrapper that holds DailyAssignmentBoard.
for (const path of [
  'src/pages/Operations/MorningBriefTab.jsx',
  'src/pages/Operations/DailyOperationsCenter.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/pages/Operations/ConditionLogTab.jsx',
  'src/pages/Crew/tabs/CrewAssignments.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9B.6'),
    `${path} carries no Phase 9B.6 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']crew\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="crew/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
