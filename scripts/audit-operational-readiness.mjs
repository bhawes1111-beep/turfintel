// Phase 7O (1/?) — Operational Readiness Audit script.
//
//   node scripts/audit-operational-readiness.mjs
//
// Codebase-level audit that scans dashboard mounts, store wiring,
// worker routes, report registrations, export contracts, and the
// read-only boundaries that the Phase 7-series committed. Writes
// docs/operational-readiness-audit.md.
//
// The script never starts a server, never touches the network, never
// mutates state. It is a source-level scanner that produces a
// markdown report with three buckets:
//
//   - green   : passing checks
//   - warning : non-blocking; surfaces a soft expectation gap
//   - blocker : something the system needs to be operational
//
// Exit code 0 always (so CI doesn't block on warnings), but the
// report header includes the counts so a smoke / CI step can grep
// for "Blockers: 0" to gate releases.

import { readFileSync, writeFileSync } from 'fs'

const checks = []       // { area, severity, title, detail }
function ok(area, title, detail) {
  checks.push({ area, severity: 'green', title, detail: detail ?? '' })
}
function warn(area, title, detail) {
  checks.push({ area, severity: 'warning', title, detail: detail ?? '' })
}
function block(area, title, detail) {
  checks.push({ area, severity: 'blocker', title, detail: detail ?? '' })
}

function safeRead(path) {
  try { return readFileSync(path, 'utf8') } catch { return null }
}

// ── 1. Dashboard mounts required components ──────────────────────────────
{
  const src = safeRead('src/pages/Dashboard/Dashboard.jsx')
  if (!src) {
    block('Dashboard', 'Dashboard.jsx missing',
      'src/pages/Dashboard/Dashboard.jsx could not be read.')
  } else {
    const mounts = [
      ['Operations Strip', /<DashboardOperationsStrip\s*\/>/, 'Phase 7N.3'],
      ['Stewardship Alerts', /<StewardshipAlerts\s*\/>/, 'Phase 7N.1'],
      ['Spray Program Snapshot', /<SprayProgramSnapshot\s*\/>/, 'Phase 7N.2'],
      ['Overnight Changes',     /<OvernightChanges\s*\/>/, 'Phase 6A'],
      ['Crew Readiness',        /<CrewReadiness\s*\/>/,    'Phase 6A.2'],
      ['Spray Window Card',     /<SprayWindowCard\s*\/>/,  'Phase 6A'],
      ['Operational Command',   /<OperationalCommand\s*\/>/, 'Phase 29'],
      ['Action Queue',          /<ActionQueue\s*\/>/,      'Phase 29'],
    ]
    for (const [label, re, source] of mounts) {
      if (re.test(src)) ok('Dashboard', `${label} mounted (${source})`)
      else              block('Dashboard', `${label} not mounted`,
        `Expected ${re.source} in Dashboard.jsx (${source}).`)
    }
  }
}

// ── 2. Critical stores are wired ─────────────────────────────────────────
{
  const stores = [
    ['inventory',       'src/utils/inventory/inventoryStore.js',           'useInventoryData'],
    ['product catalog', 'src/utils/productCatalog/productCatalogStore.js', 'useProductCatalog'],
    ['spray programs',  'src/utils/sprayPrograms/sprayProgramStore.js',    'useSprayPrograms'],
    ['sprays',          'src/utils/sprays/spraysStore.js',                 'useSpraysData'],
    ['imported labels', 'src/utils/inventory/labelImportStore.js',         'useImportedLabels'],
  ]
  for (const [label, path, hook] of stores) {
    const src = safeRead(path)
    if (!src) {
      block('Stores', `${label} store missing`, `${path} could not be read.`)
      continue
    }
    if (new RegExp(`export\\s+(?:function|const)\\s+${hook}\\b`).test(src)) {
      ok('Stores', `${label} store exposes ${hook}()`)
    } else {
      block('Stores', `${label} store does not export ${hook}()`,
        `Could not find an export of ${hook} in ${path}.`)
    }
  }
}

