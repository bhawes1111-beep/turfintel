// Phase 9C.5b2 — Spanish authoring UI smoke.
//
//   node scripts/smoke-bilingual-kiosk-authoring.mjs
//
// Source-only checks: superintendent/crew-lead can now author Spanish
// translations for two of the three kiosk-visible content surfaces:
//
//   1. crew_assignments.notes_es   (via DailyAssignmentBoard.jsx)
//   2. operations_daily_notes      (via DailyBriefingPanel.jsx)
//      → title_es + body_es
//
// Alert title_es / message_es authoring is deferred — programmatic
// callers (Repairs.jsx, BuildSpraySheet.jsx) can't pre-translate the
// dynamic content they generate.
//
// 9C.5b2 is authoring-only. The kiosk does NOT yet render the Spanish
// fields; that work lands in 9C.5b3.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB     = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',          'utf8')
const DAB_CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css',   'utf8')
const DBP     = readFileSync('src/pages/Operations/DailyBriefingPanel.jsx',           'utf8')
const DBP_CSS = readFileSync('src/pages/Operations/DailyBriefingPanel.module.css',    'utf8')

// ── DailyAssignmentBoard JSX ───────────────────────────────────────────
section('DailyAssignmentBoard — notesEs state + handlers')

assert(/const\s+\[notesEsDraft,\s*setNotesEsDraft\]\s*=\s*useState\(\{\}\)/.test(DAB),
  'const [notesEsDraft, setNotesEsDraft] = useState({}) declared')

assert(/function\s+handleNotesEsChange\(assignmentId,\s*value\)/.test(DAB),
  'handleNotesEsChange(assignmentId, value) defined')
assert(/setNotesEsDraft\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*\[assignmentId\]:\s*value\s*\}\)\)/.test(DAB),
  'handleNotesEsChange writes to notesEsDraft keyed by assignmentId')

assert(/async\s+function\s+handleNotesEsBlur\(assignment\)/.test(DAB),
  'async function handleNotesEsBlur(assignment) defined')

// Trim + no-op-if-equal pattern (mirrors English).
const blurMatch = DAB.match(/async\s+function\s+handleNotesEsBlur\([\s\S]*?\n\s{2}\}/)
const blurSrc   = blurMatch ? blurMatch[0] : ''
assert(blurSrc.length > 0, 'handleNotesEsBlur body extracted')
assert(/if \(!assignment\) return/.test(blurSrc),
  'handleNotesEsBlur no-ops when no assignment')
assert(/notesEsDraft\[assignment\.id\]/.test(blurSrc),
  'handleNotesEsBlur reads notesEsDraft[assignment.id]')
assert(/const\s+next\s*=\s*draft\.trim\(\)/.test(blurSrc),
  'handleNotesEsBlur trims the draft into `next`')
assert(/const\s+current\s*=\s*\(assignment\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(blurSrc),
  'handleNotesEsBlur compares against (assignment.notesEs ?? "").trim()')
assert(/if \(next === current\)/.test(blurSrc),
  'handleNotesEsBlur no-ops when trimmed value equals current')
assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*next\s*\}\)/.test(blurSrc),
  'handleNotesEsBlur PATCHes patchCrewAssignment(assignment.id, { notesEs: next })')
assert(/Spanish notes save failed:\s*\$\{err\.message\}/.test(blurSrc),
  'handleNotesEsBlur toasts the right error copy')

// ── DailyAssignmentBoard JSX — the Spanish input render ────────────────
section('DailyAssignmentBoard — Spanish input render inside Crosswinds notes cell')

// Spanish input has lang="es".
assert(/<input[\s\S]{0,400}lang="es"[\s\S]{0,400}className=\{styles\.notesInputEs\}/.test(DAB) ||
       /<input[\s\S]{0,400}className=\{styles\.notesInputEs\}[\s\S]{0,400}lang="es"/.test(DAB),
  'Spanish input has lang="es" and uses styles.notesInputEs')

// Spanish input placeholder mentions Spanish.
assert(/className=\{styles\.notesInputEs\}[\s\S]{0,400}placeholder="Spanish notes…"/.test(DAB),
  'Spanish input placeholder is "Spanish notes…"')

// Spanish input value binding.
assert(/value=\{notesEsDraft\[assignment\.id\]\s*\?\?\s*assignment\.notesEs\s*\?\?\s*''\}/.test(DAB),
  'Spanish input value uses notesEsDraft[assignment.id] ?? assignment.notesEs ?? ""')

// Spanish input handlers wire up correctly.
assert(/onChange=\{e\s*=>\s*handleNotesEsChange\(assignment\.id,\s*e\.target\.value\)\}/.test(DAB),
  'Spanish input onChange calls handleNotesEsChange(assignment.id, e.target.value)')
assert(/onBlur=\{\(\)\s*=>\s*handleNotesEsBlur\(assignment\)\}/.test(DAB),
  'Spanish input onBlur calls handleNotesEsBlur(assignment)')

