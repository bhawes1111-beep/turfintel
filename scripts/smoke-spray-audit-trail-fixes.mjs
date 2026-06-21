// Phase S.6a — Spray audit trail trust fixes smoke.
//
//   node scripts/smoke-spray-audit-trail-fixes.mjs
//
// Pins the S.6 audit findings now resolved:
//   • B1: Workspace Needs Info heuristic uses correct field names
//     (windSpeedMph / temp), not the legacy wrong names (windSpeed
//     / temperature). Now imported from the shared helper.
//   • B2: Records detail weather section renders when ANY weather
//     field is populated (was: only when temp was truthy).
//   • B3: Start Time / End Time render in the Records detail modal
//     when populated.
//   • B4: Start Time / End Time appear in the Compliance Packet PDF
//     per-record FIELDS block.
//   • B5: recordNeedsInfo extracted to src/utils/sprays/recordNeedsInfo.js
//     and imported by all three consumers (Workspace, Records,
//     report builder) — no more duplicate logic.
//
// Includes functional tests of the shared helper to catch field-name
// regressions at the unit level + import-path tests for each consumer
// to catch dependency rot.

import { readFileSync, readdirSync } from 'fs'
import { recordNeedsInfo } from '../src/utils/sprays/recordNeedsInfo.js'
import { buildSprayCompliancePacket } from '../src/utils/reports/reportBuilder.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const HELPER    = readFileSync('src/utils/sprays/recordNeedsInfo.js',           'utf8')
const WORKSPACE = readFileSync('src/pages/Spray/tabs/SprayWorkspace.jsx',       'utf8')
const RECORDS   = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',         'utf8')
const RB        = readFileSync('src/utils/reports/reportBuilder.js',            'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                          'utf8')
const PROG_W    = readFileSync('worker/api/sprayPrograms.js',                   'utf8')
const PC_W      = readFileSync('worker/api/productCatalog.js',                  'utf8')

// ── No D1 migration / no worker changes ─────────────────────────────
section('No D1 migration / no worker changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.6a'),
    `${path} carries no Phase S.6a edits`)
}

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// ── Shared helper exists + correct field names ──────────────────────
section('Shared recordNeedsInfo helper — exists + uses correct field names')

assert(/^export function recordNeedsInfo\(record\)/m.test(HELPER),
  'recordNeedsInfo exported from src/utils/sprays/recordNeedsInfo.js')

// Positive pins: correct S.3 field names.
assert(/c\.temp != null/.test(HELPER),
  'helper reads c.temp (correct S.3 field name)')
assert(/c\.windSpeedMph == null/.test(HELPER),
  'helper reads c.windSpeedMph (correct S.3 field name)')
assert(/c\.windDirection/.test(HELPER),
  'helper reads c.windDirection')
assert(/c\.humidity/.test(HELPER),
  'helper reads c.humidity')
assert(/c\.wind\b/.test(HELPER),
  'helper reads c.wind (free-text)')

// Negative pins: the buggy field names (B1) are gone.
assert(!/c\.windSpeed\b(?!Mph)/.test(HELPER),
  'helper does NOT read c.windSpeed (legacy buggy name — would mismatch S.3 schema)')
assert(!/c\.temperature\b/.test(HELPER),
  'helper does NOT read c.temperature (legacy buggy name — would mismatch S.3 schema)')

// ── Functional pure tests of the shared helper ──────────────────────
section('Shared helper — pure functional behavior')

// Returns false for non-completed records.
assert(recordNeedsInfo({ status: 'planned',        date: '2026-06-01' }) === false,
  'planned record never flagged as needs-info')
assert(recordNeedsInfo({ status: 'in-progress',    date: '2026-06-01' }) === false,
  'in-progress record never flagged as needs-info')
assert(recordNeedsInfo({ status: 'pending-review', date: '2026-06-01' }) === false,
  'pending-review record never flagged as needs-info')
