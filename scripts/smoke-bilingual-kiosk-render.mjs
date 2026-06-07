// Phase 9C.5b3 — Kiosk Spanish translation render smoke.
//
//   node scripts/smoke-bilingual-kiosk-render.mjs
//
// /display-board/board now renders the Spanish fields authored in
// 9C.5b2:
//
//   • Per-assignment Spanish notes underneath the English note.
//   • Bilingual marquee text for liveAlerts AND crew-broadcast
//     dayNotes (urgent | safety | weather only).
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

// Extract the boardMode early-return JSX slice. The shape matches the
// 9C.5a marquee smoke regex, anchoring on `</div>\s*\)\s*\}`.
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''

// ── operatorCards push payload exposes notesEs ─────────────────────────
section('operatorCards push payload exposes notesEs to BoardModeCrewBars')

assert(/op\.assignments\.push\(\{[\s\S]*?notesEs:\s*a\.notesEs\s*\?\?\s*['"]['"]/.test(DB),
  "op.assignments.push({...}) payload includes notesEs: a.notesEs ?? ''")
assert(/op\.assignments\.push\(\{[\s\S]*?notes:\s*a\.notes\s*\?\?\s*['"]['"]/.test(DB),
  "op.assignments.push({...}) STILL includes notes: a.notes ?? '' (English unchanged)")

// ── formatBilingualText helper ─────────────────────────────────────────
section('formatBilingualText helper — module-scope')

const helperMatch = DB.match(/function\s+formatBilingualText\(\s*\{[^}]*\}\s*\)\s*\{[\s\S]*?\n\}/)
const helperSrc   = helperMatch ? helperMatch[0] : ''
assert(helperSrc.length > 0, 'function formatBilingualText({...}) is defined')

// Destructures the four input keys.
for (const key of ['title', 'body', 'titleEs', 'bodyEs']) {
  assert(new RegExp(`function\\s+formatBilingualText\\(\\s*\\{[^}]*\\b${key}\\b`).test(DB),
    `formatBilingualText destructures '${key}' from its input`)
}

// Builds the English half and the Spanish half.
assert(/const\s+en\s*=\s*title\s*\?\s*`\$\{title\}/.test(helperSrc),
  "helper builds en = title ? `${title}...` : (body ?? '')")
assert(/const\s+es\s*=\s*titleEs\s*\?\s*`\$\{titleEs\}/.test(helperSrc),
  "helper builds es = titleEs ? `${titleEs}...` : (bodyEs ?? '')")

// Joins with ` • ES: ` separator when both are present.
assert(/return\s+`\$\{enTrim\}\s*•\s*ES:\s*\$\{esTrim\}`/.test(helperSrc),
  "helper returns `${enTrim} • ES: ${esTrim}` when both English and Spanish are present")

// Spanish-only fallback uses `ES:` prefix.
assert(/if \(esTrim\)\s*return\s+`ES:\s*\$\{esTrim\}`/.test(helperSrc),
  "helper Spanish-only fallback returns `ES: ${esTrim}` prefix")

// English-only / empty path returns enTrim.
assert(/return\s+enTrim/.test(helperSrc),
  'helper returns enTrim for English-only / empty path')

// ── kioskAlerts derivation uses the helper for both arms ───────────────
section('kioskAlerts derivation — bilingual via formatBilingualText')

const kioskAlertsMatch = DB.match(/const\s+kioskAlerts\s*=\s*\[[\s\S]*?\]\.filter\(a\s*=>\s*\(a\.text\s*\?\?\s*''\)\.trim\(\)\.length\s*>\s*0\)/)
const kioskAlertsSrc   = kioskAlertsMatch ? kioskAlertsMatch[0] : ''
assert(kioskAlertsSrc.length > 0, 'kioskAlerts derivation block located')

// liveAlerts arm threads title/message/titleEs/messageEs into the helper.
assert(/liveAlerts\.map\([\s\S]*?formatBilingualText\(\{[\s\S]*?title:\s*a\.title[\s\S]*?body:\s*a\.message[\s\S]*?titleEs:\s*a\.titleEs[\s\S]*?bodyEs:\s*a\.messageEs/.test(kioskAlertsSrc),
  'liveAlerts.map calls formatBilingualText with { title: a.title, body: a.message, titleEs: a.titleEs, bodyEs: a.messageEs }')

// dayNotes arm threads title/body/titleEs/bodyEs into the helper.
assert(/dayNotes\s*\n?\s*\.filter[\s\S]*?\.map\([\s\S]*?formatBilingualText\(\{[\s\S]*?title:\s*n\.title[\s\S]*?body:\s*n\.body[\s\S]*?titleEs:\s*n\.titleEs[\s\S]*?bodyEs:\s*n\.bodyEs/.test(kioskAlertsSrc),
  'dayNotes.filter(...).map calls formatBilingualText with { title: n.title, body: n.body, titleEs: n.titleEs, bodyEs: n.bodyEs }')

// Priority filter preserved (regression couple from 9C.5a marquee).
assert(/n\.priority === 'urgent'\s*\|\|\s*n\.priority === 'safety'\s*\|\|\s*n\.priority === 'weather'/.test(kioskAlertsSrc),
  "dayNotes filter still scoped to priority urgent | safety | weather")
assert(!/n\.priority === 'routine'/.test(kioskAlertsSrc),
  "kioskAlerts does NOT include routine-priority dayNotes (regression)")
assert(!/n\.priority === 'important'/.test(kioskAlertsSrc),
  "kioskAlerts does NOT include important-priority dayNotes (regression)")

// Final filter strips items with empty text (both English + Spanish blank).
assert(/\.filter\(a\s*=>\s*\(a\.text\s*\?\?\s*''\)\.trim\(\)\.length\s*>\s*0\)/.test(kioskAlertsSrc),
  'final .filter strips items with empty text (covers both-empty case)')

// ── BoardModeCrewBars Spanish render ───────────────────────────────────
section('BoardModeCrewBars — Spanish assignment note render')

assert(/const\s+trimmedNotesEs\s*=\s*\(a\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  "trimmedNotesEs = (a.notesEs ?? '').trim() — Spanish gating value computed per task")

// Spanish <p> has lang="es".
assert(/<p\s*\n?\s*className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n?\s*lang="es"/.test(DB),
  '<p className={`${styles.boardNotesText} ${styles.boardNotesTextEs}`} lang="es"> — Spanish line carries both classes')

// Spanish render gated on trimmedNotesEs.length > 0.
assert(/trimmedNotesEs\.length > 0 &&\s*\(\s*<p/.test(DB),
  'Spanish <p> render is gated on trimmedNotesEs.length > 0')

// Spanish line uses the trimmed value.
assert(/\{trimmedNotesEs\}/.test(DB),
  'Spanish <p> renders {trimmedNotesEs}')

// English path unchanged (regression couple — same regex as 9C.4b smoke).
assert(/const\s+trimmedNotes\s*=\s*\(a\.notes\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  "trimmedNotes = (a.notes ?? '').trim() — English gating value preserved")
assert(/trimmedNotes\.length > 0 &&\s*\(\s*<p className=\{styles\.boardNotesText\}>\{trimmedNotes\}<\/p>/.test(DB),
  'English <p className={styles.boardNotesText}>{trimmedNotes}</p> render preserved')

// Spanish-only fallback path: the two gates are independent (no else),
// so trimmedNotes empty + trimmedNotesEs non-empty renders Spanish alone.
const taskBlockMatch = DB.match(/<div key=\{a\.id\s*\?\?\s*idx\} className=\{styles\.boardTaskBlock\}>[\s\S]*?<\/div>/)
const taskBlockSrc   = taskBlockMatch ? taskBlockMatch[0] : ''
assert(taskBlockSrc.length > 0, 'boardTaskBlock JSX slice extracted')
assert(!/\}\s*else\s*\{/.test(taskBlockSrc),
  'English and Spanish render gates are independent (no else branch coupling them) → Spanish-only fallback works')

// ── CSS — .boardNotesTextEs class ──────────────────────────────────────
section('CSS — .boardNotesTextEs visual differentiation')

assert(/\.boardNotesTextEs\s*\{/.test(CSS),
  '.boardNotesTextEs class defined')

// Visual differentiation — color or font-style or both.
const boardNotesTextEsMatch = CSS.match(/\.boardNotesTextEs\s*\{[\s\S]*?\n\}/)
const boardNotesTextEsSrc   = boardNotesTextEsMatch ? boardNotesTextEsMatch[0] : ''
assert(/font-style:\s*italic/.test(boardNotesTextEsSrc) ||
       /color:\s*rgba/.test(boardNotesTextEsSrc),
  '.boardNotesTextEs has visual differentiation (italic and/or distinct color)')

// Regression — base .boardNotesText still defined and density rules
// unchanged. Spanish piggybacks via both-class application.
assert(/\.boardNotesText\s*\{[\s\S]{0,400}clamp\([\s\S]{0,100}calc\([\s\S]{0,60}var\(--board-bar-scale/.test(CSS),
  '.boardNotesText still uses calc(var(--board-bar-scale)) clamp() max (9C.4d preserved)')
assert(/\.boardBars\[data-density='comfortable'\]\s+\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*3/.test(CSS),
  'comfortable density still clamps .boardNotesText to 3 lines (9C.4c preserved)')
assert(/\.boardBars\[data-density='compact'\]\s+\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*2/.test(CSS),
  'compact density still clamps .boardNotesText to 2 lines (9C.4c preserved)')
assert(/@media\s*\(\s*max-height:\s*760px\s*\)[\s\S]*?\.boardNotesText\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*2/.test(CSS),
  'short-height @media still clamps .boardNotesText to 2 lines (9C.4d preserved)')

// The Spanish class does NOT add its own density / line-clamp / font-size
// rules. It relies on the base .boardNotesText through both-class application.
assert(!/\.boardBars\[data-density='comfortable'\]\s+\.boardNotesTextEs\s*\{/.test(CSS),
  '.boardNotesTextEs does NOT have its own comfortable-density override (piggybacks)')
assert(!/\.boardBars\[data-density='compact'\]\s+\.boardNotesTextEs\s*\{/.test(CSS),
  '.boardNotesTextEs does NOT have its own compact-density override (piggybacks)')

// ── Kiosk invariants — 9C.4a/b/c/d/e + 9C.5a preserved ────────────────
section('Kiosk invariants — earlier phases preserved')

assert(/const\s+boardBarScale\s*=\s*Math\.max\(\s*0\.45\s*,/.test(DB),
  '9C.4d: boardBarScale floor 0.45 preserved')
assert(/data-density=\{density\}/.test(DB),
  '9C.4c: data-density={density} preserved on wrapper')
assert(/const\s+KIOSK_REFRESH_MS\s*=\s*60 \* 1000/.test(DB),
  '9C.4a: KIOSK_REFRESH_MS = 60 * 1000 preserved')
assert(/if \(boardMode\)\s*\{[\s\S]{0,200}selectedDate !== todayNow[\s\S]{0,80}setSelectedDate\(todayNow\)/.test(DB),
  '9C.4a: midnight rollover preserved')
assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  '9C.3b: canDeleteTasks gate preserved')

// 9C.5a: <header styles.boardDateTop> first, marquee second, crew bars third.
const datePos    = earlyReturnJsx.search(/<header className=\{styles\.boardDateTop\}>/)
const marqueePos = earlyReturnJsx.search(/<BoardModeAlertMarquee\b/)
const barsPos    = earlyReturnJsx.search(/<BoardModeCrewBars\b/)
assert(datePos >= 0 && marqueePos >= 0 && barsPos >= 0,
  '9C.5a: date header + marquee + crew bars all present in early return')
assert(datePos < marqueePos && marqueePos < barsPos,
  '9C.5a: ordering date → marquee → bars preserved')

// 9C.5a marquee view-only invariants.
const marqueeFnMatch = DB.match(/function\s+BoardModeAlertMarquee[\s\S]*?\n\}\n/)
const marqueeFnSrc   = marqueeFnMatch ? marqueeFnMatch[0] : ''
for (const forbidden of ['onClick', 'onDelete', 'onDismiss', 'onClose', '<button', 'Button']) {
  assert(!new RegExp(`\\b${forbidden}\\b`).test(marqueeFnSrc),
    `BoardModeAlertMarquee remains view-only (no ${forbidden})`)
}

// ── Privacy — kiosk source still avoids private fields ─────────────────
section('Privacy — kiosk source avoids private notes / condition logs')

for (const term of [
  'conditionLogStore', 'conditionLog/', 'private_notes', 'privateNotes',
  'course_condition', 'course-condition', '/api/condition-logs',
]) {
  assert(!DB.includes(term),
    `DisplayBoard.jsx does not reference "${term}"`)
}

// ── Forbidden components inside the early-return ───────────────────────
section('boardMode early return — forbidden components still absent')

for (const comp of [
  'BrandHeader', 'DateClockPanel', 'ConditionsPanel', 'WeatherImpactsPanel',
  'EquipmentStatusPanel', 'OperationalIntelligencePanel', 'CrewBriefingPanel',
  'FieldConditionsPanel', 'ModeToggle', 'TaskCard', 'OperatorCard',
]) {
  assert(!new RegExp(`<${comp}\\b`).test(earlyReturnJsx),
    `boardMode early return still excludes <${comp}>`)
}
assert(!/styles\.dateStrip/.test(earlyReturnJsx),
  'boardMode early return still excludes 7-day .dateStrip')
assert(!/styles\.assignDeleteBtn/.test(earlyReturnJsx),
  'boardMode early return still excludes .assignDeleteBtn')

// ── Normal /display-board + print path unchanged ───────────────────────
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

// ── Cross-file guards — Phase 9C.5b3 is kiosk render only ──────────────
section('Cross-file guards — authoring / Employee Mgmt / worker untouched')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'src/utils/crew/crewStore.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5b3'),
    `${path} carries no Phase 9C.5b3 edits (kiosk render only)`)
}

// ── No new migration beyond 0049 ───────────────────────────────────────
section('No D1 schema change — migrations ledger unchanged')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
const highestMigration = migrationFiles[migrationFiles.length - 1]
assert(highestMigration === '0049_bilingual_kiosk_fields.sql',
  `highest migration is still 0049 (found: ${highestMigration})`)

// ── No external translation / i18n / AI dependency ─────────────────────
section('No external translation / i18n / Workers AI dependency added')

const pkg     = readFileSync('package.json',    'utf8')
const wrangler = readFileSync('wrangler.jsonc', 'utf8')
for (const term of ['i18next', 'react-intl', 'formatjs', '@cloudflare/ai', 'workers-ai', 'm2m100']) {
  assert(!pkg.includes(term),
    `package.json does NOT depend on "${term}" (manual stored translations only)`)
}
assert(!/binding[\s\S]{0,40}["']AI["']/.test(wrangler),
  'wrangler.jsonc does NOT bind a Workers AI service')

// ── 9C.5b1 + 9C.5b2 + 9C.5a.5 regression preservation ─────────────────
section('Phase 9C.5b1 + 9C.5b2 + 9C.5a.5 regression couples')

const ASN    = readFileSync('worker/api/assignments.js',      'utf8')
const NOTES  = readFileSync('worker/api/operationsNotes.js',  'utf8')
const ALERTS = readFileSync('worker/api/alerts.js',           'utf8')
const CREW   = readFileSync('worker/api/crew.js',             'utf8')

assert(/notesEs:\s*row\.notes_es/.test(ASN),
  '9C.5b1: rowToCrewAssignment still maps notesEs')
assert(/titleEs:\s*row\.title_es/.test(NOTES) && /bodyEs:\s*row\.body_es/.test(NOTES),
  '9C.5b1: rowToNote still maps titleEs + bodyEs')
assert(/titleEs:\s*row\.title_es/.test(ALERTS) && /messageEs:\s*row\.message_es/.test(ALERTS),
  '9C.5b1: rowToAlert still maps titleEs + messageEs')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*next\s*\}\)/.test(DAB),
  '9C.5b2: DAB handleNotesEsBlur still PATCHes { notesEs: next }')

const DBP = readFileSync('src/pages/Operations/DailyBriefingPanel.jsx', 'utf8')
assert(/titleEs:\s*draft\.titleEs\s*\|\|\s*null/.test(DBP) &&
       /bodyEs:\s*draft\.bodyEs\s*\|\|\s*null/.test(DBP),
  '9C.5b2: DailyBriefingPanel still sends titleEs/bodyEs in save payload')

assert(/function rowToEmployee\(row,\s*canViewPrivate/.test(CREW),
  '9C.5a.5: rowToEmployee(row, canViewPrivate) signature preserved')
assert(/if \(canViewPrivate\)\s*\{[\s\S]{0,400}out\.payRate\s*=\s*row\.pay_rate/.test(CREW),
  '9C.5a.5: payRate still gated behind if (canViewPrivate)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
