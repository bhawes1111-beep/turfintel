// Phase 9C.5c4 — Kiosk per-operator Spanish gating smoke.
//
//   node scripts/smoke-kiosk-translation-gating.mjs
//
// /display-board/board now reads each operator's translation prefs
// (autoTranslateBoardNotes + boardLanguage) and uses them to decide
// whether to render the bilingual Spanish line on that operator's bar.
//
//   • Per-bar gate: BoardModeCrewBars renders the Spanish <p> only
//     when op.showSpanishNotes is true (employee opted in to Spanish).
//   • Board-wide gate: the marquee renders bilingual text only when
//     at least one operator on today's board needs Spanish. If nobody
//     needs it, the marquee stays English-only even if titleEs/bodyEs/
//     messageEs are stored in D1.
//
// Source-only — does not boot a server.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',          'utf8')
const CSS = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',   'utf8')

// ── employeeNeedsSpanish helper ────────────────────────────────────────
section('employeeNeedsSpanish helper — module-scope')

assert(/function\s+employeeNeedsSpanish\(employee\)/.test(DB),
  'function employeeNeedsSpanish(employee) is defined')

const helperMatch = DB.match(/function\s+employeeNeedsSpanish\([\s\S]*?\n\}/)
const helperSrc   = helperMatch ? helperMatch[0] : ''
assert(/Boolean\(employee\?\.autoTranslateBoardNotes\)/.test(helperSrc),
  'employeeNeedsSpanish checks Boolean(employee?.autoTranslateBoardNotes)')
assert(/employee\?\.boardLanguage\s*===\s*['"]es['"]/.test(helperSrc),
  "employeeNeedsSpanish checks employee?.boardLanguage === 'es'")
assert(/&&/.test(helperSrc),
  'employeeNeedsSpanish ANDs the two conditions (both must be true)')

// ── employeeById Map ───────────────────────────────────────────────────
section('employeeById — full-row lookup for per-operator gating')

assert(/const\s+employeeById\s*=\s*useMemo\(/.test(DB),
  'const employeeById = useMemo(...) is declared')

const empByIdMatch = DB.match(/const\s+employeeById\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[employees\]\s*\)/)
assert(empByIdMatch != null,
  'employeeById useMemo depends on [employees]')

assert(/for\s*\(const\s+e\s+of\s+employees\)\s+m\.set\(e\.id,\s*e\)/.test(DB),
  'employeeById Map is populated with for (const e of employees) m.set(e.id, e)')

// Regression — the name-only Map is still defined (used by other
// non-kiosk consumers + by the operatorCards name resolution).
assert(/const\s+employeeNameLookup\s*=\s*useMemo\(/.test(DB),
  'employeeNameLookup useMemo still defined (regression)')

// ── operatorCards reads employeeById + sets showSpanishNotes ──────────
section('operatorCards — reads employeeById, sets showSpanishNotes')

// Reads the employee from the new Map.
assert(/employeeById\.get\(a\.employeeId\)/.test(DB),
  'operatorCards reads employeeById.get(a.employeeId)')

// Sets showSpanishNotes on the operator card via the helper.
assert(/showSpanishNotes:\s*employeeNeedsSpanish\(employee\)/.test(DB),
  'operatorCards sets showSpanishNotes: employeeNeedsSpanish(employee)')

// Missing employeeId defaults to null employee (helper returns false).
assert(/const\s+employee\s*=\s*a\.employeeId\s*\?\s*employeeById\.get\(a\.employeeId\)\s*:\s*null/.test(DB),
  'operatorCards resolves employee = a.employeeId ? employeeById.get(a.employeeId) : null (null → showSpanishNotes false)')

// operatorCards useMemo includes employeeById in its dep list.
assert(/\}, \[dayCrew, dayEvents, equipByEvent, employeeNameLookup, employeeById\]\)/.test(DB),
  'operatorCards useMemo dep list includes employeeById')

// ── BoardModeCrewBars — Spanish render gated on op.showSpanishNotes ───
section('BoardModeCrewBars — per-bar Spanish gate')

// Spanish <p> render condition includes op.showSpanishNotes.
assert(/trimmedNotesEs\.length > 0\s*&&\s*op\.showSpanishNotes\s*&&\s*\(\s*\n?\s*<p/.test(DB),
  'Spanish <p> renders only when trimmedNotesEs.length > 0 && op.showSpanishNotes')

// English render is unchanged (regression couple from 9C.5b3 + 9C.4b).
assert(/trimmedNotes\.length > 0 &&\s*\(\s*<p className=\{styles\.boardNotesText\}>\{trimmedNotes\}<\/p>/.test(DB),
  'English <p> render preserved (no employee gating on English)')

// Spanish <p> retains both classes from 9C.5b3.
assert(/className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}/.test(DB),
  'Spanish <p> still uses both boardNotesText + boardNotesTextEs classes')

// Spanish <p> still has lang="es".
assert(/<p\s*\n?\s*className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n?\s*lang="es"/.test(DB),
  'Spanish <p> still carries lang="es"')

// ── boardNeedsSpanish — board-wide marquee gate ───────────────────────
section('boardNeedsSpanish — kiosk marquee gate')

assert(/const\s+boardNeedsSpanish\s*=\s*operatorCards\.some\(op\s*=>\s*op\.showSpanishNotes\)/.test(DB),
  'const boardNeedsSpanish = operatorCards.some(op => op.showSpanishNotes)')

// ── formatBilingualText — accepts includeSpanish ──────────────────────
section('formatBilingualText — accepts includeSpanish flag')

const fmtMatch = DB.match(/function\s+formatBilingualText\(\s*\{[^}]*\}\s*\)\s*\{[\s\S]*?\n\}/)
const fmtSrc   = fmtMatch ? fmtMatch[0] : ''
assert(fmtSrc.length > 0, 'formatBilingualText body extracted')

