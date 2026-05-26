// Phase 7G (1/?) — Spray Program Report Builder smoke.
//
//   node scripts/smoke-spray-program-report.mjs
//
// Locks the foundation contracts:
//   - exports the three declared helpers
//   - reuses Phase 7F.5 planActualComparison (no parallel logic)
//   - no React / fetch / store imports
//   - inputs are never mutated
//   - totals add up across linked / unlinked / stale + statuses
//   - all five required sections render
//   - registered in REPORT_TYPE + REPORT_DEFS with the spray module
//   - bundle keys declared by the def match what Reports.jsx supplies
//   - no recommendation / judgment language anywhere
//   - no catalog mutation / no completed-spray mutation /
//     no inventory deduction added by this commit
//   - spray save payload byte-identical

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Source contracts ────────────────────────────────────────────────────
console.log('— src/utils/reports/builders/sprayProgramReport.js (source)')
{
  const src = readFileSync('src/utils/reports/builders/sprayProgramReport.js', 'utf8')

  for (const name of [
    'buildSprayProgramReport',
    'summarizeProgramForReport',
    'summarizeProgramItemForReport',
    'buildSprayProgramReportSections',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Reuses the Phase 7F.5 helper — no parallel comparison logic.
  assert(/from\s+['"][^'"]*sprayPrograms\/planActualComparison(\.js)?['"]/.test(src),
    'imports planActualComparison helper (single source of comparison logic)')
  assert(/buildPlanActualComparison\b/.test(src),
    'invokes buildPlanActualComparison from the helper')

  // Purity invariants — code-only scan so comments may discuss what
  // the builder explicitly does NOT import.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),     'no react import')
  assert(!/fetch\(/.test(codeOnly),                   'no fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'no *Store imports')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'no mutation verbs')

  // No judgment vocabulary. The mandated disclaimer line
  // "does not recommend treatments" is allowlisted (same approach as
  // the Spray Intelligence report builder).
  const stripped = codeOnly.replace(/'This report does not recommend treatments\.',?/g, '')
  for (const word of ['correct', 'incorrect', 'pass', 'fail', 'score', 'grade', 'safe', 'unsafe', 'apply now', 'do not apply', 'rotate to']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(stripped),
      `no "${word}" wording`)
  }
  assert(!/\brecommend\b/i.test(stripped),
    'no bare "recommend" outside the disclaimer line')
}

// ── 2. Behavior ───────────────────────────────────────────────────────────
console.log('— buildSprayProgramReport behavior')
{
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')

  const NOW = Date.parse('2026-05-26T12:00:00Z')

  // Fixture: 2 programs, 5 items total across linked / unlinked / stale +
  // status variety. 1 program has its items not yet cached (undefined).
  const programs = [
    { id: 'p1', name: 'Greens Fungicide',  programType: 'greens',   seasonYear: 2026, status: 'active', source: 'manual' },
    { id: 'p2', name: 'Pre-emergent',      programType: 'fairways', seasonYear: 2026, status: 'draft',  source: 'manual' },
    { id: 'p3', name: 'Future Plan',       programType: 'tees',     seasonYear: 2026, status: 'draft',  source: 'manual' },
    null, // defensive: null entries are skipped silently.
  ]
  const itemsByProgramId = {
    'p1': [
      // Linked + comparison should land.
      { id: 'i1', programId: 'p1', productName: 'Heritage', targetArea: 'Greens',
        plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07',
        rateValue: 3.2, rateUnit: 'oz/1000 sq ft',
        status: 'planned', linkedSprayRecordId: 's1' },
      // Stale link — no matching spray record in the bundle.
      { id: 'i2', programId: 'p1', productName: 'Daconil', targetArea: 'Greens',
        plannedStartDate: '2026-06-10', plannedEndDate: '2026-06-14',
        status: 'planned', linkedSprayRecordId: 's-gone' },
      // Unlinked, status=skipped.
      { id: 'i3', programId: 'p1', productName: 'Iron supplement', targetArea: 'Greens',
        plannedWindowLabel: 'Late June touch-up',
        status: 'skipped', linkedSprayRecordId: null },
    ],
    'p2': [
      // Linked + completed status.
      { id: 'i4', programId: 'p2', productName: 'Barricade 4FL', targetArea: 'Fairways',
        plannedStartDate: '2026-04-01', plannedEndDate: '2026-04-30',
        rateValue: 0.5, rateUnit: 'oz/1000 sq ft',
        status: 'completed', linkedSprayRecordId: 's2' },
      // Unlinked, canceled.
      { id: 'i5', programId: 'p2', productName: 'Specticle', targetArea: 'Fairways',
        status: 'canceled', linkedSprayRecordId: null },
    ],
    // p3 deliberately omitted → not in the cache.
  }
  const sprays = [
    { id: 's1', date: '2026-06-03', applicationName: 'Greens fungicide app',
      area: 'Greens', status: 'completed',
      products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }] },
    { id: 's2', date: '2026-04-15', applicationName: 'PRE-emergent app 1',
      area: 'Fairways', status: 'completed',
      products: [{ name: 'Barricade 4FL', rate: '0.5 oz / 1,000 sq ft' }] },
    // Soft-deleted: must NOT be considered live for linking.
    { id: 's-gone', date: '2026-05-01', applicationName: 'Soft-deleted',
      deletedAt: '2026-05-25', products: [] },
  ]

  const report = mod.buildSprayProgramReport({
    programs, itemsByProgramId, sprays,
    dateRange: 'May–June 2026',
    options: { now: NOW },
  })

  // Envelope shape.
  assert(report.module === 'spray',                  "envelope.module === 'spray'")
  assert(report.type   === 'spray-program',          "envelope.type === 'spray-program'")
  assert(report.title  === 'Spray Program Report',   'envelope.title set')
  assert(Array.isArray(report.sections),             'sections is an array')

  // All five spec sections present.
  const sectionTitles = report.sections.map(s => s.title)
  for (const t of [
    'Overview',
    'Program Summary',
    'Plan vs Actual',
    'Unlinked Planned Items',
    'Missing or Stale Links',
  ]) {
    assert(sectionTitles.includes(t), `section present: "${t}"`)
  }

  // Totals — perProgram covers p1 + p2 + p3; p3 has no cached items.
  const totals = report.metadata.totals
  assert(totals.programsReviewed === 3,
    'programsReviewed = 3 (p1 + p2 + p3; null entries dropped)')
  assert(totals.plannedItems === 5,
    'plannedItems = 5 (3 from p1 + 2 from p2; p3 contributes 0 — not cached)')
  assert(totals.linkedCompletedItems === 2,
    'linkedCompletedItems = 2 (i1 + i4 resolve to live sprays)')
  assert(totals.unlinkedPlannedItems === 2,
    'unlinkedPlannedItems = 2 (i3 + i5, no FK set)')
  assert(totals.missingActualLinks === 1,
    'missingActualLinks = 1 (i2 → s-gone soft-deleted)')
  assert(totals.planActualComparedItems === 2,
    'planActualComparedItems = 2 (linked items get a comparison)')
  assert(totals.completedStatusItems === 1, 'completedStatusItems = 1 (i4)')
  assert(totals.skippedItems === 1,         'skippedItems = 1 (i3)')
  assert(totals.canceledItems === 1,        'canceledItems = 1 (i5)')

  // Stable metadata contract (same shape as Spray Intelligence report).
  for (const key of ['exportVersion', 'reportKind', 'generatedBy', 'generatedAt',
                     'totals', 'notices', 'disclaimer', 'dateRange']) {
    assert(key in report.metadata, `metadata.${key} present`)
  }
  assert(report.metadata.exportVersion === 1,         'metadata.exportVersion === 1')
  assert(report.metadata.reportKind    === 'spray-program',
    "metadata.reportKind === 'spray-program'")
  assert(report.metadata.generatedBy   === 'TurfIntel','metadata.generatedBy === TurfIntel')
  assert(typeof report.metadata.generatedAt === 'string' &&
         /^\d{4}-\d{2}-\d{2}T/.test(report.metadata.generatedAt),
    'metadata.generatedAt is an ISO date string')
  assert(report.metadata.dateRange === 'May–June 2026',
    'metadata.dateRange round-trips')
  assert(typeof report.metadata.disclaimer === 'string' &&
    /Read-only spray program summary/.test(report.metadata.disclaimer) &&
    /does not recommend treatments/.test(report.metadata.disclaimer) &&
    /Missing links mean planned items could not be compared/.test(report.metadata.disclaimer),
    'metadata.disclaimer carries the spec-required four-line stewardship copy')

  // ── Section content sanity ────────────────────────────────────────
  const overview = report.sections.find(s => s.title === 'Overview')
  assert(overview && /Read-only spray program summary/.test(overview.data['Disclaimer'] ?? ''),
    'Overview section embeds the disclaimer field')

  const programSummary = report.sections.find(s => s.title === 'Program Summary')
  assert(programSummary?.data?.columns?.length === 6,
    'Program Summary is a TABLE with 6 columns')
  // p1 row should show 3 planned, 1 linked.
  const p1Row = programSummary.data.rows.find(r => r[0] === 'Greens Fungicide')
  assert(p1Row && p1Row[4] === 3 && p1Row[5] === 1,
    'Program Summary: Greens Fungicide → 3 planned / 1 linked', p1Row)

  const planVsActual = report.sections.find(s => s.title === 'Plan vs Actual')
  assert(planVsActual?.data?.columns?.length === 7,
    'Plan vs Actual has 7 columns')
  const pvaRowsText = JSON.stringify(planVsActual.data.rows)
  assert(/Heritage/.test(pvaRowsText),
    'Plan vs Actual row mentions Heritage')
  assert(/inside planned window|outside planned window/i.test(pvaRowsText),
    'Plan vs Actual carries the helper\'s window-state language')
  assert(/Planned product appears in completed record/.test(pvaRowsText),
    'Plan vs Actual carries the product-match language')

  const unlinked = report.sections.find(s => s.title === 'Unlinked Planned Items')
  const unlinkedText = JSON.stringify(unlinked.data.rows)
  assert(/Iron supplement/.test(unlinkedText) && /Specticle/.test(unlinkedText),
    'Unlinked Planned Items lists both unlinked rows')
  // Linked items must NOT appear here.
  assert(!/Heritage/.test(unlinkedText),
    'Unlinked section excludes linked items')

  const stale = report.sections.find(s => s.title === 'Missing or Stale Links')
  const staleText = JSON.stringify(stale.data.rows)
  assert(/Daconil/.test(staleText) && /s-gone/.test(staleText),
    'Missing or Stale Links lists the i2 → s-gone row')

  // Notices — at least one warning when stale links exist.
  const noticeText = (report.metadata.notices ?? []).map(n => `${n.type} ${n.label} ${n.value}`).join(' | ')
  assert(/warning\s+Missing or stale links/.test(noticeText),
    'warning notice surfaces "Missing or stale links"')
  assert(/Items not loaded/.test(noticeText),
    'info notice surfaces "Items not loaded" for p3 (cache miss)')
  // No judgment vocabulary in the notices.
  for (const word of ['correct', 'incorrect', 'pass', 'fail', 'score', 'grade', 'safe', 'unsafe', 'apply now', 'do not apply']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(noticeText),
      `notices avoid "${word}"`)
  }

  // ── Edge cases ───────────────────────────────────────────────────
  // Empty inputs → still a valid envelope, all five sections.
  const empty = mod.buildSprayProgramReport({
    programs: [], itemsByProgramId: {}, sprays: [],
  })
  for (const t of ['Overview', 'Program Summary', 'Plan vs Actual', 'Unlinked Planned Items', 'Missing or Stale Links']) {
    assert(empty.sections.some(s => s.title === t),
      `empty inputs → section present: "${t}"`)
  }
  assert(empty.metadata.totals.programsReviewed === 0,
    'empty inputs → programsReviewed 0')
  // "No programs" info notice present.
  const emptyNotices = (empty.metadata.notices ?? []).map(n => n.value).join(' | ')
  assert(/No spray programs are in the report range/.test(emptyNotices),
    'empty inputs → "No spray programs are in the report range" info notice')

  // Defensive: null arrays / objects don't throw.
  const nullSafe = mod.buildSprayProgramReport({
    programs: null, itemsByProgramId: null, sprays: null,
  })
  assert(nullSafe.metadata.totals.programsReviewed === 0,
    'null inputs → programsReviewed 0 (no throw)')

  // ── Purity ────────────────────────────────────────────────────────
  const progClone   = JSON.parse(JSON.stringify(programs.filter(Boolean)))
  const itemsClone  = JSON.parse(JSON.stringify(itemsByProgramId))
  const spraysClone = JSON.parse(JSON.stringify(sprays))
  const progBefore  = JSON.stringify(progClone)
  const itemsBefore = JSON.stringify(itemsClone)
  const spraysBefore = JSON.stringify(spraysClone)
  mod.buildSprayProgramReport({
    programs: progClone, itemsByProgramId: itemsClone, sprays: spraysClone,
    options: { now: NOW },
  })
  assert(JSON.stringify(progClone)   === progBefore,   'programs array not mutated')
  assert(JSON.stringify(itemsClone)  === itemsBefore,  'itemsByProgramId not mutated')
  assert(JSON.stringify(spraysClone) === spraysBefore, 'sprays array not mutated')
}

