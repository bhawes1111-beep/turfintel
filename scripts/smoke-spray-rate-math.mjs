// Phase S.7b.6 — Redesigned chemical editor + bidirectional rate math
// smoke.
//
//   node scripts/smoke-spray-rate-math.mjs
//
// Pins:
//   • New shared rate-math module (src/utils/sprays/rateMath.js) with
//     RATE_UNIT_OPTS, TOTAL_USED_UNIT_OPTS, rateToTotalUsed,
//     totalUsedToRate, formatRateLabel, sumAcresFromRecord,
//     normalizeRateUnit, roundDisplay.
//   • Functional tests of the math: oz/acre, lb/acre, gal/acre,
//     oz/1000sqft, gal/1000sqft, fl oz/1000sqft. Both directions
//     reciprocal.
//   • 0 acres → returns 0 (no auto-calc).
//   • sumAcresFromRecord aggregates record.areas[].acreage.
//   • Sheet imports rateMath helpers.
//   • Sheet renders acreage banner (with strong sprayedAcres value)
//     and warning banner when 0.
//   • Draft seed parses "4 oz / acre" string back to rate + rateUnit
//     so existing records edit cleanly.
//   • addDraftRow seeds with rateUnit: 'oz_per_1000sqft' + unit: 'oz' +
//     lastEdited: null + totalUsed: '' (no silent default).
//   • editTotalUsed, editRate, editRateUnit all defined + use
//     sprayedAcres > 0 guard.
//   • Rate Unit dropdown renders RATE_UNIT_OPTS via <option>; Total
//     Used Unit dropdown renders TOTAL_USED_UNIT_OPTS.
//   • Per-row "Area sprayed" is read-only.
//   • Save payload maps totalUsed → quantityUsed + rate via
//     formatRateLabel(r.rate, r.rateUnit) + rateUnit.
//   • Read-only viewer gating preserved.
//   • Worker S.7b.2/5 pipeline + permission unchanged.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MATH     = readFileSync('src/utils/sprays/rateMath.js',                              'utf8')
const SHEET    = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',       'utf8')
const SHEET_CSS = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                                      'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',                         'utf8')

// ── No D1 migration / permission unchanged ────────────────────────
section('No D1 migration / permission unchanged / worker pipeline intact')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  '0054_shift_templates.sql still in the ledger')
assert(migrationFiles.includes('0068_inventory_nematode_targets.sql'),
  'newer inventory/equipment migrations remain in the ledger')

assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays')

// S.7b.2/5 worker pipeline still wired (this is a frontend-only phase).
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() still exported')
assert(/Inventory-linked product rows require quantityUsed greater than 0/.test(SPRAYS_W),
  'S.7b.5 worker quantity validation still in place')

// I.1 — frontend-only phase. Worker file must NOT carry an S.7b.6 marker.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
  'worker/api/sprayPrograms.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.7b.6'),
    `${path} carries no Phase S.7b.6 edits (frontend-only)`)
}

// ── Shared rate-math module exists + exports ──────────────────────
section('rateMath.js — shared module + named exports')

for (const name of [
  'RATE_UNIT_OPTS', 'TOTAL_USED_UNIT_OPTS',
  'rateToTotalUsed', 'totalUsedToRate',
  'formatRateLabel', 'sumAcresFromRecord',
  'normalizeRateUnit', 'roundDisplay',
  'SQFT_PER_ACRE_K', 'rateUnitSpec',
]) {
  assert(new RegExp(`export (function|const) ${name}\\b`).test(MATH),
    `rateMath exports ${name}`)
}

assert(/SQFT_PER_ACRE_K = 43\.56/.test(MATH),
  'SQFT_PER_ACRE_K = 43.56 (1 acre = 43.56 thousand sq ft)')

