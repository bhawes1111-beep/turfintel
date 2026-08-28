import { readFileSync } from 'fs'
import { parseNutrientLabReportText } from '../worker/api/nutrientReportImports.js'

let passed = 0
let failed = 0
function assert(condition, label) {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`) }
}

const migration = readFileSync('worker/migrations/0093_nutrient_report_imports.sql', 'utf8')
const api = readFileSync('worker/api/nutrientReportImports.js', 'utf8')
const worker = readFileSync('worker/index.js', 'utf8')
const permissions = readFileSync('worker/lib/mutationPermissions.js', 'utf8')
const courseScope = readFileSync('worker/lib/courseScope.js', 'utf8')
const attachments = readFileSync('worker/api/attachments.js', 'utf8')
const samplesApi = readFileSync('worker/api/nutrientSamples.js', 'utf8')
const samplesUi = readFileSync('src/components/turfHealth/NutrientSamples.jsx', 'utf8')
const reportsUi = readFileSync('src/components/turfHealth/NutrientLabReports.jsx', 'utf8')

console.log('Nutrient lab report import contracts')
assert(/CREATE TABLE IF NOT EXISTS turf_nutrient_report_imports/.test(migration), 'migration creates report inbox')
assert(/source_attachment_id/.test(migration), 'approved samples retain the source PDF link')
for (const fn of ['listNutrientReportImports', 'uploadNutrientReportImport', 'approveNutrientReportImport', 'deleteNutrientReportImport']) {
  assert(new RegExp(`export async function ${fn}`).test(api), `API exports ${fn}`)
}
assert(/pathname === '\/api\/nutrient-report-imports'/.test(worker), 'collection route is wired')
assert(/nutrientReportApproveMatch/.test(worker), 'approval route is wired')
assert(/'\/api\/nutrient-report-imports','canEditTurfHealth'/.test(permissions), 'mutations require Turf Health permission')
assert(/'\/api\/nutrient-report-imports'/.test(courseScope), 'report reads are course scoped')
assert(/'nutrient_sample_import'/.test(attachments), 'attachment type is whitelisted')
assert(/sourcePdfUrl/.test(samplesApi), 'approved samples expose source PDF')
assert(/<NutrientLabReports/.test(samplesUi), 'nutrient workspace renders lab report inbox')
assert(/Approve Sample/.test(reportsUi), 'review modal includes explicit approval')
assert(!/className=\{styles\.overlay\}[^>]*onClick/.test(reportsUi), 'review modal does not close on backdrop click')

const parsed = parseNutrientLabReportText(`
  Coastal Agronomic Laboratory
  Sample Date: 08/18/2026
  Sample ID: CW-14
  Location: Practice Green
  Sample Depth: 4 inches
  Soil pH: 6.4 pH Adequate
  Phosphorus 42 ppm Adequate
  Potassium 88 ppm Low
  Organic Matter 3.2 % Adequate
  Recommendation: Apply Nitrogen 0.20 lb per 1,000 sq ft
`, 'soil', 'practice-green.pdf')
assert(parsed.sampleDate === '2026-08-18', 'parser normalizes sample date')
assert(parsed.location === 'Practice Green', 'parser extracts location')
assert(parsed.labSampleId === 'CW-14', 'parser extracts lab sample ID')
assert(parsed.depthInches === 4, 'parser extracts soil depth')
assert(parsed.results.some(row => row.nutrient === 'pH' && row.value === 6.4), 'parser extracts soil pH')
assert(parsed.results.some(row => row.nutrient === 'K' && row.value === 88 && row.rating === 'low'), 'parser extracts nutrient rating')
assert(parsed.results.some(row => row.nutrient === 'OM' && row.value === 3.2), 'parser extracts organic matter')
assert(parsed.recommendations.some(row => row.nutrient === 'N' && row.rateLbPer1000 === 0.2), 'parser extracts nutrient recommendation')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
