// Phase S.7a — Edit completed sprays from calendar workspace smoke.
//
//   node scripts/smoke-spray-calendar-edit.mjs
//
// Pins the calendar-workspace edit affordance:
//   • SprayCalendarWorkspace imports EditSprayRecordModal — no new
//     modal forked; same S.5a.1 component as Records.
//   • Imports useAuth + derives canEditSprays for UX gating.
//   • Edit button rendered per completed-row only when canEditSprays.
//   • Modal mount wired to editingRecord state.
//   • Modal save closes via onSaved → setEditingRecord(null); modal's
//     own pipeline calls patchSpray + refreshSpraysData, so calendar
//     chips re-render automatically without an extra refresh in the
//     workspace.
//   • EditSprayRecordModal contract preserved: PATCH whitelist via
//     buildPatchPayload; product mix NOT included; snapshot fields
//     NOT included; calls patchSpray then refreshSpraysData; toast
//     uses date from payload.
//   • Records tab edit flow unchanged (regression couple).
//   • Embedded BuildSpraySheet still in place (S.7 couple).
//   • No worker / migration / catalog / commit-pipeline changes.

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

const CW      = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',         'utf8')
const CW_CSS  = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.module.css',  'utf8')
const EDIT    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx',           'utf8')
const RECORDS = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',                   'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                                   'utf8')
const PROG_W   = readFileSync('worker/api/sprayPrograms.js',                            'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                           'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',                      'utf8')
const CW_CODE  = stripComments(CW)
const EDIT_CODE = stripComments(EDIT)

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
  assert(!src.includes('Phase S.7a'),
    `${path} carries no Phase S.7a edits`)
}

// Commit + inventory deduction pipeline unchanged.
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray still exported (commit path unchanged)')
assert(/inventory_item_id/.test(SPRAYS_W),
  'worker createSpray still wires inventory_item_id (deduction unchanged)')

// Snapshot writes unchanged.
assert(/epa_number_snapshot/.test(SPRAYS_W),
  'worker still writes epa_number_snapshot (S.3 snapshot invariant)')
assert(/active_ingredients_snapshot/.test(SPRAYS_W),
  'worker still writes active_ingredients_snapshot (S.3 snapshot invariant)')
assert(/total_cost_snapshot/.test(SPRAYS_W),
  'worker still writes total_cost_snapshot (S.3 snapshot invariant)')

// Permission rule still gates the mutation route.
assert(/canEditSprays/.test(PERM),
  'worker mutation rules still reference canEditSprays')

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// ── SprayCalendarWorkspace imports the existing edit modal ──────────
section('SprayCalendarWorkspace — reuses existing EditSprayRecordModal')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(CW),
  'imports EditSprayRecordModal from local tabs/ (no new modal forked)')
// Same file Records imports, byte-identical contract.
assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports the same EditSprayRecordModal (regression couple)')

// useAuth + canEditSprays gate.
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(CW),
  'imports useAuth from AuthContext (matches sibling Spray pages)')
assert(/const \{ can \} = useAuth\(\)/.test(CW),
  'destructures { can } from useAuth() (matches S.5a.2 pattern)')
assert(/const canEditSprays = can\('canEditSprays'\)/.test(CW),
  'derives canEditSprays from can("canEditSprays")')

