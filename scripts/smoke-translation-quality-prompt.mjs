// Phase 9C.5c3f — Translation quality / prompt smoke.
//
//   node scripts/smoke-translation-quality-prompt.mjs
//
// Locks in the natural-Spanish guidance + example pairs added to the
// TURF_SYSTEM_PROMPT in worker/lib/translate.js. Prompt quality is the
// only knob between "understandable but stiff" Spanish (the
// pre-9C.5c3f baseline) and "what a real superintendent would say to
// the crew" output. The smoke pins the canonical examples and the
// glossary mappings so a future refactor doesn't accidentally strip
// the field-tested phrasing.
//
// Source-only — does not boot a server or call Workers AI.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const TR       = readFileSync('worker/lib/translate.js', 'utf8')
const WRANGLER = readFileSync('wrangler.jsonc',          'utf8')

// Pull the assembled system prompt as a single string for content checks.
// The constant is built from concatenated string literals, so we
// reassemble the body by stripping the JS-level "..' +" and quotes
// from the declaration block.
const promptDeclMatch = TR.match(/const TURF_SYSTEM_PROMPT\s*=([\s\S]*?)\n\n/)
const promptDecl      = promptDeclMatch ? promptDeclMatch[1] : ''
// Strip JS string-literal mechanics so the smoke can match the
// underlying prose. This is intentionally lenient — we want to assert
// what the model actually reads, not the source syntax.
const promptText = promptDecl
  .replace(/^\s*['"]/gm, '')          // leading quote on each line
  .replace(/['"]\s*\+\s*$/gm, '')     // trailing quote + "+"
  .replace(/['"]\s*$/gm, '')          // trailing quote on the last line
  .replace(/\\n/g, '\n')              // un-escape newlines
  .replace(/\\\\/g, '\\')             // un-escape backslashes

// ── Natural-Spanish style guidance ─────────────────────────────────────
section('Prompt — natural Latin American / Mexican crew Spanish guidance')

assert(/natural Latin American/i.test(promptText) || /Latin American/i.test(promptText),
  'prompt mentions Latin American Spanish')
assert(/Mexican crew Spanish/i.test(promptText) || /Mexican/i.test(promptText),
  'prompt mentions Mexican crew Spanish')

assert(/superintendent/i.test(promptText),
  'prompt frames the speaker as a golf course superintendent')
assert(/maintenance crew/i.test(promptText) || /crew/i.test(promptText),
  'prompt frames the audience as the maintenance crew')

// Explicit anti-literal guidance. The promptText reassembly preserves
// the artificial `\n` line-wraps from the source string-concat, so we
// allow whitespace (including newlines) between adjacent words.
assert(/NOT\s+translate\s+word-for-word/i.test(promptText) ||
       /do\s+not\s+translate\s+word-for-word/i.test(promptText),
  'prompt explicitly tells the model NOT to translate word-for-word')

assert(/simple and direct/i.test(promptText),
  'prompt asks for simple, direct phrasing')

// ── Glossary — terms kept in English ───────────────────────────────────
section('Prompt — turf / golf glossary (kept in English)')

for (const term of ['greens', 'fairway', 'tee', 'bunker', 'rough', 'REI', 'cart path']) {
  assert(new RegExp(`\\b${term}\\b`).test(promptText),
    `prompt glossary keeps '${term}' in English`)
}

// ── Verb mappings ──────────────────────────────────────────────────────
section('Prompt — verb mappings crews actually use')

for (const [en, es] of [
  ['mow',        'corta'],
  ['roll',       'rueda'],
  ['blow',       'sopla'],
  ['hand water', 'riega a mano'],
  ['irrigate',   'riega'],
]) {
  // Allow the mapping to appear in any column layout; we just confirm
  // both halves are present in proximity.
  assert(new RegExp(`${en}[\\s\\S]{0,40}${es}`, 'i').test(promptText),
    `prompt maps "${en}" → "${es}"`)
}

// ── Phrasing notes for non-literal patterns ────────────────────────────
section('Prompt — phrasing notes for non-literal patterns')

assert(/par 3/i.test(promptText) && /el par 3/i.test(promptText),
  "prompt gives 'par 3' phrasing guidance (prefers 'el par 3' over 'lado del par 3')")
assert(/NOT.*lado del par 3/i.test(promptText) ||
       /lado del par 3/i.test(promptText),
  "prompt explicitly mentions the 'lado del par 3' anti-pattern")

assert(/campo de campeonato/i.test(promptText),
  "prompt teaches 'championship course' → 'campo de campeonato'")

assert(/áreas secas del green/i.test(promptText),
  "prompt teaches 'dry spots on N green' → 'áreas secas del green N'")

assert(/la basura de los tees/i.test(promptText),
  "prompt teaches 'debris off tees' → 'la basura de los tees'")

// ── Canonical example pairs (the four the user specified) ─────────────
section('Prompt — canonical English↔Spanish example pairs')

const examples = [
  {
    en: 'Mow par 3 side then the championship course.',
    es: 'Corta el par 3 y después el campo de campeonato.',
  },
  {
    en: 'Roll greens and follow the mowers.',
    es: 'Pasa el rodillo en los greens y sigue a los que están cortando.',
  },
  {
    en: 'Hand water dry spots on 7 green.',
    es: 'Riega a mano las áreas secas del green 7.',
  },
  {
    en: 'Blow debris off tees.',
    es: 'Sopla la basura de los tees.',
  },
]
for (const { en, es } of examples) {
  assert(promptText.includes(en),
    `prompt includes English example: "${en}"`)
  assert(promptText.includes(es),
    `prompt includes Spanish example: "${es}"`)
  // English and Spanish for each example should appear in proximity
  // so the model reads them as a pair, not isolated tokens.
  const pairRegex = new RegExp(
    en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]{0,200}' +
    es.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  assert(pairRegex.test(promptText),
    `English/Spanish pair "${en.slice(0, 30)}…" appears together in the prompt`)
}

// ── Output discipline ──────────────────────────────────────────────────
section('Prompt — output discipline (Spanish only, no markdown, no explanations)')

assert(/Spanish only/i.test(promptText),
  'prompt says "Spanish only"')
// promptText preserves the artificial `\n` line-wraps from the source
// string-concat, so use [\s\S] (any char including newline) instead of
// `.` for cross-line matches.
assert(/Do not add explanations/i.test(promptText) ||
       /No explanations/i.test(promptText),
  'prompt forbids explanations')
assert(/no markdown/i.test(promptText) || /Do not[\s\S]{0,80}markdown/i.test(promptText),
  'prompt forbids markdown')
assert(/no[\s\S]{0,80}prefixes/i.test(promptText) || /Do not add[\s\S]{0,80}prefixes/i.test(promptText),
  'prompt forbids prefixes')
assert(/no[\s\S]{0,80}quotes/i.test(promptText) || /Do not add[\s\S]{0,80}quotes/i.test(promptText),
  'prompt forbids surrounding quotes')

// ── Both payload modes use the system prompt ──────────────────────────
section('Both messages + prompt payloads use TURF_SYSTEM_PROMPT')

// messages payload — system role carries the prompt.
assert(/messages:\s*\[\s*\n?\s*\{\s*role:\s*['"]system['"],\s*content:\s*TURF_SYSTEM_PROMPT/.test(TR),
  'messages payload uses { role: "system", content: TURF_SYSTEM_PROMPT }')

// prompt fallback — composed string starts with the system prompt.
assert(/prompt:\s*composed/.test(TR),
  'prompt-payload fallback uses the composed prompt variable')
assert(/composed\s*=\s*`\$\{TURF_SYSTEM_PROMPT\}/.test(TR),
  'composed prompt begins with `${TURF_SYSTEM_PROMPT}` (system prompt prefix)')

// ── Model unchanged from Phase 9C.5c3e ─────────────────────────────────
section('Model unchanged — still @cf/meta/llama-3.1-8b-instruct (9C.5c3e successor)')

assert(/env\.TRANSLATE_MODEL\s*\|\|\s*['"]@cf\/meta\/llama-3\.1-8b-instruct['"]/.test(TR),
  'translate.js fallback model is still @cf/meta/llama-3.1-8b-instruct')
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.1-8b-instruct"/.test(WRANGLER),
  'wrangler.jsonc TRANSLATE_MODEL is still @cf/meta/llama-3.1-8b-instruct')
assert(!/env\.TRANSLATE_MODEL\s*\|\|\s*['"]@cf\/meta\/llama-3-8b-instruct['"]/.test(TR),
  'deprecated @cf/meta/llama-3-8b-instruct fallback is NOT re-introduced')

// ── Manual override protection — still in autoTranslate sweep ─────────
section('Manual override protection — race-safe UPDATE guards preserved')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/UPDATE crew_assignments[\s\S]{0,400}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'crew_assignments UPDATE still guarded by notes_es IS NULL OR TRIM = ""')
assert(/UPDATE operations_daily_notes[\s\S]{0,400}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'operations_daily_notes title_es UPDATE still guarded')
assert(/UPDATE operations_daily_notes[\s\S]{0,400}\(body_es IS NULL OR TRIM\(body_es\) = ''\)/.test(AT),
  'operations_daily_notes body_es UPDATE still guarded')
assert(/UPDATE alerts[\s\S]{0,400}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'alerts title_es UPDATE still guarded')
assert(/UPDATE alerts[\s\S]{0,400}\(message_es IS NULL OR TRIM\(message_es\) = ''\)/.test(AT),
  'alerts message_es UPDATE still guarded')

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[1-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no new migration past 0050 (found: ${newMigrations.join(', ') || 'none'})`)

// ── Cross-file guards — prompt-only sub-phase ──────────────────────────
section('Cross-file guards — kiosk / Employee Mgmt / auth / cron untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/autoTranslate.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c3f'),
    `${path} carries no Phase 9C.5c3f edits (prompt-only sub-phase)`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
