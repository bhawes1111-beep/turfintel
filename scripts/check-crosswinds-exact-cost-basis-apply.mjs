// Phase 7U.2 — Validate the exact-confidence apply eligibility.
//
//   node scripts/check-crosswinds-exact-cost-basis-apply.mjs
//
// Read-only validation that the apply set is exactly the 13 exact
// entries and that the excluded products stay excluded. Gates a future
// --apply run. No DB, no fetch, no mutation.

import { readFileSync } from 'fs'

const DRAFT_FILE = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'
const APPLY_SCRIPT = 'scripts/apply-crosswinds-exact-cost-basis.mjs'

const EXPECTED_EXACT = 13
const MUST_EXCLUDE = ['Prothioconazole', 'Ampliphy 18', 'Veriphy 18']

let passed = 0, failed = 0
function ok(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log('— exact-confidence apply eligibility')

const draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'))
const entries = Array.isArray(draft.entries) ? draft.entries : []
const exact = entries.filter(e => e.confidence === 'exact')

// Exactly 13 eligible.
ok(exact.length === EXPECTED_EXACT,
  `exactly ${EXPECTED_EXACT} exact-confidence entries are eligible`, exact.length)

// Every eligible entry is fully formed for a PATCH.
ok(exact.every(e => Number(e.suggestedCostPerUnit) > 0),
  'every eligible entry has a positive suggestedCostPerUnit')
ok(exact.every(e => !!e.costUnit),
  'every eligible entry has a costUnit')
ok(exact.every(e => !!e.inventoryMatchName),
  'every eligible entry has an inventoryMatchName')

// Prothioconazole excluded — it has a numeric suggestion but is NOT exact.
{
  const p = entries.find(e => e.productName === 'Prothioconazole')
  ok(!!p, 'Prothioconazole is present in the draft')
  ok(p && p.confidence !== 'exact', 'Prothioconazole is NOT exact-confidence', p?.confidence)
  ok(!exact.some(e => e.productName === 'Prothioconazole'),
    'Prothioconazole is excluded from the eligible set')
}

// DO-NOT-MERGE pair excluded from the apply set.
for (const name of MUST_EXCLUDE) {
  ok(!exact.some(e => e.productName === name),
    `${name} is excluded from the eligible set`)
}

// All manual-review (and alias-review) entries are excluded.
ok(!exact.some(e => e.confidence === 'manual-review'),
  'no manual-review entry is eligible')
ok(!exact.some(e => e.confidence === 'alias-review'),
  'no alias-review entry is eligible')

// Nothing with a null suggestion is eligible.
ok(!exact.some(e => e.suggestedCostPerUnit == null),
  'no null-suggestion entry is eligible')

// ── Apply-script source guards ─────────────────────────────────────────────
console.log('— apply-script source guards')
{
  const raw = readFileSync(APPLY_SCRIPT, 'utf8')
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Dry-run is the default; --apply is required to write.
  ok(/const\s+APPLY\s*=\s*args\.includes\('--apply'\)/.test(code),
    'apply gated behind --apply flag')
  ok(/DRY-RUN/.test(raw), 'script announces DRY-RUN mode')

  // No inventory deduction / usage / spray / merge / create surface.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    ok(!new RegExp(`\\b${verb}\\b`).test(code),
      `apply script never references ${verb}`)
  }

  // No direct D1 client — writes go through the HTTP PATCH endpoint.
  ok(!/wrangler|better-sqlite3|node:sqlite|\benv\.DB\b/.test(code),
    'apply script does not touch D1 directly (uses the PATCH endpoint)')
  ok(/\/cost-basis/.test(raw) && /method:\s*'PATCH'/.test(raw),
    'apply script writes via PATCH /api/inventory/:id/cost-basis')

  // The DO_NOT_APPLY guard list is present and contains the three names.
  ok(/DO_NOT_APPLY/.test(code), 'apply script has a DO_NOT_APPLY guard list')
  for (const name of MUST_EXCLUDE) {
    ok(raw.includes(`'${name}'`), `DO_NOT_APPLY (or exclusion) names ${name}`)
  }

  // Never-overwrite guard: the apply branch reads current cost + skips
  // when non-null.
  ok(/costPerUnit\s*!=\s*null/.test(code) || /costPerUnit\s*!==\s*null/.test(code),
    'apply branch checks current cost basis before writing (never overwrite)')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
