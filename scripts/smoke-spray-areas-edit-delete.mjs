// Phase S.7c — Edit spray areas + delete completed spray smoke.
//
//   node scripts/smoke-spray-areas-edit-delete.mjs
//
// Pins both halves of S.7c:
//
//   Part A — Areas edit:
//     • EditSprayRecordModal renders an editable Sprayed Areas section
//       with add/edit/remove handlers.
//     • Worker updateSpray() accepts body.areas → replaces spray_areas.
//     • replaceSprayAreas() helper exists with validation.
//     • Validation: at least one area, name required, acreage non-
//       negative numeric.
//     • patchSpray refreshes spraysStore when areas were edited.
//     • record.areas hydrates via existing fetchAreasForRecords (S.3
//       invariant).
//     • rateMath.sumAcresFromRecord reads updated areas.
//
//   Part B — Delete:
//     • SprayApplicationSheetModal shows Delete Spray button (gated).
//     • Two-step confirmation modal explains inventory restoration.
//     • deleteSpray store helper called.
//     • refreshInventoryData() fires after delete.
//     • Worker deleteSpray pipeline preserved (existing audited path).
//     • Read-only viewers see no Delete button.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SHEET     = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',     'utf8')
const SHEET_CSS = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const EDIT      = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx',           'utf8')
const SPRAY_CSS = readFileSync('src/pages/Spray/Spray.module.css',                        'utf8')
const STORE     = readFileSync('src/utils/sprays/spraysStore.js',                         'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                                    'utf8')
const PERM      = readFileSync('worker/lib/mutationPermissions.js',                       'utf8')
const RATE_MATH = readFileSync('src/utils/sprays/rateMath.js',                            'utf8')

// ── No D1 migration / permission unchanged ────────────────────────
section('No D1 migration / permission unchanged')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  '0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays')

// Inventory permission rule unchanged (delete reverses inventory but
// goes through deleteSpray which is gated by canEditSprays — the
// inventory mutations are server-side internal, not a separate route).

// ── PART A — Areas edit ──────────────────────────────────────────
section('Part A — EditSprayRecordModal renders Sprayed Areas section')

assert(/Sprayed areas/.test(EDIT),
  'modal renders "Sprayed areas" section heading')
assert(/aria-label=\{`Area \$\{i \+ 1\} name`\}/.test(EDIT),
  'each area row has an accessible area-name input')
assert(/aria-label=\{`Area \$\{i \+ 1\} acreage`\}/.test(EDIT),
  'each area row has an accessible acreage input')

// Add/Remove handlers exist.
assert(/function patchArea\(i, patch\)/.test(EDIT),
  'patchArea(i, patch) declared')
assert(/function addArea\(\)/.test(EDIT),
  'addArea() declared')
assert(/function removeArea\(i\)/.test(EDIT),
  'removeArea(i) declared')

// Buttons wired.
assert(/onClick=\{addArea\}/.test(EDIT),
  '+ Add area button wired to addArea()')
assert(/onClick=\{\(\) => removeArea\(i\)\}/.test(EDIT),
  'per-row Remove button wired to removeArea(i)')

// areasTouched flag.
assert(/areasTouched: true/.test(EDIT),
  'each area mutation flips areasTouched (so PATCH only sends areas when changed)')

// ── Areas validation in modal ────────────────────────────────────
section('Part A — Modal-side validation')

assert(/At least one sprayed area is required/.test(EDIT),
  'validation: "At least one sprayed area is required"')
assert(/Each area row needs a name/.test(EDIT),
  'validation: "Each area row needs a name"')
assert(/Acreage for ".+" must be a number/.test(EDIT),
  'validation: acreage must be a number')
assert(/Acreage for ".+" cannot be negative/.test(EDIT),
  'validation: acreage cannot be negative')

// ── buildPatchPayload sends areas only when touched ──────────────
section('Part A — buildPatchPayload — areas branch')

assert(/if \(formState\.areasTouched && Array\.isArray\(formState\.areas\)\)/.test(EDIT),
  'buildPatchPayload only includes areas when formState.areasTouched')
assert(/payload\.areas = formState\.areas\.map\(a => \(\{\s*\n?\s*name:\s+String\(a\.name \?\? ''\)\.trim\(\),\s*\n?\s*acreage: a\.acreage === '' \|\| a\.acreage == null \? null : Number\(a\.acreage\),\s*\n?\s*\}\)\)/.test(EDIT),
  'areas payload maps { name: trimmed, acreage: null|Number }')

