// Phase E.11 — Operations / DAB mobile layout smoke.
//
//   node scripts/smoke-operations-mobile-layout.mjs
//
// Pins the mobile responsive rules that fix the header overlap on
// /crew/assignments (Operations workspace). The issue was that
// PageShell.header stayed side-by-side on every viewport, so on a
// phone the long Operations description on the left collided with
// the time pill + Task + Schedule + course pill cluster on the
// right. DAB also had a justify-content: space-between header that
// pushed 6+ action buttons into a tight wrap.
//
// Fix layers (all CSS-only):
//   • PageShell.module.css gains a @media (max-width: 600px) block
//     that stacks .header vertically, gives .headerRight full width,
//     and pushes the course badge to the end of the action row.
//   • workspace.module.css bumps button padding on phones for
//     comfortable tap targets (~36 px tall).
//   • DAB module CSS stacks the section header on phones and bumps
//     date-nav arrows + tasks buttons to comfortable touch sizes.
//
// Safety invariants:
//   • No JSX changes — render trees stay identical, so functionality
//     is preserved.
//   • Desktop (≥ 600 px) layout is untouched.
//   • No worker / D1 / spray / permission changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const PAGESHELL_CSS = readFileSync('src/components/layout/PageShell.module.css', 'utf8')
const WORKSPACE_CSS = readFileSync('src/styles/workspace.module.css',             'utf8')
const DAB_CSS       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
const OPS_BOARD     = readFileSync('src/pages/Operations/OperationsBoard.jsx',    'utf8')
const DAB_JSX       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── PageShell — mobile stacks the header ────────────────────────────
section('PageShell.module.css — @media (max-width: 600px) stacks the header')

// The mobile block exists.
const psMobileMatch = PAGESHELL_CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\n\}\s*$/m)
assert(psMobileMatch !== null,
  'PageShell.module.css has a @media (max-width: 600px) block')
const psMobileSrc = psMobileMatch ? psMobileMatch[0] : ''

