// Phase S.4 — Spray Workspace entry surface smoke.
//
//   node scripts/smoke-spray-workspace.mjs
//
// Pins the new scheduler-style Spray Workspace surface:
//   • New SprayWorkspace component + CSS module exist.
//   • Workspace is prepended to both LEGACY_TABS and CROSSWINDS_TABS
//     and is the default activeTab on landing.
//   • Quick-action buttons map to existing tab labels (or aliases
//     for the legacy branch) — no new tabs introduced.
//   • Workspace is read-only: no createSpray/patchSpray/deleteSpray
//     calls, no compliance writes, no calculation logic.
//   • Existing tab components (BuildSpraySheet, SprayRecords,
//     SprayProgramPlanner, SprayProgramCalendar, MixCalculator,
//     ProgramIntelligence) carry no Phase S.4 edits.
//   • Mobile breakpoint (≤ 600 px) stacks the header + bumps tap
//     targets.
//   • No worker / migration / permission / spray store changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const WS      = readFileSync('src/pages/Spray/tabs/SprayWorkspace.jsx',          'utf8')
const WS_CSS  = readFileSync('src/pages/Spray/tabs/SprayWorkspace.module.css',   'utf8')
const SP      = readFileSync('src/pages/Spray/Spray.jsx',                        'utf8')
const WS_CODE = stripComments(WS)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── SprayWorkspace component + CSS exist ────────────────────────────
section('SprayWorkspace component + CSS module exist')

assert(/export default function SprayWorkspace\(\{ onNavigateTab \}\)/.test(WS),
  'SprayWorkspace exports default with ({ onNavigateTab }) signature')
assert(WS_CSS.length > 200, 'SprayWorkspace.module.css exists with substantive content')

// ── Spray.jsx wires Workspace as the new default tab ────────────────
section('Spray.jsx — Workspace prepended + default landing tab')

assert(/import SprayWorkspace\s+from\s+['"]\.\/tabs\/SprayWorkspace['"]/.test(SP),
  'Spray.jsx imports SprayWorkspace from ./tabs/SprayWorkspace')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Workspace'/.test(SP),
  "CROSSWINDS_TABS begins with 'Workspace' (S.4 prepended)")
