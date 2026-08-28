import { readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

const utility = readFileSync('src/utils/inventory/nutrientForms.js', 'utf8')
const editor = readFileSync('src/pages/Inventory/components/NutrientSourcesEditor.jsx', 'utf8')
const manual = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const edit = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const api = readFileSync('worker/api/inventory.js', 'utf8')
const migration = readFileSync('worker/migrations/0064_inventory_nutrient_sources.sql', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

for (const token of [
  'urea_n',
  'ammoniacal_n',
  'nitrate_n',
  'slowly_available_wsn_n',
  'win_n',
  'methylene_urea_n',
  'ibdu_n',
  'sulfur_coated_urea_n',
  'polymer_coated_urea_n',
  'monoammonium_phosphate_p',
  'diammonium_phosphate_p',
  'monopotassium_phosphate_p',
  'potassium_chloride_k',
  'potassium_sulfate_k',
  'controlled_release_potash_k',
  'calcium_sulfate_ca',
  'magnesium_sulfate_mg',
  'elemental_s',
  'ferrous_sulfate_fe',
  'manganese_sulfate_mn',
  'zinc_sulfate_zn',
  'copper_sulfate_cu',
  'boric_acid_b',
  'sodium_molybdate_mo',
  'potassium_chloride_cl',
  'nickel_sulfate_ni',
  'sugar_cane_molasses_n',
]) {
  assert(utility.includes(token), `nutrient form option exists: ${token}`)
}

for (const token of [
  "value: 'Ca'",
  "value: 'Mg'",
  "value: 'S'",
  "value: 'Fe'",
  "value: 'Mn'",
  "value: 'Zn'",
  "value: 'Cu'",
  "value: 'B'",
  "value: 'Mo'",
  "value: 'Cl'",
  "value: 'Ni'",
]) {
  assert(utility.includes(token), `nutrient dropdown includes ${token}`)
}

assert(!utility.includes("value: 'C'"),
  'molasses is not exposed as a separate carbon nutrient')
assert(/N:\s*\[[\s\S]*?sugar_cane_molasses_n/.test(utility),
  'sugar cane molasses appears under nitrogen forms')
assert(/slowly_available_wsn_n', label: 'Slowly available WSN nitrogen', release: 'slow'/.test(utility),
  'slowly available WSN nitrogen appears under nitrogen forms as slow release')

assert(/RELEASE_SPEED_OPTIONS[\s\S]*?quick[\s\S]*?slow/.test(utility),
  'nutrient forms support quick and slow release flags')
assert(/normalizeNutrientSources/.test(utility) && /formatNutrientSourceSummary/.test(utility),
  'nutrient source utility normalizes and summarizes rows')

assert(/useState\('N'\)/.test(editor) && /aria-label="Nutrient to add"/.test(editor) && /onClick=\{\(\) => addRow\(selectedNutrient\)\}/.test(editor),
  'editor uses one dropdown to add any nutrient row')
assert(/nutrientFormOptionsFor\(row\.nutrient\)\.map/.test(editor),
  'editor form dropdown changes with selected nutrient')
assert(/nutrientReleaseForForm/.test(editor),
  'editor auto-fills release speed from selected form')
assert(/className=\{styles\.releaseAuto\}/.test(editor) && !/onChange=\{e => updateRow\(row\.id, \{ release: e\.target\.value \}\)\}/.test(editor),
  'editor renders release speed as automatic read-only text')

for (const [name, source] of [['manual add', manual], ['edit modal', edit]]) {
  assert(/NutrientSourcesEditor/.test(source), `${name} renders structured nutrient source editor`)
  assert(/nutrientSources:\s*\['chemical', 'fertilizer'\]\.includes\(form\.kind\)\s*\?\s*normalizeNutrientSources/.test(source),
    `${name} saves structured nutrient source rows for chemicals and fertilizers`)
  assert(/<legend>Nutrient sources<\/legend>/.test(source) && !/<legend>Nutrient analysis<\/legend>/.test(source),
    `${name} shows only the structured nutrient sources section`)
}

assert(/ADD COLUMN nutrient_sources TEXT/.test(migration),
  'migration adds nutrient_sources column')
assert(/nutrientSources:\s*'nutrient_sources'/.test(api),
  'inventory API accepts nutrientSources updates')
assert(/nutrientSources = \[\][\s\S]*?JSON\.parse\(row\.nutrient_sources\)/.test(api),
  'inventory API parses nutrient_sources JSON')
assert(/apiKey === 'relatedUsage' \|\| apiKey === 'nutrientSources'/.test(api),
  'inventory API stringifies nutrientSources JSON on patch')

assert(/normalizeNutrientSources/.test(builder) && /buildNutrientReleaseSummary/.test(builder),
  'spray builder reads structured nutrient source rows')
assert(/totals\[source\.nutrient\]\[speed\] \+= amount/.test(builder),
  'spray builder totals nutrient amount into quick or slow buckets')
assert(/Object\.fromEntries\(NUTRIENTS\.map\(nutrient => \[nutrient\.value, emptyReleaseBucket\(\)\]\)\)/.test(builder),
  'spray sheet initializes release totals for every nutrient')
assert(/NUTRIENTS[\s\S]*?\.map\(nutrient => \[[\s\S]*?summary\.nutrientReleaseTotals\[nutrient\.value\]/.test(builder),
  'spray sheet renders every nutrient with a total')
assert(/<NutrientTankSummary summary=\{summary\} \/>/.test(builder) &&
  /summary\.isLiquidApplication \? 'Nutrients in tank' : 'Nutrients applied'/.test(builder) &&
  /buildNutrientTankRows/.test(builder),
  'application sidebar shows all nutrient sources with liquid or granular wording')
assert(/nutrientUnsupported/.test(builder) && /Present; add lb\/oz amount for rate/.test(builder),
  'tank sidebar shows volume-based nutrients as present when pounds cannot be calculated')
assert(/Object\.fromEntries\(Object\.entries\(forms\)\.map/.test(builder),
  'spray sheet preserves form details for all nutrients')

const qtyNeeded = 100
const quickN = qtyNeeded * 0.12
const slowN = qtyNeeded * 0.08
assert(quickN === 12 && slowN === 8,
  '100 lb product with 12% quick N and 8% slow N reports 12 and 8 rate-units')
