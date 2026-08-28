import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const css = readFileSync(resolve(root, 'src/pages/Crew/tabs/DailyAssignmentBoard.module.css'), 'utf8')

function blockFor(selector) {
  const match = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\}`))
  return match?.[1] ?? ''
}

const taskSelect = blockFor('.taskSelect')
const equipBtn = blockFor('.equipBtn')

const checks = [
  {
    name: 'task select has stable control size',
    pass: /width:\s*100%;/.test(taskSelect) &&
      /min-width:\s*180px;/.test(taskSelect) &&
      /min-height:\s*31px;/.test(taskSelect),
  },
  {
    name: 'equipment button matches task select footprint',
    pass: /width:\s*100%;/.test(equipBtn) &&
      /min-width:\s*180px;/.test(equipBtn) &&
      /min-height:\s*31px;/.test(equipBtn),
  },
]

const failed = checks.filter(check => !check.pass)
if (failed.length) {
  console.error('DAB equipment button size smoke failed:')
  for (const check of failed) console.error(`- ${check.name}`)
  process.exit(1)
}

console.log(`DAB equipment button size smoke passed (${checks.length} checks).`)
