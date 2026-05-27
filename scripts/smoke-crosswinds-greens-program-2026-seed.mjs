// Phase 7R (1/?) — Crosswinds Greens Program 2026 seed smoke.
//
//   node scripts/smoke-crosswinds-greens-program-2026-seed.mjs
//
// Locks:
//   - migration 0047 exists and uses INSERT OR IGNORE on a stable
//     program id so re-runs are no-ops
//   - the program row hits the spec'd fields (id, name,
//     season_year, program_type, source='imported', status='active',
//     notes carrying the source + vendor + author + acreage
//     assumption + nutrient summary + deduction disclaimer)
//   - all spec'd dates are seeded (Jan 3, Jan 24, Mar 28, May 25,
//     Jun 23-25 aeration window, Sep 19, Dec 26)
//   - every item row has status='planned' (the user flips status
//     via the Phase 7F.4 /completed-link route; the seed never does)
//   - every item row has target_area='Greens'
//   - the aeration window items span 2026-06-23 to 2026-06-25 with
//     "Aeration window" in application_notes
//   - water-in app items carry "Water in app" in application_notes
//   - granular-only items carry "Granular only" in application_notes
//   - the seed never writes inventory_items, inventory_usage,
//     product_catalog, spray_records, or any budget / invoice /
//     ledger table
//   - no new worker route was added; no new mutation path landed
//   - docs/crosswinds-greens-program-2026.md exists and lists every
//     required reference section
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold
//   - the Phase 7Q.1 manual-add pilot helper copy that says
//     "Inventory stock is not deducted from planned spray programs."
//     is still in place

