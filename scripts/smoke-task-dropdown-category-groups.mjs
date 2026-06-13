// Phase 9C.13 — Task dropdown grouped by category smoke.
//
//   node scripts/smoke-task-dropdown-category-groups.mjs
//
// Each per-employee task dropdown on the Daily Assignment Board now
// renders <optgroup> blocks instead of one flat list. Buckets are
// ordered Crew → Irrigation → Spray → Agronomy → Maintenance → Other.
// Templates with no / unknown / blank category fall into "Other" so
// they never disappear from the picker.
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no kiosk
// changes, no template-default behavior changes, no task_templates
// schema changes. Existing handleQuickTaskChange flow (9C.11/9C.12)
// is preserved verbatim — the dropdown still hands a template.id off
// to handleQuickTaskChange and the 9C.12 default-notes carry / sweep
// gating is unchanged.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx',     'utf8')
const STORE = readFileSync('src/utils/tasks/taskTemplateStore.js',          'utf8')

// ── Module-level category helpers ─────────────────────────────────────
section('Category label + order helpers defined at module scope')

assert(/const\s+TASK_CATEGORY_LABELS\s*=\s*\{/.test(DAB),
  'TASK_CATEGORY_LABELS constant defined')
for (const [key, label] of [
  ['crew',        'Crew'],
  ['irrigation',  'Irrigation'],
  ['spray',       'Spray'],
  ['agronomy',    'Agronomy'],
  ['maintenance', 'Maintenance'],
  ['other',       'Other'],
]) {
  assert(new RegExp(`${key}:\\s*['"]${label}['"]`).test(DAB),
    `TASK_CATEGORY_LABELS includes ${key} → "${label}"`)
}

assert(/const\s+TASK_CATEGORY_ORDER\s*=\s*\[\s*['"]crew['"],\s*['"]irrigation['"],\s*['"]spray['"],\s*['"]agronomy['"],\s*['"]maintenance['"],\s*['"]other['"]\s*\]/.test(DAB),
  "TASK_CATEGORY_ORDER pins ['crew', 'irrigation', 'spray', 'agronomy', 'maintenance', 'other'] in that exact order")

// "Other" is last so it never overshadows the curated categories.
const orderMatch = DAB.match(/const\s+TASK_CATEGORY_ORDER\s*=\s*(\[[^\]]+\])/)
if (orderMatch) {
  const arr = JSON.parse(orderMatch[1].replace(/'/g, '"'))
  assert(arr[arr.length - 1] === 'other',
    'TASK_CATEGORY_ORDER ends with "other" (catch-all is last)')
  assert(arr[0] === 'crew',
    'TASK_CATEGORY_ORDER leads with "crew" (most-common bucket first)')
}

// ── groupedActiveTaskTemplates useMemo ────────────────────────────────
section('groupedActiveTaskTemplates useMemo — derivation + invariants')

assert(/const\s+groupedActiveTaskTemplates\s*=\s*useMemo/.test(DAB),
  'groupedActiveTaskTemplates useMemo defined')

const memoMatch = DAB.match(/const\s+groupedActiveTaskTemplates\s*=\s*useMemo\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[[^\]]+\]\)/)
const memoSrc   = memoMatch ? memoMatch[0] : ''
assert(memoSrc.length > 0, 'groupedActiveTaskTemplates body extracted')

// Iterates over the already-sorted activeTaskTemplates (preserving
// within-bucket sortOrder/name ordering from the upstream memo).
assert(/for \(const tmpl of activeTaskTemplates\)/.test(memoSrc),
  'groups iterate over activeTaskTemplates (inherits sortOrder/name sort)')

