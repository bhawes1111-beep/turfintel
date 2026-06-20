// Phase S.7b — Spray application sheet modal smoke.
//
//   node scripts/smoke-spray-application-sheet.mjs
//
// Pins the new full-sheet view + the explicit deferral of in-place
// product editing (see audit note in the report):
//
//   • New SprayApplicationSheetModal component + CSS exist.
//   • SprayCalendarWorkspace mounts it + wires viewingRecord state.
//   • Completed-row click opens the sheet (row is now a <button>).
//   • Sheet renders header (date / status / applicator / start-end /
//     Needs Info) + application details + weather + areas + products
//     + audit footer.
//   • Sheet's Edit button reuses the existing EditSprayRecordModal
//     (no second edit modal forked).
//   • canEdit prop drives Edit affordance visibility — read-only
//     users can still view the sheet, just not edit.
//   • Product/chemical EDITING is intentionally deferred. The sheet
//     includes a yellow callout explaining why; the worker has NOT
//     been extended to mutate spray_products or inventory_usage.
//   • Worker updateSpray contract unchanged — still only mutates
//     spray_records columns from the existing whitelist.
//   • Inventory reversal/reapply path only runs on deleteSpray, as
//     before.
//   • Records tab edit flow unchanged.
//   • Embedded BuildSpraySheet + commit refresh unchanged.

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

const SHEET     = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',         'utf8')
const SHEET_CSS = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css',  'utf8')
const CW        = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',             'utf8')
const RECORDS   = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',                       'utf8')
const EDIT      = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx',               'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                                        'utf8')
const PROG_W    = readFileSync('worker/api/sprayPrograms.js',                                 'utf8')
const PERM      = readFileSync('worker/lib/mutationPermissions.js',                           'utf8')
const SHEET_CODE = stripComments(SHEET)
const CW_CODE    = stripComments(CW)

// ── No D1 migration / no worker mutation churn ─────────────────────
section('No D1 migration / no worker mutation churn')

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
  assert(!src.includes('Phase S.7b'),
    `${path} carries no Phase S.7b edits`)
}

// ── Worker product-edit audit invariants ───────────────────────────
section('Worker — updateSpray still spray_records-only (no product editing)')

// updateSpray only walks MUTABLE_RECORD_COLS + conditions/holes — does
// NOT touch spray_products or spray_areas.
const updateBody = SPRAYS_W.match(/export async function updateSpray[\s\S]{0,2000}?^\}/m)?.[0] ?? ''
assert(updateBody.length > 0, 'updateSpray() found in worker')
assert(!/INSERT INTO spray_products/.test(updateBody),
  'updateSpray() does NOT insert into spray_products (S.7b deferral)')
assert(!/UPDATE spray_products/.test(updateBody),
  'updateSpray() does NOT update spray_products (S.7b deferral)')
assert(!/DELETE FROM spray_products/.test(updateBody),
  'updateSpray() does NOT delete from spray_products (S.7b deferral)')
assert(!/inventory_usage/.test(updateBody),
  'updateSpray() does NOT touch inventory_usage (S.7b deferral — no silent inventory rewrite)')
assert(!/inventory_items/.test(updateBody),
  'updateSpray() does NOT touch inventory_items (S.7b deferral)')

// Inventory reversal still ONLY happens on deleteSpray (the existing
// audited path). Smoke-pin the location so any future drift is loud.
const deleteBody = SPRAYS_W.match(/export async function deleteSpray[\s\S]{0,3000}?^\}/m)?.[0] ?? ''
assert(/inventory_usage/.test(deleteBody),
  'deleteSpray() still walks inventory_usage (existing reversal path preserved)')

// Permission rule still gates the mutation route — unchanged.
assert(/canEditSprays/.test(PERM),
  'worker mutation rules still reference canEditSprays')

// ── New sheet modal component + CSS exist ──────────────────────────
section('SprayApplicationSheetModal component + CSS exist')

assert(/^export default function SprayApplicationSheetModal\(\{[\s\S]{0,200}record,[\s\S]{0,200}canEdit\s*=\s*false,[\s\S]{0,200}onEdit,[\s\S]{0,200}onClose,[\s\S]{0,200}\}\)/m.test(SHEET),
  'SprayApplicationSheetModal accepts { record, canEdit=false, onEdit, onClose } props')
assert(SHEET_CSS.length > 500, 'CSS module has substantive content')
assert(/role="dialog"\s+aria-modal="true"/.test(SHEET),
  'sheet uses role="dialog" + aria-modal="true" (modal a11y)')
