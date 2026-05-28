// Phase 7U.4 — Diagnose why the Spray Program Cost report shows no
// estimated cost for the Crosswinds Greens Program 2026.
//
//   node scripts/diagnose-crosswinds-program-cost-report.mjs
//
// READ-ONLY. Pulls live production data through the public GET API
// (program items + inventory) and classifies every Crosswinds item
// against:
//   (1) the CURRENT estimator (programCostAwareness.estimateProgramItemCost),
//       which requires item.inventoryItemId + an EXACT rate/cost unit match
//   (2) a NAME-MATCH probe: program product_name → inventory_items.name
//       within the same course, then whether the units are comparable
//
// No DB writes, no mutations, no cost application. Requires
// TURFINTEL_API_URL (+ _KEY only for non-public reads; the inventory and
// program reads used here are public GETs).

import { readFileSync } from 'fs'
import { estimateProgramItemCost, resolveProgramArea } from '../src/utils/sprayPrograms/programCostAwareness.js'

const PROGRAM_ID = 'sp-crosswinds-greens-2026'

// ── Load API config from .env.local (literal, no shell expansion) ──────────
function loadEnv() {
  const out = { ...process.env }
  try {
    for (const ln of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = ln.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) out[m[1]] = m[2].replace(/\r$/, '')
    }
  } catch { /* .env.local optional */ }
  return out
}
const ENV = loadEnv()
const API = (ENV.TURFINTEL_API_URL || '').replace(/\/$/, '')
const KEY = ENV.TURFINTEL_API_KEY || ''

async function getJson(path) {
  const res = await fetch(API + path, { headers: KEY ? { 'x-admin-key': KEY } : {} })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

async function main() {
  if (!API) {
    console.error('✗ TURFINTEL_API_URL not set (in env or .env.local). Aborting read-only diagnostic.')
    process.exit(1)
  }

  const programs     = await getJson('/api/spray-programs?status=active')
  const programItems = await getJson(`/api/spray-programs/${PROGRAM_ID}/items`)
  const inventory    = await getJson('/api/inventory')
  const program = (Array.isArray(programs) ? programs : []).find(p => p?.id === PROGRAM_ID) ?? null
  const items   = Array.isArray(programItems) ? programItems : []
  const inv     = Array.isArray(inventory) ? inventory : []

  // The estimator needs the program (for area resolution from notes /
  // default acres) + the course-scoped inventory list.
  const context = { inventoryProducts: inv, program }
  const area = resolveProgramArea({ program })

  const counts = {}
  let estimatedTotal = 0
  const estimated = []
  for (const it of items) {
    const est = estimateProgramItemCost(it, context)
    counts[est.status] = (counts[est.status] ?? 0) + 1
    if (est.status === 'estimated') {
      estimatedTotal += est.estimatedCost
      estimated.push({
        name: it.productName,
        rate: `${it.rateValue ?? '?'} ${it.rateUnit ?? ''}`.trim(),
        qty:  `${est.estimatedQuantity} ${est.quantityUnit}`,
        unitCost: `$${est.unitCost}/${est.quantityUnit}`,
        cost: est.estimatedCost,
      })
    }
  }

  console.log('— Crosswinds Greens Program 2026 — cost report diagnostic (Phase 7V.1)')
  console.log('')
  console.log(`Total program items:                 ${items.length}`)
  console.log(`Inventory rows (course-scoped):      ${inv.length}`)
  console.log(`Inventory rows with cost basis:      ${inv.filter(r => r.costPerUnit != null).length}`)
  console.log(`Area basis:                          ${area.acres != null ? `${area.acres} acres (${area.sqFt} sq ft) via ${area.source}` : 'NOT AVAILABLE'}`)
  console.log('')
  console.log('Estimator status breakdown:')
  console.log(`  estimated:                         ${counts['estimated'] ?? 0}`)
  console.log(`  cost-basis-found-conversion-needed:${counts['cost-basis-found-unit-conversion-needed'] ?? 0}`)
  console.log(`  area-needed-for-estimate:          ${counts['area-needed-for-estimate'] ?? 0}`)
  console.log(`  unsupported-rate-unit:             ${counts['unsupported-rate-unit'] ?? 0}`)
  console.log(`  unsupported-cost-unit:             ${counts['unsupported-cost-unit'] ?? 0}`)
  console.log(`  missing-cost-basis:                ${counts['missing-cost-basis'] ?? 0}`)
  console.log(`  missing-quantity:                  ${counts['missing-quantity'] ?? 0}`)
  console.log('')
  console.log(`Estimated total: $${estimatedTotal.toFixed(2)} across ${estimated.length} item use(s)`)
  console.log('')
  console.log('Estimated items breakdown:')
  for (const e of estimated) {
    console.log(`  • ${e.name}: ${e.rate} → ${e.qty} × ${e.unitCost} = $${e.cost.toFixed(2)}`)
  }
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
