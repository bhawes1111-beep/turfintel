import { readFileSync } from 'fs'

let passed = 0
let failed = 0
function assert(condition, label) {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`) }
}

const migration = readFileSync('worker/migrations/0089_turf_nutrient_samples.sql', 'utf8')
const api = readFileSync('worker/api/nutrientSamples.js', 'utf8')
const worker = readFileSync('worker/index.js', 'utf8')
const permissions = readFileSync('worker/lib/mutationPermissions.js', 'utf8')
const page = readFileSync('src/pages/TurfHealth/TurfHealth.jsx', 'utf8')
const component = readFileSync('src/components/turfHealth/NutrientSamples.jsx', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

console.log('Turf Health nutrient sample contracts')
assert(/CREATE TABLE IF NOT EXISTS turf_nutrient_samples/.test(migration), 'migration creates nutrient sample table')
for (const column of ['sample_type', 'sample_date', 'results_json', 'recommendations_json', 'course_id']) {
  assert(new RegExp(`\\b${column}\\b`).test(migration), `migration includes ${column}`)
}
for (const fn of ['listNutrientSamples', 'getNutrientSample', 'createNutrientSample', 'updateNutrientSample', 'deleteNutrientSample']) {
  assert(new RegExp(`export async function ${fn}`).test(api), `API exports ${fn}`)
}
assert(/SAMPLE_TYPES = new Set\(\['soil', 'tissue'\]\)/.test(api), 'API distinguishes soil and tissue samples')
assert(/rateLbPer1000/.test(api), 'API stores lab recommendation rate')
assert(/pathname === '\/api\/nutrient-samples'/.test(worker), 'collection route is wired')
assert(/\/api\\\/nutrient-samples\\\/\(\[\^\/\]\+\)/.test(worker), 'item route is wired')
assert(/\['\/api\/nutrient-samples',\s+'canEditTurfHealth'\]/.test(permissions), 'mutations require Turf Health permission')
assert(/'Nutrients'/.test(page) && /<NutrientSamples/.test(page), 'Turf Health renders Nutrients workspace')
assert(/Measured Results/.test(component), 'editor separates measured results')
assert(/Lab Recommendations/.test(component), 'editor separates application recommendations')
assert(/NutrientBaselineDashboard/.test(component), 'workspace renders nutrient baseline dashboard')
assert(/useNutrientSamplesData/.test(builder), 'application builder consumes nutrient samples')
assert(/applySampleRecommendation/.test(builder), 'application builder can apply a lab recommendation')
assert(/lb_\$\{String\(recommendation\.nutrient\)\.toLowerCase\(\)\}_nutrient_per_1000sqft/.test(builder), 'recommendation maps to nutrient rate unit')
assert(/computeProductQtyFromRate\(recommendation\.rateLbPer1000/.test(builder), 'recommendation reuses established product quantity math')

// Independent known-answer check for the same agronomic formula used by the builder:
// desired nutrient / guaranteed fraction = product per 1,000 sq ft.
const nutrientRate = 0.2
const areaThousands = 4 * 43.56
const guaranteedFraction = 0.18
const productPounds = nutrientRate * areaThousands / guaranteedFraction
const pricePerPound = 0.52
assert(Math.abs(productPounds - 193.6) < 1e-9, '0.20 lb N/M on 4 acres at 18% N requires 193.6 lb product')
assert(Math.abs(productPounds * pricePerPound - 100.672) < 1e-9, '193.6 lb at $0.52/lb costs $100.67 before display rounding')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
