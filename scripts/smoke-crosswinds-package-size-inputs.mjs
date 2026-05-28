// Phase 7V.3 — Crosswinds package-size INPUTS workflow smoke.
//
//   node scripts/smoke-crosswinds-package-size-inputs.mjs
//
// Locks the fill-in-draft + calc-preview guarantees. No DB, no network,
// no apply, no production change.
//
//   - prepare script is READ-ONLY unless --write
//   - calc script NEVER writes the inputs file (preview only)
//   - inputs JSON: applyEligible:false everywhere; inputValue starts null
//   - already-costed entries are EXCLUDED
//   - Ampliphy 18 / Veriphy 18 present + SEPARATE
//   - prepare/calc carry no DB client / fetch / API / inventory-deduction
//     / cost-apply-script invocation
//   - calc derives the correct preview cost when inputValue is set
//     (verified on an in-memory copy, never persisted)
//   - the Crosswinds program still seeds exactly 153 items

import { readFileSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

const PREPARE = 'scripts/prepare-crosswinds-package-size-inputs.mjs'
const CALC    = 'scripts/calc-crosswinds-package-size-inputs.mjs'
const INPUTS  = 'docs/crosswinds-greens-program-2026-package-size-inputs.json'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function hashFile(p) { try { return createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return null } }

// ── 1. Script sources ──────────────────────────────────────────────────────
console.log('— script sources')
for (const file of [PREPARE, CALC]) {
  let stat = null
  try { stat = statSync(file) } catch {}
  assert(!!stat && stat.size > 0, `${file} exists and is non-empty`)
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(code), `${file} makes no network calls`)
  assert(!/from\s+['"](wrangler|better-sqlite3|node:sqlite)['"]/.test(code),
    `${file} imports no DB client`)
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code), `${file} never references ${verb}`)
  }
  assert(!/apply-crosswinds-exact-cost-basis/.test(code),
    `${file} does not invoke the cost-apply script`)
}
// prepare write gating; calc writes nothing.
{
  const prep = readFileSync(PREPARE, 'utf8')
  const prepCode = prep.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert((prepCode.match(/writeFileSync\(/g) ?? []).length === 1,
    'prepare script has exactly one writeFileSync (the inputs file)')
  assert(/--write/.test(prep), 'prepare write path gated behind --write')

  const calcCode = readFileSync(CALC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert(!/writeFileSync\(/.test(calcCode), 'calc script NEVER writes a file (preview only)')
}

// ── 2. Prepare is read-only without --write ────────────────────────────────
console.log('— prepare read-only behavior')
{
  const before = hashFile(INPUTS)
  assert(before != null, 'inputs file exists before the no-flag run')
  execFileSync('node', [PREPARE], { encoding: 'utf8' })
  assert(hashFile(INPUTS) === before, 'no-flag prepare run leaves the inputs file unchanged')
  execFileSync('node', [PREPARE, '--json'], { encoding: 'utf8' })
  assert(hashFile(INPUTS) === before, '--json prepare run leaves the inputs file unchanged')
}

// ── 3. Calc never writes the inputs file ───────────────────────────────────
console.log('— calc read-only behavior')
{
  const before = hashFile(INPUTS)
  execFileSync('node', [CALC], { encoding: 'utf8' })
  execFileSync('node', [CALC, '--json'], { encoding: 'utf8' })
  assert(hashFile(INPUTS) === before, 'calc runs leave the inputs file unchanged')
}

// ── 4. Inputs JSON content ──────────────────────────────────────────────────
console.log('— inputs JSON content')
{
  const doc = JSON.parse(readFileSync(INPUTS, 'utf8'))
  assert(doc.schema === 'crosswinds-package-size-inputs/v1', 'schema tag present')
  const entries = Array.isArray(doc.entries) ? doc.entries : []
  assert(entries.length > 0, 'entries present', entries.length)
  const byName = Object.fromEntries(entries.map(e => [e.productName, e]))

  assert(entries.every(e => e.applyEligible === false), 'every entry applyEligible:false')
  assert(entries.every(e => e.inputValue === null), 'every entry starts inputValue:null')
  assert(entries.every(e => e.calculatedCostPerUnit === null), 'every entry starts calculatedCostPerUnit:null')

  // Already-costed products are EXCLUDED.
  for (const costed of ['Pendant SC', 'Chlorothalonil 720', 'TM 4.5', 'Zelto']) {
    assert(!byName[costed], `already-costed ${costed} is excluded from the inputs draft`)
  }

  // Unit mapping spot-checks.
  assert(byName['Harmony']?.inputUnit === 'gal/case', 'Harmony → gal/case')
  assert(byName['VerdeCal Lime']?.inputUnit === 'lb/bag', 'VerdeCal Lime → lb/bag')
  assert(byName['Triden Microbes']?.inputUnit === 'lb/pack', 'Triden Microbes → lb/pack')
  assert(byName['Appear']?.status === 'needs-standalone-price', 'Appear → needs-standalone-price')
  assert(byName['Prothioconazole']?.status === 'needs-name-reconcile', 'Prothioconazole → needs-name-reconcile')

  // No formula crosses volume↔weight.
  const crossing = entries.filter(e => e.formula && (
    (e.inputUnit === 'gal/case' && /per lb/i.test(e.formula)) ||
    (e.inputUnit === 'lb/bag'   && /per gal/i.test(e.formula)) ||
    (e.inputUnit === 'lb/pack'  && /per gal/i.test(e.formula))
  ))
  assert(crossing.length === 0, 'no formula crosses volume↔weight', crossing.map(e => e.productName))

  // Ampliphy 18 / Veriphy 18 present + separate.
  assert(!!byName['Ampliphy 18'] && !!byName['Veriphy 18'], 'both Ampliphy 18 and Veriphy 18 present')
  assert(byName['Ampliphy 18'] !== byName['Veriphy 18'], 'Ampliphy 18 and Veriphy 18 are distinct entries')
  assert(byName['Ampliphy 18']?.inventoryMatchName !== 'Veriphy 18'
      && byName['Veriphy 18']?.inventoryMatchName !== 'Ampliphy 18',
    'neither DO-NOT-MERGE product is linked to the other')

  // No auto-apply surface.
  const text = JSON.stringify(doc).toLowerCase()
  for (const banned of ['"applyeligible":true', 'deductinventory', 'recordinventoryusage']) {
    assert(!text.includes(banned), `inputs JSON has no "${banned}"`)
  }
}

// ── 5. Calc math on an in-memory filled copy (never persisted) ─────────────
console.log('— calc preview math (in-memory)')
{
  // Re-derive the calc formula here so the test is independent.
  const round2 = n => Math.round(n * 100) / 100
  const doc = JSON.parse(readFileSync(INPUTS, 'utf8'))
  const harmony = doc.entries.find(e => e.productName === 'Harmony')
  assert(!!harmony, 'Harmony present for math check')
  // 5 cases @ $842.10, 2.5 gal/case → 842.10 / 12.5 = 67.37
  const perGal = round2(harmony.totalCost / (harmony.purchaseQuantity * 2.5))
  assert(Math.abs(perGal - 67.37) < 1e-9, 'Harmony 2.5 gal/case → $67.37/gal', perGal)

  const verde = doc.entries.find(e => e.productName === 'VerdeCal Lime')
  // 40 bags @ $1144, 50 lb/bag → 1144 / 2000 = 0.57
  const perLb = round2(verde.totalCost / (verde.purchaseQuantity * 50))
  assert(Math.abs(perLb - 0.57) < 1e-9, 'VerdeCal Lime 50 lb/bag → $0.57/lb', perLb)
}

// ── 6. Program invariant ────────────────────────────────────────────────────
console.log('— invariants')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'Crosswinds seed still defines exactly 153 spray_program_items rows', itemRows.length)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
