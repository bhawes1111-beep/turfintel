// Phase 7I (4/?) — Spray Program Cost custom preview smoke.
//
//   node scripts/smoke-spray-program-cost-preview.mjs
//
// Locks:
//   - SprayProgramCostPreview exists, default-exports the component
//     and exposes SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM_COST
//   - preview is wired into ReportPreviewModal's dispatcher
//   - all 8 summary tiles render
//   - all 4 spec sections render + Notices
//   - disclaimer copy appears verbatim
//   - currency cell is wired (kvCost + tile_cost classes)
//   - mobile + print CSS rules exist
//   - missing / invalid statuses surface a warn-toned reason badge
//   - legacy generic-renderer path remains intact (other reports
//     still flow through SECTION_TYPE FIELDS/TABLE/TEXT)
//   - ReportActions still mounts inside the modal
//   - preview is read-only: no /api references, no POST/PATCH/DELETE,
//     no createSpray / recordInventoryUsage / createCalendarEvent /
//     setProgramItemCompletedLink / spray-program write verbs,
//     no inventory write verbs, no budget / invoice / ledger verbs
//   - no recommendation / judgment vocabulary added
//   - spray save payload remains unchanged (sprayProgramStore has no
//     cost / budget / invoice / ledger keys)
//   - Phase 7F.4 /completed-link route still wired

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Preview component contracts ────────────────────────────────────────
console.log('— src/components/reports/SprayProgramCostPreview.jsx (source)')
{
  const src = readFileSync('src/components/reports/SprayProgramCostPreview.jsx', 'utf8')

  assert(/export\s+default\s+function\s+SprayProgramCostPreview\b/.test(src),
    'default exports SprayProgramCostPreview')
  assert(/export\s+const\s+SUPPORTED_TYPE\s*=\s*REPORT_TYPE\.SPRAY_PROGRAM_COST/.test(src),
    'exports SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM_COST')

  // Read-only: no fetch / no store / no mutation verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/fetch\(/.test(codeOnly),                   'preview does not fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'preview issues no mutations')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'preview imports no *Store modules')
  assert(!/\/api\//.test(codeOnly),
    'preview does not reference any /api/ endpoint')

  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
    'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `preview code-only never references ${verb}`)
  }

  // Header pieces.
  assert(/Spray Program Cost Report/.test(src),
    'header renders title "Spray Program Cost Report"')
  assert(/Read-only spray program cost summary/.test(src),
    'header renders subtitle "Read-only spray program cost summary"')
  assert(/Generated /.test(src),  'header renders generated date')
  assert(/Date range:/.test(src), 'header conditionally renders date range')

  // All 8 tile labels per spec.
  const tileLabels = [
    'Programs reviewed',
    'Planned items',
    'Estimated items',
    'Estimated total',
    'Missing cost basis',
    'Missing quantity',
    'Unit mismatch',
    'Invalid cost',
  ]
  for (const label of tileLabels) {
    assert(new RegExp(`<Tile\\b[^>]*label=['"]${label}['"]`).test(src),
      `tile present: "${label}"`)
  }

  // Spec sections — looked up by builder section id (kebab) OR title.
  for (const idOrTitle of [
    "'program-cost-summary'", "'Program Cost Summary'",
    "'estimated-items'",      "'Estimated Items'",
    "'cost-basis-gaps'",      "'Cost Basis Gaps'",
    "'not-estimated-items'",  "'Not Estimated Items'",
  ]) {
    assert(src.includes(idOrTitle),
      `section id/title referenced: ${idOrTitle}`)
  }
  assert(src.includes("'Notices'") || src.includes('"Notices"'),
    'Notices block referenced')

  // Sub-renderers exist.
  for (const fn of [
    'ProgramCostList',
    'EstimatedItemsList',
    'CostBasisGapList',
    'NotEstimatedList',
    'Tile',
    'SectionCard',
    'KvRow',
  ]) {
    assert(new RegExp(`function\\s+${fn}\\b`).test(src),
      `helper renderer present: ${fn}`)
  }

  // Disclaimer copy verbatim (concatenated in the join above).
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Read-only spray program cost summary.',
    'Based on planned program items and inventory cost basis.',
    'This report does not create budget entries.',
    'Missing cost basis means no usable inventory cost is available.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(norm.includes(phrase), `disclaimer phrase verbatim: "${phrase}"`)
  }

  // Currency / cost emphasis class is referenced.
  assert(/styles\.kvCost\b/.test(src),       'preview uses styles.kvCost class')
  assert(/tone="cost"|tile_cost\b/.test(src), 'preview emits the cost-toned tile variant')

  // Missing / invalid statuses surface a warn-toned reason badge.
  assert(/REASON_TONE\s*=\s*\{/.test(src),
    'REASON_TONE map present')
  assert(/GAP_STATUS_LABEL\s*=\s*\{/.test(src),
    'GAP_STATUS_LABEL map present')
  for (const label of [
    'Missing cost basis',
    'Missing quantity',
    'Unit mismatch',
  ]) {
    assert(norm.includes(label),
      `reason label "${label}" referenced`)
  }

  // Stewardship vocabulary lock — no recommendation/judgment language.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe', 'pass', 'fail', 'score',
    'budget entry created', 'invoice', 'ledger',
    'actual expense', 'spend authorization',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in preview code`)
  }
}

// ── 2. CSS module contracts ───────────────────────────────────────────────
console.log('— src/components/reports/SprayProgramCostPreview.module.css contracts')
{
  const css = readFileSync('src/components/reports/SprayProgramCostPreview.module.css', 'utf8')
  for (const cls of [
    'preview', 'header', 'title', 'subtitle', 'meta',
    'tilesSection', 'tiles', 'tile', 'tileValue', 'tileLabel',
    'tile_ok', 'tile_warn', 'tile_muted', 'tile_cost', 'tileEmphasis',
    'section', 'sectionTitle', 'empty',
    'programList', 'programCard', 'programHeader',
    'programName', 'programStatusBadge',
    'programMeta', 'programCostRow', 'programCost', 'programCostLabel',
    'programCounts', 'warnText',
    'itemList', 'itemCard', 'itemHeader', 'itemProduct', 'itemCost',
    'itemMeta', 'itemMessage', 'reasonBadge', 'reason_warn',
    'itemKv', 'kvRow', 'kvLabel', 'kvValue', 'kvCost',
    'gapList', 'gapItem', 'gapHeader', 'gapInventory',
    'gapStatusBadge', 'gapMeta', 'gapAffected',
    'noticeList', 'notice', 'noticeIcon', 'noticeText',
    'notice_warning', 'notice_info',
    'disclaimer',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  assert(/@media\s*\(min-width:\s*540px\)/.test(css),
    'CSS defines mobile breakpoint at 540px')
  assert(/@media\s+print\b/.test(css),
    'CSS defines @media print block')
}

// ── 3. Dispatcher integration ─────────────────────────────────────────────
console.log('— ReportPreviewModal dispatcher integration')
{
  const src = readFileSync('src/components/reports/ReportPreviewModal.jsx', 'utf8')

  // Import statement.
  assert(/import\s+SprayProgramCostPreview\s+from\s+['"]\.\/SprayProgramCostPreview['"]/.test(src),
    'modal imports SprayProgramCostPreview')

  // Dispatcher entry.
  assert(/CUSTOM_PREVIEWS\s*=\s*\{[\s\S]*REPORT_TYPE\.SPRAY_PROGRAM_COST[\s\S]*SprayProgramCostPreview/m.test(src),
    'CUSTOM_PREVIEWS maps REPORT_TYPE.SPRAY_PROGRAM_COST → SprayProgramCostPreview')

  // Legacy registrations still present.
  assert(/REPORT_TYPE\.SPRAY_INTELLIGENCE/.test(src),
    'SPRAY_INTELLIGENCE custom-preview registration preserved')
  assert(/REPORT_TYPE\.SPRAY_PROGRAM\b/.test(src),
    'SPRAY_PROGRAM custom-preview registration preserved')

  // Generic FIELDS/TABLE/TEXT path still present for any other report.
  assert(/SECTION_TYPE\.FIELDS/.test(src) && /SECTION_TYPE\.TABLE/.test(src) && /SECTION_TYPE\.TEXT/.test(src),
    'legacy renderer path (FIELDS/TABLE/TEXT) still in the modal')
  assert(/return report\.sections\.map/.test(src),
    'modal still falls through to the generic renderer for non-custom reports')

  // ReportActions remains mounted.
  assert(/<ReportActions\b/.test(src),
    'ReportActions still mounts inside the modal')

  // Modal still has no fetch / mutations.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/fetch\(/.test(codeOnly),                  'modal does not fetch()')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'modal issues no mutations')
}

// ── 4. Reports schema constants ───────────────────────────────────────────
console.log('— REPORT_TYPE.SPRAY_PROGRAM_COST still exported')
{
  const schemas = readFileSync('src/utils/reports/reportSchemas.js', 'utf8')
  assert(/SPRAY_PROGRAM_COST:\s*['"]spray-program-cost['"]/.test(schemas),
    'REPORT_TYPE.SPRAY_PROGRAM_COST still exported with stable value')
}

// ── 5. Forbidden-write invariants across surfaces ─────────────────────────
console.log('— spray save payload + forbidden-write regression guards')
{
  // Phase 7F.4 /completed-link route remains the sole write site for
  // linkedSprayRecordId; confirm it still exists.
  const store = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(store),
    'Phase 7F.4 /completed-link route still present')

  const storeCodeOnly = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const word of ['estimatedCost', 'budgetEntry', 'invoiceId', 'ledgerId']) {
    assert(!new RegExp(`\\b${word}\\b`).test(storeCodeOnly),
      `sprayProgramStore never references ${word}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
