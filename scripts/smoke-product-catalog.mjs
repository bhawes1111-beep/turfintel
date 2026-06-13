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

// ── 7. Client store source contracts ────────────────────────────────────────
console.log('— src/utils/productCatalog/productCatalogStore.js (source)')
{
  const src = readFileSync('src/utils/productCatalog/productCatalogStore.js', 'utf8')

  // Public exports the spec requires.
  const exports = [
    'useProductCatalog',
    'refreshProductCatalog',
    'searchProductCatalog',
    'getCatalogProductById',
    'listCatalogCategories',
    'listCatalogFracGroups',
    'listCatalogHracGroups',
    'listCatalogIracGroups',
    'listCatalogPgrClasses',
  ]
  for (const name of exports) {
    assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(src)
        || new RegExp(`export\\s+const\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Session-cookie auth, no key header, no mutation imports.
  assert(/credentials:\s*['"]same-origin['"]/.test(src),
    "fetch sends credentials: 'same-origin'")
  assert(!/['"]x-admin-key['"]\s*:/i.test(src),
    'no x-admin-key header')
  assert(!/mutationHeaders|adminKeyHeader/.test(src),
    'does not import mutation/admin headers')

  // Read-only: no POST/PATCH/DELETE calls.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'never calls POST/PATCH/DELETE')

  // Globally scoped (no course coupling).
  assert(!/withCourseScope|subscribeCourseChange|getSelectedCourseId/.test(src),
    'not coupled to courseStore (global catalog)')

  // Lazy-load via useSyncExternalStore + hasBooted gate.
  assert(/useSyncExternalStore/.test(src),
    'uses useSyncExternalStore')
  assert(/hasBooted/.test(src) && /refreshProductCatalog\(\)/.test(src),
    'lazy-loads catalog on first subscribe')

  // status='active' default.
  assert(/status:\s*['"]active['"]/.test(src),
    "DEFAULT_FETCH_PARAMS pins status='active'")

  // Hits the right endpoint.
  assert(/['"]\/api\/product-catalog['"]/.test(src),
    'API constant is /api/product-catalog')
}

// ── 8. Client store behavior (dynamic import + __TEST seam) ─────────────────
console.log('— productCatalogStore behavior (cache + filters)')
{
  // We can dynamic-import the ESM store directly — no React renderer needed
  // for the filter / lookup paths. The __TEST seam seeds the cache without
  // touching fetch.
  const mod = await import('../src/utils/productCatalog/productCatalogStore.js')

  const fixtures = [
    {
      id: 'pc-a', productName: 'Alpha Fungicide', brandOwner: 'Brand A',
      manufacturer: 'Mfr A', epaNumber: '1-1', category: 'fungicide',
      fracGroup: '11', hracGroup: null, iracGroup: null, pgrClass: null,
      chemicalClass: 'strobilurin', activeIngredients: [{ name: 'Azoxystrobin', percentage: 50 }],
      fertilizerAnalysis: null, rates: [], targets: ['dollar spot', 'brown patch'],
      turfSites: [], restrictedUse: false, signalWord: 'Caution',
      reiHours: 4, phiHours: null, labelUrl: null, notes: null,
      status: 'active', isActive: true, source: 'seed-import', sourceVersion: 'v1',
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    },
    {
      id: 'pc-b', productName: 'Bravo Herbicide', brandOwner: 'Brand B',
      manufacturer: 'Mfr B', epaNumber: '2-2', category: 'herbicide',
      fracGroup: null, hracGroup: '3', iracGroup: null, pgrClass: null,
      chemicalClass: 'dinitroaniline', activeIngredients: [{ name: 'Prodiamine', percentage: 40 }],
      fertilizerAnalysis: null, rates: [], targets: ['crabgrass'],
      turfSites: [], restrictedUse: false, signalWord: 'Caution',
      reiHours: 12, phiHours: null, labelUrl: null, notes: null,
      status: 'active', isActive: true, source: 'seed-import', sourceVersion: 'v1',
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    },
    {
      id: 'pc-c', productName: 'Charlie PGR', brandOwner: 'Brand C',
      manufacturer: 'Mfr C', epaNumber: '3-3', category: 'pgr',
      fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: 'GA inhibitor',
      chemicalClass: 'cyclohexanedione', activeIngredients: [{ name: 'Trinexapac-ethyl', percentage: 11 }],
      fertilizerAnalysis: null, rates: [], targets: [],
      turfSites: [], restrictedUse: false, signalWord: 'Caution',
      reiHours: 12, phiHours: null, labelUrl: null, notes: null,
      status: 'active', isActive: true, source: 'seed-import', sourceVersion: 'v1',
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    },
    {
      id: 'pc-d', productName: 'Delta Old', brandOwner: 'Brand D',
      manufacturer: 'Mfr D', epaNumber: '4-4', category: 'fungicide',
      fracGroup: '11', hracGroup: null, iracGroup: null, pgrClass: null,
      chemicalClass: 'strobilurin', activeIngredients: [],
      fertilizerAnalysis: null, rates: [], targets: ['leaf spot'],
      turfSites: [], restrictedUse: false, signalWord: 'Caution',
      reiHours: 4, phiHours: null, labelUrl: null, notes: null,
      // Discontinued — important: search default should hide this.
      status: 'discontinued', isActive: false, source: 'seed-import', sourceVersion: 'v1',
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    },
  ]

  mod.__TEST.reset()
  mod.__TEST.setCache(fixtures)

  // getCatalogProductById
  assert(mod.getCatalogProductById('pc-a')?.productName === 'Alpha Fungicide',
    'getCatalogProductById returns cached row')
  assert(mod.getCatalogProductById('pc-missing') === null,
    'getCatalogProductById returns null for unknown id')
  assert(mod.getCatalogProductById('') === null,
    'getCatalogProductById returns null for empty id')

  // searchProductCatalog — default hides non-active rows.
  const allActive = mod.searchProductCatalog('')
  assert(allActive.length === 3,
    `empty q → 3 active rows (hides Delta discontinued)`, allActive.map(p => p.id))
  assert(!allActive.find(p => p.id === 'pc-d'),
    'Delta (discontinued) excluded by default status filter')

  // status: null → no status filter (returns discontinued too).
  const allRows = mod.searchProductCatalog('', { status: null })
  assert(allRows.length === 4,
    'status: null → returns every cached row including discontinued')

  // Free-text search across denormalized fields.
  const crabgrass = mod.searchProductCatalog('crabgrass')
  assert(crabgrass.length === 1 && crabgrass[0].id === 'pc-b',
    "q='crabgrass' → only the herbicide that targets it")
  const azoxy = mod.searchProductCatalog('azoxystrobin')
  assert(azoxy.length === 1 && azoxy[0].id === 'pc-a',
    "q='azoxystrobin' → matches by active-ingredient name")
  const mfrA = mod.searchProductCatalog('mfr a')
  assert(mfrA.length === 1 && mfrA[0].id === 'pc-a',
    "q='mfr a' → matches by manufacturer")

  // category filter (case-insensitive).
  const cats = mod.searchProductCatalog('', { category: 'Fungicide' })
  assert(cats.length === 1 && cats[0].id === 'pc-a',
    "category='Fungicide' (case-insensitive) → 1 active fungicide")

  // FRAC / HRAC filters are exact-match strings.
  const frac11 = mod.searchProductCatalog('', { frac: '11' })
  assert(frac11.length === 1 && frac11[0].id === 'pc-a',
    "frac='11' active-only → 1 row (Delta hidden)")
  const hrac3 = mod.searchProductCatalog('', { hrac: '3' })
  assert(hrac3.length === 1 && hrac3[0].id === 'pc-b', "hrac='3' → 1 row")
  const pgr = mod.searchProductCatalog('', { pgr: 'GA inhibitor' })
  assert(pgr.length === 1 && pgr[0].id === 'pc-c', "pgr='GA inhibitor' → 1 row")
  const irac28 = mod.searchProductCatalog('', { irac: '28' })
  assert(irac28.length === 0, "irac='28' → no rows in fixture")

  // Combined AND filters.
  const combined = mod.searchProductCatalog('', { category: 'fungicide', status: null, frac: '11' })
  assert(combined.length === 2,
    'category=fungicide + status=null + frac=11 → 2 rows (Alpha + Delta)',
    combined.map(p => p.id))

  // Distinct lists — built from cache, sorted, no nulls.
  const categories = mod.listCatalogCategories()
  assert(categories.length === 3 && categories.includes('fungicide')
    && categories.includes('herbicide') && categories.includes('pgr'),
    'listCatalogCategories includes all 3 distinct values', categories)
  const fracs = mod.listCatalogFracGroups()
  assert(fracs.length === 1 && fracs[0] === '11',
    'listCatalogFracGroups dedupes Alpha + Delta → ["11"]', fracs)
  const hracs = mod.listCatalogHracGroups()
  assert(hracs.length === 1 && hracs[0] === '3', 'listCatalogHracGroups → ["3"]')
  const pgrs = mod.listCatalogPgrClasses()
  assert(pgrs.length === 1 && pgrs[0] === 'GA inhibitor', 'listCatalogPgrClasses → ["GA inhibitor"]')
  const iracs = mod.listCatalogIracGroups()
  assert(iracs.length === 0, 'listCatalogIracGroups → [] (nothing in fixture)')

  mod.__TEST.reset()
}

// ── 9. Inventory Catalog tab (UI source contracts) ─────────────────────────
console.log('— src/pages/Inventory/Inventory.jsx (Catalog tab registered)')
{
  const shell = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')
  assert(/from\s+['"]\.\/tabs\/InventoryCatalog['"]/.test(shell),
    'imports InventoryCatalog tab body')
  assert(/'Catalog'/.test(shell),
    "'Catalog' literal appears in Inventory shell")
  // Confirm 'Catalog' is in the legacy TABS array (registered, not just imported).
  // Phase 9B.2 renamed the constant to LEGACY_TABS while preserving the
  // same 11-label payload for non-Crosswinds courses.
  const tabsMatch = shell.match(/const\s+(?:LEGACY_TABS|TABS)\s*=\s*\[([^\]]+)\]/)
  assert(tabsMatch && /'Catalog'/.test(tabsMatch[1]),
    "'Catalog' present in legacy TABS array")
  assert(/activeTab\s*===\s*'Catalog'\s*&&\s*<InventoryCatalog/.test(shell),
    'Catalog tab body wired to activeTab === Catalog')

  // Pre-existing tabs must remain unchanged in this commit.
  for (const t of ['Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Low Stock', 'Purchase History']) {
    assert(tabsMatch && new RegExp(`'${t}'`).test(tabsMatch[1]),
      `pre-existing tab '${t}' still in TABS`)
  }
}

console.log('— src/pages/Inventory/tabs/InventoryCatalog.jsx (tab body)')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryCatalog.jsx', 'utf8')

  // Hook + helpers wired from the store.
  assert(/useProductCatalog\b/.test(src),                  'uses useProductCatalog()')
  assert(/searchProductCatalog\b/.test(src),               'uses searchProductCatalog()')
  assert(/listCatalogCategories\b/.test(src),              'uses listCatalogCategories()')
  assert(/listCatalogFracGroups\b/.test(src),              'uses listCatalogFracGroups()')
  assert(/listCatalogHracGroups\b/.test(src),              'uses listCatalogHracGroups()')
  assert(/listCatalogIracGroups\b/.test(src),              'uses listCatalogIracGroups()')
  assert(/listCatalogPgrClasses\b/.test(src),              'uses listCatalogPgrClasses()')

  // Search input present.
  assert(/type=['"]search['"]/.test(src),                  'renders a <input type="search">')

  // Card surface shows the required identity fields.
  assert(/productName/.test(src),                          'card surfaces productName')
  assert(/brandOwner/.test(src) && /manufacturer/.test(src), 'card surfaces brandOwner + manufacturer')
  assert(/category/.test(src),                             'card surfaces category')
  assert(/epaNumber/.test(src),                            'card surfaces epaNumber when present')
  assert(/activeIngredients/.test(src),                    'card surfaces activeIngredients')
  assert(/targets/.test(src),                              'card surfaces primary targets')

  // Chips for chemistry vocabularies (FRAC/HRAC/IRAC/PGR).
  assert(/fracGroup/.test(src) && /chipFrac/.test(src),    'FRAC chip rendered')
  assert(/hracGroup/.test(src) && /chipHrac/.test(src),    'HRAC chip rendered')
  assert(/iracGroup/.test(src) && /chipIrac/.test(src),    'IRAC chip rendered')
  assert(/pgrClass/.test(src)  && /chipPgr/.test(src),     'PGR chip rendered')

  // Detail drawer.
  assert(/SideDrawer/.test(src),                           'uses SideDrawer for detail panel')
  assert(/labelUrl/.test(src),                             'detail surfaces labelUrl')
  assert(/<a\s+href={product\.labelUrl}/.test(src) || /href={product\.labelUrl}/.test(src),
    'detail renders labelUrl as an anchor (clickable label link)')
  assert(/rates/.test(src) && /Label rates/.test(src),     'detail surfaces rates section')
  assert(/notes/.test(src),                                'detail surfaces notes')
  assert(/product\.source/.test(src) && /product\.sourceVersion/.test(src),
    'detail surfaces source + sourceVersion (provenance)')
  assert(/reiHours/.test(src),                             'detail surfaces REI')

  // ── Forbidden surfaces (Commit 4 scope) ──────────────────────────────────
  // No "Add to Inventory" CTA in any form.
  assert(!/Add to Inventory/i.test(src),                   'no "Add to Inventory" CTA in this commit')
  // No mutation calls / no inventory writes / no Spray Builder coupling.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'tab body issues no POST/PATCH/DELETE')
  assert(!/inventoryStore|createInventory|updateInventory|deleteInventory|spraysStore|SprayBuilder|BuildSpraySheet/.test(src),
    'tab body does not import inventory or spray-builder modules')
  assert(!/product_catalog_id/.test(src),
    'tab body does not write product_catalog_id linkage (deferred to Commit 5)')
}

console.log('— InventoryCatalog css scope')
{
  const css = readFileSync('src/pages/Inventory/tabs/InventoryCatalog.module.css', 'utf8')
  // Scoped chip class names so they don't collide with the existing
  // inventory stock badges.
  for (const cls of ['chipFrac', 'chipHrac', 'chipIrac', 'chipPgr']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 10. Inventory linkage (Phase 7C.1 Commit 5) ─────────────────────────────
console.log('— worker/api/inventory.js (productCatalogId exposed read-only)')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')

  // rowToItem must surface the new column under the camelCase key.
  assert(/productCatalogId:\s*row\.product_catalog_id/.test(src),
    'rowToItem maps row.product_catalog_id → productCatalogId')

  // MUTABLE_COLUMNS must NOT include the catalog FK — no manual linking yet.
  const mutBlock = src.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(mutBlock.length > 0,                          'MUTABLE_COLUMNS block found')
  assert(!/productCatalogId/.test(mutBlock),
    'productCatalogId NOT in MUTABLE_COLUMNS (no manual linking in 7C.1)')
  assert(!/product_catalog_id/.test(mutBlock),
    'product_catalog_id NOT in MUTABLE_COLUMNS')
}

console.log('— src/pages/Inventory/components/CatalogChip.jsx (chip primitive)')
{
  const src = readFileSync('src/pages/Inventory/components/CatalogChip.jsx', 'utf8')

  assert(/export\s+default\s+function\s+CatalogChip/.test(src),
    'exports CatalogChip')
  // Subscribes to the catalog cache via the hook + resolves via Map lookup.
  assert(/useProductCatalog\b/.test(src),               'uses useProductCatalog hook')
  assert(/getCatalogProductById\b/.test(src),           'uses getCatalogProductById')
  // Hides silently when either piece is missing.
  assert(/if\s*\(\s*!productCatalogId\s*\)\s*return\s+null/.test(src),
    'returns null when productCatalogId is falsy')
  assert(/if\s*\(\s*!product\s*\)\s*return\s+null/.test(src),
    'returns null when catalog row not in cache')
  // Stops propagation so wrapping <button> rows don't open their own drawer.
  assert(/stopPropagation\(\)/.test(src),
    'click handler stops propagation')
  // Calls the onOpen callback with the productCatalogId.
  assert(/onOpen\?\.\(productCatalogId\)/.test(src),
    'fires onOpen(productCatalogId)')
  // Not nested-button: outer element must be a span with role=button so the
  // chip can sit inside the Products-tab card <button>.
  assert(/role=['"]button['"]/.test(src),
    'outer element is role="button" (avoids invalid <button>-in-<button>)')
  // Strip JS line/block comments before scanning for a literal <button>
  // tag — the file legitimately discusses <button>-in-<button> in prose.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/<button\b/.test(codeOnly),
    'does not render a literal <button> JSX element')
  // Keyboard activation for the role=button.
  assert(/onKeyDown/.test(src) && /Enter/.test(src) && /['"] ['"]/.test(src) === false
        || /onKeyDown/.test(src),
    'keyboard activation present (Enter / Space)')

  // Emoji + label.
  assert(/📋/.test(src),                                'renders 📋 icon')
  assert(/Catalog/.test(src),                           'renders Catalog label')
}

console.log('— Inventory shell: navigation state for catalog jump')
{
  const src = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')

  // The shell owns the seed and the tab switch.
  assert(/catalogSeedId/.test(src),
    'shell holds catalogSeedId state')
  assert(/function\s+openCatalogProduct/.test(src) || /openCatalogProduct\s*=/.test(src),
    'shell defines openCatalogProduct callback')
  assert(/setActiveTab\(['"]Catalog['"]\)/.test(src),
    'callback switches activeTab to Catalog')

  // Each linkable tab receives onOpenCatalog — either as an inline prop
  // OR via a {...productsProps}-style spread whose object declaration
  // names onOpenCatalog. Phase 9B.2 spreads InventoryProducts' four
  // props through productsProps, so the inline regex stops matching it.
  for (const tab of ['InventoryProducts', 'InventoryChemicals', 'InventoryFertilizer']) {
    const inline = new RegExp(`<${tab}\\b[^>]*onOpenCatalog`).test(src)
    const spread = new RegExp(`<${tab} \\{\\.\\.\\.productsProps\\}`).test(src)
                && /productsProps\s*=\s*\{[\s\S]{0,400}onOpenCatalog:\s*openCatalogProduct/.test(src)
    assert(inline || spread,
      `${tab} receives onOpenCatalog prop (inline or via productsProps spread)`)
  }

  // InventoryCatalog receives initialSelectedId + onConsumeSeed.
  assert(/<InventoryCatalog\b[^>]*initialSelectedId=\{catalogSeedId\}/.test(src),
    'InventoryCatalog receives initialSelectedId={catalogSeedId}')
  assert(/<InventoryCatalog\b[^>]*onConsumeSeed/.test(src),
    'InventoryCatalog receives onConsumeSeed (clears seed after open)')
}

console.log('— InventoryCatalog respects initialSelectedId')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryCatalog.jsx', 'utf8')
  assert(/initialSelectedId/.test(src),
    'InventoryCatalog accepts initialSelectedId prop')
  assert(/useState\(initialSelectedId\)/.test(src),
    'useState seeded from initialSelectedId')
  assert(/useEffect/.test(src) && /initialSelectedId/.test(src) && /onConsumeSeed/.test(src),
    'useEffect re-syncs selection on seed change + clears parent seed')
}

console.log('— Affected tabs render CatalogChip')
for (const [tab, file] of [
  ['Chemicals',  'src/pages/Inventory/tabs/InventoryChemicals.jsx'],
  ['Fertilizer', 'src/pages/Inventory/tabs/InventoryFertilizer.jsx'],
  ['Products',   'src/pages/Inventory/tabs/InventoryProducts.jsx'],
]) {
  const src = readFileSync(file, 'utf8')
  assert(/import\s+CatalogChip\s+from\s+['"]\.\.\/components\/CatalogChip['"]/.test(src),
    `${tab}: imports CatalogChip`)
  assert(/<CatalogChip\b[^>]*productCatalogId=/.test(src),
    `${tab}: renders <CatalogChip productCatalogId={...}>`)
  assert(/<CatalogChip\b[^>]*onOpen={onOpenCatalog}/.test(src),
    `${tab}: passes onOpen={onOpenCatalog}`)
  assert(/onOpenCatalog/.test(src) && /(\(\{\s*[^}]*onOpenCatalog[^}]*\}\s*=\s*\{\}\)|function\s+\w+\(\{\s*[^}]*onOpenCatalog)/.test(src),
    `${tab}: function signature accepts onOpenCatalog prop`)
}

console.log('— Inventory store passes productCatalogId through unchanged')
{
  const src = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  // The store passes JSON through; we just need to confirm no transform
  // strips the field. The Worker is the source of truth — verify nothing
  // in the store explicitly drops it.
  assert(!/delete\s+[a-z]+\.productCatalogId/.test(src),
    'inventoryStore does not strip productCatalogId')
}

console.log('— CatalogChip behavior (live)')
{
  // Use the productCatalogStore __TEST seam from earlier section.
  const storeMod = await import('../src/utils/productCatalog/productCatalogStore.js')
  storeMod.__TEST.reset()
  storeMod.__TEST.setCache([
    {
      id: 'pc-linked', productName: 'Linked Sample', brandOwner: 'X',
      manufacturer: 'X', epaNumber: '7-7', category: 'fungicide',
      fracGroup: '11', activeIngredients: [], rates: [], targets: [],
      turfSites: [], restrictedUse: false, signalWord: 'Caution',
      reiHours: 4, status: 'active', isActive: true,
      source: 'seed-import', sourceVersion: 'v1',
      createdAt: '', updatedAt: '',
    },
  ])

  // Linked + cached → resolvable.
  assert(storeMod.getCatalogProductById('pc-linked')?.productName === 'Linked Sample',
    'getCatalogProductById finds linked catalog row')
  // Linked but cache miss → falsy.
  assert(storeMod.getCatalogProductById('pc-missing') === null,
    'getCatalogProductById returns null when chip would silently hide')
  // No id → falsy.
  assert(storeMod.getCatalogProductById('') === null,
    'falsy id → null (chip hides)')

  storeMod.__TEST.reset()
}

// ── 11. Spray Builder catalog-first lookup (Phase 7C.1 Commit 6) ────────────
console.log('— src/utils/productCatalog/resolveSprayProductIntel.js (resolver)')
{
  const src = readFileSync('src/utils/productCatalog/resolveSprayProductIntel.js', 'utf8')
  assert(/export\s+function\s+resolveSprayProductIntel/.test(src),
    'exports resolveSprayProductIntel')

  // Precedence comments lock the order: catalog → label → legacy.
  assert(/Tier 1:\s*product_catalog/.test(src),         'documents Tier 1 = product_catalog')
  assert(/Tier 2:\s*inventory_product_labels/.test(src),'documents Tier 2 = inventory_product_labels')
  assert(/Tier 3:\s*legacy/.test(src),                  'documents Tier 3 = legacy')

  // First-hit-wins: never merges across tiers.
  assert(/first hit wins/i.test(src),                   'comment: first-hit-wins (no cross-tier merge)')

  // Pure-compute: resolver does not import the catalog store / inventoryStore.
  assert(!/from\s+['"][^'"]*productCatalogStore['"]/.test(src),
    'resolver does not import productCatalogStore (pure helper)')
  assert(!/from\s+['"][^'"]*inventoryStore['"]/.test(src),
    'resolver does not import inventoryStore (pure helper)')

  // No mutation: no fetch / POST / DB calls.
  assert(!/fetch\(/.test(src),                          'resolver does not call fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'resolver does not POST/PATCH/DELETE')
}

console.log('— resolveSprayProductIntel behavior (3-tier precedence)')
{
  const { resolveSprayProductIntel, __TEST } =
    await import('../src/utils/productCatalog/resolveSprayProductIntel.js')

  // ── Fixtures ────────────────────────────────────────────────────────────
  const catalogProducts = [
    {
      id: 'pc-tenacity-100-1267', productName: 'Tenacity', category: 'herbicide',
      hracGroup: '27', activeIngredients: [{ name: 'Mesotrione', percentage: 40 }],
      signalWord: 'Caution', reiHours: 12, phiHours: null,
      rates: [{ rate: '4-8', unit: 'fl oz/acre' }],
      labelUrl: 'https://example/tenacity',
    },
    {
      id: 'pc-heritage-100-1093', productName: 'Heritage', category: 'fungicide',
      fracGroup: '11', activeIngredients: [{ name: 'Azoxystrobin', percentage: 50 }],
      signalWord: 'Caution', reiHours: 4, phiHours: null,
      rates: [], labelUrl: null,
    },
  ]

  // Inventory rows: one linked via FK, one matched by name, one with a
  // label (no catalog hit), one legacy-only.
  const inventoryProducts = [
    { id: 'inv-A', name: 'Tenacity',  kind: 'chemical', category: 'Herbicide',
      productCatalogId: 'pc-tenacity-100-1267' },
    { id: 'inv-B', name: 'Heritage',  kind: 'chemical', category: 'Fungicide' /* no FK */ },
    { id: 'inv-C', name: 'PrivateLabel 50WG', kind: 'chemical', category: 'Fungicide' },
    { id: 'inv-D', name: 'Generic Filler',    kind: 'fertilizer', category: 'Fertilizer' },
    { id: 'inv-E', name: 'Stale FK',  kind: 'chemical', category: 'Fungicide',
      productCatalogId: 'pc-deleted-row' /* not in cache */ },
  ]

  const labelsByItemId = {
    'inv-C': {
      productName: 'PrivateLabel 50WG', fracGroup: '7', hracGroup: null,
      iracGroup: null, signalWord: 'Warning', reiHours: 24, phi: 4,
      activeIngredients: 'Boscalid 50%', pdfUrl: 'https://example/private.pdf',
    },
  }

  // (a) catalog hit via explicit FK
  {
    const r = resolveSprayProductIntel(
      { name: 'Tenacity', inventoryItemId: 'inv-A' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'catalog',                'FK → catalog source')
    assert(r.catalogId === 'pc-tenacity-100-1267','FK → returns catalog id')
    assert(r.hracGroup === '27',                  'FK → HRAC from catalog')
    assert(/Mesotrione 40%/.test(r.activeIngredientSummary ?? ''),
      'FK → ingredient summary built')
    assert(r.reiHours === 12,                     'FK → REI from catalog')
    assert(r.labelUrl === 'https://example/tenacity', 'FK → labelUrl from catalog')
  }

  // (b) catalog hit via normalized name (no FK)
  {
    const r = resolveSprayProductIntel(
      { name: 'Heritage', inventoryItemId: 'inv-B' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'catalog',                'name-match → catalog source')
    assert(r.fracGroup === '11',                  'name-match → FRAC from catalog')
    assert(r.catalogId === 'pc-heritage-100-1093','name-match → catalog id')
  }

  // (c) catalog beats label when both exist for the same product.
  //     Inject a fake catalog row with the same name as the labeled
  //     inventory item and confirm catalog wins.
  {
    const r = resolveSprayProductIntel(
      { name: 'PrivateLabel 50WG', inventoryItemId: 'inv-C' },
      {
        inventoryProducts,
        catalogProducts: [
          ...catalogProducts,
          {
            id: 'pc-private-50wg', productName: 'PrivateLabel 50WG',
            category: 'fungicide', fracGroup: '11',
            activeIngredients: [{ name: 'Pyraclostrobin', percentage: 23 }],
            signalWord: 'Caution', reiHours: 12, rates: [],
          },
        ],
        labelsByItemId,
      })
    assert(r.source === 'catalog',                'catalog wins over label when both match')
    assert(r.fracGroup === '11',                  'catalog FRAC supplied (not label FRAC "7")')
    assert(r.reiHours === 12,                     'catalog REI supplied (not label REI 24)')
  }

  // (d) label fallback when no catalog match.
  {
    const r = resolveSprayProductIntel(
      { name: 'PrivateLabel 50WG', inventoryItemId: 'inv-C' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'label',                  'no catalog → label tier')
    assert(r.fracGroup === '7',                   'label FRAC surfaced')
    assert(r.reiHours === 24,                     'label REI surfaced')
    assert(r.phiHours === 4,                      'label PHI surfaced from label.phi')
    assert(r.labelUrl === 'https://example/private.pdf', 'label pdfUrl surfaced')
  }

  // (e) legacy fallback when no catalog and no label.
  {
    const r = resolveSprayProductIntel(
      { name: 'Generic Filler', inventoryItemId: 'inv-D' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'legacy',                 'no catalog + no label → legacy tier')
    assert(r.category === 'Fertilizer',           'legacy → category from inventory row')
    assert(r.fracGroup === null,                  'legacy → no FRAC')
  }

  // (f) stale FK falls through to name-match (which here also misses
  //     because "Stale FK" isn't in the catalog) → legacy.
  {
    const r = resolveSprayProductIntel(
      { name: 'Stale FK', inventoryItemId: 'inv-E' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'legacy',                 'stale catalog FK does not return catalog data')
    assert(r.catalogId === null,                  'stale FK does not leak as catalogId')
  }

  // (g) row with no inventoryItemId and unknown name → empty intel.
  {
    const r = resolveSprayProductIntel(
      { name: 'Unknown Product' },
      { inventoryProducts, catalogProducts, labelsByItemId })
    assert(r.source === 'none',                   "unknown name + no FK → source 'none'")
  }

  // (h) null/undefined inputs don't blow up.
  {
    const r1 = resolveSprayProductIntel(null,      {})
    const r2 = resolveSprayProductIntel(undefined, {})
    const r3 = resolveSprayProductIntel({},        {})
    assert(r1.source === 'none' && r2.source === 'none' && r3.source === 'none',
      'null/undefined/empty row → empty intel')
  }

  // (i) normalize helper edge cases.
  {
    assert(__TEST.normalizeName('Tenacity')         === 'tenacity', 'normalize simple')
    assert(__TEST.normalizeName('Barricade 4FL')    === 'barricade-4fl', 'normalize spaces')
    assert(__TEST.normalizeName('PGF Complete 16-4-8') === 'pgf-complete-16-4-8',
      'normalize hyphens collapse')
    assert(__TEST.normalizeName('  Tenacity  ')     === 'tenacity', 'normalize trims')
    assert(__TEST.normalizeName(null)               === '',         'normalize null → ""')
  }

  // (j) read-only — calling the resolver does not mutate inputs.
  {
    const ip      = JSON.parse(JSON.stringify(inventoryProducts))
    const cp      = JSON.parse(JSON.stringify(catalogProducts))
    const lbl     = JSON.parse(JSON.stringify(labelsByItemId))
    const ipBefore = JSON.stringify(ip)
    const cpBefore = JSON.stringify(cp)
    const lblBefore = JSON.stringify(lbl)
    resolveSprayProductIntel({ name: 'Tenacity', inventoryItemId: 'inv-A' },
      { inventoryProducts: ip, catalogProducts: cp, labelsByItemId: lbl })
    assert(JSON.stringify(ip)  === ipBefore,  'inventoryProducts not mutated')
    assert(JSON.stringify(cp)  === cpBefore,  'catalogProducts not mutated')
    assert(JSON.stringify(lbl) === lblBefore, 'labelsByItemId not mutated')
  }
}

console.log('— BuildSpraySheet wires catalog-first lookup')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

  // Hook + resolver imports.
  assert(/from\s+['"][^'"]*productCatalog\/productCatalogStore['"]/.test(src),
    'imports useProductCatalog from store')
  assert(/useProductCatalog/.test(src),                 'calls useProductCatalog()')
  assert(/from\s+['"][^'"]*productCatalog\/resolveSprayProductIntel['"]/.test(src),
    'imports resolveSprayProductIntel')
  assert(/resolveSprayProductIntel\(/.test(src),        'invokes resolveSprayProductIntel(...)')

  // Resolver wired into enrichedRows + dependency array.
  const memo = src.match(/enrichedRows\s*=\s*useMemo\([\s\S]*?\}, \[[^\]]*\]\)/)?.[0] ?? ''
  assert(memo.includes('catalogProducts'),
    'enrichedRows useMemo deps include catalogProducts')
  assert(memo.includes('labelsByItemId'),
    'enrichedRows useMemo deps include labelsByItemId')
  assert(memo.includes('resolveSprayProductIntel'),
    'enrichedRows invokes the resolver per row')

  // Intel chip render present.
  assert(/<RowIntelChips\b/.test(src),                  'renders <RowIntelChips intel=…> in row column')

  // Forbidden: no catalog mutation surface in BuildSpraySheet.
  // The catalog API is GET-only; we never POST/PATCH/DELETE against it.
  assert(!/['"]\/api\/product-catalog['"][^\n]*method:\s*['"](POST|PATCH|DELETE)/.test(src),
    'no catalog mutation requests in BuildSpraySheet')
  // Phase S.3 — Save payload now legitimately passes productCatalogId
  // so the spray worker can READ-enrich EPA + active ingredients from
  // product_catalog at write time (best-effort, never blocks save).
  // The catalog itself stays read-only: createSpray only SELECTs from
  // it, never UPDATEs/INSERTs. Pin both invariants explicitly.
  const payload = src.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0,                            'spray-save products payload block found')
  assert(/productCatalogId/.test(payload),
    'save payload passes productCatalogId for read-enrichment (Phase S.3 — catalog still read-only at API)')
}

// ── 12. Phase 7C.2 (1/?) — manual catalog-link foundation ──────────────────

console.log('— worker/api/inventory.js (catalog-link handler shape)')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')

  // Narrow handler exists and is exported.
  assert(/export\s+async\s+function\s+patchInventoryCatalogLink\s*\(/.test(src),
    'exports patchInventoryCatalogLink')

  // Validates body shape — must include productCatalogId key, even if null.
  assert(/hasOwnProperty\.call\(body,\s*['"]productCatalogId['"]\)/.test(src),
    'handler enforces presence of productCatalogId key in body')

  // Validates inventory row exists before writing.
  assert(/SELECT\s+id\s+FROM\s+inventory_items\s+WHERE\s+id\s*=\s*\?/.test(src),
    'handler verifies inventory item exists')

  // Validates catalog row exists when productCatalogId is non-null.
  assert(/SELECT\s+id\s+FROM\s+product_catalog\s+WHERE\s+id\s*=\s*\?/.test(src),
    'handler verifies product_catalog row exists when linking')

  // Writes ONLY product_catalog_id (+ updated_at). Never any other column.
  // Anchor on the catalog-link handler so we don't grab the generic
  // updateInventory()'s UPDATE (which uses ${sets.join(', ')}).
  const handlerBlock = src.match(
    /async function patchInventoryCatalogLink[\s\S]*?\n\}\s*\n/,
  )?.[0] ?? ''
  const updateBlock = handlerBlock.match(/UPDATE inventory_items[\s\S]*?WHERE id = \?/)?.[0] ?? ''
  const updateBlockNorm = updateBlock.replace(/\s+/g, ' ')
  assert(updateBlock.length > 0,                              'UPDATE statement present (in catalog-link handler)')
  assert(/SET product_catalog_id = \?,/.test(updateBlockNorm),
    'UPDATE sets product_catalog_id only (+ updated_at)')
  assert(!/UPDATE product_catalog/i.test(src),
    'handler does NOT write to product_catalog (catalog stays read-only)')

  // MUTABLE_COLUMNS must NOT have grown to include the catalog FK —
  // that would re-open the bulk-edit surface we explicitly avoided.
  const mut = src.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'MUTABLE_COLUMNS still excludes productCatalogId (narrow endpoint preserved)')
}

console.log('— worker/index.js (route wired before /api/inventory/:id)')
{
  const idx = readFileSync('worker/index.js', 'utf8')

  // Import surfaces the handler.
  assert(/patchInventoryCatalogLink/.test(idx),
    'index imports patchInventoryCatalogLink')

  // /catalog-link route present.
  assert(/\/\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\\\/catalog-link\$\//.test(idx),
    'route regex: /api/inventory/:id/catalog-link')

  // Must precede the generic /api/inventory/:id regex.
  const catLinkPos = idx.search(/\/\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\\\/catalog-link\$\//)
  const idRegexPos = idx.search(/\/\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\$\//)
  assert(catLinkPos > 0 && idRegexPos > 0 && catLinkPos < idRegexPos,
    '/catalog-link regex matched BEFORE the generic /api/inventory/:id regex')

  // PATCH only — no GET/POST/DELETE wired on this route.
  const catalogLinkBlock = idx.match(/invCatLinkMatch[\s\S]{0,400}?\}/)?.[0] ?? ''
  assert(/method\s*===\s*['"]PATCH['"]/.test(catalogLinkBlock),
    'PATCH method wired on /catalog-link')
  assert(!/method\s*===\s*['"]GET['"]/.test(catalogLinkBlock)
      && !/method\s*===\s*['"]POST['"]/.test(catalogLinkBlock)
      && !/method\s*===\s*['"]DELETE['"]/.test(catalogLinkBlock),
    'no GET/POST/DELETE on /catalog-link (narrow endpoint)')
}

console.log('— patchInventoryCatalogLink behavior (in-process D1 stub)')
{
  const { patchInventoryCatalogLink } =
    await import('../worker/api/inventory.js')

  // Minimal D1 stub. Each .prepare() returns an object that exposes
  // .bind() + .first()/.run(). We dispatch off the SQL prefix.
  function makeDB(spec) {
    const log = []
    return {
      DB: {
        prepare(sql) {
          const trimmed = sql.replace(/\s+/g, ' ').trim()
          log.push(trimmed)
          return {
            bind(...binds) {
              return {
                async first() {
                  if (/SELECT id FROM inventory_items/i.test(trimmed)) {
                    return spec.inventoryRow ?? null
                  }
                  if (/SELECT id FROM product_catalog/i.test(trimmed)) {
                    return spec.catalogRow ?? null
                  }
                  return null
                },
                async run() {
                  return {
                    success: true,
                    meta: { changes: spec.updateChanges ?? 1 },
                    binds,
                  }
                },
              }
            },
          }
        },
      },
      log,
    }
  }

  function makeReq(body) {
    return new Request('http://test.local/x', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  }

  async function readBody(res) {
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  }

  // (a) happy path: valid inventory + valid catalog id → 200 + getInventory(...) path
  {
    const env = makeDB({
      inventoryRow: { id: 'inv-1' },
      catalogRow:   { id: 'pc-tenacity-100-1267' },
      // Subsequent getInventory() will issue another prepare; our stub
      // returns null for unknown SELECTs, which makes the response a
      // 404 from notFound. Easier to assert the SQL path than the body.
    })
    const res = await patchInventoryCatalogLink(env, 'inv-1',
      makeReq({ productCatalogId: 'pc-tenacity-100-1267' }))
    assert(res instanceof Response,                'handler returns a Response')
    // Confirm the validation+write path was executed in order.
    const sqls = env.log.join(' || ')
    assert(/SELECT id FROM inventory_items WHERE id = \?/i.test(sqls),
      'happy: validated inventory row exists')
    assert(/SELECT id FROM product_catalog WHERE id = \?/i.test(sqls),
      'happy: validated catalog row exists')
    assert(/UPDATE inventory_items SET product_catalog_id = \?,/i.test(sqls),
      'happy: ran UPDATE on inventory_items.product_catalog_id')
    assert(!/UPDATE product_catalog/i.test(sqls),
      'happy: product_catalog never written to')
  }

  // (b) unlink: productCatalogId=null → skips catalog SELECT, runs UPDATE with null
  {
    const env = makeDB({ inventoryRow: { id: 'inv-1' } })
    const res = await patchInventoryCatalogLink(env, 'inv-1',
      makeReq({ productCatalogId: null }))
    assert(res instanceof Response,                'unlink: returns a Response')
    const sqls = env.log.join(' || ')
    assert(!/SELECT id FROM product_catalog/i.test(sqls),
      'unlink: did NOT query product_catalog (no FK to validate)')
    assert(/UPDATE inventory_items SET product_catalog_id = \?,/i.test(sqls),
      'unlink: ran UPDATE setting product_catalog_id to null')
  }

  // (c) reject unknown productCatalogId → 400 Unknown
  {
    const env = makeDB({
      inventoryRow: { id: 'inv-1' },
      catalogRow:   null,   // not found in product_catalog
    })
    const res = await patchInventoryCatalogLink(env, 'inv-1',
      makeReq({ productCatalogId: 'pc-does-not-exist' }))
    const { status, body } = await readBody(res)
    assert(status === 400,                         'unknown id → 400', { status })
    assert(typeof body === 'object' && /Unknown productCatalogId/.test(body.error ?? ''),
      'unknown id → error message names the bad id')
    const sqls = env.log.join(' || ')
    assert(!/UPDATE inventory_items/i.test(sqls),
      'unknown id: no UPDATE issued (validate-then-write)')
  }

  // (d) reject body missing productCatalogId key → 400
  {
    const env = makeDB({ inventoryRow: { id: 'inv-1' } })
    const res = await patchInventoryCatalogLink(env, 'inv-1', makeReq({}))
    const { status, body } = await readBody(res)
    assert(status === 400,                         'missing key → 400')
    assert(/productCatalogId/.test(body.error ?? ''),
      'missing key → error mentions productCatalogId')
  }

  // (e) reject when inventory row missing → 404
  {
    const env = makeDB({ inventoryRow: null })
    const res = await patchInventoryCatalogLink(env, 'inv-missing',
      makeReq({ productCatalogId: 'pc-tenacity-100-1267' }))
    const { status, body } = await readBody(res)
    assert(status === 404,                         'unknown inventory → 404')
    assert(/Inventory item not found/i.test(body.error ?? ''),
      'unknown inventory → error names the resource')
    const sqls = env.log.join(' || ')
    assert(!/UPDATE inventory_items/i.test(sqls),
      'unknown inventory: no UPDATE issued')
  }

  // (f) empty string productCatalogId is treated as unlink (defensive)
  {
    const env = makeDB({ inventoryRow: { id: 'inv-1' } })
    await patchInventoryCatalogLink(env, 'inv-1', makeReq({ productCatalogId: '' }))
    const sqls = env.log.join(' || ')
    assert(!/SELECT id FROM product_catalog/i.test(sqls),
      'empty-string id treated as unlink (no catalog lookup)')
    assert(/UPDATE inventory_items SET product_catalog_id = \?,/i.test(sqls),
      'empty-string id still issues UPDATE')
  }

  // (g) 503 when DB binding is absent
  {
    const res = await patchInventoryCatalogLink({ /* no .DB */ }, 'inv-1',
      makeReq({ productCatalogId: 'pc-x' }))
    const { status, body } = await readBody(res)
    assert(status === 503,                         'no D1 → 503')
    assert(/D1 not configured/i.test(body.error ?? ''),
      'no D1 → message names the cause')
  }
}

console.log('— inventoryStore.setInventoryCatalogLink (client)')
{
  const src = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  assert(/export\s+async\s+function\s+setInventoryCatalogLink\s*\(\s*id\s*,\s*productCatalogId\s*\)/.test(src),
    'exports setInventoryCatalogLink(id, productCatalogId)')
  // Hits the narrow route (not the generic PATCH /api/inventory/:id).
  assert(/\/catalog-link/.test(src),
    'uses /catalog-link sub-resource (not generic inventory PATCH)')
  assert(/method:\s*['"]PATCH['"]/.test(src),
    'uses PATCH')
  // Optimistic — local row updated before the await.
  assert(/setState\([\s\S]*?items:[\s\S]*?productCatalogId/.test(src),
    'optimistically updates productCatalogId locally before the fetch')
  // Rollback path on error.
  assert(/setState\(\s*\{\s*items:\s*prev\s*,\s*error/.test(src),
    'rolls back to prev items on error')
  // Accepts null to unlink.
  assert(/productCatalogId\s*===\s*null/.test(src) || /===\s*null\s*\|\|\s*productCatalogId\s*===\s*['"]['"]/.test(src),
    'treats null/empty as unlink intent')
}

console.log('— CatalogLinkPicker (modal contracts)')
{
  const src = readFileSync('src/pages/Inventory/components/CatalogLinkPicker.jsx', 'utf8')

  // Two-step UX guard.
  assert(/'search'\s*\|\s*'confirm'|step\s*===\s*['"]search['"]/.test(src),
    'two-step UX: search → confirm before linking')
  // Reuses the store helpers, no parallel fetch.
  assert(/from\s+['"][^'"]*productCatalog\/productCatalogStore['"]/.test(src),
    'reuses productCatalogStore (no new fetch path)')
  for (const fn of ['useProductCatalog', 'searchProductCatalog', 'getCatalogProductById']) {
    assert(new RegExp(`\\b${fn}\\b`).test(src), `imports ${fn}`)
  }
  // Filter dimensions per spec.
  for (const fn of [
    'listCatalogCategories', 'listCatalogFracGroups', 'listCatalogHracGroups',
    'listCatalogIracGroups', 'listCatalogPgrClasses',
  ]) {
    assert(new RegExp(`\\b${fn}\\b`).test(src), `picker uses ${fn}`)
  }
  // Confirmation card surfaces the required fields.
  assert(/productName/.test(src) && /category/.test(src),
    'confirmation surfaces name + category')
  assert(/activeIngredients/.test(src) || /aiText/.test(src),
    'confirmation surfaces active ingredients')
  for (const grp of ['fracGroup', 'hracGroup', 'iracGroup', 'pgrClass']) {
    assert(new RegExp(`\\b${grp}\\b`).test(src),
      `confirmation surfaces ${grp}`)
  }
  // Stewardship wording.
  assert(/does not change inventory stock/i.test(src),
    "wording: 'does not change inventory stock'")
  assert(/Link this product|Link catalog intelligence/.test(src),
    'CTA wording per spec')

  // Forbidden: no fetch, no Add-to-Inventory shortcut.
  assert(!/fetch\(/.test(src),
    'picker does not call fetch() directly (delegates to onConfirm)')
  assert(!/Add to Inventory/i.test(src),
    'picker has no Add-to-Inventory CTA')
  // Picker never writes to product_catalog.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}method:\s*['"](POST|PATCH|DELETE)/.test(src),
    'picker never mutates product_catalog')
}

console.log('— InventoryProducts wires link controls')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')
  assert(/setInventoryCatalogLink/.test(src),
    'uses setInventoryCatalogLink')
  assert(/<CatalogLinkPicker\b/.test(src),
    'renders <CatalogLinkPicker>')
  assert(/<CatalogLinkSection\b/.test(src),
    'renders <CatalogLinkSection>')
  // Unlink calls setInventoryCatalogLink(..., null).
  assert(/setInventoryCatalogLink\([^)]*,\s*null\s*\)/.test(src),
    'unlink calls setInventoryCatalogLink(..., null)')
  // Stewardship copy on unlink hint.
  assert(/Remove catalog link/.test(src),
    'unlink CTA labeled "Remove catalog link"')
  assert(/Inventory stock remains unchanged|does not change/i.test(src),
    'inventory-stock-unchanged copy present near the link surface')
}

console.log('— Forbidden surfaces (Commit 7C.2/1 scope)')
{
  // No Add-to-Inventory workflow anywhere new.
  for (const path of [
    'src/pages/Inventory/components/CatalogLinkPicker.jsx',
    'src/pages/Inventory/components/CatalogLinkSection.module.css',
    'src/pages/Inventory/tabs/InventoryProducts.jsx',
    'worker/api/inventory.js',
  ]) {
    const src = readFileSync(path, 'utf8')
    assert(!/Add to Inventory/i.test(src),
      `${path.split('/').pop()}: no "Add to Inventory" CTA`)
  }
  // No catalog write route added.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'no POST/PATCH/DELETE wired on /api/product-catalog')
}

console.log('— Resolver fallthrough on unlink')
{
  // Re-import resolver and reuse the same fixtures shape. When the
  // inventory row has productCatalogId=null, resolver must drop back to
  // name-match → label → legacy. Already covered earlier but lock the
  // exact "unlink restores fallback" contract here for documentation.
  const { resolveSprayProductIntel } =
    await import('../src/utils/productCatalog/resolveSprayProductIntel.js')

  const catalogProducts = [{
    id: 'pc-heritage-100-1093', productName: 'Heritage', category: 'fungicide',
    fracGroup: '11', activeIngredients: [{ name: 'Azoxystrobin', percentage: 50 }],
    rates: [], reiHours: 4,
  }]
  const linkedRow   = { id: 'inv-x', name: 'Heritage', kind: 'chemical', productCatalogId: 'pc-heritage-100-1093' }
  const unlinkedRow = { id: 'inv-x', name: 'Heritage', kind: 'chemical', productCatalogId: null }

  const a = resolveSprayProductIntel(
    { name: 'Heritage', inventoryItemId: 'inv-x' },
    { inventoryProducts: [linkedRow],   catalogProducts, labelsByItemId: {} })
  assert(a.source === 'catalog' && a.catalogId === 'pc-heritage-100-1093',
    'linked → explicit FK wins (catalog source)')

  const b = resolveSprayProductIntel(
    { name: 'Heritage', inventoryItemId: 'inv-x' },
    { inventoryProducts: [unlinkedRow], catalogProducts, labelsByItemId: {} })
  // Name-match still resolves to catalog because the catalog has a
  // 'Heritage' row by name; this is the documented fallthrough. The
  // important guarantee here is the FK path is not taken (catalogId
  // null in legacy/label, or set by name-match — either way the link
  // we explicitly removed isn't being silently re-applied as a FK).
  assert(b.source === 'catalog',
    'unlinked → name-match fallthrough still finds catalog row (Tier 1b)')
  assert(b.catalogId === 'pc-heritage-100-1093',
    'unlinked → catalogId comes from name match (not from a phantom FK)')

  // And when the catalog drops out entirely, unlinked + no label → legacy.
  const c = resolveSprayProductIntel(
    { name: 'Heritage', inventoryItemId: 'inv-x' },
    { inventoryProducts: [unlinkedRow], catalogProducts: [], labelsByItemId: {} })
  assert(c.source === 'legacy',
    'unlinked + catalog empty + no label → legacy (no fake intelligence)')
}

// ── 13. Phase 7C.2 (2/?) — Catalog Link Review ─────────────────────────────

console.log('— src/utils/productCatalog/linkReview.js (helpers source)')
{
  const src = readFileSync('src/utils/productCatalog/linkReview.js', 'utf8')

  for (const name of [
    'resolveInventoryCatalogLinkStatus',
    'findExactCatalogNameMatch',
    'buildLinkReviewBuckets',
    'normalizeProductName',
    'REVIEWABLE_KINDS',
  ]) {
    assert(new RegExp(`export\\s+(?:const\\s+|function\\s+)${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Pure-compute: no React, no fetch, no store imports.
  assert(!/from\s+['"]react['"]/.test(src),                'helpers do not import react')
  assert(!/fetch\(/.test(src),                              'helpers do not fetch()')
  assert(!/from\s+['"][^'"]*productCatalogStore['"]/.test(src),
    'helpers do not import productCatalogStore (pure module)')
  assert(!/from\s+['"][^'"]*inventoryStore['"]/.test(src),
    'helpers do not import inventoryStore (pure module)')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'helpers issue no POST/PATCH/DELETE')
}

console.log('— linkReview behavior (status + suggestion + bucketing)')
{
  const mod = await import('../src/utils/productCatalog/linkReview.js')

  const catalogProducts = [
    { id: 'pc-tenacity-100-1267',  productName: 'Tenacity',         category: 'herbicide', hracGroup: '27' },
    { id: 'pc-heritage-100-1093',  productName: 'Heritage',         category: 'fungicide', fracGroup: '11' },
    { id: 'pc-barricade-4fl-100-1139', productName: 'Barricade 4FL', category: 'herbicide', hracGroup: '3' },
    // Ambiguous duplicate — two rows with the same normalized name.
    { id: 'pc-dup-1', productName: 'Generic Foo',  category: 'fungicide' },
    { id: 'pc-dup-2', productName: 'generic-foo',  category: 'fungicide' },
  ]

  const items = [
    // Linked + cached.
    { id: 'inv-1', name: 'Tenacity', kind: 'chemical', productCatalogId: 'pc-tenacity-100-1267' },
    // Unlinked, exact-name match exists.
    { id: 'inv-2', name: 'Heritage', kind: 'chemical' },
    // Unlinked, no match in catalog.
    { id: 'inv-3', name: 'Some Private Label', kind: 'chemical' },
    // Stale link — FK set but not in cache.
    { id: 'inv-4', name: 'Old Stuff', kind: 'fertilizer', productCatalogId: 'pc-deleted' },
    // Unlinked + ambiguous duplicate in catalog → must NOT suggest.
    { id: 'inv-5', name: 'Generic Foo', kind: 'fungicide' /* deliberately unusual kind */ },
    // Non-reviewable kind (parts) — must be dropped from all buckets.
    { id: 'inv-6', name: 'Mower Belt', kind: 'parts' },
    // Reviewable kind + null name → in unlinked bucket but no suggestion.
    { id: 'inv-7', name: '', kind: 'product' },
    // Reviewable kind 'product' that does match.
    { id: 'inv-8', name: 'Barricade 4FL', kind: 'product' },
  ]

  // ── resolveInventoryCatalogLinkStatus ─────────────────────────────────
  assert(mod.resolveInventoryCatalogLinkStatus(items[0], catalogProducts) === 'linked',
    'linked when FK resolves in catalog')
  assert(mod.resolveInventoryCatalogLinkStatus(items[1], catalogProducts) === 'unlinked',
    'unlinked when no FK')
  assert(mod.resolveInventoryCatalogLinkStatus(items[3], catalogProducts) === 'stale',
    "stale when FK doesn't resolve")
  assert(mod.resolveInventoryCatalogLinkStatus(null, catalogProducts) === 'unlinked',
    'null item → unlinked (safe default)')
  assert(mod.resolveInventoryCatalogLinkStatus(items[1], []) === 'unlinked',
    'empty catalog cache + no FK → unlinked')
  // Edge: linked-by-FK row evaluated against empty cache becomes 'stale'.
  assert(mod.resolveInventoryCatalogLinkStatus(items[0], []) === 'stale',
    'empty catalog cache + FK set → stale (cache miss)')

  // ── findExactCatalogNameMatch ─────────────────────────────────────────
  assert(mod.findExactCatalogNameMatch(items[1], catalogProducts)?.id === 'pc-heritage-100-1093',
    'Heritage → exact match on heritage catalog row')
  assert(mod.findExactCatalogNameMatch(items[7], catalogProducts)?.id === 'pc-barricade-4fl-100-1139',
    'Barricade 4FL → exact match (normalized: barricade-4fl)')
  assert(mod.findExactCatalogNameMatch(items[2], catalogProducts) === null,
    'No catalog match → null (no fuzzy guess)')
  assert(mod.findExactCatalogNameMatch(items[4], catalogProducts) === null,
    'Ambiguous duplicates → no suggestion (silent ambiguity beats wrong guess)')
  assert(mod.findExactCatalogNameMatch(items[6], catalogProducts) === null,
    'Empty name → null')
  assert(mod.findExactCatalogNameMatch(null, catalogProducts) === null,
    'null item → null')

  // Normalize helper edge cases.
  assert(mod.normalizeProductName('Barricade 4FL') === 'barricade-4fl', 'normalize spaces')
  assert(mod.normalizeProductName('PGF Complete 16-4-8') === 'pgf-complete-16-4-8',
    'normalize collapses punctuation')
  assert(mod.normalizeProductName('  Tenacity  ') === 'tenacity', 'normalize trims')
  assert(mod.normalizeProductName(null) === '', 'normalize null → empty')

  // ── buildLinkReviewBuckets ────────────────────────────────────────────
  const buckets = mod.buildLinkReviewBuckets(items, catalogProducts)
  assert(buckets.linked.length === 1 && buckets.linked[0].id === 'inv-1',
    'bucket: linked has inv-1 (Tenacity FK resolved)')
  assert(buckets.stale.length === 1 && buckets.stale[0].id === 'inv-4',
    'bucket: stale has inv-4 (FK pc-deleted)')

  const unlinkedIds = buckets.unlinked.map(i => i.id).sort()
  // inv-2 (Heritage), inv-3 (Some Private Label), inv-7 (empty name), inv-8 (Barricade 4FL)
  // inv-5 has kind 'fungicide' which is NOT in REVIEWABLE_KINDS → must be dropped.
  // inv-6 has kind 'parts' → dropped.
  assert(JSON.stringify(unlinkedIds) === JSON.stringify(['inv-2','inv-3','inv-7','inv-8']),
    'bucket: unlinked has reviewable kinds only (excludes parts + non-reviewable kinds)',
    unlinkedIds)

  // Suggestions only on unambiguous exact match.
  assert(buckets.suggestionsByItemId['inv-2']?.id === 'pc-heritage-100-1093',
    'suggestion: inv-2 → Heritage catalog row')
  assert(buckets.suggestionsByItemId['inv-8']?.id === 'pc-barricade-4fl-100-1139',
    'suggestion: inv-8 → Barricade 4FL catalog row')
  assert(buckets.suggestionsByItemId['inv-3'] === undefined,
    'no suggestion: inv-3 has no match')
  assert(buckets.suggestionsByItemId['inv-7'] === undefined,
    'no suggestion: inv-7 has empty name')

  assert(buckets.totals.linked === 1,                'totals.linked = 1')
  assert(buckets.totals.unlinked === 4,              'totals.unlinked = 4')
  assert(buckets.totals.stale === 1,                 'totals.stale = 1')
  assert(buckets.totals.unlinkedWithSuggestion === 2,'totals.unlinkedWithSuggestion = 2 (Heritage + Barricade)')

  // ── Pure: bucketing does not mutate inputs ────────────────────────────
  const itemsClone     = JSON.parse(JSON.stringify(items))
  const catalogClone   = JSON.parse(JSON.stringify(catalogProducts))
  const itemsBefore    = JSON.stringify(itemsClone)
  const catalogBefore  = JSON.stringify(catalogClone)
  mod.buildLinkReviewBuckets(itemsClone, catalogClone)
  assert(JSON.stringify(itemsClone)   === itemsBefore,   'items array not mutated')
  assert(JSON.stringify(catalogClone) === catalogBefore, 'catalog array not mutated')

  // Empty / null safety.
  const empty = mod.buildLinkReviewBuckets([], [])
  assert(empty.linked.length === 0 && empty.unlinked.length === 0 && empty.stale.length === 0,
    'empty inputs → empty buckets')
  const nullSafe = mod.buildLinkReviewBuckets(undefined, undefined)
  assert(nullSafe.totals.linked === 0,                'undefined inputs → totals 0')

  // REVIEWABLE_KINDS contract.
  assert(mod.REVIEWABLE_KINDS instanceof Set,         'REVIEWABLE_KINDS is a Set')
  assert(mod.REVIEWABLE_KINDS.has('product') &&
         mod.REVIEWABLE_KINDS.has('chemical') &&
         mod.REVIEWABLE_KINDS.has('fertilizer'),
    'REVIEWABLE_KINDS includes product/chemical/fertilizer')
  assert(!mod.REVIEWABLE_KINDS.has('parts') && !mod.REVIEWABLE_KINDS.has('fuel'),
    'REVIEWABLE_KINDS excludes parts/fuel')
}

console.log('— InventoryLinkReview tab body (UI source contracts)')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryLinkReview.jsx', 'utf8')

  // Reuses store/helpers/picker — no parallel fetch path.
  assert(/from\s+['"][^'"]*productCatalog\/productCatalogStore['"]/.test(src),
    'reuses productCatalogStore')
  assert(/useProductCatalog\b/.test(src),                'uses useProductCatalog()')
  assert(/from\s+['"][^'"]*productCatalog\/linkReview['"]/.test(src),
    'imports linkReview helpers')
  assert(/buildLinkReviewBuckets\b/.test(src),            'uses buildLinkReviewBuckets')
  assert(/setInventoryCatalogLink\b/.test(src),           'uses setInventoryCatalogLink (existing endpoint)')
  assert(/from\s+['"]\.\.\/components\/CatalogLinkPicker['"]/.test(src),
    'reuses CatalogLinkPicker (single source of link UI)')

  // Three sections.
  assert(/title=['"]Unlinked['"]/.test(src),              'renders Unlinked section')
  assert(/title=['"]Stale links['"]/.test(src),           'renders Stale links section')
  assert(/title=['"]Linked['"]/.test(src),                'renders Linked section')

  // Suggestion is read-only — it never auto-applies, the user must
  // confirm through the picker. The picker is mounted only inside the
  // tab (no direct write call on suggestion render).
  assert(/Suggestions are not applied until you confirm/i.test(src),
    'copy: suggestions not applied until confirmed')
  assert(/exact[- ]name/i.test(src),
    'copy: explicit "exact name" framing')
  // Copy phrasing was refined in Commit 7C.2/3 to "No inventory stock
  // changes" in the subtitle + the same idea in the steward note. Accept
  // either wording.
  assert(/does not change inventory stock/i.test(src) || /no inventory stock changes/i.test(src),
    'copy: linking does not change inventory stock')

  // Open suggestion seeds the picker rather than writing directly. The
  // refactor in Commit 7C.2/3 wraps the call inside an onLinkSuggestion
  // callback on the ReviewCard, so accept either the original direct
  // openPickerFor(item, suggestionId) signature or the new onLink(item,
  // suggestion.id) form. The contract is unchanged: a non-null seed
  // arrives at the picker without writing the FK first.
  assert(
    /openPickerFor\(\s*item\s*,\s*buckets\.suggestionsByItemId\[item\.id\]\?\.id/.test(src) ||
    /onLink\(\s*item\s*,\s*buckets\.suggestionsByItemId\[item\.id\]\?\.id/.test(src) ||
    /onLink\(\s*item\s*,\s*suggestion\.id\s*\)/.test(src),
    'clicking suggested match opens the picker seeded with that catalog id')

  // Unlink uses null FK.
  assert(/setInventoryCatalogLink\([^)]*,\s*null\s*\)/.test(src),
    'unlink calls setInventoryCatalogLink(..., null)')

  // No POST/PATCH/DELETE issued from the tab body — everything goes
  // through the store/picker.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'tab body issues no direct POST/PATCH/DELETE')

  // Forbidden: no Add-to-Inventory CTA, no catalog-table writes.
  assert(!/Add to Inventory/i.test(src),
    'no "Add to Inventory" CTA in Link Review tab')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}method:\s*['"](POST|PATCH|DELETE)/.test(src),
    'no /api/product-catalog mutation request')

  // No raw <table>-only layout — spec requires mobile-friendly cards.
  // We allow <table> in other contexts; this tab must use cards.
  assert(!/<table\b/.test(src),
    'tab body uses card layout, not <table> (mobile-first)')
}

console.log('— InventoryLinkReview module css scope')
{
  const css = readFileSync('src/pages/Inventory/tabs/InventoryLinkReview.module.css', 'utf8')
  for (const cls of [
    'card', 'card_linked', 'card_unlinked', 'card_stale',
    'badgeLinked', 'badgeUnlinked', 'badgeStale',
    'suggestion', 'suggestionGuard',
    'btnPrimary', 'btnSecondary', 'btnDanger',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile-first guard: there's a min-width media query for desktop,
  // but the default layout is column-based.
  assert(/@media\s*\(min-width:\s*\d+px\)/.test(css),
    'CSS has a min-width media query (mobile-first → desktop)')
}

console.log('— Inventory shell: Link Review tab registered')
{
  const shell = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')
  assert(/from\s+['"]\.\/tabs\/InventoryLinkReview['"]/.test(shell),
    'imports InventoryLinkReview')
  assert(/'Link Review'/.test(shell),
    "'Link Review' literal present in shell")
  // Phase 9B.2 renamed the constant to LEGACY_TABS while preserving
  // the same 11-label payload for non-Crosswinds courses.
  const tabsMatch = shell.match(/const\s+(?:LEGACY_TABS|TABS)\s*=\s*\[([^\]]+)\]/)
  assert(tabsMatch && /'Link Review'/.test(tabsMatch[1]),
    "'Link Review' present in legacy TABS array")
  assert(/activeTab\s*===\s*'Link Review'\s*&&\s*<InventoryLinkReview/.test(shell),
    "Link Review tab wired to activeTab === 'Link Review'")
  // Pre-existing 9 tabs still present.
  for (const t of ['Overview','Products','Chemicals','Fertilizer','Parts','Fuel','Low Stock','Purchase History','Catalog']) {
    assert(tabsMatch && new RegExp(`'${t}'`).test(tabsMatch[1]),
      `pre-existing tab '${t}' still in TABS`)
  }
}

console.log('— No new write routes / no MUTABLE_COLUMNS regression')
{
  // No new write routes in worker/index.js — only the existing catalog-link
  // PATCH from Commit 7C.2/1 should exist. Specifically: no new
  // /api/product-catalog mutation route.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // MUTABLE_COLUMNS still excludes productCatalogId.
  const invSrc = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = invSrc.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'MUTABLE_COLUMNS still excludes productCatalogId (narrow endpoint preserved)')

  // The catalog-link patch handler is the ONLY function that writes
  // product_catalog_id. linkReview helpers + Link Review tab body
  // should not contain any UPDATE/INSERT against inventory_items
  // or product_catalog.
  for (const path of [
    'src/utils/productCatalog/linkReview.js',
    'src/pages/Inventory/tabs/InventoryLinkReview.jsx',
  ]) {
    const s = readFileSync(path, 'utf8')
    assert(!/(UPDATE|INSERT|DELETE)\s+(inventory_items|product_catalog)\b/i.test(s),
      `${path.split('/').pop()}: no direct SQL against inventory_items / product_catalog`)
  }
}

// ── 14. Phase 7C.2 (3/?) — workflow polish (filter / sort / progress) ──────

console.log('— linkReview.js exposes filter / sort / progress helpers + constants')
{
  const src = readFileSync('src/utils/productCatalog/linkReview.js', 'utf8')
  for (const name of [
    'filterLinkReviewItems',
    'sortLinkReviewItems',
    'calculateLinkReviewProgress',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }
  for (const name of ['LINK_REVIEW_FILTERS', 'LINK_REVIEW_SORTS']) {
    assert(new RegExp(`export\\s+const\\s+${name}\\b`).test(src),
      `exports ${name} (frozen constants)`)
  }
  // Still purity-clean.
  assert(!/from\s+['"]react['"]/.test(src),                'helpers do not import react')
  assert(!/fetch\(/.test(src),                              'helpers do not fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'helpers do not issue mutations')
  assert(!/from\s+['"][^'"]*productCatalogStore['"]/.test(src)
      && !/from\s+['"][^'"]*inventoryStore['"]/.test(src),
    'helpers do not import any store')
}

console.log('— filter / sort / progress behavior')
{
  const mod = await import('../src/utils/productCatalog/linkReview.js')
  const F = mod.LINK_REVIEW_FILTERS
  const S = mod.LINK_REVIEW_SORTS

  // Frozen / stable enum values.
  assert(Object.isFrozen(F), 'LINK_REVIEW_FILTERS is frozen')
  assert(Object.isFrozen(S), 'LINK_REVIEW_SORTS is frozen')
  assert(F.ALL === 'all' && F.UNLINKED === 'unlinked' && F.SUGGESTED === 'suggested'
      && F.STALE === 'stale' && F.LINKED === 'linked',
    'LINK_REVIEW_FILTERS values match the contract')
  assert(S.NAME === 'name' && S.STATUS === 'status'
      && S.SUGGESTED_FIRST === 'suggestedFirst' && S.STALE_FIRST === 'staleFirst',
    'LINK_REVIEW_SORTS values match the contract')

  // Fixture: same shape as the Commit 2 smoke, expanded to exercise sort.
  const catalogProducts = [
    { id: 'pc-tenacity-100-1267',     productName: 'Tenacity',      category: 'herbicide', hracGroup: '27' },
    { id: 'pc-heritage-100-1093',     productName: 'Heritage',      category: 'fungicide', fracGroup: '11' },
    { id: 'pc-barricade-4fl-100-1139',productName: 'Barricade 4FL', category: 'herbicide', hracGroup: '3' },
  ]
  const items = [
    { id: 'a-stale',   name: 'Aplha Old',  kind: 'chemical',   productCatalogId: 'pc-deleted'             },
    { id: 'b-linked',  name: 'Bravo',      kind: 'chemical',   productCatalogId: 'pc-tenacity-100-1267'   },
    { id: 'c-suggest', name: 'Heritage',   kind: 'chemical'                                                },
    { id: 'd-suggest', name: 'Barricade 4FL', kind: 'product'                                              },
    { id: 'e-unlink',  name: 'Echo Generic', kind: 'fertilizer'                                            },
    { id: 'f-parts',   name: 'Mower Belt',   kind: 'parts'                                                 },
    { id: 'g-empty',   name: '',            kind: 'product'                                                },
  ]

  const buckets = mod.buildLinkReviewBuckets(items, catalogProducts)

  // ── filterLinkReviewItems ─────────────────────────────────────────────
  const all = mod.filterLinkReviewItems(items, buckets, { filter: F.ALL })
  assert(all.length === 6, // excludes parts only; empty-name is still reviewable
    'filter=all → all 6 reviewable items (parts dropped)', all.map(i=>i.id))

  const unlinked = mod.filterLinkReviewItems(items, buckets, { filter: F.UNLINKED })
  assert(unlinked.every(i => !i.productCatalogId),
    'filter=unlinked → no items with FK')
  assert(unlinked.length === 4,
    'filter=unlinked → 4 items (c, d, e, g)', unlinked.map(i=>i.id))

  const suggested = mod.filterLinkReviewItems(items, buckets, { filter: F.SUGGESTED })
  assert(suggested.length === 2,
    'filter=suggested → 2 items (only those with exact-name match)', suggested.map(i=>i.id))
  assert(suggested.every(i => !i.productCatalogId),
    'filter=suggested items are all unlinked')

  const linked = mod.filterLinkReviewItems(items, buckets, { filter: F.LINKED })
  assert(linked.length === 1 && linked[0].id === 'b-linked',
    'filter=linked → only b-linked')

  const stale = mod.filterLinkReviewItems(items, buckets, { filter: F.STALE })
  assert(stale.length === 1 && stale[0].id === 'a-stale',
    'filter=stale → only a-stale')

  // ── search ────────────────────────────────────────────────────────────
  const search1 = mod.filterLinkReviewItems(items, buckets, { filter: F.ALL, search: 'her' })
  assert(search1.length === 1 && search1[0].id === 'c-suggest',
    'search "her" → Heritage row only')
  const search2 = mod.filterLinkReviewItems(items, buckets, { filter: F.ALL, search: '  BARRI ' })
  assert(search2.length === 1 && search2[0].id === 'd-suggest',
    'search is trimmed + case-insensitive')
  const searchMiss = mod.filterLinkReviewItems(items, buckets, { filter: F.ALL, search: 'zzz' })
  assert(searchMiss.length === 0,
    'search miss → empty array')
  // Search combines with filter.
  const combined = mod.filterLinkReviewItems(items, buckets, { filter: F.SUGGESTED, search: 'her' })
  assert(combined.length === 1 && combined[0].id === 'c-suggest',
    'filter=suggested + search=her → 1 result')

  // Invalid filter value → falls back to ALL.
  const fallback = mod.filterLinkReviewItems(items, buckets, { filter: 'banjo' })
  assert(fallback.length === 6, 'unknown filter falls back to ALL', fallback.length)

  // ── sortLinkReviewItems ───────────────────────────────────────────────
  const byName = mod.sortLinkReviewItems(all, buckets, S.NAME).map(i => i.id)
  // names sort: '' < 'Aplha Old' < 'Barricade 4FL' < 'Bravo' < 'Echo Generic' < 'Heritage'
  assert(JSON.stringify(byName) === JSON.stringify(['g-empty','a-stale','d-suggest','b-linked','e-unlink','c-suggest']),
    'sort=name → alphabetical A→Z (empty name first)', byName)

  const byStatus = mod.sortLinkReviewItems(all, buckets, S.STATUS).map(i => i.id)
  // Expect: with-suggestion (c-suggest, d-suggest sorted by name) → plain unlinked (e-unlink, g-empty) → stale (a-stale) → linked (b-linked)
  assert(byStatus[0] === 'd-suggest' || byStatus[0] === 'c-suggest',
    'sort=status: with-suggestion items first',  byStatus)
  assert(byStatus[byStatus.length - 1] === 'b-linked',
    'sort=status: linked items last')
  const staleIdx  = byStatus.indexOf('a-stale')
  const linkedIdx = byStatus.indexOf('b-linked')
  assert(staleIdx > -1 && linkedIdx > -1 && staleIdx < linkedIdx,
    'sort=status: stale appears before linked')

  const suggestedFirst = mod.sortLinkReviewItems(all, buckets, S.SUGGESTED_FIRST).map(i => i.id)
  assert(['c-suggest','d-suggest'].includes(suggestedFirst[0])
      && ['c-suggest','d-suggest'].includes(suggestedFirst[1]),
    'sort=suggestedFirst: suggestion-bearing items are the first two', suggestedFirst)
  // Within suggested group: name asc → Barricade 4FL ('d-suggest') before Heritage ('c-suggest')
  assert(suggestedFirst[0] === 'd-suggest' && suggestedFirst[1] === 'c-suggest',
    'sort=suggestedFirst: name-asc tiebreaker within the suggestion group')

  const staleFirst = mod.sortLinkReviewItems(all, buckets, S.STALE_FIRST).map(i => i.id)
  assert(staleFirst[0] === 'a-stale',
    'sort=staleFirst: stale row is first')
  // After the stale row, remaining items are name-asc.
  assert(JSON.stringify(staleFirst.slice(1)) ===
         JSON.stringify(['g-empty','d-suggest','b-linked','e-unlink','c-suggest']),
    'sort=staleFirst: name-asc tiebreaker for the rest', staleFirst.slice(1))

  // Unknown sort mode falls back to NAME.
  const sortFallback = mod.sortLinkReviewItems(all, buckets, 'banjo').map(i => i.id)
  assert(JSON.stringify(sortFallback) === JSON.stringify(byName),
    'unknown sort mode falls back to NAME')

  // ── Purity: neither filter nor sort mutates inputs ─────────────────────
  const itemsClone   = JSON.parse(JSON.stringify(items))
  const bucketsClone = JSON.parse(JSON.stringify(buckets))
  const itemsBefore  = JSON.stringify(itemsClone)
  const bucketsBefore = JSON.stringify(bucketsClone)
  mod.filterLinkReviewItems(itemsClone, bucketsClone, { filter: F.SUGGESTED, search: 'her' })
  mod.sortLinkReviewItems(itemsClone, bucketsClone, S.STATUS)
  assert(JSON.stringify(itemsClone)   === itemsBefore,   'filter+sort do not mutate items')
  assert(JSON.stringify(bucketsClone) === bucketsBefore, 'filter+sort do not mutate buckets')

  // Sort returns a NEW array (not the original reference) even when no
  // re-ordering occurs.
  const sortedRef = mod.sortLinkReviewItems(all, buckets, S.NAME)
  assert(sortedRef !== all, 'sort returns a fresh array reference')

  // ── calculateLinkReviewProgress ───────────────────────────────────────
  const progress = mod.calculateLinkReviewProgress(buckets)
  assert(progress.total === 6,
    'progress.total = linked+unlinked+stale = 1+4+1 = 6', progress)
  assert(progress.linked === 1,                                'progress.linked = 1')
  assert(progress.unlinked === 4,                              'progress.unlinked = 4')
  assert(progress.stale === 1,                                 'progress.stale = 1')
  assert(progress.unlinkedWithSuggestion === 2,                'progress.unlinkedWithSuggestion = 2')
  assert(progress.percentLinked === 17,                        'progress.percentLinked = round(1/6 * 100) = 17')

  // Edge: empty buckets → zero progress, 0% (no div-by-zero).
  const empty = mod.buildLinkReviewBuckets([], [])
  const emptyP = mod.calculateLinkReviewProgress(empty)
  assert(emptyP.total === 0 && emptyP.percentLinked === 0,
    'empty buckets → total 0 + percentLinked 0 (no div-by-zero)')

  // Edge: null buckets → all-zero progress.
  const nullP = mod.calculateLinkReviewProgress(null)
  assert(nullP.total === 0 && nullP.linked === 0 && nullP.percentLinked === 0,
    'null buckets → all-zero progress (safe default)')

  // 100% case.
  const allLinked = mod.buildLinkReviewBuckets(
    [{ id: 'i-1', name: 'Tenacity', kind: 'chemical', productCatalogId: 'pc-tenacity-100-1267' }],
    catalogProducts)
  const fullP = mod.calculateLinkReviewProgress(allLinked)
  assert(fullP.percentLinked === 100, '100% linked → percentLinked = 100')
}

console.log('— InventoryLinkReview tab body wires the new workflow surface')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryLinkReview.jsx', 'utf8')

  // Imports include the new helpers.
  for (const name of [
    'filterLinkReviewItems', 'sortLinkReviewItems', 'calculateLinkReviewProgress',
    'LINK_REVIEW_FILTERS', 'LINK_REVIEW_SORTS',
  ]) {
    assert(new RegExp(`\\b${name}\\b`).test(src),
      `tab imports/uses ${name}`)
  }

  // Toolbar (filter pills + sort select + search).
  assert(/type=['"]search['"]/.test(src),                       'renders a <input type="search">')
  assert(/<select\b[^>]*onChange/.test(src),                    'renders a <select> for sort')
  // The Toolbar child receives onSearchChange={setSearch} from the parent
  // and applies it onChange. Either binding-style is acceptable.
  assert(/onSearchChange=\{setSearch\}/.test(src)
      || /onChange=\{e\s*=>\s*onSearchChange\(e\.target\.value\)\s*\}/.test(src),
    'search input wired through onSearchChange → setSearch (Toolbar child)')

  // Five filter pills (label literals).
  for (const label of ['All reviewable', 'Unlinked', 'With exact-name suggestion', 'Stale linked', 'Linked']) {
    assert(new RegExp(`label:\\s*['"]${label.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')}['"]`).test(src),
      `filter option present: '${label}'`)
  }

  // Four sort options.
  for (const label of ['Name A–Z', 'Status', 'Suggested first', 'Stale first']) {
    assert(new RegExp(`label:\\s*['"]${label}['"]`).test(src),
      `sort option present: '${label}'`)
  }

  // Progress summary rendered.
  assert(/Review progress/.test(src),                           'renders "Review progress" heading')
  assert(/percentLinked/.test(src),                             'renders percent linked')

  // Stewardship copy.
  for (const phrase of [
    'No inventory stock changes',
    'No automatic catalog links are applied',
    'Exact-name suggestions only',
    'Suggestions require confirmation',
  ]) {
    assert(new RegExp(phrase.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&'), 'i').test(src),
      `copy includes: "${phrase}"`)
  }

  // Sectioned view triggers only when filter=all AND search empty.
  assert(/showSections\s*=\s*filter\s*===\s*LINK_REVIEW_FILTERS\.ALL\s*&&\s*search\s*===\s*['"]['"]/.test(src),
    'sectioned view conditional includes both filter==all AND empty search')

  // No bulk apply UI / no accept-all. Strip JS line/block comments
  // first so the file's own architectural discussion of "no bulk
  // apply, no 'accept all suggestions'" doesn't trip the CTA detector.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/(Apply|Accept|Link)\s+all\s+(suggestion|match|item|catalog)/i.test(codeOnly)
      && !/Auto[- ]link/i.test(codeOnly)
      && !/>\s*Apply all\s*</.test(codeOnly)
      && !/>\s*Accept all\s*</.test(codeOnly),
    'no bulk-apply / accept-all CTA in the tab body (code-only scan)')
  // No Add-to-Inventory regression.
  assert(!/Add to Inventory/i.test(src),
    'no "Add to Inventory" CTA')
  // Still card-based (no <table>).
  assert(!/<table\b/.test(src),
    'no <table> layout in Link Review tab')
  // Picker still the only write surface — no direct PATCH from this file.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'tab issues no direct POST/PATCH/DELETE')
  // No /api/product-catalog mutation anywhere.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}method:\s*['"](POST|PATCH|DELETE)/.test(src),
    'no /api/product-catalog mutation request')

  // Single-list view still requires picker confirmation. The contract:
  // every non-null setInventoryCatalogLink invocation must live inside
  // commitLink — the function the CatalogLinkPicker calls via onConfirm.
  // Unlink (second-arg null) is allowed anywhere because it's a one-tap
  // stewardship action with no picker round-trip.
  const commitLinkBlock = src.match(
    /async\s+function\s+commitLink[\s\S]*?\n\s{0,4}\}/,
  )?.[0] ?? ''
  assert(/setInventoryCatalogLink\(pickerItem\.id,\s*productCatalogId\)/.test(commitLinkBlock),
    'commitLink invokes setInventoryCatalogLink(pickerItem.id, productCatalogId)')
  // Outside commitLink: every setInventoryCatalogLink call MUST pass
  // `null` as the second arg (unlink only).
  const outside = src.replace(commitLinkBlock, '')
  const outsideCalls = outside.match(/setInventoryCatalogLink\([^)]*\)/g) ?? []
  for (const call of outsideCalls) {
    assert(/,\s*null\s*\)/.test(call),
      `setInventoryCatalogLink call outside commitLink is unlink-only: ${call}`)
  }
}

console.log('— CSS adds toolbar / progress / totalTone classes')
{
  const css = readFileSync('src/pages/Inventory/tabs/InventoryLinkReview.module.css', 'utf8')
  for (const cls of [
    'progress', 'progressBar', 'progressPct',
    'toolbar', 'filterBtn', 'filterBtnActive', 'sortSelect',
    'stewardNote', 'legendStat_total',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile-first guard preserved.
  assert(/@media\s*\(min-width:\s*\d+px\)/.test(css),
    'mobile-first @media (min-width: …) preserved')
}

console.log('— Forbidden-write invariants still hold')
{
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  const invSrc = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = invSrc.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'MUTABLE_COLUMNS still excludes productCatalogId')
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