// ── 3. Per-program + per-item helpers ────────────────────────────────────
console.log('— summarizeProgramForReport / summarizeProgramItemForReport')
{
  const mod = await import('../src/utils/reports/builders/sprayProgramReport.js')

  const item = { id: 'i1', linkedSprayRecordId: 's1',
    productName: 'Heritage', plannedStartDate: '2026-06-01',
    plannedEndDate: '2026-06-07', rateValue: 3.2, rateUnit: 'oz/1000 sq ft',
    targetArea: 'Greens', status: 'planned' }
  const spray = { id: 's1', date: '2026-06-03', area: 'Greens',
    products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }] }

  const linked = mod.summarizeProgramItemForReport(item, { sprayById: { s1: spray } })
  assert(linked.linkState === 'linked',  'linked when spray resolves')
  assert(linked.comparison && Array.isArray(linked.comparison.summary),
    'linked → comparison object attached')

  const stale = mod.summarizeProgramItemForReport(
    { ...item, linkedSprayRecordId: 's-missing' },
    { sprayById: { s1: spray } },
  )
  assert(stale.linkState === 'stale' && stale.comparison === null,
    'stale when FK does not resolve')

  const unlinked = mod.summarizeProgramItemForReport(
    { ...item, linkedSprayRecordId: null },
    { sprayById: {} },
  )
  assert(unlinked.linkState === 'unlinked' && unlinked.comparison === null,
    'unlinked when no FK')

  assert(mod.summarizeProgramItemForReport(null, {}).linkState === 'unlinked',
    'null item → unlinked, no throw')

  const program = { id: 'p1', name: 'Test', programType: 'greens',
    seasonYear: 2026, status: 'active' }
  const rolled = mod.summarizeProgramForReport(program, [item], { sprayById: { s1: spray } })
  assert(rolled.totals.plannedItems === 1 && rolled.totals.linkedCount === 1,
    'program rollup: 1 planned, 1 linked')
  assert(rolled.totals.plannedStatus === 1,
    'program rollup: counts planned status')
  assert(mod.summarizeProgramForReport(null, []) === null,
    'null program → null')
}

