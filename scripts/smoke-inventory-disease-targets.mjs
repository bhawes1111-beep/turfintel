import { readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

const utility = readFileSync('src/utils/inventory/diseaseTargets.js', 'utf8')
const editor = readFileSync('src/pages/Inventory/components/DiseaseTargetsEditor.jsx', 'utf8')
const manual = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const edit = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const chemicals = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const api = readFileSync('worker/api/inventory.js', 'utf8')
const migration = readFileSync('worker/migrations/0067_inventory_disease_targets.sql', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

for (const token of [
  'anthracnose',
  'brown_patch',
  'dollar_spot',
  'fairy_ring',
  'gray_leaf_spot',
  'large_patch',
  'leaf_spot_melting_out',
  'microdochium_patch',
  'nematodes',
  'pink_snow_mold',
  'pythium_blight',
  'pythium_root_rot',
  'spring_dead_spot',
  'summer_patch',
  'take_all_patch',
  'yellow_patch',
]) {
  assert(utility.includes(token), `turf disease option exists: ${token}`)
}

for (const token of ['preventive', 'curative', 'preventive_curative', 'suppression']) {
  assert(utility.includes(token), `control type option exists: ${token}`)
}

assert(/normalizeDiseaseTargets/.test(utility) && /formatDiseaseTargetSummary/.test(utility),
  'disease target utility normalizes and summarizes rows')
assert(/TURF_DISEASE_OPTIONS\.map/.test(editor) && /DISEASE_CONTROL_TYPES\.map/.test(editor),
  'editor renders disease and control dropdowns')
assert(/onClick=\{addRow\}/.test(editor) && /Remove/.test(editor),
  'editor can add and remove disease rows')

for (const [name, source] of [['manual add', manual], ['edit modal', edit]]) {
  assert(/DiseaseTargetsEditor/.test(source), `${name} renders disease target editor`)
  assert(/diseaseTargets:\s*form\.kind === 'chemical' \? normalizeDiseaseTargets/.test(source),
    `${name} saves disease targets only for chemicals`)
  assert(/<legend>Disease targets<\/legend>/.test(source),
    `${name} labels the optional disease target section`)
}

assert(/formatDiseaseTargetSummary\(c\.diseaseTargets\)/.test(chemicals),
  'chemical cards display disease target summaries')
assert(/diseaseTargets:\s*'disease_targets'/.test(api),
  'inventory API accepts diseaseTargets updates')
assert(/diseaseTargets = \[\][\s\S]*?JSON\.parse\(row\.disease_targets\)/.test(api),
  'inventory API parses disease_targets JSON')
assert(/apiKey === 'relatedUsage' \|\| apiKey === 'nutrientSources' \|\| apiKey === 'diseaseTargets'/.test(api),
  'inventory API stringifies diseaseTargets JSON on patch')
assert(/ADD COLUMN disease_targets TEXT/.test(migration),
  'migration adds disease_targets column')
assert(/normalizeDiseaseTargets\(row\?\.inv\?\.diseaseTargets\)/.test(builder),
  'spray builder reads inventory disease targets')
assert(/diseaseLabel\(target\.disease\)/.test(builder),
  'spray builder uses disease names in target treatment')
