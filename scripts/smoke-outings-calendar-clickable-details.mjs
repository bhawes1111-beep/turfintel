import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const panel = readFileSync(resolve(root, 'src/pages/Operations/OutingsCalendarPanel.jsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/pages/Operations/OutingsCalendarPanel.module.css'), 'utf8')

const checks = [
  {
    name: 'outing calendar entries open details instead of editing immediately',
    pass: /function openDetails\(event\)/.test(panel) &&
      /onClick=\{\(\) => openDetails\(event\)\}/.test(panel) &&
      !/className=\{styles\.calendarOutingTitle\}[\s\S]{0,180}onClick=\{\(\) => startEdit\(event\)\}/.test(panel),
  },
  {
    name: 'detail popup renders outing information',
    pass: /detailEvent && \(/.test(panel) &&
      /role="dialog"/.test(panel) &&
      /formatTimeRange\(detailEvent\)/.test(panel) &&
      /detailEvent\.location \|\| 'Not set'/.test(panel),
  },
  {
    name: 'detail popup keeps edit and delete actions available',
    pass: /onClick=\{\(\) => startEdit\(detailEvent\)\}/.test(panel) &&
      /onClick=\{\(\) => handleDelete\(detailEvent\)\}/.test(panel),
  },
  {
    name: 'edit and empty dates open the outing editor window',
    pass: /const \[editorOpen, setEditorOpen\] = useState\(false\)/.test(panel) &&
      /function startEdit\(event\)[\s\S]*?setEditorOpen\(true\)/.test(panel) &&
      /function startNewForDate\(iso\)[\s\S]*?setEditorOpen\(true\)/.test(panel) &&
      /editorOpen && \(/.test(panel),
  },
  {
    name: 'empty outing dates are clickable for adding',
    pass: /data-addable=\{cell\.iso && dayOutings\.length === 0 \? 'true' : undefined\}/.test(panel) &&
      /onClick=\{cell\.iso && dayOutings\.length === 0 \? \(\) => startNewForDate\(cell\.iso\) : undefined\}/.test(panel),
  },
  {
    name: 'detail popup styles exist',
    pass: /\.detailOverlay/.test(css) &&
      /\.detailModal/.test(css) &&
      /\.detailGrid/.test(css) &&
      /\.detailActions/.test(css) &&
      /\.editorModal/.test(css),
  },
]

const failed = checks.filter(check => !check.pass)
if (failed.length) {
  console.error('Outings calendar clickable details smoke failed:')
  for (const check of failed) console.error(`- ${check.name}`)
  process.exit(1)
}

console.log(`Outings calendar clickable details smoke passed (${checks.length} checks).`)
