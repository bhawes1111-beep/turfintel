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

// -- Flat SPRAY_TABS with no visible Program labels --
section('SPRAY_TABS - zero Program labels in visible nav')

const tabsMatch = SP.match(/const\s+SPRAY_TABS\s*=\s*\[([^\]]+)\]/)
assert(tabsMatch != null, 'SPRAY_TABS declared in Spray.jsx')
const tabsPayload = tabsMatch ? tabsMatch[1] : ''

for (const expected of ['Calendar', 'New Application', 'Records', 'Resistance', 'Planning', 'Calculator', 'Reports']) {
  assert(new RegExp("'" + expected + "'").test(tabsPayload),
    `SPRAY_TABS contains '${expected}'`)
}
assert(!/SPRAY_MORE/.test(SP), 'SPRAY_MORE removed from Spray.jsx')

const programHits = tabsPayload.match(/'[^']*Program[^']*'/g) ?? []
assert(programHits.length === 0,
  `ZERO Program labels in tab array (found: ${programHits.join(', ') || 'none'})`)

assert(!/'Planned Sprays'/.test(tabsPayload),
  'Planned Sprays collision label removed from visible nav')

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

// ── ProgramIntelligence renders Resistance Management user copy ──────
section('ProgramIntelligence — renders Resistance Management user-facing')

assert(/<WorkspaceSection\s+title="Resistance Management"/.test(INTEL),
  'WorkspaceSection title = "Resistance Management"')
assert(/<h2 className=\{styles\.printTitle\}>Resistance Management Report<\/h2>/.test(INTEL),
  'print header = "Resistance Management Report"')
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
section('Spray.jsx — Resistance routes to ProgramIntelligence')

assert(/activeTab === 'Resistance'\s*&&\s*<ProgramIntelligence \/>/.test(SP),
  "Resistance tab mounts <ProgramIntelligence />")

// Old route checks are gone (negative pins).
assert(!/moreTab === 'Program Intelligence'/.test(SP),
  "no leftover moreTab === 'Program Intelligence' check (S.6c rename)")
assert(!/activeTab === 'Program Intelligence'/.test(SP),
  "no leftover activeTab === 'Program Intelligence' check (S.6c rename)")
assert(!/moreTab === 'Planned Programs'/.test(SP),
  "no leftover moreTab === 'Planned Programs' route (S.6c removal)")
assert(!/activeTab === 'Planned Programs'/.test(SP),
  "no leftover activeTab === 'Planned Programs' route (S.6c removal)")

// ── Planned Sprays workflow regression couples ─────────────────────
//
// Phase SPR.3a renamed the builder's action-row buttons:
//   "Save as Planned Spray" → "Save as Template"
//   "Load Planned Spray"    → "Load Template"
// The underlying save/load handlers and modal titles are unchanged;
// the modal still says "Save as Planned Spray" so users see the same
// planned-spray concept in the modal itself. Only the button labels
// changed to reduce competition with the primary Save & Log Spray CTA.
section('Planned Sprays workflow preserved — builder buttons relabeled, planner page unchanged')

assert(/>\s*Save as Template\s*<\/button>/.test(BUILD),
  'Build Spray still exposes a Save-as-Template action (SPR.3a rename of "Save as Planned Spray")')
assert(/>\s*Load Template\s*<\/button>/.test(BUILD),
  'Build Spray still exposes a Load-Template action (SPR.3a rename of "Load Planned Spray")')

// Modal titles unchanged — they still say "Planned Spray".
const SAVE_MOD = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx', 'utf8')
const LOAD_MOD = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',   'utf8')
assert(/Save as Planned Spray/.test(SAVE_MOD),
  'SaveAsProgramModal title still says "Save as Planned Spray" (modal internal — user still sees the concept in the modal itself)')
assert(/Load Planned Spray/.test(LOAD_MOD),
  'LoadProgramModal title still says "Load Planned Spray" (modal internal)')

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