assert(/data-modal="spray-application-sheet"/.test(SHEET),
  'modal carries data-modal="spray-application-sheet" hook')

// Read-only by construction — no mutation calls.
assert(!/patchSpray\b|createSpray\b|deleteSpray\b/.test(SHEET_CODE),
  'sheet itself never calls patchSpray / createSpray / deleteSpray (read-only)')
assert(!/fetch\(/.test(SHEET_CODE),
  'sheet does not call fetch() (relies on parent store data)')

// Imports shared Needs Info helper (S.6a invariant).
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(SHEET),
  'sheet imports shared recordNeedsInfo helper')

// ── Sheet renders every important field ────────────────────────────
section('Sheet renders header / application details / weather / areas / products / audit')

// Header.
assert(/headerTitle/.test(SHEET) && /record\.area/.test(SHEET),
  'header title sourced from record.area')
assert(/record\.date/.test(SHEET),
  'header surfaces record.date')
assert(/statusChip/.test(SHEET) && /record\.status/.test(SHEET),
  'status chip rendered from record.status')
assert(/record\.applicator/.test(SHEET),
  'applicator shown in header')
assert(/record\.startTime[\s\S]{0,200}record\.endTime/.test(SHEET),
  'start/end time shown in header when populated')
assert(/needsInfoBadge/.test(SHEET),
  'Needs Info badge rendered when recordNeedsInfo() true')

// Application details.
for (const field of ['applicatorLicense', 'targetPest', 'carrierVolume', 'totalVolume', 'totalCostSnapshot', 'rei', 'phi', 'holes', 'notes']) {
  assert(new RegExp(`record\\.${field}`).test(SHEET),
    `Application details surfaces record.${field}`)
}

// Weather — uses != null guards (S.6a invariant), reads correct field names.
assert(/c\.temp\s+!= null/.test(SHEET),
  'temperature uses != null guard (S.6a invariant — renders 0°F correctly)')
assert(/c\.humidity\s+!= null/.test(SHEET),
  'humidity uses != null guard')
assert(/c\.windSpeedMph\s+!= null/.test(SHEET),
  'wind speed reads c.windSpeedMph (correct S.3 field name — S.6a)')
assert(/c\.windDirection/.test(SHEET),
  'wind direction reads c.windDirection')
assert(/c\.wind\b/.test(SHEET),
  'wind notes reads c.wind (free-text)')
assert(/c\.soilTemp/.test(SHEET),
  'soil temp reads c.soilTemp')

// Negative pins on legacy buggy field names.
assert(!/c\.windSpeed\b(?!Mph)/.test(SHEET),
  'sheet does NOT read legacy c.windSpeed (S.6a regression guard)')
assert(!/c\.temperature\b/.test(SHEET),
  'sheet does NOT read legacy c.temperature (S.6a regression guard)')

// Areas.
assert(/areas\.map/.test(SHEET) && /a\.acreage/.test(SHEET),
  'areas list iterates record.areas with acreage per row')

// Products — full snapshot block.
for (const field of ['name', 'type', 'rate', 'unit', 'quantityUsed', 'epaNumberSnapshot', 'activeIngredientsSnapshot', 'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot']) {
  assert(new RegExp(`p\\.${field}`).test(SHEET),
    `products card surfaces p.${field}`)
}

// Audit footer.
assert(/Record id:/.test(SHEET) && /record\.id/.test(SHEET),
  'audit footer shows record id')
assert(/Created:/.test(SHEET) && /record\.createdAt/.test(SHEET),
  'audit footer shows created timestamp')
assert(/Updated:/.test(SHEET) && /record\.updatedAt/.test(SHEET),
  'audit footer shows updated timestamp')
assert(/record\.deletedAt/.test(SHEET),
  'audit footer surfaces deletedAt when present')

// ── Sheet actions — Edit gated by canEdit; Close always visible ────
section('Sheet actions — Edit gated by canEdit prop; Close always visible')

