// Phase DAB.10l — Show English + Spanish notes together smoke.
//
//   node scripts/smoke-display-board-english-spanish-together.mjs
//
// DAB.10i changed the kiosk to render ONE note per assignment (Spanish
// with English fallback when auto-translate was on). DAB.10l reverts
// to dual-render:
//
//   Auto-translate ON,  notesEs present   → English + Spanish (both)
//   Auto-translate ON,  notesEs blank     → English only (pending)
//   Auto-translate OFF                     → English only
//   English blank                          → no note block at all
//                                            (no orphan Spanish)
//   Both blank                             → no note elements
//
// Per-assignment isolation is preserved: trimmedNotes /
// trimmedNotesEs / showTranslation are local to each .map iteration
// bound to `a` (this assignment). 2nd Job cannot render 1st Job's
// translation because there is no shared state.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK      = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const KIOSK_CSS  = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',      'utf8')
const AUTO_TRANS = readFileSync('worker/lib/autoTranslate.js',                         'utf8')
const TRANSLATE  = readFileSync('worker/lib/translate.js',                             'utf8')
const WRANGLER   = readFileSync('wrangler.jsonc',                                      'utf8')

// ── No new migration / no worker translation changes ─────────────
section('Frontend-only — no worker or migration changes')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (DAB.10l is JSX-only)')

for (const path of [
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'worker/api/assignments.js',
  'worker/index.js',
  'worker/lib/autoTranslate.js',
  'worker/lib/translate.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10l'),
    `${path} carries no Phase DAB.10l edits (translation worker + model untouched)`)
}

// Model / provider still the DAB.10k.2 values (unchanged).
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast"/.test(WRANGLER),
  'wrangler.jsonc TRANSLATE_MODEL still @cf/meta/llama-3.3-70b-instruct-fp8-fast (DAB.10k.2 preserved)')
