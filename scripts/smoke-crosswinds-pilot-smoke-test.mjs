// Phase 7P (2/?) — Crosswinds pilot smoke-test document smoke.
//
//   node scripts/smoke-crosswinds-pilot-smoke-test.mjs
//
// Locks:
//   - docs/crosswinds-pilot-smoke-test.md exists and is non-empty
//   - the doc carries every required top-level section
//     (Purpose, Before you start, Test data to prepare,
//      Step-by-step workflow, Expected results, Pass / fail
//      checklist, Issues to record, Exit criteria)
//   - the workflow covers every spec'd surface (inventory product,
//     catalog link, cost basis + history, spray program, planned
//     item, calendar, completed spray record, plan-vs-actual,
//     dashboard, reports, print/JSON, mobile)
//   - the pass / fail section uses GitHub-style `- [ ]` checkboxes
//     and includes the spec'd lines
//   - the issues table has the spec'd column headers
//   - the exit criteria call out the Phase 7O.1 audit + smoke suite
//   - no out-of-scope feature names appear (auto-apply, AI extraction,
//     PDF parser, invoice processor)
//   - no new endpoint added in worker/index.js (this commit ships a
//     doc + smoke; no behavior change)
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold

import { readFileSync, statSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. docs/crosswinds-pilot-smoke-test.md ────────────────────────────────
console.log('— docs/crosswinds-pilot-smoke-test.md contracts')
{
  let stat = null
  try { stat = statSync('docs/crosswinds-pilot-smoke-test.md') } catch {}
  assert(!!stat && stat.size > 0,
    'doc exists and is non-empty')

  const doc = readFileSync('docs/crosswinds-pilot-smoke-test.md', 'utf8')

  // Title.
  assert(/^# Crosswinds Pilot Smoke Test/m.test(doc),
    'doc title is "# Crosswinds Pilot Smoke Test"')

  // Top-level section headings (the eight spec'd sections).
  const sections = [
    '## 1. Purpose',
    '## 2. Before you start',
    '## 3. Test data to prepare',
    '## 4. Step-by-step workflow',
    '## 5. Expected results',
    '## 6. Pass / fail checklist',
    '## 7. Issues to record',
    '## 8. Exit criteria',
  ]
  for (const h of sections) {
    assert(doc.includes(h), `doc has heading "${h}"`)
  }

  // Workflow sub-steps (4.1 .. 4.12). The numbering is locked so the
  // pilot can be followed without scrolling for context.
  for (const sub of [
    '### 4.1 Dashboard — initial render',
    '### 4.2 Inventory — add the product',
    '### 4.3 Product Catalog link',
    '### 4.4 Cost basis',
    '### 4.5 Cost basis history',
    '### 4.6 Spray Program — create + plan',
    '### 4.7 Completed spray record',
    '### 4.8 Plan-vs-actual link',
    '### 4.9 Calendar surface',
    '### 4.10 Dashboard — reflects the data',
    '### 4.11 Reports',
    '### 4.12 Mobile field check',
  ]) {
    assert(doc.includes(sub), `workflow includes "${sub}"`)
  }

  // The doc must reference every spec'd surface somewhere. We
  // normalize whitespace before the includes check so Markdown
  // line-wrapping inside numbered steps (e.g. `**Cost\n   basis
  // stewardship**`) doesn't trigger a false negative.
  const docNorm = doc.replace(/\s+/g, ' ')
  for (const phrase of [
    'Inventory → Products',
    'Product Catalog',
    'Cost basis stewardship',
    'Cost basis history',
    'Spray → Program Planner',
    'Spray → Program Calendar',
    'Spray → Spray Records',
    'Reports',
    'Plan vs Actual',
    'Dashboard',
    'Operations',
    'Stewardship Alerts',
    'Spray Program Snapshot',
  ]) {
    assert(docNorm.includes(phrase),
      `doc references "${phrase}"`)
  }

  // Reports section calls out the three Phase-7 reports.
  for (const reportName of [
    'Spray Intelligence', 'Spray Program', 'Spray Program Cost',
  ]) {
    assert(doc.includes(reportName),
      `doc lists "${reportName}" report`)
  }

  // Pass/fail checklist is a real Markdown checklist.
  const checkboxLines = (doc.match(/^\s*- \[ \] /gm) ?? []).length
  assert(checkboxLines >= 20,
    `doc has at least 20 pass/fail checkbox lines (found ${checkboxLines})`)
  // Key pass/fail items are pinned verbatim.
  for (const line of [
    'No console-breaking crash during the full test.',
    'Cost basis saves and is reflected on the drawer.',
    'Catalog link saves and Link Review confirms it.',
    'Plan vs Actual chips render with neutral language.',
    'Spray Intelligence report generates with custom preview.',
    'Spray Program report generates with custom preview.',
    'Spray Program Cost report generates with custom preview.',
    'Print HTML opens cleanly.',
    'JSON export downloads with the spec',
    'Phone use is acceptable',
  ]) {
    assert(doc.includes(line),
      `pass/fail item present: "${line.slice(0, 60)}…"`)
  }

  // Issues table — locked headers.
  assert(/\|\s*Area\s*\|\s*What happened\s*\|\s*Expected behavior\s*\|\s*Device \/ browser\s*\|\s*Screenshot taken\?\s*\|\s*Priority\s*\|/.test(doc),
    'issues table carries every spec\'d column header')
  // Priority labels.
  for (const p of ['`blocker`', '`warning`', '`nit`']) {
    assert(doc.includes(p),
      `issues priority label present: ${p}`)
  }

  // Exit criteria calls out the Phase 7O.1 audit + the smoke suite.
  assert(/audit-operational-readiness/.test(doc),
    'exit criteria references the Phase 7O.1 audit script')
  assert(/npm run smoke/.test(doc),
    'exit criteria references the smoke suite')
  assert(/Blockers:\s*0/.test(doc),
    'exit criteria pins "Blockers: 0" as the audit gate')

  // The doc never instructs the user to invoke an out-of-scope
  // feature (the same lockout the Phase 7P.1 onboarding doc has).
  for (const phrase of [
    'auto-apply', 'apply automatically', 'fix automatically',
    'ai extraction', 'pdf parser', 'invoice processor',
  ]) {
    const re = new RegExp(`\\b${phrase}\\b`, 'i')
    assert(!re.test(doc),
      `doc never mentions out-of-scope feature "${phrase}"`)
  }
}

// ── 2. No new endpoint / mutation behavior added in this commit ──────────
console.log('— Phase 7P.2 ships a doc + smoke only — no behavior change')
{
  // worker/index.js untouched: no new pilot / onboarding / smoke
  // route appeared.
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/pilot-smoke-test', '/smoke-test', '/dashboard/pilot-smoke',
    '/crosswinds-smoke', '/onboarding/smoke',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }

  // Phase 7J.1 + 7M.1 endpoints still wired (regression).
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js still avoids the forbidden surfaces.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js never references ${verb}`)
  }
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')

  // inventoryStore unchanged.
  const store = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  const storeCode = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'bulkApplyCostBasis', 'applyCostImport', 'commitCostImport',
    'uploadCostImport',   'parseCostImport',
    'parseInvoice', 'parsePdf', 'extractWithAi',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(storeCode),
      `inventoryStore still never references ${verb}`)
  }
  assert(/setInventoryCostBasis/.test(storeCode),
    'Phase 7J.1 setInventoryCostBasis still exported')
  assert(/listInventoryCostBasisAudit/.test(storeCode),
    'Phase 7M.1 listInventoryCostBasisAudit still exported')

  // Phase 7F.4 /completed-link still the sole linkedSprayRecordId
  // write site.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
