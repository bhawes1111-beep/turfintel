import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src')
const extensions = new Set(['.js', '.jsx'])
const overlayClasses = [
  'backdrop',
  'modalOverlay',
  'detailOverlay',
  'ocModalOverlay',
  'deleteConfirmBackdrop',
  'rpOverlay',
  'irModalOverlay',
  'ticketBackdrop',
  'obModalBackdrop',
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!extensions.has(path.extname(entry.name))) return []
    return [full]
  })
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

const failures = []

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8')
  const normalized = file.replace(/\\/g, '/')
  for (const className of overlayClasses) {
    const classPattern = `styles\\.${className}`
    const clickAfterClass = new RegExp(`<div[^>]*className=\\{${classPattern}\\}[^>]*on(?:Click|MouseDown)=`, 'g')
    const clickBeforeClass = new RegExp(`<div[^>]*on(?:Click|MouseDown)=[^>]*className=\\{${classPattern}\\}`, 'g')
    for (const pattern of [clickAfterClass, clickBeforeClass]) {
      for (const match of source.matchAll(pattern)) {
        failures.push(`${normalized}:${lineNumber(source, match.index)} ${className} backdrop has a click handler`)
      }
    }
  }

  const currentTargetPattern = /e\.target\s*===\s*e\.currentTarget|target\s*===\s*currentTarget/g
  for (const match of source.matchAll(currentTargetPattern)) {
    failures.push(`${normalized}:${lineNumber(source, match.index)} background-click dismissal pattern remains`)
  }
}

if (failures.length) {
  console.error('Backdrop dismissal guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('No modal backdrops close on outside click.')
