// Phase S.5a.2 — Permission-aware spray action visibility smoke.
//
//   node scripts/smoke-spray-permission-gating.mjs
//
// Pins:
//   • Both BuildSpraySheet + SprayRecords use the existing useAuth /
//     can('canEditSprays') pattern (no second permissions system).
//   • Commit Application + Save as Program + Load Program disable
//     when !canEditSprays (UX gate; worker is still the source of truth).
//   • Disabled buttons surface a "Spray edit permission required" title.
//   • Edit affordances on Records (per-row + detail-modal) hide
//     entirely when !canEditSprays (no view-only purpose).
//   • Export Compliance Packet / Export Product Usage / single-record
//     Generate Report remain visible — explicit "viewer-class" decision.
//   • Worker mutation rules unchanged.
//   • No migration, no calculation changes, no catalog writes.
//   • Authorized flows (Save / Load / Edit) still work end-to-end —
//     pinned via regression couples in the S.5a.1 / S.5b.2 / S.5b.3 smokes.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
} from '../worker/lib/mutationPermissions.js'
import { can as permsCan } from '../src/utils/auth/permissions.js'

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

const BUILD     = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',         'utf8')
const RECORDS   = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',            'utf8')
const WORKSPACE = readFileSync('src/pages/Spray/tabs/SprayWorkspace.jsx',          'utf8')
const SAVE_AS   = readFileSync('src/pages/Spray/tabs/SaveAsProgramModal.jsx',      'utf8')
const LOAD      = readFileSync('src/pages/Spray/tabs/LoadProgramModal.jsx',        'utf8')
const EDIT      = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx',    'utf8')
const SPRAY_SH  = readFileSync('src/pages/Spray/Spray.jsx',                        'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                             'utf8')
const PROG_W    = readFileSync('worker/api/sprayPrograms.js',                      'utf8')
const PC_W      = readFileSync('worker/api/productCatalog.js',                     'utf8')
const PERM      = readFileSync('worker/lib/mutationPermissions.js',                'utf8')
const AUTH_CTX  = readFileSync('src/context/AuthContext.jsx',                      'utf8')

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── Existing permission source: useAuth + canEditSprays ─────────────
section('Existing permission pattern reused (useAuth + can("canEditSprays"))')

// AuthContext still exports useAuth + per-call can(perm) helper.
assert(/export function useAuth\(\)/.test(AUTH_CTX),
  'AuthContext still exports useAuth() (regression couple)')
assert(/can:\s*\(perm\)\s*=>\s*permissions\[perm\]\s*===\s*true/.test(AUTH_CTX),
  'AuthContext still exposes can(perm) returning a boolean')

// canEditSprays is a documented permission key.
const PERMS_SRC = readFileSync('src/utils/auth/permissions.js', 'utf8')
assert(/['"]canEditSprays['"]/.test(PERMS_SRC),
  "'canEditSprays' is in the PERMISSION_KEYS table")

// Sanity — functional permissionsFor checks at runtime.
assert(permsCan({ role: 'superintendent' }, 'canEditSprays') === true,
  'permissions.can({role: superintendent}, "canEditSprays") === true')
assert(permsCan({ role: 'crew' }, 'canEditSprays') === false,
  'permissions.can({role: crew}, "canEditSprays") === false')

// BuildSpraySheet + SprayRecords use the existing useAuth pattern
// from AuthContext — no second permissions system invented.
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(BUILD),
  'BuildSpraySheet imports useAuth from existing AuthContext')
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(RECORDS),
  'SprayRecords imports useAuth from existing AuthContext')

assert(/const \{ can \} = useAuth\(\)/.test(BUILD),
  'BuildSpraySheet destructures { can } from useAuth() (matches sibling pages)')
assert(/const \{ can \}\s+= useAuth\(\)/.test(RECORDS),
  'SprayRecords destructures { can } from useAuth() (matches sibling pages)')

assert(/const canEditSprays = can\('canEditSprays'\)/.test(BUILD),
  'BuildSpraySheet checks can("canEditSprays") for UX gating')
assert(/const canEditSprays\s+= can\('canEditSprays'\)/.test(RECORDS),
  'SprayRecords checks can("canEditSprays") for UX gating')

