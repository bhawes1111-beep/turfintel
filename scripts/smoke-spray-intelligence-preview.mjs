// Phase 7E (2/?) — Spray Intelligence preview smoke.
//
//   node scripts/smoke-spray-intelligence-preview.mjs
//
// Locks the export-ready preview invariants:
//   - preview component exists and is wired into the modal dispatcher
//   - all 5 spec sections render
//   - the 7 summary tiles render
//   - disclaimer copy appears
//   - mobile + print CSS rules exist
//   - no recommendation / score / grade language
//   - existing generic renderer remains intact (other reports unaffected)
//   - report-builder + spray-save invariants from prior phases still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. SprayIntelligencePreview component contracts ────────────────────────
console.log('— src/components/reports/SprayIntelligencePreview.jsx (source)')
{
  const src = readFileSync('src/components/reports/SprayIntelligencePreview.jsx', 'utf8')

  // Default export + SUPPORTED_TYPE.
  assert(/export\s+default\s+function\s+SprayIntelligencePreview\b/.test(src),
    'default exports SprayIntelligencePreview')
  assert(/export\s+const\s+SUPPORTED_TYPE\s*=\s*REPORT_TYPE\.SPRAY_INTELLIGENCE/.test(src),
    "exports SUPPORTED_TYPE = REPORT_TYPE.SPRAY_INTELLIGENCE")

  // Read-only: no fetch / no store / no mutation verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/fetch\(/.test(codeOnly),                   'preview does not fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'preview issues no mutations')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'preview imports no *Store modules')

  // Header pieces.
  assert(/Spray Intelligence Report/.test(src),       'header renders title "Spray Intelligence Report"')
  assert(/Read-only spray intelligence summary/.test(src),
    'header renders subtitle "Read-only spray intelligence summary"')
  assert(/Generated /.test(src),                       'header renders generated date')
  assert(/Date range:/.test(src),                      'header conditionally renders date range')

  // 7 spec tiles.
  const tileLabels = [
    'Sprays reviewed',
    'Products reviewed',
    'With intelligence',
    'Missing intelligence',
    'Restricted-use',
    'Repeated groups',
    'Interval matches',
  ]
  for (const label of tileLabels) {
    assert(new RegExp(`<Tile\\b[^>]*label=['"]${label}['"]`).test(src),
      `tile present: "${label}"`)
  }

  // 5 spec sections — looked up by builder titles.
  for (const sectionTitle of [
    'Overview',
    'Chemistry Awareness',
    'Rotation Awareness',
    'Interval Awareness',
    'Missing Intelligence',
  ]) {
    assert(src.includes(`'${sectionTitle}'`) || src.includes(`"${sectionTitle}"`),
      `section title referenced: "${sectionTitle}"`)
  }

  // Sub-renderers exist for the spec-required content.
  for (const fn of [
    'ChemistryAwareness',
    'RotationAwareness',
    'IntervalAwareness',
    'MissingIntelligence',
    'ChipRow', 'Tile', 'SectionCard', 'KV',
  ]) {
    assert(new RegExp(`function\\s+${fn}\\b`).test(src), `helper renderer present: ${fn}`)
  }

  // FRAC/HRAC/IRAC/PGR chips render in both chemistry + rotation.
  for (const vocab of ['FRAC', 'HRAC', 'IRAC', 'PGR']) {
    assert(new RegExp(`label=['"]${vocab}['"]`).test(src),
      `Chemistry chip row label "${vocab}" present`)
    assert(new RegExp(`label=['"]Repeated ${vocab}['"]`).test(src),
      `Rotation repeated-chip row label "Repeated ${vocab}" present`)
  }

  // Interval Awareness shows kind / match / days-since columns.
  assert(/intervalKind/.test(src) && /intervalMatch/.test(src) && /intervalSince/.test(src),
    'IntervalAwareness lists kind / match / days-since')
  assert(/No matches in the last/.test(src),
    'IntervalAwareness has an empty-state copy')

  // Missing-Intelligence shows date + spray + "could not be evaluated"
  // reason text per the spec.
  assert(/could not be evaluated/.test(src),
    'MissingIntelligence copy includes "could not be evaluated"')
  assert(/No catalog link, no imported label data, or no resolvable product intelligence/.test(src),
    'MissingIntelligence enumerates the three possible reasons')
  assert(/No missing-intelligence sprays/.test(src),
    'MissingIntelligence has an empty-state copy')

  // Disclaimer footer + the four spec phrases.
  for (const phrase of [
    'Read-only spray intelligence summary',
    'Based on recorded applications and linked catalog or label data',
    'This report does not recommend treatments',
    'Missing intelligence means products could not be evaluated from available catalog or label data',
  ]) {
    assert(src.includes(phrase), `disclaimer/copy phrase present: "${phrase}"`)
  }

  // Forbidden vocabulary. Strip JS comments first so prose that says
  // "we do not use 'apply now'" isn't a false positive.
  for (const word of ['recommend as an action', 'apply now', 'do not apply', 'rotate to', 'unsafe', 'score', 'grade']) {
    assert(!new RegExp(`\\b${word.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')}\\b`, 'i').test(codeOnly),
      `forbidden phrasing absent: "${word}"`)
  }
  // "safe" gets a stricter check because it's a common substring; use
  // word-boundary match against code only.
  assert(!/\bsafe\b/i.test(codeOnly),                  'forbidden phrasing absent: "safe"')
  // "recommend" with no qualifier — allowed only within the disclaimer
  // line "does not recommend treatments". Anywhere else is forbidden.
  const codeStripDisclaimer = codeOnly.replace(
    /'This report does not recommend treatments\.',?/g, '',
  ).replace(/does not recommend treatments/g, '')
  assert(!/\brecommend\b/i.test(codeStripDisclaimer),
    "no bare 'recommend' outside the disclaimer line")
}

