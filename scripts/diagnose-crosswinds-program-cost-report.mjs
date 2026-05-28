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
import { estimateProgramItemCost } from '../src/utils/sprayPrograms/programCostAwareness.js'

const PROGRAM_ID = 'sp-crosswinds-greens-2026'
const TARGET_13 = new Set([
  'Chlorothalonil 720', 'Contrado', 'Crescendo', 'Dual Shield', 'Manzate Max',
  'Nemamectin', 'Pedigree', 'Pendant SC', 'Rain Pigment', 'Redox K+',
  'Tebuconazole 3.6F', 'TM 4.5', 'Zelto',
])

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

function normUnit(u) {
  return u == null ? '' : String(u).trim().toLowerCase().replace(/\s+/g, ' ')
}

async function main() {
  if (!API) {
    console.error('✗ TURFINTEL_API_URL not set (in env or .env.local). Aborting read-only diagnostic.')
    process.exit(1)
  }

  const programItems = await getJson(`/api/spray-programs/${PROGRAM_ID}/items`)
  const inventory    = await getJson('/api/inventory')
  const items = Array.isArray(programItems) ? programItems : []
  const inv   = Array.isArray(inventory) ? inventory : []

  // Inventory lookup by exact name (course already scoped server-side).
  const invByName = new Map()
  for (const r of inv) if (r?.name && !invByName.has(r.name)) invByName.set(r.name, r)

  const context = { inventoryProducts: inv }

  let exactNameMatch = 0
  let costBasisByName = 0
  let currentEstimatable = 0
  let blockedNoLink = 0
  let blockedUnit = 0
  let blockedNameMismatch = 0
  const target13ByName = []

  for (const it of items) {
    // (1) Current estimator (what the live report uses).
    const est = estimateProgramItemCost(it, context)
    if (est.status === 'estimated') currentEstimatable++

    // (2) Name-match probe.
    const invRow = invByName.get(it.productName) ?? null
    if (invRow) {
      exactNameMatch++
      const unitCost = invRow.costPerUnit
      if (unitCost != null && Number(unitCost) > 0) {
        costBasisByName++
        const rateU = normUnit(it.rateUnit)
        const costU = normUnit(invRow.costUnit ?? invRow.unit)
        const comparable = rateU && costU && rateU === costU
        if (TARGET_13.has(it.productName)) {
          target13ByName.push({
            name: it.productName,
            rate: `${it.rateValue ?? '?'} ${it.rateUnit ?? ''}`.trim(),
            cost: `$${unitCost}/${invRow.costUnit ?? invRow.unit ?? '?'}`,
            comparable,
            currentStatus: est.status,
          })
        }
        if (!comparable) blockedUnit++
      }
    } else {
      blockedNameMismatch++
    }

    // Why the CURRENT estimator did not estimate.
    if (est.status !== 'estimated') {
      if (!it.inventoryItemId) blockedNoLink++
    }
  }

  console.log('— Crosswinds Greens Program 2026 — cost report diagnostic')
  console.log('')
  console.log(`Total program items:                 ${items.length}`)
  console.log(`Inventory rows (course-scoped):      ${inv.length}`)
  console.log(`Inventory rows with cost basis:      ${inv.filter(r => r.costPerUnit != null).length}`)
  console.log('')
  console.log('CURRENT estimator (live report path — needs inventoryItemId + exact unit):')
  console.log(`  items it can estimate:             ${currentEstimatable}`)
  console.log(`  items with NULL inventory link:    ${blockedNoLink}`)
  console.log('')
  console.log('NAME-MATCH probe (program product_name → inventory name):')
  console.log(`  items with exact inventory name:   ${exactNameMatch}`)
  console.log(`  of those, with cost basis on file: ${costBasisByName}`)
  console.log(`  items with NO inventory name match: ${blockedNameMismatch}`)
  console.log(`  matched+costed but unit NOT comparable (needs conversion): ${blockedUnit}`)
  console.log('')
  console.log('The 13 exact-cost target products (name-matched):')
  for (const t of target13ByName) {
    console.log(`  • ${t.name}`)
    console.log(`      rate=${t.rate}  cost=${t.cost}  unit-comparable=${t.comparable}`)
    console.log(`      current estimator status: ${t.currentStatus}`)
  }
  console.log('')
  console.log('Interpretation:')
  console.log('  - The live report uses item.inventoryItemId, which is NULL on every')
  console.log('    Crosswinds item, so it reports "missing cost basis" for all.')
  console.log('  - Even by name, the rate units (per-area: gal/acre, oz/1000 sq ft,')
  console.log('    lb/acre) never equal the cost units (per-volume/weight: gal, lb),')
  console.log('    so a safe per-unit estimate is not possible without an area/volume')
  console.log('    conversion the planner does not store. Correct outcome is a')
  console.log('    "cost basis found, unit conversion needed" state — not $0, not hidden.')
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
