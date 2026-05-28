// Phase 7T.1 — Crosswinds Greens Program product + cost-basis audit smoke.
//
//   node scripts/smoke-crosswinds-greens-program-product-audit.mjs
//
// Locks:
//   - the audit script exists and runs to completion (exit 0)
//   - it emits valid JSON with the expected shape under --json
//   - the audit is READ-ONLY: the script never imports a DB client,
//     never opens a network/D1 connection, and writes nothing on disk
//     except the doc under the explicit --write-doc flag
//   - the Crosswinds 2026 program still seeds exactly 153 items
//   - the audit parses all 153 items (parser correctness regression)
//   - no inventory mutation route was added (worker/api/inventory.js +
//     worker/api/sprayPrograms.js still avoid deduction/budget verbs)
//   - Phase 7F.4 + 7J.1 + 7M.1 cross-surface guards still hold
//   - the audit doc exists and pins the read-only stewardship framing

import { readFileSync, statSync } from 'fs'
import { execFileSync } from 'child_process'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const SCRIPT = 'scripts/audit-crosswinds-greens-program-products.mjs'

// ── 1. Script exists + source is read-only ────────────────────────────────
console.log('— audit script source')
{
  let stat = null
  try { stat = statSync(SCRIPT) } catch {}
  assert(!!stat && stat.size > 0, 'audit script exists and is non-empty')

  const src = readFileSync(SCRIPT, 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // No DB / network clients — the audit reads committed SQL files only.
  assert(!/wrangler|d1|better-sqlite3|sqlite3|node:sqlite/i.test(code),
    'audit script imports no DB client')
  assert(!/\bfetch\(/.test(code), 'audit script makes no network calls')

  // The only filesystem write is the doc, and only behind --write-doc.
  assert(/--write-doc/.test(src),
    'doc write is gated behind --write-doc flag')
  // writeFileSync appears exactly once (the doc) — no stray writes.
  const writes = (code.match(/writeFileSync\(/g) ?? []).length
  assert(writes === 1, 'exactly one writeFileSync (the doc, flag-gated)', writes)

  // No mutation / deduction vocabulary.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `audit script never references ${verb}`)
  }
}

// ── 2. Script runs + emits expected JSON ───────────────────────────────────
console.log('— audit script runtime (--json)')
{
  let out = ''
  let ran = false
  try {
    out = execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8' })
    ran = true
  } catch (e) {
    console.error('    audit run failed:', e.message)
  }
  assert(ran, 'audit script runs to completion (exit 0)')

  let audit = null
  try { audit = JSON.parse(out) } catch {}
  assert(!!audit, 'audit emits valid JSON under --json')

  if (audit) {
    assert(audit.totalProgramItems === 153,
      'audit parses all 153 program items', audit.totalProgramItems)
    assert(typeof audit.totalUniqueProducts === 'number' && audit.totalUniqueProducts > 0,
      'audit reports a positive unique-product count', audit.totalUniqueProducts)
    assert(Array.isArray(audit.products) && audit.products.length === audit.totalUniqueProducts,
      'products array length matches unique-product count')
    assert(audit.rollup && typeof audit.rollup.missingCostBasis === 'number',
      'rollup carries a missingCostBasis count')
    assert(Array.isArray(audit.aliasReview) && audit.aliasReview.length >= 10,
      'alias review carries the manual hint groups', audit.aliasReview?.length)

    // The DO-NOT-MERGE pair is flagged and never collapsed.
    const dnm = audit.aliasReview.find(g => /do not merge/i.test(g.group))
    assert(!!dnm && dnm.doNotMerge === true,
      'Ampliphy 18 / Veriphy 18 group is flagged DO NOT MERGE')

    // Every product carries a flags array (audit, not auto-fix).
    assert(audit.products.every(p => Array.isArray(p.flags)),
      'every product carries a flags array')

    // No product was auto-created an inventory row or merged — the audit
    // only reports. Sanity: cost basis is never "found" given the 0021
    // refresh sets all cost_per_unit NULL.
    assert(audit.products.every(p => p.costBasisFound === false),
      'no product reports a (non-existent) cost basis as found')
  }
}

// ── 3. Program seed still has exactly 153 items ────────────────────────────
console.log('— Crosswinds 2026 seed — item count invariant')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'seed still defines exactly 153 spray_program_items rows', itemRows.length)
}

// ── 4. No inventory mutation / deduction route added ───────────────────────
console.log('— cross-surface route invariants')
{
  const invApi = readFileSync('worker/api/inventory.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(invApi),
      `worker/api/inventory.js still never references ${verb}`)
  }

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

  // Phase 7F.4 /completed-link remains the sole linked_spray_record_id
  // write site.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // Phase 7J.1 + 7M.1 cost-basis wiring intact.
  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')
}

// ── 5. Audit doc exists + pins read-only framing ───────────────────────────
console.log('— audit doc')
{
  const doc = readFileSync('docs/crosswinds-greens-program-2026-product-audit.md', 'utf8')
  assert(/Product \+ Cost Basis Audit/i.test(doc),
    'doc has the audit title')
  assert(/no database writes/i.test(doc) && /no auto-merges/i.test(doc),
    'doc pins read-only / no-auto-merge framing')
  assert(/DO NOT MERGE/i.test(doc),
    'doc preserves the DO NOT MERGE alias guidance')
  assert(/Recommended manual cleanup order/i.test(doc),
    'doc includes the recommended manual cleanup order')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