// Rate unit catalog must include the spec's required units.
for (const value of [
  'oz_per_acre', 'lb_per_acre', 'pt_per_acre', 'qt_per_acre', 'gallons_per_acre',
  'fl_oz_per_1000sqft', 'lb_per_1000sqft',
]) {
  assert(new RegExp(`value: '${value}'`).test(MATH),
    `RATE_UNIT_OPTS includes ${value}`)
}

// Total-used unit options.
for (const value of ['oz', 'fl oz', 'lb', 'pt', 'qt', 'gal']) {
  assert(new RegExp(`value: '${value.replace(' ', ' ')}'`).test(MATH),
    `TOTAL_USED_UNIT_OPTS includes ${value}`)
}

// ── Functional math tests (in-process) ────────────────────────────
section('rateMath functional tests — both directions reciprocal')

const math = await import('../src/utils/sprays/rateMath.js')

// 2 acres × 4 oz/acre = 8 oz total used.
assert(math.rateToTotalUsed(4, 'oz_per_acre', 2) === 8,
  'rateToTotalUsed(4, oz_per_acre, 2 acres) = 8')
assert(math.totalUsedToRate(8, 'oz_per_acre', 2) === 4,
  'totalUsedToRate(8, oz_per_acre, 2 acres) = 4 (inverse)')

// Per-1000sqft math: 1 acre = 43.56 (× 1k sqft); rate 0.5 oz/1ksqft
// over 2 acres = 0.5 × 2 × 43.56 = 43.56 oz.
const perK = math.rateToTotalUsed(0.5, 'oz_per_1000sqft', 2)
assert(Math.abs(perK - 43.56) < 0.001,
  `rateToTotalUsed(0.5, oz_per_1000sqft, 2 acres) ≈ 43.56 (got ${perK})`)
const perKBack = math.totalUsedToRate(43.56, 'oz_per_1000sqft', 2)
assert(Math.abs(perKBack - 0.5) < 0.001,
  `totalUsedToRate(43.56, oz_per_1000sqft, 2 acres) ≈ 0.5 (inverse) (got ${perKBack})`)

// lb / acre.
assert(math.rateToTotalUsed(2, 'lb_per_acre', 5) === 10,
  'rateToTotalUsed(2, lb_per_acre, 5 acres) = 10')

// gal / 1000sqft.
const galPerK = math.rateToTotalUsed(0.1, 'gallons_per_1000sqft', 1)
assert(Math.abs(galPerK - 4.356) < 0.001,
  `rateToTotalUsed(0.1, gallons_per_1000sqft, 1 acre) ≈ 4.356 (got ${galPerK})`)

// 0 acres → 0 (no auto-calc).
assert(math.rateToTotalUsed(4, 'oz_per_acre', 0) === 0,
  'rateToTotalUsed at 0 acres returns 0 (no auto-calc)')
assert(math.totalUsedToRate(8, 'oz_per_acre', 0) === 0,
  'totalUsedToRate at 0 acres returns 0')

// Invalid inputs return 0 cleanly.
assert(math.rateToTotalUsed('', 'oz_per_acre', 2) === 0,
  'empty rate returns 0')
assert(math.totalUsedToRate('abc', 'oz_per_acre', 2) === 0,
  'non-numeric totalUsed returns 0')

// formatRateLabel — matches BuildSpraySheet's commit-time format.
assert(math.formatRateLabel(4, 'oz_per_acre') === '4 oz / acre',
  "formatRateLabel(4, 'oz_per_acre') === '4 oz / acre'")
assert(math.formatRateLabel(0.5, 'oz_per_1000sqft') === '0.5 oz / 1,000 sq ft',
  "formatRateLabel(0.5, 'oz_per_1000sqft') === '0.5 oz / 1,000 sq ft'")
assert(math.formatRateLabel('', 'oz_per_acre') === '',
  'formatRateLabel returns empty when rate is blank')

// sumAcresFromRecord — sums valid areas.
assert(math.sumAcresFromRecord({ areas: [{ acreage: 1.5 }, { acreage: 0.5 }] }) === 2,
  'sumAcresFromRecord sums 1.5 + 0.5 = 2')
