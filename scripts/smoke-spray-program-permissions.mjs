// Phase S.2 — Spray Program Permission Hardening smoke.
//
//   node scripts/smoke-spray-program-permissions.mjs
//
// Phase S.1 audit found that /api/spray-programs and
// /api/spray-program-items were unmapped in MUTATION_RULES, so any
// authenticated actor could create / edit / archive a spray program
// plan. Records-of-record (/api/sprays) were correctly gated by
// canEditSprays; only the planning routes leaked.
//
// This smoke pins:
//   • Two new MUTATION_RULES entries for /api/spray-programs and
//     /api/spray-program-items, both requiring canEditSprays.
//   • Functional verification via matchRule + isMutationAllowed for
//     all seven mutation paths the spec listed (collection POST,
//     /:id PATCH/DELETE, /:id/items POST, /:itemId PATCH/DELETE,
//     /:itemId/completed-link PATCH).
//   • GET endpoints are NOT gated by MUTATION_RULES — the matcher
//     only consults this map for mutations.
//   • Existing rules are preserved verbatim (regression couples):
//     /api/sprays → canEditSprays, /api/inventory* unchanged,
//     /api/calendar-events → canEditAssignments, etc.
//   • Product catalog stays read-only at the API layer — no
//     mutation rule added for /api/product-catalog (the routes
//     themselves only register GET).
//   • Server-only sub-phase: no D1 migration, no worker API edits,
//     no spray UI files touched, no kiosk changes.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
  MUTATION_RULES,
} from '../worker/lib/mutationPermissions.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const PERM_SRC = readFileSync('worker/lib/mutationPermissions.js', 'utf8')

// Mock actors for functional checks. Each carries a role; the permission
// matrix in worker/lib/permissions.js resolves the role → permission set
// (mirrors the production runtime path, no shortcuts).
const ACTOR_SUPER = { role: 'superintendent' }   // has canEditSprays
const ACTOR_CREW  = { role: 'crew' }             // does NOT have canEditSprays
const ACTOR_RO    = { role: 'read_only' }        // does not have canEditSprays

// ── Source-regex pins ────────────────────────────────────────────────
section('MUTATION_RULES — new spray-program rules present')

assert(/\['\/api\/spray-programs',\s*'canEditSprays'\]/.test(PERM_SRC),
  "MUTATION_RULES includes ['/api/spray-programs', 'canEditSprays']")

assert(/\['\/api\/spray-program-items',\s*'canEditSprays'\]/.test(PERM_SRC),
  "MUTATION_RULES includes ['/api/spray-program-items', 'canEditSprays']")

// Phase comment is present so a future reviewer understands the rules
// weren't always there.
assert(/Phase S\.2[\s\S]{0,400}Spray planning routes were unmapped/.test(PERM_SRC),
  'Phase S.2 explanatory comment present above the new rules')

// ── Existing rules — regression couples ──────────────────────────────
section('Existing rules preserved — regression couples')

assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM_SRC),
  "regression: /api/sprays still gated by canEditSprays (records-of-record)")

for (const rule of [
  ["/api/inventory/import-label", "canEditInventory"],
  ["/api/inventory/usage",        "canEditInventory"],
  ["/api/inventory",              "canEditInventory"],
  ["/api/condition-logs",         "canEditConditionLogs"],
  ["/api/moisture",               "canEditMoisture"],
  ["/api/equipment-reservations", "canEditEquipment"],
  ["/api/equipment",              "canEditEquipment"],
  ["/api/calendar-events",        "canEditAssignments"],
  ["/api/task-templates",         "canEditAssignments"],
  ["/api/operations-notes",       "canSendCrewNotes"],
  ["/api/courses",                "canManageCourses"],
]) {
  const pattern = new RegExp(`\\['${rule[0].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}',\\s*'${rule[1]}'\\]`)
  assert(pattern.test(PERM_SRC),
    `regression: ['${rule[0]}', '${rule[1]}'] preserved`)
}

// Special-case function rules still wired.
assert(/\['\/api\/crew-assignments',\s*crewAssignmentRule\]/.test(PERM_SRC),
  "regression: crew-assignments still uses crewAssignmentRule (status-only PATCH branching)")
assert(/\['\/api\/attachments',\s*attachmentsRule\]/.test(PERM_SRC),
  "regression: attachments still uses attachmentsRule")

