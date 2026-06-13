// Phase 7E (1/?) — Spray Intelligence Report Builder smoke.
//
//   node scripts/smoke-spray-intelligence-report.mjs
//
// Locks the report-builder-foundation invariants:
//   - exports the two declared helpers
//   - reuses Phase 7D helpers (no parallel intelligence logic)
//   - no React / fetch / store imports
//   - inputs are never mutated
//   - totals add up
//   - missing-intel + restricted-use + repeated-group + interval-match
//     counts are deterministic
//   - all five spec sections are present
//   - registered in REPORT_TYPE + REPORT_DEFS with the spray module
//   - bundle keys declared by the def match what Reports.jsx supplies
//   - no recommendation language anywhere in code or notices
//   - no catalog mutation route added
//   - spray save payload byte-identical

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Source contracts ────────────────────────────────────────────────────
console.log('— src/utils/reports/builders/sprayIntelligenceReport.js (source)')
{
  const src = readFileSync('src/utils/reports/builders/sprayIntelligenceReport.js', 'utf8')

  for (const name of ['buildSprayIntelligenceReport', 'summarizeSprayRecordForReport', 'buildSprayReportSections']) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Reuses Phase 7D helpers — no parallel intelligence logic.
  // Path may or may not include a .js suffix.
  assert(/from\s+['"][^'"]*sprayIntelligence(\.js)?['"]/.test(src),
    'imports buildSprayIntelligence from sprayIntelligence module')
  assert(/from\s+['"][^'"]*sprayRotationAwareness(\.js)?['"]/.test(src),
    'imports buildSprayRotationAwareness from sprayRotationAwareness module')
  assert(/from\s+['"][^'"]*sprayIntervalAwareness(\.js)?['"]/.test(src),
    'imports buildSprayIntervalAwareness from sprayIntervalAwareness module')
  assert(/from\s+['"][^'"]*resolveSprayProductIntel(\.js)?['"]/.test(src),
    'imports resolveSprayProductIntel for the catalog-first 3-tier path')

  // Purity invariants — code-only so comments can discuss what we don't import.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),    'no react import')
  assert(!/fetch\(/.test(codeOnly),                  'no fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'no *Store imports')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'no mutation verbs')
  // The disclaimer line itself contains the word "recommend" (as in
  // "does not recommend"). That's the spec-mandated stewardship copy,
  // not a recommendation. Strip the disclaimer text before scanning.
  const codeStripDisclaimer = codeOnly
    .replace(/'This report does not recommend treatments\.',?/g, '')
  assert(!/\b(recommend|recommendation|do not apply|apply now|rotate to|safe|unsafe|suggested action|auto[- ]apply)\b/i.test(codeStripDisclaimer),
    'no recommendation language in builder code (disclaimer line excluded)')
}

// ── 2. Behavior ───────────────────────────────────────────────────────────
console.log('— buildSprayIntelligenceReport behavior')
{
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')

  const NOW = Date.parse('2026-05-25T12:00:00Z')
  const iso = d => new Date(NOW - d * 86_400_000).toISOString()

  // Fixtures — minimal but exercise every dimension.
  const catalogProducts = [
    { id: 'pc-heritage',  productName: 'Heritage',  category: 'fungicide', fracGroup: '11', signalWord: 'Caution', reiHours: 4  },
    { id: 'pc-barricade', productName: 'Barricade', category: 'herbicide', hracGroup: '3',  signalWord: 'Caution', reiHours: 12, restrictedUse: true },
  ]
  const inventoryProducts = [
    { id: 'inv-A', name: 'Heritage',  kind: 'chemical', productCatalogId: 'pc-heritage' },
    { id: 'inv-B', name: 'Barricade', kind: 'chemical', productCatalogId: 'pc-barricade' },
    // No inventory row for the mystery product so the resolver
    // genuinely returns source: 'none' (would be tier-3 legacy
    // otherwise). This is the only deterministic way to assert
    // "missing intel" in a smoke fixture.
  ]
  const labelsByItemId = {}

  // Two sprays in the rotation window (≤30d), one outside (> 30d but
  // within interval lookback of 45d), one soft-deleted, one with a
  // genuinely unresolvable product (no inventory row, no catalog).
  const sprays = [
    { id: 's1', date: iso(5),  applicationName: 'Greens fungicide app',
      products: [{ name: 'Heritage', inventoryItemId: 'inv-A' }] },
    { id: 's2', date: iso(13), applicationName: 'Pre-emergent app',
      products: [{ name: 'Barricade', inventoryItemId: 'inv-B' }] },
    // Outside the 30d rotation window but inside the 45d interval window.
    { id: 's3', date: iso(40), applicationName: 'Older app',
      products: [{ name: 'Heritage', inventoryItemId: 'inv-A' }] },
    // Unresolvable product — no inventory match → source 'none'.
    { id: 's4', date: iso(20), applicationName: 'Mystery app',
      products: [{ name: 'Truly Unknown Brand' }] },
    // Soft-deleted — must be excluded.
    { id: 's5', date: iso(2), status: 'deleted', applicationName: 'Bad',
      products: [{ name: 'Heritage' }] },
    null,
  ]

  const report = mod.buildSprayIntelligenceReport({
    sprays, inventoryProducts, catalogProducts, labelsByItemId,
    dateRange: 'last 45 days',
    options: { now: NOW, rotationLookbackDays: 30, intervalLookbackDays: 45 },
  })

  // Envelope shape.
  assert(report.module === 'spray',                   "envelope.module === 'spray'")
  assert(report.type   === 'spray-intelligence',      "envelope.type === 'spray-intelligence'")
  assert(report.title  === 'Spray Intelligence Report','envelope.title set')
  assert(Array.isArray(report.sections),               'envelope.sections is an array')

  // Spec-required section ids — we use titles since createSection
  // doesn't carry ids by default. Lock the five titles.
  const sectionTitles = report.sections.map(s => s.title)
  for (const t of ['Overview', 'Chemistry Awareness', 'Rotation Awareness', 'Interval Awareness', 'Missing Intelligence']) {
    assert(sectionTitles.includes(t), `section present: "${t}"`)
  }

  // Totals — derived from per-spray rollup over the 4 non-deleted sprays.
  const totals = report.metadata.totals
  assert(totals.spraysReviewed === 4,         'spraysReviewed = 4 (excludes soft-deleted + null)')
  assert(totals.productsReviewed === 4,       'productsReviewed = 4 (one per spray)')
  assert(totals.productsWithIntel === 3,      'productsWithIntel = 3 (Mystery has no intel)')
  assert(totals.missingIntelCount === 1,      'missingIntelCount = 1')
  assert(totals.restrictedUseCount === 1,     'restrictedUseCount = 1 (Barricade spray)')
  // Both FRAC 11 (Heritage s1+s3) and HRAC 3 (Barricade s2 alone — but
  // it shows up in BOTH the current-aggregate AND the history window,
  // so the helper records a repeat). Counts each distinct repeated
  // group value.
  assert(totals.repeatedGroupCount === 2,
    'repeatedGroupCount = 2 (FRAC 11 + HRAC 3 repeat across the 30d window)',
    totals.repeatedGroupCount)
  assert(typeof totals.intervalMatchCount === 'number' && totals.intervalMatchCount > 0,
    'intervalMatchCount > 0', totals.intervalMatchCount)

  // Notices — prefixed with module, no recommendation phrases.
  const noticeText = (report.metadata.notices ?? []).map(n => `${n.label} ${n.value}`).join(' | ')
  assert(/Chemistry · /.test(noticeText),     'notices prefixed with "Chemistry · "')
  assert(/Rotation · /.test(noticeText),      'notices prefixed with "Rotation · "')
  assert(/Interval · /.test(noticeText),      'notices prefixed with "Interval · "')
  assert(!/recommend|rotate to|safe|unsafe|do not apply|apply now/i.test(noticeText),
    'notices contain no recommendation phrasing')

  // Disclaimer present in metadata + Overview section data.
  assert(/Read-only spray intelligence summary/.test(report.metadata.disclaimer ?? ''),
    'metadata.disclaimer carries the stewardship copy')
  const overview = report.sections.find(s => s.title === 'Overview')
  assert(overview && /Read-only spray intelligence summary/.test(overview.data['Disclaimer'] ?? ''),
    'Overview section includes the disclaimer field')
  assert(/does not recommend treatments/i.test(report.metadata.disclaimer ?? ''),
    'disclaimer says "does not recommend treatments"')
  assert(/Missing intelligence/i.test(report.metadata.disclaimer ?? ''),
    'disclaimer defines what "missing intelligence" means')

  // dateRange surfaced.
  assert(report.metadata.dateRange === 'last 45 days',
    'metadata.dateRange round-trips through the envelope')

  // ── Section content sanity ────────────────────────────────────────
  const chemistry = report.sections.find(s => s.title === 'Chemistry Awareness')
  assert(chemistry?.data?.columns?.length === 2 && Array.isArray(chemistry?.data?.rows),
    'Chemistry Awareness is a TABLE section with 2 columns')
  const fracRow = chemistry.data.rows.find(r => r[0] === 'FRAC')
  assert(fracRow && /11/.test(String(fracRow[1])),
    'Chemistry FRAC row mentions 11')

  const rotation = report.sections.find(s => s.title === 'Rotation Awareness')
  const rotFrac = rotation.data.rows.find(r => r[0] === 'FRAC')
  assert(rotFrac && /11/.test(String(rotFrac[1])),
    'Rotation FRAC row carries the repeated 11')

  const interval = report.sections.find(s => s.title === 'Interval Awareness')
  assert(interval.data.columns.length === 5,
    'Interval Awareness has 5 columns (Kind, Match, Last seen, Date, Spray)')
  const intervalText = JSON.stringify(interval.data.rows)
  assert(/Heritage/.test(intervalText),       'Interval table mentions Heritage (recent match)')
  assert(/days ago|today/.test(intervalText), 'Interval table uses "N days ago" wording')

  const missing = report.sections.find(s => s.title === 'Missing Intelligence')
  const missingText = JSON.stringify(missing.data.rows)
  assert(/Mystery app/.test(missingText),
    'Missing Intelligence table lists the mystery spray')

  // ── Edge cases ────────────────────────────────────────────────────
  // Empty inputs → still a valid report envelope.
  const emptyReport = mod.buildSprayIntelligenceReport({
    sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
  })
  assert(emptyReport.module === 'spray',                  'empty inputs → still spray module')
  assert(emptyReport.metadata.totals.spraysReviewed === 0,'empty inputs → spraysReviewed 0')
  assert(emptyReport.metadata.totals.missingIntelCount === 0,
    'empty inputs → missingIntelCount 0')
  // Sections still exist (so the renderer can mount).
  for (const t of ['Overview', 'Chemistry Awareness', 'Rotation Awareness', 'Interval Awareness', 'Missing Intelligence']) {
    assert(emptyReport.sections.some(s => s.title === t),
      `empty inputs → section present: "${t}"`)
  }

  // Defensive: null/undefined arrays don't throw.
  const nullSafe = mod.buildSprayIntelligenceReport({
    sprays: null, inventoryProducts: null, catalogProducts: null, labelsByItemId: null,
  })
  assert(nullSafe.metadata.totals.spraysReviewed === 0,
    'null inputs → spraysReviewed 0 (no throw)')

  // ── Purity ────────────────────────────────────────────────────────
  const sprayJson = JSON.parse(JSON.stringify(sprays.filter(Boolean)))
  const invJson   = JSON.parse(JSON.stringify(inventoryProducts))
  const catJson   = JSON.parse(JSON.stringify(catalogProducts))
  const lblJson   = JSON.parse(JSON.stringify(labelsByItemId))
  const sprayBefore = JSON.stringify(sprayJson)
  const invBefore   = JSON.stringify(invJson)
  const catBefore   = JSON.stringify(catJson)
  const lblBefore   = JSON.stringify(lblJson)
  mod.buildSprayIntelligenceReport({
    sprays: sprayJson, inventoryProducts: invJson,
    catalogProducts: catJson, labelsByItemId: lblJson,
    options: { now: NOW },
  })
  assert(JSON.stringify(sprayJson) === sprayBefore, 'sprays array not mutated')
  assert(JSON.stringify(invJson)   === invBefore,   'inventoryProducts array not mutated')
  assert(JSON.stringify(catJson)   === catBefore,   'catalogProducts array not mutated')
  assert(JSON.stringify(lblJson)   === lblBefore,   'labelsByItemId not mutated')
}

// ── 3. summarizeSprayRecordForReport ──────────────────────────────────────
console.log('— summarizeSprayRecordForReport behavior')
{
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')
  const ctx = {
    inventoryProducts: [{ id: 'inv-A', name: 'Heritage', kind: 'chemical', productCatalogId: 'pc-heritage' }],
    catalogProducts:   [{ id: 'pc-heritage', productName: 'Heritage', category: 'fungicide', fracGroup: '11' }],
    labelsByItemId:    {},
  }
  const rows = mod.summarizeSprayRecordForReport(
    { id: 's', products: [{ name: 'Heritage', inventoryItemId: 'inv-A' }, { name: 'Unknown' }] },
    ctx,
  )
  assert(rows.length === 2, 'returns one row per product')
  assert(rows[0].intel?.source === 'catalog',  'Heritage resolves to catalog tier')
  assert(rows[0].intel?.fracGroup === '11',    'Heritage carries FRAC 11')
  assert(rows[1].intel?.source !== 'catalog',  'Unknown does not resolve to catalog')

  // Null / missing inputs don't throw.
  assert(Array.isArray(mod.summarizeSprayRecordForReport(null, ctx))
      && mod.summarizeSprayRecordForReport(null, ctx).length === 0,
    'null spray → empty array')
  assert(Array.isArray(mod.summarizeSprayRecordForReport({}, ctx)),
    'spray with no products → empty array')
}

// ── 4. Registry integration ───────────────────────────────────────────────
console.log('— registry integration')
{
  const schemas  = readFileSync('src/utils/reports/reportSchemas.js', 'utf8')
  const defs     = readFileSync('src/utils/reports/reportDefs.js', 'utf8')

  // REPORT_TYPE.SPRAY_INTELLIGENCE present.
  assert(/SPRAY_INTELLIGENCE:\s*['"]spray-intelligence['"]/.test(schemas),
    "REPORT_TYPE.SPRAY_INTELLIGENCE === 'spray-intelligence'")

  // REPORT_DEFS contains the spray-intelligence entry.
  assert(/id:\s*['"]spray-intelligence['"]/.test(defs),
    'REPORT_DEFS contains spray-intelligence entry')
  assert(/module:\s*REPORT_MODULE\.SPRAY/.test(defs),
    'spray-intelligence uses REPORT_MODULE.SPRAY')

  // Required bundle keys match what Reports.jsx supplies.
  const requiresMatch = defs.match(/id:\s*['"]spray-intelligence['"][\s\S]*?requires:\s*\[([^\]]+)\]/)
  assert(requiresMatch != null, 'spray-intelligence has a requires array')
  const requires = (requiresMatch?.[1] ?? '').replace(/[\s'"]/g, '').split(',').filter(Boolean)
  for (const key of ['sprays', 'inventoryProducts', 'catalogProducts', 'labelsByItemId']) {
    assert(requires.includes(key),
      `requires includes "${key}"`, requires)
  }

  // Reports hub wires all four keys to the bundle.
  const hub = readFileSync('src/pages/Reports/Reports.jsx', 'utf8')
  for (const key of ['sprays', 'inventoryProducts', 'catalogProducts', 'labelsByItemId']) {
    assert(new RegExp(`\\b${key}:`).test(hub),
      `Reports.jsx bundle defines "${key}"`)
  }
  // The hub assembles labelsByItemId from importedLabels.labels.
  assert(/inventoryItemId/.test(hub),
    'Reports.jsx indexes labels by inventoryItemId')

  // Builder runs through the registry's build() with the hub bundle.
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')
  const defsMod = await import('../src/utils/reports/reportDefs.js')
  const sprayDef = defsMod.REPORT_DEFS.find(d => d.id === 'spray-intelligence')
  assert(sprayDef != null, 'REPORT_DEFS.find(spray-intelligence) returns the entry')
  assert(typeof sprayDef.build === 'function', 'spray-intelligence def carries a build() function')
  const out = sprayDef.build({ sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {} })
  assert(out && out.module === 'spray' && out.type === 'spray-intelligence',
    'registry build() returns the spray-intelligence envelope')
  // Sanity: builder export the registry calls is the one we defined.
  assert(out.title === 'Spray Intelligence Report',
    'registry build() title comes from the builder module')
  // Single source of intelligence logic — no surface from the legacy
  // reportBuilder.js exports the same name.
  const legacy = readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
  assert(!/buildSprayIntelligenceReport/.test(legacy),
    'no duplicate buildSprayIntelligenceReport export in legacy reportBuilder.js')
  // Module identity check.
  assert(typeof mod.buildSprayIntelligenceReport === 'function',
    'builder module exports buildSprayIntelligenceReport')
}

// ── 5. Forbidden-write invariants ─────────────────────────────────────────
console.log('— Forbidden-write invariants')
{
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  const invSrc = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = invSrc.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'MUTABLE_COLUMNS still excludes productCatalogId')

  // Spray save payload still unchanged.
  const builderSrc = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = builderSrc.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/intelligence|recommendation|rotation|interval/i.test(payload),
    'spray save payload omits intel/intelligence/rotation/interval keys',
    payload)
}

// ── Result ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
