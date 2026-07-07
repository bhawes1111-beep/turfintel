// Phase SPR.3a — Spray Application step-by-step wizard smoke.
//
//   node scripts/smoke-spray-application-wizard.mjs
//
// Pins that the New Application form was restructured into a
// four-step wizard while preserving:
//   • the single localStorage draft key + draft shape
//   • the single commit handler (createSpray + inventory + REI + calendar)
//   • the single BuildSpraySheet mount in Spray.jsx
//   • permission gating (canEditSprays)
//   • all existing S.3 / S.5a.x / S.5b.x / S.5c.x field bindings
//   • no worker / migration / product-catalog / store / permission churn.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const BUILD = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const CSS   = readFileSync('src/pages/Spray/Spray.module.css',         'utf8')
const SP    = readFileSync('src/pages/Spray/Spray.jsx',                'utf8')

// ── No D1 migration / no worker churn ─────────────────────────────
section('No D1 migration / no worker churn')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase SPR.3a'),
    `${path} carries no Phase SPR.3a edits`)
}

// ── Wizard step constant ──────────────────────────────────────────
section('SPRAY_WIZARD_STEPS — four steps, correct labels + ids')

assert(/export const SPRAY_WIZARD_STEPS = \[/.test(BUILD),
  'SPRAY_WIZARD_STEPS constant exported')

for (const s of [
  ["'where'",      'Where & When'],
  ["'mix'",        'Tank Mix'],
  ["'conditions'", 'Conditions'],
  ["'review'",     'Review & Save'],
]) {
  const [id, label] = s
  const re = new RegExp(`id:\\s*${id}[^}]*label:\\s*'${label.replace(/&/g, '\\&')}'`)
  assert(re.test(BUILD),
    `SPRAY_WIZARD_STEPS entry: ${id} → '${label}'`)
}

// Four steps exactly.
const stepsMatch = BUILD.match(/export const SPRAY_WIZARD_STEPS = \[([\s\S]*?)\]/)
const stepsBody  = stepsMatch ? stepsMatch[1] : ''
const stepCount  = (stepsBody.match(/id:\s*'/g) ?? []).length
assert(stepCount === 4,
  `SPRAY_WIZARD_STEPS has exactly 4 entries (found ${stepCount})`)

// resolveInitialWizardStep helper.
assert(/function resolveInitialWizardStep\(candidate\)/.test(BUILD),
  'resolveInitialWizardStep(candidate) helper declared')
assert(/if \(!candidate\) return SPRAY_WIZARD_STEPS\[0\]\.id/.test(BUILD),
  "resolveInitialWizardStep: falsy candidate → SPRAY_WIZARD_STEPS[0].id ('where')")

// Default landing = where.
assert(/useState\(\(\) => resolveInitialWizardStep\('where'\)\)/.test(BUILD),
  "wizardStep default = resolveInitialWizardStep('where')")

// ── Step body markers ─────────────────────────────────────────────
section('Each step renders its own body via data-step marker')

for (const step of ['where', 'mix', 'conditions', 'review']) {
  const re = new RegExp(`currentStepId === '${step}' &&[\\s\\S]{0,300}data-step="${step}"`)
  assert(re.test(BUILD),
    `Step '${step}' body renders under currentStepId === '${step}' with data-step="${step}"`)
}

// ── Step 1 — Where & When contains application metadata ───────────
section("Step 1 — 'Where & When' contains application metadata")

const step1Match = BUILD.match(/data-step="where">([\s\S]*?)\)\}\s*\n\s*\{\/\* ── Step 2/)
const step1Src   = step1Match ? step1Match[1] : ''
assert(step1Src.length > 0, 'Step 1 body extracted')
for (const label of ['Date', 'Area treated', 'Acres', 'Operator', 'Spray rig']) {
  assert(new RegExp(`<Field label="${label}"`).test(step1Src),
    `Step 1 primary field: ${label}`)
}
// Progressive disclosure hides advanced fields.
assert(/showMoreWhere/.test(step1Src),
  'Step 1 gates advanced fields behind showMoreWhere disclosure')
assert(/<Field label="Start time">/.test(step1Src) && /<Field label="End time">/.test(step1Src),
  'Step 1 disclosure includes Start time + End time')
assert(/<Field label="Applicator license #">/.test(step1Src),
  'Step 1 disclosure includes Applicator license #')
assert(/<Field label="Tank capacity \(gal\)">/.test(step1Src),
  'Step 1 disclosure includes Tank capacity (gal)')
assert(/<Field label="Target treatment"/.test(step1Src),
  'Step 1 disclosure includes Target treatment')

// ── Step 2 — Tank Mix contains existing tank-mix controls ─────────
section("Step 2 — 'Tank Mix' contains existing product table + carrier controls")

const step2Match = BUILD.match(/data-step="mix">([\s\S]*?)\)\}\s*\n\s*\{\/\* ── Step 3/)
const step2Src   = step2Match ? step2Match[1] : ''
assert(step2Src.length > 0, 'Step 2 body extracted')
assert(/<Field label="Carrier rate">/.test(step2Src),
  'Step 2 contains Carrier rate field')
assert(/<Field label="Carrier unit">/.test(step2Src),
  'Step 2 contains Carrier unit field')
assert(/<table className=\{styles\.naProductTable\}>/.test(step2Src),
  'Step 2 contains the product table (naProductTable)')
assert(/\+ Add product/.test(step2Src),
  'Step 2 keeps the "+ Add product" button')
assert(/<LoadPlanPanel/.test(step2Src),
  'Step 2 keeps the LoadPlanPanel')

// ── Step 3 — Conditions contains existing weather fields ──────────
section("Step 3 — 'Conditions' contains weather fields, no auto-populate")

const step3Match = BUILD.match(/data-step="conditions">([\s\S]*?)\)\}\s*\n\s*\{\/\* ── Step 4/)
const step3Src   = step3Match ? step3Match[1] : ''
assert(step3Src.length > 0, 'Step 3 body extracted')
for (const label of ['Temperature (°F)', 'Wind speed (mph)', 'Wind direction', 'Humidity (%)']) {
  const escaped = label.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  assert(new RegExp(`<Field label="${escaped}"`).test(step3Src),
    `Step 3 primary field: ${label}`)
}
// Additional conditions disclosure.
assert(/showMoreConditions/.test(step3Src),
  'Step 3 gates additional fields behind showMoreConditions disclosure')
