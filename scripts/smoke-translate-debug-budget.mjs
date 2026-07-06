// Phase DAB.10k.1 — Debug-mode assignment slot guarantee smoke.
//
//   node scripts/smoke-translate-debug-budget.mjs
//
// Problem this pins the fix for:
//   Before DAB.10k.1, POST /api/admin/translate/run?debug=1 cloned
//   env with TRANSLATE_MAX_PER_RUN=1 and called runAutoTranslateSweep.
//   The sweep computed:
//     const budget = min(parseInt('1'), 500) = 1
//     const asn = await sweepAssignments(env, Math.floor(1 * 0.6))
//                                               = Math.floor(0.6)
//                                               = 0
//   sweepAssignments's `if (budget <= 0) return { scanned: 0 … }`
//   short-circuit fired, no SELECT executed, no AI call happened,
//   and the diagnostic `attempts` array came back empty. The debug
//   endpoint was structurally incapable of surfacing the failure it
//   was supposed to diagnose.
//
// Fix:
//   runAutoTranslateSweep(env, opts = {}) accepts { debug: true }.
//   When debug is true the assignments budget is forced to 1,
//   regardless of the 60/20/20 split arithmetic. Daily notes + alerts
//   continue to use their existing bounded allocations. Cron behavior
//   is unchanged because cron never passes opts.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const AT  = readFileSync('worker/lib/autoTranslate.js', 'utf8')
const IDX = readFileSync('worker/index.js',              'utf8')

// ── No new migration ─────────────────────────────────────────────
section('Frontend/no-migration guard')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (DAB.10k.1 adds no schema changes)')

// ── Signature widened ────────────────────────────────────────────
section('runAutoTranslateSweep signature accepts opts')

assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env,\s*opts\s*=\s*\{\}\)/.test(AT),
  'runAutoTranslateSweep(env, opts = {}) exported')

// Debug flag extracted at top of function.
assert(/const debug = Boolean\(opts\?\.debug\)/.test(AT),
  'debug = Boolean(opts?.debug) extracted at top of runAutoTranslateSweep')

// ── Assignment budget: debug forces 1, else the 60% split ────────
section('assignmentBudget: debug → 1, else Math.floor(budget * 0.6)')

assert(/const assignmentBudget = debug \? 1 : Math\.floor\(budget \* 0\.6\)/.test(AT),
  'assignmentBudget = debug ? 1 : Math.floor(budget * 0.6) — DAB.10k.1 targeted fix')

// sweepAssignments call now uses the derived value.
assert(/const asn = await sweepAssignments\(env, assignmentBudget\)/.test(AT),
  'sweepAssignments called with assignmentBudget (not raw Math.floor(...))')

// Negative pin — the raw arithmetic must no longer flow directly
// into the call. This proves the routing goes through the debug
// override.
assert(!/await sweepAssignments\(env, Math\.floor\(budget \* 0\.6\)\)/.test(AT),
  'raw Math.floor(budget * 0.6) no longer flows directly into sweepAssignments (DAB.10k.1)')

// ── Cron path: no opts, so debug === false, so 60% split holds ──
section('Cron allocation unchanged')

// worker/index.js scheduled() handler still calls with (env) only.
const scheduledMatch = IDX.match(/async scheduled\(event, env, ctx\) \{[\s\S]*?\n  \},/)
const scheduledSrc = scheduledMatch ? scheduledMatch[0] : ''
assert(scheduledSrc.length > 0, "scheduled() handler body parsed")
assert(/runAutoTranslateSweep\(env\)/.test(scheduledSrc),
  'scheduled() invokes runAutoTranslateSweep(env) — no opts, cron uses 60% split unchanged')

