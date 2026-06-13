// Phase 7G (3/?) — Spray Program print/export polish smoke.
//
//   node scripts/smoke-spray-program-export.mjs
//
// Locks the print + JSON-export polish invariants:
//   - builder envelope carries every stable export metadata key
//     (exportVersion, reportKind, generatedBy, generatedAt, dateRange,
//      totals, notices, disclaimer)
//   - builder emits the spec'd metadata.printExtras object with all
//     8 summary pairs in the right order
//   - buildPrintDocument renders the printExtras for this report
//     (subtitle + summary tiles + notices + disclaimer + footer)
//     untouched for reports that don't carry printExtras
//   - reportToJSON round-trips cleanly (functions / undefined /
//     symbols / Date / circulars / React-elementish all sanitized)
//   - no PDF pipeline added; no /api/product-catalog mutation route;
//     no completed-spray mutation; no inventory deduction; spray save
//     payload byte-identical

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Builder carries stable export metadata + printExtras ───────────────
console.log('— Spray Program envelope: export metadata')
{
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')
  const report = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  // Stable identification + versioning keys.
  assert(report.metadata.exportVersion === 1,
    'metadata.exportVersion === 1')
  assert(report.metadata.reportKind === 'spray-program',
    "metadata.reportKind === 'spray-program'")
  assert(report.metadata.generatedBy === 'TurfIntel',
    "metadata.generatedBy === 'TurfIntel'")
  assert(typeof report.metadata.generatedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(report.metadata.generatedAt),
    'metadata.generatedAt is an ISO date string')
  assert(report.metadata.dateRange === 'May–June 2026',
    'metadata.dateRange round-trips')

  // Content surfaces still present (Phase 7G/1 regression guard).
  for (const key of ['totals', 'notices', 'disclaimer']) {
    assert(key in report.metadata, `metadata.${key} present`)
  }
  assert(typeof report.metadata.disclaimer === 'string' &&
    /Read-only spray program summary/.test(report.metadata.disclaimer) &&
    /does not recommend treatments/.test(report.metadata.disclaimer),
    'metadata.disclaimer carries the four-line stewardship copy')

  // printExtras opt-in object.
  const px = report.metadata.printExtras
  assert(px && typeof px === 'object',          'metadata.printExtras present')
  assert(typeof px.subtitle === 'string' && px.subtitle.length > 0,
    'printExtras.subtitle is a non-empty string')
  assert(px.subtitle === 'Read-only spray program summary',
    'printExtras.subtitle = "Read-only spray program summary"')

  // Eight summary pairs in declared order.
  assert(Array.isArray(px.summary) && px.summary.length === 8,
    'printExtras.summary is an 8-pair array', px.summary?.length)
  const expectedOrder = [
    'Programs reviewed', 'Planned items', 'Linked completed',
    'Unlinked planned', 'Completed status', 'Skipped',
    'Canceled', 'Missing or stale links',
  ]
  for (let i = 0; i < expectedOrder.length; i++) {
    assert(px.summary[i]?.[0] === expectedOrder[i],
      `printExtras.summary[${i}] label === "${expectedOrder[i]}"`,
      px.summary[i])
  }
  // Each pair has a numeric value (no nulls or stringified counts).
  for (const pair of px.summary) {
    assert(typeof pair[1] === 'number',
      `summary pair "${pair[0]}" has a numeric value`,
      pair)
  }

  assert(Array.isArray(px.notices),
    'printExtras.notices is an array')
  assert(typeof px.disclaimer === 'string' &&
    /Read-only spray program summary/.test(px.disclaimer),
    'printExtras.disclaimer matches the stewardship copy')
  assert(typeof px.footerLeft === 'string' && px.footerLeft === 'TurfIntel · Spray Program',
    'printExtras.footerLeft === "TurfIntel · Spray Program"')
  assert(typeof px.footerRight === 'string' && /^Generated /.test(px.footerRight),
    'printExtras.footerRight starts with "Generated " + ISO date')

  // No functions / DOM refs / React elements in any printExtras leaf.
  function isClean(v) {
    if (v === null) return true
    if (Array.isArray(v)) return v.every(isClean)
    if (typeof v === 'object') {
      if (v.$$typeof !== undefined) return false
      return Object.values(v).every(isClean)
    }
    return ['string', 'number', 'boolean'].includes(typeof v)
  }
  assert(isClean(px),
    'printExtras leaves are all JSON-safe (no functions / Reactish / DOM)')
}

