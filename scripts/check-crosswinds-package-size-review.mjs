// Phase 7V.2 — Validate the Crosswinds package-size review worksheet.
//
//   node scripts/check-crosswinds-package-size-review.mjs
//
// Pure validation of docs/crosswinds-greens-program-2026-package-size-review.json.
// Read-only: no DB, no fetch, no apply. Exits non-zero on any failure so
// it can gate a future cost-apply step.

import { readFileSync } from 'fs'

const REVIEW_FILE = 'docs/crosswinds-greens-program-2026-package-size-review.json'

const VALID_CONFIDENCE = new Set([
  'package-size-needed', 'standalone-price-needed', 'alias-review',
  'do-not-merge', 'already-costed',
])
const REQUIRED_FIELDS = [
  'productName', 'inventoryMatchName', 'vendor', 'purchaseQuantity',
  'purchaseUnit', 'totalCost', 'knownPackageSize', 'packageSizeUnit',
  'neededInput', 'formula', 'confidence', 'applyEligible', 'notes',
]

let passed = 0, failed = 0
function ok(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log(`— validate ${REVIEW_FILE}`)

let review = null
try { review = JSON.parse(readFileSync(REVIEW_FILE, 'utf8')) }
catch (e) {
  console.error(`  ✗ review JSON parses (${e.message})`)
  console.log('\n0 passed, 1 failed\n')
  process.exit(1)
}
ok(!!review, 'review JSON parses')
ok(review.schema === 'crosswinds-package-size-review/v1', 'schema tag present', review.schema)
const entries = Array.isArray(review.entries) ? review.entries : []
ok(entries.length > 0, 'entries non-empty', entries.length)

// Required fields on every entry.
let allFields = true
for (const e of entries) {
  for (const f of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(e, f)) {
      allFields = false
      console.error(`    missing "${f}" on ${e.productName ?? '(unknown)'}`)
    }
  }
}
ok(allFields, 'every entry has all required fields')

// confidence vocabulary.
ok(entries.every(e => VALID_CONFIDENCE.has(e.confidence)),
  'every confidence is a known package-size-review value')

// applyEligible is FALSE on every row — this phase is review-prep only.
ok(entries.every(e => e.applyEligible === false),
  'every entry has applyEligible:false (nothing is apply-ready)')

// Every non-already-costed entry states what input is needed.
const missingNeeded = entries.filter(e => e.confidence !== 'already-costed' && !e.neededInput)
ok(missingNeeded.length === 0,
  'every entry needing work states neededInput', missingNeeded.map(e => e.productName))

// No formula crosses volume↔weight.
const crossing = entries.filter(e => {
  if (!e.formula) return false
  if (e.purchaseUnit === 'case'   && /per lb/i.test(e.formula)) return true
  if (e.purchaseUnit === 'bottle' && /per lb/i.test(e.formula)) return true
  if (e.purchaseUnit === 'bag'    && /per gal/i.test(e.formula)) return true
  if (e.purchaseUnit === 'pack'   && /per gal/i.test(e.formula)) return true
  return false
})
ok(crossing.length === 0, 'no formula crosses volume↔weight', crossing.map(e => e.productName))

// Ampliphy 18 / Veriphy 18 present, distinct, flagged do-not-merge,
// neither linked to the other.
{
  const amp = entries.find(e => e.productName === 'Ampliphy 18')
  const ver = entries.find(e => e.productName === 'Veriphy 18')
  ok(!!amp && !!ver, 'both Ampliphy 18 and Veriphy 18 are present')
  ok(amp && amp.confidence === 'do-not-merge', 'Ampliphy 18 flagged do-not-merge', amp?.confidence)
  ok(ver && ver.confidence === 'do-not-merge', 'Veriphy 18 flagged do-not-merge', ver?.confidence)
  ok(!amp || amp.inventoryMatchName !== 'Veriphy 18', 'Ampliphy 18 not linked to Veriphy 18')
  ok(!ver || ver.inventoryMatchName !== 'Ampliphy 18', 'Veriphy 18 not linked to Ampliphy 18')
}

// No auto-apply surface in the JSON.
const text = JSON.stringify(review).toLowerCase()
for (const banned of ['"applyeligible":true', 'deductinventory', 'recordinventoryusage', '"applied":true']) {
  ok(!text.includes(banned), `review JSON has no "${banned}"`)
}

// ── prepare-script source guard: never invokes a cost-apply script ─────────
{
  const src = readFileSync('scripts/prepare-crosswinds-package-size-review.mjs', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  ok(!/apply-crosswinds-exact-cost-basis/.test(code),
    'prepare script does not invoke the cost-apply script')
  ok(!/\bfetch\(/.test(code) && !/wrangler|node:sqlite|better-sqlite3|\benv\.DB\b/.test(code),
    'prepare script has no DB/network surface')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
