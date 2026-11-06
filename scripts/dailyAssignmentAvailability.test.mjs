import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const board = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const styles = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

test('daily assignment board exposes the schedule availability choices', () => {
  for (const [value, label] of [
    ['scheduled', 'Scheduled'],
    ['off', 'Off'],
    ['vacation', 'Vacation'],
    ['sick', 'Sick'],
  ]) {
    assert.match(board, new RegExp(`value: '${value}',\\s+label: '${label}'`))
  }
  assert.match(board, /<th>Role<\/th>[\s\S]{0,100}<th>Availability<\/th>[\s\S]{0,100}<th>Task<\/th>/)
})

test('every non-inactive employee remains on the daily roster', () => {
  const roster = board.match(/const dayEmployees = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[employees\]\)/)?.[0] ?? ''
  assert.match(roster, /employees[\s\S]*?\.filter\(e => e\.status !== 'inactive'\)/)
  assert.doesNotMatch(roster, /assignedEmpIds|recurringScheduledIds|status === 'scheduled'/)
})

test('availability edits reuse the course-scoped schedule override store', () => {
  assert.match(board, /createScheduleOverride/)
  assert.match(board, /patchScheduleOverride/)
  const handler = board.match(/async function handleAvailabilityChange\(employee, nextStatus\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(handler, /patchScheduleOverride\(existingOverride\.id, \{ status: nextStatus \}\)/)
  assert.match(handler, /createScheduleOverride\(\{[\s\S]*?effectiveDate: selectedDate,[\s\S]*?status: nextStatus/)
})

test('away employees stay visible but cannot receive new work', () => {
  assert.match(board, /const isAvailable = availabilityStatus === 'scheduled'/)
  assert.match(board, /disabled=\{!isAvailable \|\| busyEmpId === emp\.id \|\| activeTaskTemplates\.length === 0\}/)
  assert.match(board, /data-availability=\{availabilityStatus\}/)
  assert.match(styles, /\.availabilitySelect\[data-status="sick"\]/)
  assert.match(styles, /\.availabilitySelect\[data-status="vacation"\]/)
  assert.match(styles, /\.assignTable tbody tr\[data-availability="off"\]/)
})
