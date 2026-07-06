// Phase DAB.10j — Translation pipeline fix + forced two-column layout smoke.
//
//   node scripts/smoke-display-board-translate-and-columns.mjs
//
// Production report:
//   • Auto Translate checked → notes still rendered English on kiosk.
//   • Legacy Display Board still single-column even on wide TVs.
//
// Root causes identified:
//   1. Sweep SQL join used `emp.name = a.employee_name` (exact equality).
//      Any whitespace/case difference (trailing space, mixed case, double
//      space) silently skipped that assignment forever → notes_es stayed
//      NULL → kiosk fallback to English → looked like translation was off.
//   2. Client-side operatorCards used `a.employeeId ? employeeById.get(...)
//      : null` — legacy assignments with employee_name but no employee_id
//      resolved to null → showSpanishNotes = false regardless of the
//      employee's Auto Translate preference.
//   3. Column rule: `≥1100px + compact/ultra (or comfortable + non-roomy)
//      → 2 columns` meant roomy + natural at any width stayed 1 column,
//      even on 1920×1080 shop TVs.
//
// DAB.10j fixes (all pinned by this smoke):
//   Translation:
//     • Sweep SQL join uses LOWER(TRIM(...)) on both sides.
//     • Client-side resolveEmployee(a) does id-first, normalized-name
//       fallback via employeeByNormalizedName Map.
//     • Sweep per-row try/catch so one bad row doesn't abort remaining
//       candidates + returns {scanned, translated, failed} counts.
//   Layout:
//     • boardColumns: mobile → 1, ≥1600px + ultra → 3, ≥900px → 2, else 1.
//     • targetCardHeight = floor((availableRosterHeight - totalRowGaps)
//       / rowCount) — accounts for every row gap, not just one.
//     • Column-major reorder places cards vertically-first via IIFE
//       reindex without adding a second card markup path.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const KIOSK       = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',                'utf8')
const KIOSK_CSS   = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',         'utf8')
const AUTO_TRANS  = readFileSync('worker/lib/autoTranslate.js',                            'utf8')
const WORKER_IDX  = readFileSync('worker/index.js',                                        'utf8')

// ── No new migration ─────────────────────────────────────────────
section('No new migration')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration')

// ── FIX 1: Sweep SQL normalizes both sides of the name join ──────
section('FIX 1: Sweep SQL normalizes LOWER(TRIM(...)) on both sides')

assert(/LOWER\(TRIM\(emp\.name\)\)\s*=\s*LOWER\(TRIM\(a\.employee_name\)\)/.test(AUTO_TRANS),
  'sweep join uses LOWER(TRIM(emp.name)) = LOWER(TRIM(a.employee_name))')

// Negative pin — the old UNWRAPPED exact-equality predicate must be
// gone from actual SQL. Strip line comments before scanning so a
// `//   OR emp.name = a.employee_name` line describing the prior
// bug in the header comment doesn't false-positive.
const codeOnly = AUTO_TRANS.split('\n')
  .map(l => l.replace(/^\s*\/\/.*$/, ''))   // drop pure `//` line comments
  .join('\n')
assert(!/OR\s+emp\.name\s*=\s*a\.employee_name/.test(codeOnly),
  'no `OR emp.name = a.employee_name` in actual SQL (comments describing prior bug are fine)')

// employee_id path preserved.
assert(/emp\.id\s*=\s*a\.employee_id/.test(AUTO_TRANS),
  'employee_id join preserved as primary match')

// ── FIX 2: Client-side resolveEmployee(a) helper ─────────────────
section('FIX 2: Client resolveEmployee(a) — id first, normalized-name fallback')

// Normalization function matches the server predicate.
assert(/const normalizeEmployeeName = \(name\) =>\s*\n\s*String\(name \?\? ''\)\.trim\(\)\.toLowerCase\(\)\.replace\(\/\\s\+\/g, ' '\)/.test(KIOSK),
  'normalizeEmployeeName: trim + lowercase + collapse whitespace (mirrors server LOWER + TRIM)')

