// Phase 9C.5c3c — Workers AI response-parsing smoke.
//
//   node scripts/smoke-translate-response-parsing.mjs
//
// Live data showed the cron sweep was finding rows (assignmentsScanned:
// 1) but translating zero (assignmentsTranslated: 0). Root cause: the
// 9C.5c3 parser only checked `response.response` and
// `response.choices[0].message.content`. Workers AI llama-instruct
// runtime can return the text under several other shapes (`result`,
// `text`, `output`, `output_text`, primitive string, etc.), and the
// silent-null path meant translations were dropped instead of cached
// into the *_es columns.
//
// 9C.5c3c factors the parsing into an exported `extractAiText(result)`
// helper that walks every known shape in priority order. This smoke
// exercises that helper as a pure function — no env.AI needed.

import { readFileSync, readdirSync } from 'fs'
import { extractAiText, getTranslateProvider, translateText } from '../worker/lib/translate.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const TR  = readFileSync('worker/lib/translate.js',         'utf8')
const AT  = readFileSync('worker/lib/autoTranslate.js',     'utf8')
const IDX = readFileSync('worker/index.js',                 'utf8')

// ── extractAiText export shape ─────────────────────────────────────────
section('extractAiText — exported + signature')

assert(typeof extractAiText === 'function',
  'extractAiText is exported from worker/lib/translate.js')

assert(/export\s+function\s+extractAiText\(result\)/.test(TR),
  'extractAiText(result) is declared as an exported named function')

// ── Documented Workers AI shapes ───────────────────────────────────────
section('extractAiText — documented Workers AI response shapes')

// Primitive string passes through (some routes hand the text back raw).
assert(extractAiText('Hola, mundo') === 'Hola, mundo',
  'primitive string is returned trimmed')

// llama-instruct canonical shape: { response: string }
assert(extractAiText({ response: 'Cortar greens 1-9' }) === 'Cortar greens 1-9',
  'extracts result.response (canonical Workers AI llama-instruct shape)')

// { text: string } — some runtimes
assert(extractAiText({ text: 'Cortar greens' }) === 'Cortar greens',
  'extracts result.text')

// { result: string } and { result: { response: string } }
assert(extractAiText({ result: 'Cortar greens' }) === 'Cortar greens',
  'extracts result.result when it is a primitive string')
assert(extractAiText({ result: { response: 'Cortar greens' } }) === 'Cortar greens',
  'extracts result.result.response (nested wrapper variant)')

// { output: string } and { output_text: string }
assert(extractAiText({ output: 'Cortar greens' }) === 'Cortar greens',
  'extracts result.output')
assert(extractAiText({ output_text: 'Cortar greens' }) === 'Cortar greens',
  'extracts result.output_text')

// OpenAI-style { choices: [{ message: { content: string } }] }
assert(extractAiText({ choices: [{ message: { content: 'Cortar greens' } }] }) === 'Cortar greens',
  'extracts result.choices[0].message.content (OpenAI-mirror runtimes)')

// Mixed: real Workers AI sometimes wraps in { result: { response: ... } }
// alongside choices[]; canonical `response` should win on priority.
assert(extractAiText({ response: 'WIN', choices: [{ message: { content: 'LOSE' } }] }) === 'WIN',
  'priority: response wins over choices[0].message.content when both present')

// ── Failure modes — return null cleanly ────────────────────────────────
section('extractAiText — null/empty/garbage returns null')

assert(extractAiText(null) === null,
  'null result → null')
assert(extractAiText(undefined) === null,
  'undefined result → null')
assert(extractAiText('') === null,
  'empty string → null')
assert(extractAiText('   \n\t  ') === null,
  'whitespace-only string → null')
assert(extractAiText({}) === null,
  'empty object → null')
assert(extractAiText({ unrelated_key: 42 }) === null,
  'object with only unknown keys → null')
assert(extractAiText(123) === null,
  'numeric primitive → null (no known shape)')
assert(extractAiText([]) === null,
  'empty array → null')

// ── Cleanup: stray quotes / markdown / whitespace ──────────────────────
section('extractAiText — cleans stray quotes and markdown')

assert(extractAiText({ response: '"Cortar greens"' }) === 'Cortar greens',
  'strips surrounding double quotes')
assert(extractAiText({ response: "'Cortar greens'" }) === 'Cortar greens',
  'strips surrounding single quotes')
assert(extractAiText({ response: '`Cortar greens`' }) === 'Cortar greens',
  'strips surrounding backticks')
assert(extractAiText({ response: '   Cortar greens   ' }) === 'Cortar greens',
  'trims leading / trailing whitespace')
assert(extractAiText({ response: '```\nCortar greens\n```' }) === 'Cortar greens',
  'strips triple-backtick code fence (no language tag)')
assert(extractAiText({ response: '```spanish\nCortar greens\n```' }) === 'Cortar greens',
  'strips triple-backtick code fence with language tag')

// ── cf-ai provider integration ─────────────────────────────────────────
section('cf-ai provider — messages payload + prompt fallback + extractAiText')

