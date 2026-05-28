// Phase 7U.2 — Apply ONLY the exact-confidence cost-basis entries from
// the Crosswinds Greens Program 2026 draft.
//
//   node scripts/apply-crosswinds-exact-cost-basis.mjs            (dry-run, default)
//   node scripts/apply-crosswinds-exact-cost-basis.mjs --apply     (write — requires API env)
//
// Scope (HARD): only entries with confidence === 'exact' (13 expected).
// Everything else — manual-review, alias-review, Prothioconazole,
// Ampliphy 18, Veriphy 18, by-case/by-bag/by-bottle, null suggestion —
// is excluded and never written.
//
// Write path: the existing Phase 7J.1 endpoint
//   PATCH /api/inventory/:id/cost-basis
// We do NOT touch D1 directly — the endpoint owns validation,
// server-stamped cost_updated_at, the cost_source vocabulary, and the
// Phase 7M.1 audit row. Apply mode needs:
//   TURFINTEL_API_URL   base URL of the deployed worker
//   TURFINTEL_API_KEY   ADMIN_KEY / AUTOMATION_KEY for the mutation gate
//
// Safety:
//   - dry-run is the DEFAULT; writes happen only with --apply
//   - never overwrites an existing non-null cost basis (reads current
//     state via GET first and skips anything already set)
//   - never deducts inventory, never creates usage / spray records,
//     never merges names, never creates inventory items
//   - cost_source = 'imported'; provenance is recorded in cost_notes

import { readFileSync } from 'fs'

const DRAFT_FILE = 'docs/crosswinds-greens-program-2026-cost-basis-draft.json'
const INV_MIGRATION = 'worker/migrations/0021_greens_program_inventory_refresh.sql'

const SOURCE_LABEL = 'Crosswinds Greens Program 2026'
const APPLY_NOTE   = 'Applied from Phase 7U.1 exact-confidence draft.'
const COST_SOURCE  = 'imported'           // PATCH vocabulary: manual|imported|invoice|unknown
const CHANGE_SOURCE = 'import-single-row' // audit vocabulary: manual|import-single-row|unknown

const EXPECTED_EXACT = 13

// Products that must NEVER be applied by this script, even if a future
// draft regeneration mislabels them. Belt-and-suspenders over the
// confidence filter.
const DO_NOT_APPLY = new Set([
  'Prothioconazole',
  'Ampliphy 18',
  'Veriphy 18',
])

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')

const API_URL = process.env.TURFINTEL_API_URL || null
const API_KEY = process.env.TURFINTEL_API_KEY || null

// ── Resolve inventory name → id from migration 0021 (offline fallback) ─────
// At apply time we re-resolve against the LIVE /api/inventory list (the
// authoritative source). The migration map is only used to display the
// target id during an offline dry-run.
function buildNameToIdFromMigration() {
  const sql = readFileSync(INV_MIGRATION, 'utf8')
  const map = new Map()
  // Each inventory tuple starts: ('id', 'kind', 'name', ...
  const re = /\(\s*'([^']+)'\s*,\s*'[^']+'\s*,\s*'((?:[^']|'')*)'/g
  let m
  while ((m = re.exec(sql)) != null) {
    const id = m[1]
    const name = m[2].replace(/''/g, "'")
    if (!map.has(name)) map.set(name, id)
  }
  return map
}

// ── Load + filter the draft to eligible exact entries ──────────────────────
function loadEligible() {
  const draft = JSON.parse(readFileSync(DRAFT_FILE, 'utf8'))
  const entries = Array.isArray(draft.entries) ? draft.entries : []
  const exact = entries.filter(e => e.confidence === 'exact')

  // Guardrails — refuse to run on a draft that doesn't match expectations.
  const problems = []
  if (exact.length !== EXPECTED_EXACT) {
    problems.push(`expected ${EXPECTED_EXACT} exact entries, found ${exact.length}`)
  }
  for (const e of exact) {
    if (e.suggestedCostPerUnit == null) problems.push(`${e.productName}: exact but null suggestedCostPerUnit`)
    if (!(Number(e.suggestedCostPerUnit) > 0)) problems.push(`${e.productName}: non-positive cost`)
    if (!e.costUnit) problems.push(`${e.productName}: missing costUnit`)
    if (!e.inventoryMatchName) problems.push(`${e.productName}: no inventoryMatchName`)
    if (DO_NOT_APPLY.has(e.productName)) problems.push(`${e.productName}: on DO_NOT_APPLY list but marked exact`)
  }
  return { exact, problems }
}