// Category normalization: trim + lowercase, fall back to "other" when
// the result isn't in the label map.
assert(/const raw = \(tmpl\.category \?\? ['"]['"]\)\.trim\(\)\.toLowerCase\(\)/.test(memoSrc),
  'raw category = (tmpl.category ?? "").trim().toLowerCase()')
assert(/const key = TASK_CATEGORY_LABELS\[raw\] \? raw : ['"]other['"]/.test(memoSrc),
  'unknown / null / blank categories fall back to "other"')

// Build via Map → preserves insertion order but the consumer sort
// happens via TASK_CATEGORY_ORDER, so insertion order doesn't matter.
assert(/buckets\.set\(key, \[\]\)/.test(memoSrc),
  'buckets are initialized lazily as new categories are encountered')
assert(/buckets\.get\(key\)\.push\(tmpl\)/.test(memoSrc),
  'each template is pushed into its bucket')

// Returns TASK_CATEGORY_ORDER-sorted, empty-bucket-filtered.
assert(/return TASK_CATEGORY_ORDER\s*\n?\s*\.filter\(key => buckets\.has\(key\)\)/.test(memoSrc),
  'returns TASK_CATEGORY_ORDER filtered to only buckets that have templates (empty groups omitted)')
assert(/\.map\(key => \(\{[\s\S]{0,200}label:\s*TASK_CATEGORY_LABELS\[key\][\s\S]{0,100}templates:\s*buckets\.get\(key\)/.test(memoSrc),
  'each group exposes { key, label, templates } — label from TASK_CATEGORY_LABELS')

// useMemo deps: only activeTaskTemplates (which itself depends on
// taskTemplates). Anything else would invalidate too often.
assert(/\}, \[activeTaskTemplates\]\)/.test(memoSrc),
  'groupedActiveTaskTemplates deps list: [activeTaskTemplates]')

// ── Dropdown JSX — <optgroup> per category ────────────────────────────
section('Dropdown JSX — <optgroup> rendered per category')

assert(/<option value="">— Unassigned —<\/option>/.test(DAB),
  'blank — Unassigned — option preserved')

assert(/groupedActiveTaskTemplates\.map\(group =>/.test(DAB),
  'dropdown maps over groupedActiveTaskTemplates (not the flat activeTaskTemplates)')

assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '<optgroup key={group.key} label={group.label}> wraps each bucket')

assert(/group\.templates\.map\(tmpl =>/.test(DAB),
  'inner map iterates over group.templates')

assert(/<option key=\{tmpl\.id\} value=\{tmpl\.id\}>\{tmpl\.name\}<\/option>/.test(DAB),
  'option key={tmpl.id} value={tmpl.id}>{tmpl.name} shape preserved (handleQuickTaskChange contract)')

// The legacy flat .map MUST be gone — otherwise we'd render duplicate
// options outside the optgroups.
assert(!/\{activeTaskTemplates\.map\(tmpl =>\s*\(?\s*<option key=\{tmpl\.id\}/.test(DAB),
  'legacy flat activeTaskTemplates.map() → <option> JSX retired')

// ── activeTaskTemplates regression couples (9C.11 + 9C.12) ────────────
section('activeTaskTemplates — 9C.11 sort + archive-filter preserved')

// Archived templates still excluded — defense-in-depth at the consumer.
assert(/\.filter\(t => t\.status === 'active'\)/.test(DAB),
  'activeTaskTemplates.filter(t => t.status === "active") preserved (archived excluded)')

// sortOrder ASC, then name ASC tiebreaker (within-bucket sort comes
// from this upstream sort).
assert(/const\s+sa\s*=\s*a\.sortOrder\s*\?\?\s*0[\s\S]{0,200}const\s+sb\s*=\s*b\.sortOrder\s*\?\?\s*0[\s\S]{0,200}sa\s*-\s*sb/.test(DAB),
  'activeTaskTemplates sort: sortOrder ASC preserved')
assert(/\(a\.name \?\? ['"]['"]\)\.localeCompare\(b\.name \?\? ['"]['"]\)/.test(DAB),
  'activeTaskTemplates sort tiebreaker: name ASC localeCompare preserved')

// ── handleQuickTaskChange — 9C.11/9C.12 contract preserved ────────────
section('handleQuickTaskChange — unchanged contract (templateId in, defaults applied)')

assert(/async function handleQuickTaskChange\(emp, templateId\)/.test(DAB),
  'handleQuickTaskChange(emp, templateId) signature preserved')
assert(/onChange=\{e => handleQuickTaskChange\(emp, e\.target\.value\)\}/.test(DAB),
  'dropdown onChange still passes the option value (template.id) to handleQuickTaskChange')
assert(/const template = activeTaskTemplates\.find\(t => t\.id === templateId\)/.test(DAB),
  'handleQuickTaskChange still resolves the template via activeTaskTemplates.find (not the grouped memo)')

// 9C.12 template-default behavior preserved.
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes derivation preserved')
assert(/const defaultNotes\s*=\s*\(template\.defaultNotes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 defaultNotes derivation preserved')
assert(/const notesToWrite\s*=\s*carriedNotes \|\| defaultNotes \|\| null/.test(DAB),
  '9C.12 notesToWrite = carriedNotes || defaultNotes || null preserved')
assert(/await createCrewAssignment\(\{[\s\S]{0,400}\bnotes:\s*notesToWrite/.test(DAB),
  '9C.12 createCrewAssignment payload still includes notes: notesToWrite')

// 9C.12 sweep gating preserved.
assert(/if \(notesToWrite && canTranslate\) \{\s*\n\s*scheduleTranslationSweep\(\)/.test(DAB),
  '9C.12 scheduleTranslationSweep() still gated on (notesToWrite && canTranslate)')

// pickOrCreateEventForTask still applies template defaults to the
// calendar event (regression couple from 9C.12).
assert(/title:\s*template\.name/.test(DAB),
  '9C.12 event title still comes from template.name')
assert(/startTime:\s*template\.defaultStartTime \|\| null/.test(DAB),
  '9C.12 event startTime still uses template.defaultStartTime')
assert(/location:\s*template\.defaultLocation\s*\|\| null/.test(DAB),
  '9C.12 event location still uses template.defaultLocation')
assert(/description:\s*template\.defaultNotes\s*\|\| null/.test(DAB),
  '9C.12 event description still uses template.defaultNotes')
assert(/sourceId:\s*`task-template:\$\{template\.id\}:\$\{dateIso\}`/.test(DAB),
  '9C.12 stable sourceId preserved')

// ── TasksManagerModal — category select still saves category ──────────
section('TasksManagerModal — category select still saves')

// The save payload still routes category through to the API. (Phase
// 9C.13 didn't expand the category vocabulary; this assertion guards
// against an accidental regression of the category field plumbing.)
assert(/category:\s*draft\.category \|\| null/.test(MODAL),
  'modal save payload: category: draft.category || null preserved')

// Category options still include all five canonical values + the
// blank prompt.
for (const opt of [`value: ''`, `value: 'crew'`, `value: 'spray'`, `value: 'maintenance'`, `value: 'agronomy'`, `value: 'irrigation'`]) {
  assert(MODAL.includes(opt),
    `TasksManagerModal CATEGORY_OPTS still includes { ${opt} } (regression couple — values match TASK_CATEGORY_LABELS keys)`)
}

// Store helpers untouched.
for (const fn of [
  'useTaskTemplatesData', 'refreshTaskTemplatesData',
  'createTaskTemplate', 'patchTaskTemplate',
  'archiveTaskTemplate', 'unarchiveTaskTemplate',
]) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `taskTemplateStore still exports ${fn}`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[3-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0052 (found: ${past0051.join(', ') || 'none'})`)

// task_templates schema unchanged.
assert(!/ALTER TABLE task_templates/i.test(readFileSync('worker/migrations/0051_task_templates.sql', 'utf8')),
  '0051 migration still has no ALTER TABLE task_templates (category column unchanged)')

// ── No worker / kiosk / API edits ─────────────────────────────────────
section('No worker / kiosk / API edits — 9C.13 is dropdown-render-only')

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
  'src/utils/tasks/taskTemplateStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.13'),
    `${path} carries no Phase 9C.13 edits`)
}

// ── Translation contract regression couples ───────────────────────────
section('Translation contract — race-safe NULL guards intact')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'autoTranslate UPDATE guard for crew_assignments.notes_es still intact')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  'scheduleTranslationSweep helper still exported')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
