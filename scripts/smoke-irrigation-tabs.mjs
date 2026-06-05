// Phase 9B.4 — Irrigation tab simplification smoke.
//
//   node scripts/smoke-irrigation-tabs.mjs
//
// Source-only checks against src/pages/Irrigation/Irrigation.jsx +
// Irrigation.module.css. Crosswinds (courseId 'crossroads-gc') gets
// a simplified 5-tab nav + a synthetic "More" tab whose body
// renders a secondary pill row for 5 placeholder surfaces. Non-
// Crosswinds courses keep the existing 9-tab layout byte-for-byte.
// PageShell.jsx, every Irrigation tab component file, Weather.jsx,
// App.jsx routing, and every store are untouched.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const IR  = readFileSync('src/pages/Irrigation/Irrigation.jsx', 'utf8')
const CSS = readFileSync('src/pages/Irrigation/Irrigation.module.css', 'utf8')

// ── Crosswinds gate wiring ──────────────────────────────────────────────
section('Phase 9B.4 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(IR),
  'Irrigation.jsx imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(IR),
  "Irrigation.jsx declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(IR),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy 9-tab list preserved ─────────────────────────────────────────
section('Legacy 9-tab list preserved (non-Crosswinds)')

assert(/const\s+LEGACY_TABS\s*=\s*\[/.test(IR),
  'LEGACY_TABS constant exists')
for (const t of [
  'Overview', 'Moisture', 'Dashboard', 'Repairs', 'Head Map',
  'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports',
]) {
  assert(new RegExp(`['"]${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`).test(IR),
    `legacy tab "${t}" present in source`)
}

// ── Crosswinds 5-tab list ───────────────────────────────────────────────
section('Crosswinds visible tabs (exact 5 in order)')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Today'\s*,\s*'Water Balance'\s*,\s*'Moisture'\s*,\s*'Repairs'\s*,\s*'More'\s*\]/.test(IR),
  "CROSSWINDS_TABS = ['Today', 'Water Balance', 'Moisture', 'Repairs', 'More']")

// ── Crosswinds More inner row (exact 5) ─────────────────────────────────
section('Crosswinds More inner row (exact 5 in order)')

assert(/const\s+CROSSWINDS_MORE\s*=\s*\[\s*'Head Map'\s*,\s*'Wet \/ Dry Reports'\s*,\s*'Pump Station'\s*,\s*'Zones'\s*,\s*'Reports'\s*\]/.test(IR),
  "CROSSWINDS_MORE = ['Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']")

// ── Legacy → Crosswinds label remap ─────────────────────────────────────
section('CROSSWINDS_LABEL_REMAP — legacy label translation')

assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Overview'\s*:\s*'Water Balance'/.test(IR),
  "remap 'Overview' → 'Water Balance'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Dashboard'\s*:\s*'Today'/.test(IR),
  "remap 'Dashboard' → 'Today'")

// ── All 4 implemented tab component imports preserved ──────────────────
section('All 4 implemented tab component imports preserved')

for (const comp of [
  'WaterBalanceOverview', 'MoistureOverview', 'IrrigationDashboard', 'Repairs',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/tabs\\/${comp}'`).test(IR),
    `import ${comp} still present`)
}

// ── Crosswinds branch mappings ──────────────────────────────────────────
section('Crosswinds tab → component mappings')

assert(/activeTab === 'Today'\s*&&\s*<IrrigationDashboard \/>/.test(IR),
  "Crosswinds 'Today' → <IrrigationDashboard />")
assert(/activeTab === 'Water Balance'\s*&&\s*<WaterBalanceOverview \/>/.test(IR),
  "Crosswinds 'Water Balance' → <WaterBalanceOverview />")
assert(/activeTab === 'Moisture'\s*&&\s*<MoistureOverview \/>/.test(IR),
  "Crosswinds 'Moisture' → <MoistureOverview />")
assert(/activeTab === 'Repairs'\s*&&\s*<Repairs \/>/.test(IR),
  "Crosswinds 'Repairs' → <Repairs />")
assert(/activeTab === 'More'/.test(IR),
  "Crosswinds 'More' branch present")

// ── Non-Crosswinds legacy mappings preserved ───────────────────────────
section('Non-Crosswinds legacy mappings preserved (all 4 implemented)')

assert(/activeTab === 'Overview'\s*&&\s*<WaterBalanceOverview \/>/.test(IR),
  "legacy 'Overview' → <WaterBalanceOverview />")
assert(/activeTab === 'Moisture'\s*&&\s*<MoistureOverview \/>/.test(IR),
  "legacy 'Moisture' → <MoistureOverview />")
assert(/activeTab === 'Dashboard'\s*&&\s*<IrrigationDashboard \/>/.test(IR),
  "legacy 'Dashboard' → <IrrigationDashboard />")
assert(/activeTab === 'Repairs'\s*&&\s*<Repairs \/>/.test(IR),
  "legacy 'Repairs' → <Repairs />")

// Legacy coming-soon fallback still present.
assert(/activeTab !== 'Overview' && activeTab !== 'Moisture' && activeTab !== 'Dashboard' && activeTab !== 'Repairs'/.test(IR),
  'legacy coming-soon fallback condition still present')
assert(/\{activeTab\} — coming soon/.test(IR),
  "legacy '{activeTab} — coming soon' copy still present")

// ── Tab list branches on isCrosswinds ──────────────────────────────────
section('Tab list selection branches on isCrosswinds')

assert(/const\s+tabs\s*=\s*isCrosswinds \? CROSSWINDS_TABS : LEGACY_TABS/.test(IR),
  'tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS')
assert(/tabs=\{tabs\}/.test(IR),
  'PageShell receives tabs={tabs}')

// ── moreTab state ───────────────────────────────────────────────────────
section('moreTab state for the More inner row')

assert(/\[moreTab,\s*setMoreTab\]\s*=\s*useState\(['"]Head Map['"]\)/.test(IR),
  "[moreTab, setMoreTab] state hook seeded with default 'Head Map'")

// ── Default tab initializer (function-based, course-aware) ─────────────
section('Default tab initializer (function-based, course-aware)')

assert(/useState\(\(\)\s*=>\s*[\s\S]{0,80}isCrosswinds\s*\?\s*'Today'\s*:\s*'Overview'/.test(IR),
  "activeTab defaults to 'Today' on Crosswinds, 'Overview' otherwise")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
  assert(new RegExp(`styles\\.${cls}`).test(IR),
    `Irrigation.jsx wires styles.${cls}`)
}

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — Weather, PageShell, tab components, App untouched')

const WX = readFileSync('src/pages/Weather/Weather.jsx', 'utf8')
assert(!WX.includes('Phase 9B.4'),
  'Weather.jsx carries no Phase 9B.4 edits')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.4'),
  'PageShell.jsx carries no Phase 9B.4 edits')

for (const comp of [
  'WaterBalanceOverview', 'MoistureOverview', 'IrrigationDashboard', 'Repairs',
]) {
  const src = readFileSync(`src/pages/Irrigation/tabs/${comp}.jsx`, 'utf8')
  assert(!src.includes('Phase 9B.4'),
    `src/pages/Irrigation/tabs/${comp}.jsx carries no Phase 9B.4 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']irrigation\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="irrigation/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
