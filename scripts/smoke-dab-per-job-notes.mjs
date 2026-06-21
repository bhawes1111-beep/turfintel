// Phase DAB.10c — Notes for each employee job smoke.
//
//   node scripts/smoke-dab-per-job-notes.mjs
//
// Pins:
//   • Additional-job sub-row renders a notes input (Crosswinds-gated,
//     matching the primary row's notesCell pattern).
//   • Notes input is bound to that specific assignment id via
//     notesDraft[aj.id] ?? aj.notes.
//   • onChange routes through handleNotesChange(aj.id, value).
//   • onBlur routes through handleNotesBlur(aj) — the existing helper
//     keys all PATCH calls by assignment.id, so editing a 2nd Job
//     CAN'T patch a 1st Job.
//   • Primary row notes input is byte-identical (the existing
//     handleNotesChange/handleNotesBlur pair is shared, not forked).
//   • Translation sweep + notes_es invalidation behavior preserved
//     (handleNotesBlur already fires scheduleTranslationSweep on
//     change; worker NULLs notes_es on PATCH-without-notesEs).
//   • Read-only state via the busy-emp guard (matches primary).
//   • DisplayBoard renders per-assignment notes (a.notes) so each
//     job's notes show under its own job block — no change needed
//     because the multi-job rendering already iterates assignments.
//   • No worker / store / migration changes in DAB.10c.
//   • DAB.10a + DAB.10a.1 + DAB.10b contracts still pinned.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',        'utf8')
const DAB_CSS   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const STORE     = readFileSync('src/utils/assignments/assignmentsStore.js',           'utf8')
const ASSIGN_W  = readFileSync('worker/api/assignments.js',                           'utf8')

// ── No new migration / no worker change / DAB.10a-b backend intact ──
section('No new migration / no worker change / DAB.10a-b backend intact')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10c)')

// DAB.10c is frontend-only.
for (const path of [
  'worker/api/assignments.js',
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'src/utils/assignments/assignmentsStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10c'),
    `${path} carries no Phase DAB.10c edits (frontend-only)`)
}

// DAB.10a-b backend invariants.
assert(/export async function bulkReplaceEmployeeJobs\(env, request\)/.test(ASSIGN_W),
  'DAB.10a bulkReplaceEmployeeJobs still exported')
assert(/export async function bulkReplaceEmployeeDay\(env, request\)/.test(ASSIGN_W),
  'DAB.10a.1 bulkReplaceEmployeeDay still exported')
assert(/jobOrder:\s+row\.job_order \?\? 0/.test(ASSIGN_W),
  'rowToCrewAssignment still exposes jobOrder')

// patchCrewAssignment used by handleNotesBlur is still the canonical
// per-row PATCH helper.
assert(/export async function patchCrewAssignment\(id, updates\)/.test(STORE),
  'store patchCrewAssignment(id, updates) still exported')

// ── Additional-row notes input ──────────────────────────────────────
section('Additional row — notes input is editable + tied to that assignment id')

