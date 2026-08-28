import fs from 'node:fs'

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${message}`)
  }
}

const form = read('src/pages/Employees/components/EmployeeFormModal.jsx')
const roster = read('src/pages/Employees/tabs/EmployeeRoster.jsx')
const overview = read('src/pages/Employees/tabs/EmployeesOverview.jsx')
const api = read('worker/api/crew.js')
const migration = read('worker/migrations/0071_crew_employee_salary_pay.sql')
const exclusionMigration = read('worker/migrations/0072_crew_employee_payroll_exclusion.sql')
const report = read('src/utils/reports/reportBuilder.js')
const payrollMath = read('src/utils/crew/payrollMath.js')

assert(form.includes('PAY_TYPE_OPTS'), 'employee form offers pay type options')
assert(form.includes("value: 'salary'"), 'employee form includes salary pay type')
assert(form.includes('salaryAmount'), 'employee form saves annual salary amount')
assert(form.includes("payType === 'salary'"), 'employee form switches salary behavior')
assert(form.includes('excludeFromPayroll'), 'employee form saves payroll exclusion flag')

assert(roster.includes('formatPayLabel'), 'employee roster formats private pay labels')
assert(roster.includes('/yr'), 'employee roster displays salary as yearly pay')
assert(roster.includes('payrollExcludedBadge'), 'employee roster shows payroll exclusion badge')
assert(overview.includes('salaryEmployees'), 'employee overview counts salary employees')

assert(api.includes('payType') && api.includes('salaryAmount'), 'crew API serializes salary pay fields')
assert(api.includes('pay_type') && api.includes('salary_amount'), 'crew API writes salary pay columns')
assert(api.includes('excludeFromPayroll') && api.includes('exclude_from_payroll'), 'crew API serializes payroll exclusion flag')
assert(migration.includes('ADD COLUMN pay_type') && migration.includes('ADD COLUMN salary_amount'), 'migration adds salary pay columns')
assert(exclusionMigration.includes('ADD COLUMN exclude_from_payroll'), 'migration adds payroll exclusion column')

assert(!report.includes("emp?.payType === 'salary'"), 'owner payroll report does not render salary employees')
assert(report.includes('buildPayrollBreakdown'), 'owner payroll report uses the shared eligibility calculation')
assert(payrollMath.includes('employee?.excludeFromPayroll'), 'employee payroll tab skips payroll-excluded employees')
assert(payrollMath.includes('if (isSalaryEmployee(employee)) continue'), 'employee payroll tab skips salary employees')

if (process.exitCode) process.exit(process.exitCode)
console.log('Employee salary pay smoke passed.')