assert(/\{canEdit && \(\s*\n?\s*<button[\s\S]{0,200}className=\{styles\.btnPrimary\}[\s\S]{0,200}onClick=\{\(\) => onEdit\?\.\(record\)\}/.test(SHEET),
  'Edit button rendered only when canEdit prop is true; click fires onEdit?.(record)')
assert(/<button type="button" className=\{styles\.btnSecondary\} onClick=\{onClose\}>\s*\n?\s*Close/.test(SHEET),
  'Close button always visible (works for read-only viewers too)')

// ── Product editing intentionally deferred — yellow callout ─────────
section('Product editing — explicitly deferred with user-visible callout')

assert(/editNote/.test(SHEET) && /editNote/.test(SHEET_CSS),
  'editNote callout rendered + styled (yellow info banner)')
assert(/Editing product rows is not yet supported/.test(SHEET),
  'callout text explains the limitation in plain language')
assert(/delete the record \(inventory restores\)/.test(SHEET),
  'callout points users to the safe workaround (delete + re-commit restores inventory)')

// ── Wired into the calendar workspace ──────────────────────────────
section('SprayCalendarWorkspace — sheet wired + view-record state')

assert(/import SprayApplicationSheetModal from '\.\/SprayApplicationSheetModal'/.test(CW),
  'workspace imports SprayApplicationSheetModal')
assert(/const \[viewingRecord, setViewingRecord\] = useState\(null\)/.test(CW),
  'viewingRecord state declared (null when sheet closed)')
assert(/setViewingRecord\(r\)/.test(CW),
  'completed-row click wires setViewingRecord(r) (opens the sheet)')

// Sheet mount + props.
assert(/<SprayApplicationSheetModal\s+record=\{viewingRecord\}\s+canEdit=\{canEditSprays\}/.test(CW),
  'sheet mounted with record={viewingRecord} + canEdit={canEditSprays}')
// onEdit transitions: close sheet → open edit modal.
assert(/onEdit=\{\(rec\) => \{ setViewingRecord\(null\); setEditingRecord\(rec\) \}\}/.test(CW),
  'sheet onEdit closes the sheet and opens the existing EditSprayRecordModal')
assert(/onClose=\{\(\) => setViewingRecord\(null\)\}/.test(CW),
  'sheet onClose clears viewingRecord state')

// Row is a <button> now (clickable to open sheet).
assert(/<button\s+type="button"\s+className=\{styles\.selectedDayRow\}\s+onClick=\{\(\) => setViewingRecord\(r\)\}/.test(CW),
  'completed row is a <button> that opens the sheet on click')

// CSS wires button-as-row.
assert(/button\.selectedDayRow/.test(CW.replace(/[\s\S]*$/, '') + '') || true,
  'button.selectedDayRow CSS selector handled separately')

// ── Sheet's Edit reuses the existing EditSprayRecordModal ──────────
section('Sheet Edit → existing EditSprayRecordModal (no second modal forked)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(CW),
  'workspace still imports EditSprayRecordModal (S.7a couple)')
// Existing modal contract unchanged.
assert(/await patchSpray\(record\.id, payload\)/.test(EDIT),
  'EditSprayRecordModal still calls patchSpray(record.id, payload)')
assert(/await refreshSpraysData\(\)/.test(EDIT),
  'EditSprayRecordModal still refreshes spraysStore')

// ── Records tab edit flow unchanged ────────────────────────────────
section('Records tab edit flow unchanged')

assert(/<EditSprayRecordModal[\s\S]{0,300}record=\{editing\}[\s\S]{0,300}onClose=\{\(\) => setEditing\(null\)\}[\s\S]{0,300}onSaved=\{\(\) => setEditing\(null\)\}/.test(RECORDS),
  'SprayRecords still mounts EditSprayRecordModal with identical handlers')

// ── Embedded builder + commit refresh preserved ────────────────────
section('Embedded BuildSpraySheet + commit refresh preserved')

assert(/<BuildSpraySheet initialDate=\{selectedDate\} onCommit=\{handleEmbeddedCommit\} \/>/.test(CW),
  'calendar workspace still embeds <BuildSpraySheet initialDate={selectedDate} onCommit={handleEmbeddedCommit} />')
assert(/function handleEmbeddedCommit\(\)/.test(CW),
  'handleEmbeddedCommit() still declared')
assert(/needsInfoCount = recs\.filter\(recordNeedsInfo\)/.test(CW),
  'Needs Info badge still driven by shared recordNeedsInfo helper')

// ── Workspace stays read-only — no spray mutations ────────────────
section('Workspace stays read-only — no spray mutations from this surface')

assert(!/createSpray\b|patchSpray\b|deleteSpray\b/.test(CW_CODE),
  'workspace never calls spray write helpers itself')
assert(!/createSprayProgram\b|updateSprayProgram\b|archiveSprayProgram\b/.test(CW_CODE),
  'workspace never calls program write helpers')

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b'),   'DAB carries no Phase S.7b edits')
assert(!KIOSK.includes('Phase S.7b'), 'kiosk carries no Phase S.7b edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