// Spanish input has the bilingual aria-label.
assert(/aria-label=\{`Spanish notes for \$\{emp\.name\}`\}/.test(DAB),
  'Spanish input has aria-label="Spanish notes for ${emp.name}"')

// The two inputs sit inside a .notesStack wrapper.
assert(/<div className=\{styles\.notesStack\}>[\s\S]{0,2000}className=\{styles\.notesInputEs\}/.test(DAB),
  'Spanish input is rendered inside a <div styles.notesStack> wrapper')

// The Spanish input remains gated behind the isCrosswinds notes cell.
const cellMatch = DAB.match(/\{isCrosswinds && \(\s*<td className=\{styles\.notesCell\}>[\s\S]*?<\/td>\s*\)\}/)
const cellSrc   = cellMatch ? cellMatch[0] : ''
assert(cellSrc.length > 0, 'Crosswinds notes <td> cell located')
assert(/className=\{styles\.notesInputEs\}/.test(cellSrc),
  'Spanish input lives inside the isCrosswinds notes cell (not outside the gate)')

// ── DailyAssignmentBoard JSX — English regression couples ──────────────
section('DailyAssignmentBoard — English notes path preserved')

assert(/className=\{styles\.notesInput\}/.test(DAB),
  'English input still uses styles.notesInput (no rename)')
assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notes:\s*next\s*\}\)/.test(DAB),
  'English handleNotesBlur still PATCHes { notes: next } (English path untouched)')
assert(/const\s+\[notesDraft,\s*setNotesDraft\]\s*=\s*useState\(\{\}\)/.test(DAB),
  'English notesDraft state still declared')

// ── DailyAssignmentBoard CSS ───────────────────────────────────────────
section('DailyAssignmentBoard CSS — .notesStack + .notesInputEs')