assert(/env\.TRANSLATE_MODEL\s*\|\|\s*['"]@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast['"]/.test(TRANSLATE),
  'translate.js fallback model still @cf/meta/llama-3.3-70b-instruct-fp8-fast (DAB.10k.2 preserved)')

// ── Per-assignment locals ────────────────────────────────────────
section('Per-assignment locals — no cross-assignment leak')

// Both trimmed values computed inside the .map callback bound to `a`.
assert(/\.map\(\(a, idx\) => \{/.test(KIOSK),
  'op.assignments.map((a, idx) => …) — each iteration bound to ITS OWN assignment')
assert(/const\s+trimmedNotes\s+= \(a\.notes\s+\?\? ''\)\.trim\(\)/.test(KIOSK),
  'trimmedNotes reads THIS a.notes (per-assignment)')
assert(/const\s+trimmedNotesEs\s+= \(a\.notesEs \?\? ''\)\.trim\(\)/.test(KIOSK),
  'trimmedNotesEs reads THIS a.notesEs (per-assignment translation isolated)')

// showTranslation gate.
assert(/const showTranslation = op\.showSpanishNotes && trimmedNotesEs\.length > 0/.test(KIOSK),
  'showTranslation = op.showSpanishNotes && trimmedNotesEs.length > 0')

// ── English always renders when non-blank ────────────────────────
section('English <p> renders whenever trimmedNotes non-blank')

assert(/\{trimmedNotes\.length > 0 && \(\s*\n\s*<p className=\{styles\.boardNotesText\} lang="en">/.test(KIOSK),
  'English <p className={styles.boardNotesText} lang="en"> gated on trimmedNotes.length > 0')

assert(/<p className=\{styles\.boardNotesText\} lang="en">\s*\n\s*\{trimmedNotes\}\s*\n\s*<\/p>/.test(KIOSK),
  'English <p> body = {trimmedNotes}')

// ── Spanish renders BELOW English when translation available ─────
section('Spanish <p> below English when showTranslation AND English present')

// Gate requires showTranslation AND non-blank English (no orphan).
assert(/\{showTranslation && trimmedNotes\.length > 0 && \(/.test(KIOSK),
  'Spanish <p> gate = showTranslation && trimmedNotes.length > 0 — no orphan Spanish when English blank')

// Spanish <p> uses BOTH boardNotesText + boardNotesTextEs classes.
assert(/<p\s*\n\s*className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n\s*lang="es"/.test(KIOSK),
  'Spanish <p> className = `${boardNotesText} ${boardNotesTextEs}` + lang="es"')

// Spanish <p> body = {trimmedNotesEs}.
assert(/lang="es"\s*\n\s*>\s*\n\s*\{trimmedNotesEs\}\s*\n\s*<\/p>/.test(KIOSK),
  'Spanish <p> body = {trimmedNotesEs}')

// ── English precedes Spanish in source order ─────────────────────
section('English precedes Spanish in JSX (visual order top-to-bottom)')

const taskBlockMatch = KIOSK.match(/<div key=\{a\.id \?\? idx\} className=\{styles\.boardTaskBlock\}>[\s\S]*?<\/div>/)
const taskBlockSrc = taskBlockMatch ? taskBlockMatch[0] : ''
assert(taskBlockSrc.length > 0, 'boardTaskBlock JSX slice extracted')

const englishPos = taskBlockSrc.indexOf('<p className={styles.boardNotesText} lang="en">')
const spanishPos = taskBlockSrc.search(/<p\s*\n\s*className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n\s*lang="es"/)
assert(englishPos > 0, 'English <p> found in JSX slice')
assert(spanishPos > 0, 'Spanish <p> found in JSX slice')
assert(englishPos < spanishPos,
  'English <p> appears BEFORE Spanish <p> in JSX (visual reading order)')

// Exactly one of each per task block.
const englishCount = (taskBlockSrc.match(/<p className=\{styles\.boardNotesText\} lang="en">/g) ?? []).length
const spanishCount = (taskBlockSrc.match(/<p\s*\n\s*className=\{`\$\{styles\.boardNotesText\}\s+\$\{styles\.boardNotesTextEs\}`\}\s*\n\s*lang="es"/g) ?? []).length
assert(englishCount === 1, `exactly one English <p lang="en"> per task block (found ${englishCount})`)
assert(spanishCount === 1, `exactly one Spanish <p lang="es"> per task block (found ${spanishCount})`)

// ── No orphan Spanish (empty English blocks Spanish) ─────────────
section('No orphan Spanish — English blank suppresses Spanish')

// Both branches share the `trimmedNotes.length > 0` gate — Spanish
// cannot render on its own when English is blank. Verify the
// structural conjunction.
assert(/\{showTranslation && trimmedNotes\.length > 0 && \(/.test(KIOSK),
  'Spanish gate requires trimmedNotes.length > 0 (English present) — DAB.10l orphan guard')

// ── Both blank → no note elements ────────────────────────────────
section('Both blank → no note elements')

// If trimmedNotes is blank the English gate fails → no English <p>.
// The Spanish gate also requires trimmedNotes.length > 0 → no
// Spanish <p>. Structurally verified above; no additional pin.

// ── Pending translation: English only ────────────────────────────
section('Translation pending: English only')

// When op.showSpanishNotes is true but trimmedNotesEs is empty:
//   showTranslation = true && 0 > 0 = false
//   → English <p> renders (from its own gate)
//   → Spanish <p> skipped (showTranslation false)
// Fully covered by the gate compositions above.

// ── CSS: styling preserved ───────────────────────────────────────
section('CSS: .boardNotesTextEs only adds italic + tint (font-size inherited)')

const notesEsBlock = KIOSK_CSS.match(/\.boardNotesTextEs \{([\s\S]{0,400}?)\n\}/)?.[1] ?? ''
assert(notesEsBlock.length > 0, '.boardNotesTextEs block parsed')
assert(!/font-size:/.test(notesEsBlock),
  '.boardNotesTextEs does NOT override font-size (both lines inherit the DAB.10g.1 note-size ratio)')
assert(/font-style:\s+italic/.test(notesEsBlock),
  '.boardNotesTextEs adds italic (visual differentiation)')
assert(/color:/.test(notesEsBlock),
  '.boardNotesTextEs adds color tint (visual differentiation)')

// ── DAB.10g.1 typography ratios preserved ────────────────────────
section('DAB.10g.1 typography ratios preserved')

assert(/--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  '--board-name-size on .boardBars')
assert(/--board-job-size:\s+calc\(var\(--board-name-size\) \* 0\.6667\)/.test(KIOSK_CSS),
  '--board-job-size = --board-name-size × 2/3')
assert(/--board-note-size:\s+calc\(var\(--board-name-size\) \* 0\.625\)/.test(KIOSK_CSS),
  '--board-note-size = --board-name-size × 5/8')

// Both English and Spanish read the same variable. The block body is
// larger than a naive 600-char budget (includes -webkit-line-clamp
// scaffolding + DAB.10d comments); use 2000 chars.
const boardNotesTextBase = KIOSK_CSS.match(/\n\.boardNotesText \{([\s\S]{0,2000}?)\n\}/)?.[1] ?? ''
assert(/font-size:\s+var\(--board-note-size\)/.test(boardNotesTextBase),
  '.boardNotesText font-size: var(--board-note-size) — English AND Spanish both use this ratio')

// ── Multi-job isolation ──────────────────────────────────────────
section('Multi-job isolation — each block reads its own a.notes / a.notesEs')

// showOrdinal preserved for multi-job labels.
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal multi-job gate preserved (DAB.10b)')

// operatorCards per-assignment notes attach (DAB.10c couple).
assert(/notes:\s+a\.notes\s+\?\? ''/.test(KIOSK),
  'per-assignment notes attached in operatorCards (DAB.10c)')
assert(/notesEs:\s+a\.notesEs \?\? ''/.test(KIOSK),
  'per-assignment notesEs attached in operatorCards (DAB.10c)')

// ── Two-column layout preserved ──────────────────────────────────
section('Two-column deterministic layout preserved')

assert(/const boardColumns = viewport\.isMobile \? 1\s*\n\s*: \(viewport\.w >= 1600 && fitMode === 'ultra'\) \? 3\s*\n\s*: \(viewport\.w >= 900\) \? 2/.test(KIOSK),
  'DAB.10j boardColumns rule preserved (≥900px → 2 cols)')

// ── Deterministic layout system preserved ────────────────────────
section('Deterministic layout system preserved — no ResizeObserver, no transform')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no new ResizeObserver — DAB.10g deterministic system preserved')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(!/transform:/.test(innerBlock),
  '.boardBarsInner uses no transform (DAB.10f.3 preserved)')

// ── Mobile preserved ─────────────────────────────────────────────
section('Mobile behavior preserved')

// showSpanishNotes is a per-employee flag computed at operatorCards
// build time — viewport-independent — so mobile picks the same
// language as desktop for the same employee. Mobile CSS releases
// kiosk locks (DAB.10e.1 / DAB.10g.1) which are untouched here.
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile scroll release preserved')
assert(/Phase DAB\.10g\.1 — Mobile RELEASES the legacy typography ratios/.test(KIOSK_CSS),
  'mobile typography release preserved')

// ── Auto-translate infrastructure untouched ──────────────────────
section('Auto-translate worker + sweep untouched')

// employeeNeedsSpanish still checks both prefs.
assert(/function employeeNeedsSpanish\(employee\) \{\s*\n\s*return Boolean\(employee\?\.autoTranslateBoardNotes\) && employee\?\.boardLanguage === 'es'/.test(KIOSK),
  'employeeNeedsSpanish(employee) unchanged')

// showSpanishNotes still set at operatorCards creation.
assert(/showSpanishNotes:\s+employeeNeedsSpanish\(employee\)/.test(KIOSK),
  'showSpanishNotes: employeeNeedsSpanish(employee) at card creation')

// Sweep signature preserved (DAB.10k.1).
assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env(?:,\s*opts\s*=\s*\{\})?\)/.test(AUTO_TRANS),
  'sweep signature unchanged (DAB.10k.1 preserved)')

// Sweep join predicates unchanged (DAB.10j preserved).
assert(/LOWER\(TRIM\(emp\.name\)\)\s*=\s*LOWER\(TRIM\(a\.employee_name\)\)/.test(AUTO_TRANS),
  'sweep normalized name join preserved (DAB.10j)')

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
  assert(!src.includes('Phase DAB.10l'),
    `${path} carries no Phase DAB.10l edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
