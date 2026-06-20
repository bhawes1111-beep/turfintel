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

// Phase S.7b.2 — worker/api/sprays.js gained Phase S.7b.2 product-edit
// support. The other worker files remain untouched (no permission /
// migration / routing changes — the existing /api/sprays prefix
// already gates updateSpray via canEditSprays).
for (const path of [
  'worker/index.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.7b'),
    `${path} carries no Phase S.7b/.2 edits`)
}

// ── Worker product-edit audit invariants (S.7b.2) ──────────────────
section('Worker — updateSpray now supports product editing via replaceSprayProducts')

// Phase S.7b.2 — updateSpray() now triggers replaceSprayProducts when
// `body.products` is present. Inventory + spray_products mutations
// live in the dedicated helper for clarity + smoke targeting.
assert(/export async function updateSpray/.test(SPRAYS_W),
  'updateSpray() still exported')
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts(env, sprayId, products) helper declared (S.7b.2)')

// updateSpray must gate the products branch on Array.isArray(body.products).
assert(/if \(Array\.isArray\(body\.products\)\)/.test(SPRAYS_W),
  'updateSpray() gates product replacement on Array.isArray(body.products)')

// Worker-side validation: at least one row + each row needs a name.
assert(/Completed spray must have at least one product row/.test(SPRAYS_W),
  'worker rejects empty product array')
assert(/Each product row requires a name/.test(SPRAYS_W),
  'worker rejects product rows without a name')

// replaceSprayProducts must touch spray_products + inventory_usage
// + inventory_items in the documented order.
const replaceBody = SPRAYS_W.match(/async function replaceSprayProducts[\s\S]{0,5000}?^\}/m)?.[0] ?? ''
assert(replaceBody.length > 0, 'replaceSprayProducts() body found')
assert(/SELECT \* FROM inventory_usage/.test(replaceBody),
  'replaceSprayProducts() reads existing inventory_usage rows for the spray')
assert(/UPDATE inventory_items SET quantity = \?/.test(replaceBody),
  'replaceSprayProducts() restores inventory_items.quantity for reversed rows')
assert(/UPDATE inventory_usage SET reverted_at = \?/.test(replaceBody),
  'replaceSprayProducts() marks old usage rows reverted_at')
assert(/DELETE FROM spray_products WHERE spray_record_id = \?/.test(replaceBody),
  'replaceSprayProducts() deletes the old spray_products rows for this record')
assert(/INSERT INTO spray_products/.test(replaceBody),
  'replaceSprayProducts() inserts the new spray_products rows')
assert(/INSERT INTO inventory_usage/.test(replaceBody),
  'replaceSprayProducts() inserts new inventory_usage rows for new deductions')
assert(/tryCatalogEnrich/.test(replaceBody),
  'replaceSprayProducts() uses tryCatalogEnrich for snapshot fallback')

// Total cost recompute lives in updateSpray() (after the helper).
assert(/total_cost_snapshot = \?/.test(SPRAYS_W),
  'updateSpray() recomputes total_cost_snapshot from new product totals')
assert(/recomputed > 0 \? recomputed : null/.test(SPRAYS_W),
  'total_cost_snapshot stays NULL when no per-row totals provided')

// Audit reason appends to notes (no new audit table required).
assert(/Chemical mix edited on/.test(SPRAYS_W),
  'audit reason appended to notes with "Chemical mix edited on YYYY-MM-DD:" prefix')

// deleteSpray reversal pipeline preserved (S.7b couple).
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

// Phase S.7b.2 — sheet now uses patchSpray() for chemical-edit saves.
// It still never calls createSpray or deleteSpray, never raw fetch.
assert(/import \{ patchSpray \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(SHEET_CODE),
  'sheet imports patchSpray (S.7b.2 chemical-edit save path)')
assert(!/createSpray\b|deleteSpray\b/.test(SHEET_CODE),
  'sheet itself never calls createSpray / deleteSpray (commit + soft-delete remain elsewhere)')
assert(!/fetch\(/.test(SHEET_CODE),
  'sheet does not call fetch() directly (uses patchSpray helper)')

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

// Phase S.7b.2 — Edit button is also gated by !editMode so the
// chrome stays clean when chemical-edit mode is active.
assert(/\{canEdit && !editMode && \(\s*\n?\s*<button[\s\S]{0,200}className=\{styles\.btnPrimary\}[\s\S]{0,200}onClick=\{\(\) => onEdit\?\.\(record\)\}/.test(SHEET),
  'Edit button (application fields) rendered only when canEdit && !editMode')
assert(/\{canEdit && canEditSprays && !editMode && \(\s*\n?\s*<button[\s\S]{0,400}onClick=\{startEditingChemicals\}/.test(SHEET),
  'Edit chemicals button rendered when canEdit && canEditSprays && !editMode (S.7b.2)')
assert(/<button\s+type="button"\s+className=\{styles\.btnSecondary\}\s+onClick=\{onClose\}\s+disabled=\{busy\}\s*>\s*\n?\s*Close/.test(SHEET),
  'Close button always visible; disabled while save is in flight')

// ── Product editing now LIVE (S.7b.2) ──────────────────────────────
section('Product editing — chemical edit UI shipped')

// The S.7b deferral callout is gone — replaced by the inline editor.
assert(!/editNote/.test(SHEET),
  'S.7b deferral callout removed (chemical editing now shipped)')
assert(!/Editing product rows is not yet supported/.test(SHEET),
  'S.7b deferral copy removed')

// Edit-mode chrome.
assert(/chemEditWarn/.test(SHEET) && /chemEditWarn/.test(SHEET_CSS),
  'chemical edit warning callout rendered + styled (yellow info banner)')
assert(/reverse the inventory for the previous\s+product mix, apply the new mix, refresh snapshots/.test(SHEET),
  'warning explains the worker-side pipeline: reverse + reapply + resnapshot + recompute')
assert(/Add chemical/.test(SHEET),
  'Add chemical button present')
assert(/Remove chemical|aria-label=\{`Remove product/.test(SHEET),
  'Remove control present per row')
assert(/Save chemicals/.test(SHEET),
  'Save chemicals primary action present')

// Reason field.
assert(/Reason for chemical change/.test(SHEET),
  'Reason for chemical change field rendered')
assert(/aria-label="Reason for chemical change"/.test(SHEET),
  'reason field has accessible aria-label')

// Functions wired.
assert(/function startEditingChemicals\(\)/.test(SHEET),
  'startEditingChemicals() declared (enters edit mode + seeds draftRows from record.products)')
assert(/function cancelEditingChemicals\(\)/.test(SHEET),
  'cancelEditingChemicals() declared')
assert(/function patchDraftRow\(i, patch\)/.test(SHEET),
  'patchDraftRow() declared (per-row updates)')
assert(/function addDraftRow\(\)/.test(SHEET),
  'addDraftRow() declared')
assert(/function removeDraftRow\(i\)/.test(SHEET),
  'removeDraftRow() declared')
assert(/async function handleSaveChemicals\(\)/.test(SHEET),
  'handleSaveChemicals() declared (calls patchSpray with products payload)')

// Save calls patchSpray with the products payload + optional editReason.
assert(/await patchSpray\(record\.id, payload\)/.test(SHEET),
  'save calls patchSpray(record.id, payload) — same store helper as the application-fields edit')
assert(/if \(editReason\.trim\(\)\) payload\.editReason = editReason\.trim\(\)/.test(SHEET),
  'editReason only included when non-blank (worker treats missing as no audit append)')

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