// Negative pin — neither file invents a parallel permission key.
const BUILD_CODE   = stripComments(BUILD)
const RECORDS_CODE = stripComments(RECORDS)
for (const code of [BUILD_CODE, RECORDS_CODE]) {
  assert(!/can\(['"]canEditSpray['"]\)/.test(code),
    'no typo: never checks can("canEditSpray") (singular) instead of canEditSprays')
}

// ── BuildSpraySheet — Commit / Save / Load disabled gating ──────────
section('BuildSpraySheet — Commit / Save / Load disabled when !canEditSprays')

// Commit button — disabled rule extended with || !canEditSprays.
assert(/<button[\s\S]{0,400}className=\{styles\.naCommitBtn\}[\s\S]{0,400}disabled=\{committing \|\| enrichedRows\.length === 0 \|\| !canEditSprays\}/.test(BUILD),
  'Commit Application button disabled when !canEditSprays')
assert(/title=\{!canEditSprays \? 'Spray edit permission required' : undefined\}/.test(BUILD),
  'Commit button surfaces "Spray edit permission required" title when disabled')

// Save as Program button — disabled rule extended.
assert(/<button[\s\S]{0,400}className=\{styles\.naSaveAsProgramBtn\}[\s\S]{0,400}disabled=\{committing \|\| enrichedRows\.length === 0 \|\| !canEditSprays\}/.test(BUILD),
  'Save as Program button disabled when !canEditSprays')
// Save as Program title uses ternary to swap between permission warning and original tooltip.
// Phase S.6b — tooltip user-copy now says "planned spray" not "Spray Program".
assert(/title=\{!canEditSprays\s*\n?\s*\?\s*'Spray edit permission required'\s*\n?\s*:\s*'Save the current draft as a planned spray/.test(BUILD),
  'Save as Planned Spray title swaps to "Spray edit permission required" when disabled (S.6b copy)')

// Load Program button — disabled rule extended.
assert(/<button[\s\S]{0,400}className=\{styles\.naLoadProgramBtn\}[\s\S]{0,400}disabled=\{committing \|\| !canEditSprays\}/.test(BUILD),
  'Load Planned Spray button disabled when !canEditSprays (still available on empty draft for authorized users)')
assert(/title=\{!canEditSprays\s*\n?\s*\?\s*'Spray edit permission required'\s*\n?\s*:\s*'Load a planned spray into the builder/.test(BUILD),
  'Load Planned Spray title swaps to "Spray edit permission required" when disabled (S.6b copy)')

// Discard draft stays visible + ungated (local-state-only operation).
assert(/className=\{styles\.naSecondaryBtn\}[\s\S]{0,200}onClick=\{clearDraft\}/.test(BUILD),
  'Discard draft button still visible (local-state only — never gated)')
// Negative pin: clearDraft handler doesn't gain a canEditSprays check.
const clearMatch = BUILD.match(/function clearDraft\(\)\s*\{[\s\S]*?\n  \}/)
const clearSrc   = clearMatch ? clearMatch[0] : ''
assert(!/canEditSprays/.test(clearSrc),
  'clearDraft() helper does NOT reference canEditSprays (always allowed)')

// ── SprayRecords — Edit affordances hidden when !canEditSprays ──────
section('SprayRecords — Edit buttons hidden when !canEditSprays')

// Per-row Edit button wrapped in {canEditSprays && (...)}.
assert(/\{canEditSprays && \(\s*\n\s*<button[\s\S]{0,400}className=\{styles\.recordEditBtn\}/.test(RECORDS),
  'per-row Edit button wrapped in {canEditSprays && (...)} — hidden when no permission')

// Detail-modal Edit Record button wrapped in {canEditSprays && (...)}.
assert(/\{canEditSprays && \(\s*\n\s*<button\s*\n?\s*className="opActionBtn"\s*\n?\s*onClick=\{\(\) => \{ setEditing\(selected\); setSelected\(null\) \}\}/.test(RECORDS),
  'detail-modal Edit Record button wrapped in {canEditSprays && (...)}')

// ── Export buttons + Generate Report remain visible (viewer-class) ──
section('Exports + single-record Generate Report visible to viewers')

// Compliance Packet button — no canEditSprays gate.
const packetMatch = RECORDS.match(/<button[^>]*?className=\{styles\.exportPacketBtn\}[\s\S]{0,800}<\/button>/)
const packetSrc   = packetMatch ? packetMatch[0] : ''
assert(packetSrc.length > 0, 'Export Compliance Packet button block extracted')
assert(!/canEditSprays/.test(packetSrc),
  'Export Compliance Packet button is NOT gated by canEditSprays (read-only export, viewer-class)')

// Product Usage button — no canEditSprays gate.
const usageMatch = RECORDS.match(/<button[^>]*?className=\{styles\.exportUsageBtn\}[\s\S]{0,800}<\/button>/)
const usageSrc   = usageMatch ? usageMatch[0] : ''
assert(usageSrc.length > 0, 'Export Product Usage button block extracted')
assert(!/canEditSprays/.test(usageSrc),
  'Export Product Usage button is NOT gated by canEditSprays (read-only export, viewer-class)')

// Generate Report (detail modal) — still wired without permission gate.
assert(/onClick=\{\(\) => generateApplicationReport\(selected\)\}/.test(RECORDS),
  'Generate Report button still wired (no canEditSprays gate)')
// Confirm Generate Report has NO direct canEditSprays wrap. Look at
// the ~120 chars immediately preceding the onClick to catch a fresh
// {canEditSprays && (<button…)} wrapper if one is added later.
const reportPrelude = (() => {
  const idx = RECORDS.indexOf('generateApplicationReport(selected)')
  return idx >= 0 ? RECORDS.slice(Math.max(0, idx - 200), idx) : ''
})()
assert(!/\{canEditSprays && \(\s*\n?\s*<button[^>]*$/.test(reportPrelude.replace(/\n/g, ' ')),
  'Generate Report button is NOT immediately wrapped in {canEditSprays && (<button)}')

// ── Workspace quick actions remain visible (route to tabs only) ─────
section('SprayWorkspace quick actions — kept visible (route to tabs)')

assert(!WORKSPACE.includes('Phase S.5a.2'),
  'SprayWorkspace carries no Phase S.5a.2 edits (quick actions kept visible per spec)')
// Smoke confirms each quick action still calls go(<tab>) — route only.
// Phase S.6b — workspace navigateTab key renamed 'Programs' → 'Planned Sprays'.
for (const tab of ['Build Spray', 'Records', 'Planned Sprays', 'Calendar', 'Calculator']) {
  assert(new RegExp(`go\\(['"]${tab}['"]\\)`).test(WORKSPACE),
    `Workspace quick action still routes to ${tab} tab (no permission gate)`)
}

// ── Worker permission rules unchanged ───────────────────────────────
section('Worker mutation rules unchanged — server remains source of truth')

assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/sprays by canEditSprays")
assert(/\['\/api\/spray-programs',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/spray-programs by canEditSprays")
assert(/\['\/api\/spray-program-items',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/spray-program-items by canEditSprays")

// matchRule + isMutationAllowed still work as before.
assert(matchRule('/api/sprays/spray-abc-123') === 'canEditSprays',
  'matchRule("/api/sprays/<id>") === "canEditSprays"')
const SUPER = { role: 'superintendent' }
const CREW  = { role: 'crew' }
assert(isMutationAllowed(SUPER, '/api/sprays/spray-abc-123', 'PATCH') === true,
  'PATCH /api/sprays/:id allowed for superintendent (server-side regression)')
assert(isMutationAllowed(CREW, '/api/sprays/spray-abc-123', 'PATCH') === false,
  'PATCH /api/sprays/:id denied for crew (server-side regression)')
assert(isMutationAllowed(SUPER, '/api/spray-programs', 'POST') === true,
  'POST /api/spray-programs allowed for superintendent')
assert(isMutationAllowed(CREW, '/api/spray-programs', 'POST') === false,
  'POST /api/spray-programs denied for crew')

// ── Authorized flows still work end-to-end (regression couples) ─────
section('Authorized flows still wired (regression couples)')

// Edit modal still mounts behind editing state + calls patchSpray.
assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/\{editing && \(\s*\n\s*<EditSprayRecordModal/.test(RECORDS),
  'Edit modal still mounts behind {editing && (…)} (S.5a.1)')
assert(/await patchSpray\(record\.id, payload\)/.test(EDIT),
  'Edit modal save still calls patchSpray() (S.5a.1)')

// SaveAsProgramModal still uses program-write helpers.
assert(/createSprayProgram[\s\S]{0,400}createSprayProgramItem/.test(SAVE_AS),
  'SaveAsProgramModal still imports + uses createSprayProgram + createSprayProgramItem (S.5b.2)')

// LoadProgramModal still uses listSprayProgramItems (read-only) +
// useSprayPrograms hook.
assert(/listSprayProgramItems/.test(LOAD),
  'LoadProgramModal still uses listSprayProgramItems (S.5b.3)')
assert(/useSprayPrograms/.test(LOAD),
  'LoadProgramModal still uses useSprayPrograms (S.5b.3)')

// Builder commit pipeline unchanged.
assert(/await createSpray\(payload\)/.test(BUILD),
  'commit pipeline still calls createSpray (regression)')
assert(/recordInventoryUsage\(\{/.test(BUILD),
  'commit pipeline still calls recordInventoryUsage (regression)')
assert(/createAlert\(/.test(BUILD),
  'commit pipeline still creates REI alert (regression)')
assert(/createCalendarEvent\(/.test(BUILD),
  'commit pipeline still creates calendar event (regression)')

// ── Scope guards — no worker / migration / catalog / calc changes ──
section('Scope guards — no worker / migration / catalog / calc changes')

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
  assert(!src.includes('Phase S.5a.2'),
    `${path} carries no Phase S.5a.2 edits`)
}

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Builder calculation logic untouched — enrichedRows still derived.
assert(/const enrichedRows = useMemo/.test(BUILD),
  'builder enrichedRows useMemo still defined (no calc changes)')

// EditSprayRecordModal still has its snapshot-exclusion guarantee.
const payloadMatch = EDIT.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
for (const snap of [
  'epaNumberSnapshot', 'activeIngredientsSnapshot',
  'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `edit modal buildPatchPayload still does NOT echo ${snap}`)
}

// Spray.jsx shell + workspace + modals didn't gain S.5a.2 edits.
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/SaveAsProgramModal.jsx',
  'src/pages/Spray/tabs/LoadProgramModal.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  // Stores untouched.
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5a.2'),
    `${path} carries no Phase S.5a.2 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5a.2'),   'DAB carries no Phase S.5a.2 edits')
assert(!KIOSK.includes('Phase S.5a.2'), 'kiosk carries no Phase S.5a.2 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
