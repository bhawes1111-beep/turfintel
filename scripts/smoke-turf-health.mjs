// Phase 7B.1 — Turf Health Observation Foundation smoke test.
//
//   node scripts/smoke-turf-health.mjs
//
// Static source contracts:
//   - migration 0041 declares the 21-column schema + 4 named indexes
//   - Worker API enforces validation (location required, healthType allowed
//     set, severity coerced, status coerced)
//   - Worker dedupes by client_id (same pattern as moisture)
//   - Worker round-trips the capture-time provenance columns
//   - Worker route wired in worker/index.js for /api/turf-health[/:id]
//   - Attachment whitelist accepts turf_health_observation
//   - Permission key canEditTurfHealth lives in both permission files
//
// No live store / sheet / FAB yet — those land in Commits 3-4. This smoke
// proves the foundation is consistent end-to-end before any client code
// depends on it.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration ────────────────────────────────────────────────────────────
console.log('— migration 0041 (turf_health_observations)')
{
  const mig = readFileSync('worker/migrations/0041_turf_health_observations.sql', 'utf8')
  // Table.
  assert(/CREATE TABLE IF NOT EXISTS turf_health_observations/.test(mig),
                                                'migration creates turf_health_observations (idempotent)')
  // Core columns.
  for (const col of [
    'id', 'course_id', 'observed_at', 'observed_by',
    'location', 'hole', 'area_type', 'health_type', 'severity',
    'surface_note', 'notes', 'tags_json',
    'status', 'follow_up_date',
    'client_id', 'client_observed_at', 'lat', 'lng', 'gps_accuracy',
    'created_at', 'updated_at',
  ]) {
    assert(new RegExp(`\\b${col}\\b`).test(mig), `migration declares column ${col}`)
  }
  // Defaults.
  assert(/status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'active'/.test(mig),
                                                "status defaults to 'active'")
  assert(/created_at\s+TEXT\s+NOT NULL\s+DEFAULT\s+\(datetime\('now'\)\)/.test(mig),
                                                'created_at defaults to datetime now')
  // Indexes.
  for (const idx of [
    'idx_turf_health_course_time',
    'idx_turf_health_location',
    'idx_turf_health_status',
  ]) {
    assert(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}`).test(mig), `migration declares index ${idx}`)
  }
  // Partial unique on client_id.
  assert(/CREATE UNIQUE INDEX IF NOT EXISTS idx_turf_health_client_id[\s\S]*WHERE client_id IS NOT NULL/.test(mig),
                                                'partial unique index on client_id (nullable safe)')
}

// ── 2. Worker API ──────────────────────────────────────────────────────────
console.log('— worker/api/turfHealth.js')
{
  const api = readFileSync('worker/api/turfHealth.js', 'utf8')

  // Exports.
  for (const fn of ['listTurfHealth', 'getTurfHealth', 'createTurfHealth', 'updateTurfHealth', 'deleteTurfHealth']) {
    assert(new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`).test(api),
                                                `worker exports ${fn}`)
  }

  // Validation gates.
  assert(/ALLOWED_HEALTH_TYPES\s*=\s*new Set\(\[/.test(api),
                                                'ALLOWED_HEALTH_TYPES Set declared')
  for (const t of [
    'morning-shade', 'afternoon-shade', 'all-day-shade', 'poor-airflow',
    'wet-pocket', 'weak-bermuda', 'slow-recovery', 'algae-moss',
    'chronic-wilt', 'localized-dry-spot', 'traffic-stress', 'scalping-thin',
  ]) {
    assert(api.includes(`'${t}'`),              `health type "${t}" present in ALLOWED set`)
  }
  assert(/ALLOWED_SEVERITY\s*=\s*new Set\(\[\s*'low',\s*'moderate',\s*'high'\s*\]\)/.test(api),
                                                'severity vocabulary matches disease (low/moderate/high)')
  assert(/ALLOWED_STATUS\s*=\s*new Set\(\[\s*'active',\s*'monitoring',\s*'resolved'\s*\]\)/.test(api),
                                                'status vocabulary is active/monitoring/resolved')

  // rowToObs returns the camelCase API shape clients consume.
  for (const field of [
    'observedAt', 'observedBy', 'healthType', 'areaType', 'severity',
    'surfaceNote', 'tags', 'status', 'followUpDate',
    'clientId', 'clientObservedAt', 'lat', 'lng', 'gpsAccuracy',
  ]) {
    assert(new RegExp(`\\b${field}:`).test(api),  `rowToObs returns ${field}`)
  }
  assert(/parseTags\(row\.tags_json\)/.test(api),
                                                'rowToObs parses tags_json into a JS array')

  // createTurfHealth contract: location required, healthType validated,
  // clientId dedupes, status defaults to 'active', provenance round-trips.
  const createBody = api.match(/export\s+async\s+function\s+createTurfHealth[\s\S]*?\n\}/)?.[0]
  assert(createBody != null,                    'createTurfHealth body extractable')
  if (createBody) {
    assert(/location is required/.test(createBody),
                                                'create rejects missing location')
    assert(/healthType must be one of/.test(createBody),
                                                'create rejects unknown healthType')
    assert(/WHERE client_id = \?/.test(createBody),
                                                'create dedupes by clientId for retries')
    assert(/coerceStatus\(body\.status\)\s*\?\?\s*'active'/.test(createBody),
                                                "create defaults status to 'active'")
    assert(/INSERT INTO turf_health_observations[\s\S]*client_id,\s*client_observed_at,\s*lat,\s*lng,\s*gps_accuracy/i.test(createBody),
                                                'INSERT lists capture-time provenance columns')
  }

  // updateTurfHealth contract: rejects invalid coerced values; updates updated_at.
  const updateBody = api.match(/export\s+async\s+function\s+updateTurfHealth[\s\S]*?\n\}/)?.[0]
  assert(updateBody != null,                    'updateTurfHealth body extractable')
  if (updateBody) {
    assert(/Invalid severity/.test(updateBody),  'update rejects invalid severity')
    assert(/Invalid status/.test(updateBody),    'update rejects invalid status')
    assert(/Invalid healthType/.test(updateBody),'update rejects invalid healthType')
    assert(/updated_at = datetime\('now'\)/.test(updateBody),
                                                'update bumps updated_at')
  }
}