// Negative pin — no parallel permission key.
assert(!/can\(['"]canEditSpray['"]\)/.test(CW_CODE),
  'no typo: never checks can("canEditSpray") singular')

// ── Edit state + button rendering ───────────────────────────────────
section('Edit state + button — gated by canEditSprays')

assert(/const \[editingRecord, setEditingRecord\] = useState\(null\)/.test(CW),
  'editingRecord state declared (null when no edit open)')

// Edit affordance rendered conditionally on canEditSprays. Phase S.7b
// switched <button> to <span role="button"> so the outer row-as-<button>
// (sheet opener) doesn't nest a button-in-button (invalid HTML). Click
// still wires setEditingRecord(r) and stops propagation so the sheet
// doesn't also open.
assert(/\{canEditSprays && \(\s*\n?\s*<span[\s\S]{0,500}className=\{styles\.editBtn\}[\s\S]{0,500}setEditingRecord\(r\)/.test(CW),
  'Edit affordance rendered only when canEditSprays; click wires setEditingRecord(r)')
assert(/aria-label=\{`Edit spray record for /.test(CW),
  'Edit affordance has accessible aria-label')

// Affordance text.
assert(/>\s*Edit\s*<\/span>/.test(CW),
  'Edit affordance text reads "Edit"')

// stopPropagation pins — row click opens sheet, Edit click goes to modal.
assert(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); setEditingRecord\(r\) \}\}/.test(CW),
  'Edit click stops propagation so the row-level view-sheet click does not also fire')

// CSS for the button.
assert(/\.editBtn\s*\{/.test(CW_CSS),
  '.editBtn CSS class defined')
assert(/\.completedRowBody\s*\{/.test(CW_CSS),
  '.completedRowBody layout class defined')
assert(/\.completedRowActions\s*\{/.test(CW_CSS),
  '.completedRowActions layout class defined')

// ── Modal mount ─────────────────────────────────────────────────────
section('EditSprayRecordModal mount — only when editingRecord is non-null')

assert(/\{editingRecord && \(\s*\n?\s*<EditSprayRecordModal[\s\S]{0,300}record=\{editingRecord\}[\s\S]{0,300}onClose=\{\(\) => setEditingRecord\(null\)\}[\s\S]{0,300}onSaved=\{\(\) => setEditingRecord\(null\)\}/.test(CW),
  'modal mount: record + onClose + onSaved all wired to editingRecord state')

// ── Completed-row enhancements (weather + times) ────────────────────
section('Completed-row enhancements — start/end time + weather summary')

assert(/r\.startTime \|\| r\.endTime/.test(CW),
  'start/end time row rendered only when either is populated')
assert(/c\.temp != null/.test(CW),
  'weather summary uses != null guard for temp (renders 0°F correctly — S.6a invariant)')
assert(/c\.humidity != null/.test(CW),
  'weather summary uses != null guard for humidity')
assert(/c\.windSpeedMph != null/.test(CW),
  'weather summary reads c.windSpeedMph (correct S.3 field name — S.6a invariant)')
assert(/c\.windDirection/.test(CW),
  'weather summary reads c.windDirection')

// Negative pin — does NOT use the buggy legacy field names.
assert(!/c\.windSpeed\b(?!Mph)/.test(CW),
  'no legacy c.windSpeed field (S.6a regression guard)')
assert(!/c\.temperature\b/.test(CW),
  'no legacy c.temperature field (S.6a regression guard)')

// ── EditSprayRecordModal contract preserved ─────────────────────────
section('EditSprayRecordModal — patch whitelist + snapshot exclusion preserved')

// Modal still calls patchSpray + refreshSpraysData (so calendar refresh
// happens automatically — the workspace itself doesn't need extra calls).
assert(/import \{ patchSpray, refreshSpraysData \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(EDIT),
  'modal still imports patchSpray + refreshSpraysData')
assert(/await patchSpray\(record\.id, payload\)/.test(EDIT),
  'modal still calls patchSpray(record.id, payload)')
assert(/await refreshSpraysData\(\)/.test(EDIT),
  'modal still refreshes spraysStore after patch (so calendar chips update)')
assert(/onSaved\?\.\(\)/.test(EDIT),
  'modal fires onSaved?.() after successful save (no args — caller closes via setEditingRecord(null))')

// Patch payload builder excludes product mix + snapshot fields.
assert(/function buildPatchPayload/.test(EDIT),
  'modal has buildPatchPayload() — single source of payload truth')
// Negative pin — payload never includes products or snapshots.
const payloadBuilder = EDIT_CODE.match(/function buildPatchPayload[\s\S]{0,2500}^\}/m)?.[0] ?? ''
assert(!/products\s*:/.test(payloadBuilder),
  'buildPatchPayload does NOT include `products` (product mix read-only)')
assert(!/epaNumberSnapshot/.test(payloadBuilder),
  'buildPatchPayload does NOT include epaNumberSnapshot (S.3 snapshot invariant)')
assert(!/activeIngredientsSnapshot/.test(payloadBuilder),
  'buildPatchPayload does NOT include activeIngredientsSnapshot')
assert(!/productCostSnapshot/.test(payloadBuilder),
  'buildPatchPayload does NOT include productCostSnapshot')
assert(!/totalCostSnapshot/.test(payloadBuilder),
  'buildPatchPayload does NOT include totalCostSnapshot')

// Worker still has the mutable-record whitelist.
assert(/MUTABLE_RECORD_COLS/.test(SPRAYS_W),
  'worker still enforces MUTABLE_RECORD_COLS whitelist (defense-in-depth)')
// Whitelist does NOT contain product / snapshot columns.
const mutableMatch = SPRAYS_W.match(/MUTABLE_RECORD_COLS\s*=\s*new Set\(\[([\s\S]{0,600}?)\]\)/)
const mutableCols = mutableMatch ? mutableMatch[1] : ''
assert(!/spray_products/.test(mutableCols),
  'worker MUTABLE_RECORD_COLS does NOT include spray_products (product mix immutable)')
assert(!/epa_number_snapshot/.test(mutableCols),
  'worker MUTABLE_RECORD_COLS does NOT include epa_number_snapshot (snapshot invariant)')
assert(!/total_cost_snapshot/.test(mutableCols),
  'worker MUTABLE_RECORD_COLS does NOT include total_cost_snapshot')

// ── Records tab edit flow preserved ─────────────────────────────────
section('SprayRecords edit flow — preserved unchanged')

// Records still uses the same modal + same handler signature.
assert(/<EditSprayRecordModal[\s\S]{0,300}record=\{editing\}[\s\S]{0,300}onClose=\{\(\) => setEditing\(null\)\}[\s\S]{0,300}onSaved=\{\(\) => setEditing\(null\)\}/.test(RECORDS),
  'SprayRecords still mounts EditSprayRecordModal with identical handlers')
assert(/const \[editing, setEditing\]\s+= useState\(null\)/.test(RECORDS),
  'SprayRecords still uses { editing, setEditing } state (regression couple)')

// ── Embedded builder + commit refresh preserved (S.7 couple) ────────
section('Embedded BuildSpraySheet + commit refresh preserved')

assert(/<BuildSpraySheet initialDate=\{selectedDate\} onCommit=\{handleEmbeddedCommit\} \/>/.test(CW),
  'calendar workspace still embeds <BuildSpraySheet initialDate={selectedDate} onCommit={handleEmbeddedCommit} /> (S.7 couple)')
assert(/function handleEmbeddedCommit\(\)/.test(CW),
  'handleEmbeddedCommit() still declared')
assert(/refreshSpraysData\(\)/.test(CW),
  'workspace still calls refreshSpraysData() in commit handler')

// Needs Info still driven by shared helper (S.6a couple).
assert(/needsInfoCount = recs\.filter\(recordNeedsInfo\)/.test(CW),
  'Needs Info badge still driven by shared recordNeedsInfo helper')
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(CW),
  'workspace still imports the shared recordNeedsInfo helper')

// ── Workspace is read-only over the spray write path ────────────────
section('Workspace stays read-only — never calls createSpray / patchSpray itself')

assert(!/createSpray\b|patchSpray\b|deleteSpray\b/.test(CW_CODE),
  'workspace never calls createSpray / patchSpray / deleteSpray (modal + builder own writes)')
assert(!/createSprayProgram\b|updateSprayProgram\b|archiveSprayProgram\b/.test(CW_CODE),
  'workspace never calls program write helpers')

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7a'),   'DAB carries no Phase S.7a edits')
assert(!KIOSK.includes('Phase S.7a'), 'kiosk carries no Phase S.7a edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
