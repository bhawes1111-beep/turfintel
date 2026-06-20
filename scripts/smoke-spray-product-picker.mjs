// Phase S.7b.3 — Shared spray product picker smoke.
//
//   node scripts/smoke-spray-product-picker.mjs
//
// Pins the shared picker contract + its integration in both
// BuildSpraySheet (existing rich row) and SprayApplicationSheetModal
// (S.7b.2 chemical editor):
//
//   • New SprayProductPicker component + helpers exist.
//   • useSprayProductOptions filters inventory to the spray-eligible
//     kinds (product / chemical / fertilizer), sorted by name.
//   • mapInventoryItemToProductRow returns
//     {inventoryItemId, productCatalogId, name, type, unit} —
//     single source of truth for row population.
//   • BuildSpraySheet pickInventoryForRow now uses the shared mapper
//     (so commit-time rows carry productCatalogId from the picker).
//   • SprayApplicationSheetModal renders the SprayProductPicker per
//     draft row + warns when a row has no inventoryItemId.
//   • Selecting an item resets per-row snapshots so the S.7b.2
//     worker re-enriches them on save.
//   • Read-only viewers still see no edit controls.
//   • Worker S.7b.2 contract intact (no worker changes this phase).

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const PICKER     = readFileSync('src/pages/Spray/tabs/SprayProductPicker.jsx',             'utf8')
const BUILD      = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',                'utf8')
const SHEET      = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',     'utf8')
const SHEET_CSS  = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const CW         = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',         'utf8')
const SPRAYS_W   = readFileSync('worker/api/sprays.js',                                    'utf8')
const PERM       = readFileSync('worker/lib/mutationPermissions.js',                       'utf8')

// ── No D1 migration / no worker churn ─────────────────────────────
section('No D1 migration / worker S.7b.2 path intact')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// No new Phase S.7b.3 marker in any worker file — this phase is
// frontend-only.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.7b.3'),
    `${path} carries no Phase S.7b.3 edits (frontend-only phase)`)
}

// S.7b.2 worker path still intact.
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() still exported in worker (S.7b.2 path)')
assert(/if \(Array\.isArray\(body\.products\)\)/.test(SPRAYS_W),
  'updateSpray() still gates product replacement on body.products array (S.7b.2)')
assert(/tryCatalogEnrich/.test(SPRAYS_W),
  'tryCatalogEnrich() snapshot fallback still wired (S.7b.2)')

// Permission unchanged.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays')

// ── New SprayProductPicker exists with documented API ─────────────
section('SprayProductPicker — component + helpers exist')

assert(/^export default function SprayProductPicker\(\{[\s\S]{0,400}\}\)/m.test(PICKER),
  'SprayProductPicker is a default-exported React component')

// Helper exports.
assert(/^export function useSprayProductOptions\(\)/m.test(PICKER),
  'useSprayProductOptions() hook exported')
assert(/^export function mapInventoryItemToProductRow\(item\)/m.test(PICKER),
  'mapInventoryItemToProductRow(item) helper exported')

// Picker filters to spray-eligible kinds.
assert(/SPRAY_ELIGIBLE_KINDS = new Set\(\['product', 'chemical', 'fertilizer'\]\)/.test(PICKER),
  'picker filters to spray-eligible kinds: product / chemical / fertilizer')
assert(/SPRAY_ELIGIBLE_KINDS\.has\(p\.kind\)/.test(PICKER),
  'useSprayProductOptions() applies SPRAY_ELIGIBLE_KINDS filter')
assert(/\.sort\(\(a, b\) => \(a\.name \?\? ''\)\.localeCompare\(b\.name \?\? ''\)\)/.test(PICKER),
  'useSprayProductOptions() sorts by name (case-aware locale compare)')

// Mapper returns the canonical row shape.
assert(/inventoryItemId:\s*item\.id/.test(PICKER),
  'mapInventoryItemToProductRow sets inventoryItemId from item.id')
assert(/productCatalogId:\s*item\.productCatalogId/.test(PICKER),
  'mapInventoryItemToProductRow sets productCatalogId from item.productCatalogId')
assert(/name:\s*item\.name/.test(PICKER),
  'mapInventoryItemToProductRow sets name from item.name')
