import { readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

const utility = readFileSync('src/utils/inventory/nematodeTargets.js', 'utf8')
const editor = readFileSync('src/pages/Inventory/components/NematodeTargetsEditor.jsx', 'utf8')
const manual = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const edit = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const chemicals = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const api = readFileSync('worker/api/inventory.js', 'utf8')
const migration = readFileSync('worker/migrations/0068_inventory_nematode_targets.sql', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

for (const token of [
  'sting',
  'lance',
  'root_knot',
  'stubby_root',
  'ring',
  'spiral',
  'lesion',
  'sheath',
  'dagger',
  'needle',
  'stunt',
  'cyst',
  'pin',
  'seed_leaf_gall',
  'awl',
  'sheathoid',
]) {
  assert(utility.includes(token), `turf nematode option exists: ${token}`)
}

for (const token of ['preventive', 'curative', 'preventive_curative', 'suppression']) {
  assert(utility.includes(token), `nematode control type option exists: ${token}`)
}

assert(/normalizeNematodeTargets/.test(utility) && /formatNematodeTargetSummary/.test(utility),
  'nematode target utility normalizes and summarizes rows')
assert(/TURF_NEMATODE_OPTIONS\.map/.test(editor) && /NEMATODE_CONTROL_TYPES\.map/.test(editor),
  'editor renders nematode and control dropdowns')
assert(/onClick=\{addRow\}/.test(editor) && /Remove/.test(editor),
  'editor can add and remove nematode rows')

for (const [name, source] of [['manual add', manual], ['edit modal', edit]]) {
  assert(/NematodeTargetsEditor/.test(source), `${name} renders nematode target editor`)
  assert(/nematodeTargets:\s*form\.kind === 'chemical' \? normalizeNematodeTargets/.test(source),
    `${name} saves nematode targets only for chemicals`)
  assert(/<legend>Nematode targets<\/legend>/.test(source),
    `${name} labels the optional nematode target section`)
}

assert(/formatNematodeTargetSummary\(c\.nematodeTargets\)/.test(chemicals),
  'chemical cards display nematode target summaries')
assert(/nematodeTargets:\s*'nematode_targets'/.test(api),
  'inventory API accepts nematodeTargets updates')
assert(/nematodeTargets = \[\][\s\S]*?JSON\.parse\(row\.nematode_targets\)/.test(api),
  'inventory API parses nematode_targets JSON')
assert(/apiKey === 'relatedUsage' \|\| apiKey === 'nutrientSources' \|\| apiKey === 'diseaseTargets' \|\| apiKey === 'nematodeTargets'/.test(api),
  'inventory API stringifies nematodeTargets JSON on patch')
assert(/ADD COLUMN nematode_targets TEXT/.test(migration),
  'migration adds nematode_targets column')
assert(/normalizeNematodeTargets\(row\?\.inv\?\.nematodeTargets\)/.test(builder),
  'spray builder reads inventory nematode targets')
assert(/nematodeLabel\(target\.nematode\)/.test(builder),
  'spray builder uses nematode names in target treatment')
