// Phase 9B.1 — Spray tab simplification smoke.
//
//   node scripts/smoke-spray-tabs.mjs
//
// Source-only checks against src/pages/Spray/Spray.jsx.
// Crosswinds (courseId 'crossroads-gc') gets a simplified 6-tab nav
// + a synthetic "More" tab whose body renders a secondary pill row
// for 5 advanced surfaces. Non-Crosswinds courses keep the existing
// 10-tab layout byte-for-byte. PageShell.jsx, every Spray tab
// component file, App.jsx routing, and every store are untouched.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SP  = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')
const CSS = readFileSync('src/pages/Spray/Spray.module.css', 'utf8')

// ── Crosswinds gate wiring ──────────────────────────────────────────────
section('Phase 9B.1 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(SP),
  'Spray.jsx imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(SP),
  "Spray.jsx declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(SP),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy 10-tab list preserved ────────────────────────────────────────
section('Legacy 10-tab list preserved (non-Crosswinds)')

assert(/const\s+LEGACY_TABS\s*=\s*\[/.test(SP),
  'LEGACY_TABS constant exists')
for (const t of [
  'Overview', 'Spray Calendar', 'New Application', 'Spray Records',
  'Planned Programs', 'Program Planner', 'Program Calendar',
  'Mix Calculator', 'Reports', 'Program Intelligence',
]) {
  assert(new RegExp(`['"]${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`).test(SP),
    `legacy tab "${t}" present in source`)
}

// ── Crosswinds 6-tab list ───────────────────────────────────────────────
section('Crosswinds visible tabs (exact 6 in order)')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Build Spray'\s*,\s*'Records'\s*,\s*'Calendar'\s*,\s*'Programs'\s*,\s*'Calculator'\s*,\s*'More'\s*\]/.test(SP),
  "CROSSWINDS_TABS = ['Build Spray', 'Records', 'Calendar', 'Programs', 'Calculator', 'More']")

// ── Crosswinds More inner row (exact 5) ─────────────────────────────────
section('Crosswinds More inner row (exact 5 in order)')

assert(/const\s+CROSSWINDS_MORE\s*=\s*\[\s*'Overview'\s*,\s*'Planned Programs'\s*,\s*'Program Planner'\s*,\s*'Reports'\s*,\s*'Program Intelligence'\s*\]/.test(SP),
  "CROSSWINDS_MORE = ['Overview', 'Planned Programs', 'Program Planner', 'Reports', 'Program Intelligence']")

// ── All 10 tab component imports still present ─────────────────────────
section('All 10 original tab component imports preserved')

for (const comp of [
  'SprayOverview', 'SprayCalendar', 'BuildSpraySheet', 'SprayRecords',
  'PlannedPrograms', 'SprayProgramPlanner', 'SprayProgramCalendar',
  'MixCalculator', 'SprayReports', 'ProgramIntelligence',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/tabs\\/${comp}'`).test(SP),
    `import ${comp} still present`)
}

// ── Crosswinds branch mappings ──────────────────────────────────────────
section('Crosswinds tab → component mappings')

assert(/activeTab === 'Build Spray'[\s\S]{0,40}<BuildSpraySheet \/>/.test(SP),
  "Crosswinds 'Build Spray' → <BuildSpraySheet />")
assert(/activeTab === 'Records'[\s\S]{0,40}<SprayRecords \/>/.test(SP),
  "Crosswinds 'Records' → <SprayRecords />")
assert(/activeTab === 'Calendar'[\s\S]{0,40}<SprayCalendar \/>/.test(SP),
  "Crosswinds 'Calendar' → <SprayCalendar />")
assert(/activeTab === 'Programs'[\s\S]{0,40}<SprayProgramCalendar \/>/.test(SP),
  "Crosswinds 'Programs' → <SprayProgramCalendar />")
assert(/activeTab === 'Calculator'[\s\S]{0,40}<MixCalculator \/>/.test(SP),
  "Crosswinds 'Calculator' → <MixCalculator />")

// More inner row renders all 5 advanced components.
assert(/moreTab === 'Overview'[\s\S]{0,40}<SprayOverview \/>/.test(SP),
  "More inner 'Overview' → <SprayOverview />")
assert(/moreTab === 'Planned Programs'[\s\S]{0,40}<PlannedPrograms \/>/.test(SP),
  "More inner 'Planned Programs' → <PlannedPrograms />")
assert(/moreTab === 'Program Planner'[\s\S]{0,40}<SprayProgramPlanner \/>/.test(SP),
  "More inner 'Program Planner' → <SprayProgramPlanner />")
assert(/moreTab === 'Reports'[\s\S]{0,40}<SprayReports \/>/.test(SP),
  "More inner 'Reports' → <SprayReports />")
assert(/moreTab === 'Program Intelligence'[\s\S]{0,40}<ProgramIntelligence \/>/.test(SP),
  "More inner 'Program Intelligence' → <ProgramIntelligence />")

// ── Non-Crosswinds legacy branch maps all 10 originals ─────────────────
section('Non-Crosswinds legacy mappings preserved (all 10)')

const LEGACY_PAIRS = [
  ['Overview',             'SprayOverview'],
  ['Spray Calendar',       'SprayCalendar'],
  ['New Application',      'BuildSpraySheet'],
  ['Spray Records',        'SprayRecords'],
  ['Planned Programs',     'PlannedPrograms'],
  ['Program Planner',      'SprayProgramPlanner'],
  ['Program Calendar',     'SprayProgramCalendar'],
  ['Mix Calculator',       'MixCalculator'],
  ['Reports',              'SprayReports'],
  ['Program Intelligence', 'ProgramIntelligence'],
]
for (const [label, comp] of LEGACY_PAIRS) {
  const re = new RegExp(`activeTab === '${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'[\\s\\S]{0,40}<${comp} \\/>`)
  assert(re.test(SP),
    `legacy '${label}' → <${comp} />`)
}

// ── Tab list branches on isCrosswinds ──────────────────────────────────
section('Tab list selection branches on isCrosswinds')

assert(/const\s+tabs\s*=\s*isCrosswinds \? CROSSWINDS_TABS : LEGACY_TABS/.test(SP),
  'tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS')
assert(/tabs=\{tabs\}/.test(SP),
  'PageShell receives tabs={tabs}')

// ── moreTab state ───────────────────────────────────────────────────────
section('moreTab state for the More inner row')

assert(/\[moreTab,\s*setMoreTab\]\s*=\s*useState\(/.test(SP),
  '[moreTab, setMoreTab] state hook present')

// ── Default tab initializers ────────────────────────────────────────────
section('Default tab initializer (function-based, course-aware)')

assert(/useState\(\(\)\s*=>\s*\(?[\s\S]{0,80}isCrosswinds\s*\?\s*'Build Spray'\s*:\s*'Overview'\s*\)?\s*\)/.test(SP),
  "activeTab defaults to 'Build Spray' on Crosswinds, 'Overview' otherwise")

// ── Header button rewiring ──────────────────────────────────────────────
section('Header button rewiring (Crosswinds vs legacy)')

assert(/setActiveTab\(isCrosswinds \? 'Build Spray' : 'New Application'\)/.test(SP),
  "'+ New Spray' button: Crosswinds → 'Build Spray', legacy → 'New Application'")
assert(/setActiveTab\('More'\)[\s\S]{0,80}setMoreTab\('Reports'\)/.test(SP),
  "Crosswinds 'Reports' button sets activeTab='More' AND moreTab='Reports'")
assert(/setActiveTab\('Reports'\)/.test(SP),
  "Legacy 'Reports' button still calls setActiveTab('Reports')")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
  assert(new RegExp(`styles\\.${cls}`).test(SP),
    `Spray.jsx wires styles.${cls}`)
}

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — PageShell + tab components + App untouched')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.1'),
  'PageShell.jsx carries no Phase 9B.1 edits')

for (const comp of [
  'SprayOverview', 'SprayCalendar', 'BuildSpraySheet', 'SprayRecords',
  'PlannedPrograms', 'SprayProgramPlanner', 'SprayProgramCalendar',
  'MixCalculator', 'SprayReports', 'ProgramIntelligence',
]) {
  const src = readFileSync(`src/pages/Spray/tabs/${comp}.jsx`, 'utf8')
  assert(!src.includes('Phase 9B.1'),
    `src/pages/Spray/tabs/${comp}.jsx carries no Phase 9B.1 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']spray\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="spray/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
