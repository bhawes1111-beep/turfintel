// Phase 7C.1 — Product Catalog foundation smoke.
//
//   node scripts/smoke-product-catalog.mjs
//
// Static source contracts (no live D1):
//   - migration 0043 declares the product_catalog schema + indexes and the
//     nullable inventory_items.product_catalog_id column
//   - Worker exports ONLY read handlers (listProductCatalog,
//     getProductCatalog) and DOES NOT export mutation handlers — Phase 7C.1
//     is read-only
//   - Worker enforces allowed categories + statuses + default 'active'
//   - Worker routes wired in worker/index.js for the 3 GET endpoints
//   - rowToProduct returns the camelCase client contract

import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration ────────────────────────────────────────────────────────────
console.log('— migration 0043 (product_catalog)')
{
  const mig = readFileSync('worker/migrations/0043_product_catalog.sql', 'utf8')

  assert(/CREATE TABLE IF NOT EXISTS product_catalog/i.test(mig),
    'CREATE TABLE product_catalog')

  // Required identity + classification columns.
  const required = [
    'id', 'product_name', 'brand_owner', 'manufacturer', 'epa_number',
    'formulation', 'category', 'frac_group', 'hrac_group', 'irac_group',
    'pgr_class', 'chemical_class', 'active_ingredients_json',
    'fertilizer_analysis', 'rates_json', 'targets_json', 'turf_sites_json',
    'restricted_use', 'signal_word', 'rei_hours', 'phi_hours', 'label_url',
    'notes', 'status', 'is_active', 'search_text', 'source',
    'source_version', 'created_at', 'updated_at',
  ]
  for (const col of required) {
    assert(new RegExp(`\\b${col}\\b`).test(mig), `migration declares column ${col}`)
  }

  // Indexes (one per filterable column).
  const indexes = [
    'idx_product_catalog_name',
    'idx_product_catalog_category',
    'idx_product_catalog_epa',
    'idx_product_catalog_frac',
    'idx_product_catalog_status',
    'idx_product_catalog_is_active',
  ]
  for (const idx of indexes) {
    assert(new RegExp(`\\b${idx}\\b`).test(mig), `migration declares index ${idx}`)
  }

  // Defaults that the API relies on.
  assert(/status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'active'/i.test(mig),
    "status defaults to 'active'")
  assert(/is_active\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i.test(mig),
    'is_active defaults to 1')
  assert(/restricted_use\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i.test(mig),
    'restricted_use defaults to 0')
  assert(/category\s+TEXT\s+NOT NULL/i.test(mig),
    'category is NOT NULL')

  // Inventory linkage.
  assert(/ALTER TABLE inventory_items ADD COLUMN product_catalog_id TEXT/i.test(mig),
    'inventory_items gains nullable product_catalog_id')
  assert(/idx_inventory_catalog\b/.test(mig),
    'index on inventory_items.product_catalog_id')
}

