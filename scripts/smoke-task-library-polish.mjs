// Phase 9C.14 — Task Library polish (search + category filter +
// richer row metadata) smoke.
//
//   node scripts/smoke-task-library-polish.mjs
//
// The Task Library modal gains a search box, a category filter
// dropdown (mirroring the DAB optgroup vocabulary), and per-row
// metadata + a notes preview so the supervisor can see what a
// template does without flipping every row open. The 9C.13 DAB
// dropdown grouping and the 9C.12 template-default carry / sweep
// gating are explicitly preserved.
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no
// kiosk changes, no task_templates schema changes, no template store
// changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx',       'utf8')
const CSS   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',    'utf8')
const STORE = readFileSync('src/utils/tasks/taskTemplateStore.js',            'utf8')

// ── Search state + input wiring ───────────────────────────────────────
section('Search box — state + input + placeholder')

assert(/const \[searchText, setSearchText\]\s*=\s*useState\(['"]['"]\)/.test(MODAL),
  'searchText state defaults to empty string')

assert(/placeholder="Search tasks\.\.\."/.test(MODAL),
  'search input placeholder is "Search tasks..."')

assert(/<input[\s\S]{0,400}type="search"[\s\S]{0,400}value=\{searchText\}/.test(MODAL),
  '<input type="search" value={searchText}> wired to searchText state')
assert(/onChange=\{e => setSearchText\(e\.target\.value\)\}/.test(MODAL),
  'search input onChange calls setSearchText(e.target.value)')
assert(/aria-label="Search tasks"/.test(MODAL),
  'search input has accessible label "Search tasks"')

// ── Category filter state + select wiring ─────────────────────────────
section('Category filter — state + select + option vocabulary')

assert(/const \[categoryFilter, setCategoryFilter\]\s*=\s*useState\(['"]all['"]\)/.test(MODAL),
  "categoryFilter state defaults to 'all'")

assert(/onChange=\{e => setCategoryFilter\(e\.target\.value\)\}/.test(MODAL),
  'category select onChange calls setCategoryFilter(e.target.value)')

assert(/aria-label="Filter by category"/.test(MODAL),
  'category select has accessible label "Filter by category"')

// CATEGORY_FILTER_OPTS includes all required filter values + labels.
for (const [val, label] of [
  ['all',         'All categories'],
  ['crew',        'Crew'],
  ['irrigation',  'Irrigation'],
  ['spray',       'Spray'],
  ['agronomy',    'Agronomy'],
  ['maintenance', 'Maintenance'],
  ['other',       'Other'],
]) {
  assert(new RegExp(`value:\\s*['"]${val}['"],\\s*label:\\s*['"]${label}['"]`).test(MODAL),
    `CATEGORY_FILTER_OPTS includes { value: '${val}', label: '${label}' }`)
}

// "Archived only" option only renders when showArchived is on so the
// filter dropdown doesn't show a value the list cannot fill.
assert(/showArchived && \(\s*\n\s*<option value="archived">Archived only<\/option>/.test(MODAL),
  '"Archived only" filter option only renders when showArchived is on')

// ── Filter helpers ────────────────────────────────────────────────────
section('Filter helpers — normalizeCategory + categoryLabel + templateMatchesSearch')

assert(/function normalizeCategory\(category\)/.test(MODAL),
  'normalizeCategory(category) defined')
assert(/function categoryLabel\(category\)/.test(MODAL),
  'categoryLabel(category) defined')
assert(/function templateMatchesSearch\(t, query\)/.test(MODAL),
  'templateMatchesSearch(t, query) defined')

// normalizeCategory falls unknowns to "other" (same contract as the
// DAB's TASK_CATEGORY_LABELS lookup).
assert(/return CATEGORY_LABELS\[raw\] \? raw : ['"]other['"]/.test(MODAL),
  'normalizeCategory falls unknown / null / blank categories to "other"')

// templateMatchesSearch builds a haystack across name + category label
// + defaultLocation + defaultNotes.
assert(/const haystack = \[\s*\n\s*t\.name,\s*\n\s*categoryLabel\(t\.category\),\s*\n\s*t\.defaultLocation,\s*\n\s*t\.defaultNotes,/.test(MODAL),
  'templateMatchesSearch haystack = [name, categoryLabel(category), defaultLocation, defaultNotes]')
assert(/haystack\.includes\(q\)/.test(MODAL),
  'templateMatchesSearch returns haystack.toLowerCase().includes(query.toLowerCase())')

// ── filteredTemplates pipeline ────────────────────────────────────────
section('filteredTemplates useMemo — combined filter pipeline')

assert(/const filteredTemplates\s*=\s*useMemo\(\(\)\s*=>/.test(MODAL),
  'filteredTemplates useMemo defined')

const memoMatch = MODAL.match(/const filteredTemplates\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[[^\]]+\]\)/)
const memoSrc   = memoMatch ? memoMatch[0] : ''
assert(memoSrc.length > 0, 'filteredTemplates body extracted')

// showArchived gates whether archived rows are eligible at all.
assert(/\.filter\(t => showArchived \? true : t\.status === ['"]active['"]\)/.test(memoSrc),
  'showArchived gates: false → only active; true → both statuses eligible')

// categoryFilter narrows by normalized category (or status).
assert(/if \(categoryFilter === ['"]all['"]\) return true/.test(memoSrc),
  'categoryFilter "all" short-circuits to no narrowing')
assert(/if \(categoryFilter === ['"]archived['"]\) return t\.status === ['"]archived['"]/.test(memoSrc),
  'categoryFilter "archived" filters to archived rows only')
assert(/return normalizeCategory\(t\.category\) === categoryFilter/.test(memoSrc),
  'categoryFilter (non-all, non-archived) compares normalized category')

// search runs after category narrowing.
assert(/\.filter\(t => templateMatchesSearch\(t, searchText\)\)/.test(memoSrc),
  'search runs via templateMatchesSearch(t, searchText)')

// sort: active before archived (when both visible), then sortOrder ASC,
// then name ASC.
assert(/if \(showArchived && a\.status !== b\.status\)/.test(memoSrc),
  'sort puts active rows above archived rows when both are visible')
assert(/const sa = a\.sortOrder \?\? 0[\s\S]{0,200}const sb = b\.sortOrder \?\? 0[\s\S]{0,200}sa - sb/.test(memoSrc),
  'sort by sortOrder ASC (with ?? 0 fallback)')
assert(/\(a\.name \?\? ['"]['"]\)\.localeCompare\(b\.name \?\? ['"]['"]\)/.test(memoSrc),
  'sort tiebreaker: name ASC localeCompare')

// useMemo deps: all four inputs.
assert(/\}, \[templates, showArchived, categoryFilter, searchText\]\)/.test(memoSrc),
  'filteredTemplates deps list: [templates, showArchived, categoryFilter, searchText]')

// ── showArchived toggle preserved + archived-only reset ──────────────
section('Show archived toggle preserved (+ archived-only filter reset)')

assert(/const \[showArchived, setShowArchived\]\s*=\s*useState\(includeArchived\)/.test(MODAL),
  'showArchived state still derived from store includeArchived')

assert(/refreshTaskTemplatesData\(\{ includeArchived: showArchived \}\)/.test(MODAL),
  'showArchived toggle still refreshes the store with the new flag')

// When the supervisor turns OFF showArchived while the "Archived only"
// filter is active, the filter would silently empty the list. The
// modal resets the filter to "all" to avoid the dead-end state.
assert(/if \(!next && categoryFilter === ['"]archived['"]\) \{\s*\n\s*setCategoryFilter\(['"]all['"]\)/.test(MODAL),
  'turning showArchived off resets an archived-only category filter back to "all"')

// ── Row display — metadata line + notes preview + archived styling ────
section('Row display — metadata line + notes preview + archived styling')

assert(/className=\{styles\.taskMetaLine\}/.test(MODAL),
  'rows render a styles.taskMetaLine span')
assert(/className=\{styles\.taskNotesPreview\}/.test(MODAL),
  'rows render a styles.taskNotesPreview span when defaultNotes is non-empty')

// metaPieces builds [category, sort, startTime, location] before
// joining with " · ".
assert(/const metaPieces\s*=\s*\[[\s\S]{0,200}categoryLabel\(t\.category\),[\s\S]{0,200}`sort \$\{t\.sortOrder \?\? 0\}`[\s\S]{0,200}t\.defaultStartTime/.test(MODAL),
  'metaPieces = [categoryLabel, sort N, defaultStartTime?, defaultLocation?]')
assert(/metaPieces\.join\(['"] · ['"]\)/.test(MODAL),
  'metaPieces joined with " · " separator')

// Notes preview is gated on a non-empty trimmed value so a blank/null
// defaultNotes doesn't render an "Notes:" prefix with nothing after.
assert(/const notesPrev\s*=\s*\(t\.defaultNotes \?\? ['"]['"]\)\.trim\(\)/.test(MODAL),
  'notesPrev = (t.defaultNotes ?? "").trim()')
assert(/\{notesPrev && \(\s*\n\s*<span className=\{styles\.taskNotesPreview\}/.test(MODAL),
  'notes preview only renders when notesPrev is truthy')
assert(/Notes:\s*\{notesPrev\}/.test(MODAL),
  '"Notes: {notesPrev}" copy renders inside the preview span')
assert(/title=\{notesPrev\}/.test(MODAL),
  'notes preview span exposes full notes via title attribute (hover tooltip for clamped text)')

// Archived rows get the visual subordination class.
assert(/isArchived\s*\?\s*['"]\s*['"]\s*\+\s*styles\.taskArchivedRow\s*:\s*['"]['"]/.test(MODAL)
    || /\$\{isArchived \? ['"]\s*['"]\s*\+\s*styles\.taskArchivedRow : ['"]['"]\}/.test(MODAL),
  'archived rows append styles.taskArchivedRow to className')

// ── Empty states — no templates AND no matches ────────────────────────
section('Empty states — no templates yet AND no search/filter matches')

assert(/totalCount === 0/.test(MODAL),
  'totalCount === 0 branch in the empty-state render')
assert(/No task templates yet\. Click <strong>\+ New Task<\/strong> to add one\./.test(MODAL),
  '"No task templates yet. Click + New Task to add one." copy preserved')

assert(/filteredTemplates\.length === 0/.test(MODAL),
  'filteredTemplates.length === 0 secondary empty state')
assert(/No tasks match that search\/filter\./.test(MODAL),
  '"No tasks match that search/filter." copy renders when filter narrows to zero rows')

// ── Save payload unchanged (regression couple from 9C.11/9C.12) ──────
section('Save payload — name + category + defaultStartTime + defaultLocation + defaultNotes + sortOrder')

assert(/name:\s*draft\.name\.trim\(\)/.test(MODAL),
  'save payload: name = draft.name.trim()')
assert(/category:\s*draft\.category \|\| null/.test(MODAL),
  'save payload: category = draft.category || null')
assert(/defaultStartTime:\s*draft\.defaultStartTime \|\| null/.test(MODAL),
  'save payload: defaultStartTime = draft.defaultStartTime || null')
assert(/defaultLocation:\s*draft\.defaultLocation\.trim\(\) \|\| null/.test(MODAL),
  'save payload: defaultLocation = draft.defaultLocation.trim() || null')
assert(/defaultNotes:\s*draft\.defaultNotes\.trim\(\) \|\| null/.test(MODAL),
  'save payload: defaultNotes = draft.defaultNotes.trim() || null')
assert(/sortOrder:\s*Number\.isFinite\(Number\(draft\.sortOrder\)\) \? Number\(draft\.sortOrder\) : 0/.test(MODAL),
  'save payload: sortOrder coerces NaN to 0')

// ── Archive / reactivate handlers preserved ───────────────────────────
section('Archive / reactivate handlers preserved')

assert(/async function handleArchive\(t\)/.test(MODAL),
  'handleArchive(t) defined')
assert(/await archiveTaskTemplate\(t\.id\)/.test(MODAL),
  'handleArchive calls archiveTaskTemplate(t.id)')
assert(/async function handleUnarchive\(t\)/.test(MODAL),
  'handleUnarchive(t) defined')
assert(/await unarchiveTaskTemplate\(t\.id\)/.test(MODAL),
  'handleUnarchive calls unarchiveTaskTemplate(t.id)')

// Archive confirm copy preserved (regression couple — Phase 9C.11).
assert(/Archive "\$\{t\.name\}"\? It will no longer appear in the task dropdown\./.test(MODAL),
  'archive confirm copy preserved')

// Translation sweep after save still gated on canSystemSettings.
assert(/canTranslate = can\(['"]canSystemSettings['"]\)/.test(MODAL),
  '9C.8 sweep gating: canTranslate = can("canSystemSettings")')
assert(/if \(canTranslate\) scheduleTranslationSweep\(\)/.test(MODAL),
  '9C.8 sweep call: if (canTranslate) scheduleTranslationSweep()')

// ── DAB dropdown grouping from 9C.13 unchanged ────────────────────────
section('DAB dropdown grouping (9C.13) preserved')

assert(/const TASK_CATEGORY_ORDER = \['crew', 'irrigation', 'spray', 'agronomy', 'maintenance', 'other'\]/.test(DAB),
  'TASK_CATEGORY_ORDER constant unchanged')
assert(/const groupedActiveTaskTemplates\s*=\s*useMemo/.test(DAB),
  'groupedActiveTaskTemplates useMemo unchanged')
assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '<optgroup> per category still rendered')

// ── 9C.12 template defaults still applied on assignment ──────────────
section('9C.12 template defaults — still applied on assignment')

assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes derivation preserved in handleQuickTaskChange')
assert(/const notesToWrite\s*=\s*carriedNotes \|\| defaultNotes \|\| null/.test(DAB),
  '9C.12 notesToWrite preservation rule preserved')
assert(/title:\s*template\.name/.test(DAB),
  '9C.12 event title still comes from template.name')
assert(/startTime:\s*template\.defaultStartTime \|\| null/.test(DAB),
  '9C.12 event startTime still uses template.defaultStartTime')
assert(/location:\s*template\.defaultLocation\s*\|\| null/.test(DAB),
  '9C.12 event location still uses template.defaultLocation')

// ── CSS — new classes defined ─────────────────────────────────────────
section('CSS — toolbar + metadata + archived-row classes defined')

for (const cls of ['tasksToolbar', 'taskSearchInput', 'taskFilterSelect',
                   'taskMetaLine', 'taskNotesPreview', 'taskArchivedRow']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS rule .${cls} defined`)
}

// Toolbar lays out multiple controls (was justify-content: flex-end
// before 9C.14; needs to lay out 4 controls now). Allow wrap so the
// search input keeps usable width on narrow modals.
assert(/\.tasksToolbar\s*\{[\s\S]{0,400}flex-wrap:\s*wrap/.test(CSS),
  '.tasksToolbar uses flex-wrap: wrap (mobile-friendly)')

// Notes preview clamps to 2 lines so a long defaultNotes does not
// blow the row height.
assert(/\.taskNotesPreview\s*\{[\s\S]{0,400}-webkit-line-clamp:\s*2/.test(CSS),
  '.taskNotesPreview clamps with -webkit-line-clamp: 2')

// Archived rows render muted.
assert(/\.taskArchivedRow\s*\{[\s\S]{0,200}opacity:\s*0\.\d/.test(CSS),
  '.taskArchivedRow uses a sub-1.0 opacity (visually muted)')

// ── Store + worker untouched ──────────────────────────────────────────
section('Store + worker / API / kiosk untouched')

for (const fn of [
  'useTaskTemplatesData', 'refreshTaskTemplatesData',
  'createTaskTemplate', 'patchTaskTemplate',
  'archiveTaskTemplate', 'unarchiveTaskTemplate',
]) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `taskTemplateStore still exports ${fn}`)
}
assert(!STORE.includes('Phase 9C.14'),
  'taskTemplateStore.js carries no Phase 9C.14 edits')

for (const path of [
  'worker/api/taskTemplates.js',
  'worker/api/assignments.js',
  'worker/api/calendar.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.14'),
    `${path} carries no Phase 9C.14 edits`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0055 (found: ${past0051.join(', ') || 'none'})`)

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