// ── Functional: matchRule resolves all 7 spray-program mutation paths
section('matchRule — all spec mutation paths resolve to canEditSprays')

const SPRAY_PROGRAM_MUTATION_PATHS = [
  '/api/spray-programs',                                      // POST
  '/api/spray-programs/sp-abc-123',                           // PATCH, DELETE
  '/api/spray-programs/sp-abc-123/items',                     // POST
  '/api/spray-program-items/spi-abc-456',                     // PATCH, DELETE
  '/api/spray-program-items/spi-abc-456/completed-link',      // PATCH (S.1 spec)
]
for (const path of SPRAY_PROGRAM_MUTATION_PATHS) {
  assert(matchRule(path) === 'canEditSprays',
    `matchRule('${path}') === 'canEditSprays'`)
}

// And the bare /api/spray-programs/:id path — DELETE is the archive flow.
assert(matchRule('/api/spray-programs/sp-abc-123') === 'canEditSprays',
  "matchRule on /api/spray-programs/:id (PATCH/DELETE) → canEditSprays")

// ── Functional: isMutationAllowed with mock actors ────────────────────
section('isMutationAllowed — superintendent allowed, crew/read_only denied')

for (const method of ['POST', 'PATCH', 'DELETE']) {
  for (const path of SPRAY_PROGRAM_MUTATION_PATHS) {
    // The completed-link endpoint only takes PATCH, but we exercise all
    // three methods to confirm the permission gate is method-agnostic
    // (HTTP-method handling lives in worker/index.js, not the gate).
    assert(isMutationAllowed(ACTOR_SUPER, path, method) === true,
      `${method} ${path} ALLOWED for superintendent`)
    assert(isMutationAllowed(ACTOR_CREW, path, method) === false,
      `${method} ${path} DENIED for crew (lacks canEditSprays)`)
    assert(isMutationAllowed(ACTOR_RO, path, method) === false,
      `${method} ${path} DENIED for read_only`)
  }
}

// Sanity: a null actor is denied regardless of route.
assert(isMutationAllowed(null, '/api/spray-programs', 'POST') === false,
  'null actor denied on /api/spray-programs POST (defensive)')

// Automation (ADMIN_KEY synthetic actor) always passes.
assert(isMutationAllowed({ role: 'owner_admin', automation: true }, '/api/spray-programs', 'POST') === true,
  'automation actor (ADMIN_KEY) allowed on /api/spray-programs (cron / internal tooling unchanged)')

// owner_admin actor without the automation flag also passes — owner_admin
// holds every permission in the matrix.
assert(isMutationAllowed({ role: 'owner_admin' }, '/api/spray-programs', 'POST') === true,
  'owner_admin allowed on /api/spray-programs (holds canEditSprays)')

// ── Path-collision guards — adjacent prefixes don't trip the rule ─────
section('Path-collision guards — distinct from /api/sprays and product-catalog')

// /api/sprays should NOT be matched by /api/spray-programs (and vice
// versa). matchRule iterates rules in order; we want the records-of-
// record route to keep its own canEditSprays mapping rather than fall
// through to the new spray-programs rule.
assert(matchRule('/api/sprays') === 'canEditSprays',
  '/api/sprays still maps to canEditSprays (records-of-record path preserved)')
assert(matchRule('/api/sprays/abc-123') === 'canEditSprays',
  '/api/sprays/:id still maps to canEditSprays')

// /api/spray-programs must not accidentally match /api/sprays' rule
// (and we already pin matchRule resolves it to canEditSprays via its
// own dedicated rule above). Belt + suspenders: check it doesn't
// startsWith /api/sprays/ which would collide.
assert(!'/api/spray-programs'.startsWith('/api/sprays/'),
  '/api/spray-programs literal does not startsWith /api/sprays/ (boundary preserved)')

// /api/spray-program-items vs /api/spray-programs — different prefixes
// thanks to the '-items' suffix. Confirmed neither leaks into the other.
assert(!'/api/spray-program-items'.startsWith('/api/spray-programs/'),
  '/api/spray-program-items literal does not startsWith /api/spray-programs/')

