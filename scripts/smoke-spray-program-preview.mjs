// Phase 7G (2/?) — Spray Program preview smoke.
//
//   node scripts/smoke-spray-program-preview.mjs
//
// Locks the custom-preview contracts:
//   - preview component exists and is wired into the modal dispatcher
//   - SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM
//   - all 8 summary tiles render
//   - all 5 sections render (Program Summary / Plan vs Actual /
//     Unlinked Planned Items / Missing or Stale Links / Notices)
//   - disclaimer copy appears
//   - mobile + print CSS rules exist
//   - no recommendation / judgment language
//   - existing generic renderer remains intact (other reports unaffected)
//   - Spray Intelligence preview registration still in place
//   - builder + forbidden-write invariants from prior phases still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. SprayProgramPreview component contracts ────────────────────────────
console.log('— src/components/reports/SprayProgramPreview.jsx (source)')
{
  const src = readFileSync('src/components/reports/SprayProgramPreview.jsx', 'utf8')

  assert(/export\s+default\s+function\s+SprayProgramPreview\b/.test(src),
    'default exports SprayProgramPreview')
  assert(/export\s+const\s+SUPPORTED_TYPE\s*=\s*REPORT_TYPE\.SPRAY_PROGRAM/.test(src),
    "exports SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM")

  // Read-only: no fetch / no store / no mutation verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/fetch\(/.test(codeOnly),                  'preview does not fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'preview issues no mutations')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'preview imports no *Store modules')
  // No /api/ references — purely render-time.
  assert(!/\/api\//.test(codeOnly),
    'preview does not reference any /api/ endpoint')

  // Header pieces.
  assert(/Spray Program Report/.test(src),     'header renders title "Spray Program Report"')
  assert(/Read-only spray program summary/.test(src),
    'header renders subtitle "Read-only spray program summary"')
  assert(/Generated /.test(src),                'header renders generated date')
  assert(/Date range:/.test(src),               'header conditionally renders date range')

  // All 8 tile labels per spec.
  const tileLabels = [
    'Programs reviewed',
    'Planned items',
    'Linked completed',
    'Unlinked planned',
    'Completed status',
    'Skipped',
    'Canceled',
    'Missing or stale links',
  ]
  for (const label of tileLabels) {
    assert(new RegExp(`<Tile\\b[^>]*label=['"]${label}['"]`).test(src),
      `tile present: "${label}"`)
  }

  // 5 spec sections — looked up by builder titles + Notices.
  for (const sectionTitle of [
    'Program Summary',
    'Plan vs Actual',
    'Unlinked Planned Items',
    'Missing or Stale Links',
    'Notices',
  ]) {
    assert(src.includes(`'${sectionTitle}'`) || src.includes(`"${sectionTitle}"`),
      `section title referenced: "${sectionTitle}"`)
  }

  // Sub-renderers exist.
  for (const fn of [
    'ProgramSummaryList',
    'PlanVsActualList',
    'UnlinkedList',
    'StaleList',
    'ComparisonRow',
    'Tile',
    'SectionCard',
  ]) {
    assert(new RegExp(`function\\s+${fn}\\b`).test(src),
      `helper renderer present: ${fn}`)
  }

  // Plan vs Actual surfaces the four Phase 7F.5 comparison labels.
  for (const label of ['Date', 'Product', 'Area', 'Rate']) {
    assert(new RegExp(`label=['"]${label}['"]`).test(src),
      `ComparisonRow label "${label}" present`)
  }

  // Disclaimer footer + the four spec phrases.
  for (const phrase of [
    'Read-only spray program summary',
    'Based on planned program items and linked completed spray records',
    'This report does not recommend treatments',
    'Missing links mean planned items could not be compared to completed records',
  ]) {
    assert(src.includes(phrase), `disclaimer/copy phrase present: "${phrase}"`)
  }

  // Forbidden vocabulary. Strip comments before checking so prose can
  // discuss what we don't use.
  const stripped = codeOnly
    .replace(/'This report does not recommend treatments\.',?/g, '')
    .replace(/does not recommend treatments/g, '')
  for (const word of [
    'apply now', 'do not apply', 'rotate to', 'unsafe',
    '\\bscore\\b', '\\bgrade\\b', '\\bpass\\b', '\\bfail\\b',
    '\\bcorrect\\b', '\\bincorrect\\b',
  ]) {
    const re = new RegExp(word.startsWith('\\b') ? word : `\\b${word}\\b`, 'i')
    assert(!re.test(stripped),
      `forbidden phrasing absent: "${word.replace(/\\b/g, '')}"`)
  }
  // "safe" — strict word boundary; common substring otherwise.
  assert(!/\bsafe\b/i.test(stripped),                    'forbidden phrasing absent: "safe"')
  // Bare "recommend" outside the disclaimer is forbidden.
  assert(!/\brecommend\b/i.test(stripped),
    "no bare 'recommend' outside the disclaimer line")
}