// Negative — scheduled() must NOT pass { debug: true }.
assert(!/scheduled\(event, env, ctx\) \{[\s\S]*?runAutoTranslateSweep\(env,\s*\{[\s\S]*?debug/.test(IDX),
  'scheduled() does NOT pass { debug: true } — cron is not a diagnostic caller')

// ── Manual endpoint: debug path passes { debug: true } ───────────
section('Manual endpoint ?debug=1 passes { debug: true }')

const adminMatch = IDX.match(/if \(pathname === '\/api\/admin\/translate\/run' && method === 'POST'\) \{[\s\S]*?\n  \}/)
const adminSrc = adminMatch ? adminMatch[0] : ''
assert(adminSrc.length > 0, "admin /translate/run handler body parsed")

// Debug branch guaranteed to reach an assignment slot.
assert(/if \(debug\) \{[\s\S]*?runAutoTranslateSweep\(debugEnv,\s*\{\s*debug:\s*true\s*\}\)/.test(adminSrc),
  '?debug=1 branch: runAutoTranslateSweep(debugEnv, { debug: true }) — forces assignment slot')

// Trigger label overwritten so the client sees 'manual' not 'cron'.
assert(/summary\.trigger = 'manual'/.test(adminSrc),
  "admin handler overwrites summary.trigger = 'manual' (audit clarity)")

// Non-debug non-dryRun manual run also gets trigger overwritten.
const manualNonDebugSection = adminSrc.match(/const summary = await runAutoTranslateSweep\(env\)\s*\n\s*summary\.trigger = 'manual'/)
assert(manualNonDebugSection != null,
  'non-debug manual run also marks summary.trigger = manual')

// Dry-run path unchanged — no debug flag passed (kill-switched env
// short-circuits at provider-none-killswitch before the budget
// arithmetic matters).
assert(/if \(dryRun\) \{[\s\S]*?runAutoTranslateSweep\(fakeEnv\)/.test(adminSrc),
  'dryRun path unchanged: runAutoTranslateSweep(fakeEnv) with no opts (kill-switch short-circuit protects it)')

// ── Diagnostics envelope unchanged ───────────────────────────────
section('Debug response envelope unchanged (still safe)')

assert(/diagnostics:\s*\{\s*\n\s*provider:\s*env\.TRANSLATE_PROVIDER \?\? 'none',\s*\n\s*model:\s*env\.TRANSLATE_MODEL\s*\?\?\s*null,\s*\n\s*attempts,/.test(adminSrc),
  'debug response still returns { provider, model, attempts } — no source/translated text')

// ── DAB.10k reason-code buckets preserved ────────────────────────
section('DAB.10k reason-code instrumentation preserved')

for (const reasonKey of [
  'empty_provider_result',
  'provider_error',
  'update_not_applied',
  'identical_to_source',
  'write_failed',
]) {
  assert(new RegExp(`reasons\\.${reasonKey}(?:\\+\\+|:)`).test(AT),
    `reasons.${reasonKey} still initialized + incremented (DAB.10k preserved)`)
}

// Assignments return shape still exposes reasons.
assert(/return \{ scanned: results\?\.length \?\? 0, translated, failed, reasons \}/.test(AT),
  'sweepAssignments still returns { scanned, translated, failed, reasons }')

// ── Per-row error handling preserved ─────────────────────────────
section('Per-row error handling preserved')

assert(/for \(const row of results \?\? \[\]\) \{[\s\S]{0,3000}try \{[\s\S]{0,3000}\} catch \(err\) \{/.test(AT),
  'sweepAssignments per-row try/catch still wraps translateText + UPDATE')

// ── Top-level summary carries debug flag ─────────────────────────
section('Summary echoes debug flag')

assert(/const summary = \{[\s\S]{0,500}debug,/.test(AT),
  'summary echoes back debug flag (audit)')

// ── No note contents leak anywhere ───────────────────────────────
section('No note contents in diagnostics or logs')

// The attempts buffer at env.__lastTranslateAttempts already excludes
// source/translated text by construction (see worker/lib/translate.js).
// Verify the failure log we added in DAB.10k still logs id only.
assert(/console\.warn\('\[TurfIntel Translate\] row failed', \{\s*\n\s*id: row\.id,\s*\n\s*message: err\?\.message \?\? String\(err\),\s*\n\s*\}\)/.test(AT),
  'row failure log carries only { id, message } — no note contents')

// No console.log includes row.notes or row.notes_es directly.
assert(!/console\.(log|warn|error)\([^)]*row\.notes[^)]*\)/.test(AT),
  'no console.* call references row.notes directly (defense against future edits)')

// ── Cross-vertical guards ────────────────────────────────────────
section('Cross-vertical guards — Display Board / DAB editor untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10k.1'),
    `${path} carries no Phase DAB.10k.1 edits (debug-budget fix is worker-only)`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
