// Phase S.7 — Calendar-first Spray workspace smoke.
//
//   node scripts/smoke-spray-calendar-workspace.mjs
//
// Pins the new SprayCalendarWorkspace:
//   • New component + CSS module exist.
//   • Spray.jsx mounts <SprayCalendarWorkspace /> in BOTH branches as
//     the default 'Workspace' tab.
//   • The legacy SprayWorkspace dashboard component is preserved on
//     disk (no destructive removal) but no longer mounted.
//   • Header has month nav (prev/next), Today button, jump-to-date.
//   • Calendar grid uses the 7-col / 6-week pattern.
//   • Date selection state is wired (setSelectedDate on cell click).
//   • Calendar cells render area chips from recordsByDate +
//     plannedByDate (uses extractAreaLabels + extractPlannedArea).
//   • Needs-info chip is driven by the shared recordNeedsInfo helper
//     (S.6a single-source-of-truth invariant).
//   • Selected-day panel renders both completed + planned blocks.
//   • Embedded <BuildSpraySheet initialDate={selectedDate} onCommit={…} />.
//   • BuildSpraySheet accepts the new initialDate + onCommit props
//     without breaking the no-props default behavior.
//   • Post-commit hook fires onCommit?.(saved) so the embedding
//     workspace can refresh.
//   • Date-seed effect updates the draft only when "empty enough"
//     (no rows / no operator), so unsaved work isn't silently wiped.
//   • Workspace is read-only over existing stores — never calls
//     createSpray / patchSpray / deleteSpray / createSprayProgram
//     / setProgramItem*. All mutations go through the embedded builder.
//   • Mobile breakpoint stacks the layout + hides per-area chips.
//   • No worker / migration / catalog / permission changes.

import { readFileSync, readdirSync } from 'fs'

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

