import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildApplicationNutrientInputs,
} from '../src/utils/turfHealth/nutrientBenchmarks.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [migration, worker, builder, sprayPage, turfHealth, samplesUi, editor, detail] = await Promise.all([
  read('worker/migrations/0094_spray_nutrient_sample_link.sql'),
  read('worker/api/sprays.js'),
  read('src/pages/Spray/tabs/BuildSpraySheet.jsx'),
  read('src/pages/Spray/Spray.jsx'),
  read('src/pages/TurfHealth/TurfHealth.jsx'),
  read('src/components/turfHealth/NutrientSamples.jsx'),
  read('src/pages/Spray/tabs/EditSprayRecordModal.jsx'),
  read('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx'),
])

assert.match(migration, /ADD COLUMN nutrient_sample_id TEXT/)
assert.match(migration, /idx_spray_records_nutrient_sample/)
assert.match(worker, /nutrientSampleId:\s*row\.nutrient_sample_id/)
assert.match(worker, /nutrientSampleId:\s*'nutrient_sample_id'/)
assert.match(worker, /body\.nutrientSampleId \?\? null/)
const sprayInsert = worker.match(/INSERT INTO spray_records \(([\s\S]*?)\) VALUES \(([\s\S]*?)\)/)
assert.ok(sprayInsert, 'spray record insert is present')
assert.equal(sprayInsert[1].split(',').length, sprayInsert[2].split(',').length, 'spray insert columns and bindings stay aligned')
assert.match(builder, /nutrientSampleId:\s*draft\.nutrientSampleId \|\| null/)
assert.match(builder, /initialNutrientSampleId/)
assert.match(sprayPage, /location\.state\?\.nutrientSampleId/)
assert.match(turfHealth, /activeTab: 'New Application'/)
assert.match(samplesUi, />Start Application<\/button>/)
assert.match(editor, /<span>Nutrient sample<\/span>/)
assert.match(detail, /<KV label="Nutrient sample"/)

const inventory = [{
  id: 'fertilizer',
  nutrientSources: [{ nutrient: 'N', form: 'urea_n', percent: '20' }],
}]
const product = { inventoryItemId: 'fertilizer', name: 'Fertilizer', quantityUsed: 10, unit: 'lb' }
const inputs = buildApplicationNutrientInputs([
  { id: 'linked-a', nutrientSampleId: 'sample-a', status: 'completed', date: '2026-08-12', area: 'Greens', products: [product] },
  { id: 'linked-b', nutrientSampleId: 'sample-b', status: 'completed', date: '2026-08-13', area: 'Tees', products: [product] },
  { id: 'legacy', status: 'completed', date: '2026-08-14', area: 'Fairways', products: [product] },
  { id: 'planned-a', nutrientSampleId: 'sample-a', status: 'planned', date: '2026-08-15', area: 'Greens', products: [product] },
], inventory, '2026-08-01', 'sample-a')

assert.deepEqual(inputs.applications.map(application => application.id), ['linked-a'])
assert.equal(inputs.totals.N, 2)
assert.equal(inputs.unlinkedApplications, 1)

console.log('nutrient application link smoke passed')