// ── Worker support ───────────────────────────────────────────────
section('Part A — Worker updateSpray accepts body.areas')

assert(/if \(Array\.isArray\(body\.areas\)\)/.test(SPRAYS_W),
  'updateSpray gates area replacement on Array.isArray(body.areas)')
assert(/Completed spray must have at least one area row/.test(SPRAYS_W),
  'worker rejects empty areas array (400)')
assert(/Each area row requires a name/.test(SPRAYS_W),
  'worker rejects area rows without a name')
assert(/Invalid acreage for area/.test(SPRAYS_W),
  'worker rejects non-numeric acreage')
assert(/Acreage for area .+ cannot be negative/.test(SPRAYS_W),
  'worker rejects negative acreage')

assert(/async function replaceSprayAreas\(env, sprayId, areas\)/.test(SPRAYS_W),
  'replaceSprayAreas() helper declared')

const replaceAreasBody = SPRAYS_W.match(/async function replaceSprayAreas[\s\S]{0,1500}?\n^\}/m)?.[0] ?? ''
assert(/DELETE FROM spray_areas WHERE spray_record_id = \?/.test(replaceAreasBody),
  'replaceSprayAreas DELETEs old spray_areas rows for this record')
assert(/INSERT INTO spray_areas \(id, spray_record_id, area_name, acreage\)/.test(replaceAreasBody),
  'replaceSprayAreas INSERTs new spray_areas rows')

// updateSpray properly bumps updated_at + returns hydrated record.
assert(/let areaEditApplied = false/.test(SPRAYS_W),
  'updateSpray tracks areaEditApplied flag')
assert(/sets\.length === 0 && !productEditApplied && !areaEditApplied/.test(SPRAYS_W),
  '"no mutable fields" guard now accounts for areaEditApplied')
assert(/productEditApplied \|\| areaEditApplied/.test(SPRAYS_W),
  'area-only edits still bump updated_at via the productOrAreaEdit branch')
assert(/return getSpray\(env, id\)/.test(SPRAYS_W),
  'updateSpray returns hydrated record via getSpray (areas included)')

// Hydration unchanged.
assert(/fetchAreasForRecords/.test(SPRAYS_W),
  'getSpray still joins spray_areas via fetchAreasForRecords (S.3 invariant)')

// ── Store refresh covers areas ───────────────────────────────────
section('Part A — patchSpray refreshes spraysStore on areas edit')