// Phase 9C.5c3d — Two attempts in order: messages, then prompt.
assert(/messages:\s*\[\s*\n?\s*\{\s*role:\s*['"]system['"],\s*content:/.test(TR),
  'cf-ai provider attempts messages: [{ role: "system", ... }, { role: "user", ... }] payload')

// Phase 9C.5c3d — Prompt fallback when messages returns null.
assert(/prompt:\s*composed/.test(TR) || /prompt:\s*[`"'][\s\S]{0,200}TURF_SYSTEM_PROMPT/.test(TR),
  'cf-ai provider falls back to a composed prompt payload when messages returns no usable text')

// Both attempts route through the shared runAiCall helper that uses
// extractAiText AND records the attempt into the diagnostics buffer.
assert(/async function runAiCall\(env,\s*model,\s*mode,\s*payload/.test(TR),
  'runAiCall(env, model, mode, payload, sourcePrefix, attempts) helper defined')
assert(/extractAiText\(response\)/.test(TR),
  'runAiCall parses the env.AI.run response via extractAiText(response)')

// Both attempts use the same model env.TRANSLATE_MODEL.
// Phase 9C.5c3e — fallback model updated after Cloudflare deprecated
// @cf/meta/llama-3-8b-instruct on 2026-05-30 (error 5028). The
// fallback is now its drop-in successor @cf/meta/llama-3.1-8b-instruct.
assert(/env\.TRANSLATE_MODEL\s*\|\|\s*['"]@cf\/meta\/llama-3\.1-8b-instruct['"]/.test(TR),
  'model resolved from env.TRANSLATE_MODEL with @cf/meta/llama-3.1-8b-instruct fallback')
// Negative guard — the deprecated fallback must not silently come back.
// We only check that the deprecated literal is NOT used as a code
// fallback (after `||`); historical comments mentioning it remain fine.
assert(!/env\.TRANSLATE_MODEL\s*\|\|\s*['"]@cf\/meta\/llama-3-8b-instruct['"]/.test(TR),
  'translate.js fallback model is NOT the deprecated @cf/meta/llama-3-8b-instruct')

// Source text never leaks into the attempts buffer.
assert(!/attempts\.push\(\{[\s\S]{0,200}(sourcePrefix|trimmed|text)\s*[,}]/.test(TR),
  'attempts buffer entries do NOT carry source text fields')

// translateText returns null on blank/failed result — via the 'none'
// provider, which the helper's contract guarantees returns null.
const noneEnv = { TRANSLATE_PROVIDER: 'none' }
const noneOut = await translateText(noneEnv, 'Mow greens 1-9', { from: 'en', to: 'es' })
assert(noneOut === null,
  "translateText returns null when TRANSLATE_PROVIDER is 'none' (kill-switch contract)")

// translateText returns null when text is empty regardless of provider.
const emptyOut = await translateText(noneEnv, '', { from: 'en', to: 'es' })
assert(emptyOut === null,
  'translateText returns null on empty input text')

// translateText handles non-EN→ES pairs by returning null (until a
// future phase adds more prompt variants).
const wrongPair = await translateText(noneEnv, 'hello', { from: 'fr', to: 'de' })
assert(wrongPair === null,
  'translateText returns null for non-EN→ES pairs')

// getTranslateProvider with a missing env.AI binding falls back to no-op.
const missingAi = getTranslateProvider({ TRANSLATE_PROVIDER: 'cf-ai' /* no AI */ })
assert(typeof missingAi.translate === 'function',
  'cf-ai provider with missing env.AI still returns a translate() function')
const missingOut = await missingAi.translate('hello')
assert(missingOut === null,
  'cf-ai provider with missing env.AI returns null (graceful no-op)')

// ── Failure logging never leaks private fields ────────────────────────
section('Failure logging — no private employee fields referenced')

// Strip comments before scanning so the documentation block at the top
// of translate.js doesn't false-positive on terms like "private".
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}
const TR_CODE = stripComments(TR)
for (const privateField of ['payRate', 'emergencyContact', 'pesticideLicense',
                            'pay_rate', 'emergency_contact', 'pesticide_license',
                            'hireDate', 'hire_date']) {
  assert(!new RegExp(`\\b${privateField}\\b`).test(TR_CODE),
    `translate.js CODE does not reference private field '${privateField}'`)
}
// crew_employees admin notes column.
assert(!/\bcrew_employees\.notes\b/.test(TR_CODE),
  'translate.js CODE does not reference crew_employees.notes')

// ── autoTranslate sweep unchanged except provider call ────────────────
section('worker/lib/autoTranslate.js — sweep logic unchanged')

assert(!AT.includes('Phase 9C.5c3c'),
  'autoTranslate.js carries no Phase 9C.5c3c edits (translation logic shared, sweep unchanged)')

assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env\)/.test(AT),
  'runAutoTranslateSweep still exported (regression)')
// Phase 9C.7a — 9C.5c3a's calendar_events JOIN was replaced by an
// employee-opt-in JOIN. The sweep is still defined and reachable; we
// just check the post-9C.7a shape now.
assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  '9C.7a: assignment sweep LEFT JOINs crew_employees (employee opt-in gate)')

// ── Manual trigger route from 9C.5c3b remains ─────────────────────────
section('worker/index.js — manual trigger route preserved')

assert(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]/.test(IDX),
  '9C.5c3b: POST /api/admin/translate/run route preserved')
assert(/actorHasPermission\(actor,\s*['"]canSystemSettings['"]\)/.test(IDX),
  '9C.5c3b: canSystemSettings auth gate preserved on the manual trigger')

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[4-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0053 (0053_employee_schedule_overrides accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Provider config / kiosk render unchanged ──────────────────────────
section('Provider config + kiosk render unchanged')

const wrangler = readFileSync('wrangler.jsonc', 'utf8')
assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(wrangler),
  'wrangler.jsonc still configures TRANSLATE_PROVIDER: "cf-ai"')
assert(/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*\}/.test(wrangler),
  'wrangler.jsonc still binds env.AI')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'worker/api/crew.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c3c'),
    `${path} carries no Phase 9C.5c3c edits (parser-only sub-phase)`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
