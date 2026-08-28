import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildNutrientActionQueue } from '../src/utils/turfHealth/nutrientBenchmarks.js'

const samples = [
  {
    id: 'old-green', sampleType: 'soil', sampleDate: '2026-01-01', location: 'Green 1', nextSampleDate: '2026-02-01',
    recommendations: [{ nutrient: 'N', rateLbPer1000: 1 }], results: [],
  },
  {
    id: 'latest-green', previousSampleId: 'old-green', sampleType: 'soil', sampleDate: '2026-06-01', location: 'Green 1', nextSampleDate: '2026-08-20',
    recommendations: [{ nutrient: 'N', rateLbPer1000: 0.5 }],
    results: [{ nutrient: 'N', value: 8, unit: 'ppm', rating: 'high' }, { nutrient: 'P', value: 2, unit: 'ppm', rating: 'low' }],
  },
  {
    id: 'tee', sampleType: 'soil', sampleDate: '2026-07-01', location: 'Tee 4', nextSampleDate: '',
    recommendations: [{ nutrient: 'K', rateLbPer1000: 0.25 }], results: [],
  },
  {
    id: 'fairway', sampleType: 'tissue', sampleDate: '2026-07-01', location: 'Fairway 7', nextSampleDate: '2026-12-01',
    recommendations: [], results: [],
  },
]
const inventory = [{ id: 'fert', nutrientSources: [{ nutrient: 'N', form: 'urea_n', percent: 10, release: 'quick' }] }]
const records = [
  {
    id: 'green-app', status: 'completed', date: '2026-07-01', nutrientSampleId: 'latest-green',
    areas: [{ name: 'Green 1', acreage: 1 }],
    products: [{ inventoryItemId: 'fert', name: 'Test Fertilizer', quantityUsed: 108.9, unit: 'lb' }],
  },
  {
    id: 'tee-app', status: 'completed', date: '2026-07-15', nutrientSampleId: 'tee',
    areas: [{ name: 'Tee 4', acreage: null }],
    products: [{ inventoryItemId: 'fert', name: 'Test Fertilizer', quantityUsed: 20, unit: 'lb' }],
  },
]

const actions = buildNutrientActionQueue(samples, records, inventory, '2026-08-22')
assert.equal(actions[0].id, 'latest-green:retest', 'Overdue retests should sort first')
assert.ok(!actions.some(action => action.sampleId === 'old-green'), 'Superseded samples must not create stale actions')
assert.ok(actions.some(action => action.id === 'latest-green:recommendation:N' && action.kind === 'application'), 'Partially completed recommendations should create an application action')
assert.ok(actions.some(action => action.id === 'latest-green:result:P' && action.kind === 'review'), 'Unaddressed low lab results should create a review action')
assert.ok(!actions.some(action => action.id === 'latest-green:result:N'), 'A lab rating should not duplicate an existing nutrient recommendation')
assert.ok(actions.some(action => action.id === 'tee:application-data'), 'Missing application acreage should create a data review action')
assert.ok(!actions.some(action => action.id === 'tee:recommendation:K'), 'Recommendation progress should not be stated when linked application data is incomplete')
assert.ok(actions.some(action => action.id === 'tee:schedule' && action.priority === 'setup'), 'Samples without a retest date should request scheduling')
assert.ok(!actions.some(action => action.id === 'fairway:retest'), 'Retests more than 30 days away should stay out of the current queue')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const component = fs.readFileSync(path.join(root, 'src/components/turfHealth/NutrientActionQueue.jsx'), 'utf8')
const samplesComponent = fs.readFileSync(path.join(root, 'src/components/turfHealth/NutrientSamples.jsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/components/turfHealth/NutrientSamples.module.css'), 'utf8')

for (const token of ['Nutrient Action Queue', 'Start Application', 'View Sample', 'Latest samples only']) {
  assert.ok(component.includes(token), `Action queue is missing ${token}`)
}
assert.ok(samplesComponent.includes('<NutrientActionQueue'), 'The action queue is not mounted in Nutrient Samples')
for (const token of ['.actionRow', '.actionPriority', '.actionFilters']) assert.ok(css.includes(token), `Action queue styling is missing ${token}`)

console.log('Nutrient action queue smoke checks passed.')