// .header stacks vertically.
assert(/\.header\s*\{[\s\S]{0,300}flex-direction:\s*column/.test(psMobileSrc),
  'mobile .header uses flex-direction: column (vertical stack)')
assert(/\.header\s*\{[\s\S]{0,300}align-items:\s*stretch/.test(psMobileSrc),
  'mobile .header uses align-items: stretch (full-width children)')

// .headerRight gains width: 100%.
assert(/\.headerRight\s*\{[\s\S]{0,300}width:\s*100%/.test(psMobileSrc),
  'mobile .headerRight uses width: 100% (action row spans full width)')
assert(/\.headerRight\s*\{[\s\S]{0,300}flex-wrap:\s*wrap/.test(psMobileSrc),
  'mobile .headerRight uses flex-wrap: wrap (buttons wrap onto multiple lines)')

// Description shrinks slightly on phones.
assert(/\.description\s*\{[\s\S]{0,200}font-size:\s*11px/.test(psMobileSrc),
  'mobile .description shrinks to 11px so it does not dominate the header')

// Course badge moves to end of action row.
assert(/\.courseBadge\s*\{[\s\S]{0,200}margin-left:\s*auto/.test(psMobileSrc),
  'mobile .courseBadge uses margin-left: auto (pushes to right edge of action row)')

// Desktop layout untouched — the base .header rule is unchanged.
assert(/^\.header\s*\{[\s\S]{0,400}display:\s*flex;\s*\n\s*align-items:\s*center;\s*\n\s*justify-content:\s*space-between/m.test(PAGESHELL_CSS),
  'base .header (≥ 600px) still uses display:flex + justify-content:space-between (desktop preserved)')

// ── Workspace actions — comfortable tap targets on phones ───────────
section('workspace.module.css — bigger tap targets on phones')

const wsMobileMatch = WORKSPACE_CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\n\}\s*$/m)
assert(wsMobileMatch !== null,
  'workspace.module.css has a @media (max-width: 600px) block')
const wsMobileSrc = wsMobileMatch ? wsMobileMatch[0] : ''
assert(/\.workspaceActionBtn\s*\{\s*\n\s*padding:\s*9px 14px/.test(wsMobileSrc),
  'mobile .workspaceActionBtn padding bumped to 9px 14px (~36 px tall — comfortable touch)')
assert(/\.workspaceActions\s*\{\s*\n\s*gap:\s*8px/.test(wsMobileSrc),
  'mobile .workspaceActions gap bumped to 8px (less crowded buttons)')

// Desktop unchanged — base .workspaceActionBtn still 6px 12px.
assert(/^\.workspaceActionBtn\s*\{[\s\S]{0,400}padding:\s*6px 12px/m.test(WORKSPACE_CSS),
  'base .workspaceActionBtn still uses 6px 12px padding (desktop preserved)')

// ── DAB header — stacks on phones + comfortable tap targets ─────────
section('DailyAssignmentBoard.module.css — mobile stacks + comfortable buttons')

// The existing @media (max-width: 600px) block at the bottom of the
// DAB CSS now includes the Phase E.11 sectionHeader stack + bigger
// touch targets.
const dabMobileMatches = DAB_CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\n\}/g) ?? []
assert(dabMobileMatches.length >= 1,
  `DAB CSS contains at least one @media (max-width: 600px) block (found ${dabMobileMatches.length})`)
const dabMobileSrc = dabMobileMatches.join('\n\n')

assert(/\.sectionHeader\s*\{[\s\S]{0,400}flex-direction:\s*column/.test(dabMobileSrc),
  'mobile .sectionHeader uses flex-direction: column (title above action cluster)')
assert(/\.sectionHeader\s*\{[\s\S]{0,400}align-items:\s*stretch/.test(dabMobileSrc),
  'mobile .sectionHeader uses align-items: stretch (full-width children)')

assert(/\.dateNav\s*\{[\s\S]{0,400}width:\s*100%/.test(dabMobileSrc),
  'mobile .dateNav uses width: 100% (action cluster spans full width)')

// Date-nav arrows bump to 34 px (touch-friendly).
assert(/\.dateNavBtn\s*\{[\s\S]{0,300}width:\s*34px[\s\S]{0,300}height:\s*34px/.test(dabMobileSrc),
  'mobile .dateNavBtn bumped to 34×34 px (touch-friendly)')

// .tasksBtn padding bumped to 8px 12px (was 4px 9px — way too small).
assert(/\.tasksBtn\s*\{[\s\S]{0,200}padding:\s*8px 12px/.test(dabMobileSrc),
  'mobile .tasksBtn padding bumped to 8px 12px (~30 px tall — comfortable)')
// Negative pin: the old 4px 9px (too small) is gone.
assert(!/\.tasksBtn\s*\{\s*\n?\s*padding:\s*4px 9px/.test(dabMobileSrc),
  'mobile .tasksBtn no longer uses 4px 9px padding (was below comfortable tap target)')

assert(/\.todayBtn\s*\{[\s\S]{0,200}padding:\s*6px 11px/.test(dabMobileSrc),
  'mobile .todayBtn padding bumped to 6px 11px (matches action cluster size)')

// Desktop unchanged — base .sectionHeader still uses justify-content:
// space-between.
assert(/^\.sectionHeader\s*\{[\s\S]{0,300}justify-content:\s*space-between/m.test(DAB_CSS),
  'base .sectionHeader (≥ 600px) still uses justify-content: space-between (desktop preserved)')

// ── JSX render trees unchanged — frontend-only CSS fix ──────────────
section('JSX render trees unchanged — no behavioral changes')

assert(!OPS_BOARD.includes('Phase E.11'),
  'src/pages/Operations/OperationsBoard.jsx carries no Phase E.11 edits (CSS-only fix)')
assert(!DAB_JSX.includes('Phase E.11'),
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx carries no Phase E.11 edits (CSS-only fix)')

// PageShell still wired with title + description + actions slot.
assert(/title="Operations"/.test(OPS_BOARD),
  'OperationsBoard still passes title="Operations" to PageShell (regression couple)')
assert(/description="Daily crew management, routing, scheduling, assignments, and operational coordination\."/.test(OPS_BOARD),
  'OperationsBoard still passes the long description to PageShell (regression couple)')

// DAB still renders the same control cluster.
for (const label of ['Tasks', 'Translate Now', 'Copy Yesterday', 'Copy From Date…', 'Clear Day', 'Feedback']) {
  assert(DAB_JSX.includes(label),
    `DAB JSX still renders the "${label}" control (regression couple)`)
}

// ── Scope guards ─────────────────────────────────────────────────────
section('Scope guards — no worker / spray / permission changes')

for (const path of [
  'worker/index.js',
  'worker/api/schedules.js',
  'worker/api/shiftTemplates.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.11'),
    `${path} carries no Phase E.11 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
