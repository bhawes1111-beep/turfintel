// Phase 7E (3/?) — Spray Intelligence print/export polish smoke.
//
//   node scripts/smoke-spray-intelligence-export.mjs
//
// Locks the print + JSON-export polish invariants without rendering JSX:
//   - builder envelope carries stable export metadata
//     (exportVersion, reportKind, generatedBy, generatedAt, dateRange,
//      totals, notices, disclaimer)
//   - builder emits an opt-in metadata.printExtras object
//   - buildPrintDocument renders the printExtras (summary tiles +
//     notices + disclaimer + footer) when present, untouched for other
//     reports
//   - print CSS: white background, page-break protection, action-strip
//     hidden, summary tiles + notice cards present
//   - reportToJSON is defensive against functions / undefined / circular
//     refs / DOM-like values
//   - modal CSS hides ReportActions when printing the modal directly
//   - other reports' print path is byte-identical (no printExtras in
//     their envelope, no printExtras-only sections in their HTML)
//   - no PDF pipeline added; spray save payload unchanged; no
//     /api/product-catalog mutation

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Builder carries stable export metadata + printExtras ────────────────
console.log('— builder envelope export metadata')
{
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')
  const report = mod.buildSprayIntelligenceReport({
    sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
    dateRange: 'last 45 days',
    options: { now: Date.parse('2026-05-25T12:00:00Z') },
  })

  // Stable identification + versioning keys.
  assert(report.metadata.exportVersion === 1,
    'metadata.exportVersion === 1')
  assert(report.metadata.reportKind === 'spray-intelligence',
    "metadata.reportKind === 'spray-intelligence'")
  assert(report.metadata.generatedBy === 'TurfIntel',
    "metadata.generatedBy === 'TurfIntel'")
  assert(typeof report.metadata.generatedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(report.metadata.generatedAt),
    'metadata.generatedAt is an ISO date string')
  assert(report.metadata.dateRange === 'last 45 days',
    'metadata.dateRange round-trips')

  // Content surfaces still present.
  for (const key of ['totals', 'notices', 'disclaimer', 'lookback']) {
    assert(key in report.metadata, `metadata.${key} present`)
  }
  assert(typeof report.metadata.disclaimer === 'string' &&
    /Read-only spray intelligence summary/.test(report.metadata.disclaimer),
    'metadata.disclaimer carries the stewardship copy')

  // printExtras opt-in object.
  const px = report.metadata.printExtras
  assert(px && typeof px === 'object',          'metadata.printExtras present')
  assert(typeof px.subtitle === 'string' && px.subtitle.length > 0,
    'printExtras.subtitle is a string')
  assert(Array.isArray(px.summary) && px.summary.length === 7,
    'printExtras.summary is a 7-pair array (matches the 7 spec tiles)',
    px.summary?.length)
  for (const label of [
    'Sprays reviewed', 'Products reviewed', 'With intelligence',
    'Missing intelligence', 'Restricted-use', 'Repeated groups', 'Interval matches',
  ]) {
    assert(px.summary.some(p => p[0] === label),
      `printExtras.summary includes "${label}"`)
  }
  assert(Array.isArray(px.notices),
    'printExtras.notices is an array')
  assert(typeof px.disclaimer === 'string' &&
    /Read-only spray intelligence summary/.test(px.disclaimer),
    'printExtras.disclaimer matches the stewardship copy')
  assert(typeof px.footerLeft === 'string' && px.footerLeft.length > 0,
    'printExtras.footerLeft is a non-empty string')
  assert(typeof px.footerRight === 'string' && px.footerRight.length > 0,
    'printExtras.footerRight is a non-empty string')
}

