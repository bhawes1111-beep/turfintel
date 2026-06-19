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

// Out card uses a distinct CSS class on the article + an article-level data attr.
// Phase E.9b — the article className is now a composed template literal
// that includes the base .boardPersonBar + .crewCardOut + per-status
// variant. Match the substring.
assert(/<article\s*\n\s*key=\{op\.key\}\s*\n\s*className=\{`\$\{styles\.boardPersonBar\}[\s\S]{0,200}\}`\}\s*\n\s*data-out-status=\{op\.outStatus\}/.test(KIOSK),
  '<article> for out cards carries data-out-status={op.outStatus} and a composed className')
// Phase E.9b — status label is now a <span> badge inside an inline
// header row, not a standalone <p>.
assert(/<span\s*\n\s*className=\{styles\.crewCardOutBadge\}\s*\n\s*data-out-status=\{op\.outStatus\}\s*\n?\s*>\s*\n?\s*\{label\}/.test(KIOSK),
  'status badge is a <span className={styles.crewCardOutBadge}> with data-out-status')

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

// ── Compact out-status cards (E.9 follow-up) ────────────────────────
section('Out cards are compact roster tags, not full assignment cards')

// Render — the article className composes .boardPersonBar (kept so the
// parent flex layout still works) WITH a marker .crewCardOut class
// AND a per-status variant class.
assert(/className=\{`\$\{styles\.boardPersonBar\}\s+\$\{styles\.crewCardOut\}\s+\$\{outClass\}`\}/.test(KIOSK),
  'out card article className composes base + .crewCardOut + per-status variant class')

// outClass helper picks the right variant per status.
const outClassMatch = KIOSK.match(/const outClass\s*=[\s\S]*?:\s*styles\.crewCardOutOff/)
const outClassSrc   = outClassMatch ? outClassMatch[0] : ''
assert(outClassSrc.length > 0, 'outClass selector block extracted')
assert(/op\.outStatus === 'vacation' \? styles\.crewCardOutVacation/.test(outClassSrc),
  'outClass picks .crewCardOutVacation for vacation status')
assert(/op\.outStatus === 'sick'\s+\?\s+styles\.crewCardOutSick/.test(outClassSrc),
  'outClass picks .crewCardOutSick for sick status')
assert(/:\s*styles\.crewCardOutOff/.test(outClassSrc),
  'outClass falls back to .crewCardOutOff for off status')

// The marker classes per spec exist in CSS.
for (const cls of ['crewCardOut', 'crewCardOutOff', 'crewCardOutVacation', 'crewCardOutSick']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(KIOSK_CSS),
    `CSS .${cls} defined`)
}

// Compact card MUST NOT be styled by the base assignment-card rules
// ALONE — the new .crewCardOut class is required to opt in to the
// compact sizing. Pin via: the out card render uses a composed
// className (asserted above) and not just `styles.boardPersonBar`.
assert(!/className=\{styles\.boardPersonBar\}\s*\n\s*data-out-status=/.test(KIOSK),
  'out card article does NOT use the bare .boardPersonBar class (must compose with .crewCardOut)')

// Phase E.9b — Full-width sizing. The previous compact layout
// (width: fit-content / align-self: flex-start / 6px padding) is
// replaced with full-width rules so the out bar matches assignment
// bars' vertical rhythm.
const fwRule = KIOSK_CSS.match(/\.crewCardOut\s*\{[\s\S]*?\n\}/)
const fwSrc  = fwRule ? fwRule[0] : ''
assert(fwSrc.length > 0, '.crewCardOut CSS rule extracted')
assert(/width:\s*100%/.test(fwSrc),
  '.crewCardOut uses width: 100% (full-width bar)')
assert(/align-self:\s*stretch/.test(fwSrc),
  '.crewCardOut uses align-self: stretch (matches assignment bars)')

// Negative pin: the compact layout properties are GONE.
assert(!/width:\s*fit-content/.test(fwSrc),
  '.crewCardOut no longer uses width: fit-content (compact layout removed)')
assert(!/align-self:\s*flex-start/.test(fwSrc),
  '.crewCardOut no longer uses align-self: flex-start (compact layout removed)')

