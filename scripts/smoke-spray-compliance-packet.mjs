// Phase S.5c.2 — Spray date-range compliance packet smoke.
//
//   node scripts/smoke-spray-compliance-packet.mjs
//
// Pins:
//   • New buildSprayCompliancePacket() builder in reportBuilder.js.
//   • Builder reads snapshot fields only — never re-resolves against
//     the live product catalog.
//   • Builder produces a Compliance Summary section + one section
//     per record + an empty-state TEXT section when records=[].
//   • Export button wired into SprayRecords, uses `visible` (filtered
//     set), and refuses to generate on empty result.
//   • Existing single-record Generate Report flow + S.5a.1 Edit
//     modal + S.5c.1 filters all preserved.
//   • No worker / migration / product-catalog write / builder
//     calculation changes.

import { readFileSync, readdirSync } from 'fs'
import {
  buildSprayCompliancePacket,
  buildSpraySummaryReport,
} from '../src/utils/reports/reportBuilder.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const RB       = readFileSync('src/utils/reports/reportBuilder.js',            'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',         'utf8')
const REPORTS  = readFileSync('src/pages/Spray/tabs/SprayReports.jsx',         'utf8')
const MODAL    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx', 'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',              'utf8')
const STORE    = readFileSync('src/utils/sprays/spraysStore.js',               'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                          'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                  'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',             'utf8')

const RB_CODE      = stripComments(RB)
const RECORDS_CODE = stripComments(RECORDS)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

// ── New builder export ──────────────────────────────────────────────
section('buildSprayCompliancePacket — exported + signature')

assert(/^export function buildSprayCompliancePacket\(records = \[\], options = \{\}\)/m.test(RB),
  'buildSprayCompliancePacket exported with (records, options) signature')

// formatProductLine + formatWeatherLine helpers exist.
assert(/^function formatProductLine\(p\)/m.test(RB),
  'formatProductLine helper defined')
assert(/^function formatWeatherLine\(c\)/m.test(RB),
  'formatWeatherLine helper defined')

// Phase S.6a — Builder imports the shared recordNeedsInfo helper
// from src/utils/sprays/recordNeedsInfo.js (no more local copy).
assert(/import \{ recordNeedsInfo \} from '\.\.\/sprays\/recordNeedsInfo\.js'/.test(RB),
  'reportBuilder imports the shared recordNeedsInfo helper (S.6a)')
assert(!/^function recordNeedsInfoLocal\(record\)/m.test(RB),
  'reportBuilder no longer declares a local recordNeedsInfoLocal copy (S.6a)')

// ── Builder reads ONLY snapshot fields for compliance data ──────────
section('Snapshot integrity — builder never re-resolves the product catalog')

