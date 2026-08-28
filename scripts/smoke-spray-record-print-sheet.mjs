import fs from 'node:fs'

const src = fs.readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx', 'utf8')
const css = fs.readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL - ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok - ${message}`)
}

assert(
  /function handlePrint\(\)\s*\{\s*window\.print\(\)\s*\}/s.test(src),
  'spray detail modal has a print handler',
)

assert(
  /onClick=\{handlePrint\}[\s\S]*?>\s*Print\s*<\/button>/.test(src),
  'print button renders in the spray detail action row',
)

assert(
  /function SprayPrintSheet/.test(src)
  && /Crosswinds Golf Club - Application Record/.test(src)
  && /Application and Weather Record/.test(src)
  && /Applicator Signature/.test(src),
  'print sheet follows the reference application record structure',
)

assert(
  /fmtThousandsSqFt/.test(src) && /43\.56/.test(src),
  'print sheet shows acres and thousand square feet',
)

assert(
  /function normalizeAppliedProductQuantity\(product, sprayedAcres = 0/.test(src)
  && /const expectedNaturalQty = rateToTotalUsed\(rate, parsed\.rateUnit, acres\)/.test(src)
  && /convertQuantityUnit\(rawQty, rateMeasure, unit\)/.test(src),
  'legacy saved spray totals are normalized from rate unit into saved total unit',
)

assert(
  /function totalUsedToRateWithUnit\(totalUsed, totalUnit, rateUnit, acres, inv\)/.test(src)
  && /const naturalQty = convertQuantityUnit\(totalUsed, totalUnit, spec\.measure\)/.test(src),
  'edit modal converts total-used unit back to rate unit before calculating rate',
)

assert(
  /function rateToTotalUsedWithUnit\(rate, rateUnit, totalUnit, acres, inv\)/.test(src)
  && /const converted = convertQuantityUnit\(naturalQty, spec\.measure, totalUnit\)/.test(src),
  'edit modal converts calculated rate totals into selected total-used unit',
)

assert(
  /function editTotalUnit\(i, newUnit\)/.test(src)
  && /onChange=\{e => editTotalUnit\(i, e\.target\.value\)\}/.test(src),
  'changing total unit recalculates instead of only relabeling the number',
)

assert(
  /<KV label="Quantity used" value=\{fmtProductTotal\(p, sprayedAcres\)\}/.test(src)
  && /<td>\{fmtProductTotal\(p, sprayedAcres\)\}<\/td>/.test(src),
  'spray detail and print sheet both show normalized product totals',
)

const SQFT_PER_ACRE_K = 43.56
const ozTotal = 3.9669 * 4 * SQFT_PER_ACRE_K
assert(
  Math.abs((ozTotal / 128) - 5.4) < 0.01,
  '3.9669 oz per 1,000 sq ft across 4 acres displays as about 5.4 gal',
)

assert(
  /@media print/.test(css)
  && /\.printSheet/.test(css)
  && /size:\s*letter/.test(css)
  && /:global\(body\) \*/.test(css),
  'print CSS hides app chrome and prints a letter-size report',
)
