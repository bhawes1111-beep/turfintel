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

// ── 6. Capture UX (Commit 4) ──────────────────────────────────────────────
console.log('— TurfHealthCaptureSheet (Commit 4)')
{
  const sheet = readFileSync('src/components/turfHealth/TurfHealthCaptureSheet.jsx', 'utf8')

  // Imports through the store, not the legacy/disease/moisture stores.
  assert(/import\s+\{[^}]*submitTurfHealthObservation[^}]*\}\s+from\s+['"][^'"]*turfHealth\/turfHealthStore/.test(sheet),
                                                'sheet imports submitTurfHealthObservation')
  assert(/import\s+\{[^}]*stagePendingPhoto[^}]*\}\s+from\s+['"][^'"]*turfHealth\/turfHealthStore/.test(sheet),
                                                'sheet imports stagePendingPhoto from TURF HEALTH store (not moisture)')
  assert(!/from\s+['"][^'"]*moisture\/moistureStore/.test(sheet),
                                                'sheet does NOT import the moisture store')
  // Shared picker.
  assert(/import\s+\{\s*openPhotoPicker\s*\}\s+from\s+['"][^'"]*media\/pickPhoto/.test(sheet),
                                                'sheet uses the shared openPhotoPicker helper')

  // The 12 v1 health types must all be present in the sheet's preset list
  // (the same set the Worker validates against).
  for (const t of [
    'morning-shade', 'afternoon-shade', 'all-day-shade', 'poor-airflow',
    'wet-pocket', 'weak-bermuda', 'slow-recovery', 'algae-moss',
    'chronic-wilt', 'localized-dry-spot', 'traffic-stress', 'scalping-thin',
  ]) {
    assert(sheet.includes(`'${t}'`),            `sheet preset includes "${t}"`)
  }

  // Severity vocabulary mirrors the Worker.
  for (const sev of ['low', 'moderate', 'high']) {
    assert(sheet.includes(`'${sev}'`),          `sheet severity includes "${sev}"`)
  }

  // Location presets: same vocabulary as moisture for muscle memory.
  assert(/Array\.from\(\{\s*length:\s*18\s*\}/.test(sheet),
                                                'sheet declares 18 green presets (matches moisture vocabulary)')
  for (const p of ['Practice Green', 'Putting Green', 'Driving Range']) {
    assert(sheet.includes(`'${p}'`),            `sheet includes location preset "${p}"`)
  }

  // doSubmit must validate all three required fields and return the optimistic row.
  const submitFn = sheet.match(/function\s+doSubmit\s*\(\s*\)[\s\S]*?\n\s\s\}/)?.[0]
  assert(submitFn != null,                      'doSubmit body extractable')
  if (submitFn) {
    assert(!/^\s*async\s+function\s+doSubmit/.test(submitFn),
                                                'doSubmit is NOT async (no network wait)')
    assert(!/\bawait\b/.test(submitFn),         'doSubmit has no await')
    assert(/Pick a location/.test(submitFn),    'doSubmit validates location')
    assert(/Pick a type/.test(submitFn),        'doSubmit validates healthType')
    assert(/Pick a severity/.test(submitFn),    'doSubmit validates severity')
    assert(/submitTurfHealthObservation\(/.test(submitFn),
                                                'doSubmit fires submitTurfHealthObservation')
  }

  // Save shows the photo-action toast; Log another does NOT.
  const saveFn = sheet.match(/function\s+handleSave\s*\(\s*\)[\s\S]*?\n\s\s\}/)?.[0]
  assert(saveFn != null,                        'handleSave body extractable')
  if (saveFn) {
    assert(!/^\s*async\s+function\s+handleSave/.test(saveFn),
                                                'handleSave is NOT async')
    assert(!/\bawait\b/.test(saveFn),           'handleSave has no await')
    assert(/duration:\s*6000/.test(saveFn),     'Save toast extends to 6s for photo action')
    assert(/label:\s*['"]?\+ Add photo['"]?/.test(saveFn),
                                                'Save toast carries "+ Add photo" action')
    assert(/pickPhotoForClientId\(row\.clientId\)/.test(saveFn),
                                                'photo action stages against the row clientId')
    assert(/onClose\(\)/.test(saveFn),          'Save closes the sheet synchronously')
  }
  const contFn = sheet.match(/function\s+handleSaveAndContinue\s*\(\s*\)[\s\S]*?\n\s\s\}/)?.[0]
  assert(contFn != null,                        'handleSaveAndContinue body extractable')
  if (contFn) {
    assert(!/pickPhotoForClientId|\+ Add photo|action:\s*\{/.test(contFn),
                                                'Log another toast has NO photo action (repeat-entry stays fast)')
    assert(/setHealthType\(null\)/.test(contFn),'continue clears healthType')
    assert(/setSeverity\(null\)/.test(contFn),  'continue clears severity')
    assert(/setNote\(''\)/.test(contFn),        'continue clears note')
    assert(!/setLocation\(/.test(contFn),       'continue does NOT clear location (key UX guarantee)')
    assert(!/onClose\(/.test(contFn),           'continue does NOT close the sheet')
  }

  // No autofocus on inputs (zero-typing primary flow).
  assert(!/autoFocus/.test(sheet),              'sheet has no autoFocus prop anywhere (keyboard never required)')
  // Other input focuses only when explicitly opened.
  assert(/otherOpen[\s\S]*otherInputRef\.current\?\.focus/.test(sheet),
                                                '"Other" input focuses only after explicit tap')

  // CSS contracts.
  const sheetCss = readFileSync('src/components/turfHealth/TurfHealthCaptureSheet.module.css', 'utf8')
  assert(/\.typeGrid\b/.test(sheetCss),         'CSS defines .typeGrid (12-pill grid)')
  assert(/\.typeChip\b/.test(sheetCss),         'CSS defines .typeChip')
  assert(/\.severityRow\b/.test(sheetCss),      'CSS defines .severityRow')
  assert(/\.severityChip\b/.test(sheetCss),     'CSS defines .severityChip')
  assert(/data-level="low"/.test(sheetCss) && /data-level="moderate"/.test(sheetCss) && /data-level="high"/.test(sheetCss),
                                                'severity chip CSS tints active state by level (low/moderate/high)')
  assert(/safe-area-inset-bottom/.test(sheetCss),
                                                'footer respects iOS safe-area-inset-bottom')
  assert(/min-height:\s*44px/.test(sheetCss),   'CSS has tap targets at the 44px floor')
}

// ── 7. TurfHealthFab (Commit 4) ───────────────────────────────────────────
console.log('— TurfHealthFab (Commit 4)')
{
  const fab = readFileSync('src/components/turfHealth/TurfHealthFab.jsx', 'utf8')
  assert(/can\(['"]canEditTurfHealth['"]\)/.test(fab),
                                                'FAB gated on canEditTurfHealth')
  assert(/useFabVisibility\(['"]turfHealth['"]\)/.test(fab),
                                                'FAB consumes the route-aware visibility hook')
  assert(/TurfHealthCaptureSheet/.test(fab),    'FAB opens the TurfHealthCaptureSheet')
  // null when not visible OR no permission.
  assert(/if\s*\(!can\(['"]canEditTurfHealth['"]\)\)\s+return null/.test(fab),
                                                'FAB returns null when permission denied')
  assert(/if\s*\(!visible\)\s+return null/.test(fab),
                                                'FAB returns null when not on a visible route')
  // data-stacked on dashboard.
  assert(/data-stacked=\{onDashboard\s*\?\s*['"]true['"]\s*:\s*['"]false['"]\}/.test(fab),
                                                'FAB carries data-stacked on /dashboard so CSS can offset above moisture FAB')

  const fabCss = readFileSync('src/components/turfHealth/TurfHealthFab.module.css', 'utf8')
  assert(/\.fab\s*\{[\s\S]*display:\s*none/.test(fabCss),
                                                'FAB hidden by default (desktop)')
  assert(/@media\s*\(max-width:\s*767px\)/.test(fabCss),
                                                'FAB visible only on ≤ 767px viewports')
  assert(/safe-area-inset-bottom/.test(fabCss), 'FAB respects iOS safe-area')
  assert(/\.fab\[data-stacked="true"\]/.test(fabCss),
                                                'CSS defines stacked variant offset')
  // The stacked offset must clear the 56px moisture FAB + 16px gap.
  assert(/calc\(16px\s*\+\s*56px\s*\+\s*16px\s*\+\s*env\(safe-area-inset-bottom/.test(fabCss),
                                                'stacked offset = 16 + 56 + 16 + safe-area (clears moisture FAB)')
}

// ── 8. Route-aware FAB visibility hook (Commit 4) ─────────────────────────
console.log('— useFabVisibility (Commit 4)')
{
  const hook = readFileSync('src/utils/ui/useFabVisibility.js', 'utf8')
  assert(/export\s+function\s+useFabVisibility/.test(hook),
                                                'exports useFabVisibility')
  assert(/useLocation/.test(hook),              'reads route via react-router useLocation')
  // The single source of truth for which FAB shows where.
  assert(/moisture:\s*\[\s*['"]\/dashboard['"]\s*,\s*['"]\/irrigation['"]\s*\]/.test(hook),
                                                'moisture FAB visible on /dashboard + /irrigation')
  assert(/turfHealth:\s*\[\s*['"]\/dashboard['"]\s*,\s*['"]\/turf-health['"]\s*\]/.test(hook),
                                                'turfHealth FAB visible on /dashboard + /turf-health')
  // matchesAny does prefix matching, not naive substring matching.
  assert(/startsWith\(p\s*\+\s*['"]\/['"]/.test(hook),
                                                'prefix match uses startsWith(p + "/") to avoid /irrigation-foo collisions')
}

// ── 9. MoistureFab is now route-aware (Commit 4 regression guard) ─────────
console.log('— MoistureFab route-awareness (no global rendering)')
{
  const mfab = readFileSync('src/components/moisture/MoistureFab.jsx', 'utf8')
  assert(/useFabVisibility\(['"]moisture['"]\)/.test(mfab),
                                                'MoistureFab consumes the route-aware visibility hook')
  assert(/if\s*\(!visible\)\s+return null/.test(mfab),
                                                'MoistureFab returns null when not on a visible route')
}

// ── 10. Layout mounts BOTH FABs (Commit 4) ────────────────────────────────
console.log('— Layout mounts both FABs')
{
  const layout = readFileSync('src/components/layout/Layout.jsx', 'utf8')
  assert(/<MoistureFab\s*\/>/.test(layout),     'Layout mounts MoistureFab')
  assert(/<TurfHealthFab\s*\/>/.test(layout),   'Layout mounts TurfHealthFab')
  assert(/import\s+TurfHealthFab/.test(layout), 'Layout imports TurfHealthFab')
}

// ── 11. Workspace + route + sidebar (Commit 5) ────────────────────────────
console.log('— /turf-health workspace (Commit 5)')
{
  // healthTypes shared metadata.
  const meta = readFileSync('src/utils/turfHealth/healthTypes.js', 'utf8')
  assert(/HEALTH_TYPE_LABELS/.test(meta),       'healthTypes exports HEALTH_TYPE_LABELS')
  assert(/SEVERITY_ORDER\s*=\s*\{\s*high:\s*0,\s*moderate:\s*1,\s*low:\s*2\s*\}/.test(meta),
                                                'healthTypes exports SEVERITY_ORDER (high=0)')
  // Label map covers all 12 types — drift between this and the Worker's
  // ALLOWED_HEALTH_TYPES would be silent UI noise.
  for (const t of [
    'morning-shade', 'afternoon-shade', 'all-day-shade', 'poor-airflow',
    'wet-pocket', 'weak-bermuda', 'slow-recovery', 'algae-moss',
    'chronic-wilt', 'localized-dry-spot', 'traffic-stress', 'scalping-thin',
  ]) {
    assert(new RegExp(`['"]${t}['"]\\s*:`).test(meta),
                                                `healthTypes labels include "${t}"`)
  }

  // Workspace shell.
  const page = readFileSync('src/pages/TurfHealth/TurfHealth.jsx', 'utf8')
  assert(/import\s+PageShell/.test(page),       'TurfHealth uses PageShell')
  assert(/title="Turf Health"/.test(page),     'PageShell title is "Turf Health"')
  // Three tabs declared in order.
  assert(/TABS\s*=\s*\['Overview',\s*'Active Issues',\s*'Recent Observations'\]/.test(page),
                                                'TABS in declared order: Overview / Active Issues / Recent Observations')
  // Hooks are the new turf-health ones, not the moisture ones.
  assert(/useTurfHealthData\b/.test(page),     'workspace consumes useTurfHealthData')
  assert(/useTurfHealthAttachments\b/.test(page),
                                                'workspace consumes useTurfHealthAttachments')
  assert(!/useMoistureData|useMoistureAttachments/.test(page),
                                                'workspace does NOT consume moisture hooks')

  // Active Issues: severity-sorted, status=active|monitoring only.
  const activeBlock = page.match(/function\s+ActiveIssues[\s\S]*?\n\}/)?.[0]
  assert(activeBlock != null,                   'ActiveIssues sub-component extractable')
  if (activeBlock) {
    assert(/status === 'active'\s*\|\|\s*o\.status === 'monitoring'/.test(activeBlock),
                                                'Active Issues filters status=active|monitoring')
    assert(/SEVERITY_ORDER\[a\.severity\]/.test(activeBlock),
                                                'Active Issues sorts by SEVERITY_ORDER')
    assert(/!o\._pending/.test(activeBlock),    'Active Issues excludes pending rows')
  }

  // Recent Observations: pending/retry/photo support + delete permission gate.
  const recentBlock = page.match(/function\s+RecentObservations[\s\S]*?\n\}/)?.[0]
  assert(recentBlock != null,                   'RecentObservations sub-component extractable')
  if (recentBlock) {
    assert(/canEditTurfHealth/.test(recentBlock),
                                                'Recent tab reads canEditTurfHealth permission')
    assert(/dismissPendingObservation\(o\.clientId\)/.test(recentBlock),
                                                'Recent tab dismisses pending rows by clientId (not real DELETE)')
    assert(/deleteTurfHealthObservation\(o\.id\)/.test(recentBlock),
                                                'Recent tab deletes real rows via deleteTurfHealthObservation')
    assert(/openPhotoPicker\(/.test(recentBlock),
                                                'Recent tab uses shared photo picker')
    assert(/addPhotoToObservation\(/.test(recentBlock),
                                                'Recent tab attaches photos via addPhotoToObservation')
  }

  // ObservationRow internals: pending border, retry pills (obs + photo),
  // photo chip, empty-state chip (gated on onAddPhoto). These patterns are
  // unique enough in the workspace file that we grep the whole source.
  assert(/retryPendingObservation\(obs\.clientId\)/.test(page),
                                                'row wires obs retry to retryPendingObservation')
  assert(/retryPendingPhoto\(obs\.clientId\)/.test(page),
                                                'row wires photo retry to retryPendingPhoto')
  assert(/!obs\._pending\s*&&\s*obs\._photoError/.test(page),
                                                'photo retry gated on !pending')
  assert(/styles\.photoChip\b/.test(page),     'row renders styles.photoChip when photos exist')
  assert(/styles\.photoChipEmpty\b/.test(page),
                                                'row renders styles.photoChipEmpty when 0 photos + canEdit')
  // Empty-state chip only when permission granted AND no photo (onAddPhoto
  // is the handler that is only passed when canEdit is true).
  assert(/photoCount === 0\s*&&\s*onAddPhoto/.test(page),
                                                'empty chip gated on photoCount===0 && onAddPhoto handler')

  // Photo viewer wired and turf-health-specific.
  const viewer = readFileSync('src/components/turfHealth/TurfHealthPhotoViewer.jsx', 'utf8')
  assert(/canEditTurfHealth/.test(viewer),     'viewer gates Delete/Add on canEditTurfHealth')
  assert(/deleteTurfHealthAttachment/.test(viewer),
                                                'viewer deletes via deleteTurfHealthAttachment (not moisture\'s)')
  assert(/addPhotoToObservation/.test(viewer),  'viewer adds via addPhotoToObservation (turfHealthStore)')

  // CSS module exists with the chip + retry classes used by the row.
  const css = readFileSync('src/pages/TurfHealth/TurfHealth.module.css', 'utf8')
  for (const cls of ['photoChip', 'photoChipEmpty', 'retryBadge', 'savingBadge', 'severityDot', 'statCard']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 12. Route + sidebar (Commit 5) ────────────────────────────────────────
console.log('— route + sidebar wiring (Commit 5)')
{
  const app = readFileSync('src/App.jsx', 'utf8')
  assert(/import\s+TurfHealth\s+from\s+['"]\.\/pages\/TurfHealth\/TurfHealth['"]/.test(app),
                                                'App.jsx imports TurfHealth')
  assert(/<Route\s+path="turf-health\/\*"\s+element=\{<TurfHealth\s*\/>\}\s*\/>/.test(app),
                                                'App.jsx mounts /turf-health/* → <TurfHealth/>')
  // The workspace is viewable by anyone with a session — no
  // RequireAuth permission= wrapper on the route itself.
  assert(!/<Route\s+path="turf-health\/\*"\s+element=\{<RequireAuth/.test(app),
                                                'route NOT wrapped in RequireAuth permission= (view is open; edit gates live inside)')

  const sidebar = readFileSync('src/components/layout/Sidebar.jsx', 'utf8')
  assert(/'turf-health':\s*\(/.test(sidebar),  'Sidebar declares the turf-health SVG icon')
  assert(/id:\s*'turf-health'[\s\S]*to:\s*'\/turf-health'/.test(sidebar),
                                                'Sidebar NAV_TREE includes { id: "turf-health", to: "/turf-health" }')
  assert(/label:\s*'Turf Health'/.test(sidebar),
                                                'Sidebar entry labelled "Turf Health"')
  // Slotted after agronomy (per audit recommendation).
  const navOrder = sidebar.match(/id:\s*'agronomy'[\s\S]*?id:\s*'turf-health'/)
  assert(navOrder != null,                      'Turf Health appears after Agronomy in the NAV_TREE order')
}

// ── 13. Reports registry + bundle wiring (Commit 6) ──────────────────────
console.log('— Reports registry + bundle wiring (Commit 6)')
{
  const schemas = readFileSync('src/utils/reports/reportSchemas.js', 'utf8')
  assert(/TURF_HEALTH:\s*['"]turf-health['"]/.test(schemas),
                                                'schemas declare REPORT_MODULE.TURF_HEALTH')
  assert(/TURF_HEALTH_SUMMARY:\s*['"]turf-health-summary['"]/.test(schemas),
                                                'schemas declare REPORT_TYPE.TURF_HEALTH_SUMMARY')

  const builder = readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
  assert(/export\s+function\s+buildTurfHealthSummaryReport/.test(builder),
                                                'reportBuilder exports buildTurfHealthSummaryReport')
  // Builder imports the shared labels so the report shows human text.
  assert(/import\s+\{[^}]*HEALTH_TYPE_LABELS[^}]*\}\s+from\s+['"][^'"]*turfHealth\/healthTypes/.test(builder),
                                                'builder imports HEALTH_TYPE_LABELS from shared module')

  // Registry includes the entry with the right module + bundle key.
  const defs = readFileSync('src/utils/reports/reportDefs.js', 'utf8')
  assert(/id:\s*['"]turf-health-summary['"][\s\S]*module:\s*REPORT_MODULE\.TURF_HEALTH/.test(defs),
                                                'reportDefs entry uses correct id + module')
  assert(/requires:\s*\[\s*['"]turfHealthObservations['"]\s*\]/.test(defs),
                                                'reportDefs entry requires turfHealthObservations')

  // Reports.jsx threads the bundle key in.
  const hub = readFileSync('src/pages/Reports/Reports.jsx', 'utf8')
  assert(/import\s+\{\s*useTurfHealthData\s*\}\s+from\s+['"][^'"]*turfHealth\/turfHealthStore/.test(hub),
                                                'Reports.jsx imports useTurfHealthData')
  assert(/turfHealthObservations:\s*turfHealth\.loading\s*\|\|\s*turfHealth\.error/.test(hub),
                                                'Reports.jsx bundle handles loading/error for turfHealthObservations')
}

// ── 14. Phase 7B.2 (1/6) — orientation column + Worker validation ─────────
console.log('— Phase 7B.2: orientation column + Worker validation')
{
  // Migration 0042 declares the column.
  const mig = readFileSync('worker/migrations/0042_turf_health_orientation.sql', 'utf8')
  assert(/ALTER TABLE turf_health_observations ADD COLUMN orientation TEXT/.test(mig),
                                                'migration 0042 adds orientation TEXT')

  // Worker validates strictly against the 4 cardinals.
  const api = readFileSync('worker/api/turfHealth.js', 'utf8')
  assert(/ALLOWED_ORIENTATIONS\s*=\s*new Set\(\[\s*['"]north['"]\s*,\s*['"]south['"]\s*,\s*['"]east['"]\s*,\s*['"]west['"]\s*\]\)/.test(api),
                                                'Worker declares ALLOWED_ORIENTATIONS = {north, south, east, west}')
  assert(/function\s+coerceOrientation/.test(api),
                                                'Worker has coerceOrientation helper')

  // rowToObs returns orientation.
  assert(/orientation:\s*row\.orientation/.test(api),
                                                'rowToObs returns orientation')

  // INSERT includes the column in the list AND the bound values.
  const createBody = api.match(/export\s+async\s+function\s+createTurfHealth[\s\S]*?\n\}/)?.[0]
  assert(createBody != null,                    'createTurfHealth body extractable')
  if (createBody) {
    assert(/INSERT INTO turf_health_observations[\s\S]*orientation[\s\S]*VALUES/i.test(createBody),
                                                'INSERT includes the orientation column')
    assert(/coerceOrientation\(body\.orientation\)/.test(createBody),
                                                'create coerces orientation strictly')
    assert(/orientation must be one of/.test(createBody),
                                                'create rejects unknown orientation with 400')
  }

  // PATCH path handles orientation (empty string / null clears; junk 400s).
  const updateBody = api.match(/export\s+async\s+function\s+updateTurfHealth[\s\S]*?\n\}/)?.[0]
  assert(updateBody != null,                    'updateTurfHealth body extractable')
  if (updateBody) {
    assert(/Invalid orientation/.test(updateBody),
                                                'PATCH rejects junk orientation values')
    // The TEXT_COLUMNS map must list orientation so it's a patchable field.
    assert(/orientation:\s*['"]orientation['"]/.test(api),
                                                'TEXT_COLUMNS map lists orientation')
  }
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