assert(math.sumAcresFromRecord({ areas: [{ acreage: 'invalid' }, { acreage: 2 }] }) === 2,
  'sumAcresFromRecord skips invalid acreage values')
assert(math.sumAcresFromRecord({ areas: [] }) === 0,
  'sumAcresFromRecord returns 0 for empty areas')
assert(math.sumAcresFromRecord(null) === 0,
  'sumAcresFromRecord returns 0 for null record')

// normalizeRateUnit fallback.
assert(math.normalizeRateUnit('oz_per_acre') === 'oz_per_acre',
  'normalizeRateUnit passes through known values')
assert(math.normalizeRateUnit('foo') === 'oz_per_1000sqft',
  'normalizeRateUnit collapses unknown to oz per 1,000 sq ft default')
assert(math.defaultRateUnitForInventory(null) === 'oz_per_1000sqft',
  'regular products default to oz per 1,000 sq ft')
assert(math.defaultRateUnitForInventory({ analysis: '18-3-18' }) === 'lb_n_nutrient_per_1000sqft',
  'N-P-K analysis defaults to lb N per 1,000 sq ft')
assert(math.defaultRateUnitForInventory({ analysis: '0-0-26' }) === 'lb_k_nutrient_per_1000sqft',
  'potassium-only analysis defaults to lb K per 1,000 sq ft')
assert(math.defaultRateUnitForInventory({ nutrientSources: [{ nutrient: 'Fe', percent: 6 }] }) === 'lb_fe_nutrient_per_1000sqft',
  'a minor nutrient defaults to its own nutrient rate per 1,000 sq ft')

// ── Sheet imports + wiring ────────────────────────────────────────
section('Sheet — imports rateMath helpers + uses sprayedAcres anchor')

for (const name of ['RATE_UNIT_OPTS', 'TOTAL_USED_UNIT_OPTS', 'rateToTotalUsed', 'totalUsedToRate', 'formatRateLabel', 'sumAcresFromRecord', 'normalizeRateUnit', 'roundDisplay']) {
  assert(new RegExp(`\\b${name}\\b`).test(SHEET),
    `sheet uses ${name}`)
}
assert(/from '\.\.\/\.\.\/\.\.\/utils\/sprays\/rateMath'/.test(SHEET),
  'sheet imports from ../../../utils/sprays/rateMath')
assert(/const sprayedAcres = useMemo\(\(\) => sumAcresFromRecord\(record\), \[record\]\)/.test(SHEET),
  'sheet derives sprayedAcres via useMemo(sumAcresFromRecord(record))')

