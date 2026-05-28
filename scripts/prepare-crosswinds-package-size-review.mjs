// Phase 7V.2 — Prepare a PACKAGE-SIZE review for the Crosswinds Greens
// Program 2026 products that have vendor pricing but need a package size
// (gallons per case / pounds per bag / bottle size) before a cost basis
// can be safely derived.
//
//   node scripts/prepare-crosswinds-package-size-review.mjs            (preview)
//   node scripts/prepare-crosswinds-package-size-review.mjs --write     (write JSON)
//   node scripts/prepare-crosswinds-package-size-review.mjs --json      (raw JSON)
//
// READ-ONLY. Reads the Phase 7U.1 cost-basis draft
// (docs/crosswinds-greens-program-2026-cost-basis-draft.json) and
// reshapes the manual-review entries into a package-size worksheet for
// Bryan. Writes NOTHING unless --write (then only the review JSON).
//
// Hard guarantees (smoke-locked):
//   - no DB client, no fetch, no API, no inventory mutation
//   - every entry is applyEligible:false (this is review prep, not apply)
//   - no formula crosses volume↔weight
//   - Ampliphy 18 / Veriphy 18 stay separate, flagged do-not-merge

import { readFileSync, writeFileSync } from 'fs'

const DRAFT_FILE  = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'
const REVIEW_FILE = 'docs/crosswinds-greens-program-2026-package-size-review.json'

const args = process.argv.slice(2)
const WRITE   = args.includes('--write')
const AS_JSON = args.includes('--json')

const DO_NOT_MERGE = new Set(['Ampliphy 18', 'Veriphy 18'])

// Per-package-unit conversion plan. Each maps the vendor purchase unit to
// the input Bryan must supply + the resulting per-cost-unit formula. We
// NEVER cross volume↔weight: case→gal, bag→lb, pack→lb, bottle→(size).
function planForUnit(unit) {
  switch (unit) {
    case 'case':
      return {
        knownPackageSize: null, packageSizeUnit: 'gal/case',
        neededInput: 'gallons per case',
        formula: 'cost per gal = totalCost / (purchaseQuantity × gallons-per-case)',
        confidence: 'package-size-needed',
      }
    case 'bag':
      return {
        knownPackageSize: null, packageSizeUnit: 'lb/bag',
        neededInput: 'pounds per bag',
        formula: 'cost per lb = totalCost / (purchaseQuantity × pounds-per-bag)',
        confidence: 'package-size-needed',
      }
    case 'pack':
      return {
        knownPackageSize: null, packageSizeUnit: 'lb/pack',
        neededInput: 'pounds per pack',
        formula: 'cost per lb = totalCost / (purchaseQuantity × pounds-per-pack)',
        confidence: 'package-size-needed',
      }
    case 'bottle':
      return {
        knownPackageSize: null, packageSizeUnit: 'gal/bottle (or lb/bottle)',
        neededInput: 'bottle size + standalone price if available',
        formula: 'cost per gal = totalCost / (purchaseQuantity × gallons-per-bottle)',
        confidence: 'standalone-price-needed',
      }
    default:
      return null
  }
}