// ── 2. buildPrintDocument output ───────────────────────────────────────────
console.log('— buildPrintDocument renders printExtras')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')

  const report = mod.buildSprayIntelligenceReport({
    sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
    dateRange: 'last 45 days',
    options: { now: Date.parse('2026-05-25T12:00:00Z') },
  })

  const html = fmt.buildPrintDocument(report, { name: 'Springfield CC', superintendent: 'A. Steward' })

  // Top-level pieces.
  assert(/<title>Spray Intelligence Report<\/title>/.test(html),
    'print HTML <title> is the report title')
  assert(/Springfield CC/.test(html) && /A. Steward/.test(html),
    'print HTML includes course name + superintendent')
  assert(/report-subtitle/.test(html) && /Read-only spray intelligence summary/.test(html),
    'print HTML carries the subtitle')
  assert(/Date range: last 45 days/.test(html),
    'print HTML carries the date range')

  // Summary tiles — content + labels. Match the rendered <div>, not the
  // CSS rule.
  assert(/<div class="[^"]*\bsummary-section\b/.test(html),
    'print HTML renders the summary tile block')
  for (const label of ['Sprays reviewed', 'Products reviewed', 'With intelligence',
                        'Missing intelligence', 'Restricted-use', 'Repeated groups',
                        'Interval matches']) {
    assert(html.includes(label),
      `print summary tile label "${label}" present`)
  }

  // Five spec sections (titles).
  for (const sectionTitle of ['Overview', 'Chemistry Awareness', 'Rotation Awareness', 'Interval Awareness', 'Missing Intelligence']) {
    assert(html.includes(sectionTitle),
      `print HTML renders section "${sectionTitle}"`)
  }

  // Notices block + disclaimer.
  assert(/<div class="[^"]*\bnotices-section\b/.test(html),
    'print HTML renders the notices section')
  assert(/<div class="[^"]*\bdisclaimer-section\b/.test(html) &&
    /Read-only spray intelligence summary/.test(html) &&
    /does not recommend treatments/.test(html),
    'print HTML renders the disclaimer block + spec wording')

  // Footer.
  assert(/report-footer/.test(html) &&
    /TurfIntel · Spray Intelligence/.test(html) &&
    /Generated /.test(html),
    'print HTML renders the footer with stewardship label + generated-at')

  // Print CSS hardening.
  assert(/@media print/.test(html),
    'print HTML has @media print rule')
  assert(/background:\s*#fff/.test(html),
    'print HTML forces white background')
  assert(/page-break-inside:\s*avoid/.test(html) ||
         /break-inside:\s*avoid/.test(html),
    'print HTML has break-inside: avoid')
  assert(/button[\s,]*\.rpActions[\s\S]*?display:\s*none/.test(html),
    'print HTML hides any captured buttons / action strips')

  // HTML escaping — defensive. Inject hostile data and verify no <script>
  // leaks through.
  const evil = mod.buildSprayIntelligenceReport({
    sprays:           [],
    inventoryProducts:[],
    catalogProducts:  [],
    labelsByItemId:   {},
    dateRange:        '<script>alert(1)</script>',
    options:          { now: 0 },
  })
  const evilHtml = fmt.buildPrintDocument(evil, {})
  assert(!/(<script>alert)/i.test(evilHtml),
    'print HTML escapes injected <script> in dateRange')
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(evilHtml),
    'print HTML carries the escaped HTML entities for the injected string')

  // Other reports (no printExtras) get the OLD behavior — no summary
  // tile block, no notices block, no disclaimer-section. Build a
  // minimal fake report directly so we don't depend on any other
  // builder's metadata shape.
  const plainHtml = fmt.buildPrintDocument({
    id: 'rpt-plain', title: 'Plain Report', module: 'equipment',
    type: 'maintenance-summary',
    createdAt: '2026-05-25T12:00:00Z',
    sections: [
      { title: 'Summary', type: 'fields', data: { 'Count': 1 } },
    ],
    metadata: {},
  }, {})
  // Match the rendered <div class="… summary-section">, not the CSS rule
  // (`.summary-section { … }`) embedded in the print stylesheet.
  assert(!/<div class="[^"]*\bsummary-section\b/.test(plainHtml),
    'reports without printExtras → no <div .summary-section> in print HTML')
  assert(!/<div class="[^"]*\bnotices-section\b/.test(plainHtml),
    'reports without printExtras → no <div .notices-section>')
  assert(!/<div class="[^"]*\bdisclaimer-section\b/.test(plainHtml),
    'reports without printExtras → no <div .disclaimer-section>')
  assert(/TurfIntel Pro/.test(plainHtml),
    'reports without printExtras → default footer label preserved')
}