assert(/const\s+LEGACY_TABS\s*=\s*\[\s*'Workspace'/.test(SP),
  "LEGACY_TABS begins with 'Workspace' (S.4 prepended)")

// Default activeTab is 'Workspace' for both branches.
assert(/useState\(\s*['"]Workspace['"]\s*\)/.test(SP),
  "activeTab defaults to 'Workspace' (single useState, both branches land here)")

// Workspace mounts in both branches with onNavigateTab={setActiveTab}.
assert(/activeTab === 'Workspace'\s*&&\s*<SprayWorkspace onNavigateTab=\{setActiveTab\}\s*\/>/.test(SP),
  'Crosswinds branch mounts <SprayWorkspace onNavigateTab={setActiveTab} />')
assert(/activeTab === 'Workspace'\s*&&\s*<SprayWorkspace onNavigateTab=\{t => \{/.test(SP),
  'legacy branch mounts <SprayWorkspace onNavigateTab={t => { … aliasing … }} />')

// Legacy aliasing covers each quick-action target.
for (const [key, label] of [
  ['Build Spray', 'New Application'],
  ['Records',     'Spray Records'],
  ['Calendar',    'Spray Calendar'],
  ['Programs',    'Spray Calendar'],
  ['Calculator',  'Mix Calculator'],
]) {
  const r = new RegExp(`['"]${key}['"]:\\s*['"]${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`)
  assert(r.test(SP),
    `legacy ALIASES maps '${key}' → '${label}'`)
}

// ── Existing tabs are still reachable ───────────────────────────────
section('Existing tabs remain reachable (regression couple)')

for (const tab of [
  'Build Spray', 'Records', 'Calendar', 'Programs', 'Calculator',
]) {
  assert(SP.includes(`'${tab}'`),
    `Crosswinds tab '${tab}' still in source`)
}
for (const tab of [
  'Overview', 'Spray Calendar', 'New Application', 'Spray Records',
  'Planned Programs', 'Program Planner', 'Program Calendar',
  'Mix Calculator', 'Reports', 'Program Intelligence',
]) {
  assert(SP.includes(`'${tab}'`),
    `legacy tab '${tab}' still in source`)
}

// Component imports preserved.
for (const comp of [
  'SprayOverview', 'SprayCalendar', 'BuildSpraySheet', 'SprayRecords',
  'PlannedPrograms', 'SprayProgramPlanner', 'SprayProgramCalendar',
  'MixCalculator', 'SprayReports', 'ProgramIntelligence',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/tabs\\/${comp}'`).test(SP),
    `import ${comp} still present`)
}

// ── Workspace is read-only — no mutations ───────────────────────────
section('SprayWorkspace is read-only — no spray mutations')

assert(!/createSpray\b|patchSpray\b|deleteSpray\b/.test(WS_CODE),
  'SprayWorkspace never calls createSpray / patchSpray / deleteSpray')
assert(!/createSprayProgram\b|updateSprayProgram\b|archiveSprayProgram\b/.test(WS_CODE),
  'SprayWorkspace never calls createSprayProgram / updateSprayProgram / archiveSprayProgram')
assert(!/createSprayProgramItem\b|updateSprayProgramItem\b|deleteSprayProgramItem\b/.test(WS_CODE),
  'SprayWorkspace never mutates spray_program_items')
assert(!/setProgramItemCompletedLink/.test(WS_CODE),
  'SprayWorkspace does not mutate completed-link state')

// Uses store hooks (read-only) + the refresh helpers (also read-only).
assert(/useSpraysData/.test(WS),
  'SprayWorkspace reads via useSpraysData() (existing store hook)')
assert(/useSprayPrograms/.test(WS),
  'SprayWorkspace reads via useSprayPrograms() (existing store hook)')
assert(/refreshSpraysData\(\)/.test(WS),
  'SprayWorkspace triggers refreshSpraysData() on mount')
assert(/refreshSprayPrograms\(\)/.test(WS),
  'SprayWorkspace triggers refreshSprayPrograms() on mount')

// ── Quick-action buttons exist + route to existing tabs ─────────────
section('Quick-action buttons — route via onNavigateTab')

for (const label of [
  'Build Spray Sheet', 'Log Application', 'Spray Programs',
  'Spray Calendar',    'Mix Calculator',
]) {
  assert(WS.includes(label),
    `Workspace renders "${label}" quick-action button`)
}

// Each button calls go('<tab key>'). Spray.jsx maps the keys.
for (const key of ['Build Spray', 'Records', 'Programs', 'Calendar', 'Calculator']) {
  assert(new RegExp(`go\\(['"]${key}['"]\\)`).test(WS),
    `quick-action button calls go('${key}')`)
}

// ── Selected-day cards present ──────────────────────────────────────
section('Selected-day cards — Planned / Completed / Drafts / Compliance')

for (const title of [
  'Planned Sprays',
  'Completed Applications',
  'Drafts / Pending Review',
  'Compliance — Needs Info',
]) {
  assert(WS.includes(title),
    `Workspace renders "${title}" card section`)
}

// Cards key off existing record fields — no new data shape invented.
// Phase S.6a — `.conditions` reads moved into the shared helper
// `src/utils/sprays/recordNeedsInfo.js`. Workspace now imports the
// helper instead of reading conditions inline.
for (const field of ['r.date === selectedDate', 'r.status', 'r.products', 'r.areas']) {
  assert(WS.includes(field),
    `Workspace reads existing field/expression: ${field}`)
}
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(WS),
  'Workspace imports shared recordNeedsInfo helper (S.6a — conditions reads now live in the helper)')

// Date navigator with prev/next + jump-to-date + Today.
assert(/aria-label="Previous day"/.test(WS),
  'date navigator has accessible "Previous day" arrow')
assert(/aria-label="Next day"/.test(WS),
  'date navigator has accessible "Next day" arrow')
assert(/aria-label="Jump to date"/.test(WS),
  'date navigator has jump-to-date input with aria-label')

// ── Existing components carry no Phase S.4 edits ────────────────────
section('Existing spray surfaces carry no Phase S.4 edits')

for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  // Stores
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.4'),
    `${path} carries no Phase S.4 edits`)
}

// ── Mobile breakpoint (≤ 600 px) ────────────────────────────────────
section('Mobile breakpoint — stacks header + bigger tap targets')

const mobileMatch = WS_CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\n\}\s*$/m)
assert(mobileMatch !== null, 'SprayWorkspace.module.css has a @media (max-width: 600px) block')
const mobileSrc = mobileMatch ? mobileMatch[0] : ''
assert(/\.header\s*\{[\s\S]{0,200}flex-direction:\s*column/.test(mobileSrc),
  'mobile .header stacks (flex-direction: column)')
assert(/\.dateNav\s*\{[\s\S]{0,200}width:\s*100%/.test(mobileSrc),
  'mobile .dateNav spans full width')
assert(/\.navBtn\s*\{[\s\S]{0,200}width:\s*36px/.test(mobileSrc),
  'mobile .navBtn bumped to 36×36 (touch-friendly)')
assert(/\.actionBtnPrimary\s*\{[\s\S]{0,200}padding:\s*9px 14px/.test(mobileSrc),
  'mobile .actionBtnPrimary padding bumped to 9px 14px (~36 px tall)')
assert(/\.cards\s*\{[\s\S]{0,200}grid-template-columns:\s*1fr/.test(mobileSrc),
  'mobile .cards collapses to a single column')

// ── No worker / migration / permission / store changes ──────────────
section('Scope guards — no worker / migration / store / permission edits')

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/api/schedules.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.4'),
    `${path} carries no Phase S.4 edits`)
}

// ── DAB + kiosk unchanged (cross-vertical regression couple) ────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(!DAB.includes('Phase S.4'),
  'DAB carries no Phase S.4 edits')
assert(!KIOSK.includes('Phase S.4'),
  'kiosk carries no Phase S.4 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
