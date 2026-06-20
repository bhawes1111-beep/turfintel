// Phase S.6b — "Program" → "Planned Spray" user-facing rename smoke.
//
//   node scripts/smoke-spray-planned-spray-rename.mjs
//
// Pins the UX simplification:
//   • Spray nav/tab shows "Planned Sprays" (Crosswinds + legacy).
//   • Builder buttons say "Save as Planned Spray" + "Load Planned Spray"
//     with planned-spray tooltips.
//   • Save modal title + name field + toasts use planned-spray copy.
//   • Load modal title + subtitle + empty/loading states use planned-
//     spray copy.
//   • Workspace quick action says "Planned Sprays".
//   • SprayProgramPlanner header section title + CTA + count label
//     use planned-spray copy.
//   • Internals untouched: spray_programs / spray_program_items tables,
//     /api/spray-programs endpoints, store/file/component identifiers,
//     createSprayProgram / createSprayProgramItem / listSprayProgramItems
//     callsites in the modals (this is a label-only phase).
//   • No worker / migration / permission / catalog / calc / inventory /
//     snapshot changes.

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

const SP        = readFileSync('src/pages/Spray/Spray.jsx',                       'utf8')
const WS        = readFileSync('src/pages/Spray/tabs/SprayWorkspace.jsx',         'utf8')
const BUILD     = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',        'utf8')
const SAVE      = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx',     'utf8')
const LOAD      = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',       'utf8')
const PLANNER   = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx',    'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                            'utf8')
const PROG_W    = readFileSync('worker/api/sprayPrograms.js',                     'utf8')

// ── No D1 migration / no worker mutation churn ──────────────────────
section('No D1 migration / no worker churn')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.6b'),
    `${path} carries no Phase S.6b edits`)
}

// Worker still exposes the same spray_programs surface.
assert(/export async function createSprayProgram\b/.test(PROG_W),
  'worker createSprayProgram still exported (label-only phase, contract unchanged)')
assert(/export async function listSprayProgramItems\b/.test(PROG_W),
  'worker listSprayProgramItems still exported')
assert(/spray_programs/.test(PROG_W),
  'worker still references spray_programs table (unchanged)')
assert(/spray_program_items/.test(PROG_W),
  'worker still references spray_program_items table (unchanged)')

// Commit path unchanged.
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray still exported')
assert(/inventory_item_id/.test(SPRAYS_W),
  'worker createSpray still wires inventory_item_id on spray_products (commit inventory deduction unchanged)')

// ── Spray.jsx tabs — Planned Sprays label, internal mount unchanged ─
section('Spray.jsx — visible tab label "Planned Sprays"')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[[^\]]*'Planned Sprays'[^\]]*\]/.test(SP),
  "CROSSWINDS_TABS contains 'Planned Sprays'")
assert(/const\s+CROSSWINDS_MORE\s*=\s*\[[^\]]*'Planned Sprays'[^\]]*\]/.test(SP),
  "CROSSWINDS_MORE contains 'Planned Sprays'")
assert(/const\s+LEGACY_TABS\s*=\s*\[[^\]]*'Planned Sprays'[^\]]*\]/.test(SP),
  "LEGACY_TABS contains 'Planned Sprays'")

// Negative pin — the user-facing 'Programs' / 'Program Planner' tab
// labels are no longer in the tab arrays.
const tabArrays = SP.match(/const\s+(?:CROSSWINDS_TABS|CROSSWINDS_MORE|LEGACY_TABS)\s*=\s*\[[^\]]+\]/g) ?? []
const allTabsBlob = tabArrays.join(' ')
assert(!/'Programs'(?!\s*\.)/.test(allTabsBlob),
  "no tab labeled 'Programs' (S.6b rename)")
assert(!/'Program Planner'/.test(allTabsBlob),
  "no tab labeled 'Program Planner' (S.6b rename)")

// PageShell description no longer says "programs".
assert(/description="Spray applications, planned sprays, and labels\."/.test(SP),
  'PageShell description uses "planned sprays" not "programs"')

