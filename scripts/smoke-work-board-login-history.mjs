import { readFileSync } from 'node:fs'

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const migration = read('worker/migrations/0106_work_board_login_history.sql')
const auth = read('worker/api/workBoardAuth.js')
const crew = read('worker/api/crew.js')
const worker = read('worker/index.js')
const gate = read('src/pages/DisplayBoard/WorkBoardGate.jsx')
const employees = read('src/pages/Employees/Employees.jsx')
const roster = read('src/pages/Employees/tabs/EmployeeRoster.jsx')
const activity = read('src/pages/Employees/tabs/WorkBoardLogins.jsx')
const form = read('src/pages/Employees/components/EmployeeFormModal.jsx')

let passed = 0
let failed = 0
function section(name) { console.log(`\n— ${name} —`) }
function assert(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}`) }
}

section('Durable login history')
assert(/CREATE TABLE IF NOT EXISTS work_board_login_events/.test(migration), 'login event table is created')
assert(/employee_id\s+TEXT NOT NULL/.test(migration), 'login event records employee identity')
assert(/logged_in_at\s+TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/.test(migration), 'login event records server time')
assert(/pin_was_default\s+INTEGER NOT NULL/.test(migration), 'login event records default/personal PIN mode')
assert(/idx_work_board_login_events_course_time/.test(migration), 'course and time lookup is indexed')
assert(/INSERT INTO work_board_login_events/.test(auth), 'successful unlock writes a login event')
assert(/env\.DB\.batch\(\[/.test(auth), 'session and login event are written together')
assert(!/\bpin\s+TEXT/.test(migration), 'login history never stores a plaintext PIN')

section('First-login personal PIN')
assert(/ADD COLUMN work_board_pin_set_at TEXT/.test(migration), 'personal PIN setup timestamp is stored')
assert(/pinSetupRequired:\s*session\.employee_pin_hash == null/.test(auth), 'existing session reports setup state')
assert(/pinSetupRequired:\s*pinWasDefault/.test(auth), 'fresh unlock reports setup state')
assert(/export async function setOwnWorkBoardPin/.test(auth), 'employee self-service PIN handler exists')
assert(/Choose a personal PIN other than 2026/.test(auth), 'personal PIN cannot reuse the shared default')
assert(/hashPin\(pin\)/.test(auth), 'personal PIN is securely hashed')
assert(/DELETE FROM work_board_sessions[\s\S]*id <> \?/.test(auth), 'changing PIN revokes other board sessions')
assert(/pathname === '\/api\/work-board\/pin'/.test(worker), 'self-service PIN route is registered')
assert(/Create Your PIN/.test(gate), 'first-login PIN setup screen is rendered')
assert(/Keep 2026 for Now/.test(gate), 'employee may defer personal PIN setup')
assert(/Save My PIN/.test(gate), 'employee can save a personal PIN')
assert(/newPin !== confirmPin/.test(gate), 'new PIN confirmation is enforced')

section('Employee Management visibility')
assert(/workBoardLastLoginAt/.test(crew), 'employee serializer includes last Work Board login')
assert(/workBoardLoginCount/.test(crew), 'employee serializer includes Work Board login count')
assert(/workBoardPinSetAt/.test(crew), 'employee serializer includes PIN setup timestamp')
assert(/export async function listCrewWorkBoardLogins/.test(crew), 'manager login history query exists')
assert(/canViewEmployeePrivate/.test(worker) && /crew-work-board-logins/.test(worker), 'login history requires private employee permission')
assert(/Work Board Logins/.test(employees), 'Employee Management has a login activity tab')
assert(/Successful employee PIN logins are saved here automatically/.test(activity), 'activity view explains its source')
assert(/Default 2026/.test(activity) && /Personal PIN/.test(activity), 'activity view identifies PIN mode')
assert(/Work Board Access/.test(form), 'employee profile displays Work Board access summary')
assert(/Recent login activity/.test(form), 'employee profile displays recent login times')
assert(/Last Work Board login/.test(roster), 'employee roster displays latest login')
assert(!/workBoardPinHash/.test(activity + form + roster), 'frontend never receives or renders PIN hashes')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
