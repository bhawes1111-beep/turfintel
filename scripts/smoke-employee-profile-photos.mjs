#!/usr/bin/env node

import { readFileSync } from 'node:fs'

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

function section(label) {
  console.log(`\n— ${label} —`)
}

const migration = readFileSync('worker/migrations/0097_employee_profile_photos.sql', 'utf8')
const api = readFileSync('worker/api/crewProfilePhotos.js', 'utf8')
const crew = readFileSync('worker/api/crew.js', 'utf8')
const courses = readFileSync('worker/api/courses.js', 'utf8')
const index = readFileSync('worker/index.js', 'utf8')
const courseScope = readFileSync('worker/lib/courseScope.js', 'utf8')
const crewStore = readFileSync('src/utils/crew/crewStore.js', 'utf8')
const employeeModal = readFileSync('src/pages/Employees/components/EmployeeFormModal.jsx', 'utf8')
const employeeRoster = readFileSync('src/pages/Employees/tabs/EmployeeRoster.jsx', 'utf8')
const settings = readFileSync('src/pages/Settings/sections/CourseConfigurationSection.jsx', 'utf8')
const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const boardStore = readFileSync('src/utils/displayBoardStore.js', 'utf8')

section('Additive persistence and defaults')
assert(/ALTER TABLE courses[\s\S]*ADD COLUMN display_board_show_profile_photos INTEGER NOT NULL DEFAULT 0/i.test(migration),
  'course setting is additive and defaults off')
assert(/parent_type = 'crew_employee'/.test(api),
  'profile photos reuse operational_attachments metadata')
assert(/attachments\/\$\{courseId\}\/crew_employee\/\$\{employeeId\}/.test(api),
  'R2 object keys are partitioned by course and employee')

section('Upload validation and replacement behavior')
for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
  assert(api.includes(`'${type}'`), `${type} is accepted`)
}
assert(/MAX_PROFILE_PHOTO_BYTES = 5 \* 1024 \* 1024/.test(api),
  'profile uploads are capped at 5 MB')
assert(/replace\(\/\[\^a-zA-Z0-9\._-\]\+\/g, '-'/m.test(api),
  'uploaded filenames are sanitized')
assert(/env\.DB\.batch\(statements\)/.test(api),
  'replacement metadata changes are committed together')
assert(/env\.PHOTOS\.delete\(current\.r2_key\)/.test(api),
  'replaced and removed objects are deleted from R2')

section('Authentication and course scoping')
assert(/actorCanAccessCourse\(actor, courseId\)/.test(api),
  'private upload, delete, and stream operations enforce actor course access')
assert(/crew_employees WHERE id = \? AND course_id = \?/.test(api),
  'employee lookup requires both employee id and course id')
assert(courseScope.includes("'/api/crew-employees'"),
  'crew employee reads participate in the central course scope guard')
assert(index.includes("const employeePhotoMatch = pathname.match(/^\\/api\\/crew-employees"),
  'authenticated employee photo route is registered')
assert(index.indexOf('const employeePhotoMatch') > index.indexOf("if (method === 'GET') {\n    const actor"),
  'private photo route remains behind the central GET authentication gate')

section('Public Display Board guard')
assert(/SELECT display_board_show_profile_photos[\s\S]*FROM courses/.test(api),
  'public photo stream reads the course setting')
assert(/display_board_show_profile_photos !== 1[\s\S]*status: 404/.test(api),
  'public photo stream returns 404 while the setting is off')
assert(index.includes('/api/display-board/employee-photos/'),
  'board-specific public image route is registered')
assert(index.indexOf('const publicEmployeePhotoMatch') < index.indexOf('// ── Mutation auth + permission gate'),
  'only the narrow board image route is reachable before auth')
assert(/profilePhotoUrl: showEmployeeProfilePhotos && employee\.hasProfilePhoto/.test(index),
  'board payload exposes a public image URL only when enabled')
assert(/hasProfilePhoto: showEmployeeProfilePhotos && Boolean\(employee\.hasProfilePhoto\)/.test(index),
  'board payload hides saved-photo metadata while the setting is off')
assert(/displaySettings: \{ showEmployeeProfilePhotos \}/.test(index),
  'board payload includes the effective photo setting')
assert(boardStore.includes('showEmployeeProfilePhotos: false'),
  'client board state also defaults photos off')

section('Employee management workflow')
assert(/new FormData\(\)/.test(crewStore) && /form\.set\('file', file\)/.test(crewStore),
  'employee store uploads the image as multipart form data')
assert(/uploadCrewEmployeeProfilePhoto\(saved\.id, photoFile\)/.test(employeeModal),
  'photo upload follows a successful employee save')
assert(/deleteCrewEmployeeProfilePhoto\(saved\.id\)/.test(employeeModal),
  'manager can remove an existing profile photo')
assert(/accept="image\/jpeg,image\/png,image\/webp"/.test(employeeModal),
  'photo picker advertises only supported browser image types')
assert(/employee\.profilePhotoUrl/.test(employeeRoster),
  'employee roster shows the saved profile photo')
assert(/hasProfilePhoto:[\s\S]*profilePhotoUrl:[\s\S]*if \(canViewPrivate\)/.test(crew),
  'photo metadata remains public-safe while HR fields stay private')

section('Course setting and board rendering')
assert(/displayBoardShowProfilePhotos: Boolean\(course\?\.displayBoardShowProfilePhotos\)/.test(settings),
  'course setting initializes from persisted data')
assert(/Show Employee Profile Photos/.test(settings),
  'Settings exposes a clear Display Board photo toggle')
assert(/displayBoardShowProfilePhotos: row\.display_board_show_profile_photos === 1/.test(courses),
  'course API serializes the setting as a boolean')
assert(/showProfilePhotos: displayBoardShowsProfilePhotos/.test(board),
  'operator cards carry the effective board setting')
assert(/function EmployeeAvatar/.test(board) && /employeeAvatarImage/.test(board),
  'Display Board uses one reusable photo-with-initials fallback')
assert(/op\.showProfilePhotos &&/.test(board),
  'public board leaves its prior name-only layout unchanged while disabled')
assert(/showProfilePhotos && \(/.test(board),
  'legacy task-card crew photos are also gated by the setting')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