assert(/<Field label="Soil temperature \(°F\)">/.test(step3Src),
  'Step 3 disclosure includes Soil temperature (°F) — S.5b.1 field preserved')
assert(/<Field label="Wind \/ conditions notes"/.test(step3Src),
  'Step 3 disclosure includes Wind / conditions notes — S.5b.1 field preserved')
assert(/<textarea[\s\S]{0,200}className=\{styles\.naObservations\}/.test(step3Src),
  'Step 3 disclosure includes Observations textarea')

// SPR.3a is explicit: no weather auto-populate in this phase.
assert(!/useWeather\(/.test(BUILD),
  'no useWeather() hook wired (SPR.3b will introduce weather auto-populate, not SPR.3a)')
assert(!/getForecast\(|fetchWeather\(|autoPopulateWeather\(/.test(BUILD),
  'no weather-auto-populate helper called in SPR.3a')

// ── Step 4 — Review & Save is read-only summary ──────────────────
section("Step 4 — 'Review & Save' is a read-only summary")

const step4Match = BUILD.match(/data-step="review">([\s\S]*?)<\/div>\s*\n\s*\)\}\s*\n\s*<\/div>/)
const step4Src   = step4Match ? step4Match[1] : ''
assert(step4Src.length > 0, 'Step 4 body extracted')
assert(/<SprayReviewSummary/.test(step4Src),
  'Step 4 renders <SprayReviewSummary>')

// The review helper must NOT re-run calculations — it only reads.
const reviewFnMatch = BUILD.match(/function SprayReviewSummary\([\s\S]*?\n\}\s*\n\s*function ReviewCard/)
const reviewFnSrc   = reviewFnMatch ? reviewFnMatch[0] : ''
assert(reviewFnSrc.length > 0, 'SprayReviewSummary function body extracted')
assert(!/computeQty\(|computeCarrierGal\(|planLoadOut\(|convertToInventoryUnit\(/.test(reviewFnSrc),
  'SprayReviewSummary does NOT re-run compute helpers — reads existing derived summary')
assert(!/createSpray\(|recordInventoryUsage\(|createAlert\(|createCalendarEvent\(/.test(reviewFnSrc),
  'SprayReviewSummary does NOT invoke commit-pipeline helpers')

// Review renders the four card groups (Application / Tank mix / Conditions / Warnings).
for (const title of ['Application', 'Tank mix', 'Conditions', 'Warnings & inventory impact']) {
  const escaped = title.replace(/&/g, '\\&')
  assert(new RegExp(`title="${escaped}"`).test(reviewFnSrc),
    `Review renders card: ${title}`)
}

// ── Wizard progress indicator ────────────────────────────────────
section('Wizard progress indicator — SprayWizardProgress')

assert(/function SprayWizardProgress\(/.test(BUILD),
  'SprayWizardProgress component defined')
assert(/aria-current=\{isCurrent \? 'step' : undefined\}/.test(BUILD),
  'progress step gets aria-current="step" when active')
assert(/role="tablist"/.test(BUILD),
  'progress indicator uses role="tablist" for accessibility')
assert(/data-state=\{state\}/.test(BUILD),
  'progress step exposes data-state="current" / "complete" / "future"')
// Future steps must not be clickable via the progress rail (validation
// runs via Continue).
assert(/const clickable = isPast \|\| isCurrent/.test(BUILD),
  'progress step: only past + current steps are clickable (future must go through Continue)')

// CSS classes exist.
for (const cls of [
  '.naWizardProgress',
  '.naWizardStep',
  '.naWizardStepNum',
  '.naWizardStepLabel',
]) {
  assert(new RegExp(cls.replace('.', '\\.') + '\\s*\\{').test(CSS),
    `CSS rule defined: ${cls}`)
}

// ── Sticky wizard action bar ─────────────────────────────────────
section('Sticky wizard action bar — Back / Continue / Save & Log Spray')

assert(/function SprayWizardActions\(/.test(BUILD),
  'SprayWizardActions component defined')
assert(/\.naWizardActionBar\s*\{[\s\S]{0,400}position:\s*sticky/.test(CSS),
  'action bar CSS is position: sticky')
assert(/\.naWizardActionBar\s*\{[\s\S]{0,400}bottom:\s*0/.test(CSS),
  'action bar CSS is bottom: 0 (docks to viewport bottom)')
assert(/env\(safe-area-inset-bottom/.test(CSS),
  'action bar respects mobile safe-area-inset-bottom')

// Button label change: Commit Application → Save & Log Spray.
assert(/>\s*\{committing \? 'Saving…' : 'Save & Log Spray'\}\s*</.test(BUILD),
  "primary CTA relabeled 'Commit Application' → 'Save & Log Spray' (label only)")
assert(!/>Commit Application</.test(BUILD),
  "no 'Commit Application' JSX text remains (relabel enforced)")

// Back button hidden on first step.
assert(/const isFirst\s*=\s*currentStepIndex === 0/.test(BUILD),
  'first-step check declared')
assert(/!isFirst && \(\s*\n\s*<button[\s\S]{0,200}onBack/.test(BUILD),
  'Back button hidden on first step')

// Continue only on non-review steps.
assert(/isLast \? \(\s*\n\s*<button[\s\S]{0,400}naCommitBtn[\s\S]{0,400}\) : \(\s*\n\s*<button[\s\S]{0,400}onContinue/.test(BUILD),
  'Continue vs Save & Log Spray toggle keyed on isLast')

// More actions menu contains template + clear.
assert(/>\s*Save as Template\s*<\/button>/.test(BUILD),
  "'Save as Template' rename present (was: Save as Planned Spray)")
assert(/>\s*Load Template\s*<\/button>/.test(BUILD),
  "'Load Template' rename present (was: Load Planned Spray)")
assert(/>\s*Clear Form\s*<\/button>/.test(BUILD),
  "'Clear Form' rename present (was: Discard draft)")
assert(!/>Discard draft</.test(BUILD),
  "no 'Discard draft' JSX text remains (relabel enforced)")

// Draft-saved hint relabel.
assert(/`Saved to this device at/.test(BUILD),
  "'Saved to this device at HH:MM AM' — SPR.3a relabel of 'Draft saved locally at …'")

// ── Step navigation preserves shared draft state ──────────────────
section('Step navigation preserves ONE shared draft (no per-step state)')

// There must be exactly one useState for draft.
const draftUseStateCount = (BUILD.match(/const \[draft, setDraft\] = useState\(/g) ?? []).length
assert(draftUseStateCount === 1,
  `exactly one useState for draft (found ${draftUseStateCount})`)

// Wizard step is kept OUT of the draft object.
assert(!/wizardStep:\s/.test(BUILD),
  'draft object does NOT carry a wizardStep field (wizard position is UI-only)')

// Draft key unchanged.
assert(/const DRAFT_KEY = 'turfintel:spray-draft-v1'/.test(BUILD),
  'localStorage DRAFT_KEY unchanged: turfintel:spray-draft-v1')

// Focus management on step change.
assert(/stepHeadingRef\.current\?\.focus/.test(BUILD),
  'focus moves to step heading on step change (accessibility)')

// ── Step 1 validation blocks Continue when required fields missing ─
section('Step 1 validation — missing operator/area/acres blocks Continue')

const step1IssuesMatch = BUILD.match(/const step1Issues = useMemo\(\(\) => \{[\s\S]*?\n\s{2}\}, \[draft\.operator, draft\.area, draft\.acres\]\)/)
const step1IssuesSrc   = step1IssuesMatch ? step1IssuesMatch[0] : ''
assert(step1IssuesSrc.length > 0, 'step1Issues helper extracted')
assert(/if \(!draft\.operator\?\.trim\(\)\) issues\.push\('Operator is required'\)/.test(step1IssuesSrc),
  'step1 issue: Operator required')
assert(/if \(!draft\.area\)\s*issues\.push\('Area treated is required'\)/.test(step1IssuesSrc),
  'step1 issue: Area treated required')
assert(/if \(!\(Number\(draft\.acres\) > 0\)\)\s*issues\.push\('Acres must be greater than zero'\)/.test(step1IssuesSrc),
  'step1 issue: Acres > 0 required')

// ── Step 2 validation blocks Continue when product incomplete ─────
section('Step 2 validation — incomplete product row blocks Continue')

const step2IssuesMatch = BUILD.match(/const step2Issues = useMemo\(\(\) => \{[\s\S]*?\n\s{2}\}, \[enrichedRows\]\)/)
const step2IssuesSrc   = step2IssuesMatch ? step2IssuesMatch[0] : ''
assert(step2IssuesSrc.length > 0, 'step2Issues helper extracted')
assert(/enrichedRows\.length === 0[\s\S]{0,300}Add at least one product/.test(step2IssuesSrc),
  'step2 issue: at least one product required')
assert(/!r\.name\?\.trim\(\) \|\| !\(Number\(r\.rate\) > 0\) \|\| !r\.rateUnit/.test(step2IssuesSrc),
  'step2 issue: each row needs product + rate + rate unit')

// ── Step 3 has no required fields ─────────────────────────────────
section('Step 3 — Conditions never blocks Continue (all optional today)')

assert(/const step3Issues = useMemo\(\(\) => \[\], \[\]\)/.test(BUILD),
  'step3Issues is an empty array (Conditions has no required fields today)')

// ── Final commit still authoritative + payload unchanged ──────────
section('Final commit — handleCommit unchanged (payload / calcs / inventory)')

const commitMatch = BUILD.match(/async function handleCommit\(\)\s*\{[\s\S]*?\n\s{2}\}/)
const commitSrc   = commitMatch ? commitMatch[0] : ''
assert(commitSrc.length > 0, 'handleCommit body extracted')

// Final validation lives in commit path (regression couples from S.3 / S.5b.1).
assert(/if \(!draft\.operator\)\s*\{\s*toast\.info\('Operator is required'\); return \}/.test(commitSrc),
  'handleCommit still enforces operator required at commit time (final authority)')
assert(/if \(!draft\.area\)\s*\{\s*toast\.info\('Area treated is required'\); return \}/.test(commitSrc),
  'handleCommit still enforces area required at commit time')
assert(/if \(enrichedRows\.length === 0\)\s*\{\s*toast\.info\('Add at least one product'\); return \}/.test(commitSrc),
  'handleCommit still enforces ≥1 product at commit time')

// Commit payload construction: existing keys preserved.
for (const key of [
  'endTime:\\s*draft\\.endTime \\|\\| null',
  "status:\\s*'completed'",
  'applicatorLicense:',
  'productCatalogId:',
  'activeIngredientsSnapshot:',
  'productCostSnapshot:',
  'productCostUnitSnapshot:',
  'totalCostSnapshot:',
  'soilTemp:\\s*draft\\.conditions\\.soilTemp',
]) {
  assert(new RegExp(key).test(commitSrc),
    `commit payload preserves: ${key}`)
}

// Commit pipeline still fires createSpray → deductions → calendar → alert.
assert(/await createSpray\(payload\)/.test(commitSrc),
  'commit pipeline still calls createSpray')
assert(/recordInventoryUsage\(\{/.test(commitSrc),
  'commit pipeline still calls recordInventoryUsage per row')
assert(/createCalendarEvent\(\{/.test(commitSrc),
  'commit pipeline still creates a calendar event')
assert(/createAlert\(\{/.test(commitSrc),
  'commit pipeline still creates the REI alert when summary.maxRei > 0')

// Product eligibility whitelist unchanged.
assert(/useSprayProductOptions\(\)/.test(BUILD),
  'BuildSpraySheet still uses shared useSprayProductOptions() whitelist')
assert(/mapInventoryItemToProductRow\(inv\)/.test(BUILD),
  'BuildSpraySheet still uses shared mapInventoryItemToProductRow() mapper')

// Rate + carrier helpers unchanged.
for (const helper of ['computeQty', 'convertToInventoryUnit', 'computeCarrierGal', 'planLoadOut']) {
  assert(new RegExp(`function ${helper}\\(`).test(BUILD),
    `helper untouched: ${helper}()`)
}

// ── Permission gates preserved ────────────────────────────────────
section('Permission gates — canEditSprays enforced on commit + templates')

assert(/const canEditSprays = can\('canEditSprays'\)/.test(BUILD),
  "BuildSpraySheet still checks can('canEditSprays')")
assert(/const commitDisabled = committing \|\| !hasRows \|\| !canEditSprays/.test(BUILD),
  "Save & Log Spray disable rule: committing || !hasRows || !canEditSprays")

// clearDraft handler unchanged — not gated by permission.
const clearFn = BUILD.match(/function clearDraft\(\)\s*\{[\s\S]*?\n\s{2}\}/)
const clearSrc = clearFn ? clearFn[0] : ''
assert(!/canEditSprays/.test(clearSrc),
  'clearDraft() still ungated (local-state operation)')

// ── Single BuildSpraySheet mount site remains ─────────────────────
section('Single production BuildSpraySheet mount in Spray.jsx')

const mountCount = (SP.match(/<BuildSpraySheet\s*\/>/g) ?? []).length
assert(mountCount === 1,
  `Spray.jsx mounts exactly one <BuildSpraySheet /> (found ${mountCount})`)

// New Application tab still mounts it.
assert(/activeTab === 'New Application' && <BuildSpraySheet \/>/.test(SP),
  "New Application tab still mounts <BuildSpraySheet />")

// ── Draft persistence untouched ───────────────────────────────────
section('Draft persistence — key + debounce + restore unchanged')

// Restore path.
assert(/const raw = localStorage\.getItem\(DRAFT_KEY\)/.test(BUILD),
  'draft restore reads DRAFT_KEY from localStorage')
// Debounce.
assert(/setTimeout\(\(\) => \{[\s\S]{0,400}localStorage\.setItem\(DRAFT_KEY[\s\S]{0,400}\}, 600\)/.test(BUILD),
  'draft autosave debounce unchanged (600ms)')

// ── Scope guards ──────────────────────────────────────────────────
section('Cross-vertical guards — DAB / kiosk / non-Spray surfaces untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase SPR.3a'),   'DAB carries no Phase SPR.3a edits')
assert(!KIOSK.includes('Phase SPR.3a'), 'kiosk carries no Phase SPR.3a edits')

// Other Spray tab files — SPR.3a is scoped to BuildSpraySheet + CSS + Spray.jsx (untouched).
for (const path of [
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Spray/tabs/SaveAsProgramModal.jsx',
  'src/pages/Spray/tabs/LoadProgramModal.jsx',
  'src/utils/sprays/spraysStore.js',
  'src/utils/inventory/inventoryStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase SPR.3a'),
    `${path} carries no Phase SPR.3a edits`)
}

// Spray.jsx itself: SPR.3a doesn't touch it either.
assert(!SP.includes('Phase SPR.3a'),
  'Spray.jsx carries no Phase SPR.3a edits (SPR.2 unified nav preserved)')

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
