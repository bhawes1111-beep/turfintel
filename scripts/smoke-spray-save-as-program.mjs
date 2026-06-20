// Phase S.5b.2 — Save Spray Builder draft as Program smoke.
//
//   node scripts/smoke-spray-save-as-program.mjs
//
// Pins:
//   • New SaveAsProgramModal component exists + signature.
//   • Wired into BuildSpraySheet via a new button + modal mount.
//   • Save flow uses createSprayProgram + createSprayProgramItem
//     (existing — no new endpoint).
//   • Modal validates name + at least-one-product + date format.
//   • Modal previews product rows from the current draft.
//   • Save flow does NOT call createSpray / patchSpray /
//     recordInventoryUsage / createAlert / createCalendarEvent /
//     any product catalog write helper.
//   • Save flow does NOT echo EPA / active-ingredient / cost
//     snapshot fields into the program item payload.
//   • All earlier S.5* regressions hold:
//       - Builder commit pipeline still calls createSpray + inventory.
//       - Draft saved indicator (S.5b.1) still present.
//       - End time + soil temp inputs (S.5b.1) still present.
//       - Wind / conditions notes label (S.5b.1) still present.
//       - Records edit modal (S.5a.1) preserved.
//       - Compliance Packet + Product Usage exports (S.5c.2/3)
//         preserved.

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

