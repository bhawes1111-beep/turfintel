import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApplicationNutrientInputs,
  buildSampleResultComparison,
  findPreviousNutrientSample,
} from '../src/utils/turfHealth/nutrientBenchmarks.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

const samples = [
  { id: 'old', sampleType: 'soil', sampleDate: '2026-01-01', location: 'Green 1', results: [{ nutrient: 'N', value: 10, unit: 'ppm', rating: 'low' }] },
  { id: 'other', sampleType: 'soil', sampleDate: '2026-01-15', location: 'Green 1', results: [{ nutrient: 'N', value: 11, unit: 'ppm' }] },
  { id: 'current', previousSampleId: 'old', sampleType: 'soil', sampleDate: '2026-02-01', location: 'Green 1', results: [{ nutrient: 'N', value: 15, unit: 'ppm', rating: 'adequate' }, { nutrient: 'P', value: 3, unit: '%' }] },
]

assert.equal(findPreviousNutrientSample(samples, samples[2])?.id, 'old', 'A saved follow-up link must win over location matching')
assert.equal(findPreviousNutrientSample(samples, { ...samples[2], id: 'legacy', previousSampleId: '' })?.id, 'other', 'Legacy samples should fall back to the latest matching location and type')
assert.equal(findPreviousNutrientSample(samples, { ...samples[2], id: 'tissue', previousSampleId: '', sampleType: 'tissue' }), null, 'A soil sample must not be inferred as a tissue predecessor')

const comparison = buildSampleResultComparison(samples[0], samples[2])
assert.equal(comparison.length, 1, 'Only matching analytes with matching units should compare')
assert.equal(comparison[0].change, 5)
assert.equal(comparison[0].percentChange, 50)
assert.equal(comparison[0].direction, 'up')

const inventory = [{
  id: 'fertilizer',
  nutrientSources: [{ nutrient: 'N', form: 'urea_n', percent: 10, release: 'quick' }],
}]
const records = [
  { id: 'between', status: 'completed', date: '2026-01-15', nutrientSampleId: 'old', products: [{ inventoryItemId: 'fertilizer', name: 'Test Fertilizer', quantityUsed: 10, unit: 'lb' }] },
  { id: 'end-date', status: 'completed', date: '2026-02-01', nutrientSampleId: 'old', products: [{ inventoryItemId: 'fertilizer', name: 'Test Fertilizer', quantityUsed: 50, unit: 'lb' }] },
  { id: 'wrong-sample', status: 'completed', date: '2026-01-20', nutrientSampleId: 'other', products: [{ inventoryItemId: 'fertilizer', name: 'Test Fertilizer', quantityUsed: 50, unit: 'lb' }] },
  { id: 'planned', status: 'planned', date: '2026-01-20', nutrientSampleId: 'old', products: [{ inventoryItemId: 'fertilizer', name: 'Test Fertilizer', quantityUsed: 50, unit: 'lb' }] },
]
const interval = buildApplicationNutrientInputs(records, inventory, '2026-01-01', 'old', '2026-02-01')
assert.equal(interval.applications.length, 1, 'Only completed, linked applications between sample dates should count')
assert.equal(interval.totals.N, 1, 'Nutrient pounds should use product weight times guaranteed analysis')

const api = read('worker/api/nutrientSamples.js')
const component = read('src/components/turfHealth/NutrientSamples.jsx')
const dashboard = read('src/components/turfHealth/NutrientBaselineDashboard.jsx')
const migration = read('worker/migrations/0095_nutrient_sample_follow_up.sql')

for (const token of ['previousSampleId', 'nextSampleDate', 'validatePreviousSample']) assert.ok(api.includes(token), `API is missing ${token}`)
for (const token of ['Add Follow-Up', 'Retests due', 'Follow-up to', 'Next test date']) assert.ok(component.includes(token), `Sample workflow is missing ${token}`)
for (const token of ['Response since previous sample', 'Applications between tests', 'buildSampleResultComparison']) assert.ok(dashboard.includes(token), `Comparison dashboard is missing ${token}`)
for (const column of ['previous_sample_id', 'next_sample_date']) assert.ok(migration.includes(column), `Migration is missing ${column}`)

console.log('Nutrient follow-up smoke checks passed.')
