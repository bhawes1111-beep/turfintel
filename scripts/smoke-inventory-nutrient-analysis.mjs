import { readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

const manual = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const edit = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const wizard = readFileSync('src/components/inventory/ChemicalImportWizard.jsx', 'utf8')
const chemicals = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const fertilizer = readFileSync('src/pages/Inventory/tabs/InventoryFertilizer.jsx', 'utf8')
const api = readFileSync('worker/api/inventory.js', 'utf8')

for (const [name, source] of [
  ['manual add', manual],
  ['edit modal', edit],
  ['PDF review', wizard],
]) {
  assert(
    /\['chemical', 'fertilizer'\]\.includes\(form\.kind\)\s*\?\s*.*form\.analysis/.test(source),
    `${name} saves analysis for chemicals and fertilizers`
  )
  assert(
    /\['chemical', 'fertilizer'\]\.includes\(form\.kind\)\s*\?\s*.*form\.nitrogenSource/.test(source),
    `${name} saves nutrient source for chemicals and fertilizers`
  )
}

for (const [name, source] of [
  ['manual add', manual],
  ['edit modal', edit],
]) {
  assert(/supportsNutrientAnalysis = isChemical \|\| isFertilizer/.test(source),
    `${name} renders nutrient source section for chemicals and fertilizers`)
  assert(/<legend>Nutrient sources<\/legend>/.test(source),
    `${name} labels the single structured section as nutrient sources`)
  assert(!/<legend>Nutrient analysis<\/legend>/.test(source),
    `${name} removes the old lower nutrient analysis section`)
  assert(!/aria-label="Nutrient analysis"/.test(source),
    `${name} removes the old N-P-K text input`)
  assert(!/aria-label="Nutrient source"/.test(source),
    `${name} removes the old free-text nutrient source input`)
}

assert(/Nutrient Analysis/.test(wizard) && /Nutrient Source/.test(wizard),
  'PDF review labels nutrient fields without fertilizer-only wording')

assert(/\(c\.analysis \?\? ''\).*includes\(search\.toLowerCase\(\)\)/s.test(chemicals),
  'chemical search includes analysis')
assert(/\(c\.nitrogenSource \?\? ''\).*includes\(search\.toLowerCase\(\)\)/s.test(chemicals),
  'chemical search includes nutrient source')
assert(/<span className=\{styles\.cardMetaLabel\}>Analysis<\/span>/s.test(chemicals),
  'chemical cards show analysis when present')
assert(/<span className=\{styles\.cardMetaLabel\}>Source<\/span>/s.test(chemicals),
  'chemical cards show nutrient source when present')

assert(/\(f\.nitrogenSource \?\? ''\).*includes\(search\.toLowerCase\(\)\)/s.test(fertilizer),
  'fertilizer search includes nutrient source')
assert(/f\.analysis &&/s.test(fertilizer),
  'fertilizer cards hide blank analysis rows')

assert(/analysis:\s*row\.analysis/.test(api) && /nitrogenSource:\s*row\.nitrogen_source/.test(api),
  'inventory API returns nutrient fields')
assert(/analysis:\s+'analysis'/.test(api) && /nitrogenSource:\s*'nitrogen_source'/.test(api),
  'inventory API allows nutrient fields to be edited')
