// Phase 7P (1/?) — Crosswinds Pilot Onboarding Checklist smoke.
//
//   node scripts/smoke-crosswinds-pilot-onboarding.mjs
//
// Locks:
//   - docs/crosswinds-pilot-onboarding.md exists and is non-empty
//   - the doc carries every required section heading (Inventory
//     setup, Product Catalog linking, Cost basis setup, Spray
//     Program entry, Completed spray record linking, Dashboard
//     review, Report generation, Mobile field test, Backup /
//     export test)
//   - the doc lists the spec'd minimum-data items
//   - the doc includes a pilot acceptance gate
//   - the in-app CrosswindsPilotChecklist component renders and
//     mirrors the doc's nine steps
//   - the panel exposes the spec'd title + subtitle copy
//   - the panel is read-only: no fetch / no /api/ / no method
//     strings / no mutation verbs / no Apply / Fix / Save /
//     Commit / Edit / Delete labels
//   - Dashboard.jsx mounts the panel inside <MorePanels>
//   - no new worker endpoint added in this commit
//   - the boundary regression guards still hold (Phase 7F.4,
//     Phase 7J.1, Phase 7M.1)

import { readFileSync, statSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. docs/crosswinds-pilot-onboarding.md ───────────────────────────────
console.log('— docs/crosswinds-pilot-onboarding.md contracts')
{
  let stat = null
  try { stat = statSync('docs/crosswinds-pilot-onboarding.md') } catch {}
  assert(!!stat && stat.size > 0,
    'docs/crosswinds-pilot-onboarding.md exists and is non-empty')

  const doc = readFileSync('docs/crosswinds-pilot-onboarding.md', 'utf8')

  // Title.
  assert(/^# Crosswinds Pilot Onboarding/m.test(doc),
    'doc title is "# Crosswinds Pilot Onboarding"')

  // Required section headings.
  for (const heading of [
    '## 1. Inventory setup',
    '## 2. Product Catalog linking',
    '## 3. Cost basis setup',
    '## 4. Spray Program entry',
    '## 5. Completed spray record linking',
    '## 6. Dashboard review',
    '## 7. Report generation',
    '## 8. Mobile field test',
    '## 9. Backup / export test',
    '## Pilot acceptance gate',
  ]) {
    assert(doc.includes(heading),
      `doc has heading "${heading}"`)
  }

  // Minimum-data line items appear in some readable form.
  for (const phrase of [
    'cost per unit', 'planned spray', 'completed spray record',
    'catalog link', 'spray program',
  ]) {
    assert(new RegExp(`\\b${phrase}\\b`, 'i').test(doc),
      `doc mentions minimum-data item "${phrase}"`)
  }

  // Pilot acceptance gate calls out the audit script + smoke suite.
  assert(/audit-operational-readiness/.test(doc),
    'doc references the Phase 7O.1 audit script')
  assert(/npm run smoke/.test(doc),
    'doc references the full smoke suite')

  // The doc never instructs the user to invoke a forbidden action.
  // This list is intentionally narrow: phrases like "deduct
  // inventory" / "create budget entry" legitimately appear in the
  // doc when it explains what the system DOES NOT do, so blocking
  // those mentions wholesale would be fragile.
  // What we DO block are positive imperatives that would imply
  // a feature we haven't built (auto-apply, fix-it-for-me, AI
  // recommendations).
  for (const phrase of [
    'auto-apply', 'apply automatically', 'fix automatically',
    'ai extraction', 'pdf parser', 'invoice processor',
  ]) {
    const re = new RegExp(`\\b${phrase}\\b`, 'i')
    assert(!re.test(doc),
      `doc never mentions out-of-scope feature "${phrase}"`)
  }
}

// ── 2. In-app checklist component ────────────────────────────────────────
console.log('— src/pages/Dashboard/CrosswindsPilotChecklist.jsx contracts')
{
  const src = readFileSync('src/pages/Dashboard/CrosswindsPilotChecklist.jsx', 'utf8')

  assert(/export\s+default\s+function\s+CrosswindsPilotChecklist/.test(src),
    'default exports CrosswindsPilotChecklist')

  // Title + subtitle verbatim per spec.
  assert(src.includes('Crosswinds Pilot Setup'),
    'panel title is "Crosswinds Pilot Setup"')
  assert(src.includes('Use this checklist to prepare TurfIntel for daily operational use.'),
    'panel subtitle copy verbatim')

  // Nine steps mirror the doc.
  for (const stepTitle of [
    '1. Inventory setup',
    '2. Product Catalog linking',
    '3. Cost basis setup',
    '4. Spray Program entry',
    '5. Completed spray record linking',
    '6. Dashboard review',
    '7. Report generation',
    '8. Mobile field test',
    '9. Backup / export test',
  ]) {
    assert(src.includes(stepTitle),
      `panel step "${stepTitle}" present`)
  }

  // Deep-link routing only — uses useNavigate.
  assert(/from\s+['"]react-router-dom['"]/.test(src) && /useNavigate/.test(src),
    'panel uses react-router-dom useNavigate for routing')

  // Routes point at existing surfaces only.
  for (const route of [
    "'/inventory'", "'/spray'", "'/reports'", "'/dashboard'",
  ]) {
    assert(src.includes(route),
      `panel includes route ${route}`)
  }

  // No write surface — no fetch, no /api/, no POST/PATCH/DELETE,
  // no mutation verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'panel does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'panel never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'panel issues no direct POST/PATCH/DELETE')

  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
    'setInventoryCostBasis',  'patchInventoryCostBasis',
    'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `panel never references ${verb}`)
  }

  // No fix / apply / save / commit / edit / delete labels.
  for (const phrase of [
    'Fix automatically', 'Apply All', 'Apply Now', 'Commit',
    'Edit step', 'Delete step', 'Save checklist', 'Reset checklist',
  ]) {
    const re = new RegExp(`>\\s*${phrase}\\s*<`)
    assert(!re.test(src),
      `no >${phrase}< JSX text on the panel`)
  }

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `panel code-only avoids "${word}"`)
  }
}

