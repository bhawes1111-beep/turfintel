// Phase 7X.5 — Crosswinds name-reconciliation review smoke.
//
//   node scripts/smoke-crosswinds-name-reconciliation.mjs
//
// Locks the read-only / stewardship invariants of the reconciliation
// audit script. The script itself requires live D1/API access, so the
// smoke is a source-only check (covers the renderer / safety guards
// without executing the live HTTP path).

import { readFileSync, statSync } from 'fs'

const SCRIPT = 'scripts/audit-crosswinds-name-reconciliation.mjs'
const DOC    = 'docs/crosswinds-name-reconciliation-review.md'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log('— reconciliation script source')
{
  let stat = null
  try { stat = statSync(SCRIPT) } catch {}
  assert(!!stat && stat.size > 0, 'reconciliation script exists and is non-empty')

  const src = readFileSync(SCRIPT, 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // No mutating HTTP methods in code (PATCH/POST/PUT/DELETE).
  for (const verb of ['PATCH', 'POST', 'PUT', 'DELETE']) {
    assert(!new RegExp(`method:\\s*['"]${verb}['"]`).test(code),
      `reconciliation script never issues a ${verb} request`)
  }

  // No inventory-deduction / spray-program-mutation / cost-apply /
  // alias-merge verbs anywhere.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgramItem',
    'setInventoryCostBasis', 'patchInventoryCostBasis',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `reconciliation script never references ${verb}`)
  }

  // Sanity: the script declares it's read-only and tells the steward
  // no automatic merge has occurred.
  assert(/READ-ONLY/.test(src), 'header announces READ-ONLY')
  assert(/No automatic merge/i.test(src) || /never merges names/i.test(src),
    'header confirms no automatic merge')

  // The four required name-reconciliation surfaces appear in the source
  // (they drive the recommendation output).
  for (const phrase of [
    '13-2-13', 'Vereens 13-2-13',
    '18-3-18 Greens Grade', 'PUSH 18-3-18',
    'Prothioconazole',
    'Manzate Max',
    'Ampliphy 18', 'Veriphy 18',
  ]) {
    assert(src.includes(phrase),
      `source mentions "${phrase}"`)
  }

  // DO_NOT_MERGE list is a hard-coded constant — never derived from
  // similarity scoring.
  assert(/const\s+DO_NOT_MERGE\s*=/.test(src),
    'DO_NOT_MERGE is a hard-coded constant (not similarity-derived)')

  // Output sections per spec.
  for (const section of [
    'Reconciliation candidates',
    'Program-side recommendations',
    'DO NOT MERGE',
    'Unit-conversion-only blockers',
  ]) {
    assert(src.includes(section),
      `output includes "${section}" section`)
  }

  // --write-doc is gated; exactly ONE writeFileSync (the doc).
  assert(/--write-doc/.test(src), 'doc write is gated behind --write-doc')
  const writes = (code.match(/writeFileSync\(/g) ?? []).length
  assert(writes === 1, 'exactly one writeFileSync (the doc)', writes)
}

console.log('— generated doc shape (if present)')
{
  let docExists = false
  try { docExists = statSync(DOC).size > 0 } catch {}
  if (!docExists) {
    console.log('  · doc not generated yet (skipping doc shape checks)')
  } else {
    const doc = readFileSync(DOC, 'utf8')
    assert(/Name Reconciliation Review/.test(doc),
      'doc carries the review title')
    assert(/No automatic merge has been performed/.test(doc),
      'doc explicitly states no automatic merge')
    assert(/Inventory usage and deduction are unaffected/.test(doc),
      'doc explicitly states inventory usage/deduction unaffected')
    // The four required products appear in the doc tables.
    for (const phrase of ['13-2-13', '18-3-18', 'Prothioconazole', 'Manzate Max']) {
      assert(doc.includes(phrase),
        `doc mentions "${phrase}"`)
    }
    // DO NOT MERGE warning row.
    assert(/Ampliphy 18 ↔ Veriphy 18/.test(doc) || /Ampliphy 18.*Veriphy 18/.test(doc),
      'doc surfaces Ampliphy 18 / Veriphy 18 DO NOT MERGE warning')
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
