import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const jsxPath = path.join(root, 'src/pages/Employees/tabs/AnnualScheduleCalendar.jsx')
const cssPath = path.join(root, 'src/pages/Employees/tabs/AnnualScheduleCalendar.module.css')

const jsx = fs.readFileSync(jsxPath, 'utf8')
const css = fs.readFileSync(cssPath, 'utf8')

const checks = [
  {
    name: 'calendar stores multi-day selection',
    ok: jsx.includes('multiSelectMode') && jsx.includes('selectedDates'),
  },
  {
    name: 'calendar toggles selected dates from day tiles',
    ok: jsx.includes('function handleSelectDate(date)') &&
      jsx.includes('prev.includes(date)') &&
      jsx.includes('return [...prev, date].sort()'),
  },
  {
    name: 'apply target falls back to focused day',
    ok: jsx.includes('selectedDates.length > 0 ? [...selectedDates].sort() : [selectedDate]'),
  },
  {
    name: 'template apply loops across all target dates',
    ok: jsx.includes('for (const effectiveDate of dates)') &&
      jsx.includes('applyShiftTemplate(templateId, { effectiveDate, replace: replaceConfirmed })'),
  },
  {
    name: 'template picker receives multi-date target metadata',
    ok: jsx.includes('targetDateLabel={applyTargetLabel}') &&
      jsx.includes('targetDateCount={applyTargetDates.length}') &&
      jsx.includes('destHasOverrides={targetDatesHaveOverrides}'),
  },
  {
    name: 'multi-select controls and selected tile styling exist',
    ok: css.includes('.batchToolbar') &&
      css.includes('.batchTarget') &&
      css.includes('.dayTile[data-selected-multi="true"]') &&
      css.includes('.actionBtn[data-active="true"]'),
  },
]

const failed = checks.filter(check => !check.ok)

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
}

if (failed.length > 0) {
  process.exitCode = 1
}