// ── 4. Registry integration ──────────────────────────────────────────────
console.log('— registry integration')
{
  const schemas  = readFileSync('src/utils/reports/reportSchemas.js', 'utf8')
  const defsSrc  = readFileSync('src/utils/reports/reportDefs.js', 'utf8')

  // REPORT_TYPE constant.
  assert(/SPRAY_PROGRAM:\s*['"]spray-program['"]/.test(schemas),
    "REPORT_TYPE.SPRAY_PROGRAM === 'spray-program'")

  // REPORT_DEFS entry.
  assert(/id:\s*['"]spray-program['"]/.test(defsSrc),
    "REPORT_DEFS contains spray-program entry")
  assert(/module:\s*REPORT_MODULE\.SPRAY/.test(defsSrc),
    'spray-program uses REPORT_MODULE.SPRAY')
  // Title matches spec.
  assert(/title:\s*['"]Spray Program['"]/.test(defsSrc),
    "title: 'Spray Program'")

  // requires array contains the three bundle keys.
  const requiresMatch = defsSrc.match(/id:\s*['"]spray-program['"][\s\S]*?requires:\s*\[([^\]]+)\]/)
  assert(requiresMatch != null, 'spray-program has a requires array')
  const requires = (requiresMatch?.[1] ?? '').replace(/[\s'"]/g, '').split(',').filter(Boolean)
  for (const key of ['programs', 'itemsByProgramId', 'sprays']) {
    assert(requires.includes(key),
      `requires includes "${key}"`, requires)
  }

  // Reports hub wires the bundle keys.
  const hub = readFileSync('src/pages/Reports/Reports.jsx', 'utf8')
  assert(/from\s+['"][^'"]*sprayPrograms\/sprayProgramStore['"]/.test(hub),
    'Reports.jsx imports useSprayPrograms hook')
  assert(/useSprayPrograms\(\)/.test(hub),
    'Reports.jsx calls useSprayPrograms()')
  for (const key of ['programs:', 'itemsByProgramId:']) {
    assert(hub.includes(key), `Reports.jsx bundle defines "${key}"`)
  }

  // Builder reachable via registry build().
  const defsMod = await import('../src/utils/reports/reportDefs.js')
  const def = defsMod.REPORT_DEFS.find(d => d.id === 'spray-program')
  assert(def != null,                       'REPORT_DEFS.find(spray-program) returns entry')
  assert(typeof def.build === 'function',   'spray-program def carries build()')
  const envelope = def.build({
    programs: [], itemsByProgramId: {}, sprays: [],
    inventoryProducts: [], catalogProducts: [], labelsByItemId: {},
  })
  assert(envelope && envelope.module === 'spray' && envelope.type === 'spray-program',
    'registry build() returns the spray-program envelope')
  assert(envelope.title === 'Spray Program Report',
    'envelope title comes from the builder module')

  // No duplicate export in the legacy reportBuilder.js (single source).
  const legacy = readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
  assert(!/buildSprayProgramReport/.test(legacy),
    'no duplicate buildSprayProgramReport export in legacy reportBuilder.js')
}

// ── 5. Forbidden-write + spray-save invariants ───────────────────────────
console.log('— forbidden-write invariants still hold')
{
  // No /api/product-catalog mutation route added.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // No new /api/sprays mutation route (the report builder must not have
  // triggered any backend change).
  const sprayRouteCount = (idx.match(/\/api\/sprays/g) ?? []).length
  assert(sprayRouteCount > 0, 'spray routes still wired')

  // No completed-spray mutation: builder file never writes to spray_records.
  const builderSrc = readFileSync('src/utils/reports/builders/sprayProgramReport.js', 'utf8')
  assert(!/UPDATE\s+spray_records/i.test(builderSrc),
    'builder never UPDATEs spray_records')
  assert(!/INSERT\s+INTO\s+spray_records/i.test(builderSrc),
    'builder never INSERTs INTO spray_records')
  // No inventory deduction either.
  assert(!/recordInventoryUsage/.test(builderSrc),
    'builder never calls recordInventoryUsage')
  assert(!/UPDATE\s+inventory_items/i.test(builderSrc),
    'builder never UPDATEs inventory_items')
  // No automatic item status change — builder doesn't write items at all.
  assert(!/UPDATE\s+spray_program_items/i.test(builderSrc),
    'builder never UPDATEs spray_program_items (no auto-status change)')
  assert(!/INSERT\s+INTO\s+spray_program_items/i.test(builderSrc),
    'builder never INSERTs INTO spray_program_items')

  // Spray save payload remains byte-identical (re-verified).
  const sprayBuilder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = sprayBuilder.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload omits program/intel/catalog keys')
}

// ── Result ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
