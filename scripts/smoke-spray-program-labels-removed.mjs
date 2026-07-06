// Phase S.6c — Remove remaining spray "Program" user-facing labels.
//
//   node scripts/smoke-spray-program-labels-removed.mjs
//
// Pins the final cleanup:
//   • CROSSWINDS_MORE no longer contains 'Planned Programs' or
//     'Program Intelligence' — replaced by 'Spray Intelligence'
//     and rid of the legacy 'Planned Programs' surface.
//   • LEGACY_TABS no longer contains 'Planned Programs' or
//     'Program Intelligence'.
//   • Main Crosswinds tabs still expose 'Planned Sprays' (S.6b).
//   • Build Spray still shows 'Save as Planned Spray' + 'Load
//     Planned Spray' (S.6b regression couple).
//   • ProgramIntelligence component now renders "Spray Intelligence"
//     as its WorkspaceSection title + print header.
//   • No worker changes, no migration, no destructive data changes.
//   • Internal store/endpoint/file names untouched.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SP        = readFileSync('src/pages/Spray/Spray.jsx',                       'utf8')
const INTEL     = readFileSync('src/pages/Spray/tabs/ProgramIntelligence.jsx',    'utf8')
const BUILD     = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',        'utf8')
const PROG_W    = readFileSync('worker/api/sprayPrograms.js',                     'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                            'utf8')

// ── No D1 migration / no worker churn ──────────────────────────────
section('No D1 migration / no worker churn')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.6c'),
    `${path} carries no Phase S.6c edits`)
}

// Internal contracts unchanged.
assert(/export async function createSprayProgram\b/.test(PROG_W),
  'worker createSprayProgram still exported (internal contract)')
assert(/export async function listSprayProgramItems\b/.test(PROG_W),
  'worker listSprayProgramItems still exported (internal contract)')
assert(/spray_programs/.test(PROG_W),
  'spray_programs table still referenced by worker')
assert(/spray_program_items/.test(PROG_W),
  'spray_program_items table still referenced by worker')
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray still exported (commit path unchanged)')
assert(/inventory_item_id/.test(SPRAYS_W),
  'worker createSpray still wires inventory_item_id (deduction unchanged)')

// ── Phase SPR.2 — Unified SPRAY_TABS + SPRAY_MORE (no CROSSWINDS/LEGACY fork) ─
section('SPRAY_TABS + SPRAY_MORE — zero "Program" labels in visible nav')

const tabsMatch = SP.match(/export\s+const\s+SPRAY_TABS\s*=\s*\[([^\]]+)\]/)
const moreMatch = SP.match(/export\s+const\s+SPRAY_MORE\s*=\s*\[([^\]]+)\]/)
assert(tabsMatch != null, 'SPRAY_TABS declared in Spray.jsx')
assert(moreMatch != null, 'SPRAY_MORE declared in Spray.jsx')
const tabsPayload = tabsMatch ? tabsMatch[1] : ''
const morePayload = moreMatch ? moreMatch[1] : ''

// SPR.2 unified primary tabs.
for (const expected of ['Today', 'New Application', 'Records', 'Planning',
                        'Calendar', 'Calculator', 'Reports', 'More']) {
  assert(new RegExp(`'${expected}'`).test(tabsPayload),
    `SPRAY_TABS contains '${expected}'`)
}

// SPR.2 More group.
for (const expected of ['Overview', 'Planning Calendar', 'Season Insights']) {
  assert(new RegExp(`'${expected}'`).test(morePayload),
    `SPRAY_MORE contains '${expected}'`)
}

// Negative pins — no "Program" labels anywhere in the visible nav.
const anyTabPayload = tabsPayload + ' ' + morePayload
const programHits = anyTabPayload.match(/'[^']*Program[^']*'/g) ?? []
assert(programHits.length === 0,
  `SPR.2: ZERO 'Program' labels in tab arrays (found: ${programHits.join(', ') || 'none'})`)

// No "Planned Sprays" collision (SPR.2 renamed to Planning + Planning Calendar).
assert(!/'Planned Sprays'/.test(anyTabPayload),
  "SPR.2: 'Planned Sprays' collision label removed from visible nav")

// Negative pins — no course-conditional forks survive.
assert(!/const\s+CROSSWINDS_TABS/.test(SP),
  'CROSSWINDS_TABS constant REMOVED (SPR.2 unified tab list)')
assert(!/const\s+CROSSWINDS_MORE/.test(SP),
  'CROSSWINDS_MORE constant REMOVED (SPR.2)')
assert(!/const\s+LEGACY_TABS/.test(SP),
  'LEGACY_TABS constant REMOVED (SPR.2)')
assert(!/const\s+CROSSWINDS_COURSE_ID/.test(SP),
  'CROSSWINDS_COURSE_ID constant REMOVED (SPR.2 — no course-conditional nav)')