assert(recordNeedsInfo(null)      === false, 'null record returns false (no throw)')
assert(recordNeedsInfo(undefined) === false, 'undefined record returns false (no throw)')

// A completed record missing fields gets flagged.
const baseComplete = {
  status:     'completed',
  date:       '2026-06-01',
  applicator: 'Jose',
  products:   [{ name: 'X' }],
  areas:      [{ name: 'Greens' }],
  conditions: {
    temp: 72, humidity: 60, wind: 'NE',
    windSpeedMph: 5, windDirection: 'N',
  },
}
assert(recordNeedsInfo(baseComplete) === false,
  'fully-populated completed record passes (false)')
assert(recordNeedsInfo({ ...baseComplete, date: '' }) === true,
  'missing date → true')
assert(recordNeedsInfo({ ...baseComplete, applicator: '   ' }) === true,
  'blank applicator → true')
assert(recordNeedsInfo({ ...baseComplete, products: [] }) === true,
  'empty products → true')
assert(recordNeedsInfo({ ...baseComplete, areas: [] }) === true,
  'empty areas → true')
assert(recordNeedsInfo({ ...baseComplete, conditions: null }) === true,
  'no conditions block → true')
assert(recordNeedsInfo({ ...baseComplete, conditions: { ...baseComplete.conditions, windSpeedMph: null } }) === true,
  'null windSpeedMph → true')
assert(recordNeedsInfo({ ...baseComplete, conditions: { ...baseComplete.conditions, windDirection: '' } }) === true,
  'blank windDirection → true')

// The B1 regression test: a record with HUMIDITY ONLY (no temp/wind)
// + structured wind populated → should pass (hasAnyWeather satisfied).
// The old buggy heuristic would have flagged this because it looked
// for `windSpeed` (not `windSpeedMph`).
assert(recordNeedsInfo({
  ...baseComplete,
  conditions: {
    temp: null,
    humidity: 65,
    wind: null,
    windSpeedMph: 8,
    windDirection: 'SW',
  },
}) === false, 'B1 regression: humidity-only + structured wind passes (was incorrectly flagged before S.6a)')

// ── Workspace + Records + ReportBuilder all import shared helper ────
section('Three consumers import the shared helper (no duplicates)')

assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(WORKSPACE),
  'SprayWorkspace imports the shared recordNeedsInfo helper')
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(RECORDS),
  'SprayRecords imports the shared recordNeedsInfo helper')
assert(/import \{ recordNeedsInfo \} from '\.\.\/sprays\/recordNeedsInfo\.js'/.test(RB),
  'reportBuilder imports the shared recordNeedsInfo helper')

// Negative pins: no local copies of the helper survive.
assert(!/^function recordNeedsInfo\(record\)/m.test(WORKSPACE),
  'SprayWorkspace no longer declares a local recordNeedsInfo()')
assert(!/^function isRecordIncomplete\(record\)/m.test(WORKSPACE),
  'SprayWorkspace no longer declares the legacy isRecordIncomplete()')
assert(!/^function recordNeedsInfo\(record\)/m.test(RECORDS),
  'SprayRecords no longer declares a local recordNeedsInfo()')
assert(!/^function recordNeedsInfoLocal\(record\)/m.test(RB),
  'reportBuilder no longer declares recordNeedsInfoLocal()')

// Negative pins: the buggy field names are not present in any
// consumer source file either (defense-in-depth against accidental
// reintroduction).
for (const [src, label] of [
  [WORKSPACE, 'SprayWorkspace'],
  [RECORDS,   'SprayRecords'],
  [RB,        'reportBuilder'],
]) {
  assert(!/conditions\.windSpeed\b(?!Mph)/.test(src),
    `${label}: no .conditions.windSpeed (legacy buggy name)`)
  assert(!/conditions\.temperature\b/.test(src),
    `${label}: no .conditions.temperature (legacy buggy name)`)
}

// Workspace's filter still wires to recordNeedsInfo by name.
assert(/dayRecords\.filter\(recordNeedsInfo\)/.test(WORKSPACE),
  'SprayWorkspace dayIncomplete useMemo filters by recordNeedsInfo')

