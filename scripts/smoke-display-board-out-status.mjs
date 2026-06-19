// Phase E.9 — Display Board out-status cards smoke.
//
//   node scripts/smoke-display-board-out-status.mjs
//
// E.4 hid off / sick / vacation employees from the kiosk. E.9 reverses
// that: the kiosk now shows them as labeled "Off" / "Vacation" /
// "Sick" cards. Two pieces work together:
//
//   1. operatorCards memo no longer filters out off/sick/vacation
//      employees. Instead it:
//        a. Tags assignment-bearing operators with `outStatus` and
//           strips their assignments (so prior task text never bleeds
//           into the out card).
//        b. Seeds new cards for active employees who are out today
//           but had no assignment row at all. Name comes from the
//           anonymous-safe employeeNameLookup.
//   2. BoardModeCrewBars renders an out-status card with a single
//      labeled status word, no task / notes / equipment, no Spanish
//      translation lookup. Data-attribute drives the color (slate /
//      blue / rose).
//
// Safety invariants preserved:
//   • DAB still filters off/sick/vacation as non-assignable.
//   • Copy Yesterday / Copy From Date still skip them with named
//     reasons in the toast.
//   • Kiosk still receives no private employee fields. Out cards use
//     only the public name lookup; no payRate / phone / email / etc.
//   • No D1 migration.
//   • No spray changes.

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

const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',         'utf8')
const KIOSK_CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',  'utf8')
const DAB       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',    'utf8')
const MERGE     = readFileSync('src/utils/schedules/dailyScheduleMerge.js',       'utf8')

const KIOSK_CODE = stripComments(KIOSK)

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger (E.5 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── Kiosk no longer filters off/vacation/sick ───────────────────────
section('Kiosk operatorCards — out employees are tagged, not filtered out')

// Helper import expanded to include getScheduleStatusForEmployee.
assert(/import \{ isEmployeeAssignableForDate, hasAnyScheduleData, getScheduleStatusForEmployee \} from '\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(KIOSK),
  'kiosk imports getScheduleStatusForEmployee from the shared merge helper')

// The operatorCards memo now tags out cards instead of filtering.
const memoMatch = KIOSK.match(/const operatorCards = useMemo\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\)/)
const memoSrc   = memoMatch ? memoMatch[0] : ''
assert(memoSrc.length > 0, 'operatorCards memo block extracted')

// Step 1 — assigned operator tagging.
assert(/op\.outStatus = merged\.status/.test(memoSrc),
  'kiosk tags assigned operator cards with outStatus when merged status is off/sick/vacation')
assert(/op\.assignments = \[\]/.test(memoSrc),
  'kiosk wipes assignments on tagged out cards (no leftover task/notes/chips)')

// Step 2 — seeds new cards for out-status active employees with no assignment row.
assert(/for \(const emp of employees \?\? \[\]\)/.test(memoSrc),
  'kiosk iterates active employees to seed out-status cards for employees with no assignment row')
assert(/if \(byOperator\.has\(emp\.id\)\) continue/.test(memoSrc),
  'kiosk skip-seeds employees already represented by an assignment-derived card')
assert(/employeeName:\s*employeeNameLookup\.get\(emp\.id\) \?\? emp\.name/.test(memoSrc),
  'kiosk seeds out cards using employeeNameLookup (anonymous-safe name only)')

// Step 3 — out cards do NOT carry assignment fields.
assert(/outStatus:\s*merged\.status/.test(memoSrc),
  'seeded out card carries outStatus: merged.status')
assert(/assignments:\s*\[\]/.test(memoSrc),
  'seeded out card has empty assignments array')

// Negative pin: the old E.4 filter is gone.
assert(!/cards = cards\.filter\(op => \{[\s\S]{0,400}return verdict\.allowed\s*\n\s*\}\)/.test(memoSrc),
  'kiosk operatorCards memo NO LONGER filters via verdict.allowed (E.4 hide-behavior removed)')

// Memo deps include employees so seeding re-runs when the roster changes.
assert(/dayCrew, dayEvents, equipByEvent, employeeNameLookup, employeeById, employees,/.test(memoSrc),
  'memo deps include `employees` so out-card seeding re-runs when the roster changes')

// Sort: out cards land AFTER scheduled cards.
assert(/const xOut = x\.outStatus \? 1 : 0/.test(memoSrc),
  'sort key promotes scheduled (no outStatus) before out cards')