function buildReview() {
  const draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'))
  const entries = Array.isArray(draft.entries) ? draft.entries : []

  const review = []

  for (const e of entries) {
    if (e.confidence === 'exact') {
      // Already-costed reference rows (excluded from apply, kept for
      // transparency so the worksheet is a complete picture).
      review.push({
        productName: e.productName,
        inventoryMatchName: e.inventoryMatchName,
        vendor: e.vendor,
        purchaseQuantity: e.purchaseQuantity,
        purchaseUnit: e.purchaseUnit,
        totalCost: e.totalCost,
        knownPackageSize: null,
        packageSizeUnit: null,
        neededInput: null,
        formula: null,
        confidence: 'already-costed',
        applyEligible: false,
        notes: `Already costed at $${e.suggestedCostPerUnit}/${e.costUnit} (Phase 7U.3). No package-size input needed.`,
      })
      continue
    }

    // manual-review entries.
    const doNotMerge = DO_NOT_MERGE.has(e.productName)
    const hasPricing = e.totalCost != null && e.purchaseUnit != null

    let plan = hasPricing ? planForUnit(e.purchaseUnit) : null
    let confidence
    let neededInput
    let formula
    let packageSizeUnit
    const notes = []

    if (!hasPricing) {
      // Bundled / unpriced (Appear, Appear II, Ascernity, Daconil Action,
      // Secure Action, Veriphy 18) — needs a standalone price first.
      confidence = 'standalone-price-needed'
      neededInput = 'standalone vendor price (currently bundled / unpriced)'
      formula = 'cost per unit = standalone price / package size (once both known)'
      packageSizeUnit = null
      notes.push(e.notes || 'No standalone price in the source document.')
    } else if (plan) {
      confidence = plan.confidence
      neededInput = plan.neededInput
      formula = plan.formula
      packageSizeUnit = plan.packageSizeUnit
      notes.push(e.notes || '')
    } else {
      // Clean per-unit price (e.g. Prothioconazole 1 gal/$1320) but no
      // exact inventory name match → it is the NAME that needs cleanup,
      // not a package size.
      confidence = 'alias-review'
      neededInput = 'reconcile program name with inventory row name, then it can be costed directly'
      formula = `cost per ${e.costUnit ?? 'unit'} = totalCost / purchaseQuantity (already clean: $${e.suggestedCostPerUnit ?? '?'}/${e.costUnit ?? '?'})`
      packageSizeUnit = null
      notes.push(e.notes || '')
    }

    if (!e.inventoryMatchName && confidence !== 'standalone-price-needed' && confidence !== 'alias-review') {
      notes.push('No inventory row matches this program name yet — create or link it before applying.')
    }
    if (doNotMerge) {
      confidence = 'do-not-merge'
      notes.push('DO NOT MERGE Ampliphy 18 and Veriphy 18 — separate products. Price each independently.')
    }

    review.push({
      productName: e.productName,
      inventoryMatchName: e.inventoryMatchName ?? null,
      vendor: e.vendor,
      purchaseQuantity: e.purchaseQuantity ?? null,
      purchaseUnit: e.purchaseUnit ?? null,
      totalCost: e.totalCost ?? null,
      knownPackageSize: null,
      packageSizeUnit,
      neededInput,
      formula,
      confidence,
      applyEligible: false,
      notes: notes.filter(Boolean).join(' '),
    })
  }

  review.sort((a, b) => a.productName.localeCompare(b.productName))

  const counts = {
    total: review.length,
    packageSizeNeeded: review.filter(r => r.confidence === 'package-size-needed').length,
    standalonePriceNeeded: review.filter(r => r.confidence === 'standalone-price-needed').length,
    aliasReview: review.filter(r => r.confidence === 'alias-review').length,
    doNotMerge: review.filter(r => r.confidence === 'do-not-merge').length,
    alreadyCosted: review.filter(r => r.confidence === 'already-costed').length,
    liquidsByCase: review.filter(r => r.purchaseUnit === 'case').length,
    granularsByBag: review.filter(r => r.purchaseUnit === 'bag').length,
    bottles: review.filter(r => r.purchaseUnit === 'bottle').length,
    packs: review.filter(r => r.purchaseUnit === 'pack').length,
  }

  return {
    schema: 'crosswinds-package-size-review/v1',
    generatedAt: new Date().toISOString(),
    source: 'docs/crosswinds-greens-program-2026-cost-basis-draft.json',
    disclaimer: [
      'PACKAGE-SIZE review worksheet for human input only.',
      'Nothing here is applied to inventory or the database.',
      'applyEligible is false on every row — fill in package sizes first.',
      'No formula crosses volume↔weight. Aliases are not merged.',
    ].join(' '),
    counts,
    entries: review,
  }
}

const review = buildReview()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(review, null, 2) + '\n')
} else {
  const L = []
  L.push('— Crosswinds Greens Program 2026 — package-size review (input needed)')
  L.push('')
  L.push(`Entries:                 ${review.counts.total}`)
  L.push(`  package-size-needed:   ${review.counts.packageSizeNeeded}`)
  L.push(`  standalone-price-needed: ${review.counts.standalonePriceNeeded}`)
  L.push(`  alias-review:          ${review.counts.aliasReview}`)
  L.push(`  do-not-merge:          ${review.counts.doNotMerge}`)
  L.push(`  already-costed:        ${review.counts.alreadyCosted}`)
  L.push(`  (liquids by case: ${review.counts.liquidsByCase}, granulars by bag: ${review.counts.granularsByBag}, bottles: ${review.counts.bottles}, packs: ${review.counts.packs})`)
  L.push('')
  for (const r of review.entries) {
    if (r.confidence === 'already-costed') continue
    const buy = r.totalCost != null ? `${r.purchaseQuantity} ${r.purchaseUnit} @ $${r.totalCost}` : '(no standalone price)'
    L.push(`  • ${r.productName}  [${r.confidence}]`)
    L.push(`      vendor=${r.vendor}  buy=${buy}`)
    L.push(`      needs: ${r.neededInput}`)
    if (r.formula) L.push(`      formula: ${r.formula}`)
  }
  L.push('')
  L.push(WRITE ? `Writing ${REVIEW_FILE} …` : `(preview only — pass --write to save ${REVIEW_FILE})`)
  process.stdout.write(L.join('\n') + '\n')
}

if (WRITE) {
  writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2) + '\n', 'utf8')
  process.stderr.write(`\nWrote ${REVIEW_FILE}\n`)
}
