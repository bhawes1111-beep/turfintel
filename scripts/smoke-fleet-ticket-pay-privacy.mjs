import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const fleet = read('src/pages/Equipment/tabs/EquipmentList.jsx')
const issues = read('src/pages/Equipment/tabs/EquipmentIssuesReview.jsx')
const crewApi = read('worker/api/crew.js')
const employeeForm = read('src/pages/Employees/components/EmployeeFormModal.jsx')
const roster = read('src/pages/Employees/tabs/EmployeeRoster.jsx')
const overview = read('src/pages/Employees/tabs/EmployeesOverview.jsx')
const payroll = read('src/pages/Employees/tabs/EmployeePayroll.jsx')
const payrollMath = read('src/utils/crew/payrollMath.js')
const report = read('src/utils/reports/reportBuilder.js')

assert.match(fleet, /HOC \{eq\.heightOfCut\} in/)
assert.match(issues, /const ticketPartOptions = useMemo/)
assert.match(issues, /normalizePartLookup\(name\) === equipmentName/)
assert.match(issues, /\{ticketPartOptions\.map\(part =>/)

assert.match(crewApi, /hidePayRate\s+= row\.hide_pay_rate === 1/)
assert.match(crewApi, /hidePayRate:\s+'hide_pay_rate'/)
assert.match(employeeForm, /Hide pay rate throughout the app/)
assert.match(roster, /employee\?\.hidePayRate/)
assert.match(overview, /!e\.hidePayRate/)
assert.match(payrollMath, /hidePayRate: Boolean\(employee\?\.hidePayRate\)/)
assert.match(payroll, /if \(row\.hidePayRate\) return 'Pay rate hidden'/)
assert.match(issues, /if \(employee\?\.hidePayRate\) return 'Hidden'/)
assert.match(report, /emp\?\.hidePayRate\s*\? 'Hidden'/)

console.log('fleet quick view, machine parts, and pay privacy smoke: ok')
