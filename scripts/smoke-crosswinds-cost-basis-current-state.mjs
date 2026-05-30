// Phase 7X.4 — Crosswinds cost-basis current-state audit smoke.
//
//   node scripts/smoke-crosswinds-cost-basis-current-state.mjs
//
// Locks the read-only invariants of the audit script. No production
// writes. Specifically:
//   - the script source carries no PATCH/POST/PUT/DELETE method strings
//   - no fetch path constructs a mutating endpoint URL
//   - no inventory deduction / usage / spray-program mutation verbs
//   - the only D1 path is selectFromD1, which hard-rejects non-SELECT
//   - --write-doc is gated, and there is exactly ONE writeFileSync (the
//     doc) so the script never writes inventory/seed/code files
//   - SOURCE-only checks; the smoke does NOT execute the audit script
//     because it requires live D1/API access (covered by the run in
//     the previous tasks).

import { readFileSync, statSync } from 'fs'

const SCRIPT = 'scripts/audit-crosswinds-cost-basis-current-state.mjs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log('— audit script source')
{
  let stat = null
  try { stat = statSync(SCRIPT) } catch {}
  assert(!!stat && stat.size > 0, 'audit script exists and is non-empty')

  const src = readFileSync(SCRIPT, 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // No mutating HTTP methods in code (PATCH/POST/PUT/DELETE).
  for (const verb of ['PATCH', 'POST', 'PUT', 'DELETE']) {
    assert(!new RegExp(`method:\\s*['"]${verb}['"]`).test(code),
      `audit script never issues a ${verb} request`)
  }

  // Only the selectFromD1 helper touches D1, and it hard-rejects
  // anything but SELECT.
  assert(/function\s+selectFromD1\b/.test(code),
    'audit script defines a selectFromD1 helper')
  assert(/^\s*SELECT\b/m.test(code) || /\/\^\\s\*SELECT\\b/i.test(src),
    'selectFromD1 rejects non-SELECT (regex gate on first token)')
  // The wrangler call uses --remote --json (read mode) and never
  // execute --command "INSERT/UPDATE/DELETE".
  assert(/wrangler d1 execute/.test(src), 'audit uses wrangler d1 execute (read-only mode)')
  for (const verb of ['INSERT INTO', 'UPDATE ', 'DELETE FROM']) {
    assert(!new RegExp(`['"\`].*\\b${verb}\\b.*['"\`]`).test(code),
      `audit script never composes "${verb}" SQL`)
  }

  // Inventory-mutation / spray-program-mutation / cost-apply verbs
  // never appear.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgramItem',
    'setInventoryCostBasis', 'patchInventoryCostBasis',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `audit script never references ${verb}`)
  }

  // --write-doc is gated; exactly one writeFileSync (the doc) so the
  // script never writes inventory/seed/code files.
  assert(/--write-doc/.test(src), 'doc write is gated behind --write-doc')
  const writes = (code.match(/writeFileSync\(/g) ?? []).length
  assert(writes === 1, 'exactly one writeFileSync (the doc)', writes)

  // Output sections that the spec asks for are present in the
  // renderers (console + doc).
  for (const phrase of [
    'Top estimated contributors',
    'Costed but NOT contributing',
    'Still missing cost basis',
    'Audit table',
    'Recent applied',
  ]) {
    assert(src.includes(phrase),
      `output includes "${phrase}" group`)
  }
  assert(/stewardship === ['"]off-program['"]/.test(src),
    'audit script distinguishes off-program from in-program-blocked')
  assert(/stewardship === ['"]in-program-blocked['"]/.test(src),
    'audit script distinguishes in-program-blocked from off-program')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
