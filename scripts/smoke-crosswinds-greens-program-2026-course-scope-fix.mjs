// Phase 7R.3 — Crosswinds Greens Program course-scope fix smoke.
//
//   node scripts/smoke-crosswinds-greens-program-2026-course-scope-fix.mjs
//
// Locks:
//   - migration 0048 file exists and is idempotent (targeted UPDATE
//     on the single seeded program id + its items, guarded with
//     `course_id IS NULL` so a re-run is a no-op)
//   - 0048 writes course_id='crossroads-gc' to match the live read
//     filter (resolveCourseId() default + the only course row in
//     production)
//   - 0048 touches NO other table: no inventory_items,
//     inventory_usage, product_catalog, spray_records, audit
//     tables, budget/invoice/ledger tables, no CREATE/ALTER/DROP
//   - 0048 contains no INSERT or DELETE — UPDATE-only
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold
//   - Phase 7Q.1 no-deduction pilot helper copy still in place

import { readFileSync, statSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log('— worker/migrations/0048_fix_crosswinds_greens_program_course_scope.sql')
{
  let stat = null
  try { stat = statSync('worker/migrations/0048_fix_crosswinds_greens_program_course_scope.sql') } catch {}
  assert(!!stat && stat.size > 0,
    '0048 migration file exists and is non-empty')

  const sql = readFileSync(
    'worker/migrations/0048_fix_crosswinds_greens_program_course_scope.sql',
    'utf8',
  )

  // Targets the right program id.
  assert(/sp-crosswinds-greens-2026/.test(sql),
    "migration targets the sp-crosswinds-greens-2026 program id")

  // Writes the correct course_id ('crossroads-gc' — legacy slug for
  // the renamed Crosswinds course; matches resolveCourseId() default
  // and the only courses.id in production).
  assert(/'crossroads-gc'/.test(sql),
    "migration writes course_id = 'crossroads-gc'")

  // Both spray_programs + spray_program_items get updated.
  assert(/UPDATE\s+spray_programs/i.test(sql),
    'migration UPDATEs spray_programs')
  assert(/UPDATE\s+spray_program_items/i.test(sql),
    'migration UPDATEs spray_program_items')

  // Idempotency: the WHERE clauses both gate on course_id IS NULL
  // so re-running the migration is a no-op.
  const programUpdate = sql.match(/UPDATE\s+spray_programs[\s\S]*?;/i)
  const itemsUpdate   = sql.match(/UPDATE\s+spray_program_items[\s\S]*?;/i)
  assert(!!programUpdate && /course_id\s+IS\s+NULL/i.test(programUpdate[0]),
    'spray_programs UPDATE gated on course_id IS NULL (idempotent)')
  assert(!!itemsUpdate && /course_id\s+IS\s+NULL/i.test(itemsUpdate[0]),
    'spray_program_items UPDATE gated on course_id IS NULL (idempotent)')

  // No INSERT / DELETE — UPDATE only.
  const sqlCode = sql.replace(/^\s*--.*$/gm, '')
  assert(!/INSERT\s+(?:OR\s+IGNORE\s+)?INTO/i.test(sqlCode),
    'migration contains no INSERT statements')
  assert(!/DELETE\s+FROM/i.test(sqlCode),
    'migration contains no DELETE statements')
  assert(!/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i.test(sqlCode),
    'migration contains no CREATE/ALTER/DROP — UPDATE-only')

  // No other table touched.
  for (const forbidden of [
    'inventory_items', 'inventory_usage', 'product_catalog',
    'spray_records', 'inventory_cost_basis_audit',
    'budget_entries', 'invoices', 'ledger_entries',
  ]) {
    assert(!new RegExp(`\\b${forbidden}\\b`, 'i').test(sqlCode),
      `migration SQL never references ${forbidden}`)
  }
}

console.log('— cross-surface regression guards')
{
  // Phase 7F.4 /completed-link route remains the SOLE write site for
  // linked_spray_record_id.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js still avoids forbidden surfaces.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js still never references ${verb}`)
  }

  // worker/api/sprayPrograms.js never grew a deduction code path.
  const sprayProgApi = readFileSync('worker/api/sprayPrograms.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'recordInventoryUsage', 'deductInventory',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'completeProgramItem', 'autoComplete',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(sprayProgApi),
      `worker/api/sprayPrograms.js still never references ${verb}`)
  }

  // Phase 7Q.1 pilot helper copy still pins the deduction line.
  const form = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
  assert(form.includes('Inventory stock is not deducted from planned spray programs.'),
    'ManualProductForm still pins the no-deduction helper copy')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
