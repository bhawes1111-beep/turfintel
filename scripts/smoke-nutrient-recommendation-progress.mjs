import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRecommendationProgress, findNextNutrientSample } from '../src/utils/turfHealth/nutrientBenchmarks.js'

const recommendations = [
  { nutrient: 'N', rateLbPer1000: 0.5, note: 'First split' },
  { nutrient: 'N', rateLbPer1000: 0.1, note: 'Second split' },
  { nutrient: 'K', rateLbPer1000: 0.25 },
  { nutrient: 'P', rateLbPer1000: 0.1 },
  { nutrient: 'S', rateLbPer1000: 0.1 },
]
const applications = [
  { id: 'first', acreage: 2, nutrients: { N: 43.56 } },
  { id: 'second', acreage: 1, nutrients: { N: 4.356, P: 2.178, S: 8.712, Ca: 4.356 } },
  { id: 'missing-area', acreage: 0, nutrients: { Mg: 5 } },
]

const progress = buildRecommendationProgress(recommendations, applications)
const byNutrient = new Map(progress.rows.map(row => [row.nutrient, row]))

assert.equal(byNutrient.get('N').targetRate, 0.6, 'Split recommendations should combine into one nutrient target')
assert.ok(Math.abs(byNutrient.get('N').appliedRate - 0.6) < 1e-9, 'Applied nutrient rate should use pounds divided by treated thousands of square feet')
assert.equal(byNutrient.get('N').status, 'met')
assert.equal(byNutrient.get('N').applicationCount, 2)
assert.deepEqual(byNutrient.get('N').notes, ['First split', 'Second split'])
assert.equal(byNutrient.get('K').status, 'not-started')
assert.equal(byNutrient.get('P').status, 'in-progress')
assert.equal(byNutrient.get('S').status, 'over')
assert.ok(Math.abs(byNutrient.get('S').overRate - 0.1) < 1e-9)
assert.equal(progress.additionalInputs.length, 1)
assert.equal(progress.additionalInputs[0].nutrient, 'Ca')
assert.ok(Math.abs(progress.additionalInputs[0].appliedRate - 0.1) < 1e-9)
assert.equal(progress.unmeasuredApplications, 1)

const sampleChain = [
  { id: 'old', sampleType: 'soil', sampleDate: '2026-01-01', location: 'Green 1' },
  { id: 'nearby', sampleType: 'soil', sampleDate: '2026-01-20', location: 'Green 1' },
  { id: 'linked', previousSampleId: 'old', sampleType: 'soil', sampleDate: '2026-02-01', location: 'Green 2' },
]
assert.equal(findNextNutrientSample(sampleChain, sampleChain[0])?.id, 'linked', 'A direct follow-up link must define the recommendation cutoff')
assert.equal(findNextNutrientSample(sampleChain.filter(sample => sample.id !== 'linked'), sampleChain[0])?.id, 'nearby', 'Legacy samples should use the next matching location and type')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dashboard = fs.readFileSync(path.join(root, 'src/components/turfHealth/NutrientBaselineDashboard.jsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/components/turfHealth/NutrientSamples.module.css'), 'utf8')

for (const token of ['Recommendation Progress', 'Lab targets against completed applications', 'Remaining', 'Over by']) {
  assert.ok(dashboard.includes(token), `Recommendation progress UI is missing ${token}`)
}
for (const token of ['.recommendationProgressRow', '.recommendationTrack', '.recommendationOver']) {
  assert.ok(css.includes(token), `Recommendation progress styling is missing ${token}`)
}

console.log('Nutrient recommendation progress smoke checks passed.')