// product-catalog stays unmapped — the GET-only routes do not need a
// mutation rule, and intentionally keeping it out preserves the global
// catalog's read-only-from-the-API contract.
assert(matchRule('/api/product-catalog') === null,
  '/api/product-catalog has NO mutation rule (read-only contract preserved)')
assert(matchRule('/api/product-catalog/pc-primo-maxx-100') === null,
  '/api/product-catalog/:id has NO mutation rule')
assert(matchRule('/api/product-catalog/search') === null,
  '/api/product-catalog/search has NO mutation rule')

// ── Pre-existing unrelated routes still match their original rules ────
section('Unrelated routes — no spillover from the two new prefixes')

assert(matchRule('/api/inventory/import-label') === 'canEditInventory',
  '/api/inventory/import-label still resolves before /api/inventory parent')
assert(matchRule('/api/inventory/usage') === 'canEditInventory',
  '/api/inventory/usage still resolves before /api/inventory parent')
assert(matchRule('/api/inventory') === 'canEditInventory',
  '/api/inventory parent rule still resolves')
assert(matchRule('/api/calendar-events') === 'canEditAssignments',
  '/api/calendar-events still maps to canEditAssignments')
assert(matchRule('/api/task-templates') === 'canEditAssignments',
  '/api/task-templates still maps to canEditAssignments (Phase 9C.11)')
assert(matchRule('/api/operations-notes') === 'canSendCrewNotes',
  '/api/operations-notes still maps to canSendCrewNotes')

// crew-assignments is a function rule — confirm matchRule returns the
// function reference, not a string. The function decides between
// canUpdateTaskStatus and canEditAssignments based on body shape.
assert(typeof matchRule('/api/crew-assignments') === 'function',
  '/api/crew-assignments still routes to the crewAssignmentRule function')

// ── No D1 / spray API / spray UI / kiosk edits ────────────────────────
section('Server-only sub-phase — no D1 / API / UI / kiosk edits')

for (const path of [
  // Spray API surface — no shape changes this phase.
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/api/inventory.js',
  'worker/api/inventoryLabels.js',
  // Other API + workers infra.
  'worker/api/taskTemplates.js',
  'worker/api/assignments.js',
  'worker/api/calendar.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
  // Spray UI tabs + components.
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  // Spray client stores.
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
  'src/utils/productCatalog/productCatalogStore.js',
  // Kiosk + DAB (untouched).
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.2'),
    `${path} carries no Phase S.2 edits`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0055 (found: ${past0051.join(', ') || 'none'})`)

// Spray-table migrations (0006, 0016, 0044) are unchanged — pin a
// regression couple so a future schema-extension phase doesn't
// inadvertently re-shape these files alongside the permission fix.
const s006 = readFileSync('worker/migrations/0006_sprays.sql', 'utf8')
assert(s006.includes('CREATE TABLE IF NOT EXISTS spray_records'),
  '0006_sprays.sql still creates spray_records (schema unchanged)')
const s044 = readFileSync('worker/migrations/0044_spray_programs.sql', 'utf8')
assert(s044.includes('CREATE TABLE IF NOT EXISTS spray_programs'),
  '0044_spray_programs.sql still creates spray_programs (schema unchanged)')

// ── Rule ordering — spray-program rules grouped with sprays ──────────
section('Rule ordering — new spray rules grouped, no ordering hazard')

// Verify the new rules sit between /api/sprays and /api/equipment-reservations
// in MUTATION_RULES order. This isn't strictly required for correctness
// (prefixes are disjoint), but it keeps the file readable.
const sprayIdx       = MUTATION_RULES.findIndex(r => r[0] === '/api/sprays')
const sprayProgIdx   = MUTATION_RULES.findIndex(r => r[0] === '/api/spray-programs')
const sprayItemsIdx  = MUTATION_RULES.findIndex(r => r[0] === '/api/spray-program-items')
const equipResIdx    = MUTATION_RULES.findIndex(r => r[0] === '/api/equipment-reservations')

assert(sprayIdx >= 0 && sprayProgIdx >= 0 && sprayItemsIdx >= 0 && equipResIdx >= 0,
  'all four anchor rules located in MUTATION_RULES')
assert(sprayIdx < sprayProgIdx && sprayProgIdx < sprayItemsIdx && sprayItemsIdx < equipResIdx,
  'new spray-program rules grouped between /api/sprays and /api/equipment-reservations')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
