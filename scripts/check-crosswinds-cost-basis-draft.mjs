// Phase 7U.1 — Validate the Crosswinds cost-basis DRAFT.
//
//   node scripts/check-crosswinds-cost-basis-draft.mjs
//
// Pure validation of docs/crosswinds-greens-program-2026-cost-basis-draft.json.
// Read-only: no DB, no fetch, no mutation, no apply. Exits non-zero if any
// invariant fails so it can gate a future apply step.
//
// Invariants:
//   - JSON parses + has the expected envelope (schema, entries[])
//   - every entry has the required fields
//   - no suggestedCostPerUnit is negative (null is allowed)
//   - when a suggestedCostPerUnit is set, costUnit is also set (mirrors
//     the live PATCH contract: costUnit required when costPerUnit set)
//   - no alias-review entry is also marked exact (mutually exclusive)
//   - confidence is one of exact | alias-review | manual-review
//   - DO-NOT-MERGE products (Ampliphy 18, Veriphy 18) are present as
//     separate entries and neither is collapsed into the other
//   - nothing in the draft attempts to auto-apply (no apply/applied/
//     deduct fields)

import { readFileSync } from 'fs'

const DRAFT_FILE = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'

let passed = 0, failed = 0
function ok(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const VALID_CONFIDENCE = new Set(['exact', 'alias-review', 'manual-review'])
const REQUIRED_FIELDS = [
  'productName', 'inventoryMatchName', 'vendor', 'purchaseQuantity',
  'purchaseUnit', 'totalCost', 'suggestedCostPerUnit', 'costUnit',
  'source', 'confidence', 'notes',
]
const DO_NOT_MERGE = ['Ampliphy 18', 'Veriphy 18']

console.log(`— validate ${DRAFT_FILE}`)

let draft = null
try {
  draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'))
} catch (e) {
  console.error(`  ✗ draft JSON parses (${e.message})`)
  console.log('\n0 passed, 1 failed\n')
  process.exit(1)
}
ok(!!draft, 'draft JSON parses')
ok(draft.schema === 'crosswinds-cost-basis-draft/v1', 'schema tag present', draft.schema)
ok(Array.isArray(draft.entries) && draft.entries.length > 0, 'entries array is non-empty', draft.entries?.length)

const entries = Array.isArray(draft.entries) ? draft.entries : []

// Required fields present on every entry.
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
  'every confidence is exact | alias-review | manual-review')

// No negative suggested cost.
const negative = entries.filter(e => e.suggestedCostPerUnit != null && !(Number(e.suggestedCostPerUnit) >= 0))
ok(negative.length === 0, 'no suggestedCostPerUnit is negative / non-finite',
  negative.map(e => e.productName))

// suggested cost ⇒ costUnit set (live PATCH contract).
const unitless = entries.filter(e => e.suggestedCostPerUnit != null && !e.costUnit)
ok(unitless.length === 0, 'every suggested cost carries a costUnit',
  unitless.map(e => e.productName))

// exact ⇒ has an inventory match name (you can only be exact against a row).
const exactNoInv = entries.filter(e => e.confidence === 'exact' && !e.inventoryMatchName)
ok(exactNoInv.length === 0, 'no exact entry lacks an inventory match name',
  exactNoInv.map(e => e.productName))

// alias-review entries are NOT also exact — confidence is single-valued,
// but double-check the semantic: an alias-review item must not claim an
// exact-named inventory match. (If names matched exactly it would be exact.)
const aliasButExactName = entries.filter(e =>
  e.confidence === 'alias-review' && e.inventoryMatchName === e.productName)
ok(aliasButExactName.length === 0, 'no alias-review entry has an exact-name inventory match',
  aliasButExactName.map(e => e.productName))

// DO-NOT-MERGE pair: both present, distinct entries, neither merged.
for (const name of DO_NOT_MERGE) {
  const matches = entries.filter(e => e.productName === name)
  ok(matches.length === 1, `${name} present exactly once (not merged away)`, matches.length)
}
{
  const amp = entries.find(e => e.productName === 'Ampliphy 18')
  const ver = entries.find(e => e.productName === 'Veriphy 18')
  ok(!!amp && !!ver, 'both Ampliphy 18 and Veriphy 18 are present')
  // Neither entry's inventoryMatchName points at the OTHER product.
  ok(!amp || amp.inventoryMatchName !== 'Veriphy 18',
    'Ampliphy 18 is not linked to Veriphy 18 inventory')
  ok(!ver || ver.inventoryMatchName !== 'Ampliphy 18',
    'Veriphy 18 is not linked to Ampliphy 18 inventory')
}

// No auto-apply surface: the draft must not carry apply/applied/deduct
// flags that a naive consumer might act on.
const drafttext = JSON.stringify(draft).toLowerCase()
for (const banned of ['"applied"', '"apply"', 'deductinventory', 'recordinventoryusage', '"autoapply"']) {
  ok(!drafttext.includes(banned), `draft carries no "${banned}" field`)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
