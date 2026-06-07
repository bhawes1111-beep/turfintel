// Display Board privacy + weather-impacts smoke test.
//
//   node scripts/smoke-display-board-privacy.mjs
//
// Two guarantees for the crew-facing Display Board:
//   1. PRIVACY — the board source must never reference the course condition
//      log or any private-notes field. Private superintendent notes live in
//      course_condition_logs and must not be reachable from the crew board.
//   2. weatherImpacts() produces correct crew-facing impact chips.

import { readFileSync } from 'fs'
import { weatherImpacts } from '../src/utils/weather/weatherImpacts.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. PRIVACY — static scan of the Display Board source ──────────────────
{
  const src = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
  // Forbidden: any wiring of the condition log or private notes into the board.
  const FORBIDDEN = [
    'conditionLogStore',
    'conditionLog/',
    'private_notes',
    'privateNotes',
    'course_condition',
    'course-condition',
    '/api/condition-logs',
  ]
  for (const term of FORBIDDEN) {
    assert(!src.includes(term), `Display Board does not reference "${term}"`)
  }
  // The shared panel the board renders must also stay clean.
  const panel = readFileSync('src/components/shared/OperationalIntelligencePanel.jsx', 'utf8')
  for (const term of ['conditionLog', 'private_notes', 'privateNotes', 'course_condition']) {
    assert(!panel.includes(term), `OperationalIntelligencePanel does not reference "${term}"`)
  }
}

// ── 2. weatherImpacts ─────────────────────────────────────────────────────
{
  assert(weatherImpacts({}, []).length === 0, 'no data → no impacts (honest clear state)')

  const frost = weatherImpacts({ currentTemp: 33 }, [])
  assert(frost.some(i => i.key === 'frost' && i.severity === 'alert'), 'cold current → frost alert', frost)

  const frostFc = weatherImpacts({ currentTemp: 55 }, [{ low: 34 }])
  assert(frostFc.some(i => i.key === 'frost'), 'forecast low ≤36 → frost', frostFc)

  const wind = weatherImpacts({ currentTemp: 60, wind: 18 }, [])
  assert(wind.some(i => i.key === 'wind'), 'wind ≥15 → high wind', wind)

  const heat = weatherImpacts({ currentTemp: 90, humidity: 40, wind: 5 }, [])
  assert(heat.some(i => i.key === 'heat'), 'temp ≥85 → heat', heat)

  const rain = weatherImpacts({ currentTemp: 60 }, [{ rainfall: 0.8 }])
  assert(rain.some(i => i.key === 'rain'), 'rainfall ≥0.5 → heavy rain', rain)

  const mild = weatherImpacts({ currentTemp: 68, humidity: 55, wind: 6 }, [{ low: 50, rainfall: 0 }])
  assert(mild.length === 0, 'mild conditions → no impacts', mild)
}

// ── 3. PERMISSION LAYER — private notes restricted to authorized roles ─────
{
  const { can } = await import('../src/utils/auth/permissions.js')
  // Crew-tier roles must never have the private-notes permission.
  assert(!can('crew', 'canViewPrivateNotes'), 'crew denied private notes')
  assert(!can('crew_lead', 'canViewPrivateNotes'), 'crew_lead denied private notes')
  assert(!can('read_only', 'canViewPrivateNotes'), 'read_only denied private notes')
  assert(!can('assistant_super', 'canViewPrivateNotes'), 'assistant denied private notes (no override)')
  // Authorized roles keep access.
  assert(can('superintendent', 'canViewPrivateNotes'), 'superintendent retains private notes')
  assert(can('owner_admin', 'canViewPrivateNotes'), 'owner_admin retains private notes')

  // The condition-log editor must gate the field on the permission, and must
  // not hydrate/save it for unauthorized sessions.
  const tab = readFileSync('src/pages/Operations/ConditionLogTab.jsx', 'utf8')
  assert(tab.includes('canViewPrivateNotes'), 'ConditionLogTab checks canViewPrivateNotes')
  assert(tab.includes('delete payload.privateNotes'), 'ConditionLogTab strips privateNotes from unauthorized save')
}

