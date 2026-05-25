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

import { readFileSync } from 'fs'

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

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