assert(/if \(xOut !== yOut\) return xOut - yOut/.test(memoSrc),
  'sort returns scheduled before out so out cards group at the bottom of the kiosk')

// Fallback rule preserved: when scheduleAware is false, no seeding happens.
assert(/const scheduleAware = hasAnyScheduleData\(weeklySchedules, scheduleOverrides\)/.test(memoSrc),
  'kiosk computes scheduleAware via hasAnyScheduleData (fallback preserved)')
assert(/if \(scheduleAware\) \{/.test(memoSrc),
  'tagging + seeding ONLY happens when scheduleAware === true (empty-stores fallback unchanged)')

// ── BoardModeCrewBars renders out cards ─────────────────────────────
section('BoardModeCrewBars — renders out-status cards distinct from assignment cards')

// The render block extracts a label per out status.
assert(/if \(op\.outStatus\) \{[\s\S]{0,400}op\.outStatus === 'vacation' \? 'Vacation'/.test(KIOSK),
  'render branches on op.outStatus and chooses "Vacation" label')
assert(/op\.outStatus === 'sick'\s*\?\s*'Sick'/.test(KIOSK),
  'render branches on op.outStatus === "sick" → label "Sick"')
assert(/:\s*'Off'/.test(KIOSK),
  'render defaults out status label to "Off"')

// Out card uses a distinct CSS class on the task line + an article-level data attr.
assert(/<article\s*\n\s*key=\{op\.key\}\s*\n\s*className=\{styles\.boardPersonBar\}\s*\n\s*data-out-status=\{op\.outStatus\}/.test(KIOSK),
  '<article> for out cards carries data-out-status={op.outStatus}')
assert(/<p className=\{styles\.boardOutStatusText\} data-out-status=\{op\.outStatus\}>\{label\}<\/p>/.test(KIOSK),
  'out status label uses styles.boardOutStatusText + data-out-status')

// Out branch must NOT render assignment text / notes / Spanish.
const outBranchMatch = KIOSK.match(/if \(op\.outStatus\) \{[\s\S]*?return \(\s*<article[\s\S]*?<\/article>\s*\)/)
const outBranchSrc   = outBranchMatch ? outBranchMatch[0] : ''
assert(outBranchSrc.length > 0, 'out-status render branch extracted')
assert(!/boardTaskText/.test(outBranchSrc),
  'out-status card does NOT render boardTaskText (assignment title suppressed)')
assert(!/boardNotesText/.test(outBranchSrc),
  'out-status card does NOT render boardNotesText (notes / Spanish suppressed)')
assert(!/op\.assignments\.map/.test(outBranchSrc),
  'out-status card does NOT iterate op.assignments (no equipment chips, no per-task block)')
assert(!/showSpanishNotes/.test(outBranchSrc),
  'out-status card does NOT consult showSpanishNotes (no translation lookup)')

// ── CSS — out-status classes defined ────────────────────────────────
section('CSS — out-status colors + label class defined')

assert(/\.boardPersonBar\[data-out-status="off"\]\s*\{[\s\S]{0,300}rgba\(71,\s*85,\s*105/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="off"] uses a slate/gray tint')
assert(/\.boardPersonBar\[data-out-status="vacation"\]\s*\{[\s\S]{0,300}rgba\(37,\s*99,\s*235/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="vacation"] uses a blue tint')
assert(/\.boardPersonBar\[data-out-status="sick"\]\s*\{[\s\S]{0,300}rgba\(244,\s*63,\s*94/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="sick"] uses a rose tint')

// Label class is its own rule so it stands out from assignment text.
assert(/\.boardOutStatusText\s*\{/.test(KIOSK_CSS),
  'CSS .boardOutStatusText rule defined')
assert(/\.boardOutStatusText\[data-out-status="off"\]\s*\{[\s\S]{0,200}color:\s*#cbd5e1/.test(KIOSK_CSS),
  '.boardOutStatusText[data-out-status="off"] uses slate color (#cbd5e1)')
assert(/\.boardOutStatusText\[data-out-status="vacation"\]\s*\{[\s\S]{0,200}color:\s*#93c5fd/.test(KIOSK_CSS),
  '.boardOutStatusText[data-out-status="vacation"] uses blue color (#93c5fd)')
assert(/\.boardOutStatusText\[data-out-status="sick"\]\s*\{[\s\S]{0,200}color:\s*#fda4af/.test(KIOSK_CSS),
  '.boardOutStatusText[data-out-status="sick"] uses rose color (#fda4af)')

// All three colors come from distinct CSS classes (not inline styles).
const offClassCount = (KIOSK_CSS.match(/data-out-status="off"/g) ?? []).length
const vacClassCount = (KIOSK_CSS.match(/data-out-status="vacation"/g) ?? []).length
const sickClassCount = (KIOSK_CSS.match(/data-out-status="sick"/g) ?? []).length
assert(offClassCount  >= 2, `data-out-status="off" appears in ≥2 CSS rules (got ${offClassCount})`)
assert(vacClassCount  >= 2, `data-out-status="vacation" appears in ≥2 CSS rules (got ${vacClassCount})`)
assert(sickClassCount >= 2, `data-out-status="sick" appears in ≥2 CSS rules (got ${sickClassCount})`)

// ── Privacy — out cards do not surface private fields ───────────────
section('Privacy — kiosk source still carries no private employee fields')

// Comments are stripped first because the kiosk source documents the
// privacy gate as positive intent ("no payRate / private fields").
assert(!/payRate|emergencyContact|pesticideLicense|hireDate/.test(KIOSK_CODE),
  'kiosk executable code carries no private employee field references (privacy regression)')
// Out-card seeding pulls from employeeNameLookup (name only), not employees[emp.id].payRate.
assert(/employeeName:\s*employeeNameLookup\.get\(emp\.id\) \?\? emp\.name/.test(KIOSK),
  'out card seeds employee name via employeeNameLookup (public-safe)')
// Negative pin: the seeded card object only carries public fields.
const seedMatch = KIOSK.match(/byOperator\.set\(emp\.id, \{[\s\S]*?\}\)/)
const seedSrc   = seedMatch ? seedMatch[0] : ''
assert(seedSrc.length > 0, 'out-card seed object extracted')
const seedCode = stripComments(seedSrc)
assert(!/payRate|emergencyContact|pesticideLicense|hireDate|phone|email/.test(seedCode),
  'seeded out card carries no private employee fields')

// ── DAB assignable behavior unchanged ───────────────────────────────
section('DAB — off/sick/vacation still NOT assignable (regression couple)')

// Helper still returns { allowed, reason } for off/sick/vacation.
assert(/if \(merged\.status === 'scheduled'\) return \{ allowed: true, reason: null \}/.test(MERGE),
  'isEmployeeAssignableForDate still allows only `scheduled` status')
assert(/return \{ allowed: false, reason: merged\.status \}/.test(MERGE),
  'isEmployeeAssignableForDate still reports off/sick/vacation as not allowed with reason')

// DAB still consults the helper.
assert(/isEmployeeAssignableForDate/.test(DAB),
  'DAB still calls isEmployeeAssignableForDate (E.4 invariant)')

// DAB doesn't import any of the E.9 new behavior.
assert(!DAB.includes('Phase E.9'),
  'DAB carries no Phase E.9 edits (assignable behavior unchanged)')

// ── Copy Yesterday / Copy From Date skip behavior preserved ─────────
section('DAB copy — skip names + reasons still surface in toast')

// The DAB copy helper still uses assignable verdict per-row.
assert(/const assignable = isEmployeeAssignableForDate\(/.test(DAB),
  'DAB copy helper still calls isEmployeeAssignableForDate per copied row')
// Skip path still pushes reason into a skip bucket. (Re-pin so we
// know nothing accidentally collapsed when the kiosk changed.)
// DAB tracks skips as a list of { name, reason } pairs that the toast
// formats into "Jose sick, John off" style copy.
assert(/skippedDetails\.push\(\{ name: empStillThere\.name, reason: assignable\.reason \}\)/.test(DAB),
  'DAB copy helper still pushes { name, reason } into skippedDetails when assignable.allowed === false')
assert(/skippedDetails\.slice\(0, SHOW\)\.map\(d => `\$\{d\.name\} \$\{d\.reason\}`\)/.test(DAB),
  'DAB copy toast still renders "<name> <reason>" pairs from skippedDetails')

// ── No spray edits ──────────────────────────────────────────────────
section('Scope guards — no spray, no migration, no worker changes')

for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.9'),
    `${path} carries no Phase E.9 edits`)
}

// Worker side untouched — kiosk already had enough schedule data via
// the public anonymous endpoints (Phase E.4). No new endpoint added.
for (const path of [
  'worker/index.js',
  'worker/api/schedules.js',
  'worker/api/shiftTemplates.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.9'),
    `${path} carries no Phase E.9 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