// Padding still scales with --board-bar-scale so the bar tracks the
// rest of the kiosk density logic, just slightly shorter vertically.
assert(/padding:\s*calc\(\d+px \* var\(--board-bar-scale, 1\)\)\s+calc\(\d+px \* var\(--board-bar-scale, 1\)\)/.test(fwSrc),
  '.crewCardOut padding scales via --board-bar-scale (matches density of assignment bars)')

// Suppression rules still in place — task title / notes / Spanish are
// never rendered, even if a future refactor injects those elements.
assert(/\.crewCardOut\s+\.boardTaskBlock,\s*\n\s*\.crewCardOut\s+\.boardNotesText,\s*\n\s*\.crewCardOut\s+\.boardTaskText\s*\{\s*display:\s*none;\s*\}/.test(KIOSK_CSS),
  'CSS hides .boardTaskBlock / .boardNotesText / .boardTaskText inside any out card (defense-in-depth suppression)')

// Phase E.9b — Inline header row.
assert(/\.crewCardOutHeader\s*\{/.test(KIOSK_CSS),
  '.crewCardOutHeader CSS rule defined')
const headerRule = KIOSK_CSS.match(/\.crewCardOutHeader\s*\{[\s\S]*?\n\}/)
const headerSrc  = headerRule ? headerRule[0] : ''
assert(/display:\s*flex/.test(headerSrc),
  '.crewCardOutHeader uses display: flex (inline header row)')
assert(/align-items:\s*center/.test(headerSrc),
  '.crewCardOutHeader vertically centers name + badge')
assert(/flex-wrap:\s*wrap/.test(headerSrc),
  '.crewCardOutHeader wraps so long names do not overlap the badge')

// Phase E.9b — Status badge styling. Anchor on a line-start match so
// the descendant rule `.crewCardOutHeader .crewCardOutBadge { ... }`
// doesn't get picked up instead of the main .crewCardOutBadge rule.
assert(/^\.crewCardOutBadge\s*\{/m.test(KIOSK_CSS),
  '.crewCardOutBadge CSS rule defined (top-level)')
const badgeRule = KIOSK_CSS.match(/^\.crewCardOutBadge\s*\{[\s\S]*?\n\}/m)
const badgeSrc  = badgeRule ? badgeRule[0] : ''
assert(/font-size:\s*clamp\(16px,\s*1\.4vw,\s*22px\)/.test(badgeSrc),
  '.crewCardOutBadge font-size uses clamp(16px, 1.4vw, 22px)')
assert(/font-weight:\s*900/.test(badgeSrc),
  '.crewCardOutBadge font-weight: 900 (heavy weight for TV scan)')
assert(/border-radius:\s*999px/.test(badgeSrc),
  '.crewCardOutBadge uses pill-shaped border-radius: 999px')
assert(/border:\s*1px solid currentColor/.test(badgeSrc),
  '.crewCardOutBadge border uses currentColor (matches per-status color)')
assert(/text-transform:\s*uppercase/.test(badgeSrc),
  '.crewCardOutBadge text-transform: uppercase')

// Per-status badge colors.
assert(/\.crewCardOutBadge\[data-out-status="off"\]\s*\{[\s\S]{0,200}color:\s*#cbd5e1/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="off"] uses slate color (#cbd5e1)')
assert(/\.crewCardOutBadge\[data-out-status="vacation"\]\s*\{[\s\S]{0,200}color:\s*#93c5fd/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="vacation"] uses blue color (#93c5fd)')
assert(/\.crewCardOutBadge\[data-out-status="sick"\]\s*\{[\s\S]{0,200}color:\s*#fda4af/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="sick"] uses rose color (#fda4af)')

// Out-card name typography — readable but not as bold as a working
// card's name (the badge carries the primary signal).
assert(/\.crewCardOut\s+\.boardPersonName\s*\{[\s\S]{0,200}font-size:\s*clamp\(24px,\s*2\.6vw,\s*36px\)/.test(KIOSK_CSS),
  '.crewCardOut .boardPersonName overrides font-size with clamp(24px, 2.6vw, 36px)')

// Out branch JSX renders the inline header + badge structure.
const outBranchMatch2 = KIOSK.match(/if \(op\.outStatus\) \{[\s\S]*?return \(\s*<article[\s\S]*?<\/article>\s*\)/)
const outBranchSrc2   = outBranchMatch2 ? outBranchMatch2[0] : ''
assert(outBranchSrc2.length > 0, 'out-status render branch extracted')
const outBranchCode = stripComments(outBranchSrc2)
// Wraps name + badge in .crewCardOutHeader.
assert(/<div className=\{styles\.crewCardOutHeader\}>/.test(outBranchCode),
  'out card render wraps name + badge in <div className={styles.crewCardOutHeader}>')
// Name is still rendered.
assert(/<h2 className=\{styles\.boardPersonName\}>\{op\.employeeName \?\? 'Unassigned'\}<\/h2>/.test(outBranchCode),
  'out card render still includes the <h2> name')
// Suppression invariants — no task / notes / assignments / Spanish render in the out branch.
assert(!/boardTaskBlock/.test(outBranchCode),
  'out branch JSX does not wrap in .boardTaskBlock')
assert(!/boardTaskText/.test(outBranchCode),
  'out branch JSX does not render boardTaskText')
assert(!/boardNotesText/.test(outBranchCode),
  'out branch JSX does not render boardNotesText')
assert(!/op\.assignments\.map/.test(outBranchCode),
  'out branch JSX does not iterate op.assignments')
assert(!/showSpanishNotes/.test(outBranchCode),
  'out branch JSX does not consult showSpanishNotes')

// Dead .boardOutStatusText rules removed (the standalone <p> form is
// gone in E.9b). Pin to make sure we don't accidentally reintroduce
// the old rule when adding future polish.
assert(!/\.boardOutStatusText\s*\{/.test(KIOSK_CSS),
  'dead .boardOutStatusText CSS rules removed (replaced by .crewCardOutBadge)')

// ── Normal working cards keep the existing layout class ─────────────
section('Normal working cards retain existing .boardPersonBar-only sizing')

// Working render branch uses just .boardPersonBar — no compact class.
assert(/return \(\s*\n\s*<article key=\{op\.key\} className=\{styles\.boardPersonBar\}>/.test(KIOSK),
  'working card article uses bare styles.boardPersonBar (no compact class)')
// And the base .boardPersonBar rule still exists with the original
// scaled padding/gap (we did NOT change the base rule).
assert(/\.boardPersonBar\s*\{[\s\S]{0,400}padding:\s*calc\(20px \* var\(--board-bar-scale, 1\)\)\s+calc\(26px \* var\(--board-bar-scale, 1\)\)/.test(KIOSK_CSS),
  '.boardPersonBar (base) still scales padding via --board-bar-scale (working cards unchanged)')

// ── CSS — out-status classes defined ────────────────────────────────
section('CSS — out-status colors + label class defined')

assert(/\.boardPersonBar\[data-out-status="off"\]\s*\{[\s\S]{0,300}rgba\(71,\s*85,\s*105/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="off"] uses a slate/gray tint')
assert(/\.boardPersonBar\[data-out-status="vacation"\]\s*\{[\s\S]{0,300}rgba\(37,\s*99,\s*235/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="vacation"] uses a blue tint')
assert(/\.boardPersonBar\[data-out-status="sick"\]\s*\{[\s\S]{0,300}rgba\(244,\s*63,\s*94/.test(KIOSK_CSS),
  '.boardPersonBar[data-out-status="sick"] uses a rose tint')

// Phase E.9b — Badge color classes (replaces the dead
// .boardOutStatusText rules pinned above in the compact section).
assert(/\.crewCardOutBadge\[data-out-status="off"\]\s*\{[\s\S]{0,200}color:\s*#cbd5e1/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="off"] uses slate color (#cbd5e1)')
assert(/\.crewCardOutBadge\[data-out-status="vacation"\]\s*\{[\s\S]{0,200}color:\s*#93c5fd/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="vacation"] uses blue color (#93c5fd)')
assert(/\.crewCardOutBadge\[data-out-status="sick"\]\s*\{[\s\S]{0,200}color:\s*#fda4af/.test(KIOSK_CSS),
  '.crewCardOutBadge[data-out-status="sick"] uses rose color (#fda4af)')

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