// ── 4. SERVER-SIDE private_notes enforcement (Phase 2 P1) ──────────────────
{
  // The API gate must resolve the actor and pass canViewPrivateNotes into the
  // condition-log reads — so private_notes is stripped server-side, not just
  // hidden in the UI.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(idx.includes("actorHasPermission(actor, 'canViewPrivateNotes')"), 'worker resolves canViewPrivateNotes for condition-log reads')
  assert(/listConditionLogs\(env, courseId, \{ days \}, canViewPrivate\)/.test(idx), 'list read threads canViewPrivate')
  assert(/getConditionLogByDate\(env, courseId, date, canViewPrivate\)/.test(idx), 'by-date read threads canViewPrivate')

  // The serializer omits the field for unauthorized actors.
  const api = readFileSync('worker/api/conditionLog.js', 'utf8')
  assert(/if \(canViewPrivate\) out\.privateNotes = row\.private_notes/.test(api), 'serializer omits privateNotes unless authorized')
}

// ── Phase 8B.1a — Crosswinds shop-style Display Board layout shell ──────
// Source-only checks against DisplayBoard.jsx + DisplayBoard.module.css.
// The shell is Crosswinds-gated via courseId === 'crossroads-gc'; the
// existing JSX subtrees are reused in place (sidebar / taskBoard /
// notesColumn / dateStrip) — CSS Grid template areas do the layout
// work via a data-shop-layout="true" attribute. No iteration model
// change yet. boardMode + printMode preserved. Other courses get the
// legacy layout byte-for-byte.
{
  console.log('— Phase 8B.1a: Crosswinds shop Display Board layout shell —')
  const db  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
  const css = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

  // Crosswinds gate.
  assert(/useSelectedCourseId/.test(db),
    'DisplayBoard imports/uses useSelectedCourseId')
  assert(/courseId === 'crossroads-gc'/.test(db),
    "DisplayBoard gates the shop layout on courseId === 'crossroads-gc'")
  assert(/const\s+isCrosswinds\s*=\s*courseId === 'crossroads-gc'/.test(db),
    'isCrosswinds boolean is derived from courseId')

  // Shop layout marker on the root.
  assert(/data-shop-layout=\{isCrosswinds \? 'true' : undefined\}/.test(db),
    'root carries data-shop-layout="true" only for Crosswinds')
  assert(/styles\.dbWrapShop/.test(db),
    'Crosswinds root receives the styles.dbWrapShop class')

  // Four region classes are used in JSX (dbLeft / dbCenter / dbRight / dbBottom).
  for (const region of ['dbLeft', 'dbCenter', 'dbRight', 'dbBottom']) {
    assert(new RegExp(`styles\\.${region}`).test(db),
      `DisplayBoard.jsx wires styles.${region}`)
  }

  // Legacy classes still exist in JSX (other courses use them; the shop
  // layout reuses the same subtrees so they need both classes).
  for (const legacy of ['sidebar', 'taskBoard', 'notesColumn', 'dateStrip']) {
    assert(new RegExp(`styles\\.${legacy}\\b`).test(db),
      `legacy class styles.${legacy} still present in JSX`)
  }

  // CSS gates the layout on the data attribute and defines all five
  // shop classes.
  assert(/\.root\[data-shop-layout="true"\]/.test(css),
    'CSS gates shop layout on .root[data-shop-layout="true"]')
  for (const region of ['dbLeft', 'dbCenter', 'dbRight', 'dbBottom', 'dbAlertBanner']) {
    assert(new RegExp(`\\.${region}\\b`).test(css),
      `CSS defines .${region}`)
  }
  assert(/\.dbWrapShop\b/.test(css),
    'CSS defines .dbWrapShop')

  // The shop layout uses CSS Grid template areas.
  assert(/grid-template-areas:\s*\n?\s*"left center right"/.test(css)
      || /grid-template-areas:[^;]*"left center right"/.test(css),
    'shop layout uses grid-template-areas: left center right / left bottom right')

  // Legacy CSS classes preserved for non-Crosswinds courses.
  for (const legacy of ['root', 'sidebar', 'taskBoard', 'notesColumn', 'dateStrip']) {
    assert(new RegExp(`\\.${legacy}\\s*\\{`).test(css),
      `legacy CSS class .${legacy} still defined`)
  }

  // Bottom alert banner is gated on high-priority alerts only.
  assert(/liveAlerts\.find\(a => a\.priority === 'high'\)/.test(db),
    'bottom alert banner picks only high-priority alerts')
  assert(/isCrosswinds && topAlert &&/.test(db),
    'bottom alert banner renders only when Crosswinds AND a topAlert exists')

  // Print mode + board mode wiring preserved on the root.
  assert(/data-print-mode=\{printMode \? 'true' : undefined\}/.test(db),
    'data-print-mode attribute preserved on root')
  assert(/data-board-mode=\{boardMode \? 'true' : undefined\}/.test(db),
    'data-board-mode attribute added/preserved on root')
  assert(/rootBoard/.test(db) && /rootPrint/.test(db),
    'rootBoard + rootPrint classes still computed in rootCls')

  // Media queries mirror the existing breakpoints so the shell
  // collapses safely on tablet/mobile.
  for (const bp of ['1280', '900', '600']) {
    assert(new RegExp(`@media \\(max-width:\\s*${bp}px\\)`).test(css),
      `CSS includes @media (max-width: ${bp}px) breakpoint`)
  }

  // Cross-file guard: stores / worker / D1 were NOT modified by 8B.1a.
  const store = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
  assert(!store.includes('Phase 8B.1a'),
    'assignmentsStore.js carries no Phase 8B.1a edits')
  const notes = readFileSync('src/utils/operations/notesStore.js', 'utf8')
  assert(!notes.includes('Phase 8B.1a'),
    'notesStore.js carries no Phase 8B.1a edits')
  const app = readFileSync('src/App.jsx', 'utf8')
  assert(!app.includes('Phase 8B.1a'),
    'App.jsx carries no Phase 8B.1a edits')
}