// Crosswinds-gated notes cell + input.
assert(/isCrosswinds && \(\s*\n\s*<td className=\{styles\.dabAdditionalJobNotesCell\}/.test(DAB),
  'notes cell rendered for additional rows on Crosswinds (matches primary-row gating)')
assert(/<input\s*\n\s*type="text"\s*\n\s*className=\{styles\.dabAdditionalJobNotesInput\}/.test(DAB),
  'additional row renders a <input type="text" className={styles.dabAdditionalJobNotesInput}>')

// Bound to THIS row's assignment id — critical so 2nd Job edits
// don't bleed into 1st Job.
assert(/value=\{notesDraft\[aj\.id\] \?\? aj\.notes \?\? ''\}/.test(DAB),
  'notes input value bound to notesDraft[aj.id] ?? aj.notes (per-assignment isolation)')
assert(/onChange=\{e => handleNotesChange\(aj\.id, e\.target\.value\)\}/.test(DAB),
  'onChange wires handleNotesChange(aj.id, value) — keyed by THIS row\'s id')
assert(/onBlur=\{\(\) => handleNotesBlur\(aj\)\}/.test(DAB),
  'onBlur wires handleNotesBlur(aj) — patches THIS row\'s assignment only')

// Disabled while busy + accessible label per row.
assert(/disabled=\{busyEmpId === emp\.id\}/.test(DAB),
  'notes input disabled while this employee\'s row is busy (matches primary)')
assert(/aria-label=\{`Notes for \$\{emp\.name\}'s \$\{jobLabel\}`\}/.test(DAB),
  'notes input has per-row aria-label: "Notes for {emp}\'s {Nth} Job"')

// ── Non-Crosswinds falls back to spacer cell so colspan math holds ─
section('Non-Crosswinds — collapses notes cell to spacer (preserves table layout)')

assert(/\{!isCrosswinds && \(\s*\n\s*<td className=\{styles\.dabAdditionalJobNotesCell\} colSpan=\{colSpan - 4\} \/>/.test(DAB),
  'non-Crosswinds renders an empty <td> spacer (no notes input, no broken row width)')

// ── handleNotesChange / handleNotesBlur ARE per-assignment helpers ──
section('Shared notes handlers — per-assignment keyed (primary + additional safe)')

// The helpers were not modified — DAB.10c reuses them as-is. Pin the
// existing implementation so a future refactor can't silently key
// off employee id or something looser.
assert(/function handleNotesChange\(assignmentId, value\)/.test(DAB),
  'handleNotesChange(assignmentId, value) signature preserved')
assert(/setNotesDraft\(prev => \(\{ \.\.\.prev, \[assignmentId\]: value \}\)\)/.test(DAB),
  'handleNotesChange keys draft by assignmentId (so per-row inputs don\'t leak)')
assert(/async function handleNotesBlur\(assignment\)/.test(DAB),
  'handleNotesBlur(assignment) signature preserved')
assert(/await patchCrewAssignment\(assignment\.id, \{ notes: next \}\)/.test(DAB),
  'handleNotesBlur PATCHes ONLY assignment.id with { notes: next } — no cross-row writes')

// Translation sweep gating preserved.
assert(/if \(canTranslate\) scheduleTranslationSweep\(\)/.test(DAB),
  'handleNotesBlur fires scheduleTranslationSweep() when canTranslate (translation flow intact)')

// Worker still NULLs notes_es on PATCH-without-notesEs (Phase 9C.5c3
// English-edit invalidation — auto-re-translate on next sweep).
assert(/sets\.push\('notes_es = NULL'\)/.test(ASSIGN_W),
  'worker still NULLs notes_es on notes-only PATCH (notesEs invalidation preserved)')

// ── Primary row notes byte-identical ──────────────────────────────
section('Primary row notes — byte-identical (no regression)')

// The exact primary-row notes input lookup. Confirmed by reading the
// existing pattern at DailyAssignmentBoard:1697-1710.
assert(/value=\{notesDraft\[assignment\.id\] \?\? assignment\.notes \?\? ''\}/.test(DAB),
  'primary row notes value still notesDraft[assignment.id] ?? assignment.notes')
assert(/onChange=\{e => handleNotesChange\(assignment\.id, e\.target\.value\)\}/.test(DAB),
  'primary row notes onChange still handleNotesChange(assignment.id, value)')
assert(/onBlur=\{\(\) => handleNotesBlur\(assignment\)\}/.test(DAB),
  'primary row notes onBlur still handleNotesBlur(assignment)')

// Both inputs use the same handlers — counted to make accidental
// duplication of handlers loud.
const handleNotesChangeRefs = (DAB.match(/handleNotesChange\(/g) ?? []).length
const handleNotesBlurRefs   = (DAB.match(/handleNotesBlur\(/g) ?? []).length
assert(handleNotesChangeRefs >= 3,
  `handleNotesChange referenced ≥3 times (declaration + primary + additional; found ${handleNotesChangeRefs})`)
assert(handleNotesBlurRefs   >= 3,
  `handleNotesBlur referenced ≥3 times (declaration + primary + additional; found ${handleNotesBlurRefs})`)

// ── CSS classes ────────────────────────────────────────────────────
section('CSS — additional-job notes input + cell')

assert(/\.dabAdditionalJobNotesCell\s*\{/.test(DAB_CSS),
  '.dabAdditionalJobNotesCell class defined')
assert(/\.dabAdditionalJobNotesInput\s*\{/.test(DAB_CSS),
  '.dabAdditionalJobNotesInput class defined (matches primary .notesInput tone)')
assert(/\.dabAdditionalJobNotesInput:focus/.test(DAB_CSS),
  '.dabAdditionalJobNotesInput:focus style defined (visible focus ring)')
assert(/\.dabAdditionalJobNotesInput:disabled/.test(DAB_CSS),
  '.dabAdditionalJobNotesInput:disabled style defined (busy state visual)')
assert(/\.dabAdditionalJobNotesInput::placeholder/.test(DAB_CSS),
  '.dabAdditionalJobNotesInput::placeholder style defined (subtle placeholder)')

// Mobile breakpoint keeps the input tappable.
assert(/@media \(max-width: 600px\)[\s\S]{0,800}\.dabAdditionalJobNotesInput \{[\s\S]{0,200}min-height:/.test(DAB_CSS),
  'mobile @media bumps .dabAdditionalJobNotesInput min-height for tappability')

// ── Display Board / Kiosk — per-job notes already rendered ────────
section('Display Board / Kiosk — per-job notes already render correctly (no change)')

// Each assignment row in op.assignments carries its own notes (already
// set in DAB.10b operatorCards.push). The render branch reads a.notes
// per task block — multi-job operators automatically get the right
// notes under the right job block.
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'kiosk operatorCards already attaches a.notes to each assignment object')
const aNotesRefs = (KIOSK.match(/a\.notes/g) ?? []).length
assert(aNotesRefs >= 3,
  `kiosk reads a.notes in ≥3 places (operatorCards push + render gate + render text; found ${aNotesRefs})`)

// Each assignment renders ITS OWN notes inside its task block —
// confirmed by reading the BoardModeCrewBars render at DisplayBoard:1465.
assert(/\{trimmedNotes\.length > 0 && \(\s*\n\s*<p className=\{styles\.boardNotesText\}>\{trimmedNotes\}<\/p>/.test(KIOSK),
  'kiosk renders trimmedNotes inside each task block (per-job notes ✓)')

// ── Copy From Date preserves per-job notes ────────────────────────
section('Copy From Date — preserves per-job notes (cloning existing rows)')

// The existing copy path (handleCopyYesterday + its helpers) clones
// crew_assignments rows one-by-one. Each row carries its own `notes`
// column → copies preserve per-job notes by construction.
// (Re-pin the helper signature to make accidental refactors loud.)
assert(/async function handleCopyYesterday\(\)/.test(DAB),
  'handleCopyYesterday still defined (copy path unchanged)')

// ── Empty / orphan-note guards ─────────────────────────────────────
section('Empty job behavior — no orphan note-only rows')

// Add Job flow requires picking a task first (the inline picker is the
// entry point; clicking + Add Job opens a <select>, not a notes input).
// A user can't create a row without selecting a task → no orphan rows.
// Pinned at the additional-row level too: aj.id only exists when the
// row was created via createCrewAssignment, which requires an event.
assert(/await createCrewAssignment\(\{[\s\S]{0,400}calendarEventId:\s+event\.id/.test(DAB),
  'Add Job handler requires calendarEventId (no event = no row = no orphan note)')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — spray / inventory untouched')

for (const path of [
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10c'),
    `${path} carries no Phase DAB.10c edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