// ── Read current cost basis for one inventory item (apply mode only) ───────
async function fetchInventoryById(id) {
  const url = `${API_URL.replace(/\/$/, '')}/api/inventory/${encodeURIComponent(id)}`
  const res = await fetch(url, { headers: { 'x-admin-key': API_KEY } })
  if (!res.ok) throw new Error(`GET ${id} -> ${res.status}`)
  return res.json()
}

async function patchCostBasis(id, costPerUnit, costUnit) {
  const url = `${API_URL.replace(/\/$/, '')}/api/inventory/${encodeURIComponent(id)}/cost-basis`
  const body = {
    costPerUnit,
    costUnit,
    costSource: COST_SOURCE,
    costNotes: `${SOURCE_LABEL}. ${APPLY_NOTE}`,
    changeSource: CHANGE_SOURCE,
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-admin-key': API_KEY },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${id} -> ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Main ────────────────────────────────────────────────────────────────────
const { exact, problems } = loadEligible()

if (problems.length) {
  console.error('✗ Refusing to run — draft failed pre-flight checks:')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}

const nameToId = buildNameToIdFromMigration()

console.log(`— Crosswinds exact-confidence cost-basis apply (${APPLY ? 'APPLY' : 'DRY-RUN'})`)
console.log('')
console.log(`Eligible exact entries: ${exact.length}`)
console.log(`Excluded (never applied): Prothioconazole, Ampliphy 18, Veriphy 18, all manual-review.`)
console.log('')

if (!APPLY) {
  // Offline-capable dry-run. Current cost state is read live only if an
  // API is configured; otherwise it is reported as 'unknown — checked at
  // apply time'.
  for (const e of exact) {
    const id = nameToId.get(e.inventoryMatchName) ?? '(id unresolved — resolve via live API at apply time)'
    let current = 'unknown (no API configured — checked at apply time)'
    if (API_URL && API_KEY) {
      try {
        const inv = await fetchInventoryById(id)
        current = inv?.costPerUnit == null ? 'null (will apply)' : `already set (${inv.costPerUnit}) — WILL SKIP`
      } catch (err) {
        current = `lookup failed: ${err.message}`
      }
    }
    console.log(`  • ${e.productName}`)
    console.log(`      inventory match: ${e.inventoryMatchName}  (id: ${id})`)
    console.log(`      suggested:       $${Number(e.suggestedCostPerUnit).toFixed(2)} / ${e.costUnit}`)
    console.log(`      source:          ${SOURCE_LABEL}`)
    console.log(`      current cost:    ${current}`)
  }
  console.log('')
  console.log('DRY-RUN only — no data was changed. Re-run with --apply (and')
  console.log('TURFINTEL_API_URL + TURFINTEL_API_KEY) to write through the')
  console.log('Phase 7J.1 cost-basis endpoint.')
  process.exit(0)
}

// ── APPLY mode ──────────────────────────────────────────────────────────────
if (!API_URL || !API_KEY) {
  console.error('✗ --apply requires TURFINTEL_API_URL and TURFINTEL_API_KEY in the environment.')
  console.error('  These point the script at the deployed worker + the mutation key. Aborting.')
  process.exit(1)
}

let applied = 0, skipped = 0, failed = 0
for (const e of exact) {
  const id = nameToId.get(e.inventoryMatchName)
  if (!id) { console.error(`  ✗ ${e.productName}: could not resolve inventory id — skipped`); failed++; continue }
  try {
    const inv = await fetchInventoryById(id)
    if (inv?.costPerUnit != null) {
      console.log(`  – ${e.productName}: existing cost basis (${inv.costPerUnit}) — SKIPPED (never overwrite)`)
      skipped++
      continue
    }
    await patchCostBasis(id, Number(e.suggestedCostPerUnit), e.costUnit)
    console.log(`  ✓ ${e.productName}: applied $${Number(e.suggestedCostPerUnit).toFixed(2)}/${e.costUnit}`)
    applied++
  } catch (err) {
    console.error(`  ✗ ${e.productName}: ${err.message}`)
    failed++
  }
}
console.log('')
console.log(`Applied: ${applied}  Skipped (already set): ${skipped}  Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