// ── 2. Worker API surface ───────────────────────────────────────────────────
console.log('— worker/api/productCatalog.js (read-only surface)')
{
  const api = readFileSync('worker/api/productCatalog.js', 'utf8')

  assert(/export\s+async\s+function\s+listProductCatalog\s*\(/.test(api),
    'exports listProductCatalog')
  assert(/export\s+async\s+function\s+getProductCatalog\s*\(/.test(api),
    'exports getProductCatalog')

  // No mutation handlers in v1 — these would be a contract violation.
  assert(!/export\s+async\s+function\s+createProductCatalog\b/.test(api),
    'does NOT export createProductCatalog (read-only in 7C.1)')
  assert(!/export\s+async\s+function\s+updateProductCatalog\b/.test(api),
    'does NOT export updateProductCatalog')
  assert(!/export\s+async\s+function\s+deleteProductCatalog\b/.test(api),
    'does NOT export deleteProductCatalog')

  // Allowed enums.
  assert(/ALLOWED_CATEGORIES\s*=\s*new Set\(\s*\[[^\]]*'herbicide'[^\]]*'fungicide'[^\]]*'insecticide'[^\]]*'pgr'[^\]]*'fertilizer'[^\]]*'biostimulant'/s.test(api),
    'ALLOWED_CATEGORIES includes the 6 v1 categories')
  assert(/ALLOWED_STATUSES\s*=\s*new Set\(\s*\[[^\]]*'active'[^\]]*'discontinued'[^\]]*'unverified'/s.test(api),
    'ALLOWED_STATUSES includes active|discontinued|unverified')

  // Status filter defaults to 'active' even when caller omits it.
  assert(/coerceStatus\(opts\.status\)\s*\?\?\s*'active'/.test(api),
    "status filter defaults to 'active' when missing/invalid")

  // q search uses the denormalized lowercased column.
  assert(/search_text\s+LIKE\s+\?/.test(api),
    'q search uses single LIKE against search_text')
  assert(/\.toLowerCase\(\)/.test(api),
    'q is lowercased before LIKE bind')

  // Limit cap.
  assert(/MAX_LIMIT\s*=\s*2000/.test(api), 'MAX_LIMIT = 2000')
  assert(/DEFAULT_LIMIT\s*=\s*500/.test(api), 'DEFAULT_LIMIT = 500')

  // rowToProduct contract (camelCase + JSON parse + integer→boolean).
  const camel = [
    'productName', 'brandOwner', 'manufacturer', 'epaNumber', 'formulation',
    'category', 'fracGroup', 'hracGroup', 'iracGroup', 'pgrClass',
    'chemicalClass', 'activeIngredients', 'fertilizerAnalysis', 'rates',
    'targets', 'turfSites', 'restrictedUse', 'signalWord', 'reiHours',
    'phiHours', 'labelUrl', 'notes', 'status', 'isActive', 'source',
    'sourceVersion', 'createdAt', 'updatedAt',
  ]
  for (const key of camel) {
    assert(new RegExp(`\\b${key}\\b\\s*:`).test(api),
      `rowToProduct returns ${key}`)
  }
  assert(/restricted_use\s*===\s*1/.test(api),
    'restricted_use coerced via === 1')
  assert(/is_active\s*===\s*1/.test(api),
    'is_active coerced via === 1')
}

