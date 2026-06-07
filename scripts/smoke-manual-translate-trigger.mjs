// Phase 9C.5c3b — Manual translation sweep trigger smoke.
//
//   node scripts/smoke-manual-translate-trigger.mjs
//
// Adds an authenticated owner_admin endpoint that fires the same sweep
// the 30-min cron runs (worker/lib/autoTranslate.js#runAutoTranslateSweep).
//
// Auth model:
//   1. The worker's mutation gate (lines ~330-345 of worker/index.js)
//      already enforces "valid session OR ADMIN_KEY" for every POST.
//      Anonymous public/no-login callers hit 401 before reaching the
//      handler.
//   2. The handler ADDITIONALLY requires canSystemSettings (owner_admin
//      only) so superintendents + below can't fire it. Translation
//      calls cost real money; this stays above the operational tier.
//   3. ADMIN_KEY maps to a synthetic owner_admin so cron / tooling
//      retain access.
//
// Optional ?dryRun=1 query param returns the would-translate row
// counts without spending neurons (by cloning env with
// TRANSLATE_PROVIDER='none' and letting the sweep's existing
// kill-switch short-circuit).

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const IDX = readFileSync('worker/index.js', 'utf8')
const AT  = readFileSync('worker/lib/autoTranslate.js', 'utf8')

// ── Route exists + POST-only ───────────────────────────────────────────
section('POST /api/admin/translate/run — route registered')

assert(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]/.test(IDX),
  "POST /api/admin/translate/run route is matched by exact pathname + method === 'POST'")

// Extract the route handler slice for the assertions below.
const handlerMatch = IDX.match(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]\s*\)\s*\{([\s\S]*?)\n\s{2}\}/)
const handlerSrc   = handlerMatch ? handlerMatch[1] : ''
assert(handlerSrc.length > 0, 'route handler body extracted')

