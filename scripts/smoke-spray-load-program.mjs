// Phase S.5b.3 — Load Spray Program into Builder smoke.
//
//   node scripts/smoke-spray-load-program.mjs
//
// Pins:
//   • New LoadProgramModal component + signature.
//   • Modal lists programs from useSprayPrograms() and previews items
//     via listSprayProgramItems (existing store API — no new endpoint).
//   • Modal NEVER calls createSpray / patchSpray / recordInventoryUsage
//     / createAlert / createCalendarEvent / spray-program mutators
//     / product catalog write helpers.
//   • Builder handler maps program items to builder rows preserving
//     productCatalogId + inventoryItemId + productName + rateValue +
//     rateUnit. Suggestions (area / date / carrier) are applied
//     only when the corresponding builder field is blank.
//   • Append vs replace logic — replace overwrites rows, append
//     concatenates.
//   • All earlier S.5* regressions hold (Save as Program, draft
//     indicator, end time, soil temp, wind label, Records exports,
//     edit modal, commit pipeline).

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const MODAL    = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',        'utf8')
const BUILD    = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',         'utf8')
const SAVE_AS  = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx',      'utf8')
const STORE    = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js',     'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',            'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                             'utf8')
const PROG_W   = readFileSync('worker/api/sprayPrograms.js',                      'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                     'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',                'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',                 'utf8')

const MODAL_CODE = stripComments(MODAL)
const BUILD_CODE = stripComments(BUILD)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── LoadProgramModal — component shape ──────────────────────────────
section('LoadProgramModal — component + signature + accessibility')

assert(/export default function LoadProgramModal\(\{\s*\n?\s*draftHasContent,\s*\n?\s*onClose,\s*\n?\s*onLoad,\s*\n?\s*\}\)/.test(MODAL),
  'LoadProgramModal exported with ({ draftHasContent, onClose, onLoad }) signature')

assert(/role="dialog"/.test(MODAL),
  'modal has role="dialog"')
assert(/aria-modal="true"/.test(MODAL),
  'modal has aria-modal="true"')
// Phase S.6b — user-facing "Spray Program" → "Planned Spray".
assert(/aria-label="Load saved planned spray"/.test(MODAL),
  'modal has aria-label="Load saved planned spray" (S.6b rename)')
assert(/<h2 className=\{styles\.modalTitle\}>Load Planned Spray<\/h2>/.test(MODAL),
  'modal title reads "Load Planned Spray" (S.6b rename)')
assert(/does not create a record, deduct inventory, or fire alerts/i.test(MODAL),
  'modal subtitle clarifies "does not create a record, deduct inventory, or fire alerts"')
assert(/if \(e\.key === 'Escape' && !busy\) onClose\(\)/.test(MODAL),
  'Escape key closes modal when not busy')

// ── Modal reads from existing store hooks only ──────────────────────
section('Modal reads from existing spray program store (no new endpoint)')

assert(/import \{\s*\n?\s*useSprayPrograms,\s*\n?\s*listSprayProgramItems,\s*\n?\s*refreshSprayPrograms,\s*\n?\s*\} from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(MODAL),
  'modal imports useSprayPrograms + listSprayProgramItems + refreshSprayPrograms from existing store')

assert(/const \{ programs, itemsByProgramId \} = useSprayPrograms\(\)/.test(MODAL),
  'modal destructures { programs, itemsByProgramId } from useSprayPrograms()')

// On open: refresh once + lazy-fetch items for selected program.
assert(/useEffect\(\(\) => \{ refreshSprayPrograms\(\) \}, \[\]\)/.test(MODAL),
  'modal calls refreshSprayPrograms() once on mount')
assert(/listSprayProgramItems\(selectedId\)/.test(MODAL),
  'modal lazy-fetches items for selectedId via listSprayProgramItems')
assert(/if \(itemsByProgramId\[selectedId\]\) return/.test(MODAL),
  'modal short-circuits the lazy fetch when items already cached')

// ── Filters + list rendering ────────────────────────────────────────
section('Filters + list rendering')

assert(/const STATUS_OPTIONS = \['All', 'active', 'draft', 'archived'\]/.test(MODAL),
  'STATUS_OPTIONS includes All / active / draft / archived')
// Phase S.6b — "Search saved programs" → "Search saved planned sprays".
assert(/aria-label="Search saved planned sprays"/.test(MODAL),
  'search input has aria-label')
assert(/aria-label="Filter by status"/.test(MODAL),
  'status filter has aria-label')

// Filtered list useMemo.
const filtMatch = MODAL.match(/const visiblePrograms = useMemo\(\(\) => \{([\s\S]*?)\}, \[programs, search, statusFilter\]\)/)
assert(filtMatch != null, 'visiblePrograms useMemo defined with [programs, search, statusFilter] deps')
const filtSrc = filtMatch ? filtMatch[1] : ''
assert(/statusFilter === 'All' \|\| p\.status === statusFilter/.test(filtSrc),
  'filter pipeline honors statusFilter (All passes through)')
assert(/\(p\.name \?\? ''\)\.toLowerCase\(\)\.includes\(q\)/.test(filtSrc),
  'filter pipeline searches by program name (case-insensitive)')

// Per-row renders name + status + notes + row count + source.
assert(/<strong>\{p\.name \?\? '\(unnamed\)'\}<\/strong>/.test(MODAL),
  'list row renders program name with fallback')
assert(/className=\{styles\.loadProgramRowStatus\}>\{p\.status \?\? '—'\}/.test(MODAL),
  'list row renders status pill')

// ── Preview pane ────────────────────────────────────────────────────
section('Preview — selected program items')

assert(/className=\{styles\.loadProgramPreview\}/.test(MODAL),
  'preview pane has its own class')

// Per-item preview reads productName + rate + targetArea + plannedStartDate + catalogId.
for (const fragment of [
  /it\.productName \?\? '\(unnamed\)'/,
  /it\.rateValue != null/,
  /it\.rateUnit/,
  /it\.targetArea/,
  /it\.plannedStartDate/,
  /it\.productCatalogId/,
]) {
  assert(fragment.test(MODAL),
    `preview row reads existing item field: ${fragment}`)
}

// Empty / loading states.
// Phase S.6b — preview copy uses "planned spray".
assert(/Select a planned spray on the left to preview its product rows\./.test(MODAL),
  'preview empty state reads "Select a planned spray on the left..." (S.6b rename)')
assert(/Loading planned spray rows…/.test(MODAL),
  'preview loading state reads "Loading planned spray rows…" (S.6b rename)')

// Replace warning shows only when draftHasContent.
assert(/draftHasContent && \(\s*\n\s*<p className=\{styles\.loadProgramReplaceWarn\}/.test(MODAL),
  'replace warning renders only when draftHasContent is true')

// ── Builder row mapping ─────────────────────────────────────────────
section('buildBuilderRow — maps program item → builder row')

assert(/function buildBuilderRow\(item, idx\)/.test(MODAL),
  'buildBuilderRow(item, idx) helper defined')

const mapMatch = MODAL.match(/function buildBuilderRow\(item, idx\)\s*\{[\s\S]*?\n  \}/)
const mapSrc   = mapMatch ? mapMatch[0] : ''
assert(mapSrc.length > 0, 'buildBuilderRow body extracted')

for (const pin of [
  ['inventoryItemId:\\s*item\\.inventoryItemId', 'preserves inventoryItemId'],
  ['productCatalogId:\\s*item\\.productCatalogId', 'preserves productCatalogId'],
  ['name:\\s*item\\.productName', 'maps item.productName → row.name'],
  ['rateUnit:\\s*item\\.rateUnit', 'maps item.rateUnit → row.rateUnit'],
  ['Number\\.isFinite\\(item\\.rateValue\\)', 'guards rateValue numeric conversion'],
]) {
  const [re, label] = pin
  assert(new RegExp(re).test(mapSrc),
    `buildBuilderRow ${label}`)
}

// Negative pin — mapper never echoes snapshot fields (programs don't
// have them, but defense-in-depth catches a future regression).
for (const snap of [
  'epaNumberSnapshot',
  'activeIngredientsSnapshot',
  'productCostSnapshot',
  'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(mapSrc),
    `buildBuilderRow does NOT echo ${snap}`)
}

// ── Append / replace flow + suggestions ─────────────────────────────
section('handleLoad — emits mode + rows + suggestions to onLoad')

const handleMatch = MODAL.match(/async function handleLoad\(mode\)\s*\{[\s\S]*?\n  \}/)
const handleSrc   = handleMatch ? handleMatch[0] : ''
assert(handleSrc.length > 0, 'handleLoad body extracted')

assert(/if \(selectedItems\.length === 0\)/.test(handleSrc),
  'handleLoad guards on empty selectedItems')
assert(/onLoad\?\.\(\{[\s\S]{0,800}mode,[\s\S]{0,800}rows:\s*newRows/.test(handleSrc),
  'handleLoad calls onLoad({ mode, rows, ... })')
assert(/suggestedArea:/.test(handleSrc),
  'handleLoad includes suggestedArea')
assert(/suggestedDate:/.test(handleSrc),
  'handleLoad includes suggestedDate')
assert(/suggestedCarrierRate:/.test(handleSrc),
  'handleLoad includes suggestedCarrierRate')
assert(/suggestedCarrierUnit:/.test(handleSrc),
  'handleLoad includes suggestedCarrierUnit')

assert(/toast\.success\(`Loaded "\$\{selectedProgram\.name\}" into builder\.`\)/.test(handleSrc),
  'handleLoad fires success toast naming the loaded program')

// Footer button choices flip based on draftHasContent.
assert(/draftHasContent \? \(\s*\n\s*<>[\s\S]{0,800}Append rows[\s\S]{0,800}Replace draft rows/.test(MODAL),
  'footer offers Append + Replace when draft has content')
assert(/Load into builder/.test(MODAL),
  'footer uses "Load into builder" label when draft is empty')

// ── Negative pins — modal never writes records/inventory/alerts ─────
section('Load flow MUST NOT cause record/inventory/alert side-effects')

for (const helper of [
  'createSpray',
  'patchSpray',
  'deleteSpray',
  'recordInventoryUsage',
  'createAlert',
  'createCalendarEvent',
  // Program mutators — loading is read-only.
  'createSprayProgram\\b',
  'updateSprayProgram\\b',
  'archiveSprayProgram\\b',
  'createSprayProgramItem',
  'updateSprayProgramItem',
  'deleteSprayProgramItem',
  'setProgramItemCompletedLink',
  // Product catalog writes.
  'createProductCatalog',
  'updateProductCatalog',
  'deleteProductCatalog',
]) {
  assert(!new RegExp(`\\b${helper}\\b`).test(MODAL_CODE),
    `modal does NOT call ${helper}`)
}

// ── BuildSpraySheet wiring ──────────────────────────────────────────
section('BuildSpraySheet — Load Program button + handler + modal mount')

assert(/import LoadProgramModal from '\.\/LoadProgramModal'/.test(BUILD),
  'BuildSpraySheet imports LoadProgramModal')

assert(/const \[loadProgramOpen, setLoadProgramOpen\] = useState\(false\)/.test(BUILD),
  'loadProgramOpen state defined via useState(false)')

assert(/function handleLoadProgramIntoDraft\(\{[\s\S]{0,200}\}\)/.test(BUILD),
  'handleLoadProgramIntoDraft handler defined')

// Capture handler body anchored on a returning brace pattern that
// closes the function (not the destructured parameter list).
const handlerMatch = BUILD.match(/function handleLoadProgramIntoDraft\([\s\S]*?\}\)\s*\{([\s\S]*?)\n  \}/)
const handlerSrc   = handlerMatch ? handlerMatch[1] : ''
assert(handlerSrc.length > 0, 'handleLoadProgramIntoDraft body extracted')

// Setter pattern — uses setDraft(prev => {...}) so no race with autosave.
assert(/setDraft\(prev => \{/.test(handlerSrc),
  'handler uses functional setDraft(prev => ...) form')

// Append vs replace.
assert(/mode === 'append'[\s\S]{0,200}\[\.\.\.prev\.rows, \.\.\.rows\]/.test(handlerSrc),
  'append mode concatenates: [...prev.rows, ...rows]')
assert(/:\s*rows[\s\S]{0,50}next = \{ \.\.\.prev, rows: nextRows \}/.test(handlerSrc),
  'replace mode (default) overwrites with rows')

// Suggestions applied ONLY when builder field is blank.
assert(/if \(suggestedArea && !prev\.area\)/.test(handlerSrc),
  'handler applies suggestedArea only when prev.area is blank')
assert(/if \(suggestedDate && !prev\.date\)/.test(handlerSrc),
  'handler applies suggestedDate only when prev.date is blank')
assert(/if \(suggestedCarrierRate && !prev\.carrierRate\)/.test(handlerSrc),
  'handler applies suggestedCarrierRate only when prev.carrierRate is blank')

// Handler never reaches for spray records / inventory / alerts.
const handlerCode = stripComments(handlerSrc)
for (const helper of [
  'createSpray', 'patchSpray', 'recordInventoryUsage',
  'createAlert', 'createCalendarEvent',
  'createSprayProgramItem', 'updateSprayProgramItem',
]) {
  assert(!new RegExp(`\\b${helper}\\b`).test(handlerCode),
    `handler does NOT call ${helper}`)
}

// Button rendered, wired, accessible.
assert(/<button[\s\S]{0,400}className=\{styles\.naLoadProgramBtn\}[\s\S]{0,400}onClick=\{\(\) => setLoadProgramOpen\(true\)\}/.test(BUILD),
  'Load Program button rendered + wires onClick')
assert(/Load Program/.test(BUILD),
  'button label reads "Load Program"')
// Disabled only while committing (NOT when empty draft — supervisor
// might want to "start from a program" on a fresh draft).
// Phase S.5a.2 extended the disabled rule with `|| !canEditSprays`.
assert(/onClick=\{\(\) => setLoadProgramOpen\(true\)\}[\s\S]{0,400}disabled=\{committing(?:\s*\|\| !canEditSprays)?\}/.test(BUILD),
  'Load Program button disabled while committing or when !canEditSprays (still available on empty draft for authorized users)')

// Modal mounts behind state.
assert(/\{loadProgramOpen && \(\s*\n\s*<LoadProgramModal/.test(BUILD),
  'LoadProgramModal mounts behind {loadProgramOpen && (…)}')
assert(/draftHasContent=\{draft\.rows\.length > 0\}/.test(BUILD),
  'LoadProgramModal receives draftHasContent from current draft')
assert(/onLoad=\{handleLoadProgramIntoDraft\}/.test(BUILD),
  'LoadProgramModal onLoad wired to handleLoadProgramIntoDraft')
assert(/onClose=\{\(\) => setLoadProgramOpen\(false\)\}/.test(BUILD),
  'LoadProgramModal onClose resets loadProgramOpen')

// CSS classes for the button + modal layout.
for (const cls of [
  'naLoadProgramBtn',
  'loadProgramFilters', 'loadProgramSearch', 'loadProgramStatusFilter',
  'loadProgramLayout', 'loadProgramList', 'loadProgramRow',
  'loadProgramRowName', 'loadProgramRowStatus', 'loadProgramRowNotes',
  'loadProgramRowMeta', 'loadProgramPreview', 'loadProgramReplaceWarn',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} rule defined`)
}

// Mobile breakpoint stacks the list/preview to single column.
assert(/@media \(max-width:\s*700px\)\s*\{[\s\S]{0,800}\.loadProgramLayout\s*\{\s*\n?\s*grid-template-columns:\s*1fr/.test(CSS),
  'mobile @media (max-width: 700px) collapses .loadProgramLayout to single column')

// ── S.5b.2 Save as Program preserved ────────────────────────────────
section('S.5b.2 Save as Program preserved (regression couple)')

assert(/<button[\s\S]{0,400}className=\{styles\.naSaveAsProgramBtn\}/.test(BUILD),
  'Save as Program button still rendered (S.5b.2)')
assert(/<SaveAsProgramModal/.test(BUILD),
  'SaveAsProgramModal still mounted (S.5b.2)')
// SaveAsProgramModal still uses createSprayProgram + createSprayProgramItem.
assert(/import \{\s*\n?\s*createSprayProgram,\s*\n?\s*createSprayProgramItem,\s*\n?\s*\} from '\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/sprayProgramStore'/.test(SAVE_AS),
  'SaveAsProgramModal still imports createSprayProgram + createSprayProgramItem')

// ── Commit pipeline regression (records/inventory still on Commit) ──
section('Builder commit pipeline preserved — record + inventory + alerts only on Commit')

assert(/await createSpray\(payload\)/.test(BUILD),
  'commit pipeline still calls createSpray (regression)')
assert(/recordInventoryUsage\(\{/.test(BUILD),
  'commit pipeline still calls recordInventoryUsage per product (regression)')
assert(/createAlert\(/.test(BUILD),
  'commit pipeline still creates REI alert (regression)')
assert(/createCalendarEvent\(/.test(BUILD),
  'commit pipeline still creates calendar event (regression)')

// ── S.5b.1 + S.5a.1 + S.5c.* regressions ───────────────────────────
section('Builder + Records features preserved (S.5a.1 / S.5b.1 / S.5c.*)')

assert(/const \[draftSavedAt, setDraftSavedAt\] = useState\(null\)/.test(BUILD),
  'draft saved indicator state still defined (S.5b.1)')
assert(/<Field label="End time">/.test(BUILD),
  'End time field still present (S.5b.1)')
assert(/<Field label="Soil temperature \(°F\)">/.test(BUILD),
  'Soil temperature field still present (S.5b.1)')
assert(/<Field label="Wind \/ conditions notes">/.test(BUILD),
  'Wind / conditions notes label still present (S.5b.1)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}/.test(RECORDS),
  'Export Compliance Packet button still rendered (S.5c.2)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportUsageBtn\}/.test(RECORDS),
  'Export Product Usage button still rendered (S.5c.3)')

// ── Scope guards ────────────────────────────────────────────────────
section('Scope guards — no worker / migration / catalog / store edits')

// Worker side unchanged.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.3'),
    `${path} carries no Phase S.5b.3 edits`)
}

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Existing worker spray-program endpoints still exported (positive
// regression — confirms no new endpoint added).
assert(/^export async function createSprayProgram\b/m.test(PROG_W),
  'worker createSprayProgram still exported (read-only modal does not call it)')
assert(/^export async function listSprayProgramItems\b/m.test(PROG_W),
  'worker listSprayProgramItems still exported (used by store via lazy fetch)')

// Permissions unchanged.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/sprays by canEditSprays")
assert(/\['\/api\/spray-programs',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/spray-programs by canEditSprays")

// Spray + program stores untouched by S.5b.3.
const SPRAY_STORE = readFileSync('src/utils/sprays/spraysStore.js', 'utf8')
assert(!SPRAY_STORE.includes('Phase S.5b.3'),
  'src/utils/sprays/spraysStore.js carries no Phase S.5b.3 edits')
assert(!STORE.includes('Phase S.5b.3'),
  'src/utils/sprayPrograms/sprayProgramStore.js carries no Phase S.5b.3 edits')

// Other spray surfaces untouched by S.5b.3.
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SaveAsProgramModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.3'),
    `${path} carries no Phase S.5b.3 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5b.3'),   'DAB carries no Phase S.5b.3 edits')
assert(!KIOSK.includes('Phase S.5b.3'), 'kiosk carries no Phase S.5b.3 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