// ── 3. CSS module contracts ──────────────────────────────────────────────
console.log('— CrosswindsPilotChecklist.module.css contracts')
{
  const css = readFileSync('src/pages/Dashboard/CrosswindsPilotChecklist.module.css', 'utf8')
  for (const cls of [
    'panel', 'header', 'toggle', 'toggleChevron', 'title', 'counter',
    'subtitle', 'body', 'list', 'row', 'row_done',
    'checkboxLabel', 'checkbox',
    'stepMain', 'stepTitle', 'stepDetail',
    'openBtn', 'boundaryNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css),
      `CSS defines .${cls}`)
  }
  assert(/@media\s*\(max-width:\s*700px\)/.test(css),
    'CSS defines mobile breakpoint at 700px')
}

// ── 4. Dashboard.jsx mounts the panel ────────────────────────────────────
console.log('— Dashboard.jsx mounts <CrosswindsPilotChecklist />')
{
  const src = readFileSync('src/pages/Dashboard/Dashboard.jsx', 'utf8')
  assert(/import\s+CrosswindsPilotChecklist\s+from\s+['"]\.\/CrosswindsPilotChecklist['"]/.test(src),
    'Dashboard imports CrosswindsPilotChecklist')
  assert(/<CrosswindsPilotChecklist\s*\/>/.test(src),
    'Dashboard mounts <CrosswindsPilotChecklist />')
  // Wrapped in a DashboardCard titled "Crosswinds Pilot Setup".
  assert(/<DashboardCard\s+title="Crosswinds Pilot Setup"/.test(src),
    'Dashboard renders <DashboardCard title="Crosswinds Pilot Setup">')
  // The panel lives inside MorePanels so daily use isn't cluttered.
  assert(/<MorePanels>[\s\S]*<CrosswindsPilotChecklist[\s\S]*<\/MorePanels>/.test(src),
    'panel is mounted inside <MorePanels>')
}

// ── 5. No new endpoint / mutation behavior added ─────────────────────────
console.log('— no new endpoint / no new mutation behavior introduced')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/pilot-onboarding', '/onboarding',
    '/dashboard/pilot', '/crosswinds',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7J.1 + 7M.1 endpoints still wired.
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js avoids PDF / invoice / AI / budget / invoice / ledger.
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

  // Phase 7F.4 still wired.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