// Normalized-name lookup Map.
assert(/const employeeByNormalizedName = useMemo\(\(\) => \{[\s\S]{0,500}for \(const e of employees\) \{[\s\S]{0,200}const norm = normalizeEmployeeName\(e\.name\)/.test(KIOSK),
  'employeeByNormalizedName useMemo Map keyed by normalized name')

// Resolver: id first, name fallback.
assert(/const resolveEmployee = \(a\) => \{/.test(KIOSK),
  'resolveEmployee(a) helper declared')
assert(/const resolveEmployee = \(a\) => \{[\s\S]{0,400}if \(a\.employeeId\) \{[\s\S]{0,300}employeeById\.get\(a\.employeeId\)/.test(KIOSK),
  'resolveEmployee tries employeeById.get(a.employeeId) FIRST')
assert(/const resolveEmployee = \(a\) => \{[\s\S]{0,600}employeeByNormalizedName\.get\(norm\)/.test(KIOSK),
  'resolveEmployee falls back to employeeByNormalizedName.get(norm) when id missing')
assert(/return norm \? \(employeeByNormalizedName\.get\(norm\) \?\? null\) : null/.test(KIOSK),
  'resolveEmployee returns null when no match (safe: showSpanishNotes = false = English)')

// operatorCards uses the helper.
assert(/const employee = resolveEmployee\(a\)/.test(KIOSK),
  'operatorCards loop calls resolveEmployee(a) — legacy assignments no longer silently English')

// useMemo deps include the new Map so operatorCards re-runs when
// employees or the normalized index changes.
assert(/dayCrew, dayEvents, equipByEvent, employeeNameLookup, employeeById,\s*\n\s*employeeByNormalizedName, employees,/.test(KIOSK),
  'operatorCards useMemo deps include employeeByNormalizedName')

// ── FIX 3: Per-row try/catch + failed count in sweep ─────────────
section('FIX 3: Per-row try/catch — one failure does not abort sweep')

// Phase DAB.10k — per-row try/catch broadened; the block is much
// larger now (reason-code buckets before/after translateText and
// UPDATE), so the regex just verifies both keywords appear in the
// loop body without pinning the specific inter-line layout.
assert(/for \(const row of results \?\? \[\]\) \{[\s\S]{0,3000}try \{[\s\S]{0,3000}\} catch \(err\) \{/.test(AUTO_TRANS),
  'sweep per-row loop wraps translateText + UPDATE in try/catch')

// Failure logged with id only (no note contents).
assert(/console\.warn\('\[TurfIntel Translate\] row failed', \{\s*\n\s*id: row\.id/.test(AUTO_TRANS),
  'row failure logs id only (no note contents leaked)')

// Phase DAB.10k — Returns {scanned, translated, failed, reasons}.
// The reasons object exposes per-bucket counts so `?debug=1` can
// distinguish empty_provider_result vs update_not_applied vs
// identical_to_source vs provider_error vs write_failed.
assert(/return \{ scanned: results\?\.length \?\? 0, translated, failed, reasons \}/.test(AUTO_TRANS),
  'sweep returns {scanned, translated, failed, reasons} — DAB.10k reason buckets')
for (const reasonKey of [
  'empty_provider_result',
  'provider_error',
  'update_not_applied',
  'identical_to_source',
  'write_failed',
]) {
  assert(new RegExp(`reasons\\.${reasonKey}(?:\\+\\+|:)`).test(AUTO_TRANS),
    `reason bucket '${reasonKey}' initialized + incremented`)
}

// ── Scheduled handler still invokes sweep ────────────────────────
section('Scheduled handler still invokes runAutoTranslateSweep')

assert(/import \{ runAutoTranslateSweep \} from '\.\/lib\/autoTranslate\.js'/.test(WORKER_IDX),
  'worker imports runAutoTranslateSweep')
assert(/ctx\.waitUntil\(\s*\n\s*runAutoTranslateSweep\(env\)/.test(WORKER_IDX),
  'scheduled() handler calls runAutoTranslateSweep(env) via ctx.waitUntil')
assert(/\[TurfIntel Translate\] cron sweep/.test(WORKER_IDX),
  'sweep success logged with [TurfIntel Translate] cron sweep prefix (wrangler tail visibility)')
assert(/\[TurfIntel Translate\] cron error/.test(WORKER_IDX),
  'sweep errors caught + logged (never swallowed silently)')

// Manual admin endpoint preserved for diagnostics — already existed
// pre-DAB.10j; verify it still requires canSystemSettings.
assert(/if \(pathname === '\/api\/admin\/translate\/run' && method === 'POST'\)/.test(WORKER_IDX),
  'existing /api/admin/translate/run endpoint preserved (manual diagnostic path)')
assert(/actorHasPermission\(actor, 'canSystemSettings'\)/.test(WORKER_IDX),
  'admin sweep endpoint requires canSystemSettings permission')

// ── FIX 4: Two-column column rule ────────────────────────────────
section('FIX 4: boardColumns — force 2 columns at ≥900px non-mobile')

// The rule: mobile → 1, ≥1600 ultra → 3, ≥900 → 2, else 1.
assert(/const boardColumns = viewport\.isMobile \? 1\s*\n\s*: \(viewport\.w >= 1600 && fitMode === 'ultra'\) \? 3\s*\n\s*: \(viewport\.w >= 900\) \? 2\s*\n\s*: 1/.test(KIOSK),
  "boardColumns: mobile→1, ≥1600+ultra→3, ≥900→2, else 1 — legacy TVs force 2 cols in roomy+natural too")

// Negative pin — the DAB.10g rule that gated 2-col on fit-mode/density
// is gone.
assert(!/fitMode === 'compact' \|\| fitMode === 'ultra'\s*\n\s*\|\| \(density === 'comfortable'/.test(KIOSK),
  'old fit-mode-gated 2-col rule REMOVED (roomy + natural now also get 2 cols at ≥900px)')

// ── FIX 5: targetCardHeight accounts for ALL row gaps ────────────
section('FIX 5: targetCardHeight accounts for ALL row gaps')

assert(/const CONFIGURED_ROW_GAP = 16/.test(KIOSK),
  'CONFIGURED_ROW_GAP = 16 (px, matches CSS gap between .boardPersonBar rows)')
assert(/const totalRowGaps = Math\.max\(0, rowCount - 1\) \* CONFIGURED_ROW_GAP/.test(KIOSK),
  'totalRowGaps = (rowCount - 1) × CONFIGURED_ROW_GAP')
assert(/const targetCardHeight = Math\.floor\(\(availableRosterHeight - totalRowGaps\) \/ rowCount\)/.test(KIOSK),
  'targetCardHeight = floor((availableRosterHeight - totalRowGaps) / rowCount)')

// Negative pin — flat -16 subtraction is gone.
assert(!/Math\.floor\(availableRosterHeight \/ rowCount\) - 16/.test(KIOSK),
  'old flat -16 subtraction REMOVED (accounts for every gap now)')

// rowCount still derives from operatorCount + boardColumns.
assert(/const rowCount = Math\.max\(1, Math\.ceil\(operatorCount \/ boardColumns\)\)/.test(KIOSK),
  'rowCount = ceil(operatorCount / boardColumns)')

// ── FIX 6: Column-major card ordering ────────────────────────────
section('FIX 6: Column-major reorder — vertical reading top-to-bottom per column')

// Rendered array is computed inline via IIFE and fed to .map(op => …).
// Verify the IIFE exists and one card-render callback follows it.
assert(/\{\(\(\) => \{\s*\n\s*if \(boardColumns <= 1\) return operatorCards/.test(KIOSK),
  '1-column short-circuit returns operatorCards unchanged (no reindex needed)')
assert(/const rows = Math\.ceil\(operatorCards\.length \/ boardColumns\)/.test(KIOSK),
  'IIFE computes rows = ceil(operatorCards.length / boardColumns)')
assert(/const srcIdx = c \* rows \+ r/.test(KIOSK),
  'reorder places column c row r at operatorCards[c * rows + r] — column-major → row-major grid placement')

// Boardmode function has exactly one card-render .map callback.
const boardModeFn = KIOSK.match(/function BoardModeCrewBars\([\s\S]+?\n\}\n/)?.[0] ?? ''
const mapCallbackCount = (boardModeFn.match(/\)\.map\(op =>/g) ?? []).length
assert(mapCallbackCount === 1,
  `exactly one .map(op => …) card-render callback (one card markup path). Found ${mapCallbackCount}`)

// ── Preserved DAB.10l dual-render translation display ────────────
section('DAB.10l dual English + Spanish display preserved')

// DAB.10i's select-one was replaced with DAB.10l's dual-render:
// English always shows when non-blank; Spanish shows below only when
// auto-translate is on AND translation is available.
assert(/const showTranslation = op\.showSpanishNotes && trimmedNotesEs\.length > 0/.test(KIOSK),
  'showTranslation gates the Spanish <p> line (DAB.10l)')
assert(/\{trimmedNotes\.length > 0 && \(\s*\n\s*<p className=\{styles\.boardNotesText\} lang="en">/.test(KIOSK),
  'English <p lang="en"> renders when trimmedNotes non-blank')
assert(/\{showTranslation && trimmedNotes\.length > 0 && \(/.test(KIOSK),
  'Spanish <p> gate requires showTranslation AND non-blank English (no orphan Spanish)')

// ── Preserved DAB.10g deterministic layout ───────────────────────
section('DAB.10g deterministic layout preserved')

assert(!/new ResizeObserver\(/.test(KIOSK),
  'no `new ResizeObserver(` (feedback loop still absent)')
assert(!/useLayoutEffect/.test(KIOSK),
  'no useLayoutEffect')
assert(/const heaviness =/.test(KIOSK),
  'heaviness score still drives fitMode')

// ── Preserved DAB.10f.3 no transform ─────────────────────────────
section('DAB.10f.3 no transform preserved')

const innerBlock = KIOSK_CSS.match(/\n\.boardBarsInner \{([\s\S]{0,3000}?)\n\}/)?.[1] ?? ''
assert(!/transform:/.test(innerBlock),
  '.boardBarsInner uses no transform')

// ── Preserved DAB.10g.1 typography ratios ────────────────────────
section('DAB.10g.1 typography ratios preserved')

assert(/--board-name-size:\s+clamp\(/.test(KIOSK_CSS),
  '--board-name-size on .boardBars')
assert(/--board-job-size:\s+calc\(var\(--board-name-size\) \* 0\.6667\)/.test(KIOSK_CSS),
  '--board-job-size = --board-name-size × 0.6667')
assert(/--board-note-size:\s+calc\(var\(--board-name-size\) \* 0\.625\)/.test(KIOSK_CSS),
  '--board-note-size = --board-name-size × 0.625')

// ── Mobile preserved ─────────────────────────────────────────────
section('Mobile behavior preserved')

// isMobile = 1 column, no fit scaling, natural scroll.
assert(/const boardColumns = viewport\.isMobile \? 1/.test(KIOSK),
  'mobile still 1 column')
assert(/Phase DAB\.10e\.1 — Mobile scroll regression fix/.test(KIOSK_CSS),
  'mobile .rootBoard release preserved')

// ── Chrome 79 compatibility ──────────────────────────────────────
section('Chrome 79 / Chromebit compatibility preserved')

assert(!/^\s*line-clamp:/m.test(KIOSK_CSS),
  'no unprefixed line-clamp')
// SQL LOWER + TRIM — supported in every SQLite version D1 has ever
// shipped with. calc(), CSS vars, clamp() all Chrome 49-79+ safe.

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
  assert(!src.includes('Phase DAB.10j'),
    `${path} carries no Phase DAB.10j edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