// Internal component mounts unchanged.
assert(/activeTab === 'Planned Sprays'[\s\S]{0,200}<SprayProgramCalendar \/>/.test(SP),
  "Crosswinds 'Planned Sprays' → <SprayProgramCalendar /> (mount unchanged)")
assert(/moreTab === 'Planned Sprays'[\s\S]{0,200}<SprayProgramPlanner \/>/.test(SP),
  "Crosswinds More 'Planned Sprays' → <SprayProgramPlanner /> (mount unchanged)")
assert(/activeTab === 'Planned Sprays'[\s\S]{0,300}<SprayProgramPlanner \/>/.test(SP),
  "Legacy 'Planned Sprays' → <SprayProgramPlanner /> (mount unchanged)")

// Workspace alias key renamed in legacy branch.
assert(/'Planned Sprays':\s*'Spray Calendar'/.test(SP),
  "legacy ALIASES maps 'Planned Sprays' → 'Spray Calendar' (S.6b alias rename)")
assert(!/'Programs':\s*'Spray Calendar'/.test(SP),
  "legacy ALIASES no longer maps 'Programs' (S.6b removed)")

// ── Workspace quick action ──────────────────────────────────────────
section('SprayWorkspace — quick action uses "Planned Sprays"')

assert(/<button[\s\S]{0,400}onClick=\{\(\) => go\('Planned Sprays'\)\}[\s\S]{0,200}>\s*\n?\s*Planned Sprays/.test(WS),
  'Workspace quick-action button labeled "Planned Sprays" + routes to go(\'Planned Sprays\')')

assert(!/>\s*Spray Programs\s*</.test(WS),
  'Workspace quick action no longer labeled "Spray Programs"')
assert(!/go\('Programs'\)/.test(WS),
  'Workspace no longer calls go(\'Programs\')')

// ── BuildSpraySheet — Save / Load button labels ─────────────────────
section('BuildSpraySheet — "Save as Planned Spray" + "Load Planned Spray" buttons + tooltips')

assert(/<button[\s\S]{0,400}className=\{styles\.naSaveAsProgramBtn\}[\s\S]{0,400}>\s*Save as Planned Spray\s*<\/button>/.test(BUILD),
  'Save button labeled "Save as Planned Spray"')
assert(/<button[\s\S]{0,400}className=\{styles\.naLoadProgramBtn\}[\s\S]{0,400}>\s*Load Planned Spray\s*<\/button>/.test(BUILD),
  'Load button labeled "Load Planned Spray"')

assert(/title=\{!canEditSprays\s*\n?\s*\?\s*'Spray edit permission required'\s*\n?\s*:\s*'Save the current draft as a planned spray[^']+'\}/.test(BUILD),
  'Save tooltip uses "planned spray" framing (S.6b)')
assert(/title=\{!canEditSprays\s*\n?\s*\?\s*'Spray edit permission required'\s*\n?\s*:\s*'Load a planned spray into the builder[^']+'\}/.test(BUILD),
  'Load tooltip uses "planned spray" framing (S.6b)')

// Negative pins — old labels are gone from user-facing surfaces.
const BUILD_CODE = stripComments(BUILD)
assert(!/>\s*Save as Program\s*</.test(BUILD_CODE),
  'no user-facing "Save as Program" button text remains')
assert(!/>\s*Load Program\s*</.test(BUILD_CODE),
  'no user-facing "Load Program" button text remains')
// Tooltip negatives — these strings appeared in title= attrs before S.6b.
assert(!/'Save the current draft as a reusable Spray Program template/.test(BUILD),
  'no user-facing "Save the current draft as a reusable Spray Program template" tooltip remains')
assert(!/'Load a saved Spray Program into the builder/.test(BUILD),
  'no user-facing "Load a saved Spray Program into the builder" tooltip remains')

// ── Save modal ──────────────────────────────────────────────────────
section('SaveAsProgramModal — title / fields / toasts / aria-label')

assert(/aria-label="Save spray sheet as planned spray"/.test(SAVE),
  'modal aria-label = "Save spray sheet as planned spray"')
