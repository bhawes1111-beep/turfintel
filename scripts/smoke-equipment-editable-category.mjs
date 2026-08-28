import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const equipmentList = readFileSync(resolve(root, 'src/pages/Equipment/tabs/EquipmentList.jsx'), 'utf8')

const checks = [
  {
    name: 'equipment form category is an editable input',
    pass: /<input[\s\S]*?list="equipment-category-options"[\s\S]*?placeholder="Type category\.\.\."/m.test(equipmentList),
  },
  {
    name: 'equipment category suggestions come from defaults and fleet records',
    pass: /function buildCategoryOptions\(equipment\)/.test(equipmentList) &&
      /CATEGORIES\.forEach\(add\)/.test(equipmentList) &&
      /equipment\.forEach\(unit => add\(unit\.category\)\)/.test(equipmentList),
  },
  {
    name: 'fleet category filters use dynamic category options',
    pass: /const categoryFilters = useMemo\(\(\) => \['All', \.\.\.categoryOptions\]/.test(equipmentList) &&
      /categoryFilters\.map\(c =>/.test(equipmentList),
  },
  {
    name: 'equipment save trims and requires category text',
    pass: /category: form\.category\.trim\(\)/.test(equipmentList) &&
      /!equipmentForm\.category\.trim\(\)/.test(equipmentList),
  },
  {
    name: 'equipment form captures sprayer tank capacity',
    pass: /tankCapacityGal: ''/.test(equipmentList) &&
      /tankCapacityGal: numberOrNull\(form\.tankCapacityGal\)/.test(equipmentList) &&
      /<Field label="Tank Capacity \(gal\)">/.test(equipmentList),
  },
]

const failed = checks.filter(check => !check.pass)
if (failed.length) {
  console.error('Equipment editable category smoke failed:')
  for (const check of failed) console.error(`- ${check.name}`)
  process.exit(1)
}

console.log(`Equipment editable category smoke passed (${checks.length} checks).`)