assert(/if \(Array\.isArray\(updates\?\.products\) \|\| Array\.isArray\(updates\?\.areas\)\) \{\s*\n?\s*refreshSpraysData\(\)\.catch\(/.test(STORE),
  'patchSpray triggers refreshSpraysData() when products OR areas edited (S.7c extension)')

// ── Rate math reads updated areas ────────────────────────────────
section('Part A — rateMath.sumAcresFromRecord uses record.areas')

assert(/sumAcresFromRecord/.test(RATE_MATH) && /record\.areas/.test(RATE_MATH),
  'sumAcresFromRecord iterates record.areas → drives chemical editor acreage banner')

// ── PART B — Delete Spray button ─────────────────────────────────
section('Part B — Sheet renders Delete Spray button (gated)')

assert(/import \{ patchSpray, deleteSpray \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(SHEET),
  'sheet imports deleteSpray from spraysStore')
assert(/import \{ refreshInventoryData \} from '\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore'/.test(SHEET),
  'sheet imports refreshInventoryData (post-delete inventory refresh)')

// Button visibility gate.
assert(/\{canEdit && canEditSprays && !editMode && \(\s*\n?\s*<button[\s\S]{0,400}className=\{styles\.btnDanger\}[\s\S]{0,400}onClick=\{\(\) => setDeleteConfirmOpen\(true\)\}/.test(SHEET),
  'Delete Spray button gated by canEdit && canEditSprays && !editMode; click opens confirmation')
assert(/>\s*Delete Spray\s*<\/button>/.test(SHEET),
  'button text reads "Delete Spray"')
assert(/aria-label="Delete this spray record"/.test(SHEET),
  'Delete Spray button has accessible aria-label')

// Danger button class styled.
assert(/\.btnDanger\s*\{/.test(SHEET_CSS),
  '.btnDanger class styled (red destructive variant)')

// ── Confirmation modal ───────────────────────────────────────────
section('Part B — Confirmation modal — explains inventory restoration')

assert(/const \[deleteConfirmOpen, setDeleteConfirmOpen\] = useState\(false\)/.test(SHEET),
  'deleteConfirmOpen state declared')
assert(/const \[deleteBusy, setDeleteBusy\] = useState\(false\)/.test(SHEET),
  'deleteBusy state declared (prevents double-click)')

assert(/Delete this spray record\?/.test(SHEET),
  'confirmation title: "Delete this spray record?"')
assert(/Inventory used by this spray will be restored/.test(SHEET),
  'confirmation copy explains inventory restoration')
assert(/This action cannot be undone easily/.test(SHEET),
  'confirmation copy warns "cannot be undone easily"')
assert(/role="dialog"\s+aria-modal="true"\s+aria-label="Confirm delete spray"/.test(SHEET),
  'confirmation dialog has proper a11y attributes')

// Confirm button + cancel button.
assert(/onClick=\{handleDeleteSpray\}/.test(SHEET),
  'confirm button wired to handleDeleteSpray')
assert(/Delete spray \+ restore inventory/.test(SHEET),
  'confirm button label: "Delete spray + restore inventory"')

// ── Delete handler behavior ──────────────────────────────────────
section('Part B — handleDeleteSpray pipeline')

assert(/async function handleDeleteSpray\(\)/.test(SHEET),
  'handleDeleteSpray() async handler declared')
assert(/await deleteSpray\(record\.id\)/.test(SHEET),
  'handler awaits deleteSpray(record.id) (existing store helper)')
assert(/refreshInventoryData\(\)\.catch\(/.test(SHEET),
  'handler triggers refreshInventoryData() — restored quantities surface in spray picker')
assert(/Spray on \$\{record\.date\} deleted · inventory restored/.test(SHEET),
  'success toast confirms delete + inventory restoration')
assert(/onClose\?\.\(\)/.test(SHEET),
  'sheet closes on successful delete')

// ── Worker deleteSpray pipeline unchanged ────────────────────────
section('Part B — Worker deleteSpray pipeline preserved')

assert(/export async function deleteSpray\(env, id, request\)/.test(SPRAYS_W),
  'worker deleteSpray() still exported')

const deleteBody = SPRAYS_W.match(/export async function deleteSpray[\s\S]{0,3000}?\n^\}/m)?.[0] ?? ''
assert(/SELECT \* FROM inventory_usage[\s\S]{0,80}WHERE source_id = \? AND reverted_at IS NULL/.test(deleteBody),
  'deleteSpray walks unreverted inventory_usage rows')
assert(/UPDATE inventory_items SET quantity = \?/.test(deleteBody),
  'deleteSpray restores inventory_items.quantity')
assert(/UPDATE inventory_usage SET reverted_at = \?/.test(deleteBody),
  'deleteSpray marks usage rows reverted_at = now')
assert(/SET status = 'deleted'/.test(deleteBody),
  'deleteSpray soft-deletes via status = "deleted"')

// Store helper unchanged.
assert(/export async function deleteSpray\(id\)/.test(STORE),
  'store deleteSpray(id) helper still exported')

// ── Read-only viewer gating ──────────────────────────────────────
section('Read-only viewers — no Delete button reachable')

// Delete button + Edit chemicals button + Edit application button all
// gate on the same canEdit && canEditSprays predicate.
assert(/\{canEdit && canEditSprays && !editMode && \(/.test(SHEET),
  'Delete Spray (and Edit chemicals) gated by canEdit && canEditSprays')

// ── Existing workflows preserved ─────────────────────────────────
section('Existing workflows preserved (regression couples)')

// Build Spray commit path.
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'createSpray() still exported (commit path untouched)')

// Chemical edit path (S.7b.2 — replaceSprayProducts).
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() still exported (chemical-edit path untouched)')

// Chemical editor still in sheet.
assert(/startEditingChemicals/.test(SHEET),
  'sheet still wires Edit chemicals (S.7b.2/3/4/5/6 path preserved)')

// EditSprayRecordModal still hits patchSpray.
assert(/await patchSpray\(record\.id, payload\)/.test(EDIT),
  'EditSprayRecordModal still uses patchSpray (S.5a.1 path preserved)')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7c'),   'DAB carries no Phase S.7c edits')
assert(!KIOSK.includes('Phase S.7c'), 'kiosk carries no Phase S.7c edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