// Negative pins: no live-catalog lookups inside the builder.
const builderMatch = RB.match(/^export function buildSprayCompliancePacket[\s\S]*?\n\}/m)
const builderSrc   = builderMatch ? builderMatch[0] : ''
assert(builderSrc.length > 0, 'buildSprayCompliancePacket body extracted')
const builderCode = stripComments(builderSrc)
assert(!/fetch\(|getProductCatalog|listProductCatalog|resolveSprayProduct/.test(builderCode),
  'builder does NOT fetch / look up / resolve against the product catalog')

// Positive pins — the formatProductLine helper reads the snapshot keys.
const fmtMatch = RB.match(/^function formatProductLine\(p\)\s*\{[\s\S]*?\n\}/m)
const fmtSrc   = fmtMatch ? fmtMatch[0] : ''
for (const snap of [
  'p\\.epaNumberSnapshot',
  'p\\.activeIngredientsSnapshot',
  'p\\.totalCostSnapshot',
]) {
  assert(new RegExp(snap).test(fmtSrc),
    `formatProductLine reads ${snap.replace('\\.', '.')}`)
}
// Negative pins on the per-product helper.
assert(!/p\.epaNumber(?!Snapshot)/.test(fmtSrc),
  'formatProductLine does NOT read p.epaNumber (live catalog field)')
assert(!/p\.activeIngredients(?!Snapshot)/.test(fmtSrc),
  'formatProductLine does NOT read p.activeIngredients (live catalog field)')

// ── Builder behavior — pure functional checks ───────────────────────
section('Builder — Compliance Summary + per-record sections + empty handling')

// Empty packet should still produce a valid report shape with a
// "No records" TEXT section.
const empty = buildSprayCompliancePacket([])
assert(empty != null && typeof empty === 'object',
  'buildSprayCompliancePacket([]) returns an object')
assert(empty.module === 'spray',
  'empty packet report.module === "spray"')
assert(empty.type === 'spray-summary',
  'empty packet report.type === "spray-summary" (reuses existing schema type)')
assert(Array.isArray(empty.sections) && empty.sections.length >= 2,
  'empty packet has at least 2 sections (Summary + empty-state)')
const emptySummary = empty.sections.find(s => s.title === 'Compliance Summary')
assert(emptySummary != null, 'empty packet has a "Compliance Summary" section')
assert(emptySummary?.data?.['Total Records'] === 0,
  'empty packet summary reports Total Records === 0')
assert(emptySummary?.data?.['Completed']     === 0,
  'empty packet summary reports Completed === 0')
assert(emptySummary?.data?.['Needs Info']    === 0,
  'empty packet summary reports Needs Info === 0')
const emptyText = empty.sections.find(s => s.title === 'No records')
assert(emptyText != null, 'empty packet has a "No records" TEXT section')
assert(emptyText?.type === 'text',
  'empty-state section is SECTION_TYPE.TEXT')

// Populated packet — single record fully filled.
const recA = {
  id:                 'rec-a',
  date:               '2026-06-15',
  status:             'completed',
  applicator:         'Jose Guzman',
  applicatorLicense:  'TX-12345',
  targetPest:         'dollar spot',
  area:               'Greens',
  areas:              [{ name: 'Greens', acreage: 4.2 }],
  carrierVolume:      '44 gal/acre',
  totalVolume:        185,
  rei:                12,
  totalCostSnapshot:  342.55,
  notes:              'Light breeze, finished by 8am.',
  conditions: {
    temp: 72, humidity: 65, windSpeedMph: 6, windDirection: 'NW',
    soilTemp: 68, wind: 'light breeze',
  },
  products: [{
    name:                       'Daconil Ultrex',
    rate:                       '4 oz/1000sqft',
    quantityUsed:               72,
    unit:                       'oz',
    epaNumberSnapshot:          '50534-202',
    activeIngredientsSnapshot:  'Chlorothalonil 82.5%',
    totalCostSnapshot:          342.55,
  }],
}
// Record B — completed but missing wind direction (needs info).
const recB = {
  id:                 'rec-b',
  date:               '2026-06-16',
  status:             'completed',
  applicator:         'Maria Cruz',
  area:               'Tees',
  areas:              [{ name: 'Tees' }],
  products:           [{ name: 'Primo Maxx' }],
  conditions:         { temp: 70, humidity: 55, windSpeedMph: 4 /* no windDirection */ },
}
const packet = buildSprayCompliancePacket([recA, recB], {
  title:          'Spray Compliance Packet',
  dateRange:      '2026-06-01 → 2026-06-30',
  courseName:     'Crosswinds Golf Club',
  filtersSummary: 'Status: completed',
})

const summary = packet.sections.find(s => s.title === 'Compliance Summary')
assert(summary?.data?.['Total Records'] === 2, 'populated packet: Total Records === 2')
assert(summary?.data?.['Completed']     === 2, 'populated packet: Completed === 2')
assert(summary?.data?.['Needs Info']    === 1, 'populated packet: Needs Info === 1 (recB missing windDirection)')
assert(summary?.data?.['Course']        === 'Crosswinds Golf Club',
  'populated packet: Course pulled from options.courseName')
assert(summary?.data?.['Date Range']    === '2026-06-01 → 2026-06-30',
  'populated packet: Date Range echoes options.dateRange')
assert(summary?.data?.['Filters Applied'] === 'Status: completed',
  'populated packet: Filters Applied echoes options.filtersSummary')
assert(typeof summary?.data?.['Products Used']  === 'string'
       && summary.data['Products Used'].includes('Daconil Ultrex')
       && summary.data['Products Used'].includes('Primo Maxx'),
  'populated packet: Products Used lists product names')
assert(typeof summary?.data?.['Applicators']    === 'string'
       && summary.data['Applicators'].includes('Jose Guzman')
       && summary.data['Applicators'].includes('Maria Cruz'),
  'populated packet: Applicators lists applicator names')

// Per-record sections (one per input record, in order).
const recordSectionA = packet.sections.find(s => s.title.startsWith('2026-06-15'))
assert(recordSectionA != null, 'per-record section A present (Date · product)')
assert(/Daconil Ultrex/.test(recordSectionA.title),
  'per-record section A title includes product name')
assert(!/NEEDS INFO/.test(recordSectionA.title),
  'per-record section A title does NOT carry NEEDS INFO tag (complete record)')

const recordSectionB = packet.sections.find(s => s.title.startsWith('2026-06-16'))
assert(recordSectionB != null, 'per-record section B present')
assert(/NEEDS INFO/.test(recordSectionB.title),
  'per-record section B title carries NEEDS INFO tag (missing wind direction)')

// recA section fields — every spec field present.
for (const k of [
  'Date', 'Status', 'Applicator', 'License', 'Target / Pest', 'Area',
  'Products', 'Weather', 'Carrier Volume', 'Total Volume', 'REI',
  'Total Cost', 'Notes',
]) {
  assert(Object.prototype.hasOwnProperty.call(recordSectionA.data, k),
    `per-record section field present: "${k}"`)
}
assert(recordSectionA.data['License']    === 'TX-12345',
  'per-record section A: License pulled from applicatorLicense')
assert(recordSectionA.data['Total Cost'] === '$342.55',
  'per-record section A: Total Cost formatted from totalCostSnapshot')
assert(/EPA 50534-202/.test(recordSectionA.data['Products']),
  'per-record section A: Products line includes EPA snapshot')
assert(/AI: Chlorothalonil 82\.5%/.test(recordSectionA.data['Products']),
  'per-record section A: Products line includes active-ingredient snapshot')
assert(/72°F[\s\S]{0,40}65% RH[\s\S]{0,40}wind 6 mph[\s\S]{0,40}from NW/.test(recordSectionA.data['Weather']),
  'per-record section A: Weather line includes temp · humidity · wind speed · direction')

// recB section: Needs Info compliance flag added.
assert(recordSectionB.data['Compliance Flag'] === 'Record missing required compliance information.',
  'per-record section B: Compliance Flag field added when recordNeedsInfo')

// Metadata.
assert(packet.metadata?.recordCount === 2,
  'packet.metadata.recordCount === 2')
assert(packet.metadata?.completedCount === 2,
  'packet.metadata.completedCount === 2')
assert(packet.metadata?.needsInfoCount === 1,
  'packet.metadata.needsInfoCount === 1')

// ── SprayRecords integration — export button + handler ─────────────
section('SprayRecords — Export Compliance Packet button wired to filtered set')

// Phase S.5c.3 expanded this import to a multi-line destructure that
// also pulls in buildSprayProductUsageReport. Match the substring.
assert(/buildSpraySummaryReport[\s\S]{0,200}buildSprayCompliancePacket[\s\S]{0,300}from '\.\.\/\.\.\/\.\.\/utils\/reports\/reportBuilder'/.test(RECORDS),
  'SprayRecords imports both single + compliance-packet builders')
assert(/import \{ useToast \} from '\.\.\/\.\.\/\.\.\/utils\/feedback\/toastContext'/.test(RECORDS),
  'SprayRecords imports useToast (for empty-set feedback)')
assert(/import \{ useCourse \} from '\.\.\/\.\.\/\.\.\/context\/CourseContext'/.test(RECORDS),
  'SprayRecords imports useCourse (for courseName on the packet cover)')

assert(/function handleExportCompliancePacket\(\)/.test(RECORDS),
  'handleExportCompliancePacket() helper defined')

const expMatch = RECORDS.match(/function handleExportCompliancePacket\(\)\s*\{[\s\S]*?\n  \}/)
const expSrc   = expMatch ? expMatch[0] : ''
assert(expSrc.length > 0, 'handleExportCompliancePacket body extracted')

// Empty-set guard fires a toast + bails (no setActiveReport).
assert(/if \(visible\.length === 0\)/.test(expSrc),
  'export handler guards on visible.length === 0')
assert(/toast\.info\(['"]No records match[\s\S]{0,100}\)/.test(expSrc),
  'export handler toast.info() warns on empty filter set')

// Builds with the visible (filtered) set, not raw SPRAY_RECORDS.
assert(/setActiveReport\(buildSprayCompliancePacket\(visible,/.test(expSrc),
  'export handler calls buildSprayCompliancePacket(visible, ...) — honors filters')
assert(!/buildSprayCompliancePacket\(SPRAY_RECORDS/.test(RECORDS_CODE),
  'export handler never passes the raw SPRAY_RECORDS set (bypasses filters)')

// Filter summary string includes each active filter.
for (const fragment of [
  /if \(search\)\s*filterBits\.push\(/,
  /if \(typeFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(statusFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(applicatorFilter !== 'All'\) filterBits\.push\(/,
  /if \(productFilter\s*!==\s*'All'\)\s*filterBits\.push\(/,
  /if \(needsInfoOnly\)\s*filterBits\.push\(/,
]) {
  assert(fragment.test(expSrc),
    `filtersSummary builder includes: ${fragment}`)
}

// Date range cover string handles both-set / start-only / end-only / neither.
assert(/effStart && effEnd \? `\$\{effStart\} → \$\{effEnd\}`/.test(expSrc),
  'export handler dateRange handles both bounds')
assert(/: effStart\s*\?\s*`On or after \$\{effStart\}`/.test(expSrc),
  'export handler dateRange handles start-only')
assert(/: effEnd\s*\?\s*`On or before \$\{effEnd\}`/.test(expSrc),
  'export handler dateRange handles end-only')
assert(/:\s*['"]All dates['"]/.test(expSrc),
  'export handler dateRange falls back to "All dates"')

// Button rendered, wired, accessible.
assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}[\s\S]{0,400}onClick=\{handleExportCompliancePacket\}/.test(RECORDS),
  'Export Compliance Packet button renders + wires onClick')
assert(/Export Compliance Packet/.test(RECORDS),
  'Export button label reads "Export Compliance Packet"')
assert(/aria-label="Export filtered records as compliance packet PDF"/.test(RECORDS),
  'Export button has an accessible aria-label')

// CSS class exists.
assert(/\.exportPacketBtn\s*\{/.test(CSS),
  'CSS .exportPacketBtn rule defined')
// Mobile rule includes the export button in the stretch selector group.
assert(/\.advFilterClearBtn,[\s\S]{0,300}\.exportPacketBtn[\s\S]{0,300}\{[\s\S]{0,300}align-self:\s*stretch/.test(CSS),
  'mobile selector group includes .exportPacketBtn (stretch full-width)')

// ── Regression: single-record Generate Report still wired ───────────
section('Single-record Generate Report flow preserved (S.4 / S.5a.1 / S.5c.1 regression couple)')

assert(/onClick=\{\(\) => generateApplicationReport\(selected\)\}/.test(RECORDS),
  'Generate Report button still calls generateApplicationReport(selected)')
assert(/buildSpraySummaryReport\(/.test(RECORDS),
  'Single-record path still uses buildSpraySummaryReport')

// Edit modal (S.5a.1) regression.
assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal')
const payloadMatch = MODAL.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
for (const snap of [
  'epaNumberSnapshot', 'activeIngredientsSnapshot',
  'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `edit modal buildPatchPayload still does NOT echo ${snap} (snapshot frozen)`)
}

// Filter pipeline (S.5c.1) regression.
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(RECORDS.includes(dep),
    `S.5c.1 filter input still wired: ${dep}`)
}

// SprayReports tab (existing multi-record tab) still uses
// buildSpraySummaryReport — confirms we did NOT replace the old
// builder, only added a new one alongside.
assert(/import \{ buildSpraySummaryReport \} from '\.\.\/\.\.\/\.\.\/utils\/reports\/reportBuilder'/.test(REPORTS),
  'SprayReports tab still imports buildSpraySummaryReport (existing)')
assert(/buildSpraySummaryReport\(flatRecords/.test(REPORTS),
  'SprayReports tab still calls buildSpraySummaryReport(flatRecords, ...)')

// ── Worker / store / catalog scope guards ───────────────────────────
section('Scope guards — no worker / migration / catalog / builder calc changes')

assert(/export async function updateSpray\(env, id, request\)/.test(SPRAYS_W),
  'worker updateSpray still exported (regression)')
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  'worker MUTATION_RULES still gates /api/sprays')

const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Out-of-scope surfaces carry no S.5c.2 marker.
for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/Spray.jsx',
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.2'),
    `${path} carries no Phase S.5c.2 edits`)
}

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.2'),
    `${path} carries no Phase S.5c.2 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5c.2'),   'DAB carries no Phase S.5c.2 edits')
assert(!KIOSK.includes('Phase S.5c.2'), 'kiosk carries no Phase S.5c.2 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
