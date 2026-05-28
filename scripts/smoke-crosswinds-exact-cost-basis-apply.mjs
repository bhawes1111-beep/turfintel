// Phase 7U.2 — Exact-confidence cost-basis apply workflow smoke.
//
//   node scripts/smoke-crosswinds-exact-cost-basis-apply.mjs
//
// Locks the safety contract of the apply workflow WITHOUT writing
// anything. No DB, no network (we run --apply with NO api env so the
// script aborts before any fetch), no production change.
//
//   - dry-run is the DEFAULT (no flag → no write, exit 0)
//   - --apply with no TURFINTEL_API_URL / _KEY ABORTS (exit 1) — proves
//     a write cannot happen without explicit configuration
//   - dry-run output lists exactly the 13 exact entries and excludes
//     Prothioconazole / Ampliphy 18 / Veriphy 18
//   - the apply script source carries no inventory-deduction / usage /
//     spray / merge / D1 surface, and writes via the PATCH endpoint
//   - the check script passes (exit 0)
//   - the Crosswinds program still seeds exactly 153 items
//   - the cost-basis PATCH remains the single cost write path

import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'

const APPLY = 'scripts/apply-crosswinds-exact-cost-basis.mjs'
const CHECK = 'scripts/check-crosswinds-exact-cost-basis-apply.mjs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// Run a node script with a SANITIZED env (no API creds) so a real write
// can never occur during the smoke. Returns { code, out }.
function run(argv) {
  const env = { ...process.env }
  delete env.TURFINTEL_API_URL
  delete env.TURFINTEL_API_KEY
  try {
    const out = execFileSync('node', [APPLY, ...argv], { encoding: 'utf8', env })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

// ── 1. Dry-run is the default ──────────────────────────────────────────────
console.log('— dry-run default')
{
  const { code, out } = run([])
  assert(code === 0, 'no-flag run exits 0')
  assert(/DRY-RUN/.test(out), 'no-flag run is DRY-RUN')
  assert(/no data was changed/i.test(out), 'dry-run states no data changed')
  assert(/Eligible exact entries:\s*13/.test(out),
    'dry-run reports 13 eligible exact entries')

  // The 13 expected products appear; the excluded ones do not appear as
  // an eligible bullet line.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const name of [
    'Chlorothalonil 720', 'Pendant SC', 'Manzate Max', 'Crescendo',
    'Tebuconazole 3.6F', 'TM 4.5', 'Pedigree', 'Nemamectin', 'Zelto',
    'Contrado', 'Dual Shield', 'Redox K+', 'Rain Pigment',
  ]) {
    assert(new RegExp(`•\\s*${escapeRe(name)}`).test(out),
      `dry-run lists ${name}`)
  }
  for (const name of ['Prothioconazole', 'Ampliphy 18', 'Veriphy 18']) {
    assert(!new RegExp(`•\\s*${escapeRe(name)}`).test(out),
      `dry-run does NOT list ${name} as eligible`)
  }
}

// ── 2. --apply requires API env; aborts without writing ────────────────────
console.log('— --apply guard (no creds → abort, no write)')
{
  const { code, out } = run(['--apply'])
  assert(code === 1, '--apply with no API env exits non-zero (aborts)')
  assert(/requires TURFINTEL_API_URL and TURFINTEL_API_KEY/i.test(out),
    '--apply abort message names the required env vars')
  assert(!/applied \$/i.test(out), 'no "applied" line printed (nothing written)')
}

// ── 3. Apply-script source guards ──────────────────────────────────────────
console.log('— apply-script source')
{
  const raw = readFileSync(APPLY, 'utf8')
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `apply script never references ${verb}`)
  }
  assert(!/wrangler|better-sqlite3|node:sqlite|\benv\.DB\b/.test(code),
    'apply script does not touch D1 directly')
  assert(/\/cost-basis/.test(raw) && /method:\s*'PATCH'/.test(raw),
    'apply script writes via PATCH /api/inventory/:id/cost-basis')
  // Never-overwrite guard present.
  assert(/costPerUnit\s*!=?=\s*null/.test(code),
    'apply branch checks existing cost before writing (never overwrite)')
}

// ── 4. Check script passes ──────────────────────────────────────────────────
console.log('— check script gate')
{
  let exit0 = false
  try { execFileSync('node', [CHECK], { encoding: 'utf8' }); exit0 = true } catch { exit0 = false }
  assert(exit0, 'check script passes (exit 0)')
}

// ── 5. Program + write-path invariants ─────────────────────────────────────
console.log('— invariants')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'Crosswinds seed still defines exactly 153 spray_program_items rows', itemRows.length)

  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still the cost write path')

  const sprayProgApi = readFileSync('worker/api/sprayPrograms.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of ['recordInventoryUsage', 'deductInventory', 'completeProgramItem', 'autoComplete']) {
    assert(!new RegExp(`\\b${verb}\\b`).test(sprayProgApi),
      `worker/api/sprayPrograms.js still never references ${verb}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