// ── 3. Critical routes exist ─────────────────────────────────────────────
{
  const worker = safeRead('worker/index.js') ?? ''
  const routes = [
    ['/api/inventory',                              /pathname\s*===\s*['"]\/api\/inventory['"]/,                                   'listInventory + createInventory'],
    ['/api/inventory/:id',                          /\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\$/,                                'getInventory + updateInventory + deleteInventory'],
    ['/api/inventory/:id/catalog-link',             /\\\/catalog-link\$/,                                                       'Phase 7C.2 narrow catalog-link patch'],
    ['/api/inventory/:id/cost-basis',               /\\\/cost-basis\$/,                                                          'Phase 7J.1 narrow cost-basis patch'],
    ['/api/inventory/:id/cost-basis-audit',         /\\\/cost-basis-audit\$/,                                                    'Phase 7M.1 audit read'],
    ['/api/spray-programs',                         /pathname\s*===\s*['"]\/api\/spray-programs['"]/,                              'Phase 7F.1 program CRUD'],
    ['/api/spray-programs/:id/items',               /\^\\\/api\\\/spray-programs\\\/\(\[\^\/\]\+\)\\\/items\$/,                  'Phase 7F.1 items CRUD'],
    ['/api/spray-program-items/:itemId/completed-link', /\^\\\/api\\\/spray-program-items\\\/\(\[\^\/\]\+\)\\\/completed-link\$/, 'Phase 7F.4 completed-link write site'],
    ['/api/product-catalog',                        /pathname\s*===\s*['"]\/api\/product-catalog['"]/,                             'Phase 7C.1 catalog list (GET only)'],
    ['/api/product-catalog/:id',                    /\^\\\/api\\\/product-catalog\\\/\(\[\^\/\]\+\)\$/,                          'Phase 7C.1 catalog read (GET only)'],
    ['/api/sprays',                                 /pathname\s*===\s*['"]\/api\/sprays['"]/,                                       'Phase 5.2 spray CRUD'],
  ]
  for (const [label, re, what] of routes) {
    if (re.test(worker)) ok('Routes', `${label} wired (${what})`)
    else                 block('Routes', `${label} NOT wired`,
      `Expected ${re.source} in worker/index.js.`)
  }
  // SPA routes. The Phase 7-series routes are nested children of
  // <Route path="/">, so the path attribute is "inventory" /
  // "spray/*" rather than "/inventory" — accept both forms.
  const app = safeRead('src/App.jsx') ?? ''
  for (const route of ['inventory', 'spray', 'reports', 'dashboard']) {
    const re = new RegExp(`path=['"]\\/?${route}(?:\\/\\*)?['"]`)
    if (re.test(app)) {
      ok('Routes', `SPA route /${route} mounted`)
    } else {
      warn('Routes', `SPA route /${route} not found in App.jsx`,
        `Could not find a path matching ${re.source} in src/App.jsx — verify routing.`)
    }
  }
}

// ── 4. Critical read-only boundaries still hold ──────────────────────────
{
  // product_catalog: GET-only.
  const worker = safeRead('worker/index.js') ?? ''
  const pcBlock = worker.match(
    /\/\/ ─+ \/api\/product-catalog ─+[\s\S]*?\/\/ ─+/,
  ) ?? worker.match(/\/api\/product-catalog[\s\S]{0,2000}/)
  if (pcBlock && /method\s*===\s*['"](POST|PATCH|DELETE)['"]/.test(pcBlock[0])) {
    block('Boundaries', 'product_catalog has a mutation handler',
      'Found a POST/PATCH/DELETE branch inside the /api/product-catalog block.')
  } else {
    ok('Boundaries', 'product_catalog routes are GET-only')
  }

  // No dashboard mutation actions: every dashboard component file
  // should be free of mutation method strings + write verbs.
  const dashFiles = [
    'src/pages/Dashboard/StewardshipAlerts.jsx',
    'src/pages/Dashboard/SprayProgramSnapshot.jsx',
    'src/pages/Dashboard/DashboardOperationsStrip.jsx',
  ]
  for (const path of dashFiles) {
    const src = safeRead(path)
    if (!src) { warn('Boundaries', `${path} missing`); continue }
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const verbHits = [
      'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
      'setProgramItemCompletedLink', 'patchInventoryCostBasis',
      'setInventoryCostBasis', 'createBudgetEntry', 'createInvoice',
      'createLedgerEntry',
    ].filter(v => new RegExp(`\\b${v}\\b`).test(codeOnly))
    if (verbHits.length > 0) {
      block('Boundaries', `${path} references mutation verbs`,
        `Found: ${verbHits.join(', ')}`)
    } else {
      ok('Boundaries', `${path} carries no mutation verbs`)
    }
    if (/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly)) {
      block('Boundaries', `${path} issues a direct POST/PATCH/DELETE`,
        'Dashboard surfaces must never issue mutations directly.')
    } else {
      ok('Boundaries', `${path} issues no direct mutations`)
    }
  }

  // Planned item inventory deduction guard.
  const planner = safeRead('src/utils/sprayPrograms/sprayProgramStore.js') ?? ''
  // Strip JS comments so doc-only mentions of what the store DOES NOT
  // do (e.g. "NEVER calls createSpray or recordInventoryUsage") are
  // not flagged as leaks.
  const plannerCode = planner
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  if (/recordInventoryUsage\s*\(|inventory_usage/.test(plannerCode)) {
    block('Boundaries', 'sprayProgramStore references inventory deduction',
      'Phase 7F invariant: spray-program writes must never deduct inventory.')
  } else {
    ok('Boundaries', 'sprayProgramStore never deducts inventory')
  }
  if (/createSpray\s*\(/.test(plannerCode)) {
    block('Boundaries', 'sprayProgramStore references createSpray',
      'Phase 7F invariant: spray-program writes must never create spray_records.')
  } else {
    ok('Boundaries', 'sprayProgramStore never creates a spray record')
  }

  // Spray Program Planner / Calendar must not reach into the audit
  // editor or the import-apply flows.
  for (const path of [
    'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
    'src/pages/Spray/tabs/components/ProgramCalendarItemDrawer.jsx',
  ]) {
    const src = safeRead(path) ?? ''
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    if (/\bsetInventoryCostBasis\b/.test(codeOnly) ||
        /\bpatchInventoryCostBasis\b/.test(codeOnly)) {
      warn('Boundaries', `${path} can write cost basis`,
        'Calendar surface should remain read-only over cost basis.')
    } else {
      ok('Boundaries', `${path} cannot write cost basis (read-only)`)
    }
  }
}

// ── 5. Critical UX states exist ──────────────────────────────────────────
{
  const uxFiles = [
    {
      path: 'src/pages/Inventory/components/CostBasisEditor.jsx',
      label: 'Cost Basis Editor',
      states: {
        empty:   /No cost basis changes recorded yet\./,
        loading: /Loading history…/,
        error:   /Unable to load cost basis history\./,
      },
    },
    {
      path: 'src/pages/Inventory/components/CostBasisImportReview.jsx',
      label: 'Cost Import Review',
      states: {
        empty:   /No rows parsed/,
      },
    },
    {
      path: 'src/pages/Dashboard/StewardshipAlerts.jsx',
      label: 'Stewardship Alerts',
      states: {
        empty:   /No stewardship alerts right now\./,
      },
    },
    {
      path: 'src/pages/Dashboard/SprayProgramSnapshot.jsx',
      label: 'Spray Program Snapshot',
      states: {
        empty:   /No upcoming planned items in the next week\./,
      },
    },
  ]
  for (const file of uxFiles) {
    const src = safeRead(file.path)
    if (!src) {
      warn('UX states', `${file.label} source missing`, file.path)
      continue
    }
    for (const [state, re] of Object.entries(file.states)) {
      if (re.test(src)) ok('UX states', `${file.label} has ${state} state copy`)
      else              warn('UX states', `${file.label} missing ${state} state`,
        `Expected ${re.source} in ${file.path}.`)
    }
  }

  // Mobile breakpoint coverage: every Phase 7-series CSS module
  // should carry at least one @media query.
  const cssFiles = [
    'src/pages/Inventory/components/CostBasisEditor.module.css',
    'src/pages/Inventory/components/CostBasisImportReview.module.css',
    'src/pages/Dashboard/StewardshipAlerts.module.css',
    'src/pages/Dashboard/SprayProgramSnapshot.module.css',
    'src/pages/Dashboard/DashboardOperationsStrip.module.css',
  ]
  for (const path of cssFiles) {
    const css = safeRead(path)
    if (!css) { warn('UX states', `${path} missing`); continue }
    if (/@media\b/.test(css)) ok('UX states', `${path} has at least one @media query`)
    else                       warn('UX states', `${path} has no @media query`,
      'Expected at least one responsive breakpoint.')
  }
}

// ── 6. Critical report registrations ─────────────────────────────────────
{
  const defs = safeRead('src/utils/reports/reportDefs.js') ?? ''
  for (const id of ['spray-intelligence', 'spray-program', 'spray-program-cost']) {
    if (new RegExp(`id:\\s*['"]${id}['"]`).test(defs)) {
      ok('Reports', `report registered: ${id}`)
    } else {
      block('Reports', `report not registered: ${id}`,
        `Expected id: '${id}' inside src/utils/reports/reportDefs.js.`)
    }
  }

  // Custom-preview dispatcher entries.
  const preview = safeRead('src/components/reports/ReportPreviewModal.jsx') ?? ''
  for (const [key, label] of [
    ['SPRAY_INTELLIGENCE', 'Spray Intelligence preview'],
    ['SPRAY_PROGRAM',      'Spray Program preview'],
    ['SPRAY_PROGRAM_COST', 'Spray Program Cost preview'],
  ]) {
    if (new RegExp(`REPORT_TYPE\\.${key}`).test(preview)) {
      ok('Reports', `${label} wired into dispatcher`)
    } else {
      warn('Reports', `${label} not wired into dispatcher`,
        `Expected REPORT_TYPE.${key} mapping in ReportPreviewModal.jsx.`)
    }
  }
}

// ── 7. Critical export contracts ─────────────────────────────────────────
{
  const builders = [
    ['src/utils/reports/builders/sprayIntelligenceReport.js', 'spray-intelligence'],
    ['src/utils/reports/builders/sprayProgramReport.js',      'spray-program'],
    ['src/utils/reports/builders/sprayProgramCostReport.js',  'spray-program-cost'],
  ]
  const requiredKeys = [
    'exportVersion', 'reportKind', 'generatedBy', 'generatedAt',
    'totals', 'notices', 'disclaimer', 'printExtras',
  ]
  for (const [path, kind] of builders) {
    const src = safeRead(path)
    if (!src) { block('Exports', `${path} missing`, kind); continue }
    // Accept both `key:` form and ES6 shorthand `key,` / `key\n` so
    // a builder that does `metadata = { …, generatedAt, notices, … }`
    // still passes.
    const missing = requiredKeys.filter(k =>
      !new RegExp(`\\b${k}\\b\\s*[:,\\n]`).test(src),
    )
    if (missing.length === 0) {
      ok('Exports', `${kind} envelope carries every export key`)
    } else {
      block('Exports', `${kind} envelope missing keys`, `Missing: ${missing.join(', ')}`)
    }
  }
}

// ── 8. Phase 7-series critical regression guards ─────────────────────────
{
  const planner = safeRead('src/utils/sprayPrograms/sprayProgramStore.js') ?? ''
  if (/\/completed-link\b/.test(planner)) {
    ok('Regressions', 'Phase 7F.4 /completed-link route still present')
  } else {
    block('Regressions', 'Phase 7F.4 /completed-link route missing',
      'sprayProgramStore must still reference the /completed-link write surface.')
  }

  const store = safeRead('src/utils/inventory/inventoryStore.js') ?? ''
  if (/setInventoryCostBasis/.test(store) && /listInventoryCostBasisAudit/.test(store)) {
    ok('Regressions', 'Phase 7J.1 + 7M.1 cost-basis wrappers still present')
  } else {
    block('Regressions', 'inventoryStore missing cost-basis wrappers',
      'Expected setInventoryCostBasis + listInventoryCostBasisAudit.')
  }

  // The narrow cost-basis endpoint must continue to write the
  // cost-basis cluster only.
  const api = safeRead('worker/api/inventory.js') ?? ''
  const fn = api.match(/export\s+async\s+function\s+patchInventoryCostBasis[\s\S]*?\n\}\n/)
  if (fn) {
    const body = fn[0]
    if (/INSERT\s+INTO\s+inventory_cost_basis_audit/i.test(body)) {
      ok('Regressions', 'patchInventoryCostBasis writes inventory_cost_basis_audit (7M.1)')
    } else {
      block('Regressions', 'patchInventoryCostBasis no longer writes the audit row',
        'Phase 7M.1 invariant: every successful cost-basis update must write an audit row.')
    }
    if (/\bquantity\s*=/.test(body)) {
      block('Regressions', 'patchInventoryCostBasis writes inventory.quantity',
        'Phase 7J.1 invariant: cost-basis endpoint must never deduct inventory.')
    } else {
      ok('Regressions', 'patchInventoryCostBasis never deducts inventory')
    }
    if (/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(body)) {
      block('Regressions', 'patchInventoryCostBasis writes product_catalog',
        'Catalog is read-only; cost-basis endpoint must never touch it.')
    } else {
      ok('Regressions', 'patchInventoryCostBasis never writes product_catalog')
    }
  } else {
    warn('Regressions', 'patchInventoryCostBasis body not extractable',
      'Could not locate the function body in worker/api/inventory.js.')
  }
}

// ── 9. Build report ──────────────────────────────────────────────────────

const counts = checks.reduce((acc, c) => {
  acc[c.severity] = (acc[c.severity] ?? 0) + 1
  return acc
}, { green: 0, warning: 0, blocker: 0 })

const byArea = new Map()
for (const c of checks) {
  if (!byArea.has(c.area)) byArea.set(c.area, [])
  byArea.get(c.area).push(c)
}

const liveChecklist = [
  'Open Dashboard, confirm Operations strip, Stewardship Alerts, and Spray Program Snapshot all render with current data.',
  'Open Inventory → Products: confirm a row drawer shows Cost basis stewardship + Cost basis history panel.',
  'Open Inventory → Products → Cost Import Review: paste a sample CSV, hit Preview rows, confirm row tiles render.',
  'Open Spray → Program Planner: select a program, confirm Cost basis review chips + planner intel chips render.',
  'Open Spray → Program Calendar: confirm month grid, agenda, and filters render; tap a chip → drawer opens.',
  'Open Reports: confirm Spray Intelligence, Spray Program, and Spray Program Cost cards are listed.',
  'Phone viewport: confirm Cost Import Review tiles stack 2-up and history toggle still works.',
  'Run `npm run smoke` — expect every script to pass and the assertion total to match the latest commit.',
].map((s, i) => `${i + 1}. ${s}`).join('\n')

const nextFixes = [
  ...counts.blocker > 0
    ? checks.filter(c => c.severity === 'blocker').map(c => `- **[${c.area}] ${c.title}** — ${c.detail || 'see commit history.'}`)
    : ['- _No blockers detected._'],
  ...counts.warning > 0
    ? checks.filter(c => c.severity === 'warning').map(c => `- _[warning]_ **[${c.area}] ${c.title}** — ${c.detail || 'see commit history.'}`)
    : [],
].join('\n')

const headline = counts.blocker === 0
  ? counts.warning === 0
    ? '✅ **All operational readiness checks passing.** Safe to ship more features.'
    : '⚠ **Operational readiness is green with warnings.** Review warnings before next ship.'
  : '⛔ **Operational readiness is BLOCKED.** Address the blockers below before shipping.'

const sections = []
sections.push(`# Operational Readiness Audit`)
sections.push('')
sections.push(`_Generated by \`scripts/audit-operational-readiness.mjs\`._`)
sections.push('')
sections.push(`## Summary`)
sections.push('')
sections.push(headline)
sections.push('')
sections.push(`- **Green checks**: ${counts.green}`)
sections.push(`- **Warnings**: ${counts.warning}`)
sections.push(`- **Blockers**: ${counts.blocker}`)
sections.push('')

sections.push(`## Findings`)
sections.push('')
for (const [area, items] of byArea) {
  sections.push(`### ${area}`)
  sections.push('')
  for (const c of items) {
    const icon = c.severity === 'green' ? '✅'
               : c.severity === 'warning' ? '⚠'
               : '⛔'
    sections.push(`- ${icon} **${c.title}**${c.detail ? ` — ${c.detail}` : ''}`)
  }
  sections.push('')
}

sections.push(`## Recommended next fixes`)
sections.push('')
sections.push(nextFixes)
sections.push('')

sections.push(`## Suggested live testing checklist`)
sections.push('')
sections.push(liveChecklist)
sections.push('')

const report = sections.join('\n')
writeFileSync('docs/operational-readiness-audit.md', report)

// Console summary so a CI step can grep without reading the file.
console.log('Operational Readiness Audit')
console.log('---------------------------')
console.log(`Green checks: ${counts.green}`)
console.log(`Warnings:     ${counts.warning}`)
console.log(`Blockers:     ${counts.blocker}`)
console.log('')
console.log(`Report written to docs/operational-readiness-audit.md`)

// Always exit 0; smoke / CI grep the report for "Blockers: 0".
process.exit(0)