assert(/type:\s*item\.category/.test(PICKER),
  'mapInventoryItemToProductRow sets type from item.category')
assert(/unit:\s*item\.unit \?\? 'oz'/.test(PICKER),
  'mapInventoryItemToProductRow sets unit from item.unit (default oz)')

// Component renders a <select> with the includeBlank guard.
assert(/includeBlank = true/.test(PICKER),
  'picker default includes "— Select product —" option (includeBlank=true)')
assert(/<option value="">— Select product —<\/option>/.test(PICKER),
  'picker renders blank option text "— Select product —"')
assert(/options\.map\(p => \(\s*\n?\s*<option key=\{p\.id\} value=\{p\.id\}>/.test(PICKER),
  'picker maps options to <option key={id} value={id}>')
assert(/p\.quantity != null \? ` \(\$\{p\.quantity\} \$\{p\.unit \?\? ''\}\)`/.test(PICKER),
  'picker option label shows "(qty unit)" when stock is known')

// aria-label required for a11y.
assert(/aria-label=\{ariaLabel\}/.test(PICKER),
  'picker forwards aria-label to the <select>')

// onChange dispatches the full inventory row (or null when cleared).
assert(/onChange\?\.\(null\)/.test(PICKER),
  'picker onChange dispatches null when user picks blank option')
assert(/onChange\?\.\(item\)/.test(PICKER),
  'picker onChange dispatches the full inventory row (so caller can read all fields)')

// ── BuildSpraySheet uses the shared picker helpers ────────────────
section('BuildSpraySheet — uses shared useSprayProductOptions + mapInventoryItemToProductRow')

assert(/import SprayProductPicker, \{\s*\n?\s*useSprayProductOptions,\s*\n?\s*mapInventoryItemToProductRow,\s*\n?\s*\} from '\.\/SprayProductPicker'/.test(BUILD),
  'BuildSpraySheet imports SprayProductPicker + both helpers')

// Old inline productPickerOptions computation gone; uses the hook.
assert(/const productPickerOptions = useSprayProductOptions\(\)/.test(BUILD),
  'productPickerOptions = useSprayProductOptions() (S.7b.3 reuse)')
assert(!/inventoryProducts\s*\n?\s*\.filter\(p => p\.kind === 'product' \|\| p\.kind === 'chemical' \|\| p\.kind === 'fertilizer'\)/.test(BUILD),
  'no inline kind filter remains (single source of truth in picker)')

// pickInventoryForRow now uses the shared mapper.
assert(/function pickInventoryForRow\(rowId, inv\)[\s\S]{0,300}const patch = mapInventoryItemToProductRow\(inv\)[\s\S]{0,100}if \(patch\) setRow\(rowId, patch\)/.test(BUILD),
  'pickInventoryForRow(rowId, inv) delegates to mapInventoryItemToProductRow()')

// BuildSpraySheet's table cell still wires productPickerOptions for
// rich row chrome (intel chips + unit conversion warnings live there).
assert(/productPickerOptions\.find\(p => p\.id === e\.target\.value\)/.test(BUILD),
  'BuildSpraySheet still drives its rich table cell from productPickerOptions (chrome preserved)')

// ── SprayApplicationSheetModal uses the picker in chemical edit ────
section('SprayApplicationSheetModal — picker per draft row + no-inventory warning')

// Phase S.7b.5 — sheet also imports useSprayProductOptions so it can
// look up the live on-hand quantity for each row's picked product.
assert(/import SprayProductPicker, \{\s*\n?\s*mapInventoryItemToProductRow,\s*\n?\s*useSprayProductOptions,\s*\n?\s*\} from '\.\/SprayProductPicker'/.test(SHEET),
  'sheet imports SprayProductPicker + mapInventoryItemToProductRow + useSprayProductOptions (S.7b.5)')

// Picker rendered per draft row.
assert(/<SprayProductPicker\s+value=\{r\.inventoryItemId \?\? ''\}/.test(SHEET),
  'picker bound to r.inventoryItemId for each draft row')
assert(/ariaLabel=\{`Product \$\{i \+ 1\} selection`\}/.test(SHEET),
  'picker carries per-row aria-label')

// Selection wires both ids + name + type + unit + clears stale snapshots.
assert(/const patch = mapInventoryItemToProductRow\(inv\)/.test(SHEET),
  'on select, sheet calls mapInventoryItemToProductRow(inv)')
assert(/epaNumberSnapshot:\s*null/.test(SHEET) && /activeIngredientsSnapshot: null/.test(SHEET) && /productCostSnapshot:\s*null/.test(SHEET),
  'selecting a new product nulls stale per-row snapshots (worker re-enriches via tryCatalogEnrich on save)')

// Blank selection clears both ids.
assert(/patchDraftRow\(i, \{ inventoryItemId: null, productCatalogId: null \}\)/.test(SHEET),
  'clearing the picker resets both inventoryItemId + productCatalogId')

// No-inventory warning per row — now rendered via the rowStatus()
// helper (S.7b.5) instead of an inline conditional, but the same
// copy is still surfaced. .chemNoInventoryWarn class still styled.
assert(/kind === 'no-link'/.test(SHEET),
  'rowStatus emits kind: "no-link" when r.inventoryItemId is falsy (drives the warning)')
assert(/Not linked to inventory — record will save but no inventory deduction/.test(SHEET),
  'warning copy matches the spec ("save but no inventory deduction")')
assert(/\.chemNoInventoryWarn\s*\{/.test(SHEET_CSS),
  '.chemNoInventoryWarn class styled (visible amber)')

// Phase S.7b.6 — Removed the separate "Name override" field in the
// redesign (name auto-fills from the picker; if the user wants a
// different display name they re-pick or re-type product). Name
// still saves via r.name. Validation rejects rows without a name.
assert(/name:\s+String\(r\.name\)\.trim\(\)/.test(SHEET),
  'name still in save payload via r.name.trim()')
assert(/Each product row needs a name/.test(SHEET),
  'name-required validation remains (worker also enforces)')

// ── Save payload contract preserved (S.7b.2 couple) ───────────────
section('Save payload — products include picker fields')

// The sheet payload mapping was already exhaustive in S.7b.2.
// Phase S.7b.6 — rate now formatted via formatRateLabel; quantityUsed
// comes from r.totalUsed (in-editor rename).
for (const field of ['inventoryItemId', 'productCatalogId', 'name', 'type', 'unit']) {
  assert(new RegExp(`${field}:\\s*r\\.${field}|${field}:\\s*String\\(r\\.${field}\\)|${field}:\\s*r\\.${field}\\.trim`).test(SHEET),
    `payload includes ${field}: r.${field} (or equivalent transform)`)
}
assert(/quantityUsed:\s+r\.totalUsed/.test(SHEET),
  'payload maps totalUsed → quantityUsed (worker contract unchanged)')
assert(/rate:\s+r\.rate === '' \|\| r\.rate == null \? null : formatRateLabel\(r\.rate, r\.rateUnit\)/.test(SHEET),
  'payload formats rate as label string via formatRateLabel(r.rate, r.rateUnit)')

// Snapshot fields still passed through (preserved unless picker reset them).
for (const field of ['epaNumberSnapshot', 'activeIngredientsSnapshot', 'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot']) {
  assert(new RegExp(`${field}:\\s*r\\.${field}|${field}:\\s*r\\.${field} == null`).test(SHEET),
    `payload includes ${field}: r.${field} (preserved round-trip)`)
}

// Save still calls patchSpray with editReason gating.
assert(/await patchSpray\(record\.id, payload\)/.test(SHEET),
  'save still calls patchSpray(record.id, payload)')
assert(/if \(editReason\.trim\(\)\) payload\.editReason = editReason\.trim\(\)/.test(SHEET),
  'editReason only included when non-blank')

// ── Read-only viewers still gated out ─────────────────────────────
section('Read-only viewers — no chemical edit controls')

assert(/\{canEdit && canEditSprays && !editMode && \(/.test(SHEET),
  'Edit chemicals button still gated by canEdit && canEditSprays && !editMode')
assert(/canEdit=\{canEditSprays\}/.test(CW),
  'calendar workspace still passes canEdit={canEditSprays}')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b.3'),   'DAB carries no Phase S.7b.3 edits')
assert(!KIOSK.includes('Phase S.7b.3'), 'kiosk carries no Phase S.7b.3 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
