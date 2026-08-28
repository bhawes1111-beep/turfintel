import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const checks = [
  {
    file: 'worker/migrations/0058_equipment_issues.sql',
    patterns: ['CREATE TABLE IF NOT EXISTS equipment_issues', 'pending_review', 'approved_at'],
  },
  {
    file: 'worker/api/equipmentIssues.js',
    patterns: ['listEquipmentBoardState', 'publicSubmission', "status = 'approved'", 'equipment_issues'],
  },
  {
    file: 'worker/index.js',
    patterns: [
      '/api/display-board/equipment-board',
      '/api/display-board/equipment-issues',
      '/api/equipment-issues',
      'listEquipmentBoardState',
    ],
  },
  {
    file: 'worker/lib/mutationPermissions.js',
    patterns: ["'/api/equipment-issues'", 'canEditEquipment'],
  },
  {
    file: 'src/App.jsx',
    patterns: ['/equipment/board', '/equipment/report-issue', 'EquipmentMechanicBoard', 'EquipmentIssueReport'],
  },
  {
    file: 'src/pages/DisplayBoard/DisplayBoard.jsx',
    patterns: ['boardMobileActionRow', '/equipment/board', '/equipment/report-issue'],
  },
  {
    file: 'src/pages/Equipment/Equipment.jsx',
    patterns: ["'Issues'", 'EquipmentIssuesReview'],
  },
  {
    file: 'src/pages/Equipment/EquipmentMechanicBoard.jsx',
    patterns: ['fetchEquipmentBoardState', 'Approved Staff Issues', 'Service Needed', 'Out of Service'],
  },
  {
    file: 'src/pages/Equipment/EquipmentIssueReport.jsx',
    patterns: ['submitPublicEquipmentIssue', 'Submit for Review', 'Submitted for supervisor review'],
  },
  {
    file: 'src/pages/Equipment/tabs/EquipmentIssuesReview.jsx',
    patterns: [
      'pending_review',
      'Approve',
      'Mark Resolved',
      'deleteEquipmentIssue',
      'Add Service Needed',
      'createMaintenance',
      'Services Needed',
      'Resolved Services',
      'patchMaintenance',
      'deleteMaintenance',
      'completedDate',
    ],
  },
  {
    file: 'src/utils/equipment/equipmentStore.js',
    patterns: ['deleteMaintenance', "method:  'DELETE'"],
  },
  {
    file: 'worker/api/maintenance.js',
    patterns: ['deleteMaintenance', 'DELETE FROM maintenance_logs'],
  },
]

let failures = 0

for (const check of checks) {
  const body = read(check.file)
  for (const pattern of check.patterns) {
    if (!body.includes(pattern)) {
      console.error(`Missing "${pattern}" in ${check.file}`)
      failures += 1
    }
  }
}

const index = read('worker/index.js')
const publicSubmit = index.indexOf('/api/display-board/equipment-issues')
const mutationGate = index.indexOf('if (isMutation(method))')
if (publicSubmit === -1 || mutationGate === -1 || publicSubmit > mutationGate) {
  console.error('Public equipment issue submit route must stay before the mutation auth gate.')
  failures += 1
}

const reportForm = read('src/pages/Equipment/EquipmentIssueReport.jsx')
for (const removedLabel of ['Issue type', 'Priority', 'Location']) {
  if (reportForm.includes(`<span>${removedLabel}</span>`)) {
    console.error(`Employee issue report should not show ${removedLabel}.`)
    failures += 1
  }
}

if (failures > 0) process.exit(1)
console.log('equipment mechanic board smoke passed')