const CW       = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',         'utf8')
const CW_CSS   = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.module.css',  'utf8')
const SP       = readFileSync('src/pages/Spray/Spray.jsx',                               'utf8')
const BUILD    = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',                'utf8')
const WS       = readFileSync('src/pages/Spray/tabs/SprayWorkspace.jsx',                 'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                                    'utf8')
const PROG_W   = readFileSync('worker/api/sprayPrograms.js',                             'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                            'utf8')
const CW_CODE  = stripComments(CW)
const BUILD_CODE = stripComments(BUILD)

// ── No D1 migration / no worker churn ──────────────────────────────
section('No D1 migration / no worker churn')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

for (const path of [
  // Phase S.7b.2 — worker/api/sprays.js gained product-edit support;
  // it is the only worker file allowed to carry a Phase S.7* marker.
  'worker/index.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.7'),
    `${path} carries no Phase S.7 edits`)
}

// Internal contracts unchanged.
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray still exported (commit path unchanged)')
assert(/inventory_item_id/.test(SPRAYS_W),
  'worker createSpray still wires inventory_item_id (deduction unchanged)')
assert(/export async function createSprayProgram\b/.test(PROG_W),
  'worker createSprayProgram still exported (planned-spray write path unchanged)')
assert(/export async function listSprayProgramItems\b/.test(PROG_W),
  'worker listSprayProgramItems still exported (planned-spray read path unchanged)')
// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// ── New component + CSS exist ───────────────────────────────────────
section('SprayCalendarWorkspace component + CSS module exist')

assert(/^export default function SprayCalendarWorkspace\(\)/m.test(CW),
  'SprayCalendarWorkspace exports default with no required props')
assert(CW_CSS.length > 500, 'CSS module has substantive content')

// Imports reuse existing stores + the shared Needs Info helper.
assert(/import \{ useSpraysData, refreshSpraysData \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(CW),
  'imports useSpraysData + refreshSpraysData from existing store')
assert(/useSprayPrograms,\s*\n?\s*refreshSprayPrograms,\s*\n?\s*listSprayProgramItems,/.test(CW),
  'imports useSprayPrograms + refreshSprayPrograms + listSprayProgramItems')
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(CW),
  'imports shared recordNeedsInfo helper (S.6a single-source-of-truth)')
assert(/import BuildSpraySheet from '\.\/BuildSpraySheet'/.test(CW),
  'imports the existing BuildSpraySheet (no fork — embedding)')

// ── Spray.jsx wires SprayCalendarWorkspace as default Workspace ─────
section('Spray.jsx — calendar workspace is the default landing tab')

assert(/import SprayCalendarWorkspace from '\.\/tabs\/SprayCalendarWorkspace'/.test(SP),
  'Spray.jsx imports SprayCalendarWorkspace')

// Both branches mount it.
const sprayCalendarMounts = SP.match(/activeTab === 'Workspace'\s+&&\s*<SprayCalendarWorkspace\s*\/>/g) ?? []
assert(sprayCalendarMounts.length >= 2,
  `Both Crosswinds + legacy Workspace tabs mount <SprayCalendarWorkspace /> (found ${sprayCalendarMounts.length})`)

// Negative pin — the old <SprayWorkspace onNavigateTab=…/> mounts are gone.
assert(!/<SprayWorkspace onNavigateTab=/.test(SP),
  'no remaining <SprayWorkspace onNavigateTab=…> mount sites (S.7 retired)')

// Default activeTab still 'Workspace'.
assert(/useState\(\s*['"]Workspace['"]\s*\)/.test(SP),
  "activeTab defaults to 'Workspace' (landing on the calendar)")

// Legacy SprayWorkspace component preserved on disk (no destructive removal).
assert(WS.length > 500,
  'legacy SprayWorkspace.jsx preserved on disk (no destructive deletion)')
assert(/export default function SprayWorkspace/.test(WS),
  'legacy SprayWorkspace still exports default function (file preserved)')

// ── Header has month nav / Today / Jump ─────────────────────────────
section('Header — month nav, Today button, Jump to date')

assert(/aria-label="Previous month"/.test(CW),
  'Previous month button has aria-label')
assert(/aria-label="Next month"/.test(CW),
  'Next month button has aria-label')
assert(/setCurrentMonth\(m => shiftMonth\(m, -1\)\)/.test(CW),
  'Previous month wires shiftMonth(m, -1)')
assert(/setCurrentMonth\(m => shiftMonth\(m, 1\)\)/.test(CW),
  'Next month wires shiftMonth(m, 1)')
assert(/className=\{styles\.todayBtn\}\s+onClick=\{goToToday\}/.test(CW),
  'Today button wires goToToday()')
assert(/function goToToday\(\)/.test(CW),
  'goToToday() function declared')
assert(/aria-label="Jump to date"/.test(CW),
  'jump-to-date input has aria-label')
assert(/type="date"/.test(CW),
  'jump input uses type="date" (native date picker)')
assert(/handleJump/.test(CW),
  'handleJump handler wired')

// Month label text.
assert(/\{monthLabel\}/.test(CW),
  'header renders {monthLabel}')
assert(/formatMonthLabel\(currentMonth\)/.test(CW),
  'monthLabel built from formatMonthLabel(currentMonth)')

// ── Calendar grid + date selection ──────────────────────────────────
section('Calendar grid — 7-col / 6-week pattern with date selection')

assert(/buildMonthGrid\(currentMonth\)/.test(CW),
  'monthGrid built from buildMonthGrid(currentMonth)')
assert(/function buildMonthGrid\(yyyymm\)/.test(CW),
  'buildMonthGrid() declared (local helper, no UTC drift)')
assert(/grid-template-columns: repeat\(7, 1fr\)/.test(CW_CSS),
  'CSS .monthGrid uses 7-col layout')
assert(/\['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'\]/.test(CW),
  'Day-of-week header row uses Sun-Sat order')

// Click handler on each cell.
assert(/onClick=\{\(\) => setSelectedDate\(date\)\}/.test(CW),
  'cell click calls setSelectedDate(date)')

// Selected + today visual states.
assert(/cellSelected/.test(CW) && /cellSelected/.test(CW_CSS),
  '.cellSelected class declared + styled')
assert(/cellToday/.test(CW) && /cellToday/.test(CW_CSS),
  '.cellToday class declared + styled')
assert(/aria-selected=\{isSelected/.test(CW),
  'selected cell carries aria-selected attribute')

// ── Calendar shows areas (completed + planned) ──────────────────────
section('Calendar cells render area chips from existing record data')

assert(/function extractAreaLabels\(record\)/.test(CW),
  'extractAreaLabels(record) helper declared')
assert(/record\?\.areas/.test(CW),
  'extractAreaLabels reads record.areas')
assert(/record\?\.area\b/.test(CW),
  'extractAreaLabels falls back to record.area')
assert(/record\?\.holes/.test(CW),
  'extractAreaLabels falls back to record.holes')

assert(/function extractPlannedArea\(item\)/.test(CW),
  'extractPlannedArea(item) helper declared')
assert(/item\?\.targetArea/.test(CW),
  'extractPlannedArea reads item.targetArea (S.5b.2 model field)')

// Truncate to ≤ 3 chips per spec: 1-2 → all, more → first two + "+N".
assert(/function truncateLabels\(labels\)/.test(CW),
  'truncateLabels(labels) helper declared')
assert(/`\+\$\{unique\.length - 2\}`/.test(CW),
  'truncateLabels emits "+N" tail for >2 labels')

// Chip rendering wired.
assert(/chipCompleted/.test(CW) && /chipCompleted/.test(CW_CSS),
  '.chipCompleted styled differently from planned')
assert(/chipPlanned/.test(CW)   && /chipPlanned/.test(CW_CSS),
  '.chipPlanned styled differently from completed')
assert(/countChipCompleted/.test(CW) && /countChipCompleted/.test(CW_CSS),
  'completed count chip ("N sprayed") rendered + styled')
assert(/countChipPlanned/.test(CW) && /countChipPlanned/.test(CW_CSS),
  'planned count chip ("N planned") rendered + styled')

// Needs-info chip uses the shared S.6a helper.
assert(/needsInfoCount = recs\.filter\(recordNeedsInfo\)/.test(CW),
  'Needs Info badge driven by shared recordNeedsInfo helper')
assert(/needsInfoBadge/.test(CW) && /needsInfoBadge/.test(CW_CSS),
  '.needsInfoBadge rendered + styled')

// ── Selected-day panel ──────────────────────────────────────────────
section('Selected-day panel — completed + planned + empty state')

assert(/\{formatDayLabel\(selectedDate\)\}/.test(CW),
  'panel header renders full weekday+date via formatDayLabel')
assert(/No sprays logged or planned for this date\./.test(CW),
  'empty state copy per spec')

// Both blocks render conditionally.
assert(/selectedRecords\.length > 0 &&/.test(CW),
  'Completed block rendered when selectedRecords.length > 0')
assert(/selectedPlanned\.length > 0 &&/.test(CW),
  'Planned block rendered when selectedPlanned.length > 0')

// Row metadata includes program name from planned items.
assert(/item\.programName/.test(CW),
  'planned row surfaces item.programName (joined from useSprayPrograms)')

// ── Embedded BuildSpraySheet ────────────────────────────────────────
section('Embedded BuildSpraySheet — initialDate + onCommit props')

assert(/<BuildSpraySheet initialDate=\{selectedDate\} onCommit=\{handleEmbeddedCommit\} \/>/.test(CW),
  'embeds <BuildSpraySheet initialDate={selectedDate} onCommit={handleEmbeddedCommit} />')

assert(/function handleEmbeddedCommit\(\)/.test(CW),
  'handleEmbeddedCommit() handler declared')
assert(/refreshSpraysData\(\)/.test(CW),
  'handleEmbeddedCommit refreshes the sprays store')

// ── BuildSpraySheet — accepts new props without regression ──────────
section('BuildSpraySheet — initialDate + onCommit props')

// Signature with optional default-empty destructure (so no-props calls
// still work byte-identically).
assert(/export default function BuildSpraySheet\(\{ initialDate, onCommit \} = \{\}\)/.test(BUILD),
  'BuildSpraySheet signature: ({ initialDate, onCommit } = {})')

// Date-seed effect — only updates the draft date when "empty enough".
assert(/if \(!initialDate\) return/.test(BUILD),
  'seed effect early-returns when no initialDate prop (standalone tab safe)')
assert(/const isEmpty\s*=\s*\n?\s*\(!prev\?\.rows \|\| prev\.rows\.length === 0\) &&\s*\n?\s*!prev\?\.operator/.test(BUILD),
  'seed effect treats "empty enough" as no rows + no operator (preserves unsaved work)')

// Post-commit: fresh draft inherits initialDate, then onCommit fires.
assert(/const fresh = makeEmptyDraft\(\)\s*\n\s*if \(initialDate\) fresh\.date = initialDate\s*\n\s*setDraft\(fresh\)/.test(BUILD),
  'post-commit fresh draft inherits initialDate when embedded')
assert(/onCommit\?\.\(saved\)/.test(BUILD),
  'post-commit fires onCommit?.(saved) for the embedding workspace')

// Existing standalone tab behavior preserved.
assert(/import BuildSpraySheet\s+from\s+['"]\.\/tabs\/BuildSpraySheet['"]/.test(SP),
  'Spray.jsx still imports BuildSpraySheet (standalone tab regression couple)')
assert(/activeTab === 'Build Spray'\s+&&\s*<BuildSpraySheet \/>/.test(SP),
  'Crosswinds "Build Spray" tab still mounts <BuildSpraySheet /> (no props — standalone behavior)')
assert(/activeTab === 'New Application'\s+&&\s*<BuildSpraySheet \/>/.test(SP),
  'Legacy "New Application" tab still mounts <BuildSpraySheet /> (no props)')

// ── Workspace is read-only — no spray mutations ─────────────────────
section('SprayCalendarWorkspace is read-only — no mutations')

assert(!/createSpray\b|patchSpray\b|deleteSpray\b/.test(CW_CODE),
  'never calls createSpray / patchSpray / deleteSpray')
assert(!/createSprayProgram\b|updateSprayProgram\b|archiveSprayProgram\b/.test(CW_CODE),
  'never calls createSprayProgram / updateSprayProgram / archiveSprayProgram')
assert(!/createSprayProgramItem\b|updateSprayProgramItem\b|deleteSprayProgramItem\b/.test(CW_CODE),
  'never mutates spray_program_items directly')

// Refresh helpers (read-only).
assert(/refreshSpraysData\(\)/.test(CW),
  'refreshes sprays via refreshSpraysData()')
assert(/refreshSprayPrograms\(\)/.test(CW),
  'refreshes planned sprays via refreshSprayPrograms()')

// ── Permission gating preserved (S.5a.2) ────────────────────────────
section('Permission gating — preserved via embedded BuildSpraySheet')

// The calendar workspace itself doesn't reference canEditSprays — gating
// lives inside BuildSpraySheet which still imports useAuth.
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(BUILD),
  'BuildSpraySheet still imports useAuth (S.5a.2 gate preserved)')
assert(/const canEditSprays = can\('canEditSprays'\)/.test(BUILD),
  'BuildSpraySheet still derives canEditSprays from can() (gate preserved)')

// ── Records / packet / usage workflows preserved (regression couples) ──
section('Records + exports + Needs Info workflows preserved')

const RECORDS = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx', 'utf8')
const REPORT  = readFileSync('src/utils/reports/reportBuilder.js',    'utf8')
assert(/import \{ recordNeedsInfo \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/recordNeedsInfo'/.test(RECORDS),
  'SprayRecords still imports shared recordNeedsInfo helper (S.6a couple)')
assert(/import \{ recordNeedsInfo \} from '\.\.\/sprays\/recordNeedsInfo\.js'/.test(REPORT),
  'reportBuilder still imports shared recordNeedsInfo helper (S.6a couple)')
assert(/export function buildSprayCompliancePacket/.test(REPORT),
  'buildSprayCompliancePacket still exported (S.5c.2 couple)')
assert(/export function buildSprayProductUsageReport/.test(REPORT),
  'buildSprayProductUsageReport still exported (S.5c.3 couple)')

// ── Save / Load planned spray modals (S.5b.2 / S.5b.3 couples) ──────
section('Save / Load planned spray modals — internal contracts preserved')

const SAVE = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx', 'utf8')
const LOAD = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',   'utf8')
assert(/createSprayProgram\(/.test(SAVE),
  'save modal still calls createSprayProgram()')
assert(/createSprayProgramItem\(/.test(SAVE),
  'save modal still calls createSprayProgramItem()')
assert(/listSprayProgramItems\(/.test(LOAD),
  'load modal still calls listSprayProgramItems()')

// ── Mobile breakpoint ───────────────────────────────────────────────
section('Mobile breakpoint (≤ 700 px)')

assert(/@media \(max-width: 700px\)/.test(CW_CSS),
  '@media (max-width: 700px) breakpoint present')
assert(/\.chipList\s*\{\s*display: none/.test(CW_CSS),
  'per-area chip lists hidden on mobile (counts still shown)')

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk + non-Spray surfaces untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7'),   'DAB carries no Phase S.7 edits')
assert(!KIOSK.includes('Phase S.7'), 'kiosk carries no Phase S.7 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