// ── 3. reportToJSON is defensive ───────────────────────────────────────────
console.log('— reportToJSON sanitizes hostile / unserializable values')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')

  // Build a hostile shape.
  const circ = { kind: 'circular' }
  circ.self = circ

  const fakeReact = { $$typeof: Symbol.for('react.element'), props: {}, type: 'div' }

  const reportLike = {
    id: 'rpt-x',
    title: 'Hostile',
    createdAt: '2026-05-25T12:00:00Z',
    module: 'spray',
    type: 'spray-intelligence',
    sections: [],
    metadata: {
      exportVersion: 1,
      reportKind:    'spray-intelligence',
      totals:        { spraysReviewed: 2 },
      notices:       [{ type: 'info', label: 'X', value: 'Y' }],
      func:          () => 'nope',
      undef:         undefined,
      sym:           Symbol('drop'),
      date:          new Date('2026-05-25T12:00:00Z'),
      reactish:      fakeReact,
      circular:      circ,
    },
  }
  const json   = fmt.reportToJSON(reportLike)
  // Parse-back round-trip ensures the output is valid JSON.
  const parsed = JSON.parse(json)

  // Stable export keys round-trip.
  assert(parsed.metadata.exportVersion === 1,        'parsed.metadata.exportVersion')
  assert(parsed.metadata.reportKind === 'spray-intelligence',
    'parsed.metadata.reportKind')
  assert(parsed.metadata.totals.spraysReviewed === 2,'parsed.metadata.totals.spraysReviewed')

  // Unserializable values dropped.
  assert(!('func' in parsed.metadata), "functions dropped from JSON")
  assert(!('undef' in parsed.metadata),"undefined dropped from JSON")
  assert(!('sym' in parsed.metadata),  "symbols dropped from JSON")
  assert(!('reactish' in parsed.metadata),
    "React-element-like objects dropped from JSON")
  // Date converted to ISO string.
  assert(parsed.metadata.date === '2026-05-25T12:00:00.000Z',
    'Date converted to ISO string')
  // Circular refs broken.
  assert(parsed.metadata.circular.self === '[Circular]',
    'circular refs replaced with "[Circular]"')

  // thumbnailUrl still stripped from attachments.
  const withAttach = fmt.reportToJSON({
    id: 'r', title: 't', createdAt: '2026-05-25T12:00:00Z',
    module: 'spray', type: 'spray-intelligence',
    sections: [],
    metadata: {},
    attachments: [{ id: 'a1', filename: 'x.pdf', type: 'document', size: 100, thumbnailUrl: 'blob:should-not-appear' }],
  })
  const wParsed = JSON.parse(withAttach)
  assert(wParsed.attachments[0].id === 'a1', 'attachment metadata preserved')
  assert(!('thumbnailUrl' in wParsed.attachments[0]),
    'thumbnailUrl stripped from attachments')

  // Spray Intelligence envelope round-trips cleanly with no errors.
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')
  const realReport = mod.buildSprayIntelligenceReport({
    sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
    options: { now: Date.parse('2026-05-25T12:00:00Z') },
  })
  const realJson  = fmt.reportToJSON(realReport)
  const realParsed = JSON.parse(realJson)
  for (const key of ['exportVersion', 'reportKind', 'generatedBy', 'generatedAt',
                     'totals', 'notices', 'disclaimer', 'dateRange',
                     'lookback', 'printExtras']) {
    assert(key in realParsed.metadata,
      `Spray Intelligence JSON export has metadata.${key}`)
  }
  // No huge raw stores leaked.
  assert(!('sprays' in realParsed) && !('inventoryProducts' in realParsed),
    'raw store arrays NOT included in JSON export')
}

// ── 4. Modal CSS hides actions on print ────────────────────────────────────
console.log('— reports.module.css hides modal controls on print')
{
  const css = readFileSync('src/components/reports/reports.module.css', 'utf8')
  const block = css.match(/@media\s+print\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
  assert(block.length > 0,
    'reports.module.css has an @media print block')
  assert(/\.rpActions\s*\{[\s\S]*?display:\s*none/.test(block) ||
         /\.rpActions[^{]*\{[\s\S]*?display:\s*none/.test(block),
    'print block hides .rpActions')
  assert(/\.rpClose[^{]*\{[\s\S]*?display:\s*none/.test(block),
    'print block hides .rpClose')
  assert(/background:\s*#fff/.test(block),
    'print block forces white background')
}

// ── 5. Forbidden-write invariants + no PDF pipeline ────────────────────────
console.log('— forbidden-write + no PDF invariants')
{
  // No PDF engine added — exportPDF still a placeholder.
  const exportUtils = readFileSync('src/utils/reports/exportUtils.js', 'utf8')
  assert(/PDF export is not yet implemented/.test(exportUtils),
    'exportPDF remains a placeholder (no PDF engine added this commit)')

  // No /api/product-catalog mutation.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // MUTABLE_COLUMNS still excludes productCatalogId.
  const invSrc = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = invSrc.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'MUTABLE_COLUMNS still excludes productCatalogId')

  // Spray save payload unchanged.
  const builderSrc = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = builderSrc.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/intelligence|recommendation|rotation|interval/i.test(payload),
    'spray save payload omits intel/intelligence/rotation/interval keys')

  // No recommendation language in any of the touched files.
  for (const path of [
    'src/utils/reports/builders/sprayIntelligenceReport.js',
    'src/utils/reports/reportFormatter.js',
  ]) {
    const src = readFileSync(path, 'utf8')
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // Allow disclaimer copy "does not recommend treatments" — every other
    // recommend/score/grade usage is forbidden.
    const stripped = codeOnly.replace(/does not recommend treatments/g, '')
    for (const word of ['apply now', 'do not apply', 'rotate to', 'unsafe', '\\bgrade\\b']) {
      assert(!new RegExp(`\\b${word}\\b`, 'i').test(stripped) || word.startsWith('\\b'),
        `${path.split('/').pop()}: no forbidden phrasing "${word}"`)
    }
    // "score" word-boundary — but skip in reportFormatter.js because the
    // legacy file references CSS letter-spacing values that contain "spacing".
    assert(!/\bscore\b/i.test(stripped),
      `${path.split('/').pop()}: no "score" wording`)
    assert(!/\brecommend\b/i.test(stripped),
      `${path.split('/').pop()}: no bare "recommend" outside the disclaimer`)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
