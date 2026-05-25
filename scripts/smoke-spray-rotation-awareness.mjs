// Phase 7D (2/?) — Spray Rotation Awareness smoke.
//
//   node scripts/smoke-spray-rotation-awareness.mjs
//
// Pure-helper unit-style assertions + BuildSpraySheet source contracts.
// Locks the awareness-only invariants:
//   - no recommendation phrasing in helper or panel
//   - no fetch / store / React imports in helper
//   - inputs not mutated
//   - lookbackDays + maxHistoryItems honored
//   - invalid / missing dates do not throw and do not appear in history
//   - soft-deleted records are excluded
//   - missing historical intelligence counted (not guessed)
//   - save payload unchanged
//   - no /api/product-catalog mutation route added

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Source contracts ────────────────────────────────────────────────────
console.log('— src/utils/productCatalog/sprayRotationAwareness.js (source)')
{
  const src = readFileSync('src/utils/productCatalog/sprayRotationAwareness.js', 'utf8')

  for (const name of [
    'buildSprayRotationAwareness',
    'extractGroupsFromRows',
    'extractGroupsFromHistoricalSpray',
    'findRepeatedGroups',
    'summarizeRecentGroupExposure',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Purity invariants — code-only scan so comments can discuss what we
  // explicitly do not import.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/from\s+['"]react['"]/.test(codeOnly),
    'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),
    'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper does not issue mutations')

  // No recommendation language anywhere in code (comments allowed —
  // file legitimately explains what it does NOT do).
  assert(!/\b(rotate to|safe|unsafe|apply now|do not apply|recommend|recommendation|suggested action)\b/i.test(codeOnly),
    'no recommendation language in helper code')
}

// ── 2. Helper behavior ────────────────────────────────────────────────────
console.log('— helper behavior')
{
  const mod = await import('../src/utils/productCatalog/sprayRotationAwareness.js')

  // Intel factory mirroring resolveSprayProductIntel's shape.
  const intel = (over = {}) => ({
    source: 'catalog', catalogId: null, category: null,
    fracGroup: null, hracGroup: null, iracGroup: null, pgrClass: null,
    signalWord: null, reiHours: null, phiHours: null,
    restrictedUse: false, activeIngredientSummary: null,
    rates: [], labelUrl: null, ...over,
  })
  const row = (name, intelOver) => ({ id: name, name, inventoryItemId: name, intel: intel(intelOver) })

  // ── extractGroupsFromRows ─────────────────────────────────────────────
  {
    const rows = [
      row('A', { fracGroup: '11' }),
      row('B', { fracGroup: '3, 11', hracGroup: '5' }),   // comma-split
      row('C', { iracGroup: '3A' }),
      row('D', { pgrClass: 'GA inhibitor' }),
      row('E', { pgrClass: 'GA inhibitor' }),             // dup
      { id: 'F', name: 'F' /* no intel */ },
    ]
    const g = mod.extractGroupsFromRows(rows)
    assert(JSON.stringify(g.frac) === JSON.stringify(['3', '11']),
      'FRAC dedupes + comma-split + numeric sort', g.frac)
    assert(JSON.stringify(g.hrac) === JSON.stringify(['5']),  'HRAC distinct')
    assert(JSON.stringify(g.irac) === JSON.stringify(['3A']), 'IRAC distinct')
    assert(JSON.stringify(g.pgr)  === JSON.stringify(['GA inhibitor']),
      'PGR dedupe class names')

    // Defensive: null/undefined/empty rows produce empty result, never throw.
    assert(JSON.stringify(mod.extractGroupsFromRows([])) ===
      JSON.stringify({ frac:[], hrac:[], irac:[], pgr:[] }),
      'empty rows → empty groups')
    assert(JSON.stringify(mod.extractGroupsFromRows(null)) ===
      JSON.stringify({ frac:[], hrac:[], irac:[], pgr:[] }),
      'null rows → empty groups')
  }

  // ── extractGroupsFromHistoricalSpray ──────────────────────────────────
  {
    const resolver = (p) => {
      if (p.name === 'Tenacity')   return intel({ source: 'catalog', hracGroup: '27' })
      if (p.name === 'Heritage')   return intel({ source: 'catalog', fracGroup: '11' })
      if (p.name === 'PrivateLbl') return intel({ source: 'label', fracGroup: '7' })
      return intel({ source: 'none' })   // unresolved
    }

    const spray = {
      id: 's-1', date: '2026-05-10', applicationName: 'Test',
      products: [
        { name: 'Tenacity' }, { name: 'Heritage' },
        { name: 'PrivateLbl' }, { name: 'Unknown Foo' },
      ],
    }
    const out = mod.extractGroupsFromHistoricalSpray(spray, resolver)
    assert(JSON.stringify(out.groups.frac) === JSON.stringify(['7', '11']),
      'FRAC from history dedupes + sorts (Heritage 11 + PrivateLbl 7)', out.groups.frac)
    assert(JSON.stringify(out.groups.hrac) === JSON.stringify(['27']),
      'HRAC from history (Tenacity)')
    assert(out.missingIntelCount === 1,
      'missingIntelCount = 1 (Unknown Foo unresolved)')

    // No resolver → every product is missing intel; no groups.
    const noResolver = mod.extractGroupsFromHistoricalSpray(spray, undefined)
    assert(noResolver.missingIntelCount === 4,
      'no resolver → every product counted as missing intel')
    assert(noResolver.groups.frac.length === 0, 'no resolver → no FRAC groups')

    // Bad resolver (throws) doesn't crash; just counts missing.
    const throwResolver = () => { throw new Error('boom') }
    const bad = mod.extractGroupsFromHistoricalSpray(spray, throwResolver)
    assert(bad.missingIntelCount === 4, 'throwing resolver does not throw out of helper')

    // Empty / null spray
    const empty = mod.extractGroupsFromHistoricalSpray({}, resolver)
    assert(empty.missingIntelCount === 0 &&
      empty.groups.frac.length === 0,
      'spray with no products → 0 missing, no groups')
    const nullSpray = mod.extractGroupsFromHistoricalSpray(null, resolver)
    assert(nullSpray.missingIntelCount === 0, 'null spray → 0 missing, no throw')
  }

  // ── findRepeatedGroups ─────────────────────────────────────────────────
  {
    const current = { frac: ['11'], hrac: ['27'], irac: [], pgr: [] }
    const history = [
      { groups: { frac: ['11'],     hrac: [], irac: ['3A'], pgr: [] } },
      { groups: { frac: ['3', '4'], hrac: [], irac: [],     pgr: [] } },
    ]
    const r = mod.findRepeatedGroups(current, history)
    assert(JSON.stringify(r.frac) === JSON.stringify(['11']),
      'repeated FRAC: today\'s 11 matches history')
    assert(r.hrac.length === 0,        "today's HRAC 27 not in history → no repeat")
    assert(r.irac.length === 0,        "history's IRAC 3A not in today → no repeat")
    assert(r.pgr.length === 0,         'no PGR repeat')

    // Defensive: missing groups field on history items doesn't throw.
    const safe = mod.findRepeatedGroups(current, [{}, null, { groups: null }])
    assert(safe.frac.length === 0, 'history with missing groups field → no repeat, no throw')
  }

  // ── summarizeRecentGroupExposure ──────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const day = d => 86_400_000 * d
    const iso = daysAgo => new Date(NOW - day(daysAgo)).toISOString()

    const resolver = (p) => {
      if (p.name === 'Tenacity') return intel({ source: 'catalog', hracGroup: '27' })
      if (p.name === 'Heritage') return intel({ source: 'catalog', fracGroup: '11' })
      return intel({ source: 'none' })
    }

    const sprays = [
      { id: 'r1', date: iso(5),     applicationName: 'Recent fungicide', products: [{ name: 'Heritage' }] },
      { id: 'r2', date: iso(20),    applicationName: 'PRE app',           products: [{ name: 'Tenacity' }, { name: 'Some Unknown' }] },
      { id: 'r3', date: iso(45),    applicationName: 'Old (outside 30d)', products: [{ name: 'Heritage' }] },
      { id: 'r4', date: 'not-a-date', applicationName: 'Bad date',        products: [{ name: 'Heritage' }] },
      { id: 'r5', date: iso(2),     applicationName: 'Deleted', status: 'deleted', products: [{ name: 'Heritage' }] },
      { id: 'r6', date: iso(1),     applicationName: 'Soft-deleted', deletedAt: '2026-05-25T00:00:00Z', products: [{ name: 'Heritage' }] },
      { id: 'r7', date: iso(-1),    applicationName: 'Future',           products: [{ name: 'Heritage' }] }, // future
      null,
    ]

    const out = mod.summarizeRecentGroupExposure(sprays, {
      now: NOW, lookbackDays: 30, maxHistoryItems: 10, resolveProductIntel: resolver,
    })
    const ids = out.entries.map(e => e.id)
    assert(JSON.stringify(ids) === JSON.stringify(['r1', 'r2']),
      'window contains only r1 + r2 (in-range, valid date, not deleted, not future)', ids)
    assert(out.entries[0].id === 'r1',
      'newest-first sort (r1 day 5 before r2 day 20)')
    assert(out.missingHistoricalIntelCount === 1,
      'missingHistoricalIntelCount = 1 (Some Unknown from r2)')
    assert(out.entries[1].missingIntelCount === 1,
      'r2 carries its missingIntelCount = 1 inline')

    // maxHistoryItems trims newest-first.
    const trimmed = mod.summarizeRecentGroupExposure(sprays, {
      now: NOW, lookbackDays: 30, maxHistoryItems: 1, resolveProductIntel: resolver,
    })
    assert(trimmed.entries.length === 1 && trimmed.entries[0].id === 'r1',
      'maxHistoryItems=1 keeps the newest only')

    // Invalid lookbackDays falls back to 30.
    const oddOpts = mod.summarizeRecentGroupExposure(sprays, {
      now: NOW, lookbackDays: 'bogus', resolveProductIntel: resolver,
    })
    assert(oddOpts.entries.length === 2, 'invalid lookbackDays falls back to 30')

    // Empty inputs.
    const empty = mod.summarizeRecentGroupExposure([], { now: NOW })
    assert(empty.entries.length === 0 && empty.missingHistoricalIntelCount === 0,
      'empty history → empty entries, 0 missing')
  }

  // ── buildSprayRotationAwareness end-to-end ────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const iso = daysAgo => new Date(NOW - daysAgo * 86_400_000).toISOString()

    const resolver = (p) => {
      if (p.name === 'Tenacity') return intel({ source: 'catalog', hracGroup: '27' })
      if (p.name === 'Heritage') return intel({ source: 'catalog', fracGroup: '11' })
      return intel({ source: 'none' })
    }

    // Today's tank: Heritage (FRAC 11) + an unresolved row.
    const currentRows = [
      row('Heritage', { source: 'catalog', fracGroup: '11' }),
      row('Mystery',  { source: 'none' }),
    ]
    const history = [
      { id: 'h1', date: iso(5),  applicationName: 'Last week fungicide', products: [{ name: 'Heritage' }] },
      { id: 'h2', date: iso(15), applicationName: 'Two weeks ago',       products: [{ name: 'Tenacity' }] },
    ]

    const out = mod.buildSprayRotationAwareness(currentRows, history, {
      now: NOW, lookbackDays: 30, maxHistoryItems: 10, resolveProductIntel: resolver,
    })

    assert(out.lookbackDays === 30, 'lookbackDays carried through')
    assert(JSON.stringify(out.currentGroups.frac) === JSON.stringify(['11']),
      'currentGroups.frac → [11]')
    assert(JSON.stringify(out.repeatedGroups.frac) === JSON.stringify(['11']),
      'repeatedGroups.frac → [11] (h1 used Heritage)')
    assert(out.repeatedGroups.hrac.length === 0,
      'HRAC 27 in history but not in today → no repeat')
    assert(out.recentExposure.length === 2, 'recentExposure has 2 entries')
    assert(out.missingHistoricalIntelCount === 0,
      'no missing historical intel in this fixture')

    // Notices: caution for repeated FRAC, info for recent count.
    const labels = out.notices.map(n => n.label)
    assert(out.notices.some(n => n.type === 'caution' && /Repeated FRAC/.test(n.label)
            && /FRAC 11.*recent spray history/.test(n.value)),
      'caution notice: Repeated FRAC')
    assert(out.notices.some(n => n.type === 'info' && /Recent chemistry history/.test(n.label)
            && /2 prior sprays reviewed/.test(n.value)),
      'info notice: 2 prior sprays reviewed')
    // No recommendation language in notices.
    const allText = out.notices.map(n => `${n.label} ${n.value}`).join(' | ')
    assert(!/recommend|rotate to|safe|unsafe|do not apply|apply now/i.test(allText),
      'notices contain no recommendation phrasing', allText)
  }

  // ── Empty recent history → "no sprays" info notice ────────────────────
  {
    const out = mod.buildSprayRotationAwareness([row('Heritage', { fracGroup: '11' })], [], {})
    assert(out.notices.some(n => /No saved sprays in the last/i.test(n.value)),
      'empty history → info notice "No saved sprays in the last N days"')
  }

  // ── Missing-history-intel notice ──────────────────────────────────────
  {
    const NOW = Date.parse('2026-05-25T12:00:00Z')
    const iso = d => new Date(NOW - d * 86_400_000).toISOString()
    const out = mod.buildSprayRotationAwareness(
      [row('Heritage', { fracGroup: '11' })],
      [{ id: 'x', date: iso(5), applicationName: 'mystery', products: [{ name: 'Unknown' }, { name: 'Other' }] }],
      { now: NOW, resolveProductIntel: () => ({ source: 'none' }) },
    )
    assert(out.missingHistoricalIntelCount === 2,
      'unresolved historical products counted as missing intel')
    assert(out.notices.some(n => n.type === 'warning' &&
            /Missing historical intelligence/.test(n.label) &&
            /2 historical products/.test(n.value)),
      'warning notice: Missing historical intelligence')
  }

  // ── Purity: helper never mutates rows / history / options ─────────────
  {
    const rows = [row('Heritage', { fracGroup: '11' })]
    const history = [{
      id: 'h1', date: '2026-05-20',
      applicationName: 'X', products: [{ name: 'Heritage' }],
    }]
    const opts = { lookbackDays: 30, maxHistoryItems: 5, resolveProductIntel: () => intel({ fracGroup: '11' }) }
    const rowsBefore    = JSON.stringify(rows)
    const historyBefore = JSON.stringify(history)

    mod.buildSprayRotationAwareness(rows, history, opts)
    mod.extractGroupsFromRows(rows)
    mod.extractGroupsFromHistoricalSpray(history[0], opts.resolveProductIntel)
    mod.findRepeatedGroups({ frac: ['11'] }, [{ groups: { frac: ['11'] } }])
    mod.summarizeRecentGroupExposure(history, opts)

    assert(JSON.stringify(rows)    === rowsBefore,    'rows not mutated')
    assert(JSON.stringify(history) === historyBefore, 'history not mutated')
  }

  // ── Test seam sanity ──────────────────────────────────────────────────
  {
    assert(mod.__TEST.isValidDateLike('2026-05-21') === true, 'isValidDateLike ISO date')
    assert(mod.__TEST.isValidDateLike('') === false,           'isValidDateLike empty')
    assert(mod.__TEST.isValidDateLike(null) === false,         'isValidDateLike null')
    assert(mod.__TEST.isValidDateLike('not-a-date') === false, 'isValidDateLike non-date')
    assert(JSON.stringify(mod.__TEST.splitGroups('3, 11, M5')) === JSON.stringify(['3','11','M5']),
      'splitGroups comma-split + trim')
    assert(mod.__TEST.splitGroups(null).length === 0, 'splitGroups null → []')
  }
}