import { readFileSync, statSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration file exists + uses INSERT OR IGNORE ─────────────────────
console.log('— worker/migrations/0047_crosswinds_greens_program_2026_seed.sql')
{
  let stat = null
  try { stat = statSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql') } catch {}
  assert(!!stat && stat.size > 0, 'migration file exists and is non-empty')

  const sql = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')

  // Idempotent posture.
  assert(/INSERT OR IGNORE INTO spray_programs/.test(sql),
    'program insert uses INSERT OR IGNORE')
  assert(/INSERT OR IGNORE INTO spray_program_items/.test(sql),
    'item insert uses INSERT OR IGNORE')

  // Stable program id.
  assert(/'sp-crosswinds-greens-2026'/.test(sql),
    'program id is the stable sp-crosswinds-greens-2026')

  // Program row fields.
  assert(/'Crosswinds Greens Program 2026'/.test(sql),
    "program name is 'Crosswinds Greens Program 2026'")
  assert(/\b2026\b/.test(sql),
    'season_year = 2026 referenced')
  assert(/'greens'/.test(sql),
    "program_type = 'greens'")
  assert(/'active'/.test(sql),
    "status = 'active'")
  assert(/'imported'/.test(sql),
    "source = 'imported'")

  // Notes payload pieces. Strip SQL line-continuation + char(10)
  // newlines before searching.
  const notesNorm = sql.replace(/\|\|\s*char\(10\)\s*\|\|\s*/g, ' ').replace(/\s+/g, ' ')
  for (const phrase of [
    'Source: Crosswinds Greens Program Recommendations',
    'Vendor: Vereens Turf Products',
    'Prepared by: Paul Culclasure',
    'Course: Crosswinds Golf Club',
    'Target area: Greens',
    'Default acres: ~4 acres',
    'Annual nutrient summary: 4.85 lbs N, 6.33 lbs K',
    'Inventory stock is not deducted from planned spray programs',
    'Deduction happens only through completed Spray Records',
  ]) {
    assert(notesNorm.includes(phrase),
      `program notes carry: "${phrase}"`)
  }
}

// ── 2. Per-date item presence ────────────────────────────────────────────
console.log('— every spec\'d date is seeded')
{
  const sql = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')

  for (const date of [
    '2026-01-03', '2026-01-13', '2026-01-24',
    '2026-02-03', '2026-02-14', '2026-02-28',
    '2026-03-14', '2026-03-28',
    '2026-04-05', '2026-04-11', '2026-04-15', '2026-04-25',
    '2026-05-09', '2026-05-16', '2026-05-25',
    '2026-06-13',
    '2026-06-23', '2026-06-25',
    '2026-06-30',
    '2026-07-16', '2026-07-25',
    '2026-08-08', '2026-08-22',
    '2026-09-19',
    '2026-10-03', '2026-10-17', '2026-10-24',
    '2026-11-14', '2026-11-28',
    '2026-12-12', '2026-12-26',
  ]) {
    assert(sql.includes(`'${date}'`),
      `seed includes planned date ${date}`)
  }

  // The aeration window items must span 06-23 → 06-25.
  assert(/'2026-06-23','2026-06-25'/.test(sql) ||
         /'2026-06-23',\s*'2026-06-25'/.test(sql),
    'aeration window spans planned_start_date=2026-06-23 to planned_end_date=2026-06-25')

  // Mid-March / Mid-July windows.
  assert(/'2026-03-15','2026-03-21'/.test(sql),
    'mid-March granular item spans 03-15 → 03-21')
  assert(/'2026-07-10','2026-07-31'/.test(sql),
    'mid-July granular item spans 07-10 → 07-31')
}

// ── 3. Per-row invariants ────────────────────────────────────────────────
console.log('— every item row is planned + targets Greens')
{
  const sql = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')

  // Total item-row count from the file.
  const rowMatches = sql.match(/^\('spi-cw26-[^']+',\s*'sp-crosswinds-greens-2026'/gm) ?? []
  assert(rowMatches.length > 0,
    `seed contains at least one item row (found ${rowMatches.length})`)
  assert(rowMatches.length >= 100,
    `seed contains 100+ item rows (found ${rowMatches.length})`)
  console.log(`    info: ${rowMatches.length} item rows seeded`)

  // Status on each row.
  const planned = (sql.match(/,\s*'planned'\)/g) ?? []).length
  assert(planned === rowMatches.length,
    `every item row has status='planned' (found ${planned} of ${rowMatches.length})`)

  // Target area on each row.
  const greens = (sql.match(/,'Greens',/g) ?? []).length
  assert(greens === rowMatches.length,
    `every item row has target_area='Greens' (found ${greens} of ${rowMatches.length})`)
}

// ── 4. Application-notes flags ───────────────────────────────────────────
console.log('— application_notes flags for water-in / granular / aeration')
{
  const sql = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')

  // Water-in items.
  const waterIn = (sql.match(/Water in app\./g) ?? []).length
  assert(waterIn >= 30,
    `at least 30 item rows are marked "Water in app." (found ${waterIn})`)

  // Granular-only items.
  const granular = (sql.match(/Granular only\./g) ?? []).length
  assert(granular >= 10,
    `at least 10 item rows are marked "Granular only." (found ${granular})`)

  // Aeration window notes.
  const aeration = (sql.match(/Aeration window June 23.25/g) ?? []).length
  assert(aeration >= 4,
    `aeration window note appears on at least 4 rows (found ${aeration})`)

  // Spray-on-sand items.
  assert(/Spray on sand\. Water in multiple cycles to flush\./.test(sql),
    'spray-on-sand items carry the "Water in multiple cycles to flush" note')

  // Product-alias notes (verbatim, no auto-merge).
  for (const note of [
    'Alias note: Prize Phyter',
    'Alias note: Root Harmony',
    'Alias note: Harmony',
    'Not merged with Veriphy 18',
    'Not merged with Ampliphy 18',
    'Related-not-merged: Daconil Action / Chlorothalonil',
    'Generic equivalent note (not merged): Densicor',
  ]) {
    assert(sql.includes(note),
      `migration carries alias note: "${note}"`)
  }
}

// ── 5. Seed never touches forbidden surfaces ─────────────────────────────
console.log('— seed never writes inventory / product_catalog / sprays / budget')
{
  const sql = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  // Strip SQL comments before scanning so doc-only mentions don't
  // count as writes.
  const sqlCodeOnly = sql.replace(/^\s*--.*$/gm, '')

  // Only writes the two Phase 7F.1 tables.
  for (const forbidden of [
    'inventory_items', 'inventory_usage', 'product_catalog',
    'spray_records', 'inventory_cost_basis_audit',
    'budget_entries', 'invoices', 'ledger_entries',
  ]) {
    assert(!new RegExp(`\\b${forbidden}\\b`, 'i').test(sqlCodeOnly),
      `seed SQL never references ${forbidden}`)
  }

  // No UPDATE / DELETE in this migration — INSERT OR IGNORE only.
  assert(!/UPDATE\s+\w+\s+SET/i.test(sqlCodeOnly),
    'seed SQL contains no UPDATE statements')
  assert(!/DELETE\s+FROM/i.test(sqlCodeOnly),
    'seed SQL contains no DELETE statements')
  assert(!/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i.test(sqlCodeOnly),
    'seed SQL contains no CREATE/ALTER/DROP — it touches only existing tables')
}

// ── 6. Reference doc exists + carries every required section ─────────────
console.log('— docs/crosswinds-greens-program-2026.md contracts')
{
  let stat = null
  try { stat = statSync('docs/crosswinds-greens-program-2026.md') } catch {}
  assert(!!stat && stat.size > 0,
    'reference doc exists and is non-empty')

  const doc = readFileSync('docs/crosswinds-greens-program-2026.md', 'utf8')

  // Required sections.
  for (const heading of [
    '# Crosswinds Greens Program 2026',
    '## Source document',
    '## Program assumptions',
    '## Architecture invariants preserved',
    '## Annual nutrient summary',
    '## Item count',
    '## Product alias review',
    '## Products needing manual inventory',
    '## Vendor spend + rebate reference',
    '## Re-running the seed',
  ]) {
    assert(doc.includes(heading),
      `doc has heading "${heading}"`)
  }

  // Pilot reference data points.
  const docNorm = doc.replace(/\s+/g, ' ')
  for (const phrase of [
    'Crosswinds Greens Program Recommendations',
    'Vendor: **Vereens Turf Products**',
    'Paul Culclasure',
    '4.85 lbs N',
    '6.33 lbs K',
    'Default greens acreage: **~4 acres**',
    '**do not deduct inventory**',
    'No new tables, no new columns, no new write routes',
  ]) {
    assert(docNorm.includes(phrase),
      `doc references "${phrase}"`)
  }

  // Pilot helper copy from Phase 7Q.1 is reinforced.
  assert(doc.includes('Phase 7F.4 `/completed-link` route'),
    'doc points to the Phase 7F.4 completed-link route as the inventory-deduction bridge')
}

// ── 7. No new worker route / no new write surface added ──────────────────
console.log('— no new endpoint, no new write surface')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/api/spray-programs/import', '/api/spray-programs/seed',
    '/api/programs', '/crosswinds',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }

  // Phase 7F.4 + Phase 7J.1 + Phase 7M.1 still wired.
  assert(/\/completed-link\b/.test(worker),
    'Phase 7F.4 /completed-link route still wired')
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

  // No new export in worker/api/sprayPrograms.js for program-item
  // inventory deduction.
  const sprayProgApi = readFileSync('worker/api/sprayPrograms.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'recordInventoryUsage', 'deductInventory',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'completeProgramItem', 'autoComplete',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(sprayProgApi),
      `worker/api/sprayPrograms.js still never references ${verb}`)
  }
}

// ── 8. Phase 7Q.1 manual-add pilot copy still pins the deduction line ────
console.log('— pilot helper copy still says inventory is NOT deducted from planned programs')
{
  const form = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
  assert(form.includes('Inventory stock is not deducted from planned spray programs.'),
    'ManualProductForm still pins the no-deduction helper copy')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