// Destructures includeSpanish with a default of true.
assert(/function\s+formatBilingualText\(\s*\{[^}]*\bincludeSpanish\s*=\s*true\b/.test(DB),
  'formatBilingualText destructures includeSpanish = true (default opt-in)')

// English-only branch when includeSpanish is false.
assert(/if \(!includeSpanish\)\s*return\s+enTrim/.test(fmtSrc),
  'formatBilingualText returns enTrim when includeSpanish is false')

// Bilingual ES separator still present (regression).
assert(/return\s+`\$\{enTrim\}\s*•\s*ES:\s*\$\{esTrim\}`/.test(fmtSrc),
  'formatBilingualText still joins with ` • ES: ` when both languages present + includeSpanish (regression)')

// Spanish-only fallback still present (regression).
assert(/if \(esTrim\)\s*return\s+`ES:\s*\$\{esTrim\}`/.test(fmtSrc),
  "formatBilingualText Spanish-only branch still returns 'ES: ...' (regression)")

// ── kioskAlerts derivation passes boardNeedsSpanish through helper ────
section('kioskAlerts derivation — threads includeSpanish: boardNeedsSpanish')

// liveAlerts arm.
assert(/liveAlerts\.map\([\s\S]*?formatBilingualText\(\{[\s\S]*?includeSpanish:\s*boardNeedsSpanish/.test(DB),
  'liveAlerts arm passes includeSpanish: boardNeedsSpanish to formatBilingualText')

// dayNotes arm.
assert(/dayNotes\s*\n?\s*\.filter[\s\S]*?\.map\([\s\S]*?formatBilingualText\(\{[\s\S]*?includeSpanish:\s*boardNeedsSpanish/.test(DB),
  'dayNotes arm passes includeSpanish: boardNeedsSpanish to formatBilingualText')

// Priority filter preserved (regression couple from 9C.5a marquee).
assert(/n\.priority === 'urgent'\s*\|\|\s*n\.priority === 'safety'\s*\|\|\s*n\.priority === 'weather'/.test(DB),
  "dayNotes filter still scoped to priority urgent | safety | weather (regression)")
assert(!/n\.priority === 'routine'/.test(DB),
  "kioskAlerts derivation still does NOT include routine-priority dayNotes (regression)")
assert(!/n\.priority === 'important'/.test(DB),
  "kioskAlerts derivation still does NOT include important-priority dayNotes (regression)")

// Final empty-text filter preserved (regression).
assert(/\.filter\(a\s*=>\s*\(a\.text\s*\?\?\s*''\)\.trim\(\)\.length\s*>\s*0\)/.test(DB),
  'final .filter strips items with empty text (regression)')

// ── Cross-file guards — 9C.5c4 is kiosk-render only ────────────────────
section('Cross-file guards — worker / authoring / Employee Mgmt untouched')

for (const path of [
  'worker/lib/autoTranslate.js',
  'worker/lib/translate.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'wrangler.jsonc',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c4'),
    `${path} carries no Phase 9C.5c4 edits (kiosk render only)`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[3-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0052 (0052_spray_compliance_snapshots accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── No new provider config / Workers AI tweaks ────────────────────────
section('No provider config changes')

const wrangler = readFileSync('wrangler.jsonc', 'utf8')
assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(wrangler),
  'wrangler.jsonc still configures TRANSLATE_PROVIDER: "cf-ai" (regression)')
assert(/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*\}/.test(wrangler),
  'wrangler.jsonc still binds env.AI (regression)')

// ── Privacy — public-safe employee fields only ─────────────────────────
section('Privacy — kiosk reads only public-safe employee fields')

// employeeById iterates over the existing `employees` array (sourced
// from /api/crew-employees public-safe GET). It doesn't touch private
// columns — those are gated server-side by the 9C.5a.5 serializer.
// The kiosk source file should still not reference any private field
// IN CODE. Comments that name the private fields for documentation
// (e.g. "no payRate / private fields") are fine and are stripped from
// the scan below so they don't false-positive.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')      // line comments (avoid http://)
}
const DB_CODE = stripComments(DB)
for (const term of ['payRate', 'emergencyContact', 'pesticideLicense', 'hireDate',
                    'pay_rate', 'emergency_contact', 'private_notes', 'privateNotes',
                    'conditionLog', 'course_condition']) {
  assert(!DB_CODE.includes(term),
    `DisplayBoard.jsx CODE does not reference '${term}' (comments mentioning it for docs are allowed)`)
}

// ── boardMode public + view-only invariants preserved ─────────────────
section('boardMode early-return — public + view-only invariants preserved')

const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''
assert(earlyReturnJsx.length > 0, 'boardMode early-return JSX extracted')

// Forbidden components stay absent.
for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnJsx),
    `boardMode early return still excludes <${comp}>`)
}
assert(!/styles\.assignDeleteBtn/.test(earlyReturnJsx),
  'boardMode early return still excludes .assignDeleteBtn (no edit/delete on kiosk)')

// 9C.5a public route + 60s refresh + midnight rollover.
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  'KIOSK_REFRESH_MS = 60 * 1000 preserved (9C.4a)')
// Phase 9C.6 — boardMode rollover gated by !boardDateTouched; accept either form.
assert(/if \(boardMode(?:\s*&&\s*!boardDateTouched)?\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  'midnight rollover preserved (9C.4a)')

// 9C.5a date-top + marquee ordering.
const datePos    = earlyReturnJsx.search(/<header className=\{styles\.boardDateTop\}>/)
const marqueePos = earlyReturnJsx.search(/<BoardModeAlertMarquee\b/)
const barsPos    = earlyReturnJsx.search(/<BoardModeCrewBars\b/)
assert(datePos >= 0 && marqueePos >= 0 && barsPos >= 0,
  '9C.5a date header + marquee + crew bars all present in early return')
assert(datePos < marqueePos && marqueePos < barsPos,
  '9C.5a ordering date → marquee → bars preserved')

// ── Normal /display-board + print path unchanged ──────────────────────
section('Normal /display-board + print path unchanged')

for (const node of [
  '<BrandHeader', '<DateClockPanel', '<ConditionsPanel',
  '<WeatherImpactsPanel', '<EquipmentStatusPanel', '<ModeToggle',
  '<OperationalIntelligencePanel', '<CrewBriefingPanel', '<FieldConditionsPanel',
]) {
  assert(new RegExp(node).test(DB),
    `legacy ${node}…> still rendered outside the boardMode branch`)
}
assert(/printMode\s*&&\s*\(\s*<section className=\{styles\.printPage2\}/.test(DB),
  'printMode <section styles.printPage2> still preserved')

// ── 9C.5b1 + 9C.5b3 + 9C.5c1 + 9C.5c3 + 9C.5c3a regression couples ────
section('Earlier-phase regression couples')

const ASN  = readFileSync('worker/api/assignments.js',      'utf8')
const NOTES= readFileSync('worker/api/operationsNotes.js',  'utf8')
const ALERTS= readFileSync('worker/api/alerts.js',          'utf8')
const CREW = readFileSync('worker/api/crew.js',             'utf8')
const AT   = readFileSync('worker/lib/autoTranslate.js',    'utf8')
const TR   = readFileSync('worker/lib/translate.js',        'utf8')

// 9C.5b1 mappers.
assert(/notesEs:\s*row\.notes_es/.test(ASN),
  '9C.5b1: rowToCrewAssignment still maps notesEs')
assert(/titleEs:\s*row\.title_es/.test(NOTES) && /bodyEs:\s*row\.body_es/.test(NOTES),
  '9C.5b1: rowToNote still maps titleEs + bodyEs')
assert(/titleEs:\s*row\.title_es/.test(ALERTS) && /messageEs:\s*row\.message_es/.test(ALERTS),
  '9C.5b1: rowToAlert still maps titleEs + messageEs')

// 9C.5b3 kiosk render helper still in place (the gate refinement is
// inside this helper, not a replacement).
assert(/const\s+trimmedNotesEs\s*=\s*\(a\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  '9C.5b3: BoardModeCrewBars still computes trimmedNotesEs')

// 9C.5c1 employee translation prefs on worker side.
assert(/autoTranslateBoardNotes:\s*row\.auto_translate_board_notes\s*===\s*1/.test(CREW),
  '9C.5c1: rowToEmployee still maps autoTranslateBoardNotes')
assert(/boardLanguage:\s*row\.board_language\s*\?\?\s*['"]en['"]/.test(CREW),
  "9C.5c1: rowToEmployee still maps boardLanguage")

// 9C.5c3 + 9C.5c3a sweep.
assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env\)/.test(AT),
  '9C.5c3: runAutoTranslateSweep still exported')
// Phase 9C.7a — sweep no longer JOINs calendar_events; employee opt-in
// gate via crew_employees replaces date-scoping.
assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  '9C.7a: assignment sweep LEFT JOINs crew_employees (employee opt-in gate)')

// Provider abstraction intact.
assert(/export\s+function\s+getTranslateProvider\(env\)/.test(TR),
  '9C.5c3: getTranslateProvider still exported')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