// ── 2. buildPrintDocument output ──────────────────────────────────────────
console.log('— buildPrintDocument renders Spray Program printExtras')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')

  const report = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  const html = fmt.buildPrintDocument(report,
    { name: 'Springfield CC', superintendent: 'A. Steward' })

  // Top-level pieces.
  assert(/<title>Spray Program Report<\/title>/.test(html),
    'print HTML <title> is the report title')
  assert(/Springfield CC/.test(html) && /A. Steward/.test(html),
    'print HTML includes course branding')
  assert(/report-subtitle/.test(html) &&
    /Read-only spray program summary/.test(html),
    'print HTML carries the subtitle')
  assert(/Date range: May–June 2026/.test(html),
    'print HTML carries the date range')

  // Summary tile block — rendered <div>, not the CSS rule.
  assert(/<div class="[^"]*\bsummary-section\b/.test(html),
    'print HTML renders the summary tile block')
  for (const label of [
    'Programs reviewed', 'Planned items', 'Linked completed',
    'Unlinked planned', 'Completed status', 'Skipped',
    'Canceled', 'Missing or stale links',
  ]) {
    assert(html.includes(label),
      `summary tile label "${label}" present in print HTML`)
  }

  // All five spec sections.
  for (const sectionTitle of [
    'Overview', 'Program Summary', 'Plan vs Actual',
    'Unlinked Planned Items', 'Missing or Stale Links',
  ]) {
    assert(html.includes(sectionTitle),
      `print HTML renders section "${sectionTitle}"`)
  }

  // Notices block + disclaimer.
  assert(/<div class="[^"]*\bnotices-section\b/.test(html),
    'print HTML renders the notices block')
  assert(/<div class="[^"]*\bdisclaimer-section\b/.test(html) &&
    /Read-only spray program summary/.test(html) &&
    /does not recommend treatments/.test(html) &&
    /Missing links mean planned items could not be compared/.test(html),
    'print HTML renders the disclaimer with all four spec phrases')

  // Footer per printExtras.
  assert(/report-footer/.test(html),                       'print HTML has report-footer')
  assert(/TurfIntel · Spray Program/.test(html),           'print HTML footer-left = "TurfIntel · Spray Program"')
  assert(/Generated 2026-05-26T12:00:00\.000Z/.test(html), 'print HTML footer-right = "Generated <ISO>"')

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

  // HTML escaping — defensive injection check (re-asserted from 7E.3).
  const evil = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
    dateRange: '<script>alert(1)</script>',
    options: { now: 0 },
  })
  const evilHtml = fmt.buildPrintDocument(evil, {})
  assert(!/(<script>alert)/i.test(evilHtml),
    'print HTML escapes injected <script> in dateRange')
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(evilHtml),
    'print HTML carries the escaped entities for the injection')

  // Reports without printExtras get the OLD output — no summary /
  // notices / disclaimer divs leak in.
  const plainHtml = fmt.buildPrintDocument({
    id: 'rpt-plain', title: 'Plain Report', module: 'equipment',
    type: 'maintenance-summary',
    createdAt: '2026-05-26T12:00:00Z',
    sections: [
      { title: 'Summary', type: 'fields', data: { 'Count': 1 } },
    ],
    metadata: {},
  }, {})
  assert(!/<div class="[^"]*\bsummary-section\b/.test(plainHtml),
    'reports without printExtras → no <div .summary-section>')
  assert(!/<div class="[^"]*\bnotices-section\b/.test(plainHtml),
    'reports without printExtras → no <div .notices-section>')
  assert(!/<div class="[^"]*\bdisclaimer-section\b/.test(plainHtml),
    'reports without printExtras → no <div .disclaimer-section>')
  assert(/TurfIntel Pro/.test(plainHtml),
    'reports without printExtras → default footer label preserved')
}

