import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AGSOURCE_BERMUDAGRASS_TISSUE_BASELINES,
  TIFEAGLE_GUIDANCE_SOURCES,
  TIFEAGLE_NUTRIENT_GUIDANCE,
  benchmarkTissueResult,
  buildApplicationNutrientInputs,
  tissueBaselineProfile,
} from '../src/utils/turfHealth/nutrientBenchmarks.js'

const magnesium = benchmarkTissueResult({ nutrient: 'Mg', value: 0.11, unit: '%' })
assert.equal(magnesium.status, 'low')
assert.equal(magnesium.min, 0.15)
assert.equal(magnesium.max, 0.3)

const potassium = benchmarkTissueResult({ nutrient: 'K', value: 1.9, unit: '%' })
assert.equal(potassium.status, 'adequate')
assert.equal(benchmarkTissueResult({ nutrient: 'K', value: 1.9, unit: 'ppm' }), null)

const agSourceSample = { labName: 'AgSource Laboratories', sampleType: 'tissue' }
assert.equal(tissueBaselineProfile(agSourceSample).key, 'agsource-bermudagrass')
assert.deepEqual(AGSOURCE_BERMUDAGRASS_TISSUE_BASELINES.K, { min: 1, max: 3, unit: '%' })

const agSourcePotassium = benchmarkTissueResult(
  { nutrient: 'K', value: 1.32, unit: '%', rating: 'adequate' },
  agSourceSample,
)
assert.equal(agSourcePotassium.status, 'adequate')
assert.equal(agSourcePotassium.min, 1)
assert.equal(agSourcePotassium.max, 3)
assert.equal(agSourcePotassium.statusSource, 'lab')

const agSourceCalcium = benchmarkTissueResult(
  { nutrient: 'Ca', value: 0.32, unit: '%', rating: 'low' },
  agSourceSample,
)
assert.equal(agSourceCalcium.status, 'low')
assert.equal(agSourceCalcium.min, 0.5)
assert.equal(agSourceCalcium.max, 1)

assert.equal(TIFEAGLE_NUTRIENT_GUIDANCE.length, 5)
assert(TIFEAGLE_NUTRIENT_GUIDANCE.some(item => item.value === '0.10-0.30 lb / 1,000'))
assert(TIFEAGLE_NUTRIENT_GUIDANCE.some(item => item.value === 'At least 1:1 with N'))
assert.equal(TIFEAGLE_GUIDANCE_SOURCES.length, 3)

const inputs = buildApplicationNutrientInputs([
  {
    id: 'completed', status: 'completed', date: '2026-06-20', area: 'Greens',
    products: [{ inventoryItemId: 'dry', name: 'Dry fertilizer', quantityUsed: 160, unit: 'oz' }],
  },
  {
    id: 'planned', status: 'planned', date: '2026-06-21', area: 'Greens',
    products: [{ inventoryItemId: 'dry', name: 'Dry fertilizer', quantityUsed: 10, unit: 'lb' }],
  },
  {
    id: 'liquid', status: 'complete', date: '2026-06-22', area: 'Greens',
    products: [{ inventoryItemId: 'liquid', name: 'Liquid nutrient', quantityUsed: 2, unit: 'gal' }],
  },
], [
  { id: 'dry', nutrientSources: [{ nutrient: 'N', form: 'urea_n', percent: '18' }] },
  { id: 'liquid', nutrientSources: [{ nutrient: 'N', form: 'urea_n', percent: '10' }] },
], '2026-06-12')

assert.equal(inputs.applications.length, 2)
assert.equal(inputs.unquantifiedProducts, 1)
assert.equal(inputs.totals.N, 1.8)

const dashboard = readFileSync(new URL('../src/components/turfHealth/NutrientBaselineDashboard.jsx', import.meta.url), 'utf8')
assert(dashboard.includes('TifEagle Greens Nutrient Check'))
assert(dashboard.includes('benchmarkTissueResult(result, selected)'))
assert(dashboard.includes('This lab\'s entire-growing-season program'))

console.log('nutrient baseline smoke passed')
