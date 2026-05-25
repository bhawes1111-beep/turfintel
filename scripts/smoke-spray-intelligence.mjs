// Phase 7D (1/?) — Spray Intelligence smoke.
//
//   node scripts/smoke-spray-intelligence.mjs
//
// Pure-helper unit-style assertions for buildSprayIntelligence and the
// five sub-helpers, plus source contracts on the BuildSpraySheet panel.
// No live D1, no network. Locks the "awareness, not recommendation"
// invariants:
//   - no recommendation language in the helper or panel
//   - no fetch / store imports / mutation verbs
//   - inputs are not mutated
//   - signal-word ordering Danger > Warning > Caution > null
//   - missing REI is NOT defaulted to 0; missingIntelCount captures it
//   - groups dedupe and split on comma-separated label strings
//   - save payload remains unchanged (no intel/intelligence/recommendation
//     key in createSpray products payload)

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Source contracts ─────────────────────────────────────────────────────
console.log('— src/utils/productCatalog/sprayIntelligence.js (source contracts)')
{
  const src = readFileSync('src/utils/productCatalog/sprayIntelligence.js', 'utf8')

  for (const name of [
    'buildSprayIntelligence',
    'summarizeChemistryGroups',
    'calculateMaxRei',
    'detectRestrictedUse',
    'summarizeSignalWords',
    'countMissingIntel',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Purity: no React, no fetch, no store/route/API imports.
  assert(!/from\s+['"]react['"]/.test(src),         'no react import')
  assert(!/fetch\(/.test(src),                       'no fetch()')
  assert(!/from\s+['"][^'"]*Store(['"]|\.js['"])/.test(src),
    'no *Store imports')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(src),
    'no mutation verbs')

  // No recommendation language anywhere in the helper.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\b(recommend|recommendation|do not apply|apply now|suggested action)\b/i.test(codeOnly),
    'no recommendation language in helper code')
}

// ── 2. Helper behavior ──────────────────────────────────────────────────────
console.log('— buildSprayIntelligence + sub-helpers behavior')
{
  const mod = await import('../src/utils/productCatalog/sprayIntelligence.js')

  // Row factory for readable fixtures. `intel` mirrors the shape
  // resolveSprayProductIntel returns (Phase 7C.1/6).
  const row = (name, intelOver = {}) => ({
    id: name, name, inventoryItemId: name,
    intel: {
      source: 'catalog',
      catalogId: `pc-${name}`,
      category: 'fungicide',
      fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
      activeIngredientSummary: null,
      signalWord: null, reiHours: null, phiHours: null,
      restrictedUse: false,
      rates: [], labelUrl: null,
      ...intelOver,
    },
  })
  const legacyRow  = (name) => ({ id: name, name, inventoryItemId: name,
    intel: { source: 'legacy', catalogId: null, category: 'fungicide',
      fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
      activeIngredientSummary: null, signalWord: null, reiHours: null,
      phiHours: null, restrictedUse: false, rates: [], labelUrl: null,
    } })
  const noIntelRow = (name) => ({ id: name, name, inventoryItemId: name,
    intel: { source: 'none', catalogId: null, category: null,
      fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
      activeIngredientSummary: null, signalWord: null, reiHours: null,
      phiHours: null, restrictedUse: false, rates: [], labelUrl: null,
    } })

  // ── summarizeChemistryGroups: dedupe + numeric sort + comma-split ──
  {
    const rows = [
      row('A', { fracGroup: '11', hracGroup: '3' }),
      row('B', { fracGroup: '3' }),                    // duplicates A
      row('C', { fracGroup: '3, 11' }),                // comma-split, both dups
      row('D', { fracGroup: 'M5' }),
      row('E', { iracGroup: '28' }),
      row('F', { pgrClass: 'GA inhibitor' }),
      row('G', { pgrClass: 'GA inhibitor' }),          // duplicate PGR
    ]
    const g = mod.summarizeChemistryGroups(rows)
    assert(JSON.stringify(g.frac) === JSON.stringify(['3','11','M5']),
      'FRAC dedupes, numeric-first sort, comma-split', g.frac)
    assert(JSON.stringify(g.hrac) === JSON.stringify(['3']), 'HRAC distinct values', g.hrac)
    assert(JSON.stringify(g.irac) === JSON.stringify(['28']), 'IRAC distinct values')
    assert(JSON.stringify(g.pgr)  === JSON.stringify(['GA inhibitor']),
      'PGR dedupes class name', g.pgr)
  }

  // ── calculateMaxRei ────────────────────────────────────────────────
  {
    assert(mod.calculateMaxRei([]) === null, 'empty rows → null')
    assert(mod.calculateMaxRei([row('A', { reiHours: 4 }), row('B', { reiHours: 12 })]) === 12,
      'max REI across rows = 12')
    assert(mod.calculateMaxRei([row('A', { reiHours: 4 }), row('B') ]) === 4,
      'missing REI does NOT default to 0 (max stays at 4)')
    assert(mod.calculateMaxRei([row('A'), row('B')]) === null,
      'all-missing REI → null (no fabricated 0)')
    assert(mod.calculateMaxRei([row('A', { reiHours: 'twelve' }), row('B', { reiHours: 4 })]) === 4,
      'non-finite REI values ignored')
  }

  // ── detectRestrictedUse ────────────────────────────────────────────
  {
    assert(mod.detectRestrictedUse([]) === false, 'empty → false')
    assert(mod.detectRestrictedUse([row('A'), row('B')]) === false,
      'no rows assert RUP → false (missing data not treated as restricted)')
    assert(mod.detectRestrictedUse([row('A'), row('B', { restrictedUse: true })]) === true,
      'any row with restrictedUse:true → true')
    // Truthy non-boolean is NOT a match (helper checks === true).
    assert(mod.detectRestrictedUse([row('A', { restrictedUse: 'yes' })]) === false,
      'restrictedUse:"yes" is not treated as true (strict === true only)')
  }

  // ── summarizeSignalWords: Danger > Warning > Caution > null ────────
  {
    assert(mod.summarizeSignalWords([]) === null, 'empty → null')
    assert(mod.summarizeSignalWords([row('A')]) === null,
      'all-missing signal → null')
    assert(mod.summarizeSignalWords([
      row('A', { signalWord: 'Caution' }),
      row('B', { signalWord: 'Warning' }),
    ]) === 'Warning',                            'Warning > Caution')
    assert(mod.summarizeSignalWords([
      row('A', { signalWord: 'Caution' }),
      row('B', { signalWord: 'Warning' }),
      row('C', { signalWord: 'Danger' }),
    ]) === 'Danger',                             'Danger > Warning > Caution')
    // Case-insensitive normalization, but the highest-row label is returned.
    assert(mod.summarizeSignalWords([
      row('A', { signalWord: 'caution' }),
      row('B', { signalWord: 'DANGER' }),
    ]) === 'DANGER',                             'case-insensitive ranking; original label preserved')
    // Unknown signal words are ignored, not promoted.
    assert(mod.summarizeSignalWords([
      row('A', { signalWord: 'Whatever' }),
      row('B', { signalWord: 'Caution' }),
    ]) === 'Caution',                            'unknown signal word ignored')
  }

  // ── countMissingIntel ──────────────────────────────────────────────
  {
    assert(mod.countMissingIntel([]) === 0, 'empty → 0')
    assert(mod.countMissingIntel([
      row('A'),                  // catalog source → has intel
      legacyRow('B'),            // legacy source still counts as intel
      noIntelRow('C'),           // source 'none' → MISSING
      { id: 'D', name: 'D' },    // no intel object at all → MISSING
      { id: 'E', name: '' },     // empty placeholder → excluded
    ]) === 2,                                  'counts 2 missing (C, D)')
  }

  // ── buildSprayIntelligence end-to-end ──────────────────────────────
  {
    const rows = [
      row('A',  { fracGroup: '11', signalWord: 'Caution', reiHours: 4 }),
      row('B',  { fracGroup: '3',  signalWord: 'Warning', reiHours: 12, restrictedUse: true }),
      row('C',  { hracGroup: '5',  reiHours: 24 }),
      row('D',  { iracGroup: '28', signalWord: 'Danger' }),
      noIntelRow('E'),
      { id: 'F', name: 'F' },     // missing intel
      { id: 'G', name: '' },      // empty placeholder — excluded from totals
    ]

    const intel = mod.buildSprayIntelligence(rows)
    assert(intel.totalProducts === 6, 'totalProducts excludes empty placeholder', intel.totalProducts)
    assert(intel.productsWithIntelCount === 4, 'productsWithIntelCount = 4 (A,B,C,D)')
    assert(intel.missingIntelCount === 2,      'missingIntelCount = 2 (E,F)')
    assert(JSON.stringify(intel.groups.frac) === JSON.stringify(['3','11']),
      'groups.frac → [3, 11]', intel.groups.frac)
    assert(JSON.stringify(intel.groups.hrac) === JSON.stringify(['5']), 'groups.hrac → [5]')
    assert(JSON.stringify(intel.groups.irac) === JSON.stringify(['28']),'groups.irac → [28]')
    assert(JSON.stringify(intel.groups.pgr)  === JSON.stringify([]),    'groups.pgr → []')
    assert(intel.maxReiHours === 24,            'maxReiHours = 24')
    assert(intel.restrictedUse === true,        'restrictedUse detected')
    assert(intel.highestSignalWord === 'Danger','highestSignalWord = Danger')

    // Notice list shape (deterministic order, stewardship language only).
    const types = intel.notices.map(n => n.type)
    assert(types.every(t => ['info','caution','warning'].includes(t)),
      'all notice types are info|caution|warning', types)
    const labels = intel.notices.map(n => n.label).join(' | ')
    // No recommendation phrasing anywhere in the notice list.
    assert(!/recommend|do not apply|apply now/i.test(labels),
      'notice labels carry no recommendation phrasing', labels)
    assert(intel.notices.some(n => n.label === 'FRAC groups present' && n.value === '3, 11'),
      'FRAC notice present with sorted value')
    assert(intel.notices.some(n => n.label === 'Max REI across tank' && n.value === '24 hrs'),
      'Max REI notice present')
    assert(intel.notices.some(n => n.type === 'caution' && /restricted-use/i.test(n.label)),
      'RUP caution notice present')
    assert(intel.notices.some(n => n.type === 'caution' && /signal word/i.test(n.label) && n.value === 'Danger'),
      'Highest signal word notice present')
    assert(intel.notices.some(n => n.type === 'warning' && /missing/i.test(n.label) && /2 of 6/.test(n.value)),
      'Missing intel notice present with count + total')
  }

  // ── Empty / null safety ────────────────────────────────────────────
  {
    const empty = mod.buildSprayIntelligence([])
    assert(empty.totalProducts === 0,           'empty rows → totalProducts 0')
    assert(empty.missingIntelCount === 0,       'empty rows → missingIntelCount 0')
    assert(empty.notices.length === 0,          'empty rows → no notices')
    assert(empty.maxReiHours === null,          'empty rows → maxReiHours null')

    const nullSafe = mod.buildSprayIntelligence(null)
    assert(nullSafe.totalProducts === 0,        'null rows → totalProducts 0')
  }

  // ── Purity: helper never mutates rows ──────────────────────────────
  {
    const rows = [
      row('A', { fracGroup: '11', reiHours: 4, signalWord: 'Warning' }),
      row('B', { fracGroup: '3, 11', restrictedUse: true }),
    ]
    const before = JSON.stringify(rows)
    mod.buildSprayIntelligence(rows)
    mod.summarizeChemistryGroups(rows)
    mod.calculateMaxRei(rows)
    mod.detectRestrictedUse(rows)
    mod.summarizeSignalWords(rows)
    mod.countMissingIntel(rows)
    assert(JSON.stringify(rows) === before, 'all helpers leave inputs untouched')
  }

  // ── Internal seam sanity ───────────────────────────────────────────
  {
    assert(mod.__TEST.SIGNAL_RANK.danger === 3 &&
           mod.__TEST.SIGNAL_RANK.warning === 2 &&
           mod.__TEST.SIGNAL_RANK.caution === 1,
      'SIGNAL_RANK ordering Danger=3 > Warning=2 > Caution=1')
    assert(mod.__TEST.normalizeSignal('Warning') === 'warning',
      'normalizeSignal lowercases known words')
    assert(mod.__TEST.normalizeSignal('Whatever') === null,
      'normalizeSignal returns null for unknown words')
    assert(mod.__TEST.normalizeSignal(null) === null, 'normalizeSignal handles null')
  }
}

// ── 3. BuildSpraySheet wiring + UI copy contracts ──────────────────────────
console.log('— BuildSpraySheet renders Spray Intelligence panel')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

  assert(/from\s+['"][^'"]*productCatalog\/sprayIntelligence['"]/.test(src),
    'imports sprayIntelligence helper')
  assert(/buildSprayIntelligence/.test(src), 'invokes buildSprayIntelligence')

  // Memoized so the panel re-derives only when enrichedRows changes.
  assert(/sprayIntel\s*=\s*useMemo\(\s*[\s\S]*?buildSprayIntelligence\(enrichedRows\)[\s\S]*?\[enrichedRows\]/.test(src),
    'sprayIntel useMemo keyed on enrichedRows')

  // Panel rendered inside the tank summary aside.
  assert(/<SummarySection\s+label=['"]Spray Intelligence['"]\s*>/.test(src),
    'renders <SummarySection label="Spray Intelligence">')
  assert(/<SprayIntelligencePanel\b/.test(src), 'renders <SprayIntelligencePanel>')

  // Required stewardship copy. JSX text nodes wrap across lines, so we
  // normalize whitespace before matching.
  const srcNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Read-only awareness based on linked catalog and label data',
    'This does not replace the product label',
    'Missing intelligence means the product is not linked or no label data is available',
  ]) {
    assert(srcNorm.includes(phrase),
      `copy includes: "${phrase}"`)
  }

  // Forbidden phrasing — awareness only, never recommendation.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bdo not apply\b/i.test(codeOnly),     'no "do not apply" copy')
  assert(!/\bapply now\b/i.test(codeOnly),        'no "apply now" copy')
  assert(!/\bsuggested\s+action\b/i.test(codeOnly), 'no "suggested action" copy')
  assert(!/\bauto[- ]apply\b/i.test(codeOnly),    'no auto-apply CTA')
}

// ── 4. Save payload still does not echo catalog ids / intelligence ─────────
console.log('— BuildSpraySheet save payload unchanged')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  // Same anchor as Phase 7C.1/6 smoke. Re-asserted here so the
  // Spray Intelligence layer can't sneak any field into the persisted
  // payload.
  const payload = src.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray-save products payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation/i.test(payload),
    'save payload omits catalog ids / intel / intelligence / recommendation keys',
    payload)
}

// ── 5. No new write route added on the catalog side ────────────────────────
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

// ── Result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
