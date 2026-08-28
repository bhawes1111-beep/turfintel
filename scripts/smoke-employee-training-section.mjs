import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const employees = readFileSync(resolve(root, 'src/pages/Employees/Employees.jsx'), 'utf8')
const trainingTab = readFileSync(resolve(root, 'src/pages/Employees/tabs/EmployeeTraining.jsx'), 'utf8')
const store = readFileSync(resolve(root, 'src/utils/crew/employeeTrainingStore.js'), 'utf8')
const worker = readFileSync(resolve(root, 'worker/index.js'), 'utf8')
const permissions = readFileSync(resolve(root, 'worker/lib/mutationPermissions.js'), 'utf8')
const api = readFileSync(resolve(root, 'worker/api/employeeTraining.js'), 'utf8')
const migration = readFileSync(resolve(root, 'worker/migrations/0057_employee_training.sql'), 'utf8')

const checks = [
  {
    name: 'Employees page exposes Training tab',
    pass: /import EmployeeTraining/.test(employees) &&
      /'Training'/.test(employees) &&
      /activeTab === 'Training'[\s\S]*<EmployeeTraining/.test(employees),
  },
  {
    name: 'Training tab supports add edit delete records',
    pass: /createEmployeeTraining/.test(trainingTab) &&
      /patchEmployeeTraining/.test(trainingTab) &&
      /deleteEmployeeTraining/.test(trainingTab) &&
      /Add Training/.test(trainingTab) &&
      /Edit Training/.test(trainingTab),
  },
  {
    name: 'Training store uses cloud API and course scope',
    pass: /const API = '\/api\/employee-training'/.test(store) &&
      /withCourseScope\(API\)/.test(store) &&
      /getSelectedCourseId/.test(store),
  },
  {
    name: 'Worker routes training API',
    pass: /employeeTraining\.js/.test(worker) &&
      /pathname === '\/api\/employee-training'/.test(worker) &&
      /trainingMatch/.test(worker),
  },
  {
    name: 'Training mutations use employee management permission',
    pass: /\['\/api\/employee-training',\s*'canEditAssignments'\]/.test(permissions),
  },
  {
    name: 'Training API and migration define records table',
    pass: /CREATE TABLE IF NOT EXISTS employee_training_records/.test(migration) &&
      /listEmployeeTraining/.test(api) &&
      /createEmployeeTraining/.test(api) &&
      /updateEmployeeTraining/.test(api) &&
      /deleteEmployeeTraining/.test(api),
  },
]

const failed = checks.filter(check => !check.pass)
if (failed.length) {
  console.error('Employee training section smoke failed:')
  for (const check of failed) console.error(`- ${check.name}`)
  process.exit(1)
}

console.log(`Employee training section smoke passed (${checks.length} checks).`)
