// Phase 9B.3 — Equipment tab simplification smoke.
//
//   node scripts/smoke-equipment-tabs.mjs
//
// Source-only checks against src/pages/Equipment/Equipment.jsx +
// Equipment.module.css. Crosswinds (courseId 'crossroads-gc') gets
// a simplified 4-tab nav + a synthetic "More" tab whose body
// renders a secondary pill row for 2 placeholder surfaces. Non-
// Crosswinds courses keep the existing 7-tab layout byte-for-byte.
// PageShell.jsx, every Equipment tab component file, App.jsx
// routing, and every store are untouched. This is the first
// Equipment-specific smoke in the repo.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const EQ  = readFileSync('src/pages/Equipment/Equipment.jsx', 'utf8')
const CSS = readFileSync('src/pages/Equipment/Equipment.module.css', 'utf8')

// ── Crosswinds gate wiring ──────────────────────────────────────────────
section('Phase 9B.3 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(EQ),
  'Equipment.jsx imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(EQ),
  "Equipment.jsx declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(EQ),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy 7-tab list preserved ─────────────────────────────────────────
section('Legacy 7-tab list preserved (non-Crosswinds)')

assert(/const\s+LEGACY_TABS\s*=\s*\[/.test(EQ),
  'LEGACY_TABS constant exists')
for (const t of [
  'Overview', 'Equipment List', 'Maintenance Logs', 'Repairs',
  'Fuel Usage', 'Service Schedule', 'Parts Needed',
]) {
  assert(new RegExp(`['"]${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`).test(EQ),
    `legacy tab "${t}" present in source`)
}

// ── Crosswinds 5-tab list ───────────────────────────────────────────────
section('Crosswinds visible tabs (exact 5 in order)')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Status'\s*,\s*'Fleet'\s*,\s*'Service'\s*,\s*'Repairs'\s*,\s*'More'\s*\]/.test(EQ),
  "CROSSWINDS_TABS = ['Status', 'Fleet', 'Service', 'Repairs', 'More']")

// ── Crosswinds More inner row (exact 2) ─────────────────────────────────
section('Crosswinds More inner row (exact 2 in order)')

assert(/const\s+CROSSWINDS_MORE\s*=\s*\[\s*'Fuel Usage'\s*,\s*'Parts Needed'\s*\]/.test(EQ),
  "CROSSWINDS_MORE = ['Fuel Usage', 'Parts Needed']")

// ── Legacy → Crosswinds label remap ─────────────────────────────────────
section('CROSSWINDS_LABEL_REMAP — legacy label translation')

assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Overview'\s*:\s*'Status'/.test(EQ),
  "remap 'Overview' → 'Status'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Equipment List'\s*:\s*'Fleet'/.test(EQ),
  "remap 'Equipment List' → 'Fleet'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Service Schedule'\s*:\s*'Service'/.test(EQ),
  "remap 'Service Schedule' → 'Service'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Maintenance Logs'\s*:\s*'Repairs'/.test(EQ),
  "remap 'Maintenance Logs' → 'Repairs'")

// ── All 4 implemented tab component imports preserved ──────────────────
section('All 4 implemented tab component imports preserved')

for (const comp of [
  'EquipmentOverview', 'EquipmentList',
  'MaintenanceLogs', 'ServiceSchedule',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/tabs\\/${comp}'`).test(EQ),
    `import ${comp} still present`)
}

// ── Crosswinds branch mappings ──────────────────────────────────────────
section('Crosswinds tab → component mappings')

assert(/activeTab === 'Status'\s*&&\s*<EquipmentOverview \/>/.test(EQ),
  "Crosswinds 'Status' → <EquipmentOverview />")
assert(/activeTab === 'Fleet'\s*&&\s*<EquipmentList \{\.\.\.equipmentListProps\}/.test(EQ),
  "Crosswinds 'Fleet' → <EquipmentList {...equipmentListProps} />")
assert(/activeTab === 'Service'\s*&&\s*<ServiceSchedule \{\.\.\.serviceScheduleProps\}/.test(EQ),
  "Crosswinds 'Service' → <ServiceSchedule {...serviceScheduleProps} />")
assert(/activeTab === 'Repairs'\s*&&\s*<MaintenanceLogs \{\.\.\.maintenanceLogsProps\}/.test(EQ),
  "Crosswinds 'Repairs' → <MaintenanceLogs {...maintenanceLogsProps} />")

