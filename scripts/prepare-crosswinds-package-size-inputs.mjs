// Phase 7V.3 — Prepare a FILL-IN package-size input draft for the
// remaining Crosswinds Greens Program 2026 products.
//
//   node scripts/prepare-crosswinds-package-size-inputs.mjs            (preview)
//   node scripts/prepare-crosswinds-package-size-inputs.mjs --write     (write JSON)
//   node scripts/prepare-crosswinds-package-size-inputs.mjs --json      (raw JSON)
//
// READ-ONLY. Reads the Phase 7V.2 package-size review
// (docs/crosswinds-greens-program-2026-package-size-review.json) and
// produces an editable worksheet where Bryan fills `inputValue` (gallons
// per case / pounds per bag / etc). The companion calc script then
// previews the derived cost-per-unit. Writes NOTHING unless --write.
//
// Hard guarantees (smoke-locked):
//   - no DB client, no fetch, no API, no inventory mutation
//   - already-costed entries are EXCLUDED (they need no input)
//   - every entry is applyEligible:false, status starts 'needs-input'
//   - Ampliphy 18 / Veriphy 18 stay separate
//   - no cost-apply script invoked

import { readFileSync, writeFileSync } from 'fs'

const REVIEW_FILE = 'docs/crosswinds-greens-program-2026-package-size-review.json'
const INPUTS_FILE = 'docs/crosswinds-greens-program-2026-package-size-inputs.json'

const args = process.argv.slice(2)
const WRITE   = args.includes('--write')
const AS_JSON = args.includes('--json')

const DO_NOT_MERGE = new Set(['Ampliphy 18', 'Veriphy 18'])

// Map a review entry → the input unit + formula the calc step will use.
// case → gal, bag/pack → lb, bottle → oz (size unknown), none → standalone.
function inputPlan(entry) {
  switch (entry.purchaseUnit) {
    case 'case':
      return {
        inputUnit: 'gal/case',
        calculatedCostUnit: 'gal',
        formula: 'cost per gal = totalCost / (purchaseQuantity × inputValue[gal/case])',
        status: 'needs-input',
      }
    case 'bag':
      return {
        inputUnit: 'lb/bag',
        calculatedCostUnit: 'lb',
        formula: 'cost per lb = totalCost / (purchaseQuantity × inputValue[lb/bag])',
        status: 'needs-input',
      }
    case 'pack':
      return {
        inputUnit: 'lb/pack',
        calculatedCostUnit: 'lb',
        formula: 'cost per lb = totalCost / (purchaseQuantity × inputValue[lb/pack])',
        status: 'needs-input',
      }
    case 'bottle':
      return {
        inputUnit: 'oz/bottle',
        calculatedCostUnit: null,   // resolved once size + standalone price known
        formula: 'cost per gal = totalCost / (purchaseQuantity × inputValue[gal/bottle]); confirm standalone price first',
        status: 'needs-standalone-price',
      }
    default:
      return null  // 'none' / unpriced — handled below
  }
}