// Acreage banner rendered (both states).
assert(/chemAcresBanner/.test(SHEET) && /chemAcresBanner\s*\{/.test(SHEET_CSS),
  'chemAcresBanner class rendered + styled (positive state)')
assert(/chemAcresBannerWarn/.test(SHEET) && /chemAcresBannerWarn\s*\{/.test(SHEET_CSS),
  'chemAcresBannerWarn class rendered + styled (zero-acres warning)')
assert(/Total area applied:/.test(SHEET),
  'banner copy: "Total area applied: ..."')
assert(/Area acreage unavailable — rate math cannot auto-calculate/.test(SHEET),
  'zero-acres warning copy: "Area acreage unavailable — rate math cannot auto-calculate"')

// ── Draft seed parsing ────────────────────────────────────────────
section('startEditingChemicals — parses existing rate label back to rate + rateUnit')

assert(/const parsedRateInfo = parseSavedRate\(p\.rate\)/.test(SHEET),
  'seed parses saved rate into numeric rate + rate unit')
assert(/rateUnit:\s+parsedRateInfo\.rateUnit/.test(SHEET),
  'seed applies parsed rate unit with safe default')
assert(/s\.match\(\/\^\(\[\\d\.\]\+\)\\s\*\(\.\*\)\$\/\)/.test(SHEET),
  'seed regex extracts number + tail from rate string')
assert(/RATE_UNIT_OPTS\.find\(o => o\.label\.toLowerCase\(\) === tail\)/.test(SHEET),
  'seed matches parsed tail against RATE_UNIT_OPTS labels')

// addDraftRow seeds new schema.
assert(/function addDraftRow\(\)[\s\S]{0,500}rateUnit: 'oz_per_1000sqft'/.test(SHEET),
  'addDraftRow seeds rateUnit: oz per 1,000 sq ft')
assert(/function addDraftRow\(\)[\s\S]{0,500}totalUsed: ''/.test(SHEET),
  'addDraftRow seeds totalUsed empty')
assert(/function addDraftRow\(\)[\s\S]{0,500}lastEdited: null/.test(SHEET),
  'addDraftRow seeds lastEdited: null')
assert(/function addDraftRow\(\)[\s\S]{0,500}unit: 'oz'/.test(SHEET),
  'addDraftRow seeds total-used unit: oz')

// ── Bidirectional math handlers ───────────────────────────────────
section('editTotalUsed / editRate / editRateUnit — bidirectional + guarded')

assert(/function editTotalUsed\(i, value\)/.test(SHEET),
  'editTotalUsed(i, value) declared')
assert(/function editRate\(i, value\)/.test(SHEET),
  'editRate(i, value) declared')
assert(/function editRateUnit\(i, newUnit\)/.test(SHEET),
  'editRateUnit(i, newUnit) declared')

// All three guard on sprayedAcres > 0.
const editTotalBody = SHEET.match(/function editTotalUsed[\s\S]{0,800}?\n  \}/)?.[0] ?? ''
assert(/if \(sprayedAcres > 0\)/.test(editTotalBody),
  'editTotalUsed guards auto-calc on sprayedAcres > 0')
const editRateBody = SHEET.match(/function editRate\(i, value\)[\s\S]{0,800}?\n  \}/)?.[0] ?? ''
assert(/if \(sprayedAcres > 0\)/.test(editRateBody),
  'editRate guards auto-calc on sprayedAcres > 0')

// lastEdited tracking.
assert(/lastEdited: 'totalUsed'/.test(SHEET),
  'editTotalUsed marks lastEdited as "totalUsed"')
assert(/lastEdited: 'rate'/.test(SHEET),
  'editRate marks lastEdited as "rate"')

// editRateUnit rebases the last-edited side.
const editUnitBody = SHEET.match(/function editRateUnit[\s\S]{0,1200}?\n  \}/)?.[0] ?? ''
assert(/r\.lastEdited === 'rate'/.test(editUnitBody),
  'editRateUnit rebases totalUsed when lastEdited === "rate"')
assert(/r\.lastEdited === 'totalUsed'/.test(editUnitBody),
  'editRateUnit rebases rate when lastEdited === "totalUsed"')

// Math wired through rateMath helpers, not inline.
assert(/totalUsedToRateWithUnit\(num, next\.unit, next\.rateUnit, sprayedAcres, inv\)/.test(SHEET),
  'editTotalUsed delegates through the shared total-used-to-rate math')
assert(/rateToTotalUsedWithUnit\(num, next\.rateUnit, next\.unit, sprayedAcres, inv\)/.test(SHEET),
  'editRate delegates through the shared rate-to-total-used math')

// ── Dropdowns rendered for rate unit + total used unit ────────────
section('Dropdowns — Rate unit + Total unit selects rendered')

