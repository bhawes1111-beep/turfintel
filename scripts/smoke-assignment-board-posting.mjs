// Daily Assignment Board publication smoke.
//
//   node scripts/smoke-assignment-board-posting.mjs
//
// Posting a date reveals every ordered job on the Display Board without
// rewriting assignments. Until then, each employee remains on the familiar
// first-job-only view. Weather delays and time-off suppression stay intact.

import { readFileSync } from 'fs'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  OK ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}`)
  }
}

function section(label) {
  console.log(`\n${label}`)
}

const dailyBoard = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const displayBoard = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const displayStore = readFileSync('src/utils/displayBoardStore.js', 'utf8')
const publicationClient = readFileSync('src/utils/assignments/assignmentBoardPublication.js', 'utf8')
const publicationApi = readFileSync('worker/api/assignmentBoardPublications.js', 'utf8')
const worker = readFileSync('worker/index.js', 'utf8')
const courseScope = readFileSync('worker/lib/courseScope.js', 'utf8')
const mutationPermissions = readFileSync('worker/lib/mutationPermissions.js', 'utf8')
const migration = readFileSync('worker/migrations/0107_assignment_board_publications.sql', 'utf8')

section('Course- and date-scoped persistence')
assert(/UNIQUE \(course_id, publication_date\)/.test(migration),
  'one publication marker per course and date')
assert(/ON CONFLICT\(course_id, publication_date\) DO UPDATE SET/.test(publicationApi),
  'posting is idempotent')
assert(/actorCanAccessCourse\(actor, courseId\)/.test(publicationApi),
  'posting enforces actor course access')
assert(/status:\s*'draft'/.test(publicationApi) && /posted:\s*false/.test(publicationApi),
  'missing publication fails closed as draft')
assert(courseScope.includes("'/api/assignment-board-publications'"),
  'publication reads use course scoping')
assert(/assignment-board-publications'\s*,\s*'canEditAssignments'/.test(mutationPermissions),
  'publication writes require assignment permission')

section('Worker feed and routes')
assert(/findAssignmentBoardPublication\(env, courseId, date\)/.test(worker),
  'consolidated Display Board feed loads publication state')
assert(/assignmentPublication:\s*\{[\s\S]{0,240}status:[\s\S]{0,160}posted:[\s\S]{0,120}\},\s*\n\s*displaySettings/.test(worker),
  'consolidated feed returns only sanitized publication state')
assert(/pathname === '\/api\/assignment-board-publications'/.test(worker),
  'publication API route is registered')
assert(/postAssignmentBoardPublication\(env, request, actor\)/.test(worker),
  'POST route records the authenticated actor')
assert(/assignmentPublication:\s*null/.test(displayStore),
  'empty client feed includes publication state')

section('Assignment Board Post action')
assert(/fetchAssignmentBoardPublication\(selectedDate, courseId\)/.test(dailyBoard),
  'assignment page loads the selected date publication')
assert(/postAssignmentBoard\(selectedDate, courseId\)/.test(dailyBoard),
  'Post action publishes the selected course and date')
assert(/data-variant="post"/.test(dailyBoard) && /:\s*'Post'/.test(dailyBoard),
  'assignment page renders a Post button')
assert(/dayJobCount/.test(dailyBoard) && /assignment\.subJobs\.length/.test(dailyBoard),
  'published job total includes main jobs and sub-jobs')
assert(/Draft - the Display Board shows first jobs only until you post/.test(dailyBoard),
  'draft state explains board behavior')
assert(/credentials:\s*'same-origin'/.test(publicationClient) && /mutationHeaders\(\)/.test(publicationClient),
  'client reuses authenticated mutation conventions')

section('Display Board behavior')
assert(/const firstJobsOnly = assignmentPublication\?\.status !== 'posted'/.test(displayBoard),
  'publication state controls full-job visibility')
assert(/if \(firstJobsOnly && op\.assignments\.length > 1\)/.test(displayBoard),
  'draft board trims each employee to the first job')
assert(!/selectedDate === isoToday\(\) && now\.getHours\(\) < 7/.test(displayBoard),
  'old 7:00 AM automatic reveal rule is removed')
assert(/normalizeCrewProgressStatus\(a\.status\) !== 'weather-delay'/.test(displayBoard),
  'weather-delayed jobs remain hidden from the Display Board')
assert(/op\.outStatus = merged\.status/.test(displayBoard) && /op\.assignments = \[\]/.test(displayBoard),
  'off, sick, and vacation rules remain intact')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
