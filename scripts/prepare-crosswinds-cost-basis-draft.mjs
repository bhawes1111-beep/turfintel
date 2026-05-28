// Phase 7U.1 — Prepare a SUGGESTED cost-basis draft for the Crosswinds
// Greens Program 2026. REVIEW-FIRST, never apply.
//
//   node scripts/prepare-crosswinds-cost-basis-draft.mjs            (preview)
//   node scripts/prepare-crosswinds-cost-basis-draft.mjs --write     (write JSON)
//   node scripts/prepare-crosswinds-cost-basis-draft.mjs --json      (raw JSON to stdout)
//
// What it does:
//   - reads the Phase 7T.1 product audit (live, via the audit script's
//     --json output) to get the program's unique products + which
//     inventory rows they match + alias-review groups
//   - joins that against the vendor pricing transcribed from
//     docs/crosswinds-greens-program-2026.md ("Vendor spend + rebate
//     reference") — the ONLY price source; this script invents nothing
//   - emits one draft entry per priced product with a SUGGESTED
//     cost-per-unit, but ONLY when the purchase unit is unambiguous
//     (clean gal / lb). Cases, bags-without-weight, bottles, and
//     bundled line items are flagged confidence='manual-review' with
//     suggestedCostPerUnit=null — we do not guess a conversion.
//
// Hard guarantees (smoke-locked):
//   - no DB client, no fetch, no API calls, no inventory mutation
//   - writes NOTHING unless --write is passed (then only the draft JSON)
//   - never merges aliases; DO-NOT-MERGE pairs stay separate entries
//   - this is a DRAFT for human review — it does not apply cost basis

import { readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'

const DRAFT_FILE = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'
const SOURCE_DOC = 'Crosswinds Greens Program 2026'

const args = process.argv.slice(2)
const WRITE   = args.includes('--write')
const AS_JSON = args.includes('--json')

// ── Vendor pricing, transcribed verbatim from ─────────────────────────────
// docs/crosswinds-greens-program-2026.md → "Vendor spend + rebate
// reference (NOT stored in D1)". Each row records exactly what the
// document says: vendor, purchase quantity + unit, and total cost.
//
// `unitClean` marks whether purchaseUnit is a direct measure (gal / lb)
// that divides cleanly into a per-unit price. Cases / bags / bottles /
// bundled rows are NOT clean — purchaseQuantity is a package count, not
// a measured volume/weight, so totalCost / count is a per-package price,
// not a per-gal / per-lb price comparable to the program's rate units.
const VENDOR_PRICING = [
  // Qualipro — clean liquid/weight purchases
  { productName: 'Tebuconazole 3.6F',  vendor: 'Qualipro', purchaseQuantity: 1,    purchaseUnit: 'gal', totalCost: 92.50,   unitClean: true },
  { productName: 'Contrado',           vendor: 'Qualipro', purchaseQuantity: 0.75, purchaseUnit: 'gal', totalCost: 1100.00, unitClean: true },
  { productName: 'Chlorothalonil 720', vendor: 'Qualipro', purchaseQuantity: 5,    purchaseUnit: 'gal', totalCost: 240.00,  unitClean: true },
  { productName: 'Pendant SC',         vendor: 'Qualipro', purchaseQuantity: 5,    purchaseUnit: 'gal', totalCost: 2873.00, unitClean: true },
  { productName: 'Manzate Max',        vendor: 'Qualipro', purchaseQuantity: 48,   purchaseUnit: 'lb',  totalCost: 379.00,  unitClean: true },
  { productName: 'TM 4.5',             vendor: 'Qualipro', purchaseQuantity: 5,    purchaseUnit: 'gal', totalCost: 325.00,  unitClean: true },
  { productName: 'Fosetyl Al',         vendor: 'Qualipro', purchaseQuantity: 27,   purchaseUnit: 'bottle', totalCost: 2868.75, unitClean: false, reason: 'priced by bottle; bottle volume/weight not stated' },
  { productName: 'Fipronil 0.0143G',   vendor: 'Qualipro', purchaseQuantity: 12,   purchaseUnit: 'bag', totalCost: 576.00,  unitClean: false, reason: 'priced by bag; bag weight not stated for per-lb' },

  // PBI Gordon
  { productName: 'Pedigree',           vendor: 'PBI Gordon', purchaseQuantity: 10, purchaseUnit: 'gal', totalCost: 3690.00, unitClean: true },
  { productName: 'Segway',             vendor: 'PBI Gordon', purchaseQuantity: 8,  purchaseUnit: 'bottle', totalCost: 3600.00, unitClean: false, reason: 'priced by bottle; program uses oz/acre + oz/1000 — conversion unclear' },

  // Albaugh
  { productName: 'Zelto',              vendor: 'Albaugh', purchaseQuantity: 4,  purchaseUnit: 'gal', totalCost: 1060.00, unitClean: true },
  { productName: 'Crescendo',          vendor: 'Albaugh', purchaseQuantity: 16, purchaseUnit: 'lb',  totalCost: 1760.00, unitClean: true },
  { productName: 'Prothioconazole',    vendor: 'Albaugh', purchaseQuantity: 1,  purchaseUnit: 'gal', totalCost: 1320.00, unitClean: true },

  // Rightline
  { productName: 'Nemamectin',         vendor: 'Rightline', purchaseQuantity: 1, purchaseUnit: 'gal', totalCost: 1600.00, unitClean: true },

  // Aqua Aid — priced by case
  { productName: 'Hydra 30 Plus',      vendor: 'Aqua Aid', purchaseQuantity: 4,   purchaseUnit: 'case', totalCost: 1488.00, unitClean: false, reason: 'priced by case; case gal not stated' },
  { productName: 'Excalibur',          vendor: 'Aqua Aid', purchaseQuantity: 5.5, purchaseUnit: 'case', totalCost: 4125.00, unitClean: false, reason: 'priced by case; case gal not stated' },
  { productName: 'Oars PS',            vendor: 'Aqua Aid', purchaseQuantity: 1.5, purchaseUnit: 'case', totalCost: 850.50,  unitClean: false, reason: 'priced by case; case gal not stated' },

  // Molasses Kings — priced by case
  { productName: 'Sea Sugar',          vendor: 'Molasses Kings', purchaseQuantity: 3, purchaseUnit: 'case', totalCost: 600.00, unitClean: false, reason: 'priced by case' },
  { productName: 'Sweet Heat',         vendor: 'Molasses Kings', purchaseQuantity: 4, purchaseUnit: 'case', totalCost: 800.00, unitClean: false, reason: 'priced by case' },

  // Granular — priced by bag (program rates are lb/acre, so per-bag is not per-lb)
  { productName: 'VerdeCal Gypsum',    vendor: 'Granular', purchaseQuantity: 30, purchaseUnit: 'bag', totalCost: 894.00,  unitClean: false, reason: 'per-bag price; bag weight not stated for per-lb' },
  { productName: 'VerdeCal Lime',      vendor: 'Granular', purchaseQuantity: 40, purchaseUnit: 'bag', totalCost: 1144.00, unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'KMag',               vendor: 'Granular', purchaseQuantity: 12, purchaseUnit: 'bag', totalCost: 420.00,  unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'Ecolite',            vendor: 'Granular', purchaseQuantity: 40, purchaseUnit: 'bag', totalCost: 840.00,  unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'MycoReplenish',      vendor: 'Granular', purchaseQuantity: 30, purchaseUnit: 'bag', totalCost: 1222.50, unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: '5-4-5 Greens Grade', vendor: 'Granular', purchaseQuantity: 30, purchaseUnit: 'bag', totalCost: 1230.00, unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'Vereens 13-2-13',    vendor: 'Granular', purchaseQuantity: 30, purchaseUnit: 'bag', totalCost: 1170.00, unitClean: false, reason: 'per-bag price; bag weight not stated' },

  // Soluble
  { productName: 'Potassium Nitrate 13.5-0-46', vendor: 'Soluble', purchaseQuantity: 12, purchaseUnit: 'bag', totalCost: 723.60, unitClean: false, reason: 'per-bag price; bag weight not stated for per-lb' },
  { productName: 'Epsom Salt',         vendor: 'Soluble', purchaseQuantity: 1,  purchaseUnit: 'bag', totalCost: 35.00,  unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'Calcium Nitrate 15.5-0-0', vendor: 'Soluble', purchaseQuantity: 6, purchaseUnit: 'bag', totalCost: 163.50, unitClean: false, reason: 'per-bag price; bag weight not stated' },
  { productName: 'Redox K+',           vendor: 'Soluble', purchaseQuantity: 20, purchaseUnit: 'lb',  totalCost: 450.00, unitClean: true },
  { productName: 'Triden Microbes',    vendor: 'Soluble', purchaseQuantity: 10, purchaseUnit: 'pack', totalCost: 375.00, unitClean: false, reason: 'priced by pack; program uses lb/acre' },

  // Liquid — priced by case
  { productName: 'Harmony',            vendor: 'Liquid (Vereens)', purchaseQuantity: 5, purchaseUnit: 'case', totalCost: 842.10,  unitClean: false, reason: 'priced by case; case gal not stated' },
  { productName: 'Ampliphy 18',        vendor: 'Liquid (Vereens)', purchaseQuantity: 4, purchaseUnit: 'case', totalCost: 608.20,  unitClean: false, reason: 'priced by case; DO NOT MERGE with Veriphy 18' },
  { productName: 'Microtone',          vendor: 'Liquid (Vereens)', purchaseQuantity: 2, purchaseUnit: 'case', totalCost: 194.16,  unitClean: false, reason: 'priced by case' },
  { productName: 'PowerChord 0-0-26',  vendor: 'Liquid (Vereens)', purchaseQuantity: 3, purchaseUnit: 'case', totalCost: 719.31,  unitClean: false, reason: 'priced by case' },
  { productName: 'BioRhythym',         vendor: 'Liquid (Vereens)', purchaseQuantity: 6, purchaseUnit: 'case', totalCost: 1105.26, unitClean: false, reason: 'priced by case' },
  { productName: 'Double Bass Kelp',   vendor: 'Liquid (Vereens)', purchaseQuantity: 3, purchaseUnit: 'case', totalCost: 1223.67, unitClean: false, reason: 'priced by case' },
  { productName: 'Dual Shield',        vendor: 'Liquid (Vereens)', purchaseQuantity: 2.5, purchaseUnit: 'gal', totalCost: 237.50, unitClean: true },
  { productName: 'Prize Phiter',       vendor: 'Liquid (Vereens)', purchaseQuantity: 2, purchaseUnit: 'case', totalCost: 530.35,  unitClean: false, reason: 'priced by case' },
  { productName: 'Kickdrum 0-0-29 K Acetate', vendor: 'Liquid (Vereens)', purchaseQuantity: 3, purchaseUnit: 'case', totalCost: 547.38, unitClean: false, reason: 'priced by case; inventory spelling KickDrum 0-0-29' },
  { productName: 'Rootnote 3-18-18',   vendor: 'Liquid (Vereens)', purchaseQuantity: 2, purchaseUnit: 'case', totalCost: 321.64,  unitClean: false, reason: 'priced by case' },
  { productName: 'Rain Pigment',       vendor: 'Liquid (Vereens)', purchaseQuantity: 2, purchaseUnit: 'gal', totalCost: 250.00,  unitClean: true },
]

// Products the document does NOT price separately (bundled into a
// "Greens Foundation Solution" or otherwise unpriced). Recorded so the
// draft is honest about what it skipped rather than silently dropping.
const UNPRICED_BUNDLED = [
  { productName: 'Daconil Action', vendor: 'Syngenta', reason: 'Syngenta Greens Foundation Solution bundle — no standalone price' },
  { productName: 'Secure Action',  vendor: 'Syngenta', reason: 'Syngenta bundle (1 gal listed without standalone $)' },
  { productName: 'Appear',         vendor: 'Syngenta', reason: 'Syngenta bundle — Appear 24 gal inside Greens Foundation Solution' },
  { productName: 'Appear II',      vendor: 'Syngenta', reason: 'Syngenta — 8 bottles / 16 gal, no per-unit $ stated' },
  { productName: 'Ascernity',      vendor: 'Syngenta', reason: 'Syngenta — 3 gal listed, no standalone $' },
  // Veriphy 18 is a SEPARATE product from Ampliphy 18 (DO NOT MERGE).
  // The vendor doc prices Ampliphy 18 but not Veriphy 18 — record it
  // explicitly so the draft keeps the two distinct and flags the gap.
  { productName: 'Veriphy 18',     vendor: 'Vereens', reason: 'No standalone price in source doc. DO NOT MERGE with Ampliphy 18 — separate product.' },
]

function roundCents(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// ── Read the live audit (single source of truth for products + matches) ───
function readAudit() {
  const out = execFileSync(
    'node',
    ['scripts/audit-crosswinds-greens-program-products.mjs', '--json'],
    { encoding: 'utf8' },
  )
  return JSON.parse(out)
}

// Map a program product name → its audit record.
function indexAudit(audit) {
  const byName = new Map()
  for (const p of audit.products) byName.set(p.productName, p)
  return byName
}

// DO-NOT-MERGE product names (kept as separate entries, never collapsed).
const DO_NOT_MERGE = new Set(['Ampliphy 18', 'Veriphy 18'])

function buildDraft() {
  const audit = readAudit()
  const byName = indexAudit(audit)

  const entries = []
  for (const v of VENDOR_PRICING) {
    const a = byName.get(v.productName) ?? null
    const exactMatch = a && a.exactInventoryMatch.length > 0 ? a.exactInventoryMatch[0] : null
    const aliasCandidate = a && a.exactInventoryMatch.length === 0 && a.aliasInventoryCandidates.length > 0
      ? a.aliasInventoryCandidates[0]
      : null

    // Suggested per-unit cost ONLY when the purchase unit is clean.
    const suggested = v.unitClean
      ? roundCents(v.totalCost / v.purchaseQuantity)
      : null
    const costUnit = v.unitClean ? v.purchaseUnit : null

    // Confidence:
    //   exact         — clean unit + exact inventory name match
    //   alias-review  — matched only by alias candidate (name differs)
    //   manual-review — unclear unit conversion (no suggestion) OR no
    //                   inventory match at all
    let confidence
    if (!v.unitClean) confidence = 'manual-review'
    else if (exactMatch) confidence = 'exact'
    else if (aliasCandidate) confidence = 'alias-review'
    else confidence = 'manual-review'

    const notes = []
    if (v.reason) notes.push(v.reason)
    if (!exactMatch && aliasCandidate) notes.push(`Inventory name differs: "${aliasCandidate}" — confirm before linking.`)
    if (!exactMatch && !aliasCandidate) notes.push('No inventory row matches this program name yet — create it first.')
    // Only add the generic DO-NOT-MERGE reminder when the per-product
    // reason did not already state it (avoids a doubled note).
    if (DO_NOT_MERGE.has(v.productName) && !/do not merge/i.test(notes.join(' '))) {
      notes.push('DO NOT MERGE with its phite counterpart.')
    }

    entries.push({
      productName: v.productName,
      inventoryMatchName: exactMatch ?? aliasCandidate ?? null,
      vendor: v.vendor,
      purchaseQuantity: v.purchaseQuantity,
      purchaseUnit: v.purchaseUnit,
      totalCost: v.totalCost,
      suggestedCostPerUnit: suggested,
      costUnit,
      source: SOURCE_DOC,
      confidence,
      notes: notes.join(' '),
    })
  }

  // Append honest "skipped — no standalone price" records as
  // manual-review entries with null suggestion.
  for (const u of UNPRICED_BUNDLED) {
    const a = byName.get(u.productName) ?? null
    const exactMatch = a && a.exactInventoryMatch.length > 0 ? a.exactInventoryMatch[0] : null
    entries.push({
      productName: u.productName,
      inventoryMatchName: exactMatch ?? null,
      vendor: u.vendor ?? null,
      purchaseQuantity: null,
      purchaseUnit: null,
      totalCost: null,
      suggestedCostPerUnit: null,
      costUnit: null,
      source: SOURCE_DOC,
      confidence: 'manual-review',
      notes: u.reason,
    })
  }

  entries.sort((a, b) => a.productName.localeCompare(b.productName))

  const counts = {
    total: entries.length,
    exact: entries.filter(e => e.confidence === 'exact').length,
    aliasReview: entries.filter(e => e.confidence === 'alias-review').length,
    manualReview: entries.filter(e => e.confidence === 'manual-review').length,
    withSuggestion: entries.filter(e => e.suggestedCostPerUnit != null).length,
  }

  return {
    schema: 'crosswinds-cost-basis-draft/v1',
    generatedAt: new Date().toISOString(),
    source: SOURCE_DOC,
    sourceDoc: 'docs/crosswinds-greens-program-2026.md (Vendor spend + rebate reference)',
    disclaimer: [
      'SUGGESTED cost basis for human review only.',
      'Nothing here has been applied to inventory or the database.',
      'Inventory stock is not deducted from planned spray programs.',
      'Aliases are not merged automatically; confirm names before linking.',
    ].join(' '),
    counts,
    entries,
  }
}

const draft = buildDraft()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(draft, null, 2) + '\n')
} else {
  // Human-readable preview.
  const L = []
  L.push('— Crosswinds Greens Program 2026 — cost-basis DRAFT (review only)')
  L.push('')
  L.push(`Entries:            ${draft.counts.total}`)
  L.push(`  exact:            ${draft.counts.exact}`)
  L.push(`  alias-review:     ${draft.counts.aliasReview}`)
  L.push(`  manual-review:    ${draft.counts.manualReview}`)
  L.push(`  with suggestion:  ${draft.counts.withSuggestion}`)
  L.push('')
  for (const e of draft.entries) {
    const sug = e.suggestedCostPerUnit != null
      ? `$${e.suggestedCostPerUnit.toFixed(2)}/${e.costUnit}`
      : '— (no suggestion)'
    L.push(`  • ${e.productName}  [${e.confidence}]  ${sug}`)
    L.push(`      vendor=${e.vendor}  buy=${e.purchaseQuantity ?? '?'} ${e.purchaseUnit ?? ''} @ ${e.totalCost != null ? '$' + e.totalCost : '?'}`)
    if (e.inventoryMatchName) L.push(`      inv: ${e.inventoryMatchName}`)
    if (e.notes) L.push(`      note: ${e.notes}`)
  }
  L.push('')
  L.push(WRITE ? `Writing ${DRAFT_FILE} …` : `(preview only — pass --write to save ${DRAFT_FILE})`)
  process.stdout.write(L.join('\n') + '\n')
}

if (WRITE) {
  writeFileSync(DRAFT_FILE, JSON.stringify(draft, null, 2) + '\n', 'utf8')
  process.stderr.write(`\nWrote ${DRAFT_FILE}\n`)
}