// ── 3. BuildSpraySheet wiring + UI copy ────────────────────────────────────
console.log('— BuildSpraySheet wires Rotation Awareness panel')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

  assert(/from\s+['"][^'"]*productCatalog\/sprayRotationAwareness['"]/.test(src),
    'imports sprayRotationAwareness helper')
  assert(/buildSprayRotationAwareness\(/.test(src),
    'invokes buildSprayRotationAwareness(...)')

  // The injected resolver is the catalog-first resolver from Phase 7C.1/6.
  assert(/resolveProductIntel:\s*\([^)]*\)\s*=>\s*resolveSprayProductIntel\(/.test(src),
    'resolver closure wraps resolveSprayProductIntel (catalog-first reuse)')

  // useMemo deps include sprayHistory + inventoryProducts + catalogProducts + labelsByItemId.
  const memo = src.match(/rotationAwareness\s*=\s*useMemo\([\s\S]*?\}, \[[^\]]*\]\)/)?.[0] ?? ''
  for (const dep of ['enrichedRows', 'sprayHistory', 'inventoryProducts', 'catalogProducts', 'labelsByItemId']) {
    assert(memo.includes(dep), `rotationAwareness useMemo deps include ${dep}`)
  }

  // Panel rendered.
  assert(/<SummarySection\s+label=['"]Rotation Awareness['"]/.test(src),
    'renders <SummarySection label="Rotation Awareness">')
  assert(/<SprayRotationAwarenessPanel\b/.test(src),
    'renders <SprayRotationAwarenessPanel>')

  // Stewardship copy.
  const srcNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Read-only comparison against recent spray history',
    'Repeated groups are shown for awareness only',
    'This does not recommend a treatment',
  ]) {
    assert(srcNorm.includes(phrase), `copy includes: "${phrase}"`)
  }

  // No recommendation phrasing in the panel.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\brotate to\b/i.test(codeOnly),     'no "rotate to" copy')
  assert(!/\bdo not apply\b/i.test(codeOnly),  'no "do not apply" copy')
  assert(!/\bapply now\b/i.test(codeOnly),     'no "apply now" copy')
  assert(!/\bauto[- ]rotate\b/i.test(codeOnly),'no auto-rotate CTA')
  assert(!/\bsuggested\s+action\b/i.test(codeOnly), 'no suggested-action copy')
}

// ── 4. Save payload unchanged ──────────────────────────────────────────────
console.log('— BuildSpraySheet save payload still unchanged')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = src.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation/i.test(payload),
    'save payload omits catalog/intelligence/rotation keys',
    payload)
}

// ── 5. Forbidden-write invariants still hold ───────────────────────────────
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