assert(/RATE_UNIT_OPTS\.map\(o => \(\s*\n?\s*<option key=\{o\.value\}/.test(SHEET),
  'Rate unit <select> maps RATE_UNIT_OPTS to <option>')
assert(/totalUnitOptionsForRate\(r\.rateUnit\)\.map\(u => \(\s*\n?\s*<option key=\{u\.value\}/.test(SHEET),
  'Total unit <select> maps compatible unit options to <option>')

// Rate unit select wires editRateUnit; total unit wires editTotalUnit so
// whichever side the user last touched stays in sync.
assert(/onChange=\{e => editRateUnit\(i, e\.target\.value\)\}/.test(SHEET),
  'Rate unit select onChange wires editRateUnit')
assert(/onChange=\{e => editTotalUnit\(i, e\.target\.value\)\}/.test(SHEET),
  'Total unit select onChange wires editTotalUnit')

// ── Area sprayed read-only field ──────────────────────────────────
section('Area sprayed — read-only display per row')

assert(/value=\{sprayedAcres > 0 \? `\$\{roundDisplay\(sprayedAcres, 2\)\} ac` : '—'\}/.test(SHEET),
  'Area sprayed input shows rounded acreage or "—"')
assert(/readOnly/.test(SHEET),
  'Area sprayed input is readOnly')
assert(/\.chemReadOnly\s*\{/.test(SHEET_CSS),
  '.chemReadOnly class styled (visually distinct from editable inputs)')

// ── Card layout sections ──────────────────────────────────────────
section('Card layout — top / calculation / status sections')

for (const cls of ['chemEditCard', 'chemTopRow', 'chemTopField', 'chemTopFieldNarrow', 'chemCalcRow', 'chemCalcField', 'chemStatusRow']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(SHEET_CSS),
    `.${cls} CSS class defined`)
  assert(new RegExp(`styles\\.${cls}`).test(SHEET),
    `styles.${cls} used in JSX`)
}

// ── Save payload mapping ──────────────────────────────────────────
section('Save payload — totalUsed → quantityUsed; rate → formatRateLabel')

assert(/const normalized = quantityForInventory\(r, inv\)/.test(SHEET) &&
  /const quantityUsed = r\.totalUsed === '' \|\| r\.totalUsed == null[\s\S]*?\? null[\s\S]*?: normalized\.quantityUsed/.test(SHEET),
  'payload quantityUsed comes from normalized totalUsed in inventory units')
assert(/rate:\s+r\.rate === '' \|\| r\.rate == null \? null : formatRateLabel\(r\.rate, r\.rateUnit\)/.test(SHEET),
  'payload rate formatted via formatRateLabel(r.rate, r.rateUnit)')
assert(/rateUnit:\s+r\.rateUnit \?\? null/.test(SHEET),
  'payload includes rateUnit')

// ── Validation toasts use "total used" terminology ────────────────
section('Validation toasts — total used terminology')

assert(/Enter total used or rate for "/.test(SHEET),
  'blank toast: "Enter total used or rate for X"')
assert(/Total used for ".+" must be greater than 0/.test(SHEET),
  'non-positive toast: "Total used for X must be greater than 0"')
assert(/Total used for ".+" must be a number/.test(SHEET),
  'invalid toast: "Total used for X must be a number"')
assert(/Select a rate unit for "/.test(SHEET),
  'missing-rate-unit toast: "Select a rate unit for X"')

// ── Read-only viewer gating preserved ─────────────────────────────
section('Read-only viewer gating preserved (S.5a.2 + S.7b.5)')

assert(/\{canEdit && canEditSprays && !editMode && \(/.test(SHEET),
  'Edit chemicals button still gated by canEdit && canEditSprays && !editMode')

// ── Build Spray commit path untouched ─────────────────────────────
section('Build Spray commit path untouched')

assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray() still exported')

// BuildSpraySheet still uses its own RATE_UNIT_OPTS (no breaking
// refactor in this phase — extraction is opt-in).
const BUILD = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
assert(/RATE_UNIT_OPTS/.test(BUILD),
  'BuildSpraySheet still has its own RATE_UNIT_OPTS (commit path unchanged)')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b.6'),   'DAB carries no Phase S.7b.6 edits')
assert(!KIOSK.includes('Phase S.7b.6'), 'kiosk carries no Phase S.7b.6 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