// ── 2. CSS contracts (print + mobile) ──────────────────────────────────────
console.log('— SprayIntelligencePreview.module.css (mobile + print)')
{
  const css = readFileSync('src/components/reports/SprayIntelligencePreview.module.css', 'utf8')

  for (const cls of [
    'preview', 'header', 'title', 'subtitle', 'meta',
    'tiles', 'tile', 'tileValue', 'tileLabel',
    'section', 'sectionTitle',
    'chipRow', 'chip', 'chip_frac', 'chip_hrac', 'chip_irac', 'chip_pgr',
    'intervalItem', 'missingItem', 'noticeList',
    'disclaimer', 'empty',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }

  // Mobile-first guard: max-width media query for ≤ 600px present.
  assert(/@media\s*\(max-width:\s*600px\)/.test(css),
    'CSS has a mobile @media (max-width: 600px) breakpoint')

  // Print-friendly: @media print block AND page-break protection.
  assert(/@media\s+print\s*\{/.test(css),
    'CSS has an @media print block')
  assert(/break-inside:\s*avoid/.test(css) || /page-break-inside:\s*avoid/.test(css),
    'CSS prevents cards from splitting across pages on print')
}

// ── 3. ReportPreviewModal dispatcher ───────────────────────────────────────
console.log('— ReportPreviewModal dispatch by report.type')
{
  const src = readFileSync('src/components/reports/ReportPreviewModal.jsx', 'utf8')

  assert(/import\s+SprayIntelligencePreview\s+from\s+['"]\.\/SprayIntelligencePreview['"]/.test(src),
    'modal imports SprayIntelligencePreview')
  assert(/CUSTOM_PREVIEWS\s*=\s*\{/.test(src),
    'modal declares a CUSTOM_PREVIEWS map')
  assert(/REPORT_TYPE\.SPRAY_INTELLIGENCE\s*\]\s*:\s*SprayIntelligencePreview/.test(src),
    'CUSTOM_PREVIEWS maps SPRAY_INTELLIGENCE → SprayIntelligencePreview')

  // Dispatcher path renders the custom preview when matched.
  assert(/CustomPreview\s*=\s*CUSTOM_PREVIEWS\[report\.type\]/.test(src),
    'dispatcher reads CUSTOM_PREVIEWS[report.type]')
  assert(/return\s+<CustomPreview\s+report=\{report\}\s*\/>/.test(src),
    'dispatcher renders <CustomPreview report={report} /> for matched types')

  // Generic FIELDS/TABLE/TEXT renderer remains intact for everything
  // else (regression guard for the seven legacy reports).
  for (const sectionType of ['SECTION_TYPE.FIELDS', 'SECTION_TYPE.TABLE', 'SECTION_TYPE.TEXT']) {
    assert(src.includes(sectionType),
      `generic renderer still handles ${sectionType}`)
  }

  // ReportActions still mounted (export/print buttons preserved).
  assert(/<ReportActions\b/.test(src),
    'modal still mounts <ReportActions> for both rendering paths')
}

// ── 4. Builder model adjustments — none required ───────────────────────────
console.log('— builder model still produces the canonical envelope')
{
  // We reuse the existing model. Re-import the builder and verify the
  // five sections that the preview reads by title actually exist in
  // the envelope produced by an empty bundle. Smoke from Phase 7E (1)
  // already covers totals + content; this smoke just locks the section
  // titles the preview depends on.
  const mod = await import('../src/utils/reports/builders/sprayIntelligenceReport.js')
  const report = mod.buildSprayIntelligenceReport({
    sprays: [], inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
  })
  const titles = report.sections.map(s => s.title)
  for (const t of ['Overview', 'Chemistry Awareness', 'Rotation Awareness', 'Interval Awareness', 'Missing Intelligence']) {
    assert(titles.includes(t),
      `builder section title preserved: "${t}"`)
  }

  // metadata still carries totals + disclaimer + dateRange-pass-through.
  assert(report.metadata?.totals && typeof report.metadata.totals === 'object',
    'metadata.totals object present')
  for (const key of [
    'spraysReviewed', 'productsReviewed', 'productsWithIntel',
    'missingIntelCount', 'restrictedUseCount', 'repeatedGroupCount', 'intervalMatchCount',
  ]) {
    assert(key in report.metadata.totals,
      `metadata.totals has "${key}"`)
  }
  assert(typeof report.metadata.disclaimer === 'string' &&
    /Read-only spray intelligence summary/.test(report.metadata.disclaimer),
    'metadata.disclaimer round-trips through the envelope')

  // Builder remains pure: no react/fetch/store imports.
  const builderSrc = readFileSync('src/utils/reports/builders/sprayIntelligenceReport.js', 'utf8')
  const codeOnly = builderSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly), 'builder still has no react import')
  assert(!/fetch\(/.test(codeOnly),              'builder still has no fetch()')
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

  // Spray save payload unchanged.
  const builderSrc = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = builderSrc.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation|interval/i.test(payload),
    'spray save payload omits intel/intelligence/rotation/interval keys')

  // No new export route on the catalog OR the spray side. Custom
  // preview is purely a render — it must not POST a "report saved"
  // record anywhere.
  const previewSrc = readFileSync('src/components/reports/SprayIntelligencePreview.jsx', 'utf8')
  const previewCode = previewSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\/api\//.test(previewCode),
    'preview component does not reference any /api/ endpoint')
}

// ── Result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