// ── 3. Route wiring ────────────────────────────────────────────────────────
console.log('— worker/index.js route wiring')
{
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(/import\s+\{[\s\S]*listTurfHealth[\s\S]*createTurfHealth[\s\S]*\}\s+from\s+['"]\.\/api\/turfHealth/.test(idx),
                                                'worker imports turfHealth handlers')
  assert(/pathname === '\/api\/turf-health'/.test(idx),
                                                '/api/turf-health route present')
  assert(/listTurfHealth\(env,\s*courseId/.test(idx),
                                                'GET delegates to listTurfHealth(courseId, opts)')
  assert(/createTurfHealth\(env,\s*request\)/.test(idx),
                                                'POST delegates to createTurfHealth(request)')
  assert(/\\\/api\\\/turf-health\\\/\(\[\^\/\]\+\)/.test(idx),
                                                '/api/turf-health/:id route regex present')
  assert(/getTurfHealth\(env,\s*id\)/.test(idx),'GET /:id delegates to getTurfHealth')
  assert(/updateTurfHealth\(env,\s*id,\s*request\)/.test(idx),
                                                'PATCH /:id delegates to updateTurfHealth')
  assert(/deleteTurfHealth\(env,\s*id\)/.test(idx),
                                                'DELETE /:id delegates to deleteTurfHealth')
}

// ── 4. Attachment whitelist ───────────────────────────────────────────────
console.log('— attachment parent-type whitelist')
{
  const att = readFileSync('worker/api/attachments.js', 'utf8')
  assert(/['"]turf_health_observation['"]/.test(att),
                                                "whitelist includes 'turf_health_observation'")
  assert(/ALLOWED_PARENT_TYPES\s*=\s*new Set\(\[[\s\S]*turf_health_observation[\s\S]*\]\)/m.test(att),
                                                'turf_health_observation lives inside ALLOWED_PARENT_TYPES Set')
}

// ── 5. Permission sync (client + Worker) ──────────────────────────────────
console.log('— canEditTurfHealth in both permission files')
{
  const clientP = readFileSync('src/utils/auth/permissions.js', 'utf8')
  const workerP = readFileSync('worker/lib/permissions.js',    'utf8')

  for (const [label, src] of [['client', clientP], ['worker', workerP]]) {
    assert(/'canEditTurfHealth'/.test(src),     `${label} PERMISSION_KEYS contains canEditTurfHealth`)
    // OPERATIONAL bundle grants it.
    assert(/canEditTurfHealth:\s+true/.test(src),
                                                `${label} OPERATIONAL grants canEditTurfHealth`)
    // crew_lead also gets it (walks the course).
    assert(/crew_lead:\s*\{[\s\S]*canEditTurfHealth:\s+true/.test(src),
                                                `${label} crew_lead grants canEditTurfHealth`)
    // crew + read_only do NOT get it (no FAB / capture for them).
    const crewBlock = src.match(/^\s*crew:\s*\{[\s\S]*?^\s*\},/m)?.[0]
    assert(crewBlock != null && !/canEditTurfHealth/.test(crewBlock),
                                                `${label} crew does NOT get canEditTurfHealth`)
    const roBlock = src.match(/^\s*read_only:\s*\{[\s\S]*?^\s*\},?/m)?.[0]
    assert(roBlock != null && !/canEditTurfHealth/.test(roBlock),
                                                `${label} read_only does NOT get canEditTurfHealth`)
  }
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
