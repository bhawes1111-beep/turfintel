// Phase 7V.3 — Calculate a PREVIEW cost-per-unit from the filled-in
// package-size inputs. Preview only — never writes, never applies.
//
//   node scripts/calc-crosswinds-package-size-inputs.mjs            (preview)
//   node scripts/calc-crosswinds-package-size-inputs.mjs --json      (raw JSON)
//
// Reads docs/crosswinds-greens-program-2026-package-size-inputs.json and,
// for any row where Bryan has set a positive `inputValue`, derives the
// suggested cost-per-unit:
//   gal/case → cost per gal = totalCost / (purchaseQuantity × inputValue)
//   lb/bag   → cost per lb  = totalCost / (purchaseQuantity × inputValue)
//   lb/pack  → cost per lb  = totalCost / (purchaseQuantity × inputValue)
//   bottle   → stays needs-standalone-price unless BOTH a standalone
//              price and a bottle size are known (we never guess)
//
// applyEligible stays false everywhere — this is a preview, not an apply.
// No DB, no fetch, no API, no apply-script invocation, no production write.

import { readFileSync } from 'fs'

const INPUTS_FILE = 'docs/crosswinds-greens-program-2026-package-size-inputs.json'
const AS_JSON = process.argv.slice(2).includes('--json')

function asPositive(n) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}
function round2(n) { return Math.round(n * 100) / 100 }

function calcRow(e) {
  const qty   = asPositive(e.purchaseQuantity)
  const total = Number(e.totalCost)
  const input = asPositive(e.inputValue)

  // No input yet → unchanged, still needs input.
  if (input == null) {
    return { ...e, calculatedCostPerUnit: null, status: e.status }
  }
  // Standalone-price / name-reconcile rows are not unblocked by a package
  // size alone — keep their status, never fabricate a cost.
  if (e.status === 'needs-standalone-price' || e.status === 'needs-name-reconcile') {
    return { ...e, calculatedCostPerUnit: null }
  }
  if (qty == null || !Number.isFinite(total) || total <= 0) {
    return { ...e, calculatedCostPerUnit: null, status: 'needs-input' }
  }

  // gal/case, lb/bag, lb/pack all reduce to total / (qty × packageSize).
  if (e.inputUnit === 'gal/case' || e.inputUnit === 'lb/bag' || e.inputUnit === 'lb/pack') {
    const totalUnits = qty * input
    if (totalUnits <= 0) return { ...e, calculatedCostPerUnit: null, status: 'needs-input' }
    const perUnit = round2(total / totalUnits)
    return {
      ...e,
      calculatedCostPerUnit: perUnit,
      calculatedCostUnit: e.calculatedCostUnit ?? (e.inputUnit.startsWith('gal') ? 'gal' : 'lb'),
      status: 'calculated-preview',
      // applyEligible STILL false — this is a preview, not an apply.
      applyEligible: false,
    }
  }

  // Anything else (bottle / unknown) is not safely derivable from a single
  // package size — leave it needing more input.
  return { ...e, calculatedCostPerUnit: null }
}

function main() {
  const doc = JSON.parse(readFileSync(INPUTS_FILE, 'utf8'))
  const entries = Array.isArray(doc.entries) ? doc.entries : []
  const calculated = entries.map(calcRow)

  // Safety: applyEligible must remain false on every row.
  const eligible = calculated.filter(e => e.applyEligible === true)
  if (eligible.length > 0) {
    console.error('✗ Refusing — calc produced applyEligible:true rows (must never happen):',
      eligible.map(e => e.productName))
    process.exit(1)
  }

  const previews = calculated.filter(e => e.calculatedCostPerUnit != null)

  if (AS_JSON) {
    process.stdout.write(JSON.stringify({ ...doc, entries: calculated }, null, 2) + '\n')
    return
  }

  const L = []
  L.push('— Crosswinds package-size inputs — calculated PREVIEW (no apply)')
  L.push('')
  const withInput = calculated.filter(e => asPositive(e.inputValue) != null)
  L.push(`Rows with inputValue set: ${withInput.length} of ${calculated.length}`)
  L.push(`Rows previewed:           ${previews.length}`)
  L.push('')
  if (previews.length === 0) {
    L.push('No inputValue filled in yet. Edit')
    L.push(`  ${INPUTS_FILE}`)
    L.push('and set inputValue (gallons per case / pounds per bag / pounds per pack),')
    L.push('then re-run this script to preview the derived cost-per-unit.')
  } else {
    for (const e of previews) {
      L.push(`  • ${e.productName}: ${e.purchaseQuantity} ${e.purchaseUnit} @ $${e.totalCost}`)
      L.push(`      input ${e.inputValue} ${e.inputUnit} → $${e.calculatedCostPerUnit}/${e.calculatedCostUnit} (PREVIEW — not applied)`)
    }
  }
  L.push('')
  L.push('Preview only. applyEligible remains false on every row.')
  process.stdout.write(L.join('\n') + '\n')
}

main()
