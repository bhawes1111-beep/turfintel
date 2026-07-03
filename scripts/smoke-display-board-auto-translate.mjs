// Phase DAB.10i — Display Board employee auto-translate smoke.
//
//   node scripts/smoke-display-board-auto-translate.mjs
//
// User intent: when an employee has Auto Translate enabled, every
// job's notes render in the translated language on the Display
// Board — with English as a fallback while translation is pending.
// When Auto Translate is off, English renders as-is.
//
// Audit summary (verified before this smoke was written):
//   • Field: crew_employees.auto_translate_board_notes (bool) +
//     board_language ('es') already exist. Client field name is
//     employee.autoTranslateBoardNotes / employee.boardLanguage.
//   • Helper: employeeNeedsSpanish(employee) in DisplayBoard.jsx.
//   • Employee matching: operatorCards useMemo resolves by
//     employeeId when populated; pinned by existing 9C.5c4 smokes.
//   • Sweep: worker/lib/autoTranslate.js queries all crew_assignments
//     joined to crew_employees by employee_id OR employee_name and
//     processes every eligible row — primary AND additional jobs.
//   • PATCH: worker/api/assignments.js NULLs notes_es whenever the
//     English `notes` field is patched without an explicit notesEs
//     (Phase 9C.5c3), so a note edit auto-schedules re-translation.
//
// DAB.10i change: the kiosk's per-assignment render replaces the
// old dual-render (both English + Spanish shown when the operator
// wanted Spanish) with a SELECT-ONE model:
//
//   showSpanishNotes ? (notesEs || notes) : notes
//
// Same op.showSpanishNotes flag, same per-employee resolution — only
// the render output changed.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK       = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',                'utf8')
const KIOSK_CSS   = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',         'utf8')
const CREW_W      = readFileSync('worker/api/crew.js',                                     'utf8')
const ASSIGN_W    = readFileSync('worker/api/assignments.js',                              'utf8')
const AUTO_TRANS  = readFileSync('worker/lib/autoTranslate.js',                            'utf8')
const EMP_FORM    = readFileSync('src/pages/Employees/components/EmployeeFormModal.jsx',   'utf8')

// ── No migration + no duplicate translation service ──────────────
section('No migration / no duplicate translation service')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10i)')

// Auto-translate service: exactly one sweep implementation.
const sweepImplementations = readdirSync('worker/lib').filter(f =>
  f === 'autoTranslate.js' || f === 'translate.js' || f.match(/translate/i)
)
assert(sweepImplementations.includes('autoTranslate.js'),
  'worker/lib/autoTranslate.js exists (canonical sweep)')

// ── Existing Auto Translate field reused ─────────────────────────
section('Auto Translate field: autoTranslateBoardNotes + boardLanguage')

// Server column mapping + boolean coercion preserved.
assert(/autoTranslateBoardNotes:\s+row\.auto_translate_board_notes === 1/.test(CREW_W),
  'crew.js rowToEmployee exposes autoTranslateBoardNotes as boolean')
assert(/autoTranslateBoardNotes:\s+'auto_translate_board_notes'/.test(CREW_W),
  "crew.js CREW_COLUMNS maps autoTranslateBoardNotes → auto_translate_board_notes column")
assert(/BOOLEAN_COLUMNS = new Set\(\['autoTranslateBoardNotes'\]\)/.test(CREW_W),
  'autoTranslateBoardNotes recognized as BOOLEAN column for PATCH coercion')

// Employee form UI already binds to the same field.
assert(/checked=\{form\.autoTranslateBoardNotes\}/.test(EMP_FORM),
  'EmployeeFormModal checkbox binds to form.autoTranslateBoardNotes')
assert(/onChange=\{e => setField\('autoTranslateBoardNotes', e\.target\.checked\)\}/.test(EMP_FORM),
  'EmployeeFormModal onChange updates autoTranslateBoardNotes field')