assert(/<h2 className=\{styles\.modalTitle\}>Save as Planned Spray<\/h2>/.test(SAVE),
  'modal title = "Save as Planned Spray"')
assert(/<h3 className=\{styles\.modalSectionTitle\}>Planned spray details<\/h3>/.test(SAVE),
  'section title = "Planned spray details"')
assert(/<span>Planned spray name<\/span>/.test(SAVE),
  'name field label = "Planned spray name"')
assert(/\{busy \? 'Saving…' : 'Save as Planned Spray'\}/.test(SAVE),
  'primary action label = "Save as Planned Spray"')

assert(/toast\.error\('Planned spray name is required\.'\)/.test(SAVE),
  'name-required toast uses "planned spray" copy')
assert(/toast\.info\('Add at least one product before saving as a planned spray\.'\)/.test(SAVE),
  'no-products toast uses "planned spray" copy')
assert(/toast\.success\(`Saved "\$\{name\}" as a planned spray/.test(SAVE),
  'success toast uses "planned spray" copy')
assert(/toast\.error\(`Save planned spray failed:/.test(SAVE),
  'error toast uses "planned spray" copy')

// Hint text in the modal footer.
assert(/Saving creates a separate planned spray you can review or load later from the Planned Sprays tab\./.test(SAVE),
  'modal hint text uses "planned spray" + "Planned Sprays tab" framing')

// Negative pins — old user-facing strings are gone.
assert(!/<h2[^>]*>Save as Spray Program</.test(SAVE),
  'no user-facing "Save as Spray Program" title remains')
assert(!/<span>Program name<\/span>/.test(SAVE),
  'no user-facing "Program name" label remains')
assert(!/toast\.error\('Program name is required/.test(SAVE),
  'no user-facing "Program name is required" toast remains')
assert(!/toast\.success\(`Saved "\$\{name\}" as a spray program/.test(SAVE),
  'no user-facing "Saved … as a spray program" toast remains')

// Internals preserved.
assert(/createSprayProgram\(/.test(SAVE),
  'save modal still calls createSprayProgram() (internal contract unchanged)')
assert(/createSprayProgramItem\(/.test(SAVE),
  'save modal still calls createSprayProgramItem() (internal contract unchanged)')
assert(/source:\s*['"]spray-builder['"]/.test(SAVE),
  "save modal still tags source: 'spray-builder' (S.5b.2 invariant)")

// ── Load modal ──────────────────────────────────────────────────────
section('LoadProgramModal — title / subtitle / search / preview / toasts')

assert(/aria-label="Load saved planned spray"/.test(LOAD),
  'modal aria-label = "Load saved planned spray"')
assert(/<h2 className=\{styles\.modalTitle\}>Load Planned Spray<\/h2>/.test(LOAD),
  'modal title = "Load Planned Spray"')
assert(/Reload a saved planned spray into the builder\. Planned sprays are templates/.test(LOAD),
  'modal subtitle uses "planned spray" framing')

assert(/placeholder="Search planned sprays by name or description…"/.test(LOAD),
  'search input placeholder uses "planned sprays"')
assert(/aria-label="Search saved planned sprays"/.test(LOAD),
  'search input aria-label uses "planned sprays"')

assert(/No saved planned sprays match the current filters\./.test(LOAD),
  'empty-state copy uses "planned sprays"')
assert(/Select a planned spray on the left to preview its product rows\./.test(LOAD),
  'preview empty uses "planned spray"')
assert(/Loading planned spray rows…/.test(LOAD),
  'preview loading uses "planned spray"')
assert(/This planned spray has no product rows\./.test(LOAD),
  'preview no-rows uses "planned spray"')

assert(/toast\.info\('This planned spray has no product rows to load\.'\)/.test(LOAD),
  'no-rows toast uses "planned spray"')

assert(/title="Add the planned spray's rows to the current draft \(keeps existing rows\)"/.test(LOAD),
  'append-rows tooltip uses "planned spray"')

// Negative pins — old user-facing strings gone.
assert(!/<h2[^>]*>Load Spray Program</.test(LOAD),
  'no user-facing "Load Spray Program" title remains')
assert(!/aria-label="Load saved spray program"/.test(LOAD),
  'no user-facing "Load saved spray program" aria-label remains')
assert(!/placeholder="Search programs by name/.test(LOAD),
  'no user-facing "Search programs by name" placeholder remains')

// Internals preserved.
assert(/listSprayProgramItems\(/.test(LOAD),
  'load modal still calls listSprayProgramItems() (internal contract unchanged)')
assert(/useSprayPrograms\(\)/.test(LOAD),
  'load modal still reads via useSprayPrograms() (store hook unchanged)')

// ── Planner page header ─────────────────────────────────────────────
section('SprayProgramPlanner — header / CTA / count label')

assert(/<WorkspaceSection\s+title="Planned Sprays"/.test(PLANNER),
  'WorkspaceSection title = "Planned Sprays"')
assert(/subtitle="Plan upcoming sprays\. Planned sprays hold intent only/.test(PLANNER),
  'WorkspaceSection subtitle uses "planned sprays" framing')

assert(/title="No planned sprays yet\."/.test(PLANNER),
  'empty-state title = "No planned sprays yet."')
assert(/description="Create a planned spray to lay out future applications\."/.test(PLANNER),
  'empty-state description uses "planned spray"')
assert(/>\s*\+ Create planned spray\s*</.test(PLANNER),
  'create CTA = "+ Create planned spray"')

assert(/\{programs\.length\} planned spray\{programs\.length !== 1 \? 's' : ''\}/.test(PLANNER),
  'count label uses "planned spray" / "planned sprays"')

assert(/title="New planned spray"/.test(PLANNER),
  'new-program form title = "New planned spray"')
assert(/Archive "\$\{selected\.name\}"\? Planned sprays can be reactivated later\./.test(PLANNER),
  'archive confirm uses "Planned sprays can be reactivated"')
assert(/title="Select a planned spray"/.test(PLANNER),
  'select-state title = "Select a planned spray"')
assert(/title="Planned sprays can be reactivated later\."/.test(PLANNER),
  'archived hint tooltip = "Planned sprays can be reactivated later."')
assert(/Planned spray name <span/.test(PLANNER),
  'form name field label = "Planned spray name"')

// Negative pins — old user-facing prominent strings gone.
assert(!/title="Spray Program Planner"/.test(PLANNER),
  'no user-facing "Spray Program Planner" header remains')
assert(!/title="No spray programs yet/.test(PLANNER),
  'no user-facing "No spray programs yet." empty-state remains')
assert(!/>\s*\+ Create program\s*</.test(PLANNER),
  'no user-facing "+ Create program" CTA remains')

// Internals preserved.
assert(/useSprayPrograms\(\)/.test(PLANNER),
  'planner still reads via useSprayPrograms()')

// ── Files NOT touched (scope guards) ────────────────────────────────
section('Scope guards — only spray pages + reportBuilder untouched')

// Store files NOT renamed.
assert(/from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(WS),
  'Workspace still imports from sprayPrograms/sprayProgramStore (file rename avoided)')
assert(/from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(LOAD),
  'Load modal still imports from sprayPrograms/sprayProgramStore (file rename avoided)')
assert(/from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(SAVE),
  'Save modal still imports from sprayPrograms/sprayProgramStore (file rename avoided)')

// Component file names + imports unchanged.
assert(/import SaveAsProgramModal from '\.\/SaveAsProgramModal'/.test(BUILD),
  'BuildSpraySheet still imports SaveAsProgramModal by file name (component file rename avoided)')
assert(/import LoadProgramModal from '\.\/LoadProgramModal'/.test(BUILD),
  'BuildSpraySheet still imports LoadProgramModal by file name (component file rename avoided)')

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.6b'),   'DAB carries no Phase S.6b edits')
assert(!KIOSK.includes('Phase S.6b'), 'kiosk carries no Phase S.6b edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
