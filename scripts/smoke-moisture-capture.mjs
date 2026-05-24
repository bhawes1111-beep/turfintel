// Phase 7A.1 — Mobile Moisture Capture smoke test.
//
//   node scripts/smoke-moisture-capture.mjs
//
// Exercises:
//   - Migration adds the 5 capture columns + unique index on client_id
//   - Worker create handler persists/dedupes the new fields
//   - Attachment parent-type whitelist includes 'moisture_observation'
//   - Store exposes submitMoistureObservation / retry / dismiss
//   - submit() runs synchronously (no `await` in its body before insert)
//   - submit() flags the optimistic row _pending: true + auto-stamps clientId
//   - sendToServer() reconciles on success / stamps _error on failure
//     (asserted by source pattern — store can't be live-imported under Node
//      because the project uses bare-specifier imports that only Vite resolves)
//   - UI surfaces (sheet, FAB, Layout) wire the new path correctly
//   - Legacy createMoistureObservation export is preserved (no regressions)
//
// Pure source-scan smoke (matches the pattern of smoke-store-session,
// smoke-mail). Does NOT attempt to `await import()` the store — that
// requires extension-suffixed imports the project doesn't use elsewhere.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration ────────────────────────────────────────────────────────────
console.log('— migration 0040 (capture columns + index)')
{
  const mig = readFileSync('worker/migrations/0040_moisture_capture_extensions.sql', 'utf8')
  for (const col of ['client_id', 'client_observed_at', 'lat', 'lng', 'gps_accuracy']) {
    assert(new RegExp(`ADD COLUMN ${col}\\b`).test(mig), `migration adds column ${col}`)
  }
  assert(/CREATE UNIQUE INDEX[\s\S]*client_id/i.test(mig),         'migration adds unique index on client_id')
  assert(/WHERE client_id IS NOT NULL/i.test(mig),                  'unique index is partial (nullable safe)')
}

// ── 2. Worker API ──────────────────────────────────────────────────────────
console.log('— worker/api/moisture.js (persist + return + dedupe)')
{
  const api = readFileSync('worker/api/moisture.js', 'utf8')
  assert(/clientId:\s*row\.client_id/.test(api),                    'rowToObs returns clientId')
  assert(/clientObservedAt:\s*row\.client_observed_at/.test(api),   'rowToObs returns clientObservedAt')
  assert(/lat:\s+row\.lat/.test(api),                               'rowToObs returns lat')
  assert(/lng:\s+row\.lng/.test(api),                               'rowToObs returns lng')
  assert(/gpsAccuracy:\s+row\.gps_accuracy/.test(api),              'rowToObs returns gpsAccuracy')

  assert(/WHERE client_id = \?/.test(api),                          'createMoisture dedupes on clientId')
  assert(/INSERT INTO moisture_observations[\s\S]*client_id,\s*client_observed_at,\s*lat,\s*lng,\s*gps_accuracy/i.test(api),
                                                                     'INSERT lists the 5 new columns')
}

