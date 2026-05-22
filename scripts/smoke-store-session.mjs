// Store session-cutover source scan (Phase 3C).
//
//   node scripts/smoke-store-session.mjs
//
// Static guarantees for the client stores migrated off the public ADMIN_KEY
// onto session-cookie auth. As each Phase-3C group lands, add its stores to
// MIGRATED. The list of stores NOT yet migrated may still use mutationHeaders
// (which is now JSON-only anyway) — we only assert the hard rules below for
// migrated ones, plus a global guarantee that no store hardcodes the key.

import { readFileSync, readdirSync, statSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// Stores migrated to session-cookie auth so far (extend per 3C group).
const MIGRATED = [
  'src/utils/operations/notesStore.js',
  'src/utils/conditionLog/conditionLogStore.js',
  'src/utils/moisture/moistureStore.js',
  'src/utils/disease/diseaseStore.js',
  'src/utils/nutrition/nutritionStore.js',
  // 3C-2
  'src/utils/culturalPractices/culturalPracticesStore.js',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/schedules/schedulesStore.js',
  'src/utils/schedules/templatesStore.js',
  // 3C-3
  'src/utils/crew/crewStore.js',
  'src/utils/alerts/alertsStore.js',
  'src/utils/inventory/inventoryStore.js',
  'src/utils/inventory/labelImportStore.js',
  'src/utils/feedback/feedbackStore.js',
  // 3C-4
  'src/utils/sprays/spraysStore.js',
  'src/utils/equipment/equipmentStore.js',
  'src/utils/repairs/repairsStore.js',
  // 3C-5 (final group)
  'src/utils/courses/courseStore.js',
  'src/utils/weather/weatherHistoryStore.js',
  'src/utils/attachments/attachmentsStore.js',
]

// ── Per migrated store: session creds, no key header, no hardcoded key ──────
for (const path of MIGRATED) {
  const src = readFileSync(path, 'utf8')
  const name = path.split('/').slice(-1)[0]
  assert(src.includes("credentials: 'same-origin'"), `${name}: sends credentials: same-origin`)
  // Match the header as an actual object key (`'x-admin-key':`), so an
  // explanatory comment mentioning the term doesn't trip the check.
  assert(!/['"]x-admin-key['"]\s*:/i.test(src), `${name}: sets no x-admin-key header`)
  assert(!src.includes('TurfAdmin2025!'), `${name}: contains no hardcoded key`)
  // If it still imports mutationHeaders, that's fine — but it must be the
  // JSON-only variant (proven globally below), never adminKeyHeader.
  assert(!/adminKeyHeader/.test(src), `${name}: does not use adminKeyHeader`)
}

// ── mutationAuth.js helpers no longer emit the key ──────────────────────────
{
  const src = readFileSync('src/utils/auth/mutationAuth.js', 'utf8')
  assert(!/['"]x-admin-key['"]\s*:/.test(src), 'mutationAuth: mutationHeaders/adminKeyHeader emit no x-admin-key')
  assert(/sessionInit/.test(src), 'mutationAuth: exposes sessionInit() credentials helper')
  // Functional check: import and confirm the returned headers carry no key.
}
{
  const { mutationHeaders, adminKeyHeader } = await import('../src/utils/auth/mutationAuth.js')
  const mh = mutationHeaders()
  assert(!('x-admin-key' in mh) && mh['Content-Type'] === 'application/json', 'mutationHeaders() = JSON only, no key')
  assert(Object.keys(adminKeyHeader()).length === 0, 'adminKeyHeader() = {} (no key)')
}

// ── GLOBAL: no client store under src/utils/**/*Store.js hardcodes the key ──
{
  const offenders = []
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = `${dir}/${entry}`
      if (statSync(p).isDirectory()) walk(p)
      else if (/Store\.js$/.test(entry) && readFileSync(p, 'utf8').includes('TurfAdmin2025!')) offenders.push(p)
    }
  }
  walk('src/utils')
  assert(offenders.length === 0, 'no *Store.js hardcodes TurfAdmin2025!', offenders)
}

// ── Attachments multipart specifics (3C-5) ─────────────────────────────────
{
  const src = readFileSync('src/utils/attachments/attachmentsStore.js', 'utf8')
  // Must NOT import or use adminKeyHeader anymore.
  assert(!/adminKeyHeader/.test(src), 'attachments: no adminKeyHeader import/use')
  // Upload + delete + listing must all send credentials.
  const credCount = (src.match(/credentials: 'same-origin'/g) || []).length
  assert(credCount >= 3, 'attachments: credentials on fetchJSON + upload + delete', credCount)
  // FormData upload must NOT set a manual Content-Type header (browser sets the
  // multipart boundary). Match an actual header key (`'Content-Type':`), so a
  // comment mentioning the term doesn't trip the check.
  assert(!/['"]content-type['"]\s*:/i.test(src), 'attachments: no manual Content-Type header (FormData boundary preserved)')
  // The FormData upload path is intact.
  assert(/new FormData\(\)/.test(src) && /body:\s*fd/.test(src), 'attachments: FormData upload body preserved')
}

// ── GLOBAL: no store under src/utils sends an x-admin-key header ────────────
{
  const offenders = []
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = `${dir}/${entry}`
      if (statSync(p).isDirectory()) walk(p)
      else if (/Store\.js$/.test(entry) && /['"]x-admin-key['"]\s*:/i.test(readFileSync(p, 'utf8'))) offenders.push(p)
    }
  }
  walk('src/utils')
  assert(offenders.length === 0, 'no *Store.js sets an x-admin-key header', offenders)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
