// Phase 9C.8 — Auto-translate after work board edits smoke.
//
//   node scripts/smoke-auto-translate-after-workboard-edits.mjs
//
// Wires save-success points on the three human authoring surfaces
// (DailyAssignmentBoard English notes, TasksManagerModal task save,
// DailyBriefingPanel briefing save) into a debounced
// scheduleTranslationSweep() helper that collapses bursts of edits
// into a single POST /api/admin/translate/run.
//
// The three NO-trigger paths (Spanish notes save, Regenerate's own
// runTranslationSweep call, delete-only flows) are positively
// asserted to NOT schedule, so a Spanish-only edit doesn't fire a
// sweep and Regenerate doesn't double-translate.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const CLIENT = readFileSync('src/utils/translate/translateClient.js',          'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',    'utf8')
const TMM    = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx',       'utf8')
const DBP    = readFileSync('src/pages/Operations/DailyBriefingPanel.jsx',     'utf8')

// ── translateClient — scheduleTranslationSweep helper ─────────────────
section('translateClient.js — scheduleTranslationSweep export + debounce')

assert(/export\s+function\s+scheduleTranslationSweep\s*\(/.test(CLIENT),
  'scheduleTranslationSweep is exported as a function')

// Destructure default delay so callers can override.
assert(/scheduleTranslationSweep\(\s*\{\s*delayMs\s*=\s*\d+\s*\}\s*=\s*\{\}\s*\)/.test(CLIENT),
  'scheduleTranslationSweep({ delayMs = N } = {}) — accepts an override + default')

// Module-level timer + setTimeout/clearTimeout debounce pattern.
assert(/let\s+autoTranslateTimer\s*=\s*null/.test(CLIENT),
  'module-level autoTranslateTimer variable holds the pending timer')
assert(/if \(autoTranslateTimer\) clearTimeout\(autoTranslateTimer\)/.test(CLIENT),
  'helper clears any prior pending timer before scheduling a new one (debounce)')
assert(/autoTranslateTimer\s*=\s*setTimeout\(\(\)\s*=>/.test(CLIENT),
  'helper schedules with setTimeout(() => ..., delayMs)')

// Default delay should be in the 1.5-3 second range per spec.
const defaultMatch = CLIENT.match(/delayMs\s*=\s*(\d+)/)
const defaultMs    = defaultMatch ? Number(defaultMatch[1]) : 0
assert(defaultMs >= 1500 && defaultMs <= 3000,
  `default delayMs (${defaultMs}) is within the spec'd 1500–3000ms range`)

// On fire, helper calls runTranslationSweep and resets the timer var.
assert(/autoTranslateTimer\s*=\s*null[\s\S]{0,80}runTranslationSweep\(\)/.test(CLIENT),
  'when the timer fires, the helper sets autoTranslateTimer = null then runTranslationSweep()')

// Quiet failure path — catch + console.debug, no toast.
assert(/runTranslationSweep\(\)\.catch\(/.test(CLIENT),
  'helper .catch()es runTranslationSweep failures (quiet auto-trigger)')
assert(/console\.debug\(/.test(CLIENT),
  'helper logs failures via console.debug (no UI toast)')
assert(!/toast\./.test(CLIENT),
  'helper does NOT call toast.* (auto-triggers are silent UX)')

// runTranslationSweep is still exported (regression couple from 9C.5d).
assert(/export\s+async\s+function\s+runTranslationSweep\(\)/.test(CLIENT),
  'runTranslationSweep is still exported (used by manual Translate Now + Regenerate)')

// ── DailyAssignmentBoard — English notes blur auto-schedules ─────────
section('DailyAssignmentBoard — English notes save auto-schedules sweep')

assert(/import\s*\{[^}]*\bscheduleTranslationSweep\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/translate\/translateClient['"]/.test(DAB),
  'DAB imports { scheduleTranslationSweep } from ../../../utils/translate/translateClient')

// Extract handleNotesBlur to verify the schedule happens in the success branch.
const blurMatch = DAB.match(/async function handleNotesBlur\(assignment\)[\s\S]*?\n\s{2}\}/)
const blurSrc   = blurMatch ? blurMatch[0] : ''
assert(blurSrc.length > 0, 'handleNotesBlur body located')

assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notes:\s*next\s*\}\)/.test(blurSrc),
  'English handleNotesBlur still PATCHes { notes: next }')

assert(/if \(canTranslate\) scheduleTranslationSweep\(\)/.test(blurSrc),
  'English handleNotesBlur calls scheduleTranslationSweep() (gated on canTranslate) after successful PATCH')

// Schedule must come AFTER the patchCrewAssignment await (success path),
// not before. We assert ordering by index of substring matches.
const patchIdx = blurSrc.indexOf('await patchCrewAssignment(assignment.id, { notes: next })')
const schedIdx = blurSrc.indexOf('scheduleTranslationSweep()')
assert(patchIdx >= 0 && schedIdx > patchIdx,
  'scheduleTranslationSweep() is called AFTER the patchCrewAssignment success (not before)')

// ── DailyAssignmentBoard — Spanish blur does NOT schedule ────────────
section('DailyAssignmentBoard — Spanish notes save does NOT auto-schedule')

const blurEsMatch = DAB.match(/async function handleNotesEsBlur\(assignment\)[\s\S]*?\n\s{2}\}/)
const blurEsSrc   = blurEsMatch ? blurEsMatch[0] : ''
assert(blurEsSrc.length > 0, 'handleNotesEsBlur body located')

assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*next\s*\}\)/.test(blurEsSrc),
  '9C.5b2: Spanish handleNotesEsBlur still PATCHes { notesEs: next }')

assert(!/scheduleTranslationSweep/.test(blurEsSrc),
  'Spanish handleNotesEsBlur does NOT call scheduleTranslationSweep (manual Spanish must not auto-trigger)')

// ── DailyAssignmentBoard — Regenerate path doesn't double-schedule ───
section('DailyAssignmentBoard — Regenerate calls runTranslationSweep directly (no double-schedule)')

const regenMatch = DAB.match(/async function handleRegenerateSpanish\(assignment\)[\s\S]*?\n\s{2}\}/)
const regenSrc   = regenMatch ? regenMatch[0] : ''
assert(regenSrc.length > 0, 'handleRegenerateSpanish body located')

assert(/await\s+runTranslationSweep\(\)/.test(regenSrc),
  '9C.7: Regenerate still calls runTranslationSweep() directly')
assert(!/scheduleTranslationSweep/.test(regenSrc),
  'Regenerate does NOT also schedule a debounced sweep (no double-fire)')

// ── DailyAssignmentBoard — status changes do NOT auto-schedule ───────
section('DailyAssignmentBoard — status changes do NOT auto-schedule')

const statusMatch = DAB.match(/async function handleStatusChange\(assignment,\s*nextStatus\)[\s\S]*?\n\s{2}\}/)
const statusSrc   = statusMatch ? statusMatch[0] : ''
if (statusSrc) {
  assert(!/scheduleTranslationSweep/.test(statusSrc),
    'handleStatusChange does NOT call scheduleTranslationSweep (status changes alone do not affect English board content)')
}

// ── DailyAssignmentBoard — delete flows do NOT auto-schedule ─────────
section('DailyAssignmentBoard — delete / Clear Day do NOT auto-schedule')

const clearDayMatch = DAB.match(/async function handleClearDay\(\)[\s\S]*?\n\s{2}\}/)
const clearDaySrc   = clearDayMatch ? clearDayMatch[0] : ''
if (clearDaySrc) {
  assert(!/scheduleTranslationSweep/.test(clearDaySrc),
    'handleClearDay does NOT call scheduleTranslationSweep (delete-only path)')
}