// More inner placeholders.
assert(/activeTab === 'More'/.test(EQ),
  "Crosswinds 'More' branch present")
assert(/PLACEHOLDER_COPY\[moreTab\]/.test(EQ),
  'More inner row renders PLACEHOLDER_COPY[moreTab] body')

// ── Non-Crosswinds legacy branch maps all 4 implemented + 3 placeholders ─
section('Non-Crosswinds legacy mappings preserved')

const LEGACY_PAIRS = [
  ['Overview',         'EquipmentOverview'],
  ['Equipment List',   'EquipmentList'],
  ['Maintenance Logs', 'MaintenanceLogs'],
  ['Service Schedule', 'ServiceSchedule'],
]
for (const [label, comp] of LEGACY_PAIRS) {
  const re = new RegExp(`activeTab === '${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'\\s*&&\\s*<${comp}`)
  assert(re.test(EQ),
    `legacy '${label}' → <${comp} ...> still rendered`)
}
// Placeholder branch via PLACEHOLDER_COPY[activeTab] still present.
assert(/PLACEHOLDER_COPY\[activeTab\]/.test(EQ),
  'legacy PLACEHOLDER_COPY[activeTab] placeholder branch still present')

// ── Tab list branches on isCrosswinds ──────────────────────────────────
section('Tab list selection branches on isCrosswinds')

assert(/const\s+tabs\s*=\s*isCrosswinds \? CROSSWINDS_TABS : LEGACY_TABS/.test(EQ),
  'tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS')
assert(/tabs=\{tabs\}/.test(EQ),
  'PageShell receives tabs={tabs}')

// ── moreTab state ───────────────────────────────────────────────────────
section('moreTab state for the More inner row')

assert(/\[moreTab,\s*setMoreTab\]\s*=\s*useState\(seed\.moreTab\)/.test(EQ),
  '[moreTab, setMoreTab] state hook seeded from resolver')

// ── Default tab initializer (course-aware, via resolveSeedTabs) ────────
section('Default tab initializer via resolveSeedTabs')

assert(/function\s+resolveSeedTabs\s*\(\s*seedActive,\s*isCrosswinds\s*\)/.test(EQ),
  'resolveSeedTabs(seedActive, isCrosswinds) helper is defined')
assert(/isCrosswinds[\s\S]{0,200}activeTab:\s*'Status'/.test(EQ),
  "Crosswinds default activeTab is 'Status'")
assert(/activeTab:\s*'Overview',\s*moreTab:\s*'Fuel Usage'/.test(EQ),
  "Non-Crosswinds default activeTab is 'Overview'")
assert(/CROSSWINDS_LABEL_REMAP\[seedActive\]\s*\?\?\s*seedActive/.test(EQ),
  'resolver applies CROSSWINDS_LABEL_REMAP to translate legacy seeds')
assert(/CROSSWINDS_MORE\.includes\(translated\)[\s\S]{0,120}activeTab:\s*'More',\s*moreTab:\s*translated/.test(EQ),
  'resolver routes More-child seeds into (activeTab=More, moreTab=child)')
assert(/CROSSWINDS_TABS\.includes\(translated\)[\s\S]{0,120}activeTab:\s*translated/.test(EQ),
  'resolver routes Crosswinds primary seed verbatim')

// ── Shared per-component props ──────────────────────────────────────────
section('Shared per-component props (preserved across branches)')

