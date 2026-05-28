// Phase 7U.1 — Crosswinds cost-basis draft workflow smoke.
//
//   node scripts/smoke-crosswinds-cost-basis-draft.mjs
//
// Locks the review-first guarantees of the prepare + check scripts and
// the draft JSON. No DB, no fetch, no apply.
//
//   - prepare script is READ-ONLY unless --write is passed (a no-flag
//     run does not change the draft file on disk)
//   - prepare + check scripts contain no DB client / fetch / API /
//     inventory-deduction surface
//   - the draft JSON contains expected known products with the right
//     confidence + suggestions
//   - Ampliphy 18 / Veriphy 18 are present as SEPARATE entries
//   - the check script passes (exit 0) on the committed draft
//   - the Crosswinds program still seeds exactly 153 items
//   - no inventory mutation / deduction route was introduced

import { readFileSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

const PREPARE = 'scripts/prepare-crosswinds-cost-basis-draft.mjs'
const CHECK   = 'scripts/check-crosswinds-cost-basis-draft.mjs'
const DRAFT   = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

function hashFile(p) {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex') }
  catch { return null }
}

// ── 1. Script sources are read-only by construction ────────────────────────
console.log('— script sources')
for (const file of [PREPARE, CHECK]) {
  let stat = null
  try { stat = statSync(file) } catch {}
  assert(!!stat && stat.size > 0, `${file} exists and is non-empty`)

  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/wrangler|d1|better-sqlite3|sqlite3|node:sqlite/i.test(code),
    `${file} imports no DB client`)
  assert(!/\bfetch\(/.test(code), `${file} makes no network calls`)
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `${file} never references ${verb}`)
  }
}

// The prepare script writes only behind --write.
{
  const code = readFileSync(PREPARE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const writes = (code.match(/writeFileSync\(/g) ?? []).length
  assert(writes === 1, 'prepare script has exactly one writeFileSync (the draft)', writes)
  assert(/--write/.test(readFileSync(PREPARE, 'utf8')),
    'prepare write path is gated behind --write')
}

// ── 2. Prepare is read-only without --write ────────────────────────────────
console.log('— prepare read-only behavior')
{
  const before = hashFile(DRAFT)
  assert(before != null, 'draft file exists before the no-flag run')
  // Run WITHOUT --write; must not change the file.
  execFileSync('node', [PREPARE], { encoding: 'utf8' })
  const after = hashFile(DRAFT)
  assert(before === after, 'no-flag prepare run leaves the draft file unchanged')

  // --json run also must not write.
  execFileSync('node', [PREPARE, '--json'], { encoding: 'utf8' })
  assert(hashFile(DRAFT) === before, '--json prepare run leaves the draft file unchanged')
}

// ── 3. Draft JSON content ───────────────────────────────────────────────────
console.log('— draft JSON content')
{
  const draft = JSON.parse(readFileSync(DRAFT, 'utf8'))
  assert(draft.schema === 'crosswinds-cost-basis-draft/v1', 'schema tag present')
  assert(Array.isArray(draft.entries) && draft.entries.length > 0,
    'entries present', draft.entries?.length)
  const byName = Object.fromEntries(draft.entries.map(e => [e.productName, e]))

  // Known exact products with a clean suggestion.
  for (const [name, unit] of [['Pendant SC', 'gal'], ['Manzate Max', 'lb'], ['Chlorothalonil 720', 'gal']]) {
    const e = byName[name]
    assert(!!e, `draft contains ${name}`)
    assert(e && e.confidence === 'exact', `${name} is confidence=exact`, e?.confidence)
    assert(e && e.suggestedCostPerUnit != null && e.costUnit === unit,
      `${name} has a suggestion in ${unit}`, e && { sug: e.suggestedCostPerUnit, unit: e.costUnit })
  }

  // Known manual-review products (priced by case/bag) carry no suggestion.
  for (const name of ['Sea Sugar', 'VerdeCal Lime', 'BioRhythym']) {
    const e = byName[name]
    assert(!!e, `draft contains ${name}`)
    assert(e && e.confidence === 'manual-review', `${name} is manual-review`, e?.confidence)
    assert(e && e.suggestedCostPerUnit === null, `${name} has null suggestion`, e?.suggestedCostPerUnit)
  }

  // Ampliphy 18 / Veriphy 18 — present + separate.
  assert(!!byName['Ampliphy 18'] && !!byName['Veriphy 18'],
    'both Ampliphy 18 and Veriphy 18 are present')
  assert(byName['Ampliphy 18'] !== byName['Veriphy 18'],
    'Ampliphy 18 and Veriphy 18 are distinct entries')
  assert(byName['Ampliphy 18']?.inventoryMatchName !== 'Veriphy 18'
      && byName['Veriphy 18']?.inventoryMatchName !== 'Ampliphy 18',
    'neither DO-NOT-MERGE product is linked to the other')

  // No auto-apply surface in the JSON.
  const text = JSON.stringify(draft).toLowerCase()
  for (const banned of ['"applied"', 'deductinventory', 'recordinventoryusage']) {
    assert(!text.includes(banned), `draft JSON has no "${banned}"`)
  }
}

// ── 4. Check script passes on the committed draft ──────────────────────────
console.log('— check script gate')
{
  let exit0 = false
  try { execFileSync('node', [CHECK], { encoding: 'utf8' }); exit0 = true }
  catch { exit0 = false }
  assert(exit0, 'check script passes (exit 0) on the committed draft')
}

// ── 5. Program seed + route invariants unchanged ───────────────────────────
console.log('— invariants')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'Crosswinds seed still defines exactly 153 spray_program_items rows', itemRows.length)

  const sprayProgApi = readFileSync('worker/api/sprayPrograms.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of ['recordInventoryUsage', 'deductInventory', 'completeProgramItem', 'autoComplete']) {
    assert(!new RegExp(`\\b${verb}\\b`).test(sprayProgApi),
      `worker/api/sprayPrograms.js still never references ${verb}`)
  }
  // The cost-basis PATCH remains the single cost write path (Phase 7J.1).
  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired (manual cost write path intact)')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