// ── Phase 8B.1b — Operator-first Display Board cards (Crosswinds) ───────
// Source-only checks against DisplayBoard.jsx + DisplayBoard.module.css.
// The center grid renders one card per operator with a numbered list
// of that operator's assignments. Per-assignment equipment chips use
// the Phase 10 crewAssignmentId linkage. Falls back to legacy
// TaskCard render when Crosswinds has tasks but no DB-backed crew
// assignments yet. Non-Crosswinds courses keep the legacy event-first
// TaskCard grid byte-for-byte.
{
  console.log('— Phase 8B.1b: Crosswinds operator-first Display Board cards —')
  const db  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
  const css = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

  // operatorCards useMemo derivation exists with the right dependencies.
  assert(/const\s+operatorCards\s*=\s*useMemo\(/.test(db),
    'operatorCards useMemo derivation defined')
  // Phase 9C.5c4 added employeeById to the dep list so per-operator
  // translation prefs (autoTranslateBoardNotes + boardLanguage) thread
  // into the showSpanishNotes flag. Accept both the legacy 4-entry list
  // (pre-9C.5c4) and the 5-entry list with employeeById appended.
  assert(/\[dayCrew,\s*dayEvents,\s*equipByEvent,\s*employeeNameLookup(?:,\s*employeeById)?\]/.test(db),
    'operatorCards depends on dayCrew, dayEvents, equipByEvent, employeeNameLookup (+ employeeById from 9C.5c4)')

  // Grouping key uses employeeId first, fallback to employeeName.
  assert(/a\.employeeId\s*\?\?\s*a\.employeeName/.test(db),
    'operator grouping key is employeeId ?? employeeName')

  // Orphan rows skipped (no key, missing event).
  assert(/if \(!key\) continue/.test(db),
    'rows with no employee key are skipped')
  assert(/if \(!event\) continue/.test(db),
    'rows pointing to a missing event are skipped')

  // Equipment chips: filter by crewAssignmentId === a.id (Phase 10 linkage).
  assert(/r\.crewAssignmentId === a\.id/.test(db),
    'equipment chips filter by reservation.crewAssignmentId === assignment.id')

  // Fallback to event.equipment[] only when no linked AND no event chips.
  assert(/event\.equipment[\s\S]{0,80}\.map\(\(name, i\) =>/.test(db),
    'event.equipment[] fallback path exists for legacy events')
  assert(/linkedChips\.length === 0 && allChipsForEvent\.length === 0/.test(db),
    'fallback chips only when no linked AND no reservation rows exist')

  // Sorts: assignments by startTime then priority; operators by name.
  assert(/x\.startTime\b[\s\S]{0,60}localeCompare\(y\.startTime/.test(db),
    'assignments sort by startTime')
  assert(/PRIORITY_ORDER\[x\.priority\][\s\S]{0,60}PRIORITY_ORDER\[y\.priority\]/.test(db),
    'assignments break ties by priority')
  assert(/x\.employeeName[\s\S]{0,60}localeCompare\(y\.employeeName/.test(db),
    'operators sort by employee name')

  // Center grid render branches on isCrosswinds && operatorCards.length > 0.
  assert(/\(isCrosswinds && operatorCards\.length > 0\)/.test(db),
    "center grid branches on 'isCrosswinds && operatorCards.length > 0'")
  // Phase 9C.3b — render is now multi-line because <OperatorCard>
  // receives additional canDeleteTasks + onDeleteEvent props. Match
  // either the legacy single-line form or any whitespace/newline
  // followed by the element opener.
  assert(/operatorCards\.map\(op => \(\s*<OperatorCard[\s>]/.test(db),
    'operator-first branch maps operatorCards → <OperatorCard>')

  // Legacy TaskCard render still present (fallback + non-Crosswinds).
  assert(/dayEvents\.map\(ev => \(\s*<TaskCard/.test(db),
    'legacy <TaskCard> render still present in the fallback / non-Crosswinds branch')

  // OperatorCard helper component exists. Phase 9C.3b widened the
  // destructure to include canDeleteTasks + onDeleteEvent — accept any
  // signature that starts with `operator`.
  assert(/function\s+OperatorCard\s*\(\s*\{\s*operator[\s,}]/.test(db),
    'OperatorCard local helper function is defined')
  assert(/function\s+operatorInitials\s*\(/.test(db),
    'operatorInitials helper for avatar text is defined')

  // Numbered assignment list uses idx + 1.
  assert(/\{idx \+ 1\}/.test(db),
    'numbered assignment list renders {idx + 1}')

  // Notes + status surfaces.
  assert(/className=\{styles\.operatorAssignNotes\}/.test(db),
    'assignment notes render via .operatorAssignNotes')
  assert(/<CrewStatusControl\s*[\s\S]{0,200}assignmentId=\{a\.id\}/.test(db),
    'OperatorCard mounts CrewStatusControl per assignment line')

  // Equipment chip rendering inside the operator assignment row.
  assert(/className=\{styles\.operatorAssignChips\}/.test(db),
    'per-assignment equipment chips render via .operatorAssignChips')

  // New CSS classes exist.
  for (const cls of [
    'operatorCard', 'operatorCardHeader', 'operatorAvatar',
    'operatorNameBlock', 'operatorName', 'operatorRole',
    'operatorCount', 'operatorAssignList', 'operatorAssignRow',
    'operatorAssignTop', 'operatorAssignNum', 'operatorAssignTitle',
    'operatorAssignMeta', 'operatorAssignNotes', 'operatorAssignChips',
    'operatorEmpty',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css),
      `CSS defines .${cls}`)
  }

  // Print-safe: break-inside: avoid on the operator card.
  assert(/\.operatorCard\b[\s\S]{0,400}break-inside:\s*avoid/.test(css),
    'operator card carries break-inside: avoid for print')

  // Existing 8B.1a / boardMode / printMode root attrs still preserved.
  assert(/data-shop-layout=\{isCrosswinds \? 'true' : undefined\}/.test(db),
    'Phase 8B.1a shop-layout marker still present')
  assert(/data-print-mode=\{printMode \? 'true' : undefined\}/.test(db),
    'data-print-mode attribute preserved')
  assert(/data-board-mode=\{boardMode \? 'true' : undefined\}/.test(db),
    'data-board-mode attribute preserved')
  assert(/rootBoard/.test(db) && /rootPrint/.test(db),
    'rootBoard + rootPrint classes still computed in rootCls')

  // Status vocabulary unchanged (we reuse CrewStatusControl as-is).
  for (const sym of ['PROGRESS_STATUSES', 'PROGRESS_LABEL', 'PROGRESS_SHORT']) {
    assert(new RegExp(`\\b${sym}\\b`).test(db),
      `status vocabulary symbol ${sym} still present`)
  }

  // Cross-file guards: stores / worker / app / Operations / Crew files
  // carry no Phase 8B.1b marker.
  for (const path of [
    'src/utils/assignments/assignmentsStore.js',
    'src/utils/operations/notesStore.js',
    'src/App.jsx',
    'src/pages/Operations/OperationsBoard.jsx',
    'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
    'src/pages/Crew/tabs/CrewAssignments.jsx',
  ]) {
    const src = readFileSync(path, 'utf8')
    assert(!src.includes('Phase 8B.1b'),
      `${path} carries no Phase 8B.1b edits`)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