// ── 2. CSS contracts (mobile + print) ─────────────────────────────────────
console.log('— SprayProgramPreview.module.css (mobile + print)')
{
  const css = readFileSync('src/components/reports/SprayProgramPreview.module.css', 'utf8')

  for (const cls of [
    'preview', 'header', 'title', 'subtitle', 'meta',
    'tiles', 'tile', 'tileValue', 'tileLabel',
    'section', 'sectionTitle', 'empty',
    'programList', 'programCard', 'programName', 'programType',
    'programStatusBadge',
    'pvaList', 'pvaItem', 'pvaProduct', 'pvaKv',
    'pvaTone_ok', 'pvaTone_warn', 'pvaTone_muted',
    'unlinkedList', 'unlinkedItem',
    'staleList', 'staleItem', 'staleFk', 'staleReason',
    'itemStatusBadge', 'itemStatus_planned', 'itemStatus_completed',
    'itemStatus_skipped', 'itemStatus_canceled',
    'noticeList', 'notice', 'notice_warning', 'notice_caution',
    'disclaimer',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }

  // Mobile-first guard: max-width 600px breakpoint.
  assert(/@media\s*\(max-width:\s*600px\)/.test(css),
    'CSS has mobile @media (max-width: 600px) breakpoint')

  // Print-friendly: @media print + break-inside protection.
  assert(/@media\s+print\s*\{/.test(css),
    'CSS has @media print block')
  assert(/break-inside:\s*avoid/.test(css) || /page-break-inside:\s*avoid/.test(css),
    'CSS prevents cards from splitting across pages on print')
  // White background restated for "Print backgrounds: on" rendering.
  assert(/background:\s*#fff\s*!important/.test(css),
    'CSS forces white background in print')
}

// ── 3. ReportPreviewModal dispatcher ──────────────────────────────────────
console.log('— ReportPreviewModal dispatcher includes spray-program')
{
  const src = readFileSync('src/components/reports/ReportPreviewModal.jsx', 'utf8')

  assert(/import\s+SprayProgramPreview\s+from\s+['"]\.\/SprayProgramPreview['"]/.test(src),
    'modal imports SprayProgramPreview')
  assert(/REPORT_TYPE\.SPRAY_PROGRAM\s*\]\s*:\s*SprayProgramPreview/.test(src),
    'CUSTOM_PREVIEWS maps SPRAY_PROGRAM → SprayProgramPreview')

  // Existing Spray Intelligence mapping must remain intact (regression).
  assert(/REPORT_TYPE\.SPRAY_INTELLIGENCE\s*\]\s*:\s*SprayIntelligencePreview/.test(src),
    'Spray Intelligence preview registration preserved')

  // Dispatcher path renders the custom preview when matched.
  assert(/CustomPreview\s*=\s*CUSTOM_PREVIEWS\[report\.type\]/.test(src),
    'dispatcher reads CUSTOM_PREVIEWS[report.type]')
  assert(/return\s+<CustomPreview\s+report=\{report\}\s*\/>/.test(src),
    'dispatcher renders <CustomPreview report={report} /> for matched types')

  // Generic FIELDS/TABLE/TEXT renderer still in place.
  for (const sectionType of ['SECTION_TYPE.FIELDS', 'SECTION_TYPE.TABLE', 'SECTION_TYPE.TEXT']) {
    assert(src.includes(sectionType),
      `generic renderer still handles ${sectionType}`)
  }

  // ReportActions still mounts on both paths.
  assert(/<ReportActions\b/.test(src),
    'modal still mounts <ReportActions> for both rendering paths')
}

// ── 4. Builder model produces the canonical 5-section envelope ────────────
console.log('— builder still produces the canonical envelope the preview reads')
{
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')
  const report = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
  })

  const titles = report.sections.map(s => s.title)
  for (const t of [
    'Overview', 'Program Summary', 'Plan vs Actual',
    'Unlinked Planned Items', 'Missing or Stale Links',
  ]) {
    assert(titles.includes(t),
      `builder section title preserved: "${t}"`)
  }

  assert(report.metadata?.totals && typeof report.metadata.totals === 'object',
    'metadata.totals object present')
  for (const key of [
    'programsReviewed', 'plannedItems', 'linkedCompletedItems',
    'unlinkedPlannedItems', 'completedStatusItems', 'skippedItems',
    'canceledItems', 'planActualComparedItems', 'missingActualLinks',
  ]) {
    assert(key in report.metadata.totals,
      `metadata.totals has "${key}"`)
  }
  assert(typeof report.metadata.disclaimer === 'string' &&
    /Read-only spray program summary/.test(report.metadata.disclaimer),
    'metadata.disclaimer round-trips through the envelope')

  // Builder remains pure — no React / fetch / store imports.
  const builderSrc = readFileSync('src/utils/reports/builders/sprayProgramReport.js', 'utf8')
  const codeOnly = builderSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly), 'builder still has no react import')
  assert(!/fetch\(/.test(codeOnly),              'builder still has no fetch()')
}

// ── 5. Forbidden-write invariants ─────────────────────────────────────────
console.log('— forbidden-write invariants still hold')
{
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // Builder still issues no spray_records / inventory / item writes.
  const builderSrc = readFileSync('src/utils/reports/builders/sprayProgramReport.js', 'utf8')
  for (const sql of [
    /UPDATE\s+spray_records/i, /INSERT\s+INTO\s+spray_records/i,
    /UPDATE\s+inventory_items/i, /INSERT\s+INTO\s+inventory_items/i,
    /UPDATE\s+spray_program_items/i, /INSERT\s+INTO\s+spray_program_items/i,
  ]) {
    assert(!sql.test(builderSrc),
      `builder still does not run "${sql.source}"`)
  }

  // Spray save payload byte-identical.
  const sprayBuilder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = sprayBuilder.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload still omits program/intel/catalog keys')
}

// ── Result ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
