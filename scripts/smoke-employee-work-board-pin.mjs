#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { hashPin, verifyPassword } from '../worker/lib/passwords.js'

let passed = 0
let failed = 0
function assert(condition, label) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    console.error(`  ✗ ${label}`)
  }
}

const migration = readFileSync('worker/migrations/0105_employee_work_board_pin.sql', 'utf8')
const workBoardApi = readFileSync('worker/api/workBoardAuth.js', 'utf8')
const crewApi = readFileSync('worker/api/crew.js', 'utf8')
const workerIndex = readFileSync('worker/index.js', 'utf8')
const employeeModal = readFileSync('src/pages/Employees/components/EmployeeFormModal.jsx', 'utf8')
const gate = readFileSync('src/pages/DisplayBoard/WorkBoardGate.jsx', 'utf8')
const app = readFileSync('src/App.jsx', 'utf8')
const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')

console.log('\n— PIN hashing and persistence —')
const pinHash = await hashPin('3184')
assert(pinHash.startsWith('pbkdf2$100000$'), 'custom PIN uses PBKDF2 storage')
assert(await verifyPassword('3184', pinHash), 'custom PIN verifies')
assert(!(await verifyPassword('2026', pinHash)), 'wrong PIN is rejected')
let rejected = false
try { await hashPin('12345') } catch { rejected = true }
assert(rejected, 'PIN hashing rejects values that are not exactly four digits')
assert(/ADD COLUMN work_board_pin_hash TEXT/.test(migration), 'employee schema stores only a PIN hash')
assert(/CREATE TABLE IF NOT EXISTS work_board_sessions/.test(migration), 'opaque Work Board sessions are persisted')
assert(/CREATE TABLE IF NOT EXISTS work_board_pin_attempts/.test(migration), 'PIN attempts have a separate throttle table')

console.log('\n— Employee profile workflow —')
assert(/workBoardPin:\s*employee \? '' : '2026'/.test(employeeModal), 'new employees start with PIN 2026')
assert(/Current PIN/.test(employeeModal) && /pinIsDefault === true \? '2026'/.test(employeeModal), 'employee profile shows the default PIN')
assert(/Personal PINs are securely hashed and cannot be displayed/.test(employeeModal), 'personal PIN stays protected when reopening a profile')
assert(/inputMode="numeric"/.test(employeeModal) && /maxLength=\{4\}/.test(employeeModal), 'profile PIN control is four-digit mobile friendly')
assert(/if \(form\.workBoardPin\) payload\.workBoardPin/.test(employeeModal), 'blank edit preserves a custom PIN')
assert(/Reset to 2026/.test(employeeModal), 'profile includes a forgotten-PIN reset action')
assert(/pin === DEFAULT_WORK_BOARD_PIN \? null : hashPin\(pin\)/.test(crewApi), 'default 2026 is represented without plaintext storage')
assert(/out\.workBoardPinIsDefault = row\.work_board_pin_hash == null/.test(crewApi), 'manager sees only default/custom state')
assert(!/out\.workBoardPin\s*=/.test(crewApi), 'employee API never returns the PIN')

console.log('\n— Work Board access —')
for (const endpoint of ['employees', 'session', 'unlock', 'logout']) {
  assert(workerIndex.includes(`/api/work-board/${endpoint}`), `worker registers ${endpoint} endpoint`)
}
assert(/canViewWorkBoard\(request, env, boardCourseId\)/.test(workerIndex), 'board data requires Work Board authorization')
assert(/HttpOnly; Secure; SameSite=Lax/.test(workBoardApi), 'Work Board cookie is HttpOnly, Secure, and SameSite')
assert(/MAX_FAILED_ATTEMPTS = 8/.test(workBoardApi), 'PIN guessing is rate limited')
assert(/status = 'active'/.test(workBoardApi), 'only active employees can unlock the board')
assert(/actorCanAccessCourse\(actor, scopedCourse\)/.test(workBoardApi), 'manager bypass still enforces course access')

console.log('\n— Mobile unlock and lock controls —')
assert(app.includes('<WorkBoardGate />'), 'public board route uses the PIN gate')
assert(/Select your name and enter your employee PIN/.test(gate), 'unlock screen gives direct crew instructions')
assert(/Open Work Board/.test(gate), 'unlock screen has a clear field action')
assert(/onLock=\{session\.mode === 'employee'/.test(gate), 'employee sessions receive a lock action')
assert(/Lock · \$\{workBoardViewerName\}/.test(board), 'board shows who is signed in and can be locked')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