const MODAL    = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx',      'utf8')
const BUILD    = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',         'utf8')
const STORE    = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js',     'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',            'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                             'utf8')
const PROG_W   = readFileSync('worker/api/sprayPrograms.js',                      'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                     'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',                'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',                 'utf8')

const MODAL_CODE = stripComments(MODAL)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── SaveAsProgramModal — component shape ────────────────────────────
section('SaveAsProgramModal — component + signature + accessibility')

assert(/export default function SaveAsProgramModal\(\{\s*\n?\s*draft,\s*\n?\s*enrichedRows,\s*\n?\s*onClose,\s*\n?\s*onSaved,\s*\n?\s*\}\)/.test(MODAL),
  'SaveAsProgramModal exported with ({ draft, enrichedRows, onClose, onSaved }) signature')

assert(/role="dialog"/.test(MODAL),
  'modal has role="dialog"')
assert(/aria-modal="true"/.test(MODAL),
  'modal has aria-modal="true"')
assert(/aria-label="Save spray sheet as program"/.test(MODAL),
  'modal has aria-label="Save spray sheet as program"')
assert(/<h2 className=\{styles\.modalTitle\}>Save as Spray Program<\/h2>/.test(MODAL),
  'modal title reads "Save as Spray Program"')

// Subtitle clarifies this is a template, NOT a completed record.
assert(/does not create a spray record or deduct inventory/i.test(MODAL),
  'modal subtitle clarifies "does not create a spray record or deduct inventory"')

// Esc closes (when not busy).
assert(/if \(e\.key === 'Escape' && !busy\) onClose\(\)/.test(MODAL),
  'Escape key closes modal when not saving')

// ── Form fields ─────────────────────────────────────────────────────
section('Form fields — name + label + start + end + targetArea + notes')

for (const field of [
  'name', 'label', 'plannedStartDate', 'plannedEndDate', 'targetArea', 'notes',
]) {
  assert(new RegExp(`setField\\(['"]${field}['"]`).test(MODAL),
    `setField wires field: ${field}`)
}

// Date inputs use native <input type="date">.
assert(/type="date"[\s\S]{0,400}value=\{form\.plannedStartDate\}/.test(MODAL),
  'Planned start date input is type="date" bound to form.plannedStartDate')
assert(/type="date"[\s\S]{0,400}value=\{form\.plannedEndDate\}/.test(MODAL),
  'Planned end date input is type="date" bound to form.plannedEndDate')

// Name field is the autoFocus target.
assert(/autoFocus[\s\S]{0,200}value=\{form\.name\}/.test(MODAL),
  'Program name input gets autoFocus')

// Date defaults seed from the draft.
assert(/plannedStartDate:\s*draft\?\.\s*date \?\? ['"]['"]/.test(MODAL),
  'plannedStartDate seeds from draft.date')
assert(/plannedEndDate:\s*draft\?\.\s*date \?\? ['"]['"]/.test(MODAL),
  'plannedEndDate seeds from draft.date')

// ── Validation rules ────────────────────────────────────────────────
section('Validation — name + at-least-one-product + date format')

const saveMatch = MODAL.match(/async function handleSave\(\)\s*\{[\s\S]*?\n  \}/)
const saveSrc   = saveMatch ? saveMatch[0] : ''
assert(saveSrc.length > 0, 'handleSave body extracted')

// Name required.
assert(/const name = \(form\.name \?\? ['"]['"]\)\.trim\(\)/.test(saveSrc),
  'handleSave reads + trims form.name')
assert(/if \(!name\) \{\s*\n\s*toast\.error\(['"]Program name is required\.['"]/.test(saveSrc),
  'handleSave aborts with toast.error when name is blank')

// At-least-one-product guard.
assert(/if \(!enrichedRows \|\| enrichedRows\.length === 0\)\s*\{[\s\S]{0,400}toast\.info\(['"]Add at least one product before saving as a program\.['"]/.test(saveSrc),
  'handleSave aborts with toast.info when enrichedRows is empty')

// Date format guard — both fields validated against ^\d{4}-\d{2}-\d{2}$.
assert(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(saveSrc),
  'handleSave validates date fields against ^\\d{4}-\\d{2}-\\d{2}$')

// Save button disabled until name + rows are valid (defense-in-depth
// alongside the toast guards).
assert(/disabled=\{busy \|\| !form\.name\.trim\(\) \|\| !enrichedRows \|\| enrichedRows\.length === 0\}/.test(MODAL),
  'Save button is disabled until name + at-least-one-product are satisfied')

// ── Preview content ─────────────────────────────────────────────────
section('Preview — read-only product rows from enrichedRows')

assert(/Product rows \(read-only preview\)/.test(MODAL),
  'preview section header reads "Product rows (read-only preview)"')
assert(/enrichedRows\.map\(\(r, i\) =>/.test(MODAL),
  'preview iterates enrichedRows')
assert(/<strong>\{r\.name \?\? '\(unnamed product\)'\}<\/strong>/.test(MODAL),
  'preview row shows product name with fallback')
assert(/r\.rate &&[\s\S]{0,200}\{r\.rate\} \{r\.rateUnit \?\? ''\}/.test(MODAL),
  'preview row shows rate + rateUnit when present')

// Totals computed from enrichedRows (read-only — no recompute).
assert(/const totals = useMemo/.test(MODAL),
  'totals useMemo derived from enrichedRows')
assert(/totalCost \+= r\.cost/.test(MODAL),
  'totals sums r.cost across rows (read-only)')

// Empty state when no products.
assert(/Add at least one product before saving\./i.test(MODAL),
  'preview empty state surfaces "Add at least one product…"')

// ── Save flow — uses existing program store, no record-side helpers ─
section('Save flow — createSprayProgram + createSprayProgramItem only')

assert(/import \{\s*\n?\s*createSprayProgram,\s*\n?\s*createSprayProgramItem,\s*\n?\s*\} from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(MODAL),
  'modal imports createSprayProgram + createSprayProgramItem from existing store')

assert(/const program = await createSprayProgram\(\{[\s\S]{0,400}name,[\s\S]{0,400}notes:[\s\S]{0,300}status:\s*['"]draft['"]/.test(MODAL),
  'handleSave creates program with name + notes + status: "draft"')
assert(/source:\s*['"]spray-builder['"]/.test(MODAL),
  'created program tags source: "spray-builder" for provenance')

// One item per row.
assert(/for \(let i = 0; i < enrichedRows\.length; i\+\+\)/.test(MODAL),
  'handleSave iterates enrichedRows with index for sortOrder')
assert(/await createSprayProgramItem\(program\.id, \{/.test(MODAL),
  'handleSave calls createSprayProgramItem per row, scoped to the new program.id')

// Per-row item carries the right fields. Accept both `field:` and
// shorthand `field,` (used for variables already in scope, e.g. rateValue).
for (const field of [
  'targetArea',
  'plannedStartDate',
  'plannedEndDate',
  'productName',
  'productCatalogId',
  'inventoryItemId',
  'rateValue',
  'rateUnit',
  'sortOrder',
]) {
  assert(new RegExp(`\\b${field}[:,]`).test(saveSrc),
    `program item payload includes: ${field}`)
}

assert(/status:\s*['"]planned['"]/.test(saveSrc),
  'program item payload includes status: "planned"')

// Negative pins — save flow MUST NOT touch the record-side helpers.
assert(!/\bcreateSpray\b/.test(MODAL_CODE),
  'modal does NOT call createSpray (no completed record creation)')
assert(!/\bpatchSpray\b/.test(MODAL_CODE),
  'modal does NOT call patchSpray (no record mutation)')
assert(!/\brecordInventoryUsage\b/.test(MODAL_CODE),
  'modal does NOT call recordInventoryUsage (no inventory deduction)')
assert(!/\bcreateAlert\b/.test(MODAL_CODE),
  'modal does NOT call createAlert (no REI alerts on save-as-program)')
assert(!/\bcreateCalendarEvent\b/.test(MODAL_CODE),
  'modal does NOT call createCalendarEvent (programs are templates, not events)')
assert(!/createProductCatalog|updateProductCatalog|deleteProductCatalog/.test(MODAL_CODE),
  'modal does NOT call any product catalog write helper')

// Negative pins — save flow MUST NOT echo snapshot fields into the
// program item. Snapshots are completed-record semantics only.
for (const snap of [
  'epaNumberSnapshot',
  'activeIngredientsSnapshot',
  'productCostSnapshot',
  'productCostUnitSnapshot',
  'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(MODAL_CODE),
    `modal does NOT echo ${snap} into the program item payload`)
}

// Success toast names the program.
assert(/Saved "\$\{name\}" as a spray program/.test(saveSrc),
  'success toast names the saved program')

// ── BuildSpraySheet wiring ──────────────────────────────────────────
section('BuildSpraySheet — Save as Program button + modal mount')

assert(/import SaveAsProgramModal from '\.\/SaveAsProgramModal'/.test(BUILD),
  'BuildSpraySheet imports SaveAsProgramModal')

assert(/const \[saveAsProgramOpen, setSaveAsProgramOpen\] = useState\(false\)/.test(BUILD),
  'saveAsProgramOpen state defined via useState(false)')

assert(/<button[\s\S]{0,400}className=\{styles\.naSaveAsProgramBtn\}[\s\S]{0,400}onClick=\{\(\) => setSaveAsProgramOpen\(true\)\}/.test(BUILD),
  'Save as Program button rendered + wires onClick')
assert(/Save as Program/.test(BUILD),
  'button label reads "Save as Program"')
// Phase S.5a.2 extended the disabled rule with `|| !canEditSprays`.
assert(/disabled=\{committing \|\| enrichedRows\.length === 0(?:\s*\|\| !canEditSprays)?\}/.test(BUILD),
  'button disabled when committing or no products in draft (S.5a.2: also when !canEditSprays)')

// Modal mounts behind state.
assert(/\{saveAsProgramOpen && \(\s*\n\s*<SaveAsProgramModal[\s\S]{0,400}draft=\{draft\}[\s\S]{0,400}enrichedRows=\{enrichedRows\}/.test(BUILD),
  'SaveAsProgramModal mounts behind {saveAsProgramOpen && (…)} with draft + enrichedRows props')

// onClose / onSaved both reset the open state — neither clears the draft.
assert(/onClose=\{\(\) => setSaveAsProgramOpen\(false\)\}/.test(BUILD),
  'modal onClose resets saveAsProgramOpen')
assert(/onSaved=\{\(\) => setSaveAsProgramOpen\(false\)\}/.test(BUILD),
  'modal onSaved resets saveAsProgramOpen (does NOT clear draft)')

// CSS class for the button.
assert(/\.naSaveAsProgramBtn\s*\{/.test(CSS),
  'CSS .naSaveAsProgramBtn rule defined')

// ── Builder commit pipeline still wired (regression couple) ────────
section('Builder commit pipeline preserved — record + inventory + alerts')

// The commit path still calls createSpray (records side).
assert(/await createSpray\(payload\)/.test(BUILD),
  'commit pipeline still calls createSpray (regression couple)')
// Inventory deduction still wired.
assert(/recordInventoryUsage\(\{/.test(BUILD),
  'commit pipeline still calls recordInventoryUsage per product (regression couple)')
// REI alert + calendar event still wired.
assert(/createAlert\(/.test(BUILD),
  'commit pipeline still creates REI alert when applicable (regression couple)')
assert(/createCalendarEvent\(/.test(BUILD),
  'commit pipeline still creates calendar event for committed application (regression couple)')

// ── S.5b.1 regressions: draft indicator + end time + soil temp ──────
section('S.5b.1 regressions — draft indicator + end time + soil temp + wind label')

assert(/const \[draftSavedAt, setDraftSavedAt\] = useState\(null\)/.test(BUILD),
  'draft saved indicator state still defined (S.5b.1)')
assert(/<span className=\{styles\.naDraftSavedHint\}/.test(BUILD),
  'draft saved indicator render still present (S.5b.1)')
assert(/<Field label="End time">/.test(BUILD),
  'End time field still present (S.5b.1)')
assert(/<Field label="Soil temperature \(°F\)">/.test(BUILD),
  'Soil temperature field still present (S.5b.1)')
assert(/<Field label="Wind \/ conditions notes">/.test(BUILD),
  'Wind / conditions notes label still present (S.5b.1)')
assert(/endTime:\s*draft\.endTime \|\| null/.test(BUILD),
  'commit payload still includes endTime (S.5b.1)')
assert(/soilTemp:\s*draft\.conditions\.soilTemp/.test(BUILD),
  'commit payload still includes conditions.soilTemp (S.5b.1)')

// ── S.5a.1 + S.5c.* regressions: records edit + exports ─────────────
section('Records surfaces preserved (S.5a.1 + S.5c.* regression couples)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}/.test(RECORDS),
  'Export Compliance Packet button still rendered (S.5c.2)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportUsageBtn\}/.test(RECORDS),
  'Export Product Usage button still rendered (S.5c.3)')
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(RECORDS.includes(dep),
    `S.5c.1 filter input still wired: ${dep}`)
}

// ── Worker / store / catalog scope guards ───────────────────────────
section('Scope guards — no worker / migration / catalog / store edits')

// Worker side unchanged.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.2'),
    `${path} carries no Phase S.5b.2 edits`)
}

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Existing worker spray-program endpoints are still the same ones
// the modal calls (positive regression — confirms no new endpoint).
assert(/^export async function createSprayProgram\b/m.test(PROG_W),
  'worker createSprayProgram still exported (used by modal)')
assert(/^export async function createSprayProgramItem\b/m.test(PROG_W),
  'worker createSprayProgramItem still exported (used by modal)')

// Permissions unchanged — spray-programs gated by canEditSprays.
assert(/\['\/api\/spray-programs',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/spray-programs by canEditSprays")
assert(/\['\/api\/spray-program-items',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/spray-program-items by canEditSprays")

// Spray + program stores untouched by S.5b.2.
const SPRAY_STORE   = readFileSync('src/utils/sprays/spraysStore.js',           'utf8')
assert(!SPRAY_STORE.includes('Phase S.5b.2'),
  'src/utils/sprays/spraysStore.js carries no Phase S.5b.2 edits')
assert(!STORE.includes('Phase S.5b.2'),
  'src/utils/sprayPrograms/sprayProgramStore.js carries no Phase S.5b.2 edits')

// Other spray surfaces untouched by S.5b.2.
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.2'),
    `${path} carries no Phase S.5b.2 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5b.2'),   'DAB carries no Phase S.5b.2 edits')
assert(!KIOSK.includes('Phase S.5b.2'), 'kiosk carries no Phase S.5b.2 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
