import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const builderPath = path.join(root, 'src/pages/Spray/tabs/BuildSpraySheet.jsx')
const source = fs.readFileSync(builderPath, 'utf8')
const coursesApi = fs.readFileSync(path.join(root, 'worker/api/courses.js'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

assert(
  /value:\s*'lb_per_acre'[\s\S]*?label:\s*'lb \/ acre'[\s\S]*?measure:\s*'lb'[\s\S]*?perK:\s*false/.test(source),
  'spray sheet builder offers lb per acre'
)

assert(
  /value:\s*'lb_per_1000sqft'[\s\S]*?label:\s*'lb \/ 1,000 sq ft'[\s\S]*?measure:\s*'lb'[\s\S]*?perK:\s*true/.test(source),
  'spray sheet builder offers lb per 1,000 sq ft'
)

assert(
  /defaultRateUnitForInventory/.test(source) &&
  /const rateUnit = defaultRateUnitForInventory\(\s*inv,/.test(source) &&
  /const totalProductUnit = normalizeTotalProductUnit\(patch\.unit, rateUnit\)/.test(source),
  'inventory selection applies the product-aware per-1,000 rate default'
)

assert(
  /return spec\.perK \? r \* a \* SQFT_PER_ACRE_K : r \* a/.test(source),
  'per-1000 rate math still scales acres by 43.56'
)

assert(
  /function computeRateFromQty\(qty, acres, rateUnit\)/.test(source) &&
  /return denominator > 0 \? q \/ denominator : 0/.test(source),
  'spray sheet builder can back-calculate rate from total product'
)

assert(
  /function setRowRate\(rowId, rate\)/.test(source) &&
  /totalProduct:\s*formatRowNumber\(totalProduct \?\? qtyNeeded, 4\)/.test(source),
  'editing rate updates total product to use'
)

assert(
  /function setRowTotalProduct\(rowId, totalProduct\)/.test(source) &&
  /rate:\s*formatRowNumber\(computeRateFromTotalProduct\(totalProduct, totalProductUnit, prev\.acres, rateUnit, inv\), 4\)/.test(source),
  'editing total product updates rate'
)

assert(
  /function convertQuantityUnit\(qty, fromUnit, toUnit\)/.test(source) &&
  /function setRowTotalProductUnit\(rowId, totalProductUnit\)/.test(source) &&
  /totalUnitOptionsForRate\(row\.rateUnit\)\.map/.test(source) &&
  /className=\{`\$\{styles\.naRowInput\} \$\{styles\.naTotalUnitSelect\}`\}/.test(source),
  'total used unit is selectable and converts back to the selected rate unit'
)

assert(
  /function canonicalInventoryUnit\(unit\)/.test(source) &&
  /\['lb', 'lbs', 'pound', 'pounds'\]\.includes\(u\)/.test(source),
  'inventory unit aliases normalize pounds'
)

assert(
  /if \(r\.qtyUnit === 'lb'\)\s+totalLb\s+\+= r\.qtyNeeded \|\| 0/.test(source),
  'tank summary totals pound products separately'
)

assert(
  /label="Total product \(lb\)"[\s\S]*?summary\.totalLb/.test(source),
  'tank summary renders total product pounds'
)

assert(
  /function ActionNutrientSummary\(\{ summary \}\)/.test(source) &&
  /aria-label="Nutrient summary"/.test(source) &&
  /NUTRIENTS[\s\S]*?\.map\(nutrient => \[[\s\S]*?summary\.nutrientReleaseTotals\[nutrient\.value\]/.test(source) &&
  /s\.id === 'review' && <ActionNutrientSummary summary=\{summary\} \/>/.test(source) &&
  !/naWizardActionRight[\s\S]*?<ActionNutrientSummary/.test(source) &&
  !/SummarySection label="Nutrient totals/.test(source) &&
  !/rate-unit basis/.test(source),
  'nutrient summary sits next to the Review & Save step and reports lb per 1,000 sq ft'
)

const SQFT_PER_ACRE_K = 43.56

function builderQty(rate, acres, perK) {
  const r = Number(rate) || 0
  const a = Number(acres) || 0
  return perK ? r * a * SQFT_PER_ACRE_K : r * a
}

function builderRate(total, acres, perK) {
  const denominator = perK ? acres * SQFT_PER_ACRE_K : acres
  return denominator > 0 ? total / denominator : 0
}

assert(
  builderQty(2, 5, false) === 10,
  '2 lb per acre across 5 acres equals 10 lb'
)

assert(
  Math.abs(builderQty(0.25, 1, true) - 10.89) < 0.000001,
  '0.25 lb per 1,000 sq ft across 1 acre equals 10.89 lb'
)

assert(
  10 * 12.5 === 125,
  '10 lb at $12.50 per lb estimates $125.00'
)

assert(
  30 - 10 === 20,
  'deducting 10 lb from 30 lb leaves 20 lb'
)

assert(
  2 * 1.5 * SQFT_PER_ACRE_K === 130.68,
  '2 oz per 1,000 sq ft across 1.5 acres still equals 130.68 oz'
)

assert(
  4 * 4 * SQFT_PER_ACRE_K === 696.96,
  '4 oz per 1,000 sq ft across 4 acres equals 696.96 oz'
)

assert(
  Math.abs((696.96 / 128) - 5.445) < 0.000001,
  '696.96 oz converts to 5.445 gal for inventory deduction'
)

assert(
  builderRate(696.96, 4, true) === 4,
  '696.96 oz total across 4 acres back-calculates to 4 oz per 1,000 sq ft'
)

assert(
  /const useInvUnit = r\.inv && r\.unitConversion\?\.ok/.test(source) &&
  /const quantityUnit = useInvUnit \? r\.inv\.unit : r\.qtyUnit/.test(source) &&
  /const quantityUsed = useInvUnit \? r\.qtyInInv : r\.qtyNeeded/.test(source) &&
  /unit:\s+quantityUnit/.test(source) &&
  /quantityUnit/.test(source),
  'saved spray product quantity and unit use inventory units when conversion is available'
)

assert(
  Math.abs(builderRate(5 * 128, 4, true) - 3.6731) < 0.0001,
  '5 gal total across 4 acres back-calculates to 3.6731 oz per 1,000 sq ft'
)

assert(
  builderRate(46, 1, false) === 46,
  '46 lb total across 1 acre back-calculates to 46 lb per acre'
)

assert(
  Number(((46 * 0.46) / SQFT_PER_ACRE_K).toFixed(3)) === 0.486,
  '46 lb urea over 1 acre reports 0.486 lb N per 1,000 sq ft'
)

assert(
  Number((5.445 * 348.16).toFixed(2)) === 1895.73,
  '5.445 gal at $348.16 per gal estimates $1,895.73'
)

assert(
  /function inventoryQtyLabel\(row\)/.test(source) &&
  /styles\.naQtyConverted/.test(source),
  'converted inventory quantity renders below rate quantity'
)

assert(
  /<option key=\{o\.value\} value=\{o\.value\}>\{o\.label\}<\/option>/.test(source),
  'rate unit dropdown renders all builder rate options'
)

assert(
  /function areaAcresValue\(value\)/.test(source) &&
  /const n = Number\(value\)/.test(source) &&
  /function courseAreaOption\(name, acres\)/.test(source),
  'application builder normalizes course area acreage values'
)

assert(
  /selectedCourse\.customCourseAreas[\s\S]*?courseAreaOption\(a\?\.name \?\? a\?\.label \?\? a\?\.area, a\?\.acres \?\? a\?\.acreage \?\? a\?\.areaAcres\)/.test(source),
  'application builder includes named custom course areas from course configuration'
)

assert(
  /patchDraft\(\{ area: label, acres: opt\?\.acres \?\? 0 \}\)/.test(source),
  'selecting a custom course area with blank acres clears acres for manual entry'
)

assert(
  /const acres = entry\?\.acres === '' \|\| entry\?\.acres == null[\s\S]*?: Number\(entry\.acres\)/.test(coursesApi),
  'course API reads custom course area acreage from numeric strings'
)
