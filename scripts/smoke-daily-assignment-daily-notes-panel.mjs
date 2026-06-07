// Phase 9C.10 — Daily Notes panel on the Daily Assignment Board smoke.
//
//   node scripts/smoke-daily-assignment-daily-notes-panel.mjs
//
// Adds a compact read-only daily-notes panel between the date/action
// row and the assignment table. Pulls from the existing
// operations_daily_notes store; filters to selectedDate; renders
// pinned/priority badges + bilingual title/body when authored.
//
// This is a UI sub-phase only — no worker, schema, kiosk, or
// translation behavior changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB     = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',          'utf8')
const DAB_CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css',   'utf8')

// ── Data hook + derivation ────────────────────────────────────────────
section('DailyAssignmentBoard — uses operations notes store + derives dailyNotesForDate')

assert(/import\s*\{\s*useOperationsNotesData\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/operations\/notesStore['"]/.test(DAB),
  'DAB imports { useOperationsNotesData } from ../../../utils/operations/notesStore')

assert(/const\s*\{\s*notes:\s*operationsNotes\s*\}\s*=\s*useOperationsNotesData\(\)/.test(DAB),
  'DAB destructures { notes: operationsNotes } from useOperationsNotesData()')

// NOTE_PRIORITY_ORDER constant must exist at module scope so the
// sort comparator can reference it.
assert(/const\s+NOTE_PRIORITY_ORDER\s*=\s*\{[\s\S]*?urgent:\s*0[\s\S]*?safety:\s*1[\s\S]*?weather:\s*2[\s\S]*?important:\s*3[\s\S]*?routine:\s*4/.test(DAB),
  'NOTE_PRIORITY_ORDER constant defined with urgent=0, safety=1, weather=2, important=3, routine=4')

// Extract the dailyNotesForDate memo to assert its filters + sort.
const memoMatch = DAB.match(/const\s+dailyNotesForDate\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[[^\]]+\]\)/)
const memoSrc   = memoMatch ? memoMatch[0] : ''
assert(memoSrc.length > 0, 'dailyNotesForDate useMemo body extracted')

assert(/\(operationsNotes\s*\?\?\s*\[\]\)/.test(memoSrc),
  'memo guards against null operationsNotes via ?? []')

// Filter by selectedDate (noteDate fallback to date for legacy rows).
assert(/\(n\.noteDate\s*\?\?\s*n\.date\)\s*===\s*selectedDate/.test(memoSrc),
  'memo filters by (n.noteDate ?? n.date) === selectedDate')

// Excludes archived + deleted statuses.
assert(/n\.status\s*!==\s*['"]archived['"]/.test(memoSrc),
  "memo excludes status === 'archived'")
assert(/n\.status\s*!==\s*['"]deleted['"]/.test(memoSrc),
  "memo excludes status === 'deleted'")

// Sort: pinned first.
assert(/if \(a\.pinned !== b\.pinned\)\s*return\s+a\.pinned\s*\?\s*-1\s*:\s*1/.test(memoSrc),
  'memo sort: pinned notes come first')

// Sort: priority order.
assert(/NOTE_PRIORITY_ORDER\[a\.priority\]\s*\?\?\s*9/.test(memoSrc),
  'memo sort uses NOTE_PRIORITY_ORDER lookup with 9 fallback')

// Sort: tiebreaker by updatedAt (newest first).
assert(/\(b\.updatedAt\s*\?\?\s*['"]['"]\)\.localeCompare\(a\.updatedAt\s*\?\?\s*['"]['"]\)/.test(memoSrc),
  'memo sort tiebreaker: newest updatedAt first')

// Dep list includes both operationsNotes and selectedDate.
assert(/\}, \[operationsNotes,\s*selectedDate\]\)/.test(memoSrc),
  'memo deps list: [operationsNotes, selectedDate]')

// ── Panel placement — under header, before assignment table ───────────
section('Panel placement — between </header> and <table>')

const headerEnd = DAB.indexOf('</header>')
const tableStart = DAB.indexOf('<table className={styles.assignTable}')
const panelStart = DAB.search(/<section className=\{styles\.dailyNotesPanel\}/)

assert(headerEnd >= 0 && tableStart >= 0 && panelStart >= 0,
  '</header>, <section styles.dailyNotesPanel>, and <table styles.assignTable> all located')
assert(panelStart > headerEnd,
  'dailyNotesPanel renders AFTER the header row (</header> precedes it)')
assert(panelStart < tableStart,
  'dailyNotesPanel renders BEFORE the assignment table (precedes <table styles.assignTable>)')

// ── Empty state ───────────────────────────────────────────────────────
section('Empty state — "No daily notes for this date."')

assert(/dailyNotesForDate\.length === 0/.test(DAB),
  'render branches on dailyNotesForDate.length === 0')
assert(/<section className=\{styles\.dailyNotesPanel\}\s+data-empty="true">/.test(DAB),
  'empty-state <section> carries data-empty="true" attribute')
assert(/className=\{styles\.dailyNotesEmpty\}>No daily notes for this date\./.test(DAB),
  '"No daily notes for this date." copy renders inside styles.dailyNotesEmpty')

// ── Populated state — title / body / priority / pinned ───────────────
section('Populated state — title, body, priority badge, pinned marker')

assert(/dailyNotesForDate\.map\(note =>/.test(DAB),
  'render iterates dailyNotesForDate.map(note => ...)')

assert(/className=\{styles\.dailyNoteItem\}[\s\S]{0,400}data-priority=\{note\.priority\}/.test(DAB),
  '<article styles.dailyNoteItem> sets data-priority={note.priority} for CSS accents')

assert(/data-pinned=\{note\.pinned\s*\?\s*['"]true['"]\s*:\s*undefined\}/.test(DAB),
  '<article> sets data-pinned="true" when pinned (undefined otherwise)')

assert(/note\.priority && \(\s*\n?\s*<span className=\{styles\.dailyNotePriority\}/.test(DAB),
  'priority badge only renders when note.priority is truthy')

assert(/note\.pinned && \(\s*\n?\s*<span className=\{styles\.dailyNotePinned\}>/.test(DAB),
  'pinned marker only renders when note.pinned is truthy')

assert(/className=\{styles\.dailyNoteTitle\}>\{titleTrim\}/.test(DAB),
  '<strong styles.dailyNoteTitle>{titleTrim}</strong> renders the title')

assert(/className=\{styles\.dailyNoteBody\}>\{bodyTrim\}/.test(DAB),
  '<p styles.dailyNoteBody>{bodyTrim}</p> renders the body')

assert(/const\s+titleTrim\s*=\s*\(note\.title\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(DAB),
  'titleTrim = (note.title ?? "").trim() — title trimmed before render gate')
assert(/const\s+bodyTrim\s*=\s*\(note\.body\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(DAB),
  'bodyTrim = (note.body ?? "").trim() — body trimmed before render gate')

// ── Spanish rendering — lang="es" + dailyNoteSpanish class ───────────
section('Spanish rendering — lang="es" + italic mint styling')

assert(/const\s+titleEsTrim\s*=\s*\(note\.titleEs\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(DAB),
  'titleEsTrim = (note.titleEs ?? "").trim()')
assert(/const\s+bodyEsTrim\s*=\s*\(note\.bodyEs\s*\?\?\s*['"]['"]\)\.trim\(\)/.test(DAB),
  'bodyEsTrim = (note.bodyEs ?? "").trim()')

assert(/const\s+hasSpanish\s*=\s*titleEsTrim\.length > 0 \|\| bodyEsTrim\.length > 0/.test(DAB),
  'hasSpanish computed from titleEsTrim/bodyEsTrim lengths')

assert(/hasSpanish && \(\s*\n?\s*<p\s+className=\{styles\.dailyNoteSpanish\}\s+lang="es"/.test(DAB),
  '<p styles.dailyNoteSpanish lang="es"> renders when hasSpanish')

// ── Read-only — no edit/delete affordances in the panel ──────────────
section('Read-only — no edit/delete/save buttons inside the panel')

// Extract the panel JSX slice (from <section styles.dailyNotesPanel> to
// its closing </section>). We assert the slice contains no <button>
// affordances and no edit/delete handler references.
const panelSliceMatch = DAB.match(/<section className=\{styles\.dailyNotesPanel\}[\s\S]*?<\/section>(?:\s*\)\s*:\s*\(\s*<section className=\{styles\.dailyNotesPanel\}[\s\S]*?<\/section>)?/)
const panelSlice      = panelSliceMatch ? panelSliceMatch[0] : ''
assert(panelSlice.length > 0, 'daily notes panel JSX slice extracted')

assert(!/<button\b/.test(panelSlice),
  'daily notes panel does NOT render any <button> elements (read-only)')
for (const forbidden of [
  'onClick', 'patchOperationsNote(', 'createOperationsNote(', 'deleteOperationsNote(',
  'archiveOperationsNote(', 'unarchiveOperationsNote(', 'togglePin(',
]) {
  assert(!panelSlice.includes(forbidden),
    `daily notes panel does NOT contain "${forbidden}" (read-only invariant)`)
}

// ── CSS — all required classes defined ───────────────────────────────
section('CSS — required panel classes defined')

for (const cls of [
  'dailyNotesPanel',
  'dailyNotesHeader',
  'dailyNotesCount',
  'dailyNotesEmpty',
  'dailyNoteList',
  'dailyNoteItem',
  'dailyNoteMeta',
  'dailyNotePriority',
  'dailyNotePinned',
  'dailyNoteTitle',
  'dailyNoteBody',
  'dailyNoteSpanish',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(DAB_CSS),
    `CSS rule .${cls} defined`)
}

// Empty-state variant — explicit data-empty selector.
assert(/\.dailyNotesPanel\[data-empty="true"\]\s*\{/.test(DAB_CSS),
  '.dailyNotesPanel[data-empty="true"] variant defined (dashed border / quiet state)')

// Priority accents — at least urgent/safety/weather defined.
for (const p of ['urgent', 'safety', 'weather', 'important', 'routine']) {
  assert(new RegExp(`\\.dailyNoteItem\\[data-priority="${p}"\\]\\s*\\{`).test(DAB_CSS),
    `CSS priority accent .dailyNoteItem[data-priority="${p}"] defined`)
}

// Pinned marker accent.
assert(/\.dailyNoteItem\[data-pinned="true"\]\s*\{/.test(DAB_CSS),
  '.dailyNoteItem[data-pinned="true"] accent defined')

// Notes body line-clamp.
assert(/\.dailyNoteBody\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*\d/.test(DAB_CSS),
  '.dailyNoteBody clamps with -webkit-line-clamp')
assert(/\.dailyNoteSpanish\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*\d/.test(DAB_CSS),
  '.dailyNoteSpanish clamps with -webkit-line-clamp')

// Panel has a max-height + overflow so it doesn't take over the page.
assert(/\.dailyNotesPanel\s*\{[\s\S]{0,400}max-height:\s*\d+px/.test(DAB_CSS),
  '.dailyNotesPanel sets a max-height (panel cannot dominate the page)')
assert(/\.dailyNotesPanel\s*\{[\s\S]{0,400}overflow-y:\s*auto/.test(DAB_CSS),
  '.dailyNotesPanel uses overflow-y: auto')

// Mobile breakpoint includes the panel.
assert(/@media\s*\(max-width:\s*600px\)\s*\{[\s\S]{0,1200}\.dailyNotesPanel/.test(DAB_CSS),
  '@media (max-width: 600px) tightens .dailyNotesPanel')

// ── No worker / API / migration changes ──────────────────────────────
section('Cross-file guards — worker / kiosk / Employee Mgmt untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/operations/notesStore.js',
  'src/utils/translate/translateClient.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.10'),
    `${path} carries no Phase 9C.10 edits (UI-only sub-phase)`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[1-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no new migration past 0050 (found: ${newMigrations.join(', ') || 'none'})`)

// ── Translation logic untouched ───────────────────────────────────────
section('Translation behavior files unchanged')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  '9C.8 scheduleTranslationSweep helper still exported (regression couple)')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/UPDATE crew_assignments[\s\S]{0,400}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'race-safe UPDATE guard for crew_assignments still intact (regression)')
assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  '9C.7a: assignment sweep still LEFT JOINs crew_employees (regression)')

// ── Existing DAB translation controls preserved ──────────────────────
section('Existing DAB translation controls — Translate Now + Regenerate preserved')

assert(/data-variant="translate"/.test(DAB),
  '9C.5d: Translate Now button preserved')
assert(/data-variant="regenerate"/.test(DAB),
  '9C.7: Regenerate button preserved')
assert(/async function handleNotesBlur\(assignment\)/.test(DAB),
  '9C.5b2: handleNotesBlur preserved')
assert(/async function handleNotesEsBlur\(assignment\)/.test(DAB),
  '9C.5b2: handleNotesEsBlur preserved')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