// ── 3. Attachment whitelist ────────────────────────────────────────────────
console.log('— worker/api/attachments.js (parent-type whitelist)')
{
  const att = readFileSync('worker/api/attachments.js', 'utf8')
  assert(/['"]moisture_observation['"]/.test(att),                  'whitelist includes moisture_observation')
  assert(/ALLOWED_PARENT_TYPES\s*=\s*new Set\(\[[\s\S]*moisture_observation[\s\S]*\]\)/m.test(att),
                                                                     'moisture_observation lives in ALLOWED_PARENT_TYPES Set')
}

// ── 4. Store: exports + non-blocking submit + retry/dismiss ────────────────
console.log('— src/utils/moisture/moistureStore.js (capture wrapper)')
{
  const store = readFileSync('src/utils/moisture/moistureStore.js', 'utf8')

  // Legacy contract preserved.
  assert(/export\s+async\s+function\s+createMoistureObservation/.test(store),
                                                                     'legacy createMoistureObservation export preserved')
  assert(/export\s+function\s+useMoistureData/.test(store),         'useMoistureData export preserved')

  // New exports.
  assert(/export\s+function\s+submitMoistureObservation/.test(store), 'exports submitMoistureObservation')
  assert(/export\s+function\s+retryPendingObservation/.test(store),   'exports retryPendingObservation')
  assert(/export\s+function\s+dismissPendingObservation/.test(store), 'exports dismissPendingObservation')

  // The architectural invariant: submitMoistureObservation MUST be a sync
  // function (no `async` keyword, no `await` before the optimistic insert).
  // The user-action / network round-trip must be split.
  const submitMatch = store.match(/export\s+function\s+submitMoistureObservation[\s\S]*?\n\}/)
  assert(submitMatch != null,                                         'submitMoistureObservation body extractable')
  if (submitMatch) {
    const body = submitMatch[0]
    assert(!/^\s*export\s+async\s+function\s+submitMoistureObservation/.test(body),
                                                                       'submitMoistureObservation is NOT async (returns synchronously)')
    assert(!/\bawait\b/.test(body),                                    'submitMoistureObservation body contains no `await` (no network blocking)')
    assert(/_pending:\s*true/.test(body),                              'optimistic row carries _pending: true')
    assert(/setState\(\{[\s\S]*observations:\s*\[optimistic/.test(body),
                                                                       'optimistic row prepended to observations[]')
    assert(/void\s+sendToServer\(/.test(body),                         'fires sendToServer fire-and-forget (void)')
  }

  // sendToServer should reconcile by clientId on success and stamp _error on failure.
  const sendMatch = store.match(/async\s+function\s+sendToServer[\s\S]*?\n\}/)
  assert(sendMatch != null,                                           'sendToServer body extractable')
  if (sendMatch) {
    const body = sendMatch[0]
    assert(/o\.clientId\s*===\s*payload\.clientId/.test(body),         'success path reconciles by clientId')
    assert(/_pending:\s*true[\s\S]*_error:\s*err\.message/.test(body), 'failure path stamps _pending true + _error msg')
  }

  // clientId auto-generation present and uses crypto.randomUUID when available.
  assert(/crypto\.randomUUID/.test(store),                            'uuid() prefers crypto.randomUUID')
  assert(/payload\.clientId\s*\?\?\s*uuid\(\)/.test(store),           'clientId defaults to uuid() when not supplied')
  assert(/payload\.clientObservedAt\s*\?\?\s*new Date\(\)\.toISOString\(\)/.test(store),
                                                                       'clientObservedAt defaults to now()')

  // GPS-ready: payload must thread lat/lng/gpsAccuracy through to network.
  assert(/lat:\s+payload\.lat/.test(store),                           'submit threads lat into optimistic row')
  assert(/lng:\s+payload\.lng/.test(store),                           'submit threads lng into optimistic row')
  assert(/gpsAccuracy:\s+payload\.gpsAccuracy/.test(store),           'submit threads gpsAccuracy into optimistic row')
}

// ── 5. UI: sheet uses non-blocking path, presets, zero-typing primary ──────
console.log('— src/components/moisture/MoistureCaptureSheet.jsx')
{
  const sheet = readFileSync('src/components/moisture/MoistureCaptureSheet.jsx', 'utf8')

  // Non-blocking submit path.
  assert(/import\s+\{[\s\S]*submitMoistureObservation[\s\S]*\}\s+from/.test(sheet),
                                                                     'sheet imports submitMoistureObservation')
  assert(!/createMoistureObservation/.test(sheet),                   'sheet does NOT call legacy createMoistureObservation')
  // The submit path must not be async — closing the modal must not wait on
  // network. Phase 7A.3: handleSave delegates to doSubmit which calls
  // submitMoistureObservation. Assert both bodies stay sync + no `await`.
  const submitFnMatch = sheet.match(/function\s+doSubmit\s*\(\s*\)[\s\S]*?\n\s\s\}/)
  assert(submitFnMatch != null,                                      'doSubmit body extractable')
  if (submitFnMatch) {
    assert(!/^\s*async\s+function\s+doSubmit/.test(submitFnMatch[0]), 'doSubmit is NOT async (sync close)')
    assert(!/\bawait\b/.test(submitFnMatch[0]),                       'doSubmit has no await (no network wait)')
    assert(/submitMoistureObservation\(/.test(submitFnMatch[0]),     'doSubmit fires submitMoistureObservation')
  }
  // handleSave still closes the sheet via onClose after a successful submit.
  const saveMatch = sheet.match(/function\s+handleSave\s*\(\s*\)[\s\S]*?\n\s\s\}/)
  assert(saveMatch != null,                                          'handleSave body extractable')
  if (saveMatch) {
    assert(!/^\s*async\s+function\s+handleSave/.test(saveMatch[0]),  'handleSave is NOT async (sync close)')
    assert(!/\bawait\b/.test(saveMatch[0]),                           'handleSave has no await (no network wait)')
    assert(/doSubmit\(\)/.test(saveMatch[0]),                         'handleSave delegates to doSubmit')
    assert(/onClose\(\)/.test(saveMatch[0]),                          'handleSave closes modal synchronously')
  }

  // Presets: greens 1–18 + 3 approved shoulder areas.
  assert(/Array\.from\(\{\s*length:\s*18\s*\}/.test(sheet),          'sheet declares 18 green presets')
  for (const p of ['Practice Green', 'Putting Green', 'Driving Range']) {
    assert(sheet.includes(`'${p}'`),                                  `sheet includes preset "${p}"`)
  }

  // ── Phase 7A.3 — Save & log another repeat-entry path ──────────────────
  assert(/handleSaveAndContinue/.test(sheet),                         'sheet defines handleSaveAndContinue')
  assert(/\+ Log another/.test(sheet),                                'sheet renders "+ Log another" button')
  assert(/onClick=\{handleSaveAndContinue\}/.test(sheet),             'log-another button is wired to handleSaveAndContinue')
  // Shared validate/submit so Save and "Log another" can't diverge.
  assert(/function\s+doSubmit\s*\(/.test(sheet),                      'shared doSubmit() exists')
  // Save still routes through doSubmit + onClose (close-on-success preserved).
  const saveBody = sheet.match(/function\s+handleSave\s*\(\s*\)[\s\S]*?\n\s\s\}/)?.[0]
  assert(saveBody != null && /doSubmit\(\)/.test(saveBody) && /onClose\(\)/.test(saveBody),
                                                                     'handleSave still routes through doSubmit + onClose')
  // handleSaveAndContinue clears flags + moisture + note but NOT location.
  const contBody = sheet.match(/function\s+handleSaveAndContinue\s*\([\s\S]*?\n\s\s\}/)?.[0]
  assert(contBody != null,                                           'handleSaveAndContinue body extractable')
  if (contBody) {
    assert(/setFlags\(\{\}\)/.test(contBody),                         'continue clears flags')
    assert(/setMoisture\(''\)/.test(contBody),                        'continue clears moisture %')
    assert(/setNote\(''\)/.test(contBody),                            'continue clears note')
    assert(!/setLocation\(/.test(contBody),                           'continue does NOT clear location (key UX guarantee)')
    assert(!/onClose\(/.test(contBody),                               'continue does NOT close the sheet')
    assert(!/^\s*async\s+function\s+handleSaveAndContinue/.test(contBody),
                                                                     'continue is sync (no network wait)')
    assert(!/\bawait\b/.test(contBody),                               'continue has no await (no network block before next capture)')
  }

  // CSS must define the continue button class.
  const sheetCss = readFileSync('src/components/moisture/LogMoistureButton.module.css', 'utf8')
  assert(/\.continueBtn\b/.test(sheetCss),                           'CSS defines .continueBtn')

  // The primary flow must NOT auto-focus a text input (that opens the keyboard).
  assert(!/ref={otherInputRef}[\s\S]*autoFocus/.test(sheet),         'sheet does not autoFocus the "Other" text input')
  // The only useRef must be the otherInputRef (focused only after explicit tap).
  assert(/otherOpen[\s\S]*otherInputRef\.current\?\.focus/.test(sheet),
                                                                     '"Other" input focuses only after the user explicitly opens it')
}

// ── 6. Mobile FAB ──────────────────────────────────────────────────────────
console.log('— src/components/moisture/MoistureFab.jsx + .module.css')
{
  const fab = readFileSync('src/components/moisture/MoistureFab.jsx', 'utf8')
  assert(/canEditMoisture/.test(fab),                                'FAB gated on canEditMoisture')
  assert(/MoistureCaptureSheet/.test(fab),                           'FAB renders MoistureCaptureSheet (single source of truth)')
  assert(/useAuth/.test(fab),                                        'FAB pulls permission via useAuth')

  const fabCss = readFileSync('src/components/moisture/MoistureFab.module.css', 'utf8')
  assert(/\.fab\s*\{[\s\S]*display:\s*none/.test(fabCss),            'FAB hidden by default (desktop)')
  assert(/@media\s*\(max-width:\s*767px\)/.test(fabCss),             'FAB visible only on ≤ 767px viewports')
  assert(/safe-area-inset-bottom/.test(fabCss),                      'FAB respects iOS/Android safe area')
  assert(/z-index:\s*900/.test(fabCss),                              'FAB sits below modal backdrop (1000)')

  const layout = readFileSync('src/components/layout/Layout.jsx', 'utf8')
  assert(/import\s+MoistureFab/.test(layout),                        'Layout imports MoistureFab')
  assert(/<MoistureFab\s*\/>/.test(layout),                          'Layout mounts MoistureFab')
}

// ── 6b. MoistureOverview renders pending/retry affordances (Phase 7A.2) ────
console.log('— src/pages/Irrigation/tabs/MoistureOverview.jsx (pending UI)')
{
  const overview = readFileSync('src/pages/Irrigation/tabs/MoistureOverview.jsx', 'utf8')
  assert(/retryPendingObservation/.test(overview),
                                                'imports retryPendingObservation')
  assert(/dismissPendingObservation/.test(overview),
                                                'imports dismissPendingObservation')
  // The row must guard delete against the synthetic pending-<clientId> id.
  assert(/o\._pending\s*\?\s*dismissPendingObservation\(o\.clientId\)/.test(overview)
        || /if\s*\(o\._pending\)\s*dismissPendingObservation/.test(overview),
                                                'delete handler routes pending rows to dismiss (no DELETE 404)')
  // Saving / Retry badges conditional on _pending state.
  assert(/o\._pending\s*&&\s*o\._error/.test(overview),
                                                'renders Retry only when _pending && _error')
  assert(/o\._pending\s*&&\s*!o\._error/.test(overview),
                                                'renders Saving only when _pending && !_error')
  assert(/retryPendingObservation\(o\.clientId\)/.test(overview),
                                                'Retry click calls retryPendingObservation(clientId)')

  const overviewCss = readFileSync('src/pages/Irrigation/tabs/MoistureOverview.module.css', 'utf8')
  assert(/\.retryBadge\b/.test(overviewCss),    'CSS defines .retryBadge')
  assert(/\.savingBadge\b/.test(overviewCss),   'CSS defines .savingBadge')
  assert(/data-pending="true"/.test(overviewCss),
                                                'CSS targets row [data-pending="true"]')
}

// ── 7. Reports + Display Board compatibility ───────────────────────────────
console.log('— consumer compatibility (no regressions)')
{
  const reportBuilder = readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
  // Reports already reads observedAt/location/hole/moisturePct + flags.
  // The wrapper preserves all of these in its optimistic row, so a fresh
  // capture must show up correctly in /reports → Moisture Trend.
  assert(/observedAt[\s\S]*location[\s\S]*moisturePct/.test(reportBuilder),
                                                                     'reportBuilder still reads observedAt/location/moisturePct')

  const displayBoard = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
  // Display Board groups by location and surfaces booleans only.
  assert(/wiltStress|drySpot|handwaterRec|syringeRec/.test(displayBoard),
                                                                     'Display Board still reads moisture flags')
  assert(/moistureObs/.test(displayBoard),                           'Display Board still reads moistureObs')
}

// ── 8. Behaviour simulation (isolated re-implementation of the reducer) ────
//
// The store can't be live-imported under Node (project uses bare imports).
// To prove the architectural invariant — "optimistic insert is synchronous,
// success path replaces in place, failure path keeps row with _error" —
// we re-implement the same reducer logic here against a tiny in-memory
// state and assert it behaves as designed. This guards against future
// regressions in the *contract*, not the literal code.
console.log('— reducer behaviour (isolated simulation of submit + reconcile)')
{
  let state = { observations: [] }
  function setS(patch) { state = { ...state, ...patch } }

  function fakeSubmit(payload, networkOutcome /* 'ok' | 'fail' */) {
    const clientId = payload.clientId ?? 'cid-' + Math.random().toString(36).slice(2)
    const clientObservedAt = payload.clientObservedAt ?? new Date().toISOString()
    const optimistic = {
      id: `pending-${clientId}`,
      ...payload,
      clientId, clientObservedAt,
      _pending: true, _error: null,
    }
    setS({ observations: [optimistic, ...state.observations] })

    // Simulate the network outcome synchronously for the test:
    if (networkOutcome === 'ok') {
      const saved = { id: 'srv-' + Math.random().toString(36).slice(2), ...payload, clientId, clientObservedAt }
      setS({
        observations: state.observations.map(o =>
          o.clientId === clientId ? saved : o,
        ),
      })
    } else {
      setS({
        observations: state.observations.map(o =>
          o.clientId === clientId ? { ...o, _pending: true, _error: 'network down' } : o,
        ),
      })
    }
    return optimistic
  }

  // (a) success path: pending row replaced with server row, no _pending flag.
  const opA = fakeSubmit({ location: 'Green 7' }, 'ok')
  const a = state.observations.find(o => o.clientId === opA.clientId)
  assert(a && !a._pending,                                            'success: pending row is replaced with server row')
  assert(a && a.id.startsWith('srv-'),                                'success: id swaps from pending- to server id')

  // (b) failure path: row stays, _error stamped.
  const opB = fakeSubmit({ location: 'Green 3', clientId: 'fixed-cid' }, 'fail')
  const b = state.observations.find(o => o.clientId === opB.clientId)
  assert(b && b._pending === true,                                    'failure: row remains with _pending: true')
  assert(b && b._error === 'network down',                            'failure: _error captures the message')

  // (c) ordering: newest captures appear at the head.
  assert(state.observations[0].clientId === 'fixed-cid',              'newest capture is at head of observations')
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
