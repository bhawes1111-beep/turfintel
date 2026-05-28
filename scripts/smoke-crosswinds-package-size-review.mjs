// Phase 7V.2 — Crosswinds package-size review workflow smoke.
//
//   node scripts/smoke-crosswinds-package-size-review.mjs
//
// Locks the review-only guarantees of the prepare script + review JSON.
// No DB, no network, no apply, no production change.
//
//   - prepare script is READ-ONLY unless --write (a no-flag run does not
//     change the review file on disk)
//   - prepare + scripts carry no DB client / fetch / API / inventory
//     deduction / spray_program_items mutation / cost-apply invocation
//   - review JSON contains expected products with the right grouping
//   - every entry is applyEligible:false (nothing apply-ready)
//   - Ampliphy 18 / Veriphy 18 are present + SEPARATE + do-not-merge
//   - no formula crosses volume↔weight
//   - the check script passes (exit 0)
//   - the Crosswinds program still seeds exactly 153 items

import { readFileSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

const PREPARE = 'scripts/prepare-crosswinds-package-size-review.mjs'
const CHECK   = 'scripts/check-crosswinds-package-size-review.mjs'
const REVIEW  = 'docs/crosswinds-greens-program-2026-package-size-review.json'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function hashFile(p) {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return null }
}

// ── 1. Script sources are read-only by construction ────────────────────────
//
// Both scripts must exist + actually run (no real DB/network execution).
// We scan the PREPARE script's source strictly for mutation verbs; the
// CHECK script is NOT verb-scanned because it legitimately references
// forbidden strings as the literals it tests for (e.g. "deductinventory"
// appears in its banned-list). We confirm the check script is harmless by
// the weaker "no fetch / no real DB import" test below.
console.log('— script sources')
for (const file of [PREPARE, CHECK]) {
  let stat = null
  try { stat = statSync(file) } catch {}
  assert(!!stat && stat.size > 0, `${file} exists and is non-empty`)
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // Neither script makes a real network call or imports a DB driver.
  assert(!/\bfetch\(/.test(code), `${file} makes no network calls`)
  assert(!/from\s+['"](wrangler|better-sqlite3|node:sqlite)['"]/.test(code)
      && !/\bexecSync\(\s*['"`][^'"`]*wrangler/.test(code),
    `${file} imports/executes no DB client`)
}
{
  // PREPARE-only: strict no-mutation-verb scan + write gating.
  const code = readFileSync(PREPARE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code), `prepare script never references ${verb}`)
  }
  assert(!/apply-crosswinds-exact-cost-basis/.test(code),
    'prepare script does not invoke the cost-apply script')
  const writes = (code.match(/writeFileSync\(/g) ?? []).length
  assert(writes === 1, 'prepare script has exactly one writeFileSync (the review)', writes)
  assert(/--write/.test(readFileSync(PREPARE, 'utf8')), 'prepare write path gated behind --write')
}

// ── 2. Prepare is read-only without --write ────────────────────────────────
console.log('— prepare read-only behavior')
{
  const before = hashFile(REVIEW)
  assert(before != null, 'review file exists before the no-flag run')
  execFileSync('node', [PREPARE], { encoding: 'utf8' })
  assert(hashFile(REVIEW) === before, 'no-flag prepare run leaves the review file unchanged')
  execFileSync('node', [PREPARE, '--json'], { encoding: 'utf8' })
  assert(hashFile(REVIEW) === before, '--json prepare run leaves the review file unchanged')
}

// ── 3. Review JSON content ──────────────────────────────────────────────────
console.log('— review JSON content')
{
  const review = JSON.parse(readFileSync(REVIEW, 'utf8'))
  assert(review.schema === 'crosswinds-package-size-review/v1', 'schema tag present')
  const entries = Array.isArray(review.entries) ? review.entries : []
  assert(entries.length > 0, 'entries present', entries.length)
  const byName = Object.fromEntries(entries.map(e => [e.productName, e]))

  // applyEligible false everywhere.
  assert(entries.every(e => e.applyEligible === false),
    'every entry is applyEligible:false')

  // Known liquids-by-case → package-size-needed (gallons per case).
  for (const name of ['Harmony', 'Microtone', 'Sea Sugar', 'PowerChord 0-0-26']) {
    const e = byName[name]
    assert(!!e && e.purchaseUnit === 'case', `${name} is a by-case product`)
    assert(e && /gallons per case/i.test(e.neededInput ?? ''), `${name} needs gallons per case`)
    assert(e && /per gal/i.test(e.formula ?? '') && !/per lb/i.test(e.formula ?? ''),
      `${name} formula is per-gal (no volume↔weight cross)`)
  }

  // Known granulars-by-bag → pounds per bag.
  for (const name of ['VerdeCal Lime', 'Ecolite', 'MycoReplenish', '5-4-5 Greens Grade']) {
    const e = byName[name]
    assert(!!e && e.purchaseUnit === 'bag', `${name} is a by-bag product`)
    assert(e && /pounds per bag/i.test(e.neededInput ?? ''), `${name} needs pounds per bag`)
    assert(e && /per lb/i.test(e.formula ?? '') && !/per gal/i.test(e.formula ?? ''),
      `${name} formula is per-lb (no volume↔weight cross)`)
  }

  // Bundled / by-bottle → standalone-price-needed.
  for (const name of ['Appear', 'Ascernity', 'Fosetyl Al', 'Segway']) {
    const e = byName[name]
    assert(!!e && e.confidence === 'standalone-price-needed', `${name} → standalone-price-needed`, e?.confidence)
  }

  // Ampliphy 18 / Veriphy 18 — present, separate, do-not-merge.
  assert(!!byName['Ampliphy 18'] && !!byName['Veriphy 18'], 'both Ampliphy 18 and Veriphy 18 present')
  assert(byName['Ampliphy 18'] !== byName['Veriphy 18'], 'Ampliphy 18 and Veriphy 18 are distinct entries')
  assert(byName['Ampliphy 18']?.confidence === 'do-not-merge', 'Ampliphy 18 flagged do-not-merge')
  assert(byName['Veriphy 18']?.confidence === 'do-not-merge', 'Veriphy 18 flagged do-not-merge')
  assert(byName['Ampliphy 18']?.inventoryMatchName !== 'Veriphy 18'
      && byName['Veriphy 18']?.inventoryMatchName !== 'Ampliphy 18',
    'neither DO-NOT-MERGE product is linked to the other')

  // Already-costed reference rows exist + need nothing.
  const tm = byName['TM 4.5']
  assert(tm && tm.confidence === 'already-costed' && tm.neededInput == null,
    'already-costed reference row (TM 4.5) needs no input')

  // No formula crosses volume↔weight, globally.
  const crossing = entries.filter(e => e.formula && (
    (e.purchaseUnit === 'case' && /per lb/i.test(e.formula)) ||
    (e.purchaseUnit === 'bag'  && /per gal/i.test(e.formula)) ||
    (e.purchaseUnit === 'pack' && /per gal/i.test(e.formula))
  ))
  assert(crossing.length === 0, 'no formula crosses volume↔weight', crossing.map(e => e.productName))

  // No auto-apply surface.
  const text = JSON.stringify(review).toLowerCase()
  for (const banned of ['"applyeligible":true', 'deductinventory', 'recordinventoryusage']) {
    assert(!text.includes(banned), `review JSON has no "${banned}"`)
  }
}

// ── 4. Check script passes ──────────────────────────────────────────────────
console.log('— check script gate')
{
  let exit0 = false
  try { execFileSync('node', [CHECK], { encoding: 'utf8' }); exit0 = true } catch { exit0 = false }
  assert(exit0, 'check script passes (exit 0)')
}

// ── 5. Program invariant ────────────────────────────────────────────────────
console.log('— invariants')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'Crosswinds seed still defines exactly 153 spray_program_items rows', itemRows.length)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