function buildInputs() {
  const review = JSON.parse(readFileSync(REVIEW_FILE, 'utf8'))
  const entries = Array.isArray(review.entries) ? review.entries : []

  const out = []
  for (const e of entries) {
    // EXCLUDE already-costed — they need no input.
    if (e.confidence === 'already-costed') continue

    const doNotMerge = DO_NOT_MERGE.has(e.productName)
    let inputUnit, calculatedCostUnit, formula, status
    const notes = []

    const hasPricing = e.totalCost != null && e.purchaseUnit != null
    const plan = hasPricing ? inputPlan(e) : null

    if (e.confidence === 'alias-review') {
      // Price is already clean ($/gal); the BLOCKER is the name, not a
      // package size. No inputValue needed — reconcile the name instead.
      inputUnit = null
      calculatedCostUnit = e.purchaseUnit === 'gal' ? 'gal' : null
      formula = 'cost per unit = totalCost / purchaseQuantity (already clean once the name is reconciled)'
      status = 'needs-name-reconcile'
      notes.push(e.notes || 'Reconcile the program name with the inventory row name before costing.')
    } else if (!hasPricing) {
      // Bundled / unpriced → standalone price first.
      inputUnit = null
      calculatedCostUnit = null
      formula = 'cost per unit = standalone price / package size (once both known)'
      status = 'needs-standalone-price'
      notes.push(e.notes || 'No standalone price in the source document.')
    } else if (plan) {
      inputUnit = plan.inputUnit
      calculatedCostUnit = plan.calculatedCostUnit
      formula = plan.formula
      status = plan.status
      notes.push(e.notes || '')
    } else {
      // Defensive fallback — should not happen given the review shape.
      inputUnit = null
      calculatedCostUnit = null
      formula = 'unsupported — review manually'
      status = 'needs-standalone-price'
      notes.push(e.notes || '')
    }

    if (doNotMerge) {
      notes.push('DO NOT MERGE Ampliphy 18 and Veriphy 18 — separate products; fill in each independently.')
    }

    out.push({
      productName: e.productName,
      inventoryMatchName: e.inventoryMatchName ?? null,
      vendor: e.vendor,
      purchaseQuantity: e.purchaseQuantity ?? null,
      purchaseUnit: e.purchaseUnit ?? null,
      totalCost: e.totalCost ?? null,
      neededInput: e.neededInput ?? null,
      inputValue: null,                       // ← Bryan fills this in
      inputUnit,
      formula,
      calculatedCostPerUnit: null,            // ← calc script derives once inputValue is set
      calculatedCostUnit,
      status,
      applyEligible: false,
      notes: notes.filter(Boolean).join(' '),
    })
  }

  out.sort((a, b) => a.productName.localeCompare(b.productName))

  const counts = {
    total: out.length,
    galPerCase: out.filter(e => e.inputUnit === 'gal/case').length,
    lbPerBag:   out.filter(e => e.inputUnit === 'lb/bag').length,
    lbPerPack:  out.filter(e => e.inputUnit === 'lb/pack').length,
    bottle:     out.filter(e => e.purchaseUnit === 'bottle').length,
    standalonePrice: out.filter(e => e.status === 'needs-standalone-price').length,
    nameReconcile:   out.filter(e => e.status === 'needs-name-reconcile').length,
  }

  return {
    schema: 'crosswinds-package-size-inputs/v1',
    generatedAt: new Date().toISOString(),
    source: REVIEW_FILE,
    disclaimer: [
      'FILL-IN worksheet for human input only.',
      'Set inputValue (gallons per case, pounds per bag, etc) for each row,',
      'then run scripts/calc-crosswinds-package-size-inputs.mjs to preview cost.',
      'Nothing here is applied to inventory or the database. applyEligible is false.',
      'No formula crosses volume↔weight. Ampliphy 18 / Veriphy 18 are separate.',
    ].join(' '),
    counts,
    entries: out,
  }
}

const inputs = buildInputs()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(inputs, null, 2) + '\n')
} else {
  const L = []
  L.push('— Crosswinds Greens Program 2026 — package-size INPUT draft (fill in inputValue)')
  L.push('')
  L.push(`Entries (already-costed excluded): ${inputs.counts.total}`)
  L.push(`  gal/case:          ${inputs.counts.galPerCase}`)
  L.push(`  lb/bag:            ${inputs.counts.lbPerBag}`)
  L.push(`  lb/pack:           ${inputs.counts.lbPerPack}`)
  L.push(`  bottle:            ${inputs.counts.bottle}`)
  L.push(`  needs standalone price: ${inputs.counts.standalonePrice}`)
  L.push(`  needs name reconcile:   ${inputs.counts.nameReconcile}`)
  L.push('')
  for (const e of inputs.entries) {
    const buy = e.totalCost != null ? `${e.purchaseQuantity} ${e.purchaseUnit} @ $${e.totalCost}` : '(no standalone price)'
    L.push(`  • ${e.productName}  [${e.status}]  inputUnit=${e.inputUnit ?? '—'}`)
    L.push(`      vendor=${e.vendor}  buy=${buy}  inputValue=${e.inputValue ?? 'null (fill in)'}`)
  }
  L.push('')
  L.push(WRITE ? `Writing ${INPUTS_FILE} …` : `(preview only — pass --write to save ${INPUTS_FILE})`)
  process.stdout.write(L.join('\n') + '\n')
}

if (WRITE) {
  writeFileSync(INPUTS_FILE, JSON.stringify(inputs, null, 2) + '\n', 'utf8')
  process.stderr.write(`\nWrote ${INPUTS_FILE}\n`)
}
