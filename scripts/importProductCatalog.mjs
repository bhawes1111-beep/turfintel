#!/usr/bin/env node
// Phase 7C.1 (2/6) — Product catalog seed importer.
//
//   node scripts/importProductCatalog.mjs --remote
//   node scripts/importProductCatalog.mjs --local
//   node scripts/importProductCatalog.mjs --remote --dry-run
//   node scripts/importProductCatalog.mjs --remote --seed worker/seeds/product_catalog_v1.json
//
// Reads a seed JSON of products and emits INSERT OR REPLACE statements
// into product_catalog. Idempotent: re-running produces the same row
// state. IDs are derived from product_name + epa_number when present so
// a future EPA-sync re-import lands on the same primary key. Builds a
// lowercased search_text blob for the LIKE search endpoint. Validates
// category strictly against the same set the Worker enforces.
//
// Does NOT touch inventory_items, does NOT mutate Spray Builder data —
// catalog/stock linkage is a later commit.
//
// Logs per-row: insert | skip | warn. Final summary line is parsed by
// the smoke ("N inserted, M skipped, W warnings"). Exit code is non-
// zero on any structural error (missing seed, bad category, etc.).

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB_NAME      = 'turfintel-db'
const DEFAULT_SEED = 'worker/seeds/product_catalog_v1.json'

const ALLOWED_CATEGORIES = new Set([
  'herbicide', 'fungicide', 'insecticide', 'pgr', 'fertilizer', 'biostimulant',
])
const ALLOWED_STATUSES = new Set(['active', 'discontinued', 'unverified'])

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args   = process.argv.slice(2)
  const remote = args.includes('--remote')
  const local  = args.includes('--local')
  const dry    = args.includes('--dry-run')
  let seed = DEFAULT_SEED
  const sIdx = args.indexOf('--seed')
  if (sIdx >= 0 && args[sIdx + 1]) seed = args[sIdx + 1]

  if (remote && local) fail('Specify either --local or --remote, not both.')
  if (!remote && !local && !dry) {
    fail('Specify --local, --remote, or --dry-run.\n\n' +
         '  node scripts/importProductCatalog.mjs --remote\n' +
         '  node scripts/importProductCatalog.mjs --local\n' +
         '  node scripts/importProductCatalog.mjs --remote --dry-run\n' +
         '  node scripts/importProductCatalog.mjs --remote --seed <path>')
  }
  return { target: remote ? 'remote' : (local ? 'local' : null), dry, seed }
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// Stable, human-readable PK. EPA-bearing rows append the EPA so an
// EPA-sync re-import lands on the same row even if the marketing name
// changes slightly. Fertilizer rows have no EPA — fall back to slug
// only and warn if a duplicate slug appears.
function makeId(productName, epaNumber) {
  const slug = slugify(productName)
  const epa  = epaNumber ? slugify(epaNumber) : null
  return epa ? `pc-${slug}-${epa}` : `pc-${slug}`
}

function sqlString(v) {
  if (v == null) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

function sqlInt(v) {
  if (v === true)  return '1'
  if (v === false) return '0'
  if (v == null)   return 'NULL'
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.trunc(n)) : 'NULL'
}

function sqlReal(v) {
  if (v == null) return 'NULL'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : 'NULL'
}

function sqlJson(v) {
  if (v == null) return 'NULL'
  return sqlString(JSON.stringify(v))
}

// search_text — lowercased blob the worker's LIKE endpoint searches.
// Name + brand + manufacturer + epa + every active ingredient name +
// fertilizer analysis. Single LIKE per query keeps the read endpoint cheap.
function buildSearchText(p) {
  const parts = [
    p.product_name, p.brand_owner, p.manufacturer, p.epa_number,
    p.formulation, p.chemical_class, p.fertilizer_analysis,
    ...(Array.isArray(p.active_ingredients) ? p.active_ingredients.map(a => a?.name) : []),
    ...(Array.isArray(p.targets) ? p.targets : []),
  ]
  return parts.filter(Boolean).map(x => String(x).toLowerCase()).join(' ')
}

function validate(p, warnings) {
  if (!p.product_name || typeof p.product_name !== 'string') return 'missing product_name'
  if (!p.category)                                            return 'missing category'
  if (!ALLOWED_CATEGORIES.has(p.category)) {
    return `invalid category '${p.category}' (allowed: ${[...ALLOWED_CATEGORIES].join(', ')})`
  }
  const status = p.status ?? 'active'
  if (!ALLOWED_STATUSES.has(status)) {
    return `invalid status '${status}' (allowed: ${[...ALLOWED_STATUSES].join(', ')})`
  }
  // Soft warnings — don't reject the row, just log it.
  if (p.category !== 'fertilizer' && p.category !== 'biostimulant' && !p.epa_number) {
    warnings.push(`${p.product_name}: pesticide-category row has no epa_number`)
  }
  if (Array.isArray(p.active_ingredients)) {
    for (const ai of p.active_ingredients) {
      if (!ai?.name) warnings.push(`${p.product_name}: active_ingredient with no name`)
    }
  }
  return null
}