// Records' Needs Info toggle still wires to recordNeedsInfo by name.
assert(/needsInfoOnly && !recordNeedsInfo\(r\)/.test(RECORDS),
  'SprayRecords needsInfoOnly filter calls recordNeedsInfo(r)')

// ── B2 fix: Records weather section visibility ──────────────────────
section('B2 — Records detail weather section renders on ANY weather field')

// Conditional now keys off the full set of weather fields, not just temp.
assert(/selected\.conditions && \(\s*\n\s*selected\.conditions\.temp\s*!= null\s*\n\s*\|\| selected\.conditions\.humidity\s*!= null\s*\n\s*\|\| selected\.conditions\.wind\s*!= null\s*\n\s*\|\| selected\.conditions\.windSpeedMph\s*!= null\s*\n\s*\|\| selected\.conditions\.windDirection\s*\n\s*\|\| selected\.conditions\.soilTemp\s*!= null/.test(RECORDS),
  'weather section conditional checks every weather field (B2 fix)')

// Negative pin: the buggy "only temp truthy" gate is gone.
assert(!/\{selected\.conditions\?\.temp && \(\s*\n\s*<section/.test(RECORDS),
  'B2 regression: weather section no longer hidden when temp is null but other fields exist')

// Individual condition fields use != null so 0 values render correctly.
assert(/Temperature[\s\S]{0,400}selected\.conditions\.temp != null \? `\$\{selected\.conditions\.temp\}°F`/.test(RECORDS),
  'Temperature field uses != null check (renders 0°F correctly)')
assert(/Humidity[\s\S]{0,400}selected\.conditions\.humidity != null \? `\$\{selected\.conditions\.humidity\}%`/.test(RECORDS),
  'Humidity field uses != null check')
assert(/Soil Temp[\s\S]{0,400}selected\.conditions\.soilTemp != null \? `\$\{selected\.conditions\.soilTemp\}°F`/.test(RECORDS),
  'Soil Temp field uses != null check')

// ── B3 fix: Start / End time visible in Records detail ──────────────
section('B3 — Start / End time visible in Records detail modal')

assert(/Start Time<\/span>\s*\n\s*<span className=\{styles\.modalFieldValue\}>\{selected\.startTime\}<\/span>/.test(RECORDS),
  'Start Time field renders in Records detail modal')
assert(/End Time<\/span>\s*\n\s*<span className=\{styles\.modalFieldValue\}>\{selected\.endTime\}<\/span>/.test(RECORDS),
  'End Time field renders in Records detail modal')

// Each renders only when populated (no clutter on records that
// didn't capture them).
assert(/\{selected\.startTime && \(\s*\n\s*<div className=\{styles\.modalField\}>\s*\n\s*<span className=\{styles\.modalFieldLabel\}>Start Time/.test(RECORDS),
  'Start Time conditional render — only when populated')
assert(/\{selected\.endTime && \(\s*\n\s*<div className=\{styles\.modalField\}>\s*\n\s*<span className=\{styles\.modalFieldLabel\}>End Time/.test(RECORDS),
  'End Time conditional render — only when populated')

// ── B4 fix: Start / End time in Compliance Packet ──────────────────
section('B4 — Start / End time in Compliance Packet per-record block')

assert(/'Start Time':\s*r\.startTime\s*\?\? '—'/.test(RB),
  "compliance packet per-record fields include 'Start Time': r.startTime ?? '—'")
assert(/'End Time':\s*r\.endTime\s*\?\? '—'/.test(RB),
  "compliance packet per-record fields include 'End Time': r.endTime ?? '—'")

// Functional check — build a packet and confirm the times surface.
const packetWithTimes = buildSprayCompliancePacket([
  {
    id: 'r1', date: '2026-06-01', startTime: '06:00', endTime: '09:30',
    status: 'completed', applicator: 'Jose', applicatorLicense: 'TX-1',
    products: [{ name: 'Daconil' }], areas: [{ name: 'Greens' }],
    conditions: { temp: 72, humidity: 60, wind: 'NE', windSpeedMph: 5, windDirection: 'N' },
  },
], {
  title: 'test', dateRange: '2026-06', courseName: 'Test', filtersSummary: 'none',
})
const recSection = packetWithTimes.sections.find(s => s.title.startsWith('2026-06-01'))
assert(recSection != null, 'compliance packet contains the test record section')
assert(recSection?.data?.['Start Time'] === '06:00',
  'compliance packet Start Time field === "06:00"')
assert(recSection?.data?.['End Time'] === '09:30',
  'compliance packet End Time field === "09:30"')

// Functional check — missing times surface as "—" (not undefined).
const packetWithoutTimes = buildSprayCompliancePacket([
  {
    id: 'r2', date: '2026-06-02',
    status: 'completed', applicator: 'Maria',
    products: [{ name: 'Primo' }], areas: [{ name: 'Tees' }],
    conditions: { temp: 68 },
  },
], { title: 'test' })
const recSection2 = packetWithoutTimes.sections.find(s => s.title.startsWith('2026-06-02'))
assert(recSection2?.data?.['Start Time'] === '—',
  'compliance packet Start Time === "—" when missing')
assert(recSection2?.data?.['End Time'] === '—',
  'compliance packet End Time === "—" when missing')

// ── Records-level regression couples (S.5c.1 / S.5a.1 / S.5c.* / etc.) ─
section('Records features preserved (regression couples)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}/.test(RECORDS),
  'Export Compliance Packet button still rendered (S.5c.2)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportUsageBtn\}/.test(RECORDS),
  'Export Product Usage button still rendered (S.5c.3)')
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(RECORDS.includes(dep),
    `S.5c.1 filter input still wired: ${dep}`)
}
// Permission gate (S.5a.2).
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(RECORDS),
  'SprayRecords still uses useAuth (S.5a.2 permission gate)')

// Workspace still uses the same store hooks.
assert(/useSpraysData/.test(WORKSPACE),
  'Workspace still uses useSpraysData (S.4 baseline)')
assert(/useSprayPrograms/.test(WORKSPACE),
  'Workspace still uses useSprayPrograms (S.4 baseline)')

// Compliance packet builder still exports + uses snapshot fields only.
assert(/export function buildSprayCompliancePacket/.test(RB),
  'buildSprayCompliancePacket still exported (S.5c.2)')
assert(/p\.epaNumberSnapshot/.test(RB),
  'packet builder still reads p.epaNumberSnapshot (S.3 invariant)')
assert(/p\.activeIngredientsSnapshot/.test(RB),
  'packet builder still reads p.activeIngredientsSnapshot (S.3 invariant)')
assert(/p\.totalCostSnapshot/.test(RB),
  'packet builder still reads p.totalCostSnapshot (S.3 invariant)')

// ── Worker mutation contract unchanged ──────────────────────────────
section('Worker contract unchanged (no permission / endpoint shift)')

assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray still exported')
assert(/export async function updateSpray\b/.test(SPRAYS_W),
  'worker updateSpray still exported')
assert(/export async function createSprayProgram\b/.test(PROG_W),
  'worker createSprayProgram still exported')
assert(/export async function listSprayProgramItems\b/.test(PROG_W),
  'worker listSprayProgramItems still exported')

// ── Scope guards ────────────────────────────────────────────────────
section('Scope guards — only Workspace + Records + reportBuilder + helper touched')

// All these surfaces carry no S.6a marker (this phase is bug-fix only).
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SaveAsProgramModal.jsx',
  'src/pages/Spray/tabs/LoadProgramModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  // Stores untouched.
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.6a'),
    `${path} carries no Phase S.6a edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.6a'),   'DAB carries no Phase S.6a edits')
assert(!KIOSK.includes('Phase S.6a'), 'kiosk carries no Phase S.6a edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
