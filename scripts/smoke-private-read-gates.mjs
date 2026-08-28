// Private read gate smoke.
//
// Contract: the employee display board is the only no-login app surface.
// Anonymous data reads must use /api/display-board/*; regular app reads require auth.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const index = readFileSync('worker/index.js', 'utf8')
const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const boardStore = readFileSync('src/utils/displayBoardStore.js', 'utf8')
const weatherApi = readFileSync('src/utils/weather/api.js', 'utf8')
const useWeather = readFileSync('src/utils/weather/useWeather.js', 'utf8')

for (const route of [
  "pathname === '/api/display-board/state'",
  "pathname === '/api/display-board/sprays'",
  "pathname === '/api/display-board/weather/current'",
]) {
  assert(index.includes(route), `worker exposes public board route ${route}`)
}

const boardRouteIdx = index.indexOf("pathname === '/api/display-board/state'")
const getGateMatch = /if \(method === 'GET'\) \{\r?\n    const actor = await resolveActor\(request, env\)/.exec(index)
const getGateIdx = getGateMatch?.index ?? -1
assert(boardRouteIdx > -1 && getGateIdx > -1 && boardRouteIdx < getGateIdx,
  'display-board routes are handled before the regular GET auth gate')
assert(/if \(method === 'GET'\) \{\s+const actor = await resolveActor\(request, env\)\s+if \(!actor\) return json\(\{ error: 'Unauthorized' \}, 401\)/.test(index),
  'regular API GET reads require an authenticated actor')

for (const path of ['/api/health', '/api/weather/ambient/current']) {
  const idx = index.indexOf(`pathname === '${path}'`)
  const block = index.slice(idx, idx + 320)
  assert(idx > -1 && block.includes('resolveActor(request, env)') && block.includes("return json({ error: 'Unauthorized' }, 401)"),
    `${path} is not anonymously readable`)
}

assert(/async function listDisplayBoardState/.test(index), 'worker bundles public display-board state')
for (const key of ['events', 'sprays', 'crewAssignments', 'equipmentReservations', 'alerts', 'employees', 'schedules', 'scheduleOverrides', 'notes', 'moisture']) {
  assert(index.includes(`${key}:`) || index.includes(`${key},`), `display-board state includes ${key}`)
}

assert(boardStore.includes("const API = '/api/display-board/state'"),
  'frontend board store targets only /api/display-board/state')
assert(/export async function fetchDisplayBoardState/.test(boardStore),
  'frontend exports fetchDisplayBoardState')

assert(board.includes('fetchDisplayBoardState'), 'DisplayBoard uses the public board state feed')
assert(!board.includes('fetchDisplayBoardSprays'), 'DisplayBoard no longer calls the spray-only feed directly')
for (const call of [
  'useCalendarData({ enabled: !boardMode })',
  'useSpraysData({ enabled: !boardMode })',
  'useAssignmentsData({ enabled: !boardMode })',
  'useAlertsData({ enabled: !boardMode })',
  'useCrewData({ enabled: !boardMode })',
  'useEmployeeSchedulesData({ enabled: !boardMode })',
  'useScheduleOverridesData({ enabled: !boardMode })',
  'useOperationsNotesData({ enabled: !boardMode })',
  'useMoistureData({ enabled: !boardMode })',
  'useSelectedCourse({ enabled: !boardMode })',
]) {
  assert(board.includes(call), `DisplayBoard disables private store call: ${call}`)
}

assert(useWeather.includes("publicBoard ? '/api/display-board/weather/current' : undefined"),
  'board weather uses the public display-board weather route')
assert(weatherApi.includes("ambientPath = '/api/weather/ambient/current'"),
  'logged-in weather keeps the normal private Ambient proxy route')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