assert(/\.notesStack\s*\{[\s\S]{0,200}display:\s*flex/.test(DAB_CSS),
  '.notesStack uses display: flex')
assert(/\.notesStack\s*\{[\s\S]{0,200}flex-direction:\s*column/.test(DAB_CSS),
  '.notesStack uses flex-direction: column')

assert(/\.notesInputEs\s*\{/.test(DAB_CSS),
  '.notesInputEs class defined')
// Visual differentiation — italic OR dimmer color/border than .notesInput.
assert(/\.notesInputEs\s*\{[\s\S]{0,400}font-style:\s*italic/.test(DAB_CSS),
  '.notesInputEs uses italic styling (visual differentiation from English)')

// Mobile breakpoint includes the new class.
assert(/@media\s*\(max-width:\s*600px\)\s*\{[\s\S]{0,400}\.notesInputEs/.test(DAB_CSS),
  '@media (max-width: 600px) block includes .notesInputEs')

// Regression couples — .notesInput + .notesCell still defined.
assert(/\.notesInput\s*\{/.test(DAB_CSS),
  '.notesInput still defined (regression)')
assert(/\.notesCell\b/.test(DAB_CSS),
  '.notesCell still referenced (regression)')

// ── DailyBriefingPanel JSX — draft state ────────────────────────────────
section('DailyBriefingPanel — Spanish fields in draft + save payload')

const emptyDraftMatch = DBP.match(/function emptyDraft\(\)\s*\{[\s\S]*?\n\}/)
const emptyDraftSrc   = emptyDraftMatch ? emptyDraftMatch[0] : ''
assert(/titleEs:\s*['"]['"]/.test(emptyDraftSrc),
  "emptyDraft() includes titleEs: ''")
assert(/bodyEs:\s*['"]['"]/.test(emptyDraftSrc),
  "emptyDraft() includes bodyEs: ''")

const startEditMatch = DBP.match(/function startEdit\(note\)\s*\{[\s\S]*?\n\s{2}\}/)
const startEditSrc   = startEditMatch ? startEditMatch[0] : ''
assert(/titleEs:\s*note\.titleEs\s*\?\?\s*['"]['"]/.test(startEditSrc),
  'startEdit hydrates titleEs from note.titleEs ?? ""')
assert(/bodyEs:\s*note\.bodyEs\s*\?\?\s*['"]['"]/.test(startEditSrc),
  'startEdit hydrates bodyEs from note.bodyEs ?? ""')

// Save payloads — both branches.
const handleSaveMatch = DBP.match(/async function handleSave\([\s\S]*?\n\s{2}\}/)
const handleSaveSrc   = handleSaveMatch ? handleSaveMatch[0] : ''
assert(/await patchOperationsNote\(draft\.id,\s*\{[\s\S]*?titleEs:\s*draft\.titleEs\s*\|\|\s*null/.test(handleSaveSrc),
  'handleSave PATCH payload includes titleEs: draft.titleEs || null')
assert(/await patchOperationsNote\(draft\.id,\s*\{[\s\S]*?bodyEs:\s*draft\.bodyEs\s*\|\|\s*null/.test(handleSaveSrc),
  'handleSave PATCH payload includes bodyEs: draft.bodyEs || null')
assert(/await createOperationsNote\(\{[\s\S]*?titleEs:\s*draft\.titleEs\s*\|\|\s*null/.test(handleSaveSrc),
  'handleSave POST payload includes titleEs: draft.titleEs || null')
assert(/await createOperationsNote\(\{[\s\S]*?bodyEs:\s*draft\.bodyEs\s*\|\|\s*null/.test(handleSaveSrc),
  'handleSave POST payload includes bodyEs: draft.bodyEs || null')

// ── DailyBriefingPanel JSX — Spanish inputs render ─────────────────────
section('DailyBriefingPanel — Spanish title + body inputs render')

// Spanish title input.
assert(/<input[\s\S]{0,400}lang="es"[\s\S]{0,400}placeholder="Título en español \(opcional\)"/.test(DBP),
  'Spanish title input: lang="es" + placeholder "Título en español (opcional)"')
assert(/value=\{draft\.titleEs\s*\?\?\s*['"]['"]\}/.test(DBP),
  'Spanish title input value bound to draft.titleEs ?? ""')
assert(/onChange=\{e\s*=>\s*setField\(['"]titleEs['"],\s*e\.target\.value\)\}/.test(DBP),
  'Spanish title input onChange calls setField("titleEs", ...)')

// Spanish body textarea.
assert(/<textarea[\s\S]{0,400}lang="es"[\s\S]{0,400}placeholder="Cuerpo en español \(opcional\)"/.test(DBP),
  'Spanish body textarea: lang="es" + placeholder "Cuerpo en español (opcional)"')
assert(/value=\{draft\.bodyEs\s*\?\?\s*['"]['"]\}/.test(DBP),
  'Spanish body textarea value bound to draft.bodyEs ?? ""')
assert(/onChange=\{e\s*=>\s*setField\(['"]bodyEs['"],\s*e\.target\.value\)\}/.test(DBP),
  'Spanish body textarea onChange calls setField("bodyEs", ...)')

// Spanish notice.
assert(/<div className=\{styles\.spanishNotice\}>/.test(DBP),
  'styles.spanishNotice div is rendered in the form')
assert(/Crew-visible translation\.\s*Verify before saving/.test(DBP),
  'Spanish notice carries "Crew-visible translation. Verify before saving." copy')

// ── DailyBriefingPanel JSX — English regression couples ────────────────
section('DailyBriefingPanel — English path preserved')

assert(/<input[\s\S]{0,200}value=\{draft\.title\}[\s\S]{0,200}placeholder="e\.g\. Frost delay until 7:30"/.test(DBP),
  'English title input still present with its original placeholder')
assert(/<textarea[\s\S]{0,200}ref=\{bodyRef\}[\s\S]{0,400}value=\{draft\.body\}/.test(DBP),
  'English body textarea still present with ref={bodyRef}')
assert(/className=\{styles\.crewVisibleNotice\}/.test(DBP),
  'crewVisibleNotice still rendered (the existing crew-visible warning is preserved)')

// ── DailyBriefingPanel CSS ──────────────────────────────────────────────
section('DailyBriefingPanel CSS — .spanishNotice')

assert(/\.spanishNotice\s*\{/.test(DBP_CSS),
  '.spanishNotice class defined')
// Regression — .crewVisibleNotice still defined.
assert(/\.crewVisibleNotice\s*\{/.test(DBP_CSS),
  '.crewVisibleNotice still defined (regression)')

// ── Cross-file guards — Phase 9C.5b2 is authoring-only ─────────────────
section('Cross-file guards — kiosk render / Employee Mgmt / worker untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/crew/crewStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5b2'),
    `${path} carries no Phase 9C.5b2 edits (authoring-only sub-phase)`)
}

// ── 9C.5b1 migration still present (forward-compatible with later phases) ─
section('D1 schema — 9C.5b1 migration preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0049_bilingual_kiosk_fields.sql'),
  '0049_bilingual_kiosk_fields.sql still in the migration ledger')

// ── No external translation / i18n / AI dependency added ───────────────
section('No external translation / i18n / Workers AI dependency added')

const pkg     = readFileSync('package.json',    'utf8')
const wrangler = readFileSync('wrangler.jsonc', 'utf8')
for (const term of ['i18next', 'react-intl', 'formatjs', '@cloudflare/ai', 'workers-ai', 'm2m100']) {
  assert(!pkg.includes(term),
    `package.json does NOT depend on "${term}" (manual stored translations only)`)
}
assert(!/binding[\s\S]{0,40}["']AI["']/.test(wrangler),
  'wrangler.jsonc does NOT bind a Workers AI service')

// ── 9C.5b1 storage layer + 9C.5a.5 privacy gate still intact ───────────
section('Phase 9C.5b1 + 9C.5a.5 regression couples')

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

assert(/function rowToEmployee\(row,\s*canViewPrivate/.test(CREW),
  '9C.5a.5: rowToEmployee(row, canViewPrivate) signature preserved')
assert(/if \(canViewPrivate\)\s*\{[\s\S]{0,400}out\.payRate\s*=\s*row\.pay_rate/.test(CREW),
  '9C.5a.5: payRate still gated behind if (canViewPrivate)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