assert(/const\s+equipmentListProps\s*=\s*\{[\s\S]{0,200}initialSelectedId:\s*equipInitialSelectedId[\s\S]{0,200}onJumpToMaintenance:\s*jumpToMaintenance/.test(EQ),
  'equipmentListProps carries initialSelectedId + onJumpToMaintenance')
assert(/const\s+maintenanceLogsProps\s*=\s*\{[\s\S]{0,200}initialSearch:\s*maintInitialSearch/.test(EQ),
  'maintenanceLogsProps carries initialSearch')
assert(/const\s+serviceScheduleProps\s*=\s*\{[\s\S]{0,200}onJumpToUnit:\s*jumpToUnit[\s\S]{0,200}onJumpToMaintenance:\s*jumpToMaintenance/.test(EQ),
  'serviceScheduleProps carries onJumpToUnit + onJumpToMaintenance')

// Both branches spread each props object onto its component.
const listSpreads    = (EQ.match(/<EquipmentList \{\.\.\.equipmentListProps\}/g) ?? []).length
const maintSpreads   = (EQ.match(/<MaintenanceLogs \{\.\.\.maintenanceLogsProps\}/g) ?? []).length
const serviceSpreads = (EQ.match(/<ServiceSchedule \{\.\.\.serviceScheduleProps\}/g) ?? []).length
assert(listSpreads === 2,    '<EquipmentList {...equipmentListProps} /> rendered in both Crosswinds + legacy', listSpreads)
assert(maintSpreads === 2,   '<MaintenanceLogs {...maintenanceLogsProps} /> rendered in both Crosswinds + legacy', maintSpreads)
assert(serviceSpreads === 2, '<ServiceSchedule {...serviceScheduleProps} /> rendered in both Crosswinds + legacy', serviceSpreads)

// ── Course-aware label resolution (used by handleTabChange + jumps) ────
section('Course-aware label resolution for cleanup + jumps')

assert(/const\s+equipListLabel\s*=\s*isCrosswinds \? 'Fleet'\s*:\s*'Equipment List'/.test(EQ),
  "equipListLabel = isCrosswinds ? 'Fleet' : 'Equipment List'")
assert(/const\s+maintLabel\s*=\s*isCrosswinds \? 'Repairs'\s*:\s*'Maintenance Logs'/.test(EQ),
  "maintLabel = isCrosswinds ? 'Repairs' : 'Maintenance Logs'")
assert(/const\s+serviceLabel\s*=\s*isCrosswinds \? 'Service'\s*:\s*'Service Schedule'/.test(EQ),
  "serviceLabel = isCrosswinds ? 'Service' : 'Service Schedule'")

// handleTabChange uses the course-aware labels so seed cleanup works for both branches.
assert(/if \(newTab !== equipListLabel\) setEquipInitialSelectedId\(null\)/.test(EQ),
  'handleTabChange clears equip seed against equipListLabel')
assert(/if \(newTab !== maintLabel\)\s*setMaintInitialSearch\(null\)/.test(EQ),
  'handleTabChange clears maint seed against maintLabel')

// jumpToMaintenance + jumpToUnit target the course-aware labels.
assert(/jumpToMaintenance\s*=\s*\(unitName\)\s*=>\s*\{[\s\S]{0,120}setActiveTab\(maintLabel\)/.test(EQ),
  'jumpToMaintenance sets activeTab to maintLabel (Crosswinds=Repairs, legacy=Maintenance Logs)')
assert(/jumpToUnit\s*=\s*\(unitId\)\s*=>\s*\{[\s\S]{0,120}setActiveTab\(equipListLabel\)/.test(EQ),
  'jumpToUnit sets activeTab to equipListLabel (Crosswinds=Fleet, legacy=Equipment List)')

// ── Header buttons ──────────────────────────────────────────────────────
section('Header button labels + targets (course-aware)')

assert(/onClick=\{\(\) => setActiveTab\(maintLabel\)\}[\s\S]{0,260}\{isCrosswinds \? 'Repairs' : 'Maintenance'\}/.test(EQ),
  "header 'Maintenance' button: Crosswinds label='Repairs', target=maintLabel")
assert(/onClick=\{\(\) => setActiveTab\(serviceLabel\)\}[\s\S]{0,260}\{isCrosswinds \? 'Service' : 'Service Schedule'\}/.test(EQ),
  "header 'Service Schedule' button: Crosswinds label='Service', target=serviceLabel")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
  assert(new RegExp(`styles\\.${cls}`).test(EQ),
    `Equipment.jsx wires styles.${cls}`)
}

// ── OperationsBoard deep-link regression ────────────────────────────────
section('OperationsBoard equipment deep-link contract preserved')

const OB = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')
assert(/navigate\('\/equipment',\s*\{\s*state:\s*\{[\s\S]{0,160}activeTab:\s*'Equipment List'/.test(OB),
  "OperationsBoard still navigates to /equipment with state.activeTab='Equipment List'")

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — PageShell + tab components + App untouched')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.3'),
  'PageShell.jsx carries no Phase 9B.3 edits')

for (const comp of [
  'EquipmentOverview', 'EquipmentList',
  'MaintenanceLogs', 'ServiceSchedule',
]) {
  const src = readFileSync(`src/pages/Equipment/tabs/${comp}.jsx`, 'utf8')
  assert(!src.includes('Phase 9B.3'),
    `src/pages/Equipment/tabs/${comp}.jsx carries no Phase 9B.3 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']equipment\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="equipment/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