// Non-POST methods on the same path are NOT separately handled, so they
// fall through to a 404. The smoke confirms there's no second pathname
// branch for the route that uses GET / PATCH / DELETE.
const otherMethodHandlers = (IDX.match(/pathname === ['"]\/api\/admin\/translate\/run['"]/g) ?? []).length
assert(otherMethodHandlers === 1,
  'only one pathname === "/api/admin/translate/run" branch exists (POST-only)')

// ── Auth gate — resolveActor + canSystemSettings ──────────────────────
section('Auth — resolveActor + canSystemSettings required')

assert(/const\s+actor\s*=\s*await\s+resolveActor\(request,\s*env\)/.test(handlerSrc),
  'handler resolves actor via resolveActor(request, env)')

assert(/if \(!actor\) return json\(\{\s*error:\s*['"]Unauthorized['"]\s*\},\s*401\)/.test(handlerSrc),
  'handler returns 401 when actor is null (anonymous callers)')

assert(/actorHasPermission\(actor,\s*['"]canSystemSettings['"]\)/.test(handlerSrc),
  "handler checks actorHasPermission(actor, 'canSystemSettings') — owner_admin only")

assert(/return json\(\{\s*error:[\s\S]{0,200}\}\,\s*403\)/.test(handlerSrc),
  'handler returns 403 when actor lacks canSystemSettings')

// ── Handler invokes the shared sweep ───────────────────────────────────
section('Handler invokes runAutoTranslateSweep — shared with cron')

assert(/runAutoTranslateSweep\(env\)/.test(handlerSrc) ||
       /runAutoTranslateSweep\(fakeEnv\)/.test(handlerSrc),
  'handler calls runAutoTranslateSweep(env) (or with a kill-switched env clone for dryRun)')

// ── JSON summary returned ──────────────────────────────────────────────
section('Returned JSON summary')

assert(/return json\(\{\s*ok:\s*true,[\s\S]{0,400}summary\s*\}\)/.test(handlerSrc),
  'handler returns json({ ok: true, summary })')

// ── Public/no-login cannot call this endpoint (mutation gate path) ────
section('Public/no-login callers blocked by mutation gate')

// The worker's pre-existing mutation gate handles every POST. We assert
// it still wraps the route below it by checking the gate exists and
// runs before any resource handlers.
assert(/if \(isMutation\(method\)\)\s*\{[\s\S]{0,400}return json\(\{\s*error:\s*keyCheck\.message\s*\}/.test(IDX),
  'mutation gate at top of handler returns 401 for anonymous POSTers (covers the new route)')

// The handler's own 401 belt-and-suspenders also fires if the gate
// is ever loosened. Both layers must hold.
assert(/if \(!actor\) return json\(\{\s*error:\s*['"]Unauthorized['"]\s*\},\s*401\)/.test(handlerSrc),
  'handler also returns 401 in its own resolveActor branch (defense in depth)')

// ── Optional ?dryRun=1 ─────────────────────────────────────────────────
section('Optional ?dryRun=1 query parameter')

assert(/url\.searchParams\.get\(['"]dryRun['"]\)\s*===\s*['"]1['"]/.test(handlerSrc),
  'handler reads url.searchParams.get("dryRun") === "1"')

assert(/TRANSLATE_PROVIDER:\s*['"]none['"]/.test(handlerSrc),
  'dryRun flips TRANSLATE_PROVIDER to "none" on an env clone (no provider calls)')

assert(/dryRun:\s*true,\s*summary/.test(handlerSrc),
  'dryRun response shape includes { dryRun: true, summary }')

// ── Phase 9C.5c3d — Optional ?debug=1 diagnostics endpoint ────────────
section('Optional ?debug=1 query parameter (Phase 9C.5c3d)')

assert(/url\.searchParams\.get\(['"]debug['"]\)\s*===\s*['"]1['"]/.test(handlerSrc),
  'handler reads url.searchParams.get("debug") === "1"')

// Debug mode clamps the sweep to one row so the attempts buffer is
// clean (one translate() call per request).
assert(/TRANSLATE_MAX_PER_RUN:\s*['"]1['"]/.test(handlerSrc),
  'debug mode runs the sweep with TRANSLATE_MAX_PER_RUN=1 (single-row diagnostic)')

// Debug response includes a diagnostics block with provider/model/attempts.
assert(/diagnostics:\s*\{[\s\S]{0,400}provider:[\s\S]{0,200}model:[\s\S]{0,200}attempts/.test(handlerSrc),
  'debug response includes diagnostics: { provider, model, attempts }')

// The attempts buffer is fetched from the translate module — never
// from the env or a request property — so it stays privacy-safe.
assert(/getLastTranslateAttempts\(debugEnv\)/.test(handlerSrc) ||
       /getLastTranslateAttempts\(env\)/.test(handlerSrc),
  'debug mode calls getLastTranslateAttempts(env) to fetch the attempts buffer')

// Debug mode is gated behind the same auth as the normal route — the
// permission check above runs before either dryRun or debug branches.
const permCheckIdx = handlerSrc.indexOf("actorHasPermission(actor, 'canSystemSettings')")
const debugBranchIdx = handlerSrc.indexOf("searchParams.get('debug')")
assert(permCheckIdx >= 0 && debugBranchIdx > permCheckIdx,
  'debug branch runs AFTER the canSystemSettings auth check (debug stays admin-only)')

// Diagnostics MUST NOT include source / translated text. We assert
// the debug branch does NOT read body / notes / source / text / title /
// message fields. Only provider, model, and attempts (which is built
// in worker/lib/translate.js without source content).
for (const leakyField of ['body.notes', 'row.notes', 'a.notes', 'sourceText', 'fullText']) {
  assert(!new RegExp(`diagnostics[\\s\\S]{0,200}\\b${leakyField.replace('.', '\\.')}\\b`).test(handlerSrc),
    `debug diagnostics does NOT include '${leakyField}'`)
}

// ── Cron handler still calls the same sweep (unchanged) ────────────────
section('Cron handler unchanged — still invokes runAutoTranslateSweep')

const scheduledMatch = IDX.match(/async scheduled\(event, env, ctx\)[\s\S]*?\n\s{2}\},/)
const scheduledSrc   = scheduledMatch ? scheduledMatch[0] : ''
assert(scheduledSrc.length > 0, 'scheduled() handler located')

assert(/runAutoTranslateSweep\(env\)/.test(scheduledSrc),
  'scheduled() still calls runAutoTranslateSweep(env)')

// Weather job preserved.
assert(/captureWeatherForAllCourses/.test(scheduledSrc),
  'scheduled() still calls captureWeatherForAllCourses (regression)')

// Independent ctx.waitUntil wrappers preserved.
assert(/ctx\.waitUntil\(\s*\n?\s*runAutoTranslateSweep/.test(scheduledSrc),
  'translation sweep still wrapped in its own ctx.waitUntil')

// ── autoTranslate.js carries no 9C.5c3b markers ────────────────────────
section('worker/lib/autoTranslate.js — untouched by 9C.5c3b')

assert(!AT.includes('Phase 9C.5c3b'),
  'worker/lib/autoTranslate.js carries no Phase 9C.5c3b edits (sweep logic shared, not rewritten)')

// ── Cross-file guards — 9C.5c3b is worker-routing only ────────────────
section('Cross-file guards — kiosk / Employee Mgmt / authoring untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/lib/translate.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c3b'),
    `${path} carries no Phase 9C.5c3b edits (route-only sub-phase)`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[2-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0051 (0051_task_templates accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Provider config unchanged ──────────────────────────────────────────
section('Provider config — wrangler.jsonc unchanged')

const wrangler = readFileSync('wrangler.jsonc', 'utf8')
assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(wrangler),
  'wrangler.jsonc still configures TRANSLATE_PROVIDER: "cf-ai" (regression)')
// Phase 9C.5c3e — Cloudflare deprecated @cf/meta/llama-3-8b-instruct on
// 2026-05-30. The active model is now its drop-in successor.
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.1-8b-instruct"/.test(wrangler),
  'wrangler.jsonc still configures TRANSLATE_MODEL: "@cf/meta/llama-3.1-8b-instruct" (regression)')
assert(!/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3-8b-instruct"/.test(wrangler),
  'wrangler.jsonc TRANSLATE_MODEL is NOT set to the deprecated @cf/meta/llama-3-8b-instruct')
assert(/"TRANSLATE_MAX_PER_RUN"\s*:\s*"\d+"/.test(wrangler),
  'wrangler.jsonc still configures TRANSLATE_MAX_PER_RUN (regression)')
assert(/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*\}/.test(wrangler),
  'wrangler.jsonc still binds env.AI (regression)')

// ── 9C.5a.5 + 9C.5c1 + 9C.5c3/c3a/c4 regression couples ───────────────
section('Earlier-phase regression couples')

const CREW = readFileSync('worker/api/crew.js', 'utf8')
assert(/function rowToEmployee\(row,\s*canViewPrivate/.test(CREW),
  '9C.5a.5: rowToEmployee(row, canViewPrivate) signature preserved')
assert(/autoTranslateBoardNotes:\s*row\.auto_translate_board_notes\s*===\s*1/.test(CREW),
  '9C.5c1: rowToEmployee still maps autoTranslateBoardNotes')

assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env\)/.test(AT),
  '9C.5c3: runAutoTranslateSweep still exported from worker/lib/autoTranslate.js')
// Phase 9C.7a — sweep no longer JOINs calendar_events; employee opt-in
// gate via crew_employees replaces date-scoping.
assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  '9C.7a: assignment sweep LEFT JOINs crew_employees (employee opt-in gate)')

const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(/function\s+employeeNeedsSpanish\(employee\)/.test(DB),
  '9C.5c4: employeeNeedsSpanish helper preserved in DisplayBoard.jsx')
assert(/const\s+boardNeedsSpanish\s*=\s*operatorCards\.some\(op\s*=>\s*op\.showSpanishNotes\)/.test(DB),
  '9C.5c4: boardNeedsSpanish derivation preserved')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
