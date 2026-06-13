// Phase 7D (3/?) — Spray Application Interval Awareness smoke.
//
//   node scripts/smoke-spray-interval-awareness.mjs
//
// Pure-helper unit-style assertions + BuildSpraySheet source contracts.
// Locks the awareness-only invariants:
//   - no recommendation phrasing in helper or panel
//   - no fetch / store / React imports in helper
//   - inputs not mutated
//   - exact product match only (normalized name OR inventoryItemId)
//   - no fuzzy product matching
//   - group matches use only the injected resolver (or row.intel)
//   - lookbackDays + maxMatches honored
//   - invalid / missing dates do not throw
//   - future-dated and soft-deleted records ignored
//   - missing historical intel counted (never guessed)
//   - save payload unchanged
//   - no /api/product-catalog mutation route added

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Source contracts ────────────────────────────────────────────────────
console.log('— src/utils/productCatalog/sprayIntervalAwareness.js (source)')
{
  const src = readFileSync('src/utils/productCatalog/sprayIntervalAwareness.js', 'utf8')

  for (const name of [
    'buildSprayIntervalAwareness',
    'extractCurrentProducts',
    'findRecentProductMatches',
    'findRecentGroupMatches',
    'calculateDaysSince',
    'summarizeIntervalNotices',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/from\s+['"]react['"]/.test(codeOnly),       'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),                     'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper issues no mutations')
  assert(!/\b(rotate to|safe|unsafe|apply now|do not apply|recommend|recommendation|suggested action)\b/i.test(codeOnly),
    'no recommendation language in helper code')
}

// ── 2. Helper behavior ────────────────────────────────────────────────────
console.log('— helper behavior')
{
  const mod = await import('../src/utils/productCatalog/sprayIntervalAwareness.js')

  const intel = (over = {}) => ({
    source: 'catalog', catalogId: null, category: null,
    fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
    signalWord: null, reiHours: null, phiHours: null,
    restrictedUse: false, activeIngredientSummary: null,
    rates: [], labelUrl: null, ...over,
  })
  const row = (over = {}) => ({
    id: over.id ?? over.name ?? 'r',
    name: over.name ?? null,
    inventoryItemId: over.inventoryItemId ?? null,
    intel: over.intel ?? intel(),
  })

  // ── calculateDaysSince ────────────────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    assert(mod.calculateDaysSince('2026-05-25T00:00:00Z', NOW) === 0,
      'today (start-of-day) → 0 days')
    assert(mod.calculateDaysSince('2026-05-12T12:00:00Z', NOW) === 13,
      '13 days ago → 13')
    assert(mod.calculateDaysSince('2026-05-26T00:00:00Z', NOW) === -1,
      'future → negative days (caller filters)')
    assert(mod.calculateDaysSince(null, NOW) === null, 'null → null')
    assert(mod.calculateDaysSince('not-a-date', NOW) === null, 'unparsable → null')
    assert(mod.calculateDaysSince(new Date(NOW - 86_400_000), NOW) === 1,
      'Date object → days computed')
  }

  // ── extractCurrentProducts ────────────────────────────────────────────
  {
    const rows = [
      row({ name: 'Barricade 4FL', inventoryItemId: 'inv-1', intel: intel({ hracGroup: '3' }) }),
      row({ name: 'Heritage',      inventoryItemId: null,    intel: intel({ fracGroup: '11' }) }),
      row({ name: '',              inventoryItemId: null }),    // empty → drop
      row({ name: 'Mystery' /* no intel set, defaults to source 'catalog' */ }),
    ]
    const out = mod.extractCurrentProducts(rows)
    assert(out.length === 3, 'empty placeholder dropped', out.length)
    assert(out[0].normalizedName === 'barricade-4fl', 'normalize spaces + uppercase')
    assert(out[0].inventoryItemId === 'inv-1', 'inventoryItemId preserved')
    assert(JSON.stringify(out[0].groups.hrac) === JSON.stringify(['3']),
      'groups extracted from intel')
    assert(mod.extractCurrentProducts([]).length === 0, 'empty rows → []')
    assert(mod.extractCurrentProducts(null).length === 0, 'null rows → []')
  }

  // ── findRecentProductMatches ──────────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const day = d => 86_400_000 * d
    const iso = d => new Date(NOW - day(d)).toISOString()

    const current = [
      { name: 'Barricade 4FL', normalizedName: 'barricade-4fl', inventoryItemId: 'inv-A', groups: { frac:[], hrac:[], irac:[], pgr:[] } },
      { name: 'Heritage',      normalizedName: 'heritage',       inventoryItemId: null,   groups: { frac:[], hrac:[], irac:[], pgr:[] } },
      { name: 'Untouched',     normalizedName: 'untouched',      inventoryItemId: null,   groups: { frac:[], hrac:[], irac:[], pgr:[] } },
    ]
    const history = [
      // Exact inventoryItemId match for Barricade, 13 days ago.
      { id: 's1', date: iso(13), applicationName: 'Pre-emergent app',
        products: [{ name: 'Barricade Generic', inventoryItemId: 'inv-A' }] },
      // Older Barricade by name — must NOT override the closer inventoryItemId match.
      { id: 's2', date: iso(30), applicationName: 'Old PRE',
        products: [{ name: 'Barricade 4FL' }] },
      // Heritage match by normalized name only (no inventoryItemId).
      { id: 's3', date: iso(7),  applicationName: 'Greens fungicide app',
        products: [{ name: 'HERITAGE' }] },     // case-insensitive normalize
      // Outside window — must be ignored.
      { id: 's4', date: iso(60), applicationName: 'Way old',
        products: [{ name: 'Untouched' }] },
      // Future date — must be ignored.
      { id: 's5', date: iso(-3), applicationName: 'Future',
        products: [{ name: 'Untouched' }] },
      // Deleted — must be ignored.
      { id: 's6', date: iso(2),  applicationName: 'Deleted', status: 'deleted',
        products: [{ name: 'Untouched' }] },
      // Bad date — must be ignored.
      { id: 's7', date: 'banana', applicationName: 'Bad date',
        products: [{ name: 'Untouched' }] },
      null,
    ]

    const matches = mod.findRecentProductMatches(current, history, { now: NOW, lookbackDays: 45 })
    assert(matches.length === 2, '2 matches (Barricade + Heritage); Untouched found nothing', matches)
    const byName = Object.fromEntries(matches.map(m => [m.productName, m]))
    assert(byName['Barricade 4FL'].daysSince === 13,
      'Barricade matched by inventoryItemId; daysSince = 13')
    assert(byName['Barricade 4FL'].sprayName === 'Pre-emergent app',
      'closest match wins (not the older by-name match)')
    assert(byName['Heritage'].daysSince === 7,
      'Heritage matched by normalized name; daysSince = 7')

    // No fuzzy match: "Heritage" must NOT match "Heritage G".
    const heritageG = [
      { name: 'Heritage', normalizedName: 'heritage', inventoryItemId: null, groups: { frac:[], hrac:[], irac:[], pgr:[] } },
    ]
    const fuzzy = mod.findRecentProductMatches(heritageG, [
      { id: 'x', date: iso(5), applicationName: 'X', products: [{ name: 'Heritage G' }] },
    ], { now: NOW, lookbackDays: 45 })
    assert(fuzzy.length === 0, 'no fuzzy match: "Heritage" != "Heritage G"')
  }

  // ── findRecentGroupMatches ───────────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const iso = d => new Date(NOW - d * 86_400_000).toISOString()

    const resolver = (p) => {
      if (p.name === 'Heritage')   return intel({ fracGroup: '11' })
      if (p.name === 'Tenacity')   return intel({ hracGroup: '27' })
      if (p.name === 'BarricadeX') return intel({ hracGroup: '3' })
      return intel({ source: 'none' })
    }

    const currentGroups = { frac: ['11'], hrac: ['3'], irac: [], pgr: [] }
    const history = [
      { id: 'g1', date: iso(7),  applicationName: 'Greens fungicide app',
        products: [{ name: 'Heritage' }] },
      { id: 'g2', date: iso(20), applicationName: 'PRE app',
        products: [{ name: 'BarricadeX' }, { name: 'Unknown Foo' }] },
      { id: 'g3', date: iso(60), applicationName: 'Out of window',
        products: [{ name: 'Heritage' }] },
    ]
    const out = mod.findRecentGroupMatches(currentGroups, history, {
      now: NOW, lookbackDays: 45, resolveProductIntel: resolver,
    })
    assert(out.matches.length === 2, '2 group matches', out.matches)
    const byKey = Object.fromEntries(out.matches.map(m => [`${m.groupType}-${m.group}`, m]))
    assert(byKey['FRAC-11'].daysSince === 7,  'FRAC 11 last seen 7 days ago')
    assert(byKey['HRAC-3'].daysSince === 20, 'HRAC 3 last seen 20 days ago')
    assert(out.missingIntelCount === 1, 'Unknown Foo from g2 → 1 missing intel')

    // No resolver → every history product is missing intel; no group matches.
    const noRes = mod.findRecentGroupMatches(currentGroups, history, { now: NOW })
    assert(noRes.matches.length === 0, 'no resolver → no group matches')
    assert(noRes.missingIntelCount >= 3, 'no resolver → every history product counted as missing')

    // Throwing resolver doesn't crash.
    const throwRes = mod.findRecentGroupMatches(currentGroups, history, {
      now: NOW, resolveProductIntel: () => { throw new Error('x') },
    })
    assert(throwRes.matches.length === 0, 'throwing resolver → no matches, no throw')
  }

  // ── buildSprayIntervalAwareness end-to-end ────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const iso = d => new Date(NOW - d * 86_400_000).toISOString()

    const resolver = (p) => {
      if (p.name === 'Heritage')   return intel({ fracGroup: '11' })
      if (p.name === 'Tenacity')   return intel({ hracGroup: '27' })
      if (p.name === 'Barricade 4FL') return intel({ hracGroup: '3' })
      return intel({ source: 'none' })
    }

    const currentRows = [
      row({ name: 'Heritage',      inventoryItemId: null,    intel: intel({ fracGroup: '11' }) }),
      row({ name: 'Barricade 4FL', inventoryItemId: 'inv-B', intel: intel({ hracGroup: '3' }) }),
      row({ name: 'Mystery',       inventoryItemId: 'inv-M', intel: intel({ source: 'none' }) }),
    ]
    const history = [
      // Heritage matches by name; FRAC 11 group also matches.
      { id: 'h1', date: iso(7),  applicationName: 'Greens fungicide app',
        products: [{ name: 'Heritage' }] },
      // Barricade matches by inventoryItemId; HRAC 3 group matches.
      { id: 'h2', date: iso(13), applicationName: 'Pre-emergent app',
        products: [{ name: 'Barricade 4FL', inventoryItemId: 'inv-B' }] },
      // Unrelated, but introduces a missing-intel row.
      { id: 'h3', date: iso(20), applicationName: 'Mixed',
        products: [{ name: 'Junk' }] },
    ]

    const out = mod.buildSprayIntervalAwareness(currentRows, history, {
      now: NOW, lookbackDays: 45, maxMatches: 8, resolveProductIntel: resolver,
    })
    assert(out.lookbackDays === 45, 'lookbackDays carried through')
    assert(out.productMatches.length === 2, '2 product matches (Heritage + Barricade)', out.productMatches)
    const productByName = Object.fromEntries(out.productMatches.map(m => [m.productName, m]))
    assert(productByName['Heritage'].daysSince === 7,      'Heritage daysSince = 7')
    assert(productByName['Barricade 4FL'].daysSince === 13,'Barricade daysSince = 13')
    assert(out.productMatches[0].daysSince <= out.productMatches[1].daysSince,
      'product matches sorted by daysSince asc')
    assert(out.groupMatches.length === 2, '2 group matches (FRAC 11 + HRAC 3)', out.groupMatches)
    assert(out.missingHistoricalIntelCount === 1,
      'missing intel from h3 (Junk) counted = 1')

    // Notices — info for products, caution for groups, warning for missing.
    const types = out.notices.map(n => n.type)
    assert(types.includes('info') && types.includes('caution') && types.includes('warning'),
      'notice types include info + caution + warning')
    const noticeText = out.notices.map(n => `${n.label} ${n.value}`).join(' | ')
    assert(/Heritage was last recorded 7 days ago/.test(noticeText),
      'info notice: Heritage 7 days ago')
    assert(/Barricade 4FL was last recorded 13 days ago/.test(noticeText),
      'info notice: Barricade 13 days ago')
    assert(/FRAC 11 appeared 7 days ago/.test(noticeText),
      'caution notice: FRAC 11 7 days ago')
    assert(/HRAC 3 appeared 13 days ago/.test(noticeText),
      'caution notice: HRAC 3 13 days ago')
    assert(/1 historical product could not be evaluated/.test(noticeText),
      'warning notice: 1 missing historical product')
    assert(!/recommend|rotate to|safe|unsafe|do not apply|apply now/i.test(noticeText),
      'notices carry no recommendation phrasing')

    // maxMatches caps the lists.
    const small = mod.buildSprayIntervalAwareness(currentRows, history, {
      now: NOW, lookbackDays: 45, maxMatches: 1, resolveProductIntel: resolver,
    })
    assert(small.productMatches.length === 1, 'maxMatches=1 caps productMatches')
    assert(small.groupMatches.length === 1,   'maxMatches=1 caps groupMatches')
  }

  // ── "today" wording — daysSince === 0 ─────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const todayIso = new Date(NOW - 60_000).toISOString()    // 1 min ago
    const resolver = (p) => p.name === 'Heritage'
      ? intel({ fracGroup: '11' })
      : intel({ source: 'none' })
    const out = mod.buildSprayIntervalAwareness(
      [row({ name: 'Heritage', intel: intel({ fracGroup: '11' }) })],
      [{ id: 'a', date: todayIso, applicationName: 'Today', products: [{ name: 'Heritage' }] }],
      { now: NOW, lookbackDays: 45, resolveProductIntel: resolver },
    )
    assert(out.productMatches[0].daysSince === 0, 'daysSince = 0 for today')
    const noticeText = out.notices.map(n => `${n.label} ${n.value}`).join(' | ')
    assert(/Heritage was last recorded today/.test(noticeText),
      'info notice copy uses "today" when daysSince = 0')
    assert(/FRAC 11 appeared today/.test(noticeText),
      'caution notice copy uses "today" when daysSince = 0')
  }

  // ── Empty / null safety ───────────────────────────────────────────────
  {
    const empty = mod.buildSprayIntervalAwareness([], [], {})
    assert(empty.productMatches.length === 0 && empty.groupMatches.length === 0,
      'empty inputs → empty match lists')
    assert(empty.missingHistoricalIntelCount === 0, 'empty inputs → 0 missing')
    assert(empty.notices.length === 0, 'empty inputs → no notices')
    assert(empty.lookbackDays === 45, 'default lookbackDays = 45')

    const nullSafe = mod.buildSprayIntervalAwareness(null, null, null)
    assert(nullSafe.productMatches.length === 0, 'null inputs → empty match lists, no throw')
  }

  // ── Purity ────────────────────────────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const iso = d => new Date(NOW - d * 86_400_000).toISOString()
    const rows = [row({ name: 'Heritage', intel: intel({ fracGroup: '11' }) })]
    const history = [
      { id: 'h1', date: iso(7), applicationName: 'X', products: [{ name: 'Heritage' }] },
    ]
    const opts = { now: NOW, lookbackDays: 45, resolveProductIntel: () => intel({ fracGroup: '11' }) }

    const rowsBefore    = JSON.stringify(rows)
    const historyBefore = JSON.stringify(history)
    mod.buildSprayIntervalAwareness(rows, history, opts)
    mod.extractCurrentProducts(rows)
    mod.findRecentProductMatches([{ normalizedName: 'heritage' }], history, opts)
    mod.findRecentGroupMatches({ frac: ['11'] }, history, opts)
    assert(JSON.stringify(rows)    === rowsBefore,    'rows not mutated')
    assert(JSON.stringify(history) === historyBefore, 'history not mutated')
  }

  // ── Test seam sanity ─────────────────────────────────────────────────
  {
    assert(mod.__TEST.normalizeName('Barricade 4FL') === 'barricade-4fl',
      'normalizeName matches Phase 7C resolver semantics')
    assert(mod.__TEST.isValidDateLike('2026-05-21') === true, 'valid ISO date')
    assert(mod.__TEST.isValidDateLike('banana') === false,    'invalid string')
    assert(mod.__TEST.isUsableHistoricalSpray(
      { date: '2026-05-20', status: 'completed' }, Date.parse('2026-05-25T12:00:00Z')) === true,
      'in-the-past completed spray is usable')
    assert(mod.__TEST.isUsableHistoricalSpray(
      { date: '2026-05-20', status: 'deleted' }, Date.parse('2026-05-25T12:00:00Z')) === false,
      'soft-deleted spray rejected')
  }
}