// ── 3. Route wiring ────────────────────────────────────────────────────────
console.log('— worker/index.js (route wiring)')
{
  const idx = readFileSync('worker/index.js', 'utf8')

  assert(/from\s+['"]\.\/api\/productCatalog\.js['"]/.test(idx),
    'imports from api/productCatalog.js')
  assert(/listProductCatalog/.test(idx) && /getProductCatalog/.test(idx),
    'imports listProductCatalog + getProductCatalog')

  // The three GET endpoints.
  assert(/pathname\s*===\s*['"]\/api\/product-catalog['"]/.test(idx),
    'route: /api/product-catalog')
  assert(/pathname\s*===\s*['"]\/api\/product-catalog\/search['"]/.test(idx),
    'route: /api/product-catalog/search')
  assert(/\/\^\\\/api\\\/product-catalog\\\/\(\[\^\/\]\+\)\$\//.test(idx),
    'route: /api/product-catalog/:id regex')

  // /search must be matched BEFORE /:id (otherwise 'search' is consumed).
  const searchIdx = idx.indexOf('/api/product-catalog/search')
  const idRegexIdx = idx.search(/\/\^\\\/api\\\/product-catalog\\\/\(\[\^\/\]\+\)\$\//)
  assert(searchIdx > 0 && idRegexIdx > 0 && searchIdx < idRegexIdx,
    '/search wired before /:id (string match precedence)')

  // No mutation methods on the catalog routes.
  const catalogBlock = idx.match(/\/api\/product-catalog[\s\S]{0,2000}?\/api\/users/)?.[0] ?? ''
  assert(!/method\s*===\s*['"]POST['"]/.test(catalogBlock),
    'no POST handler in catalog block')
  assert(!/method\s*===\s*['"]PATCH['"]/.test(catalogBlock),
    'no PATCH handler in catalog block')
  assert(!/method\s*===\s*['"]DELETE['"]/.test(catalogBlock),
    'no DELETE handler in catalog block')
}

// ── 4. Seed dataset (Phase 7C.1 Commit 2) ───────────────────────────────────
console.log('— worker/seeds/product_catalog_v1.json (seed shape)')
{
  const raw = readFileSync('worker/seeds/product_catalog_v1.json', 'utf8')
  let seed
  try { seed = JSON.parse(raw) }
  catch (e) {
    assert(false, `seed file is valid JSON (${e.message})`)
    seed = { products: [] }
  }
  assert(seed.version === 'v1',                        "seed declares version 'v1'")
  assert(Array.isArray(seed.products),                 'seed.products is an array')
  assert(seed.products.length >= 10,                   `seed has ≥10 products (have ${seed.products.length})`)

  // Required sample products (per Phase 7C.1 Commit 2 verification spec).
  const names = seed.products.map(p => p.product_name)
  const samples = ['Barricade 4FL', 'Tenacity', 'PGF Complete 16-4-8']
  for (const s of samples) {
    assert(names.includes(s), `seed includes sample '${s}'`)
  }
  // Instrata family — original 'Instrata' was discontinued; current product is 'Instrata II'.
  assert(names.some(n => /^instrata/i.test(n)), 'seed includes an Instrata-family product')

  // Every row has the required fields the import script validates against.
  const ALLOWED_CATEGORIES = new Set(['herbicide', 'fungicide', 'insecticide', 'pgr', 'fertilizer', 'biostimulant'])
  let goodRows = 0, badCategory = 0, missingName = 0
  for (const p of seed.products) {
    if (!p.product_name) { missingName++; continue }
    if (!ALLOWED_CATEGORIES.has(p.category)) { badCategory++; continue }
    goodRows++
  }
  assert(missingName === 0,                            'every seed row has product_name')
  assert(badCategory  === 0,                           'every seed row has a valid category')
  assert(goodRows === seed.products.length,            'every seed row passes import validation')

  // Pesticide rows should carry an EPA number; fertilizer/biostimulant exempt.
  const pesticideNoEpa = seed.products.filter(p =>
    p.category !== 'fertilizer' && p.category !== 'biostimulant' && !p.epa_number)
  assert(pesticideNoEpa.length === 0,
    `pesticide rows carry EPA numbers (missing: ${pesticideNoEpa.map(p => p.product_name).join(', ') || 'none'})`)

  // Fertilizer rows must have fertilizer_analysis populated.
  for (const p of seed.products) {
    if (p.category !== 'fertilizer') continue
    assert(typeof p.fertilizer_analysis === 'string' && p.fertilizer_analysis.trim() !== '',
      `fertilizer '${p.product_name}' has fertilizer_analysis`)
  }
}

// ── 5. Import script source contracts ───────────────────────────────────────
console.log('— scripts/importProductCatalog.mjs (source contracts)')
{
  const src = readFileSync('scripts/importProductCatalog.mjs', 'utf8')

  // Idempotent insert path.
  assert(/INSERT OR REPLACE INTO product_catalog/.test(src),
    'uses INSERT OR REPLACE (idempotent)')
  // Stable ID derivation: name + EPA when present.
  assert(/function\s+makeId\s*\(/.test(src) && /pc-\$\{slug\}-\$\{epa\}/.test(src),
    'makeId derives stable PK from name + EPA')
  // search_text populated.
  assert(/function\s+buildSearchText\s*\(/.test(src),
    'builds search_text blob')
  assert(/sqlString\(searchText\)/.test(src),
    'search_text written to row')
  // JSON columns serialized.
  assert(/sqlJson\(ai\)/.test(src),         'active_ingredients_json serialized')
  assert(/sqlJson\(rates\)/.test(src),      'rates_json serialized')
  assert(/sqlJson\(targets\)/.test(src),    'targets_json serialized')
  assert(/sqlJson\(turfSites\)/.test(src),  'turf_sites_json serialized')
  // Provenance.
  assert(/sqlString\(['"]seed-import['"]\)/.test(src), "source = 'seed-import'")
  assert(/sqlString\(['"]v1['"]\)/.test(src),          "source_version = 'v1'")
  // Strict category validation.
  assert(/ALLOWED_CATEGORIES\s*=\s*new Set\(/.test(src),
    'validates category against ALLOWED_CATEGORIES set')
  // Logs the 3 counters the spec asks for.
  assert(/inserted/.test(src) && /skipped/.test(src) && /warnings/.test(src),
    'logs inserted / skipped / warnings counts')
  // Must NOT touch inventory_items in Commit 2. Allow the word in comments
  // (we DO discuss why we're not touching it) — only flag actual SQL.
  assert(!/(INSERT|UPDATE|DELETE|ALTER|DROP|FROM)\s+inventory_items/i.test(src),
    'does NOT issue SQL against inventory_items (linkage is a later commit)')
}

// ── 6. Import script behavioral smoke (dry-run, no DB) ──────────────────────
console.log('— importProductCatalog dry-run end-to-end')
{
  function runImport(args) {
    const res = spawnSync(process.execPath,
      ['scripts/importProductCatalog.mjs', '--dry-run', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
  }

  // 6a. Real seed → expected count + summary line.
  const real = runImport([])
  assert(real.code === 0,                              'real seed dry-run exits 0')
  assert(/15 inserted, 0 skipped, 0 warnings/.test(real.stdout),
    'real seed → 15 inserted, 0 skipped, 0 warnings', real.stdout.split('\n').slice(-3).join(' | '))
  assert(/pc-barricade-4fl-100-1139/.test(real.stdout),
    'real seed → emits Barricade ID pc-barricade-4fl-100-1139')
  assert(/pc-tenacity-100-1267/.test(real.stdout),
    'real seed → emits Tenacity ID pc-tenacity-100-1267')
  assert(/pc-instrata-ii-100-1572/.test(real.stdout),
    'real seed → emits Instrata II ID pc-instrata-ii-100-1572')
  assert(/pc-pgf-complete-16-4-8/.test(real.stdout),
    'real seed → emits PGF Complete ID pc-pgf-complete-16-4-8 (no EPA)')

  // 6b. Synthetic edge cases — bad category, duplicate, valid row.
  const dir  = mkdtempSync(join(tmpdir(), 'pc-smoke-'))
  const path = join(dir, 'edge.json')
  writeFileSync(path, JSON.stringify({
    version: 'v1',
    products: [
      // Valid baseline.
      { product_name: 'Smoke Valid', category: 'fungicide', epa_number: '99-1',
        active_ingredients: [{ name: 'Whatever', percentage: 1 }], rates: [], targets: [] },
      // Invalid category → rejected.
      { product_name: 'Smoke Bad Cat', category: 'banjo', epa_number: '99-2' },
      // Duplicate id (same name + EPA as the first) → second skipped.
      { product_name: 'Smoke Valid', category: 'fungicide', epa_number: '99-1' },
      // Missing name → rejected.
      { category: 'fungicide', epa_number: '99-3' },
      // Pesticide with no EPA → kept, but warns.
      { product_name: 'Smoke No EPA', category: 'herbicide' },
    ],
  }, null, 2), 'utf8')

  const edge = runImport(['--seed', path])
  assert(edge.code === 0,                              'edge dry-run exits 0')
  assert(/2 inserted, 3 skipped/.test(edge.stdout),
    'edge → 2 inserted (Smoke Valid + Smoke No EPA), 3 skipped',
    edge.stdout.split('\n').slice(-5).join(' | '))
  assert(/skip\s+Smoke Bad Cat\s+→ invalid category/.test(edge.stdout),
    'edge → bad category rejected with reason')
  assert(/skip\s+Smoke Valid\s+→ duplicate id/.test(edge.stdout),
    'edge → duplicate id detected and skipped')
  assert(/skip\s+\(no name\)\s+→ missing product_name/.test(edge.stdout),
    'edge → missing product_name rejected')
  assert(/warn\s+Smoke No EPA: pesticide-category row has no epa_number/.test(edge.stdout),
    'edge → pesticide w/o EPA warns but does not reject')
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