// ── 3. reportToJSON round-trip ────────────────────────────────────────────
console.log('— reportToJSON round-trip on Spray Program envelope')
{
  const fmt = await import('../src/utils/reports/reportFormatter.js')
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')
  const report = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
    dateRange: 'May–June 2026',
    options: { now: Date.parse('2026-05-26T12:00:00Z') },
  })

  const json   = fmt.reportToJSON(report)
  const parsed = JSON.parse(json)

  // Every stable metadata key present.
  for (const key of [
    'exportVersion', 'reportKind', 'generatedBy', 'generatedAt',
    'dateRange', 'totals', 'notices', 'disclaimer', 'printExtras',
  ]) {
    assert(key in parsed.metadata,
      `Spray Program JSON export has metadata.${key}`)
  }
  // printExtras round-trip is clean — same 8 pairs, same labels.
  assert(Array.isArray(parsed.metadata.printExtras?.summary) &&
    parsed.metadata.printExtras.summary.length === 8,
    'JSON round-trip preserves 8 summary pairs')
  // No raw store arrays bleed through.
  assert(!('programs' in parsed) && !('itemsByProgramId' in parsed) &&
         !('sprays' in parsed),
    'raw store arrays NOT included in JSON export')

  // Functions / DOM / React-elementish all sanitized — re-assert by
  // injecting a hostile fixture and round-tripping through the same
  // sanitizer.
  const circ = { kind: 'circular' }; circ.self = circ
  const hostile = {
    id: 'rpt-hostile', title: 'Hostile', createdAt: '2026-05-26T12:00:00Z',
    module: 'spray', type: 'spray-program',
    sections: [],
    metadata: {
      exportVersion: 1,
      reportKind:    'spray-program',
      func:          () => 'nope',
      undef:         undefined,
      sym:           Symbol('drop'),
      date:          new Date('2026-05-26T12:00:00Z'),
      reactish:      { $$typeof: Symbol.for('react.element'), props: {}, type: 'div' },
      circular:      circ,
    },
  }
  const hostJson   = fmt.reportToJSON(hostile)
  const hostParsed = JSON.parse(hostJson)
  assert(!('func' in hostParsed.metadata),    'JSON sanitizer drops functions')
  assert(!('undef' in hostParsed.metadata),   'JSON sanitizer drops undefined')
  assert(!('sym' in hostParsed.metadata),     'JSON sanitizer drops symbols')
  assert(!('reactish' in hostParsed.metadata),'JSON sanitizer drops React-element-shaped')
  assert(hostParsed.metadata.date === '2026-05-26T12:00:00.000Z',
    'JSON sanitizer converts Date → ISO string')
  assert(hostParsed.metadata.circular.self === '[Circular]',
    'JSON sanitizer breaks circular refs with "[Circular]" marker')
}

// ── 4. No PDF / catalog / completed-spray / inventory regressions ────────
console.log('— forbidden-write + no-PDF invariants')
{
  // exportPDF still a placeholder.
  const exportUtils = readFileSync('src/utils/reports/exportUtils.js', 'utf8')
  assert(/PDF export is not yet implemented/.test(exportUtils),
    'exportPDF remains a placeholder (no PDF engine added this commit)')

  // No /api/product-catalog mutation route.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // Builder still issues no SQL against spray_records / inventory_items /
  // spray_program_items.
  const builderSrc = readFileSync('src/utils/reports/builders/sprayProgramReport.js', 'utf8')
  for (const sql of [
    /UPDATE\s+spray_records/i, /INSERT\s+INTO\s+spray_records/i,
    /UPDATE\s+inventory_items/i, /INSERT\s+INTO\s+inventory_items/i,
    /UPDATE\s+spray_program_items/i, /INSERT\s+INTO\s+spray_program_items/i,
  ]) {
    assert(!sql.test(builderSrc),
      `builder still does not run "${sql.source}"`)
  }

  // Builder remains pure (no React / fetch / store imports).
  const codeOnly = builderSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly), 'builder has no react import')
  assert(!/fetch\(/.test(codeOnly),              'builder has no fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'builder has no *Store imports')

  // No recommendation / judgment vocabulary in the builder.
  // Strip the mandated disclaimer line first so the "does not recommend"
  // phrase isn't a false positive.
  const stripped = codeOnly.replace(/'This report does not recommend treatments\.',?/g, '')
  for (const word of [
    'apply now', 'do not apply', 'rotate to', 'unsafe',
    '\\bsafe\\b', '\\bscore\\b', '\\bgrade\\b', '\\bpass\\b', '\\bfail\\b',
    '\\bcorrect\\b', '\\bincorrect\\b',
  ]) {
    const re = new RegExp(word.startsWith('\\b') ? word : `\\b${word}\\b`, 'i')
    assert(!re.test(stripped),
      `builder avoids "${word.replace(/\\b/g, '')}"`)
  }
  assert(!/\brecommend\b/i.test(stripped),
    'no bare "recommend" outside the disclaimer line')

  // Spray save payload byte-identical.
  const sprayBuilder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = sprayBuilder.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload omits program/intel/catalog keys')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
