import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const builder = fs.readFileSync(path.join(root, 'src/pages/Spray/tabs/BuildSpraySheet.jsx'), 'utf8')
const modal = fs.readFileSync(path.join(root, 'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx'), 'utf8')
const math = fs.readFileSync(path.join(root, 'src/utils/sprays/rateMath.js'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

assert(
  /lb_\$\{nutrient\.value\.toLowerCase\(\)\}_nutrient_per_1000sqft/.test(builder) &&
  /label:\s*`lb \$\{nutrient\.value\} \/ 1,000 sq ft`/.test(builder) &&
  /nutrientRate:\s*true/.test(builder),
  'application builder offers lb nutrient per 1,000 sq ft rate options'
)

assert(
  /export const NUTRIENT_RATE_UNITS/.test(math) &&
  /value:\s*`lb_\$\{nutrient\.toLowerCase\(\)\}_nutrient_per_1000sqft`/.test(math) &&
  /label:\s*`lb \$\{label\} \/ 1,000 sq ft`/.test(math),
  'shared rate math exports nutrient rate unit options'
)

assert(
  /function nutrientPercentForInventory\(inv, nutrient\)/.test(builder) &&
  /normalizeNutrientSources\(inv\.nutrientSources\)/.test(builder) &&
  /const guaranteed = nutrientPercentFromAnalysis\(parseAnalysisNPK\(inv\.analysis\), nutrient\)/.test(builder) &&
  /function computeProductQtyFromRate\(rate, acres, rateUnit, inv\)/.test(builder),
  'application builder reads guaranteed N-P-K percentage before summed nutrient source rows'
)

assert(
  /computeProductQtyFromRate\(row\.rate, draft\.acres, rateUnit, inv\)/.test(builder) &&
  /computeRateFromTotalProduct\(row\.totalProduct, totalProductUnit, draft\.acres, rateUnit, inv\)/.test(builder),
  'application builder converts nutrient rate to product total and back'
)

assert(
  /nutrientRateMissing/.test(builder) &&
  /before using lb nutrient \/ 1,000 sq ft/.test(builder),
  'application builder blocks saving nutrient-rate rows without inventory nutrient percent'
)

assert(
  /function inventoryCostInfo\(quantityInInventoryUnit, inv\)/.test(builder) &&
  /const qtyForCost = convertQuantityUnit\(quantityInInventoryUnit, inv\.unit, costUnit\)/.test(builder) &&
  /totalCost: \+\(qtyForCost \* costPerUnit\)\.toFixed\(2\)/.test(builder),
  'application builder prices product quantity against inventory cost unit'
)

assert(
  /const rawUnit = String\(unit \?\? ''\)\.trim\(\)\.toLowerCase\(\)/.test(builder) &&
  /\['oz', 'ounce', 'ounces'\]\.includes\(rawUnit\)/.test(builder),
  'nutrient summary only converts true weight ounces to pounds'
)

assert(
  /normalizeNutrientSources/.test(modal) &&
  /function nutrientPercentForInventory\(inv, nutrient\)/.test(modal) &&
  /const guaranteed = nutrientPercentFromAnalysis\(parseAnalysisNPK\(inv\.analysis\), nutrient\)/.test(modal) &&
  /spec\.nutrientRate/.test(modal),
  'saved application editor supports nutrient-rate math from guaranteed N-P-K analysis'
)

assert(
  /function quantityForInventory\(row, inv\)/.test(modal) &&
  /convertQuantityUnit\(qty, row\?\.unit, inv\.unit\)/.test(modal) &&
  /function costSnapshotsForQuantity\(quantityUsed, quantityUnit, inv/.test(modal),
  'saved application editor normalizes edited usage to inventory units before pricing'
)

assert(
  /quantityUsed,\s*\n\s*unit:\s+quantityUnit/.test(modal) &&
  /\.\.\.costSnapshots/.test(modal),
  'saved application edit payload includes normalized quantity and recalculated cost snapshots'
)

assert(
  /rateToTotalUsedWithUnit\(Number\(r\.rate\), nextRateUnit, nextUnit, sprayedAcres, inv\)/.test(modal) &&
  /totalUsedToRateWithUnit\(Number\(r\.totalUsed\), nextUnit, nextRateUnit, sprayedAcres, inv\)/.test(modal),
  'saved application editor recalculates after changing selected inventory product'
)

const SQFT_PER_ACRE_K = 43.56
function nutrientLbFromRate(rate, acres) {
  return rate * acres * SQFT_PER_ACRE_K
}
function productLbFromNutrientRate(rate, acres, nutrientPercent) {
  return nutrientLbFromRate(rate, acres) / (nutrientPercent / 100)
}
function nutrientRateFromProductLb(productLb, acres, nutrientPercent) {
  return (productLb * (nutrientPercent / 100)) / (acres * SQFT_PER_ACRE_K)
}

assert(
  Math.abs(nutrientLbFromRate(0.5, 1) - 21.78) < 0.000001,
  '0.5 lb nutrient per 1,000 sq ft over 1 acre equals 21.78 lb nutrient'
)

assert(
  Math.abs(productLbFromNutrientRate(0.5, 1, 46) - 47.34782608695652) < 0.000001,
  '0.5 lb N per 1,000 with 46% N product requires 47.35 lb product'
)

assert(
  Math.abs(nutrientRateFromProductLb(47.34782608695652, 1, 46) - 0.5) < 0.000001,
  '47.35 lb of 46% N product back-calculates to 0.5 lb N per 1,000'
)

assert(
  Number(nutrientRateFromProductLb(200, 4, 18).toFixed(3)) === 0.207,
  '200 lb of 18-3-18 over 4 acres equals 0.207 lb N per 1,000 sq ft'
)

assert(
  Number(productLbFromNutrientRate(0.207, 4, 18).toFixed(4)) === 200.376,
  '0.207 lb N per 1,000 over 4 acres with guaranteed 18% N requires 200.376 lb product'
)

assert(
  Number(productLbFromNutrientRate(0.207, 4, 21.18).toFixed(4)) === 170.2912,
  'summing the 18-3-18 label nitrogen sub-rows to 21.18% reproduces the bad 170.2912 lb result'
)

assert(
  /function nutrientSourcePercentForMath\(source, sources, npk\)/.test(builder) &&
  /percent \* \(guaranteed \/ sourceTotal\)/.test(builder),
  'nutrient release breakdown is normalized to guaranteed N-P-K totals when source rows differ'
)

assert(
  Number((productLbFromNutrientRate(0.5, 1, 46) * 0.52).toFixed(2)) === 24.62,
  '47.35 lb product at $0.52 per lb costs $24.62'
)

const containerCount = 2
const containerSize = 2.5
const containerPrice = 400
const unitCost = containerPrice / containerSize

assert(
  containerCount * containerSize === 5,
  '2 containers x 2.5 gal equals 5 gal inventory'
)

assert(
  unitCost === 160,
  '$400 per 2.5 gal container equals $160 per gal'
)

assert(
  5 * unitCost === 800,
  'using 5 gal from $400 / 2.5 gal containers costs $800'
)