function buildInsertStmt(p) {
  const id          = makeId(p.product_name, p.epa_number)
  const searchText  = buildSearchText(p)
  const status      = p.status ?? 'active'
  const isActive    = status === 'active' ? 1 : 0
  const ai          = Array.isArray(p.active_ingredients) ? p.active_ingredients : null
  const rates       = Array.isArray(p.rates)              ? p.rates              : null
  const targets     = Array.isArray(p.targets)            ? p.targets            : null
  const turfSites   = Array.isArray(p.turf_sites)         ? p.turf_sites         : null

  // INSERT OR REPLACE makes the import idempotent: re-running the same
  // seed against the same DB produces the same row state (same PK ->
  // overwrite). created_at is preserved by the table default on first
  // insert; on replace it resets to now() — acceptable for a seed import
  // where the absolute first-insert timestamp isn't meaningful.
  const cols = [
    'id', 'product_name', 'brand_owner', 'manufacturer', 'epa_number',
    'formulation', 'category', 'frac_group', 'hrac_group', 'irac_group',
    'pgr_class', 'chemical_class', 'active_ingredients_json',
    'fertilizer_analysis', 'rates_json', 'targets_json', 'turf_sites_json',
    'restricted_use', 'signal_word', 'rei_hours', 'phi_hours', 'label_url',
    'notes', 'status', 'is_active', 'search_text', 'source', 'source_version',
  ]
  const vals = [
    sqlString(id),
    sqlString(p.product_name),
    sqlString(p.brand_owner),
    sqlString(p.manufacturer),
    sqlString(p.epa_number),
    sqlString(p.formulation),
    sqlString(p.category),
    sqlString(p.frac_group),
    sqlString(p.hrac_group),
    sqlString(p.irac_group),
    sqlString(p.pgr_class),
    sqlString(p.chemical_class),
    sqlJson(ai),
    sqlString(p.fertilizer_analysis),
    sqlJson(rates),
    sqlJson(targets),
    sqlJson(turfSites),
    sqlInt(p.restricted_use === true),
    sqlString(p.signal_word),
    sqlReal(p.rei_hours),
    sqlReal(p.phi_hours),
    sqlString(p.label_url),
    sqlString(p.notes),
    sqlString(status),
    sqlInt(isActive),
    sqlString(searchText),
    sqlString('seed-import'),
    sqlString('v1'),
  ]
  return `INSERT OR REPLACE INTO product_catalog (${cols.join(', ')}) VALUES (${vals.join(', ')});`
}

// ── wrangler shell-out (mirrors scripts/applyMigrations.js pattern) ───────
function wranglerFile(filePath, target) {
  const cmd = `npx wrangler d1 execute ${DB_NAME} --${target} --file="${filePath.replace(/"/g, '\\"')}"`
  execSync(cmd, { stdio: 'inherit' })
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const { target, dry, seed } = parseArgs()

  let raw
  try { raw = readFileSync(seed, 'utf8') }
  catch (e) { fail(`Cannot read seed file '${seed}': ${e.message}`) }

  let dataset
  try { dataset = JSON.parse(raw) }
  catch (e) { fail(`Seed file is not valid JSON: ${e.message}`) }

  const products = Array.isArray(dataset?.products) ? dataset.products : null
  if (!products) fail("Seed must have a top-level 'products' array.")

  console.log(`\nProduct catalog import (${dry ? 'dry-run' : target})\n`)
  console.log(`  seed:    ${seed}`)
  console.log(`  version: ${dataset.version ?? '(unset)'}`)
  console.log(`  rows:    ${products.length}\n`)

  const warnings = []
  const seenIds  = new Map()
  const stmts    = []
  let inserted = 0, skipped = 0

  for (const p of products) {
    const err = validate(p, warnings)
    if (err) {
      console.log(`  skip   ${p.product_name ?? '(no name)'}  → ${err}`)
      skipped++
      continue
    }
    const id = makeId(p.product_name, p.epa_number)
    if (seenIds.has(id)) {
      const other = seenIds.get(id)
      console.log(`  skip   ${p.product_name}  → duplicate id ${id} (already from '${other}')`)
      warnings.push(`duplicate id ${id} for '${p.product_name}' and '${other}' — second row dropped`)
      skipped++
      continue
    }
    seenIds.set(id, p.product_name)
    stmts.push(buildInsertStmt(p))
    console.log(`  insert ${p.product_name.padEnd(30)} ${id}`)
    inserted++
  }

  for (const w of warnings) console.log(`  warn   ${w}`)

  console.log('')
  console.log(`Summary: ${inserted} inserted, ${skipped} skipped, ${warnings.length} warnings`)

  if (dry) {
    console.log('\n(dry-run — no SQL executed)\n')
    return
  }

  if (stmts.length === 0) {
    console.log('\nNothing to apply.\n')
    return
  }

  // Write all statements to a single temp .sql file and shell out via
  // wrangler. One round-trip keeps remote-D1 cost bounded; idempotency
  // comes from INSERT OR REPLACE per row.
  const dir  = mkdtempSync(join(tmpdir(), 'pc-import-'))
  const file = join(dir, 'product_catalog_seed.sql')
  writeFileSync(file, stmts.join('\n') + '\n', 'utf8')
  console.log(`\nApplying to ${target} D1 via wrangler...\n`)
  wranglerFile(file, target)
  console.log(`\nDone. ${inserted} row(s) upserted into product_catalog.\n`)
}

main()
