import fs from 'node:fs'

const src = fs.readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const css = fs.readFileSync('src/pages/Spray/Spray.module.css', 'utf8')
const worker = fs.readFileSync('worker/api/sprays.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL - ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok - ${message}`)
}

assert(
  /skipInventoryDeduction:\s*false/.test(src),
  'new spray drafts default to inventory deductions on',
)

assert(
  /Do not deduct tank mix from inventory/.test(src),
  'review step renders a clickable no-deduction option',
)

assert(
  /aria-pressed=\{Boolean\(draft\.skipInventoryDeduction\)\}/.test(src)
  && /onClick=\{\(\) => onToggleInventoryDeduction\?\.\(!draft\.skipInventoryDeduction\)\}/.test(src),
  'no-deduction option is a button toggle instead of a hidden checkbox',
)

assert(
  /onToggleInventoryDeduction=\{value => patchDraft\(\{ skipInventoryDeduction: value \}\)\}/.test(src),
  'no-deduction option updates the spray draft',
)

assert(
  /deductInventory:\s*!draft\.skipInventoryDeduction/.test(src)
  && /syncSprayInventoryForStatus/.test(worker)
  && /isCompletedStatus\(status\) && deductInventory/.test(worker),
  'no-deduction preference is persisted and enforced by the status-driven worker sync',
)

assert(
  /!draft\.skipInventoryDeduction && summary\.anyInsufficient/.test(src),
  'insufficient-inventory confirmation is bypassed when no deduction is selected',
)

assert(
  /\.naNoDeductBox/.test(css)
  && /\.naNoDeductCheck/.test(css)
  && !/\.naNoDeductBox input/.test(css),
  'no-deduction option is styled',
)