// ── 3. BuildSpraySheet wiring + UI copy ────────────────────────────────────
console.log('— BuildSpraySheet wires Interval Awareness panel')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

  assert(/from\s+['"][^'"]*productCatalog\/sprayIntervalAwareness['"]/.test(src),
    'imports sprayIntervalAwareness helper')
  assert(/buildSprayIntervalAwareness\(/.test(src),
    'invokes buildSprayIntervalAwareness(...)')

  // Reuses the same catalog-first resolver closure.
  assert(/resolveProductIntel:\s*\([^)]*\)\s*=>\s*resolveSprayProductIntel\(/.test(src),
    'resolver closure wraps resolveSprayProductIntel (catalog-first reuse)')

  // useMemo deps complete.
  const memo = src.match(/intervalAwareness\s*=\s*useMemo\([\s\S]*?\}, \[[^\]]*\]\)/)?.[0] ?? ''
  for (const dep of ['enrichedRows', 'sprayHistory', 'inventoryProducts', 'catalogProducts', 'labelsByItemId']) {
    assert(memo.includes(dep), `intervalAwareness useMemo deps include ${dep}`)
  }

  // Panel rendered.
  assert(/<SummarySection\s+label=['"]Interval Awareness['"]/.test(src),
    'renders <SummarySection label="Interval Awareness">')
  assert(/<SprayIntervalAwarenessPanel\b/.test(src),
    'renders <SprayIntervalAwarenessPanel>')

  // Stewardship copy.
  const srcNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Read-only comparison against recent recorded applications',
    'Recent matches are shown for awareness only',
    'This does not recommend a treatment',
  ]) {
    assert(srcNorm.includes(phrase), `copy includes: "${phrase}"`)
  }

  // Forbidden recommendation phrasing in the JSX (comment-stripped scan).
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\brotate to\b/i.test(codeOnly),         'no "rotate to" copy')
  assert(!/\bdo not apply\b/i.test(codeOnly),      'no "do not apply" copy')
  assert(!/\bapply now\b/i.test(codeOnly),         'no "apply now" copy')
  assert(!/\bauto[- ]apply\b/i.test(codeOnly),     'no auto-apply CTA')
  assert(!/\bsafe\b|\bunsafe\b/i.test(codeOnly),   'no safe/unsafe copy')
  assert(!/\bsuggested\s+action\b/i.test(codeOnly),'no suggested-action copy')
}

// ── 4. Save payload unchanged ──────────────────────────────────────────────
console.log('— BuildSpraySheet save payload unchanged')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = src.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'save payload block found')
  assert(!/intelligence|recommendation|interval|rotation/i.test(payload),
    'save payload omits catalog/intelligence/interval/rotation keys',
    payload)
}

// ── 5. Forbidden-write invariants ──────────────────────────────────────────
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
}

// ── Result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