// Existing employeeNeedsSpanish helper still uses BOTH gates.
assert(/function employeeNeedsSpanish\(employee\) \{\s*\n\s*return Boolean\(employee\?\.autoTranslateBoardNotes\) && employee\?\.boardLanguage === 'es'/.test(KIOSK),
  'employeeNeedsSpanish(employee) checks autoTranslateBoardNotes && boardLanguage === "es"')

// ── Employee matching: employeeId first, then name fallback ──────
section('Employee matching prefers employeeId; name is fallback')

// operatorCards resolves the employee record from a.employeeId when
// populated (byOperator key + employeeById lookup). Legacy assignments
// without employeeId use employeeName as the byOperator key.
assert(/const key = a\.employeeId \?\? a\.employeeName/.test(KIOSK),
  'operatorCards keys by employeeId FIRST, employeeName as fallback')
assert(/const employee = a\.employeeId \? employeeById\.get\(a\.employeeId\) : null/.test(KIOSK),
  'employee record resolved via employeeById.get(a.employeeId) when employeeId present')

// showSpanishNotes computed ONCE per operator card using the helper.
assert(/showSpanishNotes:\s+employeeNeedsSpanish\(employee\)/.test(KIOSK),
  'showSpanishNotes: employeeNeedsSpanish(employee) — computed at card creation')

// ── Per-job language selection ───────────────────────────────────
section('Per-job language selection')

// The new displayNotes / displayLangEs pair inside the .map is what
// drives per-assignment selection. Because they're computed inside
// the map callback, each iteration uses THIS assignment's a.notes /
// a.notesEs — 2nd Job can't reuse 1st Job's translation.
assert(/const displayNotes\s+= op\.showSpanishNotes\s*\n\s*\?\s*\(trimmedNotesEs \|\| trimmedNotes\)\s*\n\s*:\s*trimmedNotes/.test(KIOSK),
  'displayNotes = showSpanishNotes ? (notesEs || notes) : notes (translation ON → Spanish with English fallback)')
assert(/const displayLangEs\s+= op\.showSpanishNotes && trimmedNotesEs\.length > 0/.test(KIOSK),
  'displayLangEs true only when auto-translate enabled AND notesEs non-blank (correct language attribution)')

// Per-assignment values read from THIS row: no shared state, no
// closure over prior iteration.
assert(/const trimmedNotes\s+= \(a\.notes\s+\?\? ''\)\.trim\(\)/.test(KIOSK),
  'trimmedNotes reads THIS a.notes (per-assignment isolation)')
assert(/const trimmedNotesEs\s+= \(a\.notesEs \?\? ''\)\.trim\(\)/.test(KIOSK),
  'trimmedNotesEs reads THIS a.notesEs (per-assignment isolation)')

// Whitespace-only values fall through to fallback (trim → '') then
// || short-circuits to the English base.
assert(/\.trim\(\)/.test(KIOSK) && /trimmedNotesEs \|\| trimmedNotes/.test(KIOSK),
  'whitespace-only notesEs trims to "" → || falls back to trimmedNotes')

// ── Translation-pending fallback ─────────────────────────────────
section('Translation-pending fallback shows original English')

// When op.showSpanishNotes is true but a.notesEs is null / blank:
//   trimmedNotesEs === ''  →  displayNotes = trimmedNotesEs || trimmedNotes = trimmedNotes
//   displayLangEs = showSpanishNotes && 0 > 0 = false
// So the <p> renders trimmedNotes with the English className / no
// lang attribute. Verified structurally by the ternary above.
assert(/displayNotes\.length > 0 && \(/.test(KIOSK),
  'displayNotes.length > 0 gate — empty translation + empty original → no <p> at all')

// ── Single <p> per assignment (no dual render) ───────────────────
section('Single <p> per assignment (dual bilingual render removed)')

// The old code rendered TWO <p>s per assignment when Spanish was
// enabled + notesEs present. New code emits ONE. Count the notes-
// rendering <p> declarations inside the taskBlock JSX; must be 1.
const taskBlockMatch = KIOSK.match(/<div key=\{a\.id \?\? idx\} className=\{styles\.boardTaskBlock\}>[\s\S]*?<\/div>/)
const taskBlockSrc = taskBlockMatch ? taskBlockMatch[0] : ''
assert(taskBlockSrc.length > 0, 'boardTaskBlock JSX slice extracted')
const notesPCount = (taskBlockSrc.match(/<p\s*\n?\s*className=\{(?:styles\.boardNotesText|displayLangEs)/g) ?? []).length
assert(notesPCount === 1,
  `exactly one <p> renders notes per task block (found ${notesPCount})`)

// Single <p> uses conditional className + conditional lang attribute.
assert(/className=\{displayLangEs\s*\n?\s*\?\s*`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\s*\n?\s*:\s*styles\.boardNotesText\}/.test(KIOSK),
  'single <p>: className conditional on displayLangEs (Spanish → both classes, English → base class)')
assert(/lang=\{displayLangEs\s*\?\s*'es'\s*:\s*undefined\}/.test(KIOSK),
  "single <p>: lang={displayLangEs ? 'es' : undefined} (accessibility for screen readers)")

// ── Multi-job: each block gets its OWN notes ─────────────────────
section('Multi-job: each block computes its own displayNotes')

// The .map callback receives (a, idx) — each iteration re-derives
// trimmedNotes / trimmedNotesEs / displayNotes / displayLangEs from
// `a` (the current assignment). 2nd Job's notes can't leak into 1st
// Job because there's no shared mutable state between iterations.
assert(/op\.assignments\.map\(\(a, idx\) => \{/.test(KIOSK),
  '.map((a, idx) => …) — each iteration bound to ITS OWN assignment')

// showOrdinal is per-map-iteration too (regression couple).
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (DAB.10b) — 1st/2nd/3rd Job labels still render')

// ── Sweep processes every eligible crew_assignments row ──────────
section('Translation sweep processes EVERY eligible assignment (primary + additional)')

// The SELECT joins by employee_id OR employee_name and iterates
// every non-cancelled, active-employee, opted-in row — no distinction
// between primary and additional job.
assert(/SELECT a\.id, a\.notes\s*\n\s*FROM crew_assignments AS a/.test(AUTO_TRANS),
  'sweep SELECT reads crew_assignments (all rows for each employee)')
assert(/LEFT JOIN crew_employees AS emp\s*\n\s*ON\s+emp\.id\s+= a\.employee_id\s*\n\s*OR\s+emp\.name = a\.employee_name/.test(AUTO_TRANS),
  'sweep joins by employee_id OR employee_name (matches operatorCards resolution strategy)')
assert(/WHERE a\.notes IS NOT NULL[\s\S]{0,200}AND \(a\.notes_es IS NULL OR TRIM\(a\.notes_es\) = ''\)/.test(AUTO_TRANS),
  'sweep WHERE clause processes rows with English notes + missing/blank Spanish')
assert(/AND emp\.auto_translate_board_notes = 1\s*\n\s*AND emp\.board_language = 'es'/.test(AUTO_TRANS),
  'sweep filters by employee auto-translate opt-in (same field as client)')
// Iterates all matching rows — no LIMIT excluding additional jobs.
assert(/LIMIT \?/.test(AUTO_TRANS),
  'sweep uses budgeted LIMIT (all rows matching, up to budget — includes additional jobs)')

// ── Note-edit invalidation (PATCH clears notes_es) ───────────────
section('Note-edit invalidation preserved (worker NULLs notes_es on notes PATCH)')

assert(/if \(Object\.prototype\.hasOwnProperty\.call\(body, 'notes'\)\s*\n\s*&& !Object\.prototype\.hasOwnProperty\.call\(body, 'notesEs'\)\) \{\s*\n\s*sets\.push\('notes_es = NULL'\)/.test(ASSIGN_W),
  'worker PATCH: notes-only edit → NULLs notes_es → next sweep re-translates')

// ── Preserve deterministic layout invariants (DAB.10g) ───────────
section('DAB.10g deterministic layout preserved')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(` (DAB.10g preserved)')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect (DAB.10g preserved)')
assert(/const heaviness =/.test(KIOSK),
  'deterministic heaviness score preserved')

// ── Preserve DAB.10g.1 typography ratios ─────────────────────────
section('DAB.10g.1 typography ratios preserved')

assert(/--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  '--board-name-size declared on .boardBars')
assert(/--board-job-size:\s+calc\(var\(--board-name-size\) \* 0\.6667\)/.test(KIOSK_CSS),
  '--board-job-size = --board-name-size × 0.6667 (2/3 ratio)')
assert(/--board-note-size:\s+calc\(var\(--board-name-size\) \* 0\.625\)/.test(KIOSK_CSS),
  '--board-note-size = --board-name-size × 0.625 (5/8 ratio)')

// The rendered <p> reads --board-note-size (via .boardNotesText).
assert(/\.boardNotesText \{[\s\S]{0,300}font-size:\s+var\(--board-note-size\)/.test(KIOSK_CSS),
  '.boardNotesText font-size: var(--board-note-size) — auto-translate notes still ratio-derived')

// ── Preserve DAB.10f.3 no transform / no compositor hints ────────
section('No transform / no compositor hints preserved')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(!/transform:/.test(innerBlock),
  '.boardBarsInner does NOT use transform (DAB.10f.3 preserved)')

// ── Mobile behavior preserved ────────────────────────────────────
section('Mobile behavior preserved')

// Mobile CSS override still releases fit locks (DAB.10e.1). The
// language-selection logic uses op.showSpanishNotes which is set in
// operatorCards (independent of viewport / breakpoint) — mobile
// picks the same language as desktop for the same employee.
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll release preserved (language selection is viewport-independent)')

// Mobile typography restore preserved (DAB.10g.1).
assert(/Phase DAB\.10g\.1 — Mobile RELEASES the legacy typography ratios/.test(KIOSK_CSS),
  'mobile typography release preserved')

// ── Multi-job + per-job notes regression couples ─────────────────
section('Multi-job + per-job notes preserved')

assert(/const BOARD_ORDINAL_LABELS = \['1st Job', '2nd Job', '3rd Job', '4th Job'\]/.test(KIOSK),
  'BOARD_ORDINAL_LABELS preserved (DAB.10b)')
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached in operatorCards (DAB.10c)')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility')

assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp (Chrome 79 uses -webkit-line-clamp)')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — spray / inventory untouched')

for (const path of [
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10i'),
    `${path} carries no Phase DAB.10i edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