// ── PlannedPrograms component deleted (was legacy dead code) ────────
section('PlannedPrograms component removed by SPR.2')

// No import remains.
assert(!/^import\s+PlannedPrograms\s+from/m.test(SP),
  'no active "import PlannedPrograms from …" line in Spray.jsx')
// No mount sites.
assert(!/<PlannedPrograms\s*\/>/.test(SP),
  'no <PlannedPrograms /> mount site remains in Spray.jsx')
// Component file deleted by SPR.2.
import { existsSync } from 'fs'
assert(!existsSync('src/pages/Spray/tabs/PlannedPrograms.jsx'),
  'PlannedPrograms.jsx removed by SPR.2 (was legacy dead code)')

// ── ProgramIntelligence renders "Spray Intelligence" user copy ──────
section('ProgramIntelligence — renders "Spray Intelligence" user-facing')

assert(/<WorkspaceSection\s+title="Spray Intelligence"/.test(INTEL),
  'WorkspaceSection title = "Spray Intelligence"')
assert(/<h2 className=\{styles\.printTitle\}>Spray Intelligence Report<\/h2>/.test(INTEL),
  'print header = "Spray Intelligence Report"')
assert(/populate spray analytics/.test(INTEL),
  'empty-state copy says "populate spray analytics" (S.6c rename)')

// Negative pins — old user-facing copy gone.
assert(!/title="Program Intelligence"/.test(INTEL),
  'no user-facing "Program Intelligence" WorkspaceSection title remains')
assert(!/>Program Intelligence Report</.test(INTEL),
  'no user-facing "Program Intelligence Report" print header remains')
assert(!/populate program analytics/.test(INTEL),
  'no user-facing "populate program analytics" copy remains')

// Internal contracts preserved (component file name + print region token).
assert(/export default function ProgramIntelligence/.test(INTEL),
  'ProgramIntelligence component still exported (internal file name unchanged)')
assert(/data-print-region="program-intel"/.test(INTEL),
  'data-print-region token unchanged (internal — no caller dependency)')

// ── Main Spray.jsx tab → component wiring ───────────────────────────
section('Spray.jsx — Spray Intelligence routes to ProgramIntelligence')

// Phase SPR.2 — 'Spray Intelligence' user-facing label renamed to
// 'Season Insights' and moved under More. Component mount unchanged.
assert(/moreTab === 'Season Insights'\s*&&\s*<ProgramIntelligence \/>/.test(SP),
  "SPR.2: More 'Season Insights' → <ProgramIntelligence /> (mount unchanged)")

// Old route checks are gone (negative pins).
assert(!/moreTab === 'Program Intelligence'/.test(SP),
  "no leftover moreTab === 'Program Intelligence' check (S.6c rename)")
assert(!/activeTab === 'Program Intelligence'/.test(SP),
  "no leftover activeTab === 'Program Intelligence' check (S.6c rename)")
assert(!/moreTab === 'Planned Programs'/.test(SP),
  "no leftover moreTab === 'Planned Programs' route (S.6c removal)")
assert(!/activeTab === 'Planned Programs'/.test(SP),
  "no leftover activeTab === 'Planned Programs' route (S.6c removal)")

// ── Planned Sprays workflow regression couples (S.6b) ───────────────
section('Planned Sprays workflow preserved — Build Spray buttons + Planner page')

assert(/>\s*Save as Planned Spray\s*<\/button>/.test(BUILD),
  'Build Spray still renders "Save as Planned Spray" button (S.6b couple)')
assert(/>\s*Load Planned Spray\s*<\/button>/.test(BUILD),
  'Build Spray still renders "Load Planned Spray" button (S.6b couple)')

const PLANNER = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')
assert(/<WorkspaceSection\s+title="Planned Sprays"/.test(PLANNER),
  'SprayProgramPlanner still titled "Planned Sprays" (S.6b couple)')

// ── Save / Load modal internal contracts (S.6b couples) ─────────────
section('Save / Load modals — internal store + API calls preserved')

const SAVE = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx', 'utf8')
const LOAD = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',   'utf8')
assert(/createSprayProgram\(/.test(SAVE),
  'save modal still calls createSprayProgram() (internal contract unchanged)')
assert(/createSprayProgramItem\(/.test(SAVE),
  'save modal still calls createSprayProgramItem() (internal contract unchanged)')
assert(/listSprayProgramItems\(/.test(LOAD),
  'load modal still calls listSprayProgramItems() (internal contract unchanged)')

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk + non-Spray surfaces untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.6c'),   'DAB carries no Phase S.6c edits')
assert(!KIOSK.includes('Phase S.6c'), 'kiosk carries no Phase S.6c edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