// ── TasksManagerModal — task save auto-schedules ──────────────────────
section('TasksManagerModal — task save auto-schedules sweep')

assert(/import\s*\{[^}]*\bscheduleTranslationSweep\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/translate\/translateClient['"]/.test(TMM),
  'TasksManagerModal imports { scheduleTranslationSweep }')

assert(/import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/context\/AuthContext['"]/.test(TMM),
  'TasksManagerModal imports { useAuth } for the canTranslate gate')

assert(/const\s+canTranslate\s*=\s*can\(['"]canSystemSettings['"]\)/.test(TMM),
  "TasksManagerModal computes canTranslate = can('canSystemSettings')")

const tmmSaveMatch = TMM.match(/async function handleSave\(e\)[\s\S]*?\n\s{2}\}/)
const tmmSaveSrc   = tmmSaveMatch ? tmmSaveMatch[0] : ''
assert(tmmSaveSrc.length > 0, 'TasksManagerModal handleSave body located')

assert(/if \(canTranslate\) scheduleTranslationSweep\(\)/.test(tmmSaveSrc),
  'TasksManagerModal handleSave schedules a sweep after PATCH/POST success (gated on canTranslate)')

// Schedule must come AFTER the await patchCalendarEvent / createCalendarEvent
// calls, not before — assert by comparing string indices.
const patchIdxTmm = tmmSaveSrc.search(/await\s+patchCalendarEvent/)
const createIdxTmm = tmmSaveSrc.search(/await\s+createCalendarEvent/)
const schedIdxTmm = tmmSaveSrc.search(/scheduleTranslationSweep\(\)/)
assert(schedIdxTmm > 0 && (patchIdxTmm < 0 || schedIdxTmm > patchIdxTmm),
  'scheduleTranslationSweep call follows patchCalendarEvent (if present)')
assert(schedIdxTmm > 0 && (createIdxTmm < 0 || schedIdxTmm > createIdxTmm),
  'scheduleTranslationSweep call follows createCalendarEvent (if present)')

// ── TasksManagerModal — delete does NOT auto-schedule ────────────────
section('TasksManagerModal — delete does NOT auto-schedule')

const tmmDelMatch = TMM.match(/async function handleDelete\(ev\)[\s\S]*?\n\s{2}\}/)
const tmmDelSrc   = tmmDelMatch ? tmmDelMatch[0] : ''
if (tmmDelSrc) {
  assert(!/scheduleTranslationSweep/.test(tmmDelSrc),
    'TasksManagerModal handleDelete does NOT call scheduleTranslationSweep (delete-only)')
}

// ── DailyBriefingPanel — briefing save auto-schedules ─────────────────
section('DailyBriefingPanel — briefing save auto-schedules sweep')

assert(/import\s*\{[^}]*\bscheduleTranslationSweep\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/translate\/translateClient['"]/.test(DBP),
  'DailyBriefingPanel imports { scheduleTranslationSweep }')

assert(/import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/context\/AuthContext['"]/.test(DBP),
  'DailyBriefingPanel imports { useAuth } for the canTranslate gate')

assert(/const\s+canTranslate\s*=\s*can\(['"]canSystemSettings['"]\)/.test(DBP),
  "DailyBriefingPanel computes canTranslate = can('canSystemSettings')")

const dbpSaveMatch = DBP.match(/async function handleSave\(e\)[\s\S]*?\n\s{2}\}/)
const dbpSaveSrc   = dbpSaveMatch ? dbpSaveMatch[0] : ''
assert(dbpSaveSrc.length > 0, 'DailyBriefingPanel handleSave body located')

assert(/if \(canTranslate\) scheduleTranslationSweep\(\)/.test(dbpSaveSrc),
  'DailyBriefingPanel handleSave schedules a sweep after PATCH/POST success (gated on canTranslate)')

// Schedule must come AFTER both branches' awaits.
const patchIdxDbp = dbpSaveSrc.search(/await\s+patchOperationsNote/)
const createIdxDbp = dbpSaveSrc.search(/await\s+createOperationsNote/)
const schedIdxDbp = dbpSaveSrc.search(/scheduleTranslationSweep\(\)/)
assert(schedIdxDbp > 0 && (patchIdxDbp < 0 || schedIdxDbp > patchIdxDbp),
  'scheduleTranslationSweep call follows patchOperationsNote')
assert(schedIdxDbp > 0 && (createIdxDbp < 0 || schedIdxDbp > createIdxDbp),
  'scheduleTranslationSweep call follows createOperationsNote')

// ── DailyBriefingPanel — delete/archive/pin do NOT auto-schedule ─────
section('DailyBriefingPanel — delete / archive / pin do NOT auto-schedule')

for (const fn of ['handleDelete', 'handleArchive', 'togglePin']) {
  const m = DBP.match(new RegExp(`async function ${fn}\\([\\s\\S]*?\\n\\s{2}\\}`))
  if (m) {
    assert(!/scheduleTranslationSweep/.test(m[0]),
      `${fn} does NOT call scheduleTranslationSweep (non-translatable mutation)`)
  }
}

// ── Manual Translate Now + Regenerate buttons preserved ──────────────
section('Manual Translate Now + Regenerate — regression couples preserved')

assert(/data-variant="translate"/.test(DAB) &&
       /async function handleTranslateNow\(\)/.test(DAB),
  '9C.5d: global Translate Now button + handler preserved in DAB')
assert(/runTranslationSweep/.test(DAB),
  '9C.5d: global Translate Now still calls runTranslationSweep directly')

assert(/data-variant="regenerate"/.test(DAB) &&
       /async function handleRegenerateSpanish\(assignment\)/.test(DAB),
  '9C.7: per-row Regenerate button + handler preserved in DAB')

// ── Manual override protection — race-safe SQL guards intact ─────────
section('Manual override protection — autoTranslate SQL guards intact')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/UPDATE crew_assignments[\s\S]{0,400}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'crew_assignments UPDATE still guarded by notes_es IS NULL OR TRIM = ""')
assert(/UPDATE operations_daily_notes[\s\S]{0,400}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'operations_daily_notes title_es UPDATE still guarded')
assert(/UPDATE alerts[\s\S]{0,400}\(message_es IS NULL OR TRIM\(message_es\) = ''\)/.test(AT),
  'alerts message_es UPDATE still guarded')

// ── Worker endpoint unchanged ─────────────────────────────────────────
section('Worker endpoint /api/admin/translate/run preserved unchanged')

const IDX = readFileSync('worker/index.js', 'utf8')
assert(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]/.test(IDX),
  '9C.5c3b: POST /api/admin/translate/run route preserved')
assert(/actorHasPermission\(actor,\s*['"]canSystemSettings['"]\)/.test(IDX),
  '9C.5c3b: canSystemSettings auth gate preserved')

assert(!/Phase 9C\.8(?![a-z\d])/.test(IDX),
  'worker/index.js carries no Phase 9C.8 edits (UI-only sub-phase)')

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[1-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no new migration past 0050 (found: ${newMigrations.join(', ') || 'none'})`)

// ── Cross-file guards — UI-only sub-phase ──────────────────────────────
section('Cross-file guards — worker + kiosk + other UI untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!/Phase 9C\.8(?![a-z\d])/.test(src),
    `${path} carries no Phase 9C.8 edits (UI-only sub-phase; sub-phases allowed)`)
}

// ── Provider / model config unchanged ─────────────────────────────────
section('Provider / model unchanged')

const WRANGLER = readFileSync('wrangler.jsonc', 'utf8')
assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(WRANGLER),
  'wrangler.jsonc still configures TRANSLATE_PROVIDER: "cf-ai"')
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.1-8b-instruct"/.test(WRANGLER),
  'wrangler.jsonc still configures TRANSLATE_MODEL: "@cf/meta/llama-3.1-8b-instruct"')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
