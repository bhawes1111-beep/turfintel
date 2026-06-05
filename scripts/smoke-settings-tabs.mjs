// Phase 9B.5 — Settings tab simplification smoke.
//
//   node scripts/smoke-settings-tabs.mjs
//
// Source-only checks against src/pages/Settings/Settings.jsx +
// Settings.module.css. Crosswinds (courseId 'crossroads-gc') gets
// a simplified 7-tab nav (6 daily-use display labels + a synthetic
// 'More' tab hosting 5 advanced/admin sections in an inner pill
// row). Non-Crosswinds courses keep the existing 11-section flat
// switcher byte-for-byte. PageShell.jsx, every section component,
// useAppPrefs, and App.jsx routing are untouched. This is the
// first Settings-specific smoke in the repo.
//
// The internal activeLabel state continues to carry canonical
// SECTIONS labels; only displayed nav labels are remapped.
// Search-mode (non-empty query) falls back to the legacy flat
// filtered list so every section remains reachable.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const ST  = readFileSync('src/pages/Settings/Settings.jsx', 'utf8')
const CSS = readFileSync('src/pages/Settings/Settings.module.css', 'utf8')

// ── Crosswinds gate wiring ──────────────────────────────────────────────
section('Phase 9B.5 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(ST),
  'Settings.jsx imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(ST),
  "Settings.jsx declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(ST),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy SECTIONS preserved (all 11) ─────────────────────────────────
section('Legacy SECTIONS preserved (all 11)')

assert(/const\s+SECTIONS\s*=\s*\[/.test(ST),
  'SECTIONS constant still defined')
for (const label of [
  'Profile', 'Course Information', 'Course Scope', 'Course Configuration',
  'App Preferences', 'Weather & Data', 'Team & Permissions',
  'Data Management', 'Integrations', 'Pilot Feedback', 'System Info',
]) {
  assert(new RegExp(`label:\\s*'${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'`).test(ST),
    `legacy section label "${label}" still present`)
}

// All 11 section component imports preserved.
for (const comp of [
  'ProfileSection', 'CourseSection', 'CourseScopeSection',
  'CourseConfigurationSection', 'AppPreferencesSection',
  'WeatherDataSection', 'TeamSection', 'DataManagementSection',
  'IntegrationsSection', 'FeedbackReviewSection', 'SystemInfoSection',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/sections\\/${comp}'`).test(ST),
    `import ${comp} still present`)
}

// ── Crosswinds visible tabs (exact 7 in order) ─────────────────────────
section('Crosswinds visible tabs (exact 7 in order)')

assert(/CROSSWINDS_TABS_VISIBLE\s*=\s*\[\s*'Course'\s*,\s*'Course Configuration'\s*,\s*'Team'\s*,\s*'Weather'\s*,\s*'Data'\s*,\s*'System'\s*,\s*'More'\s*,?\s*\]/.test(ST),
  "CROSSWINDS_TABS_VISIBLE = ['Course', 'Course Configuration', 'Team', 'Weather', 'Data', 'System', 'More']")

// ── Crosswinds More group (exact 5 canonical labels) ───────────────────
section('Crosswinds More group (exact 5 canonical labels)')

assert(/CROSSWINDS_MORE\s*=\s*\[\s*'Profile'\s*,\s*'App Preferences'\s*,\s*'Integrations'\s*,\s*'Course Scope'\s*,\s*'Feedback Review'\s*,?\s*\]/.test(ST),
  "CROSSWINDS_MORE = ['Profile', 'App Preferences', 'Integrations', 'Course Scope', 'Feedback Review']")

// ── Canonical → display label remap ────────────────────────────────────
section('CROSSWINDS_LABEL_REMAP — canonical → display')

assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Course Information'\s*:\s*'Course'/.test(ST),
  "remap 'Course Information' → 'Course'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Team & Permissions'\s*:\s*'Team'/.test(ST),
  "remap 'Team & Permissions' → 'Team'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Weather & Data'\s*:\s*'Weather'/.test(ST),
  "remap 'Weather & Data' → 'Weather'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Data Management'\s*:\s*'Data'/.test(ST),
  "remap 'Data Management' → 'Data'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'System Info'\s*:\s*'System'/.test(ST),
  "remap 'System Info' → 'System'")

// Display↔canonical helpers exist.
assert(/function\s+canonicalToDisplay\(/.test(ST),
  'canonicalToDisplay helper defined')
assert(/function\s+displayToCanonical\(/.test(ST),
  'displayToCanonical helper defined')

// ── Default landing tab ────────────────────────────────────────────────
section('Default landing tab (course-aware)')

assert(/useState\(\(\)\s*=>\s*\(?\s*isCrosswinds\s*\?\s*'Course Information'\s*:\s*SECTIONS\[0\]\.label/.test(ST),
  "Crosswinds default activeLabel is 'Course Information' (canonical); non-Crosswinds default = SECTIONS[0].label ('Profile')")

// ── moreLabel state ────────────────────────────────────────────────────
section('moreLabel state for the More inner row')

assert(/\[moreLabel,\s*setMoreLabel\]\s*=\s*useState\(['"]Profile['"]\)/.test(ST),
  "[moreLabel, setMoreLabel] state hook seeded with default 'Profile'")

// ── Search-mode fallback ───────────────────────────────────────────────
section('Search-mode fallback to legacy flat filtered list')

assert(/const\s+searching\s*=\s*normalizedQuery\.length\s*>\s*0/.test(ST),
  "searching = normalizedQuery.length > 0")
assert(/const\s+usingCrosswindsSimplified\s*=\s*isCrosswinds\s*&&\s*!searching/.test(ST),
  'usingCrosswindsSimplified = isCrosswinds && !searching')
assert(/usingCrosswindsSimplified\s*\?\s*CROSSWINDS_TABS_VISIBLE\s*:\s*visibleSections\.map/.test(ST),
  'visibleLabels = usingCrosswindsSimplified ? CROSSWINDS_TABS_VISIBLE : visibleSections.map(...)')

// ── Both render modes wire the simplified labels ───────────────────────
section('Both render modes use the simplified visibleLabels')

// Buttons mode iterates visibleLabels (display strings).
assert(/buttonNav[\s\S]{0,400}visibleLabels\.map\(displayLabel\s*=>/.test(ST),
  'buttons mode .buttonNav maps over visibleLabels (display strings)')

// Dropdown mode passes visibleLabels into PageShell.tabs.
assert(/<PageShell[\s\S]{0,200}tabs=\{visibleLabels\}/.test(ST),
  'dropdown mode passes tabs={visibleLabels} to PageShell')

// activeTab prop reflects display label (with includes-guard).
assert(/activeTab=\{visibleLabels\.includes\(activeDisplayLabel\)\s*\?\s*activeDisplayLabel\s*:\s*''\}/.test(ST),
  'PageShell activeTab is the active display label (with includes-guard fallback)')

// Both modes route click through handleSelectDisplay.
assert(/function\s+handleSelectDisplay\(displayLabel\)/.test(ST),
  'handleSelectDisplay(displayLabel) helper exists')
assert(/onClick=\{\(\)\s*=>\s*handleSelectDisplay\(displayLabel\)\}/.test(ST),
  'buttons mode click → handleSelectDisplay(displayLabel)')
assert(/onTabChange=\{handleSelectDisplay\}/.test(ST),
  'dropdown mode onTabChange={handleSelectDisplay}')

// ── More interception in the click handler ─────────────────────────────
section('More tab interception in handleSelectDisplay')

assert(/handleSelectDisplay[\s\S]{0,500}if \(displayLabel === 'More'\)[\s\S]{0,200}setActiveLabel\(moreLabel\)/.test(ST),
  "clicking 'More' enters the inner row (sets activeLabel = moreLabel)")
assert(/setActiveLabel\(displayToCanonical\(displayLabel\)\)/.test(ST),
  'non-More clicks translate display → canonical before setActiveLabel')

// activeDisplayLabel collapses More-group canonicals into the 'More' pill.
assert(/CROSSWINDS_MORE\.includes\(activeLabel\)\s*\?\s*'More'\s*:\s*canonicalToDisplay\(activeLabel\)/.test(ST),
  "activeDisplayLabel collapses More-group canonicals → 'More'")

// ── Inner More pill row rendering ──────────────────────────────────────
section('More inner pill row rendering')

assert(/const\s+showMoreInnerRow\s*=\s*usingCrosswindsSimplified\s*&&\s*activeDisplayLabel === 'More'/.test(ST),
  "showMoreInnerRow = usingCrosswindsSimplified && activeDisplayLabel === 'More'")
assert(/CROSSWINDS_MORE\.map\(label\s*=>/.test(ST),
  'inner row maps over CROSSWINDS_MORE')
assert(/onClick=\{\(\)\s*=>\s*\{\s*setMoreLabel\(label\);\s*setActiveLabel\(label\)\s*\}\}/.test(ST),
  'inner pill click sets both setMoreLabel and setActiveLabel (canonical)')
assert(/className=\{styles\.moreNavBtn\}/.test(ST),
  'inner pill uses styles.moreNavBtn')
assert(/className=\{styles\.moreNav\}/.test(ST),
  'inner row container uses styles.moreNav')
assert(/className=\{showMoreInnerRow \? styles\.moreInner : undefined\}/.test(ST),
  "wrapper applies styles.moreInner when showMoreInnerRow is true")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
}

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — PageShell + sections + App untouched')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.5'),
  'PageShell.jsx carries no Phase 9B.5 edits')

for (const comp of [
  'ProfileSection', 'CourseSection', 'CourseScopeSection',
  'CourseConfigurationSection', 'AppPreferencesSection',
  'WeatherDataSection', 'TeamSection', 'DataManagementSection',
  'IntegrationsSection', 'FeedbackReviewSection', 'SystemInfoSection',
]) {
  const src = readFileSync(`src/pages/Settings/sections/${comp}.jsx`, 'utf8')
  assert(!src.includes('Phase 9B.5'),
    `src/pages/Settings/sections/${comp}.jsx carries no Phase 9B.5 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']settings\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="settings/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
